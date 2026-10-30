import { taskLoss } from './carriers'
import { trafficUsed } from './format'
import type { HistoryResponse, MonitorNode } from './types'

export type StatKey = 'cpu' | 'mem' | 'dsk' | 'net' | 'upt' | 'png'
export const STAT_KEYS: StatKey[] = ['cpu', 'mem', 'dsk', 'net', 'upt', 'png']
export const STAT_LABELS: Record<StatKey, string> = {
  cpu: 'CPU',
  mem: '内存',
  dsk: '硬盘',
  net: '流量',
  upt: '在线',
  png: '延迟',
}
export type Tier = 'bronze' | 'silver' | 'gold'

export type NetKey = 'latency' | 'jitter' | 'loss'
export const NET_KEYS: NetKey[] = ['latency', 'jitter', 'loss']
export const NET_LABELS: Record<NetKey, string> = { latency: '延迟', jitter: '抖动', loss: '丢包' }
export const NET_WEIGHTS: Record<NetKey, number> = { latency: 0.35, jitter: 0.25, loss: 0.4 }
export interface ProbeSummary {
  taskId: number
  name: string
  latency: number | null
  jitter: number | null
  loss: number | null
}
/** Network quality over the last 24 hours of a node's first three Hub probes. */
export interface NodeScore {
  overall: number | null
  /** Average latency (ms), jitter (ms) and loss (%). */
  values: Record<NetKey, number | null>
  /** Each value scored 0–100. */
  parts: Record<NetKey, number | null>
  probes: ProbeSummary[]
}
const nulls = (): Record<NetKey, null> => ({ latency: null, jitter: null, loss: null })
export const emptyScore = (): NodeScore => ({ overall: null, values: nulls(), parts: nulls(), probes: [] })
const mean = (values: (number | null)[]) => {
  const v = values.filter((x): x is number => x !== null)
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null
}
// Linear from full marks at `best` to zero at `worst`.
const scale = (value: number | null, best: number, worst: number) =>
  value === null ? null : Math.min(100, Math.max(0, (100 * (worst - value)) / (worst - best)))
function summarize(taskId: number, history: HistoryResponse): ProbeSummary {
  const points = history.ping.filter((p) => p.task_id === taskId),
    readings = points.flatMap((p) => (p.latency === null ? [] : [p.latency]))
  // Hub's band is the spread inside a bucket; without one, use the change between readings.
  const bands = points.flatMap((p) => (p.band ? [p.band[1] - p.band[0]] : [])),
    steps = readings.slice(1).map((v, i) => Math.abs(v - readings[i]!))
  return {
    taskId,
    name: history.probes[String(taskId)] ?? '',
    latency: mean(readings),
    jitter: mean(bands.length ? bands : steps),
    loss: taskLoss(history, taskId),
  }
}
export function networkScore(node: MonitorNode, history?: HistoryResponse): NodeScore {
  if (!node.online || !history) return emptyScore()
  const named = Object.keys(history.probes).map(Number),
    ids = (named.length ? named : [...new Set(history.ping.map((p) => p.task_id))])
      .filter((id) => history.ping.some((p) => p.task_id === id))
      .sort((a, b) => a - b)
      .slice(0, 3)
  if (!ids.length) return emptyScore()
  const probes = ids.map((id) => summarize(id, history))
  const values: Record<NetKey, number | null> = {
    latency: mean(probes.map((p) => p.latency)),
    jitter: mean(probes.map((p) => p.jitter)),
    loss: mean(probes.map((p) => p.loss)),
  }
  const raw: Record<NetKey, number | null> = {
    latency: scale(values.latency, 30, 300),
    jitter: scale(values.jitter, 5, 100),
    loss: scale(values.loss, 0, 10),
  }
  // Weights are shared among the parts that have data.
  const scored = NET_KEYS.filter((k) => raw[k] !== null),
    weight = scored.reduce((a, k) => a + NET_WEIGHTS[k], 0),
    total = scored.reduce((a, k) => a + NET_WEIGHTS[k] * raw[k]!, 0)
  return {
    overall: weight ? Math.min(99, Math.max(1, Math.round(total / weight))) : null,
    values,
    parts: Object.fromEntries(
      NET_KEYS.map((k) => [k, raw[k] === null ? null : Math.round(raw[k])]),
    ) as Record<NetKey, number | null>,
    probes,
  }
}

export type StatGrade = 'good' | 'ok' | 'bad'
export interface StatReading {
  value: string
  unit: string
  grade: StatGrade | null
}
const dash: StatReading = { value: '—', unit: '', grade: null }
// Usage reads green below 60%, yellow below 85%, red from there.
const usage = (used: number, total: number): StatReading => {
  if (total <= 0) return dash
  const pct = Math.round((100 * used) / total)
  return { value: String(pct), unit: '%', grade: pct < 60 ? 'good' : pct < 85 ? 'ok' : 'bad' }
}
// What the card prints: real usage, uptime and latency, coloured by the value itself.
export function statReadings(node: MonitorNode, score: NodeScore): Record<StatKey, StatReading> {
  const m = node.metrics
  if (!node.online || !m)
    return Object.fromEntries(STAT_KEYS.map((k) => [k, dash])) as Record<StatKey, StatReading>
  const ms = score.values.latency === null ? null : Math.round(score.values.latency)
  return {
    cpu: usage(m.cpu, 100),
    mem: usage(m.mem_used, m.mem_total),
    dsk: usage(m.disk_used, m.disk_total),
    net:
      node.traffic_limit > 0
        ? usage(trafficUsed(node), node.traffic_limit)
        : { value: '∞', unit: '', grade: 'good' },
    // A restart within the last day is worth a glance, not an alarm.
    upt:
      m.uptime >= 86400
        ? { value: String(Math.floor(m.uptime / 86400)), unit: '天', grade: 'good' }
        : { value: String(Math.floor(m.uptime / 3600)), unit: '时', grade: 'ok' },
    png:
      ms === null
        ? dash
        : { value: String(ms), unit: 'ms', grade: ms <= 120 ? 'good' : ms <= 200 ? 'ok' : 'bad' },
  }
}

const ORDER: Tier[] = ['bronze', 'silver', 'gold'],
  LINES = [65, 75],
  GAP = 2
export function nextTier(score: number | null, previous?: Tier): Tier {
  if (score === null) return previous ?? 'silver'
  if (!previous) return ORDER[LINES.filter((l) => score >= l).length]!
  let r = ORDER.indexOf(previous)
  while (r < 2 && score >= LINES[r]! + GAP) r++
  while (r > 0 && score < LINES[r - 1]! - GAP) r--
  return ORDER[r]!
}
