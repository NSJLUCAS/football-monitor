// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { gzipSync } from 'node:zlib'
import { RealtimeController, decodeFrame, type SocketLike } from '../src/services/realtime'
import { ApiError } from '../src/services/api'

class FakeSocket implements SocketLike {
  readyState = 1
  onmessage: ((event: { data: unknown }) => void) | null = null
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null
  close = vi.fn(() => {
    this.readyState = 3
  })
  send(data: unknown) {
    this.onmessage?.({ data })
  }
}
const frame = (name: string) => JSON.stringify({ nodes: [{ id: 1, name }] })
const tick = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve()
}
afterEach(() => vi.useRealTimers())
describe('realtime lifecycle', () => {
  it('never lets an older slow WS decode replace a newer HTTP snapshot', async () => {
    vi.useFakeTimers()
    const socket = new FakeSocket(),
      seen: string[] = []
    let http: (value: unknown) => void = () => {},
      decoded: (value: string) => void = () => {}
    const rt = new RealtimeController({
      url: 'ws://localhost',
      socket: () => socket,
      fetchNodes: () =>
        new Promise((r) => {
          http = r
        }),
      decode: () =>
        new Promise((r) => {
          decoded = r
        }),
      onNodes: (n) => seen.push(n[0]!.name),
    })
    rt.start()
    socket.send('slow')
    await tick()
    http({ nodes: [{ id: 1, name: 'new' }] })
    await tick()
    decoded(frame('old'))
    await tick()
    expect(seen).toEqual(['new'])
    rt.stop()
  })
  it('caps socket reconnection attempts while retaining HTTP fallback', async () => {
    vi.useFakeTimers()
    const socket = vi.fn(() => {
      throw new Error('full')
    })
    const rt = new RealtimeController({
      url: 'ws://localhost',
      socket,
      fetchNodes: async () => ({ nodes: [] }),
      onNodes: vi.fn(),
    })
    rt.start()
    await vi.advanceTimersByTimeAsync(600000)
    expect(socket).toHaveBeenCalledTimes(9)
    rt.stop()
    expect(vi.getTimerCount()).toBe(0)
  })
  it('discards a gzip decode that finishes after the connection was replaced', async () => {
    vi.useFakeTimers()
    const sockets: FakeSocket[] = [],
      seen: string[] = []
    let release: (value: string) => void = () => {}
    const decode = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<string>((r) => {
            release = r
          }),
      )
      .mockResolvedValue(frame('fresh'))
    const rt = new RealtimeController({
      url: 'ws://localhost',
      socket: () => {
        const s = new FakeSocket()
        sockets.push(s)
        return s
      },
      fetchNodes: () => new Promise(() => {}),
      onNodes: (n) => seen.push(n[0]!.name),
      decode,
    })
    rt.start()
    sockets[0]!.send('old')
    await tick()
    rt.pause()
    rt.start()
    sockets[1]!.send('new')
    await tick()
    release(frame('stale'))
    await tick()
    expect(seen).toEqual(['fresh'])
    rt.stop()
  })
  it('decodes real gzip bytes and old text frames', async () => {
    expect(await decodeFrame(new Blob([gzipSync(frame('gzip'))]))).toBe(frame('gzip'))
    expect(await decodeFrame(frame('text'))).toBe(frame('text'))
  })
  it('serializes async frames and ignores late decode after pause', async () => {
    vi.useFakeTimers()
    const socket = new FakeSocket(),
      seen: string[] = []
    let release: (value: string) => void = () => {}
    const decode = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<string>((r) => {
            release = r
          }),
      )
      .mockResolvedValue(frame('second'))
    const rt = new RealtimeController({
      url: 'ws://localhost/api/ws',
      socket: () => socket,
      fetchNodes: () => new Promise(() => {}),
      onNodes: (n) => seen.push(n[0]!.name),
      decode,
    })
    rt.start()
    socket.send('a')
    socket.send('b')
    await tick()
    expect(decode).toHaveBeenCalledTimes(1)
    release(frame('first'))
    await tick()
    expect(seen).toEqual(['first', 'second'])
    rt.stop()
    expect(socket.close).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })
  it('does not let pre-pause HTTP or decode mutate resumed state', async () => {
    vi.useFakeTimers()
    const sockets: FakeSocket[] = [],
      seen: string[] = []
    let release: (value: unknown) => void = () => {}
    const fetchNodes = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((r) => {
            release = r
          }),
      )
      .mockResolvedValue({ nodes: [{ id: 1, name: 'new' }] })
    const rt = new RealtimeController({
      url: 'ws://localhost',
      socket: () => {
        const s = new FakeSocket()
        sockets.push(s)
        return s
      },
      fetchNodes,
      onNodes: (n) => seen.push(n[0]!.name),
    })
    rt.start()
    rt.pause()
    rt.start()
    await tick()
    release({ nodes: [{ id: 1, name: 'stale' }] })
    await tick()
    expect(seen).toEqual(['new'])
    expect(sockets).toHaveLength(2)
    rt.stop()
    expect(vi.getTimerCount()).toBe(0)
  })
  it('falls back to polling after failure, with no overlapping HTTP requests', async () => {
    vi.useFakeTimers()
    const socket = new FakeSocket(),
      fetchNodes = vi.fn().mockResolvedValue({ nodes: [] })
    const rt = new RealtimeController({
      url: 'ws://localhost',
      socket: () => socket,
      fetchNodes,
      onNodes: vi.fn(),
    })
    rt.start()
    await tick()
    socket.onclose?.()
    await tick()
    await vi.advanceTimersByTimeAsync(5000)
    expect(fetchNodes.mock.calls.length).toBeGreaterThanOrEqual(2)
    socket.send(frame('live'))
    await tick()
    rt.stop()
    expect(vi.getTimerCount()).toBe(0)
  })
  it('invalid frames do not reset watchdog and auth loss stops all updates', async () => {
    vi.useFakeTimers()
    const socket = new FakeSocket(),
      auth = vi.fn(),
      fetchNodes = vi.fn().mockRejectedValue(new ApiError(401, 'closed'))
    const rt = new RealtimeController({
      url: 'ws://localhost',
      socket: () => socket,
      fetchNodes,
      onNodes: vi.fn(),
      onUnauthorized: auth,
    })
    rt.start()
    await tick()
    expect(auth).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
    rt.stop()
  })
  it('replaces silent sockets even when malformed frames keep arriving', async () => {
    vi.useFakeTimers()
    const sockets: FakeSocket[] = []
    const rt = new RealtimeController({
      url: 'ws://localhost',
      socket: () => {
        const s = new FakeSocket()
        sockets.push(s)
        return s
      },
      fetchNodes: async () => ({ nodes: [] }),
      onNodes: vi.fn(),
    })
    rt.start()
    await tick()
    for (let i = 0; i < 3; i++) {
      sockets[0]!.send('bad')
      await vi.advanceTimersByTimeAsync(3000)
    }
    await vi.advanceTimersByTimeAsync(1001)
    expect(sockets[0]!.close).toHaveBeenCalled()
    rt.stop()
    expect(vi.getTimerCount()).toBe(0)
  })
})
