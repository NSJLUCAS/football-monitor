import { normalizeHistory } from '../domain/normalize'
import type { HistoryResponse } from '../domain/types'
import { request } from './api'

type Getter = (path: string, init?: RequestInit) => Promise<unknown>
type Series = 'all' | 'metrics' | 'ping'
export class HistoryRepository {
  private cache = new Map<string, { time: number; value: HistoryResponse }>()
  private pending = new Map<string, Promise<HistoryResponse>>()
  private queue: (() => void)[] = []
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
  get(id: number, hours: number, series: Series = 'all', force = false): Promise<HistoryResponse> {
    const key = `${id}/${hours}/${series}`,
      cached = this.cache.get(key)
    if (!force && cached && this.now() - cached.time < 60000) return Promise.resolve(cached.value)
    const pending = this.pending.get(key)
    if (pending) return pending
    const generation = this.generation
    const promise = new Promise<HistoryResponse>((resolve, reject) => {
      const job = async () => {
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
          reject(e)
        } finally {
          this.controllers.delete(controller)
          this.active--
          this.pump()
        }
      }
      this.queue.push(() => void job())
      this.pump()
    }).finally(() => {
      if (this.pending.get(key) === promise) this.pending.delete(key)
    })
    this.pending.set(key, promise)
    return promise
  }
  private pump() {
    while (this.active < 3 && this.queue.length) this.queue.shift()!()
  }
}
