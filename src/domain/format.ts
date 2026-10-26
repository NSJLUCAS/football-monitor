import type { MonitorNode } from './types'

export function bytes(value: number | null | undefined, digits = 1): string {
  if (value == null || !Number.isFinite(value) || value < 0) return '—'
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
  const i = Math.min(units.length - 1, Math.max(0, Math.floor(Math.log(value || 1) / Math.log(1024))))
  return `${Number((value / 1024 ** i).toFixed(digits))} ${units[i]}`
}
export const rate = (value: number | null | undefined) => (value == null ? '—' : `${bytes(value)}/s`)
export function percent(used: number | null | undefined, total: number | null | undefined): number | null {
  return used != null && total != null && Number.isFinite(used) && total > 0
    ? Math.min(100, Math.max(0, (used / total) * 100))
    : null
}
export function money(value: number | null, currency: string): string {
  if (value === null || !Number.isFinite(value)) return '未设置'
  if (value === 0) return '免费'
  try {
    return new Intl.NumberFormat('zh-CN', { style: 'currency', currency, maximumFractionDigits: 2 }).format(
      value,
    )
  } catch {
    return `${currency} ${value.toFixed(2)}`
  }
}
export function cycle(value: string): string {
  const named: Record<string, string> = {
    monthly: '月',
    quarterly: '季度',
    semiannual: '半年',
    yearly: '年',
    biennial: '2 年',
    triennial: '3 年',
    once: '一次性',
  }
  if (named[value]) return named[value]
  const n = Number(/^(\d+)m$/.exec(value)?.[1])
  return n >= 1 && n <= 1200 ? (n % 12 === 0 ? `${n / 12} 年` : `${n} 个月`) : '未知周期'
}
export function duration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return '—'
  const days = Math.floor(seconds / 86400),
    hours = Math.floor((seconds % 86400) / 3600),
    mins = Math.floor((seconds % 3600) / 60)
  return days ? `${days} 天 ${hours} 小时` : hours ? `${hours} 小时 ${mins} 分钟` : `${mins} 分钟`
}
export function expiry(n: { expires_in?: number | null; expires_at: string | null }): string {
  if (n.expires_in != null)
    return n.expires_in < 0
      ? `已过期 ${Math.abs(n.expires_in)} 天`
      : n.expires_in === 0
        ? '今天到期'
        : `${n.expires_in} 天后到期`
  return n.expires_at ? `${n.expires_at} 到期` : '未设置到期日'
}
export const offlineSince = (n: { last_seen_ago?: number | null }) =>
  n.last_seen_ago == null ? '离线 · 时长未知' : `离线 ${duration(n.last_seen_ago)}`
export function trafficUsed(
  n: Pick<MonitorNode, 'month_used' | 'month_rx' | 'month_tx' | 'traffic_mode'>,
): number {
  return (
    n.month_used ??
    (n.traffic_mode === 'up'
      ? n.month_tx
      : n.traffic_mode === 'down'
        ? n.month_rx
        : n.traffic_mode === 'max'
          ? Math.max(n.month_rx, n.month_tx)
          : n.month_rx + n.month_tx)
  )
}
export const windows = (days: number) => [
  ...[1, 6, 24, 168, 720, 2160].filter((h) => h * 1.25 <= days * 24),
  days * 24,
]
export const windowLabel = (hours: number) => (hours < 24 ? `${hours} 小时` : `${hours / 24} 天`)
export function countryName(code: string): string {
  if (!code) return '地区未知'
  try {
    return new Intl.DisplayNames(['zh-CN'], { type: 'region' }).of(code) || code
  } catch {
    return code
  }
}
export const flag = (code: string) =>
  /^[A-Z]{2}$/.test(code) ? String.fromCodePoint(...[...code].map((c) => 127397 + c.charCodeAt(0))) : '◎'
