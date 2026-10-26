import { normalizeNodes } from '../domain/normalize'
import type { MonitorNode } from '../domain/types'
import { ApiError, request } from './api'

export interface SocketLike {
  readonly readyState: number
  onmessage: ((event: { data: unknown }) => void) | null
  onclose: (() => void) | null
  onerror: (() => void) | null
  close(): void
}
export type ConnectionState = 'connecting' | 'live' | 'polling' | 'paused' | 'closed'
export async function decodeFrame(data: unknown): Promise<string> {
  if (typeof data === 'string') return data
  if (!(data instanceof Blob) || typeof DecompressionStream !== 'function')
    throw new Error('不支持的实时消息')
  return new Response(data.stream().pipeThrough(new DecompressionStream('gzip'))).text()
}
interface Options {
  url: string
  onNodes: (nodes: MonitorNode[]) => void
  onStatus?: (state: ConnectionState, error?: string) => void
  onUnauthorized?: () => void
  socket?: (url: string) => SocketLike
  fetchNodes?: (signal: AbortSignal) => Promise<unknown>
  beforeRefresh?: (signal: AbortSignal) => Promise<boolean>
  decode?: (data: unknown) => Promise<string>
}
export class RealtimeController {
  private epoch = 0
  private revision = 0
  private arrival = 0
  private published = 0
  private running = false
  private socket: SocketLike | null = null
  private poll?: ReturnType<typeof setInterval>
  private retry?: ReturnType<typeof setTimeout>
  private watchdog?: ReturnType<typeof setTimeout>
  private pending: AbortController | null = null
  private attempts = 0
  constructor(private options: Options) {}
  start(): void {
    if (this.running) return
    this.running = true
    this.attempts = 0
    this.options.onStatus?.('connecting')
    void this.fetchOnce()
    this.connect()
  }
  pause(): void {
    this.running = false
    this.epoch++
    this.pending?.abort()
    this.pending = null
    this.disposeSocket()
    clearInterval(this.poll)
    clearTimeout(this.retry)
    clearTimeout(this.watchdog)
    this.poll = this.retry = this.watchdog = undefined
    this.options.onStatus?.('paused')
  }
  stop(): void {
    this.pause()
  }
  private disposeSocket() {
    if (!this.socket) return
    this.socket.onmessage = this.socket.onclose = this.socket.onerror = null
    this.socket.close()
    this.socket = null
  }
  private async fetchOnce() {
    if (!this.running || this.pending) return
    const epoch = this.epoch,
      revision = this.revision,
      controller = new AbortController()
    this.pending = controller
    try {
      if (this.options.beforeRefresh && !(await this.options.beforeRefresh(controller.signal))) return
      if (!this.running || epoch !== this.epoch || controller.signal.aborted) return
      const response = await (this.options.fetchNodes || ((signal) => request('/api/nodes', { signal })))(
        controller.signal,
      )
      const arrival = ++this.arrival
      if (this.running && epoch === this.epoch && revision === this.revision) {
        this.published = arrival
        this.options.onNodes(normalizeNodes(response))
      }
    } catch (e) {
      if (epoch !== this.epoch || controller.signal.aborted) return
      if (e instanceof ApiError && e.status === 401) {
        this.pause()
        this.options.onStatus?.('closed')
        this.options.onUnauthorized?.()
      } else this.options.onStatus?.('polling', e instanceof Error ? e.message : '数据暂不可用')
    } finally {
      if (this.pending === controller) this.pending = null
    }
  }
  private fallback(message = '实时连接中断，已切换 HTTP 轮询') {
    if (!this.running) return
    this.disposeSocket()
    this.epoch++
    this.pending?.abort()
    this.pending = null
    clearTimeout(this.watchdog)
    this.options.onStatus?.('polling', message)
    void this.fetchOnce()
    this.poll ??= setInterval(() => void this.fetchOnce(), 5000)
    if (!this.retry && this.attempts < 8) {
      const delay = Math.min(60000, 5000 * 2 ** Math.min(this.attempts, 4))
      this.attempts++
      this.retry = setTimeout(() => {
        this.retry = undefined
        this.connect()
      }, delay)
    }
  }
  private connect() {
    if (!this.running || this.socket) return
    const epoch = this.epoch
    let socket: SocketLike
    try {
      socket = (this.options.socket || ((url) => new WebSocket(url) as unknown as SocketLike))(
        this.options.url,
      )
    } catch {
      this.fallback('WebSocket 暂不可用，使用 HTTP 轮询')
      return
    }
    this.socket = socket
    const current = () => this.running && this.epoch === epoch && this.socket === socket
    const watch = () => {
      clearTimeout(this.watchdog)
      this.watchdog = setTimeout(() => {
        if (current()) this.fallback('实时数据超时，正在恢复连接')
      }, 10000)
    }
    watch()
    let chain = Promise.resolve()
    socket.onmessage = (event) => {
      const arrival = ++this.arrival
      chain = chain
        .then(async () => {
          if (!current()) return
          const nodes = normalizeNodes(JSON.parse(await (this.options.decode || decodeFrame)(event.data)))
          if (!current() || socket.readyState !== 1 || arrival < this.published) return
          this.published = arrival
          this.revision++
          watch()
          this.options.onNodes(nodes)
          this.options.onStatus?.('live')
          this.attempts = 0
          clearInterval(this.poll)
          this.poll = undefined
          clearTimeout(this.retry)
          this.retry = undefined
        })
        .catch(() => {
          /* Invalid frames do not reset the silence watchdog. */
        })
    }
    socket.onclose = () => {
      if (current()) this.fallback()
    }
    socket.onerror = () => {
      if (current()) this.fallback()
    }
  }
}
