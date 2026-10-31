import { describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import NodePanel from '../src/components/NodePanel.vue'
import { carriers } from '../src/domain/carriers'
import { normalizeNodes } from '../src/domain/normalize'
import type { HistoryResponse, MonitorNode } from '../src/domain/types'

const GB = 1024 ** 3
const online = normalizeNodes({
  nodes: [
    {
      id: 4,
      name: 'HK-01',
      country: 'HK',
      online: true,
      os: 'Debian 12',
      public_remark: '香港 · CN2 GIA',
      price: 30,
      currency: 'CNY',
      billing_cycle: 'monthly',
      expires_at: '2026-11-15',
      expires_in: 15,
      traffic_limit: 1024 * GB,
      month_used: 768 * GB,
      total_rx: 3 * 1024 * GB,
      total_tx: 2 * 1024 * GB,
      metrics: {
        uptime: 30 * 86400 + 3600,
        cpu: 40.9,
        load: [0.82, 0.68, 0.5],
        mem_total: 6 * GB,
        mem_used: 2.9 * GB,
        swap_total: 0,
        swap_used: 0,
        disk_total: 100 * GB,
        disk_used: 90 * GB,
        net_rx: 1.5 * 1024 ** 2,
        net_tx: 1.3 * 1024 ** 2,
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
const offline: MonitorNode = { ...online, online: false, metrics: null, last_seen_ago: 2 * 86400 }
const now = Date.now() / 1000
const history: HistoryResponse = {
  metrics: [],
  ping: [
    { task_id: 1, ts: now - 600, latency: 70 },
    { task_id: 1, ts: now - 30, latency: 65 },
    { task_id: 2, ts: now - 600, latency: 90, loss: 10 },
    { task_id: 2, ts: now - 30, latency: 85 },
    { task_id: 3, ts: now - 30, latency: 111 },
    { task_id: 9, ts: now - 30, latency: 5 },
  ],
  probes: { '1': '上海电信', '2': '上海联通', '3': '上海移动', '9': '东京' },
  loss: { '2': 8.2 },
  step: 60,
}
const panel = (props: Record<string, unknown> = {}) =>
  mount(NodePanel, {
    props: {
      node: online,
      history,
      showCarriers: true,
      showTraffic: true,
      showBilling: true,
      ...props,
    },
  })

describe('node panel', () => {
  it('heads with status, name, system and flag, then uptime, price and remark tags', () => {
    const wrapper = panel()
    expect(wrapper.find('.np-dot').attributes('data-online')).toBe('true')
    expect(wrapper.find('.np-name').text()).toBe('HK-01')
    expect(wrapper.find('.np-os title').text()).toBe('Debian')
    expect(wrapper.find('.np-flag').exists()).toBe(true)
    expect(wrapper.findAll('.np-tag').map((t) => t.text())).toEqual([
      '在线 30 天',
      '¥30.00 / 月',
      '香港 · CN2 GIA',
    ])
  })
  it('shows CPU, memory, disk and traffic with bars graded like the card', () => {
    const meters = panel().findAll('.np-meter')
    expect(meters.map((m) => m.find('.np-meter-top span').text())).toEqual(['CPU', '内存', '硬盘', '流量'])
    expect(meters.map((m) => m.find('.np-meter-top b').text())).toEqual(['40.9%', '48.3%', '90.0%', '75.0%'])
    expect(meters.map((m) => m.find('.np-bar i').attributes('data-grade'))).toEqual([
      'good',
      'good',
      'bad',
      'ok',
    ])
    expect(meters.map((m) => m.find('.np-detail').text())).toEqual([
      '0.82, 0.68, 0.50',
      '2.9 GB / 6 GB',
      '90 GB / 100 GB',
      '768 GB / 1 TB',
    ])
  })
  it('shows used traffic without a bar when the allowance is unlimited', () => {
    const traffic = panel({ node: { ...online, traffic_limit: 0 } }).find('.np-meter[data-key="traffic"]')
    expect(traffic.find('.np-meter-top b').text()).toBe('768 GB')
    expect(traffic.find('.np-bar i').exists()).toBe(false)
    expect(traffic.find('.np-detail').text()).toBe('本周期 · 不限量')
  })
  it('shows rates, lifetime traffic and what is left of the billing period', () => {
    const boxes = panel().findAll('.np-box')
    expect(boxes.map((b) => b.text().replace(/\s+/g, ''))).toEqual([
      '↓1.5MB/s↑1.3MB/s',
      '⇡2TB⇣3TB',
      '剩余15天¥14.78',
      '今日流量0B',
    ])
  })
  it("shows today's traffic in the last box with the split on hover, offline nodes included", () => {
    const today = { ...online, day_rx: 8 * GB, day_tx: 2 * GB }
    for (const node of [today, { ...today, online: false, metrics: null }]) {
      const box = panel({ node }).findAll('.np-box').at(-1)!
      expect(box.classes()).toContain('np-today')
      expect(box.find('.np-box-label').text()).toBe('今日流量')
      expect(box.find('b').text()).toBe('10 GB')
      expect(box.attributes('title')).toBe('今日下行 8 GB · 今日上行 2 GB')
    }
  })
  it('leaves traffic and billing boxes out when they are hidden', () => {
    const wrapper = panel({ showTraffic: false, showBilling: false })
    expect(wrapper.findAll('.np-box')).toHaveLength(1)
    expect(wrapper.findAll('.np-tag').map((t) => t.text())).toEqual(['在线 30 天', '香港 · CN2 GIA'])
  })
  it('gives each of the first three probes its own latency, loss and segment bars', () => {
    const rows = panel().findAll('.np-probe')
    expect(rows.map((r) => r.find('.np-probe-name').text())).toEqual(['电信', '联通', '移动'])
    expect(rows.map((r) => r.find('.np-probe-name img').attributes('src'))).toEqual(
      carriers.map((c) => c.logo),
    )
    expect(rows.map((r) => r.findAll('.np-probe-value').map((v) => v.text()))).toEqual([
      ['65ms', '0.0%'],
      ['85ms', '8.2%'],
      ['111ms', '0.0%'],
    ])
    for (const row of rows) expect(row.findAll('.np-segs i')).toHaveLength(20)
    expect(panel({ showCarriers: false }).find('.np-probes').exists()).toBe(false)
    expect(
      panel({ history: { ...history, probes: {} } })
        .find('.np-empty')
        .text(),
    ).toBe('暂无探测任务')
  })
  it('shows dashes for live readings of an offline node and how long it has been away', () => {
    const wrapper = panel({ node: offline })
    expect(wrapper.find('.np-dot').attributes('data-online')).toBe('false')
    expect(wrapper.findAll('.np-tag')[0]!.text()).toBe('离线 2 天 0 小时')
    expect(wrapper.findAll('.np-meter-top b').map((b) => b.text())).toEqual(['—', '—', '—', '75.0%'])
    expect(wrapper.find('.np-box').text().replace(/\s+/g, '')).toBe('↓—↑—')
    expect(wrapper.findAll('.np-probe .np-probe-value')[0]!.text()).toBe('—')
  })
  it('shows dashes for loss when the probes could not be loaded', () => {
    const rows = panel({ unavailable: true }).findAll('.np-probe')
    expect(rows.map((r) => r.findAll('.np-probe-value')[1]!.text())).toEqual(['—', '—', '—'])
  })
  it('sweeps three empty rows while the probes load, then fills them in once, on first arrival', async () => {
    const wrapper = panel({ history: undefined })
    const probes = () => wrapper.find('.np-probes')
    expect(probes().attributes('data-state')).toBe('loading')
    expect(wrapper.find('.np-empty').exists()).toBe(false)
    const rows = wrapper.findAll('.np-probe')
    expect(rows).toHaveLength(3)
    expect(rows[0]!.attributes('title')).toBe('正在加载探测数据')
    expect(rows[0]!.findAll('.np-segs i')[4]!.attributes('style')).toContain('--i: 4')
    await wrapper.setProps({ history })
    expect(probes().attributes('data-state')).toBe('fill')
    expect(wrapper.findAll('.np-probe-name').map((n) => n.text())).toEqual(['电信', '联通', '移动'])
    await wrapper.setProps({ history: { ...history } })
    await nextTick()
    expect(probes().attributes('data-state')).toBe('fill')
  })
  it('neither sweeps nor fills when the probes were already loaded or failed to load', () => {
    expect(panel().find('.np-probes').attributes('data-state')).toBeUndefined()
    const failed = panel({ history: undefined, unavailable: true })
    expect(failed.find('.np-probes').attributes('data-state')).toBeUndefined()
    expect(failed.find('.np-empty').text()).toBe('暂无探测任务')
  })
})
