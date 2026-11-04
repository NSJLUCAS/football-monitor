import { describe, expect, it } from 'vitest'
import { parseConfig } from '../src/domain/config'
import { normalizeNodes } from '../src/domain/normalize'
import {
  countryCard,
  countryMarkers,
  diffEvents,
  eventBadge,
  issueList,
  issueText,
  metricChanges,
  nodeAlerts,
  nodeCard,
  nodeStatus,
  pastLoss,
  recentLoss,
  shouldReload,
  snapshot,
  statusCounts,
  tourStops,
  type NodeAlert,
} from '../src/domain/ops'
import type { HistoryResponse, MonitorNode, PingPoint } from '../src/domain/types'

const NOW = 1_800_000_000
const node = (id: number, patch: Record<string, unknown> = {}, metrics: Record<string, unknown> = {}) =>
  normalizeNodes({
    nodes: [
      {
        id,
        name: `节点 ${id}`,
        online: true,
        metrics: {
          uptime: 0,
          cpu: 10,
          load: [0, 0, 0],
          mem_used: 1,
          mem_total: 10,
          swap_used: 0,
          swap_total: 0,
          disk_used: 1,
          disk_total: 10,
          net_rx: 0,
          net_tx: 0,
          total_rx: 0,
          total_tx: 0,
          month_rx: 0,
          month_tx: 0,
          tcp: 0,
          udp: 0,
          procs: 0,
          ...metrics,
        },
        ...patch,
      },
    ],
  })[0]!
const ping = (task_id: number, ts: number, latency: number | null, loss?: number): PingPoint =>
  loss === undefined ? { task_id, ts, latency } : { task_id, ts, latency, loss }
const hist = (ping: PingPoint[]): HistoryResponse => ({
  metrics: [],
  ping,
  probes: Object.fromEntries([...new Set(ping.map((p) => p.task_id))].map((id) => [id, `任务 ${id}`])),
  loss: {},
  step: 720,
})
const config = parseConfig({ show_billing: true })
const kinds = (alerts: NodeAlert[]) => alerts.map((a) => a.kind)
const clock = (ts: number) => new Date(ts * 1000).toTimeString().slice(0, 8)

describe('nodeAlerts', () => {
  it('reports nothing for a healthy node', () => {
    expect(nodeAlerts(node(1), undefined, config, NOW)).toEqual([])
  })
  it('reports only the outage for an offline node', () => {
    const n = node(1, { online: false, last_seen: NOW - 600, expires_in: 0 }, { cpu: 99 })
    expect(nodeAlerts(n, undefined, config, NOW)).toEqual([{ kind: 'offline', since: NOW - 600 }])
  })
  it('flags loss from 3% over the last hour, naming the worst line', () => {
    const history = hist([
      ping(1, NOW - 4000, null),
      ping(1, NOW - 600, 40, 2),
      ping(2, NOW - 600, 50, 3),
      ping(2, NOW - 300, 50, 3),
    ])
    expect(nodeAlerts(node(1), history, config, NOW)).toEqual([
      { kind: 'loss', taskId: 2, name: '任务 2', loss: 3 },
    ])
    // The failure an hour and more ago no longer counts.
    expect(recentLoss(history, NOW)).toEqual([
      { taskId: 1, name: '任务 1', loss: 2 },
      { taskId: 2, name: '任务 2', loss: 3 },
    ])
    expect(nodeAlerts(node(1), hist([ping(1, NOW - 60, 40, 2.9)]), config, NOW)).toEqual([])
  })
  it('counts a failed probe as fully lost and an omitted loss as none', () => {
    expect(recentLoss(hist([ping(1, NOW - 60, null), ping(1, NOW - 30, 40)]), NOW)[0]!.loss).toBe(50)
  })
  it('flags the highest resource from 90%', () => {
    expect(
      nodeAlerts(node(1, {}, { cpu: 89.9, mem_used: 9, disk_used: 9.5 }), undefined, config, NOW),
    ).toEqual([{ kind: 'resource', key: 'disk', percent: 95 }])
    expect(nodeAlerts(node(1, {}, { cpu: 90 }), undefined, config, NOW)).toEqual([
      { kind: 'resource', key: 'cpu', percent: 90 },
    ])
  })
  it('flags expiry within three days, expired included, only while billing is shown', () => {
    const soon = node(1, { expires_at: '2027-01-03', expires_in: 3 })
    expect(nodeAlerts(soon, undefined, config, NOW)).toEqual([
      { kind: 'expiry', days: 3, date: '2027-01-03' },
    ])
    expect(kinds(nodeAlerts(node(1, { expires_at: 'x', expires_in: -2 }), undefined, config, NOW))).toEqual([
      'expiry',
    ])
    expect(nodeAlerts(node(1, { expires_at: 'x', expires_in: 4 }), undefined, config, NOW)).toEqual([])
    expect(nodeAlerts(soon, undefined, parseConfig({ show_billing: false }), NOW)).toEqual([])
  })
  it('lists several alerts from the most severe', () => {
    const n = node(1, { expires_at: 'x', expires_in: 1 }, { cpu: 95 })
    expect(kinds(nodeAlerts(n, hist([ping(1, NOW - 60, null)]), config, NOW))).toEqual([
      'loss',
      'resource',
      'expiry',
    ])
  })
})

const alertsOf = (list: MonitorNode[], history: Record<number, HistoryResponse> = {}) =>
  Object.fromEntries(list.map((n) => [n.id, nodeAlerts(n, history[n.id], config, NOW)]))

describe('nodeStatus and statusCounts', () => {
  it('sorts nodes into normal, attention and offline', () => {
    const list = [node(1), node(2, {}, { cpu: 95 }), node(3, { online: false }), node(4)]
    const alerts = alertsOf(list)
    expect(list.map((n) => nodeStatus(n, alerts[n.id]!))).toEqual(['ok', 'warn', 'off', 'ok'])
    expect(statusCounts(list, alerts)).toEqual({ ok: 2, warn: 1, off: 1 })
  })
})

describe('countryMarkers', () => {
  const at = { HK: [114.1, 22.4], JP: [137.9, 36.6] } as Record<string, [number, number]>
  it('gathers nodes by country with their status mix, largest first', () => {
    const list = [
      node(1, { country: 'JP' }),
      node(2, { country: 'HK' }, { cpu: 95 }),
      node(3, { country: 'HK', online: false }),
      node(4, { country: 'HK' }),
    ]
    expect(countryMarkers(list, alertsOf(list), at)).toEqual({
      markers: [
        { code: 'HK', at: [114.1, 22.4], total: 3, ok: 1, warn: 1, off: 1, ids: [2, 3, 4] },
        { code: 'JP', at: [137.9, 36.6], total: 1, ok: 1, warn: 0, off: 0, ids: [1] },
      ],
      unplaced: 0,
    })
  })
  it('counts nodes whose country has no known place', () => {
    const list = [node(1, { country: '' }), node(2, { country: 'XK' }), node(3, { country: 'JP' })]
    expect(countryMarkers(list, alertsOf(list), at).unplaced).toBe(2)
  })
})

describe('issueList and issueText', () => {
  it('lists every alert, offline first, then by severity and Hub order', () => {
    const list = [
      node(1, {}, { cpu: 95 }),
      node(2, { online: false, last_seen: NOW - 23 * 3600 }),
      node(3, { expires_at: '2027-01-01', expires_in: 2 }, { disk_used: 9.19 }),
    ]
    const issues = issueList(list, alertsOf(list))
    expect(issues.map((i) => [i.node.id, i.alert.kind])).toEqual([
      [2, 'offline'],
      [1, 'resource'],
      [3, 'resource'],
      [3, 'expiry'],
    ])
    expect(issues.map((i) => issueText(i.alert, NOW))).toEqual([
      { label: '离线', value: '23 小时', tone: 'bad' },
      { label: 'CPU', value: '95%', tone: 'warn' },
      { label: '硬盘', value: '91.9%', tone: 'warn' },
      { label: '到期', value: '2 天后', tone: 'warn' },
    ])
  })
  it('words loss, expired and short outages', () => {
    expect(issueText({ kind: 'loss', taskId: 1, name: '上海', loss: 6 }, NOW)).toEqual({
      label: '丢包',
      value: '6.0%',
      tone: 'bad',
    })
    expect(issueText({ kind: 'expiry', days: -3, date: null }, NOW).value).toBe('已过期 3 天')
    expect(issueText({ kind: 'expiry', days: 0, date: null }, NOW).value).toBe('今天')
    expect(issueText({ kind: 'offline', since: NOW - 600 }, NOW).value).toBe('10 分钟')
    expect(issueText({ kind: 'offline', since: null }, NOW).value).toBe('时长未知')
  })
})

describe('countryCard', () => {
  it('lists a country’s nodes, offline first, then attention, then normal', () => {
    const list = [
      node(1, { country: 'HK' }),
      node(2, { country: 'HK' }, { cpu: 95 }),
      node(3, { country: 'HK', online: false, last_seen: NOW - 7200 }),
      node(4, { country: 'JP' }),
    ]
    expect(countryCard('HK', list, alertsOf(list), NOW)).toEqual({
      code: 'HK',
      total: 3,
      ok: 1,
      warn: 1,
      off: 1,
      rows: [
        { id: 3, name: '节点 3', status: 'off', issue: '离线 2 小时' },
        { id: 2, name: '节点 2', status: 'warn', issue: 'CPU 95%' },
        { id: 1, name: '节点 1', status: 'ok', issue: '正常' },
      ],
    })
  })
})

describe('nodeCard', () => {
  const probes = hist([
    ping(1, NOW - 120, 33),
    ping(2, NOW - 120, 126),
    ping(3, NOW - 120, 222),
    ping(4, NOW - 120, 500),
  ])
  probes.probes = { '1': '国内三网入口', '2': '海外主站入口', '3': '边缘回源链路', '4': '第四条' }
  it('gives the figures, the first three probes and how long the trouble has lasted', () => {
    const n = node(1, { country: 'HK' }, { cpu: 95, net_tx: 2048, net_rx: 4096 })
    const card = nodeCard(n, alertsOf([n])[1]!, probes, undefined, NOW, NOW - 125, 2)
    expect(card.kicker).toBe(`异常已持续 2 分钟 · ${clock(NOW - 125)}`)
    expect(card.state).toBe('ONLINE')
    expect(card.tags).toEqual([{ label: 'CPU', value: '95%', tone: 'warn' }])
    expect(card.metrics).toEqual([
      { label: 'CPU', value: '95', unit: '%' },
      { label: '内存', value: '10', unit: '%' },
      { label: '上行', value: '2', unit: 'KB/s' },
      { label: '下行', value: '4', unit: 'KB/s' },
    ])
    expect(card.probes).toEqual([
      { name: '国内三网入口', ms: 33, width: 8.25, level: 'good' },
      { name: '海外主站入口', ms: 126, width: 31.5, level: 'good' },
      { name: '边缘回源链路', ms: 222, width: 55.5, level: 'slow' },
    ])
    expect(card.siblings).toBe(2)
  })
  it('says when trouble began before the page opened, and words normal and offline nodes', () => {
    const busy = node(1, {}, { cpu: 95 })
    expect(nodeCard(busy, alertsOf([busy])[1]!, undefined, undefined, NOW, null, 1).kicker).toBe(
      '异常 · 打开页面前已发生',
    )
    const calm = node(2, {}, { uptime: 86400 * 12 })
    expect(nodeCard(calm, [], undefined, undefined, NOW, null, 1).kicker).toBe('运行正常 · 已运行 12 天')
    const down = node(3, { online: false, last_seen: NOW - 3 * 3600 })
    const card = nodeCard(down, alertsOf([down])[3]!, probes, undefined, NOW, null, 1)
    expect(card.kicker).toBe(`离线已持续 3 小时 · ${clock(NOW - 3 * 3600)}`)
    expect(card.state).toBe('OFFLINE')
    expect(card.metrics.map((m) => m.value)).toEqual(['—', '—', '—', '—'])
    expect(card.probes.map((p) => p.ms)).toEqual([null, null, null])
  })
})

describe('pastLoss', () => {
  it('turns each run of lossy probe points in the last hour into one change, at its start', () => {
    const history = hist([
      ping(1, NOW - 4000, null),
      ping(1, NOW - 1800, 40, 4.2),
      ping(1, NOW - 1740, 40, 6),
      ping(1, NOW - 1680, 40, 0),
      ping(2, NOW - 600, 50, 3),
      ping(2, NOW - 540, 50, 2.9),
    ])
    const n = node(7, { name: '洛杉矶 9929' })
    expect(pastLoss([n], { 7: history }, NOW)).toEqual([
      {
        key: 'loss:7:2:1799999400',
        at: NOW - 600,
        nodeId: 7,
        tag: '丢包',
        tone: 'bad',
        text: '洛杉矶 9929 · 3.0%',
      },
      {
        key: 'loss:7:1:1799998200',
        at: NOW - 1800,
        nodeId: 7,
        tag: '丢包',
        tone: 'bad',
        text: '洛杉矶 9929 · 6.0%',
      },
    ])
  })
  it('skips nodes without probes', () => {
    expect(pastLoss([node(1)], {}, NOW)).toEqual([])
  })
})

describe('metricChanges', () => {
  const MB = 1024 * 1024
  it('notes a CPU climbing past 80%', () => {
    const before = [node(1, { name: '阿姆斯特丹 01' }, { cpu: 70 })],
      after = [node(1, { name: '阿姆斯特丹 01' }, { cpu: 80.6 })]
    expect(metricChanges(before, after, {}, NOW)).toEqual([
      { key: `cpu:1:${NOW}`, at: NOW, nodeId: 1, tag: 'CPU', tone: 'warn', text: '阿姆斯特丹 01 · 80.6%' },
    ])
    expect(metricChanges(after, after, {}, NOW)).toEqual([])
    expect(metricChanges(null, after, {}, NOW)).toEqual([])
  })
  it('notes traffic jumping to three times its recent level', () => {
    const quiet = Array.from({ length: 10 }, () => 2 * MB)
    const busy = [node(1, { name: '香港 备用' }, { net_rx: 5 * MB, net_tx: 2 * MB })]
    expect(metricChanges(busy, busy, { 1: quiet }, NOW)).toEqual([
      {
        key: `surge:1:${NOW}`,
        at: NOW,
        nodeId: 1,
        tag: '带宽突增',
        tone: 'neutral',
        text: '香港 备用 · 7 MB/s',
      },
    ])
    // Too little history, too small a jump, or too little traffic to matter: nothing.
    expect(metricChanges(busy, busy, { 1: quiet.slice(0, 4) }, NOW)).toEqual([])
    const steady = [node(1, {}, { net_rx: 4 * MB, net_tx: 1 * MB })]
    expect(metricChanges(steady, steady, { 1: quiet }, NOW)).toEqual([])
    const tiny = [node(1, {}, { net_rx: 300 * 1024, net_tx: 0 })]
    expect(metricChanges(tiny, tiny, { 1: Array(10).fill(10 * 1024) }, NOW)).toEqual([])
  })
})

describe('tourStops', () => {
  it('visits each troubled node once, in issue order, where it can be placed', () => {
    const at = { HK: [114.1, 22.4], JP: [137.9, 36.6] } as Record<string, [number, number]>
    const list = [
      node(1, { country: 'JP', expires_at: 'x', expires_in: 1 }, { cpu: 95 }),
      node(2, { country: 'HK', online: false }),
      node(3, { country: '', online: false }),
      node(4, { country: 'HK' }),
    ]
    const stops = tourStops(issueList(list, alertsOf(list)), at)
    expect(stops.map((s) => [s.node.id, s.at])).toEqual([
      [2, [114.1, 22.4]],
      [1, [137.9, 36.6]],
    ])
    expect(stops[1]!.alerts.map((a) => a.kind)).toEqual(['resource', 'expiry'])
  })
})

describe('diffEvents', () => {
  const take = (list: MonitorNode[]) =>
    snapshot(list, Object.fromEntries(list.map((n) => [n.id, nodeAlerts(n, undefined, config, NOW)])))
  it('takes the first snapshot as the baseline', () => {
    expect(diffEvents(null, take([node(1, { online: false })]))).toEqual([])
  })
  it('reports nodes going down and coming back', () => {
    const up = take([node(1), node(2, { online: false })]),
      down = take([node(1, { online: false }), node(2)])
    expect(diffEvents(up, down)).toEqual([
      { kind: 'offline', nodeId: 1, name: '节点 1' },
      { kind: 'online', nodeId: 2, name: '节点 2' },
    ])
  })
  it('reports alerts raised and cleared, not changes of their figures', () => {
    const calm = take([node(1)]),
      hot = take([node(1, {}, { cpu: 95 })]),
      hotter = take([node(1, {}, { cpu: 99 })])
    const busy = { kind: 'resource', key: 'cpu', percent: 95 }
    expect(diffEvents(calm, hot)).toEqual([
      { kind: 'alert', nodeId: 1, name: '节点 1', alert: 'resource', detail: busy },
    ])
    expect(diffEvents(hot, hotter)).toEqual([])
    // A cleared alert carries the last figure it had.
    expect(diffEvents(hotter, calm)).toEqual([
      { kind: 'clear', nodeId: 1, name: '节点 1', alert: 'resource', detail: { ...busy, percent: 99 } },
    ])
  })
  it('ignores nodes added or removed between snapshots', () => {
    expect(diffEvents(take([node(1)]), take([node(1), node(2, { online: false })]))).toEqual([])
  })
})

describe('eventBadge and shouldReload', () => {
  it('gives each change a tag and a line', () => {
    expect(eventBadge({ kind: 'offline', nodeId: 1, name: '东京' }, NOW)).toEqual({
      tag: '离线',
      tone: 'bad',
      text: '东京',
    })
    expect(eventBadge({ kind: 'online', nodeId: 1, name: '东京' }, NOW)).toEqual({
      tag: '上线',
      tone: 'good',
      text: '东京',
    })
    const loss = { kind: 'loss', taskId: 1, name: '上海', loss: 3.2 } as const
    expect(eventBadge({ kind: 'alert', nodeId: 1, name: '伦敦', alert: 'loss', detail: loss }, NOW)).toEqual({
      tag: '丢包',
      tone: 'bad',
      text: '伦敦 · 3.2%',
    })
    expect(eventBadge({ kind: 'clear', nodeId: 1, name: '伦敦', alert: 'loss', detail: loss }, NOW)).toEqual({
      tag: '恢复',
      tone: 'good',
      text: '伦敦 · 丢包恢复',
    })
    const disk = { kind: 'resource', key: 'disk', percent: 91.9 } as const
    expect(
      eventBadge({ kind: 'alert', nodeId: 2, name: '法兰克福', alert: 'resource', detail: disk }, NOW),
    ).toEqual({
      tag: '硬盘',
      tone: 'warn',
      text: '法兰克福 · 91.9%',
    })
  })
  it('reloads at 04:00 only after an hour open', () => {
    const at = (h: number, m: number) => new Date(2026, 10, 5, h, m)
    const opened = at(2, 30).getTime()
    expect(shouldReload(opened, at(4, 0))).toBe(true)
    expect(shouldReload(opened, at(4, 1))).toBe(false)
    expect(shouldReload(at(3, 30).getTime(), at(4, 0))).toBe(false)
  })
})
