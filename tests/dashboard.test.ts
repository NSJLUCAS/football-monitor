import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import App from '../src/App.vue'
import DashboardView from '../src/views/DashboardView.vue'
import { normalizeNodes } from '../src/domain/normalize'
import { useMonitorStore } from '../src/stores/monitor'
import type { HistoryResponse } from '../src/domain/types'

// One probe reading with no loss or band scores (35 × latency part + 4000) / 75:
// 146 ms -> 80, 178 ms -> 74, 190 ms -> 72.
const latencies: Record<number, number> = { 1: 190, 2: 146, 4: 178 }
const quality = (id: number): HistoryResponse => ({
  metrics: [],
  ping: latencies[id] ? [{ task_id: 7, ts: 1000, latency: latencies[id] }] : [],
  probes: { '7': '上海 TCP 目标' },
  loss: {},
  step: 720,
})
function node(id: number, name: string, group: string, pct: number, online = true) {
  return normalizeNodes({
    nodes: [
      {
        id,
        name,
        group,
        online,
        traffic_limit: 0,
        metrics: online
          ? {
              uptime: 30 * 86400,
              cpu: pct,
              load: [0, 0, 0],
              mem_total: 100,
              mem_used: pct,
              swap_total: 0,
              swap_used: 0,
              disk_total: 100,
              disk_used: pct,
              net_rx: 1024,
              net_tx: 512,
              total_rx: 0,
              total_tx: 0,
              month_rx: 0,
              month_tx: 0,
              tcp: 0,
              udp: 0,
              procs: 0,
            }
          : null,
      },
    ],
  })[0]!
}

// Hub order: 香港 A (72), 东京 B (80), 新加坡 C (offline, null), 法兰克福 D (74, other group).
// Billing: 香港 A ¥30/月 9 days left, 东京 B $10/月 3 days left, 法兰克福 D expires in 66 days without a price.
const billed = (n: ReturnType<typeof node>, extra: Record<string, unknown>) =>
  ({ ...n, billing_cycle: 'monthly', ...extra }) as ReturnType<typeof node>
const fixtures = () => [
  billed(node(1, '香港 A', '亚洲节点', 45), {
    price: 30,
    currency: 'CNY',
    expires_at: '2026-11-05',
    expires_in: 9,
  }),
  billed(node(2, '东京 B', '亚洲节点', 32), {
    price: 10,
    currency: 'USD',
    expires_at: '2026-10-30',
    expires_in: 3,
  }),
  node(3, '新加坡 C', '亚洲节点', 0, false),
  billed(node(4, '法兰克福 D', '欧洲节点', 41), { expires_at: '2027-01-01', expires_in: 66 }),
]

function makeRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: DashboardView },
      { path: '/node/:id', component: { template: '<div />' } },
      { path: '/settings', component: { template: '<div />' } },
    ],
  })
}

const cardNames = (wrapper: VueWrapper) =>
  wrapper.findAll('.live-card-link > .sr-only').map((a) => a.text().replace(/^查看 (.*) 详情，.*$/, '$1'))

const summaryValue = (wrapper: VueWrapper, label: string) =>
  wrapper
    .findAll('.summary-stat')
    .find((s) => s.find('.summary-stat-label').text() === label)
    ?.find('.summary-stat-value')
    .text()

async function mountDashboard(path = '/') {
  const router = makeRouter()
  await router.push(path)
  await router.isReady()
  const store = useMonitorStore()
  vi.spyOn(store.history, 'get').mockImplementation(async (id, hours) =>
    hours === 24 ? quality(id) : { metrics: [], ping: [], probes: {}, loss: {}, step: 60 },
  )
  store.nodes = fixtures()
  store.loading = false
  const wrapper = mount(DashboardView, { global: { plugins: [router] } })
  await flushPromises()
  return { wrapper, router, store }
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe() {}
      disconnect() {}
    },
  )
})
enableAutoUnmount(afterEach)
afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

describe('dashboard', () => {
  it('shows every node in Hub order by default under the page heading', async () => {
    const { wrapper } = await mountDashboard()
    expect(wrapper.find('.page-head h1').text()).toBe('首发阵容')
    expect(wrapper.find('.page-crumbs').text()).toContain('Football Monitor')
    expect(wrapper.find('.page-crumbs').text()).toContain('首页')
    expect(wrapper.find('.page-head .group-tabs').exists()).toBe(true)
    expect(cardNames(wrapper)).toEqual(['香港 A', '东京 B', '新加坡 C', '法兰克福 D'])
    wrapper.unmount()
  })

  it('filters by status', async () => {
    const { wrapper } = await mountDashboard()
    const offline = wrapper.findAll('.status-filter button').find((b) => b.text() === '离线')!
    await offline.trigger('click')
    expect(cardNames(wrapper)).toEqual(['新加坡 C'])
    expect(offline.attributes('aria-pressed')).toBe('true')
    const online = wrapper.findAll('.status-filter button').find((b) => b.text() === '在线')!
    await online.trigger('click')
    expect(cardNames(wrapper)).toEqual(['香港 A', '东京 B', '法兰克福 D'])
    wrapper.unmount()
  })

  it('sorts by overall score descending with unscored nodes last', async () => {
    const { wrapper } = await mountDashboard()
    await wrapper.find('select#node-sort').setValue('score')
    expect(cardNames(wrapper)).toEqual(['东京 B', '法兰克福 D', '香港 A', '新加坡 C'])
    wrapper.unmount()
  })

  it('sorts by name with zh-CN collation', async () => {
    const { wrapper } = await mountDashboard()
    await wrapper.find('select#node-sort').setValue('name')
    expect(cardNames(wrapper)).toEqual(['东京 B', '法兰克福 D', '香港 A', '新加坡 C'])
    await wrapper.find('select#node-sort').setValue('hub')
    expect(cardNames(wrapper)).toEqual(['香港 A', '东京 B', '新加坡 C', '法兰克福 D'])
    wrapper.unmount()
  })

  it('filters by the q route query', async () => {
    const { wrapper, router } = await mountDashboard('/?q=东京')
    expect(cardNames(wrapper)).toEqual(['东京 B'])
    await router.replace({ query: {} })
    await flushPromises()
    expect(cardNames(wrapper)).toHaveLength(4)
    wrapper.unmount()
  })

  it('averages the scored nodes of the current group in the summary strip', async () => {
    const { wrapper, store } = await mountDashboard()
    expect(summaryValue(wrapper, '平均评分')).toBe('75')
    expect(summaryValue(wrapper, '在线节点')).toBe('3/ 4')
    const asia = wrapper.findAll('.group-tabs button').find((b) => b.text() === '亚洲节点')!
    await asia.trigger('click')
    expect(summaryValue(wrapper, '平均评分')).toBe('76')
    expect(summaryValue(wrapper, '在线节点')).toBe('2/ 3')
    store.nodes = [node(3, '新加坡 C', '亚洲节点', 0, false)]
    await flushPromises()
    expect(summaryValue(wrapper, '平均评分')).toBe('—')
    wrapper.unmount()
  })

  it('shows eight overview tiles with real totals', async () => {
    const { wrapper } = await mountDashboard()
    expect(wrapper.findAll('.summary-stat-label').map((l) => l.text())).toEqual([
      '在线节点',
      '平均评分',
      '内存用量',
      '硬盘用量',
      '剩余价值',
      '累计流量',
      '实时上行',
      '实时下行',
    ])
    // Online nodes only: memory 45 + 32 + 41 bytes of 300; rates 3 × 512 B/s up, 3 × 1 KiB/s down.
    expect(summaryValue(wrapper, '内存用量')).toBe('118B / 300 B')
    expect(summaryValue(wrapper, '实时上行')).toBe('1.5KB/s')
    expect(summaryValue(wrapper, '实时下行')).toBe('3KB/s')
    // ¥30 × 9 / 30.4375 + $10 × 3 / 30.4375 × 7.10 (default rate).
    expect(summaryValue(wrapper, '剩余价值')).toBe('¥15.87CNY')
    wrapper.unmount()
  })

  it('ranks the machines that expire soonest, linking to their details', async () => {
    const { wrapper } = await mountDashboard()
    const rows = wrapper.findAll('.expiry-board li')
    expect(rows.map((r) => r.find('.expiry-name').text())).toEqual(['东京 B', '香港 A', '法兰克福 D'])
    expect(rows.map((r) => r.find('.expiry-days').text())).toEqual(['3 天', '9 天', '66 天'])
    expect(rows.map((r) => r.find('.expiry-days').attributes('data-level'))).toEqual([
      'danger',
      'warning',
      'ok',
    ])
    expect(rows[0]!.find('a').attributes('href')).toBe('/node/2')
    expect(rows[0]!.text()).toContain('2026-10-30')
    expect(rows[0]!.text()).toContain('/月')
    wrapper.unmount()
  })

  it('hides value and expiry when billing is hidden, and everything when the summary is off', async () => {
    const { wrapper, store } = await mountDashboard()
    expect(wrapper.find('.overview').exists()).toBe(true)
    store.config = { ...store.config, show_billing: false }
    await flushPromises()
    expect(wrapper.find('.expiry-board').exists()).toBe(false)
    expect(summaryValue(wrapper, '剩余价值')).toBeUndefined()
    store.config = { ...store.config, show_summary: false }
    await flushPromises()
    expect(wrapper.find('.overview').exists()).toBe(false)
    wrapper.unmount()
  })
})

describe('top bar search', () => {
  async function mountApp(path: string) {
    vi.stubGlobal('matchMedia', () => ({
      matches: true,
      addEventListener() {},
      removeEventListener() {},
    }))
    const router = makeRouter()
    await router.push(path)
    await router.isReady()
    const store = useMonitorStore()
    store.start = vi.fn()
    store.stop = vi.fn()
    store.nodes = fixtures()
    store.loading = false
    const wrapper = mount(App, { global: { plugins: [router] }, attachTo: document.body })
    await flushPromises()
    return { wrapper, router }
  }

  it('lives in the header and mirrors q on the home page', async () => {
    const { wrapper, router } = await mountApp('/?q=东京')
    const input = wrapper.find<HTMLInputElement>('header input#node-search')
    expect(input.attributes('type')).toBe('search')
    expect(input.attributes('aria-label')).toBe('搜索服务器')
    expect(input.element.value).toBe('东京')
    await input.setValue('香港')
    await flushPromises()
    expect(router.currentRoute.value.query.q).toBe('香港')
    expect(cardNames(wrapper)).toEqual(['香港 A'])
    await input.setValue('')
    await flushPromises()
    expect('q' in router.currentRoute.value.query).toBe(false)
    wrapper.unmount()
  })

  it('jumps back to the home page with q on Enter elsewhere', async () => {
    const { wrapper, router } = await mountApp('/settings')
    const input = wrapper.find<HTMLInputElement>('#node-search')
    await input.setValue('法兰克福')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/settings')
    await input.trigger('keydown', { key: 'Enter' })
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/')
    expect(router.currentRoute.value.query.q).toBe('法兰克福')
    expect(cardNames(wrapper)).toEqual(['法兰克福 D'])
    wrapper.unmount()
  })

  it('ignores Enter while an IME composition is still open', async () => {
    const { wrapper, router } = await mountApp('/settings')
    const input = wrapper.find<HTMLInputElement>('#node-search')
    await input.setValue('dongjing')
    await input.trigger('keydown', { key: 'Enter', isComposing: true })
    await input.trigger('keydown', { key: 'Enter', keyCode: 229 })
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/settings')
    wrapper.unmount()
  })

  it('gives the connection pill an accessible name that survives the compact header', async () => {
    const { wrapper } = await mountApp('/settings')
    const pill = wrapper.find('.connection-pill')
    const text = pill.find('.connection-text')
    expect(text.text()).not.toBe('')
    expect(pill.attributes('title')).toBe(text.text())
    expect(pill.find('i').attributes('aria-hidden')).toBe('true')
    const css = readFileSync('src/style.css', 'utf8')
    expect(css).not.toMatch(/\.connection-pill\s*>\s*(span|\.connection-text)\s*\{[^}]*display:\s*none/)
    wrapper.unmount()
  })

  it('has no About entry in the navigation or the footer', async () => {
    const { wrapper } = await mountApp('/settings')
    expect(wrapper.find('.main-nav').text()).not.toContain('关于')
    expect(wrapper.find('a[href="/about"]').exists()).toBe(false)
    expect(wrapper.find('.site-footer a').exists()).toBe(false)
    expect(wrapper.find('.site-footer').text()).not.toContain('原创卡面')
    wrapper.unmount()
  })

  it('focuses the search box on the / shortcut outside form fields', async () => {
    const { wrapper } = await mountApp('/settings')
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '/' }))
    expect(document.activeElement?.id).toBe('node-search')
    wrapper.unmount()
  })

  it('shows the theme version in the footer and the text wordmark', async () => {
    const { wrapper } = await mountApp('/settings')
    const { version } = JSON.parse(readFileSync('theme.json', 'utf8')) as { version: string }
    expect(wrapper.find('.site-footer').text()).toContain(`V${version}`)
    expect(wrapper.find('.brand').text().replace(/\s+/g, '')).toBe('FOOTBALLMONITOR')
    wrapper.unmount()
  })
})
