import { describe, expect, it } from 'vitest'
import { normalizeNodes } from '../src/domain/normalize'
import { DEFAULT_RATES, expiringSoon, fleetSummary, parseRates, remainingValue } from '../src/domain/fleet'

const GB = 1024 ** 3
function node(id: number, spec: Record<string, unknown> = {}, metrics: Record<string, number> | null = {}) {
  return normalizeNodes({
    nodes: [
      {
        id,
        name: `N${id}`,
        online: metrics !== null,
        price: 30,
        currency: 'CNY',
        billing_cycle: 'monthly',
        expires_at: '2026-12-01',
        expires_in: 15,
        total_rx: 100 * GB,
        total_tx: 50 * GB,
        ...spec,
        metrics:
          metrics === null
            ? null
            : {
                uptime: 86400,
                cpu: 10,
                load: [0, 0, 0],
                mem_total: 4 * GB,
                mem_used: 1 * GB,
                swap_total: 0,
                swap_used: 0,
                disk_total: 40 * GB,
                disk_used: 10 * GB,
                net_rx: 1000,
                net_tx: 500,
                total_rx: 0,
                total_tx: 0,
                month_rx: 0,
                month_tx: 0,
                tcp: 0,
                udp: 0,
                procs: 0,
                ...metrics,
              },
      },
    ],
  })[0]!
}

describe('exchange rates', () => {
  it('parses CODE=rate pairs into yuan per unit, with CNY fixed at 1', () => {
    expect(parseRates('USD=7.1, jpy=0.047')).toEqual({ CNY: 1, USD: 7.1, JPY: 0.047 })
    expect(parseRates('')).toEqual({ CNY: 1 })
    expect(parseRates(DEFAULT_RATES)?.USD).toBeGreaterThan(0)
  })
  it('rejects malformed text', () => {
    for (const bad of ['USD', 'USD=abc', 'USD=-1', 'USD=0', 'US=7', 'USD=7;EUR=8', 'x'.repeat(600)])
      expect(parseRates(bad), bad).toBeNull()
  })
})

describe('remaining value', () => {
  it('prorates the renewal price over the days left in the cycle', () => {
    // 30 per month, 15 days left of a 30.4375-day month.
    expect(remainingValue(node(1))!.amount).toBeCloseTo(14.78, 2)
    expect(remainingValue(node(1, { billing_cycle: 'yearly', price: 365.25, expires_in: 100 }))).toEqual({
      amount: 100,
      currency: 'CNY',
    })
    expect(remainingValue(node(1, { billing_cycle: '6m', price: 60, expires_in: 0 }))!.amount).toBe(0)
  })
  it('is zero once expired or free, and unknown without a price, expiry or cycle', () => {
    expect(remainingValue(node(1, { expires_in: -3 }))!.amount).toBe(0)
    expect(remainingValue(node(1, { price: 0 }))!.amount).toBe(0)
    expect(remainingValue(node(1, { price: 0, expires_in: null, billing_cycle: 'once' }))!.amount).toBe(0)
    expect(remainingValue(node(1, { price: null }))).toBeNull()
    expect(remainingValue(node(1, { expires_in: null }))).toBeNull()
    expect(remainingValue(node(1, { billing_cycle: 'once' }))).toBeNull()
  })
})

describe('fleet summary', () => {
  it('sums live resources of online nodes and traffic of all nodes', () => {
    const s = fleetSummary(
      [node(1), node(2, {}, { mem_used: 3 * GB, net_rx: 3000 }), node(3, {}, null)],
      parseRates(DEFAULT_RATES)!,
    )
    expect(s).toMatchObject({
      total: 3,
      online: 2,
      memUsed: 4 * GB,
      memTotal: 8 * GB,
      diskUsed: 20 * GB,
      diskTotal: 80 * GB,
      rx: 4000,
      tx: 1000,
      traffic: 450 * GB,
    })
  })
  it('converts remaining value to yuan and counts what it could not price', () => {
    const rates = { CNY: 1, USD: 7 }
    const s = fleetSummary(
      [
        node(1, { price: 30.4375, expires_in: 10 }),
        node(2, { price: 30.4375, expires_in: 10, currency: 'USD' }),
        node(3, { currency: 'EUR' }),
        node(4, { expires_in: null }),
        node(5, { price: null }),
        node(6, { price: 0, currency: 'EUR', expires_in: null }),
      ],
      rates,
    )
    expect(s.value).toBeCloseTo(80, 6)
    expect(s.uncounted).toBe(2)
    expect(fleetSummary([node(5, { price: null })], rates).value).toBeNull()
  })
})

describe('expiring soon', () => {
  it('ranks nodes by expiry date, expired first, skipping nodes without one', () => {
    const list = expiringSoon([
      node(1, { expires_at: '2026-12-01', expires_in: 35 }),
      node(2, { expires_at: '2026-10-20', expires_in: -7 }),
      node(3, { expires_at: null, expires_in: null }),
      node(4, { expires_at: '2026-11-01', expires_in: 5 }),
      node(5, { expires_at: '2027-03-01', expires_in: 125 }),
      node(6, { expires_at: '2026-11-15', expires_in: 19 }),
      node(7, { expires_at: '2026-11-20', expires_in: 24 }),
    ])
    expect(list.map((e) => [e.node.id, e.days])).toEqual([
      [2, -7],
      [4, 5],
      [6, 19],
      [7, 24],
      [1, 35],
    ])
    expect(expiringSoon([node(1, { expires_in: undefined })])[0]!.days).toBeNull()
  })
})
