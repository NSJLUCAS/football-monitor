import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { useMonitorStore } from '../src/stores/monitor'

class IdleSocket {
  readyState = 0
  onmessage = null
  onclose = null
  onerror = null
  close() {}
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
// Each request waits until the test answers it, so the test sees what was sent before any reply.
function hub() {
  const calls: string[] = [],
    replies = new Map<string, (r: Response) => void>()
  vi.stubGlobal(
    'fetch',
    vi.fn((path: string) => {
      calls.push(path)
      return new Promise<Response>((resolve) => replies.set(path, resolve))
    }),
  )
  return { calls, reply: (path: string, response: Response) => replies.get(path)!(response) }
}

describe('monitor store start-up', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.stubGlobal('WebSocket', IdleSocket)
  })
  afterEach(() => vi.unstubAllGlobals())

  it('asks for nodes together with identity and settings, in one round trip', async () => {
    const { calls, reply } = hub()
    const store = useMonitorStore()
    void store.bootstrap()
    expect(calls).toEqual(['/api/me', '/api/themes/football-monitor/config', '/api/nodes'])
    reply('/api/nodes', json({ nodes: [{ id: 1, name: 'HK', online: false }] }))
    reply('/api/me', json({ authed: false, public_page: true }))
    reply('/api/themes/football-monitor/config', json({}))
    await flushPromises()
    expect(store.nodes.map((n) => n.name)).toEqual(['HK'])
    expect(store.loading).toBe(false)
    // Identity was read moments ago; the first snapshot does not ask again.
    expect(calls.filter((c) => c === '/api/me')).toHaveLength(1)
    store.stop()
  })

  it('discards the early nodes reply when the site is closed', async () => {
    const { reply } = hub()
    const store = useMonitorStore()
    void store.bootstrap()
    reply('/api/nodes', json({}, 401))
    reply('/api/me', json({ authed: false, public_page: false }))
    reply('/api/themes/football-monitor/config', json({}))
    await flushPromises()
    expect(store.nodes).toEqual([])
    expect(store.closed).toBe(true)
    expect(store.error).toBe('登录已失效或公开页面已关闭，请重新登录后重试')
    store.stop()
  })
})
