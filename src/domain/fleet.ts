import manifest from '../../theme.json'
import type { MonitorNode } from './types'

/** Reference rates in yuan per unit from theme.json; the site owner can edit them in settings. */
export const DEFAULT_RATES = String(
  manifest.config.find((f) => 'key' in f && f.key === 'exchange_rates')!.default,
)
/** Parses `USD=7.1, JPY=0.047` (yuan per unit); null when any pair is malformed. CNY is always 1. */
export function parseRates(text: string): Record<string, number> | null {
  if (text.length > 512) return null
  const rates: Record<string, number> = { CNY: 1 }
  for (const pair of text
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)) {
    const m = /^([A-Za-z]{3})\s*=\s*(\d+(?:\.\d+)?)$/.exec(pair)
    if (!m || !(Number(m[2]) > 0)) return null
    rates[m[1]!.toUpperCase()] = Number(m[2])
  }
  return rates
}

const MONTH_DAYS = 365.25 / 12
const NAMED_MONTHS: Record<string, number> = {
  monthly: 1,
  quarterly: 3,
  semiannual: 6,
  yearly: 12,
  biennial: 24,
  triennial: 36,
}
function cycleMonths(cycle: string): number | null {
  if (NAMED_MONTHS[cycle]) return NAMED_MONTHS[cycle]
  const n = Number(/^(\d+)m$/.exec(cycle)?.[1])
  return n >= 1 && n <= 1200 ? n : null
}
/**
 * What is left of the current billing period: renewal price × days left ÷ days in the cycle.
 * Uses Hub's `expires_in` only, never the browser clock; null when price, expiry or cycle is unknown.
 */
export function remainingValue(node: MonitorNode): { amount: number; currency: string } | null {
  // A free machine is worth nothing whatever its expiry.
  if (node.price === 0) return { amount: 0, currency: node.currency }
  const months = cycleMonths(node.billing_cycle)
  if (node.price === null || node.expires_in == null || months === null) return null
  return {
    amount: (node.price * Math.max(0, node.expires_in)) / (months * MONTH_DAYS),
    currency: node.currency,
  }
}

export interface FleetSummary {
  total: number
  online: number
  memUsed: number
  memTotal: number
  diskUsed: number
  diskTotal: number
  rx: number
  tx: number
  traffic: number
  /** Today's Hub-booked traffic, offline nodes included. */
  today: number
  /** Remaining value in yuan; null when no node could be priced. */
  value: number | null
  /** Renewal prices as a monthly cost in yuan; null when no node could be priced. */
  monthly: number | null
  /** Paid nodes whose value is unknown (no expiry, unknown cycle or no exchange rate). */
  uncounted: number
}
export function fleetSummary(nodes: MonitorNode[], rates: Record<string, number>): FleetSummary {
  const s: FleetSummary = {
    total: nodes.length,
    online: 0,
    memUsed: 0,
    memTotal: 0,
    diskUsed: 0,
    diskTotal: 0,
    rx: 0,
    tx: 0,
    traffic: 0,
    today: 0,
    value: null,
    monthly: null,
    uncounted: 0,
  }
  for (const n of nodes) {
    s.traffic += n.total_rx + n.total_tx
    s.today += n.day_rx + n.day_tx
    // Offline nodes keep their last report; it is not a live value.
    const m = n.online ? n.metrics : null
    if (n.online) s.online++
    if (m) {
      s.memUsed += m.mem_used
      s.memTotal += m.mem_total
      s.diskUsed += m.disk_used
      s.diskTotal += m.disk_total
      s.rx += m.net_rx
      s.tx += m.net_tx
    }
    if (n.price === null) continue
    const value = remainingValue(n),
      rate = value && (value.amount === 0 ? 1 : rates[value.currency.toUpperCase()])
    if (value && rate) s.value = (s.value ?? 0) + value.amount * rate
    else s.uncounted++
    const months = n.price === 0 ? 1 : cycleMonths(n.billing_cycle),
      yuan = n.price === 0 ? 1 : rates[n.currency.toUpperCase()]
    if (months && yuan) s.monthly = (s.monthly ?? 0) + (n.price / months) * yuan
  }
  return s
}

/** Nodes with an expiry date, soonest (or already expired) first. */
export function expiringSoon(nodes: MonitorNode[], limit = 5) {
  return nodes
    .filter((n): n is MonitorNode & { expires_at: string } => n.expires_at !== null)
    .sort((a, b) => a.expires_at.localeCompare(b.expires_at) || a.name.localeCompare(b.name, 'zh-CN'))
    .slice(0, limit)
    .map((node) => ({ node, days: node.expires_in ?? null }))
}
