import type { MetricPoint } from './types'

export interface ChartPoint {
  ts: number
  value: number | null
  /** A note on this sample, such as its loss: drawn as a red dot and named in the tooltip. */
  mark?: string
}
export interface ChartSeries {
  name: string
  color: string
  points: ChartPoint[]
  /** A secondary line, such as a peak: thinner and dashed. */
  dashed?: boolean
  /** Shade the area under the line. */
  fill?: boolean
  /** Leave the series out of the legend; it still shows in the tooltip and the data table. */
  legend?: boolean
}
/** A range shaded between two lines sampled at the same times. */
export interface ChartBand {
  color: string
  low: ChartPoint[]
  high: ChartPoint[]
}
export function chartSegments(points: ChartPoint[], step: number): ChartPoint[][] {
  const segments: ChartPoint[][] = []
  let current: ChartPoint[] = []
  let previous = 0
  for (const p of points) {
    if (p.value === null || !Number.isFinite(p.value) || (previous && p.ts - previous > step * 1.7)) {
      if (current.length) segments.push(current)
      current = []
    }
    if (p.value !== null && Number.isFinite(p.value)) current.push(p)
    previous = p.ts
  }
  if (current.length) segments.push(current)
  return segments
}

/** Steps for time ticks, in seconds; the smallest that keeps a window to seven labels is used. */
const TICK_STEPS = [600, 900, 1800, 3600, 7200, 10800, 21600, 43200, 86400, 172800, 432000, 604800]
const pad = (n: number) => String(n).padStart(2, '0')
/** Ticks on whole local times inside a window: minutes or hours within a day, dates beyond. */
export function timeTicks(from: number, to: number): { ts: number; label: string }[] {
  const step = TICK_STEPS.find((s) => (to - from) / s <= 7) ?? TICK_STEPS.at(-1)!
  const day = new Date(from * 1000)
  day.setHours(0, 0, 0, 0)
  const ticks: { ts: number; label: string }[] = []
  for (let ts = day.getTime() / 1000; ts <= to; ts += step) {
    if (ts < from) continue
    const d = new Date(ts * 1000)
    ticks.push({
      ts,
      label:
        step < 86400 ? `${pad(d.getHours())}:${pad(d.getMinutes())}` : `${d.getMonth() + 1}/${d.getDate()}`,
    })
  }
  return ticks
}

/** The CPU axis tops out at the next 15% above the busiest moment, so quiet machines still show their shape. */
export const cpuTop = (busiest: number | null) =>
  Math.min(100, Math.max(15, Math.ceil((busiest ?? 0) / 15) * 15))

const KB = 1024
/** 1 KB/s, 10 KB/s, 100 KB/s, 1 MB/s … : the steps of the logarithmic rate axis. */
const RATE_STEPS = [1, 1024, 1024 ** 2, 1024 ** 3].flatMap((unit) => [
  unit * KB,
  unit * KB * 10,
  unit * KB * 100,
])
/** 1, 2 and 5 of each unit: where the rate axis may end, so it hugs the data. */
const RATE_ENDS = [1, 1024, 1024 ** 2, 1024 ** 3].flatMap((unit) =>
  [1, 2, 5, 10, 20, 50, 100, 200, 500].map((n) => unit * KB * n),
)
/**
 * A logarithmic rate axis from the 1-2-5 step at or below the slowest rate to the one at or above the highest,
 * at least tenfold tall, marked at its ends and every whole power of ten between. A rate of zero, which a log
 * axis cannot show, counts as the 1 KB/s floor.
 */
export function rateAxis(values: number[]) {
  const shown = values.filter((v) => Number.isFinite(v))
  const moving = shown.filter((v) => v > 0)
  const slowest = moving.length ? Math.max(KB, Math.min(...moving)) : KB
  const fastest = Math.max(0, ...shown)
  const low = [...RATE_ENDS].reverse().find((s) => s <= slowest) ?? KB
  const high = RATE_ENDS.find((s) => s >= Math.max(fastest, low * 10)) ?? RATE_ENDS.at(-1)!
  const ticks = [...new Set([low, ...RATE_STEPS.filter((s) => s > low && s < high), high])]
  return { low, high, ticks }
}

/** The window's highest one-minute rate each way, or null from a hub that sends no peaks: the highest mean is not a peak. */
export function windowPeak(metrics: MetricPoint[]) {
  if (!metrics.some((m) => m.net_rx_max !== undefined)) return null
  const top = (pick: (m: MetricPoint) => number | null | undefined) =>
    metrics.reduce((hi, m) => Math.max(hi, pick(m) ?? 0), 0)
  return { rx: top((m) => m.net_rx_max ?? m.net_rx), tx: top((m) => m.net_tx_max ?? m.net_tx) }
}

/** Steps for the latency axis, in ms. */
const LATENCY_STEPS = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000]
/** A latency axis that hugs the data: the smallest whole step that spans it in five spaces or fewer. */
export function latencyAxis(values: number[]) {
  const shown = values.filter((v) => Number.isFinite(v))
  const lo = shown.length ? Math.min(...shown) : 0,
    hi = shown.length ? Math.max(...shown) : 10
  const step = LATENCY_STEPS.find((s) => Math.ceil(hi / s) - Math.floor(lo / s) <= 5) ?? LATENCY_STEPS.at(-1)!
  const low = Math.max(0, Math.floor(lo / step) * step)
  const high = Math.max(Math.ceil(hi / step) * step, low + step)
  const ticks = Array.from({ length: Math.round((high - low) / step) + 1 }, (_, i) => low + i * step)
  return { low, high, ticks }
}

/** Each sample replaced by the median of the samples up to `reach` either side; failures stay gaps. */
export function despike(points: ChartPoint[], reach = 2): ChartPoint[] {
  return points.map((p, i) => {
    if (p.value === null) return p
    const near = points
      .slice(Math.max(0, i - reach), i + reach + 1)
      .flatMap((q) => (q.value === null ? [] : [q.value]))
      .sort((a, b) => a - b)
    const mid = near.length / 2
    const value = near.length % 2 ? near[Math.floor(mid)]! : (near[mid - 1]! + near[mid]!) / 2
    return { ...p, value }
  })
}
