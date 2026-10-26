import type { HistoryResponse, Me, Metrics, MonitorNode } from './types'

export function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}
export const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
export const nonnegative = (value: unknown): value is number => finite(value) && value >= 0
const str = (value: unknown, fallback = '') => (typeof value === 'string' ? value : fallback)
const num = (value: unknown, fallback = 0) => (nonnegative(value) ? value : fallback)
const nullable = (value: unknown) => (nonnegative(value) ? value : null)
const metricKeys = [
  'uptime',
  'cpu',
  'mem_total',
  'mem_used',
  'swap_total',
  'swap_used',
  'disk_total',
  'disk_used',
  'net_rx',
  'net_tx',
  'total_rx',
  'total_tx',
  'month_rx',
  'month_tx',
  'tcp',
  'udp',
  'procs',
] as const
function normalizeMetrics(value: unknown): Metrics | null {
  const m = record(value)
  if (
    !metricKeys.every((key) => nonnegative(m[key])) ||
    !Array.isArray(m.load) ||
    m.load.length !== 3 ||
    !m.load.every(nonnegative)
  )
    return null
  const result = Object.fromEntries(metricKeys.map((key) => [key, m[key]]))
  return { ...result, load: [...m.load] } as unknown as Metrics
}
export function normalizeNodes(value: unknown): MonitorNode[] {
  const data = record(value)
  if (!Array.isArray(data.nodes)) throw new Error('节点响应格式不正确')
  const seen = new Set<number>()
  return data.nodes.flatMap((item, index) => {
    const n = record(item)
    if (!Number.isSafeInteger(n.id) || Number(n.id) < 1 || seen.has(Number(n.id))) return []
    seen.add(Number(n.id))
    const node: MonitorNode = {
      id: Number(n.id),
      name: str(n.name, `节点 ${n.id}`),
      sort: num(n.sort, index),
      public: n.public === true,
      online: n.online === true,
      country: /^[A-Z]{2}$/.test(str(n.country)) ? str(n.country) : '',
      group: str(n.group),
      public_remark: str(n.public_remark),
      metrics: normalizeMetrics(n.metrics),
      last_seen: nullable(n.last_seen),
      os: str(n.os),
      kernel: str(n.kernel),
      arch: str(n.arch),
      virt: str(n.virt),
      cpu_name: str(n.cpu_name),
      cpu_cores: num(n.cpu_cores),
      mem_total: num(n.mem_total),
      swap_total: num(n.swap_total),
      disk_total: num(n.disk_total),
      agent_version: str(n.agent_version),
      price: nullable(n.price),
      currency: str(n.currency, 'CNY'),
      billing_cycle: str(n.billing_cycle),
      expires_at:
        typeof n.expires_at === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(n.expires_at) ? n.expires_at : null,
      traffic_limit: num(n.traffic_limit),
      traffic_mode: str(n.traffic_mode, 'sum'),
      traffic_reset_day: num(n.traffic_reset_day, 1),
      total_rx: num(n.total_rx),
      total_tx: num(n.total_tx),
      month_rx: num(n.month_rx),
      month_tx: num(n.month_tx),
      month_start: str(n.month_start),
      day_rx: num(n.day_rx),
      day_tx: num(n.day_tx),
    }
    if ('expires_in' in n) node.expires_in = finite(n.expires_in) ? Math.trunc(n.expires_in) : null
    if ('last_seen_ago' in n) node.last_seen_ago = nullable(n.last_seen_ago)
    if (nonnegative(n.month_used)) node.month_used = n.month_used
    return [node]
  })
}
export function normalizeMe(value: unknown): Me {
  const m = record(value)
  return {
    authed: m.authed === true,
    site_name: str(m.site_name, 'Monitor'),
    public_page: m.public_page === true,
    github: m.github === true,
    history_days: finite(m.history_days) ? Math.min(365, Math.max(1, Math.trunc(m.history_days))) : 7,
  }
}
// Hub's [min, max] latency inside a bucket.
const band = (v: unknown): v is [number, number] =>
  Array.isArray(v) && v.length === 2 && nonnegative(v[0]) && nonnegative(v[1]) && v[0] <= v[1]
export function normalizeHistory(value: unknown): HistoryResponse {
  const h = record(value)
  if (!Array.isArray(h.metrics) && !Array.isArray(h.ping)) throw new Error('历史数据格式不正确')
  const metrics = (Array.isArray(h.metrics) ? h.metrics : [])
    .flatMap((item) => {
      const m = record(item)
      if (!nonnegative(m.ts)) return []
      return [
        {
          ts: m.ts,
          cpu: nullable(m.cpu),
          mem_used: nullable(m.mem_used),
          disk_used: nullable(m.disk_used),
          net_rx: nullable(m.net_rx),
          net_tx: nullable(m.net_tx),
          ...(nonnegative(m.minutes) ? { minutes: m.minutes } : {}),
        },
      ]
    })
    .sort((a, b) => a.ts - b.ts)
  const ping = (Array.isArray(h.ping) ? h.ping : []).flatMap((item) => {
    const p = record(item)
    if (!nonnegative(p.ts) || !Number.isSafeInteger(p.task_id) || Number(p.task_id) < 1) return []
    return [
      {
        task_id: Number(p.task_id),
        ts: p.ts,
        latency: nullable(p.latency),
        ...(nonnegative(p.loss) ? { loss: Math.min(100, p.loss) } : {}),
        ...(band(p.band) ? { band: p.band } : {}),
      },
    ]
  })
  const probeOrder = [...new Set(ping.map((p) => p.task_id))]
  ping.sort((a, b) => probeOrder.indexOf(a.task_id) - probeOrder.indexOf(b.task_id) || a.ts - b.ts)
  const probes = Object.fromEntries(
    Object.entries(record(h.probes)).filter(([id, name]) => /^\d+$/.test(id) && typeof name === 'string'),
  ) as Record<string, string>
  const loss = Object.fromEntries(
    Object.entries(record(h.loss)).filter(([id, v]) => /^\d+$/.test(id) && nonnegative(v)),
  ) as Record<string, number>
  return { metrics, ping, probes, loss, step: nonnegative(h.step) && h.step >= 60 ? h.step : 60 }
}
