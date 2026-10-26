import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import PlayerCard from '../src/components/PlayerCard.vue'
import CardLiveStrip from '../src/components/CardLiveStrip.vue'
import LiveCard from '../src/components/LiveCard.vue'
import { normalizeNodes } from '../src/domain/normalize'
import { parseConfig } from '../src/domain/config'
import { resolveSkin, skins } from '../src/domain/skins'
import { emptyScore, type NodeScore, type Tier } from '../src/domain/score'
import type { HistoryResponse, MonitorNode, TemplateId } from '../src/domain/types'
import { useMonitorStore } from '../src/stores/monitor'

const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/', component: { template: '<div />' } },
    { path: '/node/:id', component: { template: '<div />' } },
  ],
})
const online = normalizeNodes({
  nodes: [
    {
      id: 4,
      name: 'HK-01',
      country: 'HK',
      group: '亚洲节点',
      online: true,
      virt: 'kvm',
      cpu_cores: 4,
      metrics: {
        uptime: 86400,
        cpu: 10,
        load: [0, 0, 0],
        mem_total: 100,
        mem_used: 20,
        swap_total: 0,
        swap_used: 0,
        disk_total: 100,
        disk_used: 30,
        net_rx: 2048,
        net_tx: 1024,
        total_rx: 0,
        total_tx: 0,
        month_rx: 0,
        month_tx: 0,
        tcp: 0,
        udp: 0,
        procs: 0,
      },
    },
  ],
})[0]!
const offline: MonitorNode = { ...online, online: false, metrics: null }
const score: NodeScore = { ...emptyScore(), overall: 78 }
const empty = emptyScore()
const card = (props: Record<string, unknown>) =>
  mount(PlayerCard, {
    props: { node: online, config: parseConfig({}), score, tier: 'gold' as Tier, ...props },
    global: { plugins: [router] },
  })

const cases: [TemplateId, Tier, string][] = [
  ...skins.map((s): [TemplateId, Tier, string] => [s.id, 'gold', s.id]),
  ['auto', 'gold', 'gold'],
  ['auto', 'silver', 'silver'],
  ['auto', 'bronze', 'bronze'],
]

describe('player card', () => {
  it.each(cases)('renders template %s at tier %s as skin %s', (template, tier, id) => {
    const wrapper = card({ config: parseConfig({ default_template: template }), tier })
    const skin = resolveSkin(template, tier)
    expect(wrapper.classes()).toContain('player-card')
    expect(wrapper.attributes('data-skin')).toBe(id)
    expect(wrapper.attributes('data-size')).toBe('sm')
    const face = wrapper.find('img.pc-face')
    expect(face.attributes('src')).toBe(skin.image)
    expect(face.attributes('alt')).toBe('')
    expect(wrapper.find('.pc-name').text()).toBe('HK-01')
    expect(wrapper.findAll('.pc-stat-label').map((s) => s.text())).toEqual([
      'CPU',
      '内存',
      '硬盘',
      '流量',
      '在线',
      '延迟',
    ])
    const values = wrapper.findAll('.pc-stat-value')
    expect(values.map((s) => s.text())).toEqual(['10%', '20%', '30%', '∞', '1天', '—'])
    expect(values.map((s) => s.attributes('data-grade'))).toEqual([
      'good',
      'good',
      'good',
      'good',
      'good',
      undefined,
    ])
    expect(wrapper.findAll('.pc-stat-unit').map((s) => s.text())).toEqual(['%', '%', '%', '天'])
    expect(wrapper.find('.pc-rating').text()).toBe('78')
    expect(wrapper.find('.pc-position').text()).toBe('HK')
    expect(wrapper.find('.pc-group').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('亚洲节点')
    expect(wrapper.attributes('aria-label')).toBe('HK-01 在线 综合 78')
    wrapper.unmount()
  })
  it('prefers the node template and the explicit override', () => {
    const config = parseConfig({
      default_template: 'auto',
      node_config: JSON.stringify({ version: 1, nodes: { '4': { template: 'legend' } } }),
    })
    expect(card({ config }).attributes('data-skin')).toBe('legend')
    expect(card({ config, templateOverride: 'pioneer' }).attributes('data-skin')).toBe('pioneer')
  })
  it('marks offline cards and shows OFF', () => {
    const wrapper = card({ node: offline, score: empty })
    expect(wrapper.classes()).toContain('card-offline')
    expect(wrapper.find('.pc-rating').text()).toBe('OFF')
    expect(wrapper.text()).toContain('离线')
    expect(wrapper.attributes('aria-label')).toBe('HK-01 离线 综合 无数据')
  })
  it('shows a dash for online nodes without a score', () => {
    const wrapper = card({ score: empty })
    expect(wrapper.classes()).not.toContain('card-offline')
    expect(wrapper.find('.pc-rating').text()).toBe('—')
  })
  it('shows flag, provider and OS crests at the bottom of every card size', () => {
    const debian = { ...online, os: 'Debian GNU/Linux 12 (bookworm)' }
    const config = parseConfig({
      node_config: JSON.stringify({ version: 1, nodes: { '4': { provider: { id: 'vultr' } } } }),
    })
    for (const size of ['sm', 'lg']) {
      const crests = card({ node: debian, config, size }).findAll('.pc-crest')
      expect(crests.map((c) => c.attributes('data-kind'))).toEqual(['flag', 'provider', 'os'])
      expect(crests[0]!.find('img').attributes('src')).toMatch(/hk\.svg/)
      expect(crests[0]!.find('img').attributes('alt')).toBe('')
      expect(crests[1]!.find('path').attributes('fill')).toBe('#007BFC')
      expect(crests[1]!.attributes('title')).toBe('Vultr')
      expect(crests[2]!.find('path').attributes('fill')).toBe('#A81D33')
      expect(crests[2]!.attributes('title')).toBe('Debian')
    }
    expect(card({ size: 'lg' }).find('.pc-badge').exists()).toBe(false)
    expect(card({ size: 'lg' }).text()).not.toContain('KVM')
  })
  it('uses text marks, the owner logo and skips unknown crests', () => {
    const custom = parseConfig({
      node_config: JSON.stringify({
        version: 1,
        nodes: { '4': { provider: { id: 'custom', name: '小鸡云', logo: 'https://img.example.org/l.png' } } },
      }),
    })
    const own = card({ node: { ...online, os: 'Windows Server 2022' }, config: custom }).findAll('.pc-crest')
    expect(own[1]!.find('img').attributes('src')).toBe('https://img.example.org/l.png')
    expect(own[1]!.attributes('title')).toBe('小鸡云')
    expect(own[2]!.text()).toBe('Win')
    const aws = parseConfig({
      node_config: JSON.stringify({ version: 1, nodes: { '4': { provider: { id: 'aws' } } } }),
    })
    expect(card({ config: aws }).find('.pc-crest[data-kind="provider"]').text()).toBe('AWS')
    const bare = card({ node: { ...online, country: '', os: '' } })
    expect(bare.find('.pc-crests').exists()).toBe(false)
  })
  it('lists configured carrier lines as skills on the left of every card size', () => {
    const config = parseConfig({
      node_config: JSON.stringify({
        version: 1,
        nodes: {
          '4': {
            carriers: {
              telecom: { taskId: 1, line: 'CN2 GIA' },
              unicom: { line: '9929' },
              mobile: { line: '未知' },
            },
          },
        },
      }),
    })
    for (const size of ['sm', 'lg']) {
      const skills = card({ config, size }).findAll('.pc-skill')
      expect(skills.map((s) => s.text())).toEqual(['CN2 GIA', '9929'])
      expect(skills.map((s) => s.attributes('data-carrier'))).toEqual(['telecom', 'unicom'])
      expect(skills[0]!.attributes('title')).toBe('中国电信 · CN2 GIA')
      expect(card({ config, size }).find('.pc-meta .pc-skill').exists()).toBe(false)
    }
    expect(card({}).find('.pc-skill').exists()).toBe(false)
  })
  it('keeps the full long name in the title', () => {
    const name = 'A very long 节点名称 / 测试换行 with many more words'
    const wrapper = card({ node: { ...online, name } })
    expect(wrapper.find('.pc-name').attributes('title')).toBe(name)
  })
  it('falls back on image error and does not render untrusted HTML', async () => {
    const config = parseConfig({
      default_template: 'weekly-black',
      node_config: JSON.stringify({
        version: 1,
        nodes: { '4': { portrait: { url: 'https://example.org/a.png' } } },
      }),
    })
    const wrapper = card({
      config,
      node: { ...online, name: '<img onerror=alert(1)>', group: '<b onclick=x>g</b>' },
    })
    await wrapper.find('.custom-portrait').trigger('error')
    expect(wrapper.find('.default-portrait').exists()).toBe(true)
    expect(wrapper.find('[onerror]').exists()).toBe(false)
    expect(wrapper.find('[onclick]').exists()).toBe(false)
    expect(wrapper.find('.pc-name').text()).toBe('<img onerror=alert(1)>')
  })
})

const now = Date.now() / 1000
const history: HistoryResponse = {
  metrics: [],
  ping: [
    { task_id: 1, ts: now - 30, latency: 60.5 },
    { task_id: 2, ts: now - 3600, latency: 40 },
    { task_id: 3, ts: now - 20, latency: 33.3 },
    { task_id: 7, ts: now - 20, latency: 12 },
  ],
  // Hub order is ascending task id; the fourth probe must not be shown.
  probes: { '7': '东京 TCP', '3': '北京 TCP 目标', '1': '上海 TCP 目标', '2': '广州 TCP 目标' },
  loss: {},
  step: 60,
}
const nodeConfig = { carriers: { telecom: { taskId: 2 }, unicom: { taskId: 1 } } }

describe('card live strip', () => {
  it('shows download and upload rates on the first row', () => {
    const strip = mount(CardLiveStrip, { props: { node: online, showCarriers: true } })
    expect(strip.classes()).toContain('card-live-strip')
    const speed = strip.find('.strip-speed').text()
    expect(speed).toContain('↓')
    expect(speed).toContain('↑')
    expect(speed).toContain('↓2 KB/s')
    expect(speed).toContain('↑1 KB/s')
  })
  it('shows the first three Hub probes in Hub order, labelled by region', () => {
    const strip = mount(CardLiveStrip, {
      props: { node: online, nodeConfig, history, showCarriers: true },
    })
    const items = strip.findAll('.strip-carrier')
    expect(items.map((s) => s.find('.strip-carrier-name').text())).toEqual(['上海', '广州', '北京'])
    expect(strip.findAll('.strip-latency').map((s) => s.text())).toEqual(['60.5ms', '—', '33.3ms'])
    expect(items.map((s) => s.attributes('data-carrier'))).toEqual(['unicom', 'telecom', undefined])
    expect(items.map((s) => s.attributes('title'))).toEqual([
      '中国联通 · 上海 TCP 目标 · 探测成功',
      '中国电信 · 广州 TCP 目标 · 数据过期',
      '北京 TCP 目标 · 探测成功',
    ])
    expect(strip.text()).not.toContain('东京')
  })
  it('adds latency and loss segment bars for the shown probes', () => {
    const strip = mount(CardLiveStrip, {
      props: { node: online, nodeConfig, history, showCarriers: true },
    })
    const latency = strip.find('.strip-bar[data-kind="latency"]')
    expect(latency.find('.strip-bar-label').text()).toBe('延迟')
    expect(latency.find('.strip-bar-value').text()).toMatch(/ms$/)
    expect(latency.findAll('.strip-seg')).toHaveLength(10)
    const loss = strip.find('.strip-bar[data-kind="loss"]')
    expect(loss.find('.strip-bar-label').text()).toBe('丢包')
    expect(loss.findAll('.strip-seg')).toHaveLength(10)
    const off = mount(CardLiveStrip, { props: { node: online, nodeConfig, history, showCarriers: false } })
    expect(off.find('.strip-bar').exists()).toBe(false)
  })
  it('shows a single dash when the node has no Hub probes', () => {
    const strip = mount(CardLiveStrip, {
      props: { node: online, history: { ...history, probes: {}, ping: [] }, showCarriers: true },
    })
    expect(strip.find('.strip-carrier').exists()).toBe(false)
    expect(strip.find('.strip-empty').text()).toBe('—')
  })
  it('hides the carrier row when carriers are switched off', () => {
    const strip = mount(CardLiveStrip, {
      props: { node: online, nodeConfig, history, showCarriers: false },
    })
    expect(strip.find('.strip-speed').exists()).toBe(true)
    expect(strip.find('.strip-carriers').exists()).toBe(false)
  })
  it('shows dashes for offline rates', () => {
    const strip = mount(CardLiveStrip, { props: { node: offline, showCarriers: true } })
    expect(strip.find('.strip-speed').text()).not.toContain('/s')
  })
  it('shows dashes for every probe latency when the node is offline', () => {
    const strip = mount(CardLiveStrip, {
      props: { node: offline, nodeConfig, history, showCarriers: true },
    })
    expect(strip.findAll('.strip-latency').map((s) => s.text())).toEqual(['—', '—', '—'])
    expect(strip.findAll('.strip-carrier').every((s) => s.attributes('title')!.endsWith('节点离线'))).toBe(
      true,
    )
  })
  it('labels the latency row with a single ms unit', () => {
    const strip = mount(CardLiveStrip, {
      props: { node: online, nodeConfig, history, showCarriers: true },
    })
    // One unit per measured value; failed or stale probes show a bare dash.
    expect(strip.findAll('.strip-carriers .strip-unit').map((u) => u.text())).toEqual(['ms', 'ms'])
  })
})

describe('live card', () => {
  let intersect: (entries: { isIntersecting: boolean }[]) => void = () => {}
  beforeEach(() => {
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(callback: typeof intersect) {
          intersect = callback
        }
        observe() {}
        disconnect() {}
      },
    )
    setActivePinia(createPinia())
  })
  afterEach(() => vi.unstubAllGlobals())

  it('loads ping for a visible mapped node even when the carrier row is switched off', async () => {
    const store = useMonitorStore()
    store.config = {
      ...parseConfig({}),
      show_carriers: false,
      nodes: { '4': { carriers: { telecom: { taskId: 1 } } } },
    }
    const loadPing = vi.spyOn(store, 'loadPing').mockResolvedValue()
    const wrapper = mount(LiveCard, { props: { node: online }, global: { plugins: [router] } })
    intersect([{ isIntersecting: true }])
    await flushPromises()
    expect(loadPing).toHaveBeenCalledWith(4)
    expect(wrapper.find('.strip-carriers').exists()).toBe(false)
    wrapper.unmount()
  })

  it('loads ping for a visible node without carrier mapping so the strip can show Hub probes', async () => {
    const store = useMonitorStore()
    store.config = parseConfig({})
    const loadPing = vi.spyOn(store, 'loadPing').mockResolvedValue()
    const loadQuality = vi.spyOn(store, 'loadQuality').mockResolvedValue()
    const wrapper = mount(LiveCard, { props: { node: online }, global: { plugins: [router] } })
    expect(loadQuality).not.toHaveBeenCalled()
    intersect([{ isIntersecting: true }])
    await flushPromises()
    expect(loadPing).toHaveBeenCalledWith(4)
    expect(loadQuality).toHaveBeenCalledWith(4)
    wrapper.unmount()
  })

  // 30 ms on one probe with no loss scores 99.
  const scored = () => {
    const store = useMonitorStore()
    vi.spyOn(store.history, 'get').mockReturnValue(new Promise(() => {}))
    store.nodes = [online]
    store.quality = {
      '4': { metrics: [], ping: [{ task_id: 7, ts: 1000, latency: 30 }], probes: {}, loss: {}, step: 720 },
    }
  }
  it('names the link with status and overall score for screen readers', () => {
    scored()
    const wrapper = mount(LiveCard, { props: { node: online }, global: { plugins: [router] } })
    expect(wrapper.get('a').find('.sr-only').text()).toBe('查看 HK-01 详情，在线，综合 99')
    useMonitorStore().nodes = [offline]
    const off = mount(LiveCard, { props: { node: offline }, global: { plugins: [router] } })
    expect(off.get('a').find('.sr-only').text()).toBe('查看 HK-01 详情，离线，综合 无数据')
    wrapper.unmount()
    off.unmount()
  })

  it('wraps the card and strip in one detail link', () => {
    scored()
    const wrapper = mount(LiveCard, {
      props: { node: online },
      global: { plugins: [router] },
    })
    const links = wrapper.findAll('a')
    expect(links).toHaveLength(1)
    expect(links[0]!.attributes('href')).toBe('/node/4')
    expect(links[0]!.find('.sr-only').text()).toBe('查看 HK-01 详情，在线，综合 99')
    expect(links[0]!.find('.player-card').exists()).toBe(true)
    expect(links[0]!.find('.card-live-strip').exists()).toBe(true)
    // Only the visually hidden text names the link; the card text is hidden so it cannot contradict it.
    expect(links[0]!.find('.player-card').attributes('aria-hidden')).toBe('true')
    expect(links[0]!.find('.card-live-strip').attributes('aria-hidden')).toBe('true')
    wrapper.unmount()
  })
})
