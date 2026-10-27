import { normalizeHistory } from '../domain/normalize'
import type { HistoryResponse } from '../domain/types'
import { ApiError, request } from './api'

type Getter = (path: string, init?: RequestInit) => Promise<unknown>
type Series = 'all' | 'metrics' | 'ping'
/**
 * Lower starts first: 0 what a visible card or page shows now, 1 a visible card's score history,
 * 2 prefetch of the strip's last hour, 3 prefetch of the day for scores.
 */
export type Priority = 0 | 1 | 2 | 3
interface Job {
  key: string
  priority: Priority
  order: number
  run: () => void
}
const keyOf = (id: number, hours: number, series: Series) => `${id}/${hours}/${series}`
// The Hub answers 503 at once when its four history slots are taken, by any visitor.
const RETRIES = 3
const retryDelay = (attempt: number) => 1500 * 2 ** attempt
export class HistoryRepository {
  private cache = new Map<string, { time: number; value: HistoryResponse }>()
  private pending = new Map<string, Promise<HistoryResponse>>()
  private queue: Job[] = []
  private queued = 0
  private scheduled = false
  private active = 0
  private generation = 0
  private controllers = new Set<AbortController>()
  constructor(
    private fetcher: Getter = request,
    private now: () => number = Date.now,
    private capacity = 64,
  ) {}
  get size() {
    return this.cache.size
  }
  clear() {
    this.generation++
    this.cache.clear()
    this.pending.clear()
    for (const controller of this.controllers) controller.abort()
  }
  get(
    id: number,
    hours: number,
    series: Series = 'all',
    force = false,
    priority: Priority = 0,
  ): Promise<HistoryResponse> {
    const key = keyOf(id, hours, series),
      cached = this.cache.get(key)
    if (!force && cached && this.now() - cached.time < 60000) return Promise.resolve(cached.value)
    const pending = this.pending.get(key)
    if (pending) {
      this.prioritize(id, hours, series, priority)
      return pending
    }
    const generation = this.generation
    const promise = new Promise<HistoryResponse>((resolve, reject) => {
      const job = async (attempt: number) => {
        if (generation !== this.generation) {
          reject(new Error('历史查询已取消'))
          return
        }
        this.active++
        const controller = new AbortController()
        this.controllers.add(controller)
        try {
          const result = await this.fetcher(
            `/api/nodes/${id}/metrics?hours=${hours}&points=120${series === 'all' ? '' : `&series=${series}`}`,
            { signal: controller.signal },
          )
          if (generation !== this.generation) throw new Error('历史查询已取消')
          const value = normalizeHistory(result)
          this.cache.delete(key)
          this.cache.set(key, { time: this.now(), value })
          while (this.cache.size > this.capacity) this.cache.delete(this.cache.keys().next().value!)
          resolve(value)
        } catch (e) {
          // A busy Hub is asked again shortly, keeping the request's place in line.
          if (e instanceof ApiError && e.status === 503 && attempt < RETRIES)
            setTimeout(() => this.enqueue(key, priority, () => void job(attempt + 1)), retryDelay(attempt))
          else reject(e)
        } finally {
          this.controllers.delete(controller)
          this.active--
          this.pump()
        }
      }
      this.enqueue(key, priority, () => void job(0))
    }).finally(() => {
      if (this.pending.get(key) === promise) this.pending.delete(key)
    })
    this.pending.set(key, promise)
    return promise
  }
  /** Moves a queued request up, for a card that has come into view; never down. */
  prioritize(id: number, hours: number, series: Series = 'all', priority: Priority = 0) {
    const job = this.queue.find((j) => j.key === keyOf(id, hours, series))
    if (job && priority < job.priority) {
      job.priority = priority
      job.order = this.queued++
    }
  }
  // Requests queued in one go (the start-up prefetch, a page of cards) start together on the next
  // microtask, so priority decides the order rather than which was asked for first.
  private enqueue(key: string, priority: Priority, run: () => void) {
    this.queue.push({ key, priority, order: this.queued++, run })
    if (this.scheduled) return
    this.scheduled = true
    queueMicrotask(() => {
      this.scheduled = false
      this.pump()
    })
  }
  private pump() {
    while (this.active < 3 && this.queue.length) {
      const next = this.queue.reduce((a, b) =>
        a.priority < b.priority || (a.priority === b.priority && a.order < b.order) ? a : b,
      )
      this.queue.splice(this.queue.indexOf(next), 1)
      next.run()
    }
  }
}
