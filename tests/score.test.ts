import { describe, expect, it } from 'vitest'
import { normalizeNodes } from '../src/domain/normalize'
import { NET_KEYS, networkScore, nextTier, statReadings, STAT_KEYS } from '../src/domain/score'
import type { HistoryResponse } from '../src/domain/types'

interface Spec {
  online?: boolean
  metrics?: null
  cpu?: number
  mem?: [number, number]
  disk?: [number, number]
  uptimeDays?: number
  limit?: number
  used?: number
}
function n(spec: Spec = {}) {
  const { cpu = 10, mem = [50, 100], disk = [50, 100], uptimeDays = 1, limit = 0 } = spec
  return normalizeNodes({
    nodes: [
      {
        id: 1,
        online: spec.online ?? true,
        traffic_limit: limit,
        ...(spec.used === undefined ? {} : { month_used: spec.used }),
        metrics:
          spec.metrics === null
            ? null
            : {
                uptime: uptimeDays * 86400,
                cpu,
                load: [0, 0, 0],
                mem_total: mem[1],
                mem_used: mem[0],
                swap_total: 0,
                swap_used: 0,
                disk_total: disk[1],
                disk_used: disk[0],
                net_rx: 0,
                net_tx: 0,
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
}
type Probe = {
  latency: (number | null)[]
  loss?: (number | undefined)[]
  band?: ([number, number] | undefined)[]
}
// One ping series per task id; points are a minute apart.
function hist(probes: Record<number, Probe>, names: Record<number, string> = {}): HistoryResponse {
  return {
    metrics: [],
    ping: Object.entries(probes).flatMap(([id, p]) =>
      p.latency.map((latency, i) => ({
        task_id: Number(id),
        ts: 1000 + i * 60,
        latency,
        ...(p.loss?.[i] === undefined ? {} : { loss: p.loss[i] }),
        ...(p.band?.[i] === undefined ? {} : { band: p.band[i] }),
      })),
    ),
    probes: Object.fromEntries(Object.keys(probes).map((id) => [id, names[Number(id)] ?? `#${id}`])),
    loss: {},
    step: 60,
  }
}
describe('network quality score', () => {
  it('weighs latency 35%, jitter 25% and loss 40% over the first three probes', () => {
    const score = networkScore(
      n(),
      hist(
        {
          1: {
            latency: [30, 30],
            band: [
              [28, 32],
              [28, 32],
            ],
          },
          2: {
            latency: [60, 60],
            band: [
              [55, 65],
              [55, 65],
            ],
          },
          3: {
            latency: [90, 90],
            band: [
              [82, 98],
              [82, 98],
            ],
          },
        },
        { 1: '上海 TCP 目标', 2: '广州 TCP 目标', 3: '北京 TCP 目标' },
      ),
    )
    expect(score.values).toEqual({ latency: 60, jitter: 10, loss: 0 })
    expect(score.parts).toEqual({ latency: 89, jitter: 95, loss: 100 })
    expect(score.overall).toBe(95)
    expect(score.probes.map((p) => [p.taskId, p.name, p.latency])).toEqual([
      [1, '上海 TCP 目标', 30],
      [2, '广州 TCP 目标', 60],
      [3, '北京 TCP 目标', 90],
    ])
    expect(Object.keys(score.parts)).toEqual(NET_KEYS)
  })
  it('uses only the first three probes in Hub order', () => {
    const score = networkScore(
      n(),
      hist({ 9: { latency: [500] }, 5: { latency: [50] }, 3: { latency: [30] }, 1: { latency: [10] } }),
    )
    expect(score.probes.map((p) => p.taskId)).toEqual([1, 3, 5])
    expect(score.values.latency).toBe(30)
  })
  it('counts failed probes as fully lost and prefers the loss Hub reports', () => {
    const failed = networkScore(n(), hist({ 1: { latency: [null, 40] } }))
    expect(failed.values).toEqual({ latency: 40, jitter: null, loss: 50 })
    expect(failed.parts).toEqual({ latency: 96, jitter: null, loss: 0 })
    // Weights are shared among the parts that have data: (0.35 × 96.3 + 0.4 × 0) / 0.75.
    expect(failed.overall).toBe(45)
    expect(networkScore(n(), hist({ 1: { latency: [40, 40], loss: [25, undefined] } })).values.loss).toBe(
      12.5,
    )
    const windowed = { ...hist({ 1: { latency: [40, 40], loss: [25, undefined] } }), loss: { '1': 1.5 } }
    // Hub's own loss over the whole window wins over the per-bucket figures.
    expect(networkScore(n(), windowed).values.loss).toBe(1.5)
  })
  it('falls back to the change between readings when Hub sends no band', () => {
    expect(networkScore(n(), hist({ 1: { latency: [40, 50, 44] } })).values.jitter).toBe(8)
  })
  it('bottoms out at 1 and tops out at 99', () => {
    const worst = networkScore(
      n(),
      hist({
        1: {
          latency: [400, 400],
          loss: [20, 20],
          band: [
            [100, 400],
            [100, 400],
          ],
        },
      }),
    )
    expect(worst.parts).toEqual({ latency: 0, jitter: 0, loss: 0 })
    expect(worst.overall).toBe(1)
    const best = networkScore(
      n(),
      hist({
        1: {
          latency: [10, 10],
          band: [
            [9, 11],
            [9, 11],
          ],
        },
      }),
    )
    expect(best.overall).toBe(99)
  })
  it('has no score without probe data or when the node is offline', () => {
    for (const score of [
      networkScore(n()),
      networkScore(n(), hist({})),
      networkScore(n({ online: false }), hist({ 1: { latency: [30] } })),
    ]) {
      expect(score.overall).toBeNull()
      expect(score.values).toEqual({ latency: null, jitter: null, loss: null })
      expect(score.probes).toEqual([])
    }
  })
})
describe('tier hysteresis', () => {
  it.each([
    [80, undefined, 'gold'],
    [70, undefined, 'silver'],
    [64, undefined, 'bronze'],
    [null, undefined, 'silver'],
    [76, 'silver', 'silver'],
    [77, 'silver', 'gold'],
    [73, 'gold', 'gold'],
    [72, 'gold', 'silver'],
    [63, 'silver', 'silver'],
    [62, 'silver', 'bronze'],
    [90, 'bronze', 'gold'],
    [50, 'gold', 'bronze'],
    [null, 'gold', 'gold'],
  ] as const)('nextTier(%s, %s) is %s', (score, previous, tier) => {
    expect(nextTier(score, previous)).toBe(tier)
  })
})
describe('stat readings', () => {
  const read = (spec: Spec, latencies: number[] = []) => {
    const node = n(spec)
    return statReadings(
      node,
      networkScore(node, hist(Object.fromEntries(latencies.map((v, i) => [i + 1, { latency: [v] }])))),
    )
  }
  it('shows real usage, uptime and latency', () => {
    const r = read(
      { cpu: 12.4, mem: [36, 100], disk: [28, 100], uptimeDays: 30, limit: 1000, used: 210 },
      [30, 38, 71],
    )
    expect(r.cpu).toEqual({ value: '12', unit: '%', grade: 'good' })
    expect(r.mem).toEqual({ value: '36', unit: '%', grade: 'good' })
    expect(r.dsk).toEqual({ value: '28', unit: '%', grade: 'good' })
    expect(r.net).toEqual({ value: '21', unit: '%', grade: 'good' })
    expect(r.upt).toEqual({ value: '30', unit: '天', grade: 'good' })
    expect(r.png).toEqual({ value: '46', unit: 'ms', grade: 'good' })
  })
  it('handles unlimited traffic, short uptime and missing latency', () => {
    const r = read({ uptimeDays: 5 / 24 })
    expect(r.net).toEqual({ value: '∞', unit: '', grade: 'good' })
    expect(r.upt).toEqual({ value: '5', unit: '时', grade: 'ok' })
    expect(r.png).toEqual({ value: '—', unit: '', grade: null })
  })
  it('colours by the real value: green below 60%, yellow below 85%, red above', () => {
    const busy = read({ cpu: 60, mem: [84, 100], disk: [85, 100], limit: 1000, used: 990 }, [150])
    expect([busy.cpu.grade, busy.mem.grade, busy.dsk.grade, busy.net.grade]).toEqual([
      'ok',
      'ok',
      'bad',
      'bad',
    ])
    expect(busy.png).toEqual({ value: '150', unit: 'ms', grade: 'ok' })
    expect(read({}, [120]).png.grade).toBe('good')
    expect(read({}, [201]).png.grade).toBe('bad')
  })
  it('shows dashes when the node is offline or has no metrics', () => {
    for (const r of [read({ online: false }), read({ metrics: null })])
      for (const key of STAT_KEYS) expect(r[key]).toEqual({ value: '—', unit: '', grade: null })
  })
})
