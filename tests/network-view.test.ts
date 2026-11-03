import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import NetworkView from '../src/views/NetworkView.vue'
import { normalizeNodes } from '../src/domain/normalize'
import { ApiError } from '../src/services/api'
import { useMonitorStore } from '../src/stores/monitor'
import type { HistoryResponse } from '../src/domain/types'

const now = () => Math.floor(Date.now() / 1000)
// Two probes per node; latency of the first sets the order: 东京 B 146, 法兰克福 D 178, 香港 A 190.
const probes = (latency: number, loss: Record<string, number> = {}): HistoryResponse => ({
  metrics: [],
  ping: [
    { task_id: 7, ts: now() - 600, latency },
    { task_id: 8, ts: now() - 600, latency: latency + 10 },
  ],
  probes: { '7': '上海电信', '8': '广州移动' },
  loss,
  step: 720,
})
const LATENCY: Record<number, number> = { 1: 190, 2: 146, 4: 178 }
const fixtures = () =>
  normalizeNodes({
    nodes: [
      { id: 1, name: '香港 A', group: '亚洲节点', online: true },
      { id: 2, name: '东京 B', group: '亚洲节点', online: true },
      { id: 3, name: '新加坡 C', group: '亚洲节点', online: false },
      { id: 4, name: '法兰克福 D', group: '欧洲节点', online: true },
    ],
  })

async function mountNetwork(
  path = '/network',
  configure?: (store: ReturnType<typeof useMonitorStore>) => void,
) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/network', component: NetworkView },
      { path: '/node/:id', component: { template: '<div />' } },
    ],
  })
  await router.push(path)
  await router.isReady()
  const store = useMonitorStore()
  store.me = { authed: false, site_name: 'Monitor', public_page: true, github: false, history_days: 7 }
  store.nodes = fixtures()
  store.loading = false
  store.quality = { 1: probes(190), 2: probes(146), 4: probes(178) }
  // The store's own prefetch (priorities 2 and 3) stays pending so it never replaces the probes above.
  const get = vi
    .spyOn(store.history, 'get')
    .mockImplementation((id, _hours, _series, _force, priority = 0) =>
      priority ? new Promise(() => {}) : Promise.resolve(probes(LATENCY[id]! + 1000)),
    )
  const loadQuality = vi.spyOn(store, 'loadQuality').mockResolvedValue()
  configure?.(store)
  const wrapper = mount(NetworkView, { global: { plugins: [router] } })
  await flushPromises()
  return { wrapper, router, store, get, loadQuality }
}
// Requests the page makes itself, at the top priority.
const own = (get: { mock: { calls: unknown[][] } }) =>
  get.mock.calls.filter((c) => !c[4]).map((c) => c.slice(0, 5))
const names = (w: VueWrapper) => w.findAll('.network-row .nr-name b').map((b) => b.text())
const range = (w: VueWrapper, label: string) =>
  w.findAll('.ns-ranges button').find((b) => b.text() === label)!

beforeEach(() => setActivePinia(createPinia()))
enableAutoUnmount(afterEach)
afterEach(() => vi.restoreAllMocks())

describe('network quality page', () => {
  it("uses the home page's 24-hour probes without new requests", async () => {
    const { wrapper, get, loadQuality } = await mountNetwork()
    expect(own(get)).toEqual([])
    expect(loadQuality).not.toHaveBeenCalled()
    expect(names(wrapper)).toEqual(['香港 A', '东京 B', '法兰克福 D', '新加坡 C'])
    expect(wrapper.find('.network-row .nr-overall b').text()).toBe('195ms')
  })

  it('loads missing 24-hour probes through loadQuality', async () => {
    const { loadQuality } = await mountNetwork('/network', (store) => delete store.quality[4])
    expect(loadQuality).toHaveBeenCalledWith(4, false, 0)
    expect(loadQuality).toHaveBeenCalledTimes(1)
  })

  it('switches the window, fetches ping history and writes ?hours=', async () => {
    const { wrapper, router, get } = await mountNetwork()
    await range(wrapper, '6 小时').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query.hours).toBe('6')
    expect(own(get)).toEqual([
      [1, 6, 'ping', false, 0],
      [2, 6, 'ping', false, 0],
      [4, 6, 'ping', false, 0],
    ])
    expect(wrapper.find('.network-row .nr-overall b').text()).toBe('1195ms')
    expect(range(wrapper, '6 小时').attributes('aria-pressed')).toBe('true')
    await range(wrapper, '1 天').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query).toEqual({})
    expect(wrapper.find('.network-row .nr-overall b').text()).toBe('195ms')
  })

  it('drops a late answer from the previous window', async () => {
    let release!: (value: HistoryResponse) => void
    const { wrapper, get } = await mountNetwork()
    get.mockImplementation((id, hours) =>
      hours === 6 && id === 1
        ? new Promise((resolve) => (release = resolve))
        : Promise.resolve(probes(LATENCY[id]! + hours)),
    )
    await range(wrapper, '6 小时').trigger('click')
    await flushPromises()
    await range(wrapper, '7 天').trigger('click')
    await flushPromises()
    release(probes(5))
    await flushPromises()
    expect(wrapper.find('.network-row .nr-overall b').text()).toBe(`${190 + 168 + 5}ms`)
  })

  it('fills in once nodes arrive after mount', async () => {
    const { wrapper, store } = await mountNetwork('/network', (s) => {
      s.nodes = []
      s.loading = true
    })
    expect(wrapper.find('[aria-busy="true"]').exists()).toBe(true)
    expect(wrapper.find('.empty-state').exists()).toBe(false)
    store.nodes = fixtures()
    store.loading = false
    await flushPromises()
    expect(names(wrapper)).toHaveLength(4)
  })

  it('filters by group, search and the offline switch', async () => {
    const { wrapper, router } = await mountNetwork()
    await wrapper
      .findAll('.group-tabs button')
      .find((b) => b.text() === '欧洲节点')!
      .trigger('click')
    expect(names(wrapper)).toEqual(['法兰克福 D'])
    await router.replace('/network?q=东京')
    await flushPromises()
    await wrapper.findAll('.group-tabs button')[0]!.trigger('click')
    expect(names(wrapper)).toEqual(['东京 B'])
    await router.replace('/network?offline=0')
    await flushPromises()
    expect(names(wrapper)).toEqual(['香港 A', '东京 B', '法兰克福 D'])
    expect((wrapper.find('#network-offline').element as HTMLInputElement).checked).toBe(false)
    await wrapper.find('#network-offline').setValue(true)
    await flushPromises()
    expect(router.currentRoute.value.query).toEqual({})
    await wrapper.find('#network-offline').setValue(false)
    await flushPromises()
    expect(router.currentRoute.value.query).toEqual({ offline: '0' })
  })

  it('sorts by ?sort= and treats bad parameters as defaults', async () => {
    const sorted = await mountNetwork('/network?sort=latency')
    expect(names(sorted.wrapper)).toEqual(['东京 B', '法兰克福 D', '香港 A', '新加坡 C'])
    await sorted.wrapper.find('select#network-sort').setValue('hub')
    await flushPromises()
    expect(sorted.router.currentRoute.value.query).toEqual({})
    sorted.wrapper.unmount()
    const bad = await mountNetwork('/network?sort=bogus&hours=5')
    expect(names(bad.wrapper)).toEqual(['香港 A', '东京 B', '法兰克福 D', '新加坡 C'])
    expect(range(bad.wrapper, '1 天').attributes('aria-pressed')).toBe('true')
    expect(own(bad.get)).toEqual([])
  })

  it('counts online nodes, lines and lossy lines in the summary', async () => {
    const { wrapper, store } = await mountNetwork()
    expect(wrapper.find('.ns-online').text()).toContain('3/4')
    expect(wrapper.find('.ns-lines').text()).toContain('6')
    expect(wrapper.find('.ns-lossy').exists()).toBe(false)
    expect(wrapper.findAll('.network-summary .quality-bar i')).toHaveLength(24)
    store.quality = { ...store.quality, 2: probes(146, { '7': 5 }) }
    await flushPromises()
    expect(wrapper.find('.ns-lossy').text()).toBe('1 条丢包')
    expect(wrapper.find('.ns-lossy').attributes('title')).toContain('丢包 ≥3%')
  })

  it('shows 加载失败 on a failed node and keeps the others', async () => {
    const { wrapper, get, store } = await mountNetwork('/network', (s) => {
      delete s.quality[2]
      s.qualityErrors = { 2: '延迟数据不可用' }
    })
    const row = (name: string) =>
      wrapper.findAll('.network-row').find((r) => r.find('.nr-name b').text() === name)!
    expect(row('东京 B').find('.nr-trend').text()).toContain('加载失败')
    expect(row('香港 A').find('.nr-overall b').text()).toBe('195ms')
    const unauthorized = vi.spyOn(store, 'unauthorized').mockImplementation(() => {})
    get.mockImplementation(async (id) => {
      if (id === 1) throw new ApiError(401, '')
      if (id === 2) throw new Error('x')
      return probes(LATENCY[id]!)
    })
    await range(wrapper, '6 小时').trigger('click')
    await flushPromises()
    expect(unauthorized).toHaveBeenCalled()
    expect(row('东京 B').find('.nr-trend').text()).toContain('加载失败')
    expect(row('法兰克福 D').find('.nr-overall b').text()).toBe('183ms')
  })

  it('hides the carrier columns when show_carriers is off', async () => {
    const on = await mountNetwork('/network', (s) => (s.config = { ...s.config, show_carriers: true }))
    expect(on.wrapper.findAll('.network-head [data-carrier]')).toHaveLength(3)
    on.wrapper.unmount()
    const off = await mountNetwork('/network', (s) => (s.config = { ...s.config, show_carriers: false }))
    expect(off.wrapper.findAll('.network-head [data-carrier]')).toHaveLength(0)
    expect(off.wrapper.findAll('.nr-carrier')).toHaveLength(0)
  })

  it('drops the queued requests of a window it leaves', async () => {
    const { wrapper, store } = await mountNetwork()
    const drop = vi.spyOn(store.history, 'drop')
    await range(wrapper, '6 小时').trigger('click')
    await flushPromises()
    await range(wrapper, '7 天').trigger('click')
    await flushPromises()
    const [match] = drop.mock.calls.at(-1)!
    expect(match(1, 6, 'ping')).toBe(true)
    expect(match(1, 168, 'ping')).toBe(false)
    expect(match(1, 1, 'ping')).toBe(false)
    wrapper.unmount()
    const [leaving] = drop.mock.calls.at(-1)!
    expect(leaving(2, 168, 'ping')).toBe(true)
  })

  it('does not sweep the site bar when no node can load', async () => {
    const { wrapper } = await mountNetwork('/network', (s) => {
      s.nodes = s.nodes.map((n) => ({ ...n, online: false }))
    })
    expect(wrapper.find('.ns-online').text()).toContain('0/4')
    expect(wrapper.find('.network-summary .quality-bar').attributes('data-state')).toBeUndefined()
  })

  it('links each row to the node’s carrier section', async () => {
    const { wrapper } = await mountNetwork()
    expect(wrapper.find('.network-row').attributes('href')).toBe('/node/1#carriers')
  })
})
