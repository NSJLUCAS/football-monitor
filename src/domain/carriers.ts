import type { CarrierConfig, CarrierId, HistoryResponse, NodeConfig } from './types'
export const carriers: { id: CarrierId; name: string; short: string; color: string }[] = [
  { id: 'telecom', name: '中国电信', short: '电信', color: '#54b8ff' },
  { id: 'unicom', name: '中国联通', short: '联通', color: '#fb7185' },
  { id: 'mobile', name: '中国移动', short: '移动', color: '#9ad969' },
]
export const lines = [
  'CN2 GIA',
  'CN2 GT',
  '163',
  '9929',
  '4837',
  'CMI',
  'CMIN2',
  '普通线路',
  '未知',
  '自定义',
]
export type CarrierStatus = 'unconfigured' | 'success' | 'failed' | 'stale' | 'unavailable'
export const statusText: Record<CarrierStatus, string> = {
  unconfigured: '未配置探测',
  success: '探测成功',
  failed: '探测失败',
  stale: '数据过期',
  unavailable: '数据暂不可用',
}
/** Status and current latency of one Hub ping task for a node. */
export function resolveTask(
  taskId: number | undefined,
  history?: HistoryResponse,
  now = Date.now() / 1000,
  unavailable = false,
) {
  let status: CarrierStatus = 'unconfigured'
  let latency: number | null = null
  if (taskId) {
    const point = history?.ping.filter((p) => p.task_id === taskId).at(-1)
    status =
      unavailable || !history || !point
        ? 'unavailable'
        : now - point.ts > Math.max(300, history.step * 3)
          ? 'stale'
          : point.latency === null
            ? 'failed'
            : 'success'
    if (status === 'success') latency = point!.latency
  }
  return { status, latency }
}
export function resolveCarrier(
  config: CarrierConfig = {},
  history?: HistoryResponse,
  now = Date.now() / 1000,
  unavailable = false,
) {
  const { status, latency } = resolveTask(config.taskId, history, now, unavailable)
  return { status, latency, line: config.line || '未知', taskId: config.taskId, label: statusText[status] }
}
const NAMED: [RegExp, CarrierId][] = [
  [/电信|telecom/i, 'telecom'],
  [/联通|unicom/i, 'unicom'],
  [/移动|mobile/i, 'mobile'],
]
/** The carrier a Hub probe is named after (“广东移动”, “上海电信 TCP”), if any. */
export const carrierFromName = (name?: string): CarrierId | undefined =>
  NAMED.find(([pattern]) => pattern.test(name ?? ''))?.[1]
/** Region shown on the card strip: the first word of the Hub probe name. */
export const probeRegion = (name?: string) => name?.trim().split(/\s+/)[0] ?? ''
const HIDDEN_LINES = new Set(['未知', '普通线路'])
/** Card “skills”: named lines the site owner set per carrier, in carrier order, each shown once. */
export function lineSkills(config?: NodeConfig) {
  const seen = new Set<string>()
  return carriers.flatMap((c) => {
    const line = config?.carriers?.[c.id]?.line?.trim() ?? ''
    if (!line || HIDDEN_LINES.has(line) || seen.has(line)) return []
    seen.add(line)
    return [{ carrier: c.id, line, color: c.color, name: c.name }]
  })
}
const SEGMENTS = 10
const mean = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null)
/** Ten time segments of latency (ms) and loss (%) over the shown probes, plus current and window figures. */
export function probeBars(history: HistoryResponse | undefined, taskIds: number[], now = Date.now() / 1000) {
  const points = history?.ping.filter((p) => taskIds.includes(p.task_id)) ?? [],
    latency: (number | null)[] = Array(SEGMENTS).fill(null),
    loss: (number | null)[] = Array(SEGMENTS).fill(null)
  if (points.length) {
    const start = Math.min(...points.map((p) => p.ts)),
      width = (Math.max(...points.map((p) => p.ts)) - start) / SEGMENTS || 1
    const buckets = Array.from({ length: SEGMENTS }, () => [] as typeof points)
    for (const p of points) buckets[Math.min(SEGMENTS - 1, Math.floor((p.ts - start) / width))]!.push(p)
    buckets.forEach((bucket, i) => {
      latency[i] = mean(bucket.flatMap((p) => (p.latency === null ? [] : [p.latency])))
      // Hub omits `loss` when it is 0; a failed probe counts as fully lost.
      loss[i] = mean(bucket.map((p) => p.loss ?? (p.latency === null ? 100 : 0)))
    })
  }
  const current = taskIds.flatMap((id) => {
    const r = resolveTask(id, history, now)
    return r.status === 'success' && r.latency !== null ? [r.latency] : []
  })
  const windowLosses = taskIds.flatMap((id) => {
    const value = history?.loss[String(id)]
    return value === undefined ? [] : [value]
  })
  return {
    latency,
    loss,
    currentLatency: mean(current),
    windowLoss: mean(windowLosses) ?? mean(loss.filter((v): v is number => v !== null)),
  }
}
const EMPTY_SEGMENT = 'var(--strip-empty-seg)'
const GRADES = ['#4ade80', '#a3e635', '#facc15', '#fb923c', '#f87171']
export const latencyColor = (ms: number | null) =>
  ms === null ? EMPTY_SEGMENT : GRADES[[60, 120, 200, 300].filter((limit) => ms > limit).length]!
export const lossColor = (percent: number | null) =>
  percent === null
    ? EMPTY_SEGMENT
    : GRADES[percent <= 0 ? 0 : percent < 1 ? 1 : percent < 3 ? 2 : percent < 10 ? 3 : 4]!
