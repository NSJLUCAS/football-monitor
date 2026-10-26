import { describe, expect, it } from 'vitest'
import { normalizeNodes, normalizeMe, normalizeHistory } from '../src/domain/normalize'
import {
  bytes,
  money,
  cycle,
  duration,
  expiry,
  offlineSince,
  trafficUsed,
  windows,
} from '../src/domain/format'
import { resolveCarrier } from '../src/domain/carriers'

describe('verified public domain', () => {
  it('keeps Hub probe ordering even when another task has older samples', () => {
    const history = normalizeHistory({
      metrics: [],
      probes: { '9': 'first', '2': 'second' },
      ping: [
        { task_id: 9, ts: 1000, latency: 10 },
        { task_id: 2, ts: 500, latency: 20 },
      ],
    })
    expect([...new Set(history.ping.map((p) => p.task_id))]).toEqual([9, 2])
  })
  it('keeps the latency band Hub sends for jitter and drops malformed ones', () => {
    const history = normalizeHistory({
      ping: [
        { task_id: 1, ts: 1000, latency: 30, band: [10, 50] },
        { task_id: 1, ts: 1060, latency: 30, band: [50, 10] },
        { task_id: 1, ts: 1120, latency: 30, band: [10, 'x'] },
        { task_id: 1, ts: 1180, latency: 30 },
      ],
    })
    expect(history.ping.map((p) => p.band)).toEqual([[10, 50], undefined, undefined, undefined])
  })
  it('isolates corrupt nodes and strips all private fields', () => {
    const nodes = normalizeNodes({
      nodes: [
        {
          id: 1,
          name: '<script>x</script>',
          online: true,
          ip: 'private',
          remark: 'secret',
          metrics: { cpu: NaN },
        },
        { id: 2, name: 'healthy', metrics: null },
        null,
      ],
    })
    expect(nodes).toHaveLength(2)
    expect(nodes[0]?.metrics).toBeNull()
    expect(nodes[0]).not.toHaveProperty('ip')
    expect(nodes[0]).not.toHaveProperty('remark')
    expect(nodes[1]?.id).toBe(2)
  })
  it('rejects malformed envelopes and keeps Hub order', () => {
    expect(() => normalizeNodes({ error: 'html' })).toThrow()
    expect(normalizeNodes({ nodes: [{ id: 8 }, { id: 3 }] }).map((n) => n.id)).toEqual([8, 3])
    expect(normalizeMe({ authed: 'yes' }).authed).toBe(false)
    expect(normalizeMe({}).history_days).toBe(7)
  })
  it('formats sane units and missing data', () => {
    expect(bytes(1024)).toBe('1 KB')
    expect(bytes(null)).toBe('—')
    expect(bytes(NaN)).toBe('—')
    expect(duration(90061)).toBe('1 天 1 小时')
    expect(money(null, 'CNY')).toBe('未设置')
    expect(money(0, 'CNY')).toBe('免费')
    expect(money(2.5, 'bad currency')).toContain('2.50')
    expect(cycle('60m')).toBe('5 年')
    expect(cycle('once')).toBe('一次性')
    expect(cycle('nonsense')).toBe('未知周期')
  })
  it('uses Hub clocks and traffic mode rather than client clock', () => {
    expect(expiry({ expires_in: -2, expires_at: '2099-01-01' })).toBe('已过期 2 天')
    expect(expiry({ expires_at: '2020-01-01' })).toBe('2020-01-01 到期')
    expect(offlineSince({ last_seen_ago: 120 })).toBe('离线 2 分钟')
    expect(offlineSince({})).toBe('离线 · 时长未知')
    const n = normalizeNodes({ nodes: [{ id: 1, month_rx: 3, month_tx: 5 }] })[0]!
    expect(trafficUsed(n)).toBe(8)
    expect(trafficUsed({ ...n, traffic_mode: 'up' })).toBe(5)
    expect(trafficUsed({ ...n, traffic_mode: 'down' })).toBe(3)
    expect(trafficUsed({ ...n, traffic_mode: 'max' })).toBe(5)
    expect(trafficUsed({ ...n, month_used: 19 })).toBe(19)
  })
  it('derives history windows from retention, no stale 30-day button', () => {
    expect(windows(1)).toEqual([1, 6, 24])
    expect(windows(7)).toEqual([1, 6, 24, 168])
    expect(windows(92)).not.toContain(2160)
    expect(windows(365).at(-1)).toBe(8760)
  })
  it('distinguishes explicit probe mapping, fail, stale and unavailable', () => {
    const h = normalizeHistory({
      step: 60,
      probes: { '9': 'arbitrary' },
      ping: [{ task_id: 9, ts: 1000, latency: 28 }],
      metrics: [],
    })
    expect(resolveCarrier({}, h, 1010).status).toBe('unconfigured')
    expect(resolveCarrier({ taskId: 9, line: 'CN2 GIA' }, h, 1010).latency).toBe(28)
    expect(resolveCarrier({ taskId: 9 }, h, 1400).status).toBe('stale')
    expect(resolveCarrier({ taskId: 9 }, undefined, 1010, true).status).toBe('unavailable')
    h.ping[0]!.latency = null
    expect(resolveCarrier({ taskId: 9 }, h, 1010).status).toBe('failed')
    expect(resolveCarrier({ taskId: 123 }, h, 1010).status).toBe('unavailable')
  })
})
