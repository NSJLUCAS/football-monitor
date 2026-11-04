import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import OpsView from '../src/views/OpsView.vue'
import { normalizeNodes } from '../src/domain/normalize'
import { useMonitorStore } from '../src/stores/monitor'

const metrics = (cpu: number) => ({
  uptime: 86400 * 3,
  cpu,
  load: [0, 0, 0],
  mem_used: 2,
  mem_total: 10,
  swap_used: 0,
  swap_total: 0,
  disk_used: 3,
  disk_total: 10,
  net_rx: 1024,
  net_tx: 2048,
  total_rx: 0,
  total_tx: 0,
  month_rx: 0,
  month_tx: 0,
  tcp: 0,
  udp: 0,
  procs: 0,
})
const fixtures = (patch: Record<number, Record<string, unknown>> = {}) =>
  normalizeNodes({
    nodes: [
      { id: 1, name: '香港 A', group: '亚洲', country: 'HK', online: true, metrics: metrics(10) },
      { id: 2, name: '东京 B', group: '亚洲', country: 'JP', online: true, metrics: metrics(20) },
      { id: 3, name: '法兰克福 C', group: '欧洲', country: 'DE', online: true, metrics: metrics(30) },
    ].map((n) => ({ ...n, ...patch[n.id] })),
  })
const troubled = {
  2: { online: false, last_seen: Math.floor(Date.now() / 1000) - 7200 },
  3: { metrics: metrics(95) },
}

async function mountOps(path = '/ops', patch: Record<number, Record<string, unknown>> = {}) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/ops', component: OpsView },
      { path: '/node/:id', component: { template: '<div />' } },
    ],
  })
  await router.push(path)
  await router.isReady()
  const store = useMonitorStore()
  store.nodes = fixtures(patch)
  store.loading = false
  store.updatedAt = Date.now()
  store.connection = 'live'
  const loadPing = vi.spyOn(store, 'loadPing').mockResolvedValue()
  const wrapper = mount(OpsView, { global: { plugins: [router] } })
  await flushPromises()
  return { wrapper, router, store, loadPing }
}
const count = (w: VueWrapper, tone: string) => w.find(`.ops-counts [data-tone="${tone}"] dd`).text()
const issueNames = (w: VueWrapper) => w.findAll('.ops-row .or-main b').map((b) => b.text())

beforeEach(() => {
  setActivePinia(createPinia())
  // jsdom has no layout or canvas: the globe measures nothing and skips drawing.
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  )
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }))
})
enableAutoUnmount(afterEach)
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('ops wall', () => {
  it('counts the fleet, places it on the globe and says all is well', async () => {
    const { wrapper, loadPing } = await mountOps()
    expect([count(wrapper, 'ok'), count(wrapper, 'warn'), count(wrapper, 'off')]).toEqual(['3', '0', '0'])
    expect(wrapper.findAll('.og-marker')).toHaveLength(3)
    expect(wrapper.find('.ops-allok').text()).toBe('全部 3 台运行正常')
    expect(wrapper.find('.ops-tour').exists()).toBe(false)
    expect(wrapper.find('.ops-changes').text()).toBe('最近 1 小时没有新的变化')
    // The page keeps each online node's last hour of probes fresh.
    expect(loadPing.mock.calls.map((c) => c[0])).toEqual([1, 2, 3])
  })
  it('lists what is going on, offline first, and turns the globe to it', async () => {
    const { wrapper } = await mountOps('/ops', troubled)
    expect([count(wrapper, 'ok'), count(wrapper, 'warn'), count(wrapper, 'off')]).toEqual(['1', '1', '1'])
    expect(issueNames(wrapper)).toEqual(['东京 B', '法兰克福 C'])
    expect(wrapper.findAll('.ops-row .or-side').map((v) => v.text())).toEqual(['离线2 小时', 'CPU95%'])
    // The tour opens on the first troubled node, with its card beside the reticle.
    expect(wrapper.find('.og-hud .oc-name').text()).toBe('东京 B')
    expect(wrapper.find('.ops-card').attributes('data-online')).toBe('false')
    expect(wrapper.find('.oc-kicker').text()).toContain('离线已持续 2 小时')
    expect(wrapper.find('.og-marker[data-focus]').attributes('data-state')).toBe('off')
    expect(wrapper.find('.ops-tour').text()).toBe('停止依次查看')
  })
  it('moves to the next troubled node every six seconds; a picked row stops the tour there', async () => {
    vi.useFakeTimers()
    const { wrapper } = await mountOps('/ops', troubled)
    await vi.advanceTimersByTimeAsync(6000)
    expect(wrapper.find('.oc-name').text()).toBe('法兰克福 C')
    expect(wrapper.find('.oc-tag').text()).toBe('CPU95%')
    await wrapper.findAll('.ops-row')[0]!.trigger('click')
    expect(wrapper.find('.oc-name').text()).toBe('东京 B')
    expect(wrapper.find('.ops-row[data-focus]').text()).toContain('东京 B')
    expect(wrapper.find('.ops-tour').text()).toBe('依次查看 2 台')
    await vi.advanceTimersByTimeAsync(12000)
    expect(wrapper.find('.oc-name').text()).toBe('东京 B')
    await wrapper.find('.oc-close').trigger('click')
    expect(wrapper.find('.ops-card').exists()).toBe(false)
    await wrapper.find('.ops-tour').trigger('click')
    expect(wrapper.find('.oc-name').text()).toBe('东京 B')
  })
  it('shows a country with several nodes as a list, and each node from it', async () => {
    const { wrapper } = await mountOps('/ops', { 2: { country: 'HK' } })
    await wrapper.find('.og-marker[aria-label*="2 台"]').trigger('click')
    expect(wrapper.find('.oc-kicker').text()).toBe('该区域的服务器')
    expect(wrapper.find('.oc-sub').text()).toBe('2 台 · 2 正常 · 0 有异常')
    expect(wrapper.findAll('.oc-row').map((r) => r.text())).toEqual(['香港 A正常', '东京 B正常'])
    await wrapper.findAll('.oc-row')[1]!.trigger('click')
    expect(wrapper.find('.oc-name').text()).toBe('东京 B')
    expect(wrapper.find('.oc-kicker span').text()).toBe('运行正常 · 已运行 3 天')
    expect(wrapper.find('.oc-state').text()).toBe('ONLINE')
    expect(wrapper.findAll('.oc-metric').map((m) => m.text())).toEqual([
      'CPU20%',
      '内存20%',
      '上行2KB/s',
      '下行1KB/s',
    ])
    expect(wrapper.find('.oc-actions a').attributes('href')).toBe('/node/2')
    await wrapper.find('.oc-actions button').trigger('click')
    expect(wrapper.find('.oc-kicker').text()).toBe('该区域的服务器')
    // A country with one node opens that node straight away.
    await wrapper.find('.og-marker[aria-label^="德国"]').trigger('click')
    expect(wrapper.find('.oc-name').text()).toBe('法兰克福 C')
    expect(wrapper.find('.oc-actions button').exists()).toBe(false)
  })
  it('narrows to a group and says when the group does not exist', async () => {
    const asia = await mountOps('/ops?group=亚洲')
    expect(asia.wrapper.findAll('.og-marker')).toHaveLength(2)
    expect(asia.wrapper.find('.ops-note').text()).toContain('分组：亚洲')
    asia.wrapper.unmount()
    setActivePinia(createPinia())
    const none = await mountOps('/ops?group=火星')
    expect(none.wrapper.findAll('.og-marker')).toHaveLength(3)
    expect(none.wrapper.find('.ops-note').text()).toContain('分组“火星”不存在，显示全部节点')
  })
  it('says how many nodes have no place on the globe', async () => {
    const { wrapper } = await mountOps('/ops', { 3: { country: '' } })
    expect(wrapper.findAll('.og-marker')).toHaveLength(2)
    expect(wrapper.find('.ops-note').text()).toContain('1 台未设置国家或地区')
  })
  it('raises a banner once data is a minute old and drops it when data returns', async () => {
    vi.useFakeTimers()
    const { wrapper, store } = await mountOps()
    store.connection = 'polling'
    await vi.advanceTimersByTimeAsync(60000)
    expect(wrapper.find('.ops-banner').exists()).toBe(false)
    await vi.advanceTimersByTimeAsync(2000)
    expect(wrapper.find('.ops-banner').text()).toContain('数据已 1 分 02 秒没有更新')
    expect(wrapper.find('.ops-banner').text()).toContain('实时连接中断，正在用 HTTP 轮询重试')
    expect(wrapper.find('.ops-wall').attributes('data-stale')).toBeDefined()
    store.updatedAt = Date.now()
    await vi.advanceTimersByTimeAsync(1000)
    expect(wrapper.find('.ops-banner').exists()).toBe(false)
  })
  it('records what changed since it opened, with a tag, and turns to it when picked', async () => {
    const { wrapper, store } = await mountOps()
    store.nodes = fixtures({ 1: { online: false } })
    await flushPromises()
    const change = wrapper.find('.ops-change')
    expect(change.find('time').text()).toMatch(/^\d\d:\d\d:\d\d$/)
    expect(change.find('.ops-tag').text()).toBe('离线')
    expect(change.find('.ops-tag').attributes('data-tone')).toBe('bad')
    expect(change.find('.ops-change-text').text()).toBe('香港 A')
    await wrapper.find('.ops-tour').trigger('click')
    await change.trigger('click')
    expect(wrapper.find('.oc-name').text()).toBe('香港 A')
  })
  it('lists lossy moments already in the last hour of probes on opening', async () => {
    const { wrapper, store } = await mountOps()
    const now = Math.floor(Date.now() / 1000)
    store.ping = {
      1: {
        metrics: [],
        ping: [
          { task_id: 7, ts: now - 900, latency: 40, loss: 5 },
          { task_id: 7, ts: now - 840, latency: 40 },
        ],
        probes: { '7': '上海电信' },
        loss: {},
        step: 60,
      },
    }
    await flushPromises()
    const change = wrapper.find('.ops-change')
    expect(change.find('.ops-tag').text()).toBe('丢包')
    expect(change.find('.ops-change-text').text()).toBe('香港 A · 5.0%')
  })
  it('keeps the screen awake while open and lets it go on leaving', async () => {
    const release = vi.fn().mockResolvedValue(undefined)
    const request = vi.fn().mockResolvedValue({ released: false, release })
    Object.defineProperty(navigator, 'wakeLock', { value: { request }, configurable: true })
    const { wrapper } = await mountOps()
    expect(request).toHaveBeenCalledWith('screen')
    wrapper.unmount()
    expect(release).toHaveBeenCalled()
    Reflect.deleteProperty(navigator, 'wakeLock')
  })
  it('shows new figures at once when motion is off', async () => {
    document.documentElement.dataset.motion = 'false'
    const { wrapper, store } = await mountOps()
    store.nodes = fixtures({ 1: { online: false } })
    await flushPromises()
    expect(count(wrapper, 'off')).toBe('1')
    delete document.documentElement.dataset.motion
  })
})
