import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import NodeDetailView from '../src/views/NodeDetailView.vue'
import ScoreGauge from '../src/components/ScoreGauge.vue'
import HistoryChart from '../src/components/HistoryChart.vue'
import { normalizeNodes } from '../src/domain/normalize'
import { bytes, cycle, duration, expiry, money, trafficUsed } from '../src/domain/format'
import type { HistoryResponse, MonitorNode } from '../src/domain/types'
import { useMonitorStore } from '../src/stores/monitor'

const GB = 1024 ** 3
const now = Math.floor(Date.now() / 1000)
const fixture = (): MonitorNode =>
  normalizeNodes({
    nodes: [
      {
        id: 103,
        name: '东京 Prime',
        group: '亚洲节点',
        country: 'JP',
        online: true,
        public_remark: '主力前锋，负责东亚流量',
        last_seen: now - 5,
        last_seen_ago: 5,
        os: 'Debian 12',
        kernel: '6.1.0-18-amd64',
        arch: 'x86_64',
        virt: 'kvm',
        cpu_name: 'AMD EPYC 7B13',
        cpu_cores: 4,
        mem_total: 8 * GB,
        swap_total: 2 * GB,
        disk_total: 80 * GB,
        agent_version: '1.4.2',
        price: 12.5,
        currency: 'USD',
        billing_cycle: 'monthly',
        expires_at: '2027-01-31',
        expires_in: 97,
        traffic_limit: 1024 * GB,
        traffic_mode: 'sum',
        total_rx: 900 * GB,
        total_tx: 300 * GB,
        month_rx: 120 * GB,
        month_tx: 40 * GB,
        day_rx: 6 * GB,
        day_tx: 3 * GB,
        metrics: {
          uptime: 12 * 86400,
          cpu: 23.4,
          load: [0.42, 0.37, 0.31],
          mem_total: 8 * GB,
          mem_used: 3 * GB,
          swap_total: 2 * GB,
          swap_used: 0.5 * GB,
          disk_total: 80 * GB,
          disk_used: 20 * GB,
          net_rx: 1024 ** 2,
          net_tx: 512 * 1024,
          total_rx: 900 * GB,
          total_tx: 300 * GB,
          month_rx: 120 * GB,
          month_tx: 40 * GB,
          tcp: 35,
          udp: 4,
          procs: 120,
        },
      },
    ],
  })[0]!

const history = (): HistoryResponse => ({
  metrics: [
    { ts: now - 120, cpu: 20, mem_used: 3 * GB, disk_used: 20 * GB, net_rx: 1024 ** 2, net_tx: 1024 },
    { ts: now - 60, cpu: 25, mem_used: 3 * GB, disk_used: 20 * GB, net_rx: 1024 ** 2, net_tx: 1024 },
  ],
  ping: [
    { task_id: 11, ts: now - 60, latency: 38 },
    { task_id: 11, ts: now - 10, latency: 42 },
  ],
  probes: { '11': '上海电信 TCP' },
  loss: { '11': 1.5 },
  step: 60,
})

async function mountDetail(configure?: (store: ReturnType<typeof useMonitorStore>) => void) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/node/:id', component: NodeDetailView },
      { path: '/settings', component: { template: '<div />' } },
    ],
  })
  await router.push('/node/103')
  await router.isReady()
  const store = useMonitorStore()
  store.me = { authed: true, site_name: 'Monitor', public_page: true, github: false, history_days: 7 }
  store.loading = false
  store.nodes = [fixture()]
  store.config = {
    ...store.config,
    nodes: { '103': { carriers: { telecom: { taskId: 11, line: 'CN2 GIA' } } } },
  }
  const get = vi.spyOn(store.history, 'get').mockResolvedValue(history())
  configure?.(store)
  const wrapper = mount(NodeDetailView, { global: { plugins: [router] }, attachTo: document.body })
  await flushPromises()
  return { wrapper, store, get }
}

beforeEach(() => {
  setActivePinia(createPinia())
})
enableAutoUnmount(afterEach)
afterEach(() => {
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

describe('ScoreGauge', () => {
  it('is a 1–99 meter coloured by the tier lines', () => {
    const color = (value: number) =>
      mount(ScoreGauge, { props: { value, label: 'CPU' } })
        .find('.gauge-value-arc')
        .attributes('stroke')
    expect(color(75)).toBe('#4ade80')
    expect(color(74)).toBe('#facc15')
    expect(color(65)).toBe('#facc15')
    expect(color(64)).toBe('#f87171')
    const meter = mount(ScoreGauge, { props: { value: 80, label: 'CPU' } }).find('[role="meter"]')
    expect(meter.attributes('aria-valuemin')).toBe('1')
    expect(meter.attributes('aria-valuemax')).toBe('99')
    expect(meter.attributes('aria-valuenow')).toBe('80')
    expect(meter.text()).toContain('80')
    expect(meter.text()).toContain('CPU')
  })

  it('omits aria-valuenow and shows a dash without a value', () => {
    const wrapper = mount(ScoreGauge, { props: { value: null, label: 'PNG' } })
    const meter = wrapper.find('[role="meter"]')
    expect(meter.attributes('aria-valuenow')).toBeUndefined()
    expect(meter.text()).toContain('—')
    expect(wrapper.find('.gauge-value-arc').exists()).toBe(false)
  })
})

describe('node detail page', () => {
  it('heads the page with the node name, online pill, configure action and remark', async () => {
    const { wrapper, get } = await mountDetail()
    expect(wrapper.find('.page-head h1').text()).toBe('东京 Prime')
    expect(wrapper.find('.page-crumbs').text()).toContain('首页')
    expect(wrapper.find('.page-crumbs').text()).toContain('东京 Prime')
    expect(wrapper.find('.detail-status').text()).toBe('在线')
    expect(wrapper.find('.page-head').text()).toContain('主力前锋，负责东亚流量')
    const configure = wrapper.find('a[href="/settings?node=103"]')
    expect(configure.text()).toContain('配置此节点')
    expect(get).toHaveBeenCalledWith(103, 6, 'all', false)
  })

  it('draws the disk history in a colour readable on light and dark panels', async () => {
    const { wrapper } = await mountDetail()
    const disk = wrapper.findAllComponents(HistoryChart).find((c) => c.props('title') === '硬盘使用率')!
    const color = (disk.props('series') as { color: string }[])[0]!.color
    const luminance = (hex: string) => {
      const [r, g, b] = [1, 3, 5].map((i) => {
        const c = parseInt(hex.slice(i, i + 2), 16) / 255
        return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
      })
      return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
    }
    for (const panel of ['#ffffff', '#1b1e26']) {
      const [a, b] = [luminance(color), luminance(panel)].sort((x, y) => y - x)
      expect((a! + 0.05) / (b! + 0.05), panel).toBeGreaterThanOrEqual(3)
    }
  })

  it('hides the configure action from visitors', async () => {
    const { wrapper } = await mountDetail((store) => {
      store.me = { ...store.me!, authed: false }
    })
    expect(wrapper.find('a[href="/settings?node=103"]').exists()).toBe(false)
  })

  it('links the sticky section tabs to five panels', async () => {
    const { wrapper } = await mountDetail()
    const nav = wrapper.find('nav[aria-label="详情分区"]')
    expect(nav.findAll('a').map((a) => a.attributes('href'))).toEqual([
      '#billing',
      '#carriers',
      '#score',
      '#history',
      '#system',
    ])
    for (const id of ['billing', 'carriers', 'score', 'history', 'system'])
      expect(wrapper.find(`section#${id}`).exists()).toBe(true)
  })

  it("shows today's traffic split and total in the billing panel", async () => {
    const { wrapper } = await mountDetail()
    const today = wrapper.get('.billing-today')
    expect(today.find('strong').text()).toBe('↓ 6 GB · ↑ 3 GB')
    expect(today.find('small').text()).toBe('合计 9 GB')
  })

  it('drops the billing blocks when show_billing is off', async () => {
    const { wrapper } = await mountDetail((store) => {
      store.config = { ...store.config, show_billing: false }
    })
    expect(wrapper.find('.billing-fee').exists()).toBe(false)
    expect(wrapper.find('.billing-expiry').exists()).toBe(false)
    expect(wrapper.find('.billing-traffic').exists()).toBe(true)
    expect(wrapper.find('.billing-today').exists()).toBe(true)
  })

  it('drops the whole billing panel and its tab when billing and traffic are off', async () => {
    const { wrapper } = await mountDetail((store) => {
      store.config = { ...store.config, show_billing: false, show_traffic: false }
    })
    expect(wrapper.find('#billing').exists()).toBe(false)
    expect(wrapper.find('a[href="#billing"]').exists()).toBe(false)
  })

  it('drops the carrier panel when show_carriers is off', async () => {
    const { wrapper } = await mountDetail((store) => {
      store.config = { ...store.config, show_carriers: false }
    })
    expect(wrapper.find('#carriers').exists()).toBe(false)
    expect(wrapper.find('a[href="#carriers"]').exists()).toBe(false)
  })

  it('lists each carrier with line, task, latency and window loss', async () => {
    const { wrapper } = await mountDetail()
    const panel = wrapper.find('#carriers')
    expect(panel.text()).toContain('CN2 GIA')
    expect(panel.text()).toContain('#11')
    expect(panel.text()).toContain('上海电信 TCP')
    expect(panel.text()).toContain('42')
    expect(panel.text()).toContain('1.5%')
  })

  it('breaks the network score into three meters and keeps the resource readings', async () => {
    const { wrapper, get } = await mountDetail()
    expect(get).toHaveBeenCalledWith(103, 24, 'ping', false, true)
    const score = wrapper.find('#score')
    expect(score.findAll('[role="meter"]').map((m) => m.attributes('aria-label'))).toEqual([
      '延迟 评分',
      '抖动 评分',
      '丢包 评分',
    ])
    expect(score.text()).toContain('网络质量 = 延迟 35% + 抖动 25% + 丢包 40%')
    // 24-hour history: readings 38 and 42 ms, Hub window loss 1.5%.
    expect(score.find('.score-overall').text()).toBe('综合 93')
    expect(score.text()).toContain('40 ms')
    expect(score.text()).toContain('4 ms')
    expect(score.text()).toContain('1.5%')
    expect(score.text()).toContain('上海电信')
    expect(score.findAll('.score-reading').map((r) => r.text())).toEqual(['23%', '38%', '25%', '16%', '12天'])
    expect(score.find('a[href="/about"]').exists()).toBe(false)
    const text = score.text()
    expect(text).toContain('23.4%')
    expect(text).toContain('0.42 / 0.37 / 0.31')
    expect(text).toContain('4 核')
    expect(text).toContain(`${bytes(0.5 * GB)} / ${bytes(2 * GB)}`)
  })

  it('shows system information with the processor and node id', async () => {
    const { wrapper } = await mountDetail()
    const system = wrapper.find('#system')
    expect(system.text()).toContain('AMD EPYC 7B13')
    expect(system.text()).toContain('#103')
    expect(system.text()).toContain('6.1.0-18-amd64')
  })

  it('shows the tier and whether the skin follows the score', async () => {
    const { wrapper } = await mountDetail()
    expect(wrapper.find('.detail-basic').text()).toContain('自动')
    expect(wrapper.find('.detail-basic').text()).toContain('亚洲节点')
    expect(wrapper.find('.detail-basic').text()).toContain('日本')
  })

  it('keeps every field from the V1 detail page', async () => {
    const { wrapper } = await mountDetail()
    const node = fixture(),
      text = wrapper.text()
    const expected = [
      '处理器',
      'AMD EPYC 7B13',
      '4 核',
      'Swap',
      `${bytes(3 * GB)} / ${bytes(8 * GB)}`,
      bytes(2 * GB),
      '硬盘',
      `${bytes(20 * GB)} / ${bytes(80 * GB)}`,
      '系统',
      'Debian 12',
      'x86_64',
      'Uptime',
      duration(12 * 86400),
      '周期',
      money(12.5, 'USD'),
      cycle('monthly'),
      '本周期',
      '配额',
      `${bytes(trafficUsed(node))} / ${bytes(1024 * GB)}`,
      '累计',
      `${bytes(900 * GB)} / ${bytes(300 * GB)}`,
      '到期',
      expiry(node),
      'TCP / UDP / 进程',
      '35 / 4 / 120',
      '今日',
      `${bytes(6 * GB)} / ${bytes(3 * GB)}`,
      '虚拟化 / Agent',
      'kvm',
      '1.4.2',
      '#103',
    ]
    for (const piece of expected) expect(text, piece).toContain(piece)
  })

  it('does not present the last report of an offline node as live values', async () => {
    const { wrapper } = await mountDetail((store) => {
      store.nodes = [{ ...fixture(), online: false }]
    })
    const text = wrapper.text()
    for (const stale of [
      '23.4%',
      '0.42 / 0.37 / 0.31',
      `${bytes(3 * GB)} / ${bytes(8 * GB)}`,
      `${bytes(0.5 * GB)} / ${bytes(2 * GB)}`,
      `${bytes(20 * GB)} / ${bytes(80 * GB)}`,
      '35 / 4 / 120',
      duration(12 * 86400),
    ])
      expect(text, stale).not.toContain(stale)
    expect(wrapper.find('#score').text()).toContain('离线，无实时数据')
    expect(text).toContain(`— / ${bytes(8 * GB)}`)
    expect(text).toContain(`— / ${bytes(80 * GB)}`)
    expect(wrapper.find('#system').text()).toContain('— / — / —')
    expect(wrapper.find('.detail-status').text()).toBe('离线')
  })

  it('keeps the five history charts', async () => {
    const { wrapper } = await mountDetail()
    const titles = wrapper.findAll('#history .chart-panel h3').map((h) => h.text())
    expect(titles).toEqual(['CPU 使用率', '内存使用率', '网络速率', '硬盘使用率', 'TCP 延迟历史'])
  })
})
