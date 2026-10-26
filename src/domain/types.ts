/** Public display contract verified against upstream; deliberately excludes admin fields. */
export interface Metrics {
  uptime: number
  cpu: number
  load: [number, number, number]
  mem_total: number
  mem_used: number
  swap_total: number
  swap_used: number
  disk_total: number
  disk_used: number
  net_rx: number
  net_tx: number
  total_rx: number
  total_tx: number
  month_rx: number
  month_tx: number
  tcp: number
  udp: number
  procs: number
}
export interface MonitorNode {
  id: number
  name: string
  sort: number
  public: boolean
  online: boolean
  country: string
  group: string
  public_remark: string
  last_seen: number | null
  last_seen_ago?: number | null
  metrics: Metrics | null
  os: string
  kernel: string
  arch: string
  virt: string
  cpu_name: string
  cpu_cores: number
  mem_total: number
  swap_total: number
  disk_total: number
  agent_version: string
  price: number | null
  currency: string
  billing_cycle: string
  expires_at: string | null
  expires_in?: number | null
  traffic_limit: number
  traffic_mode: string
  traffic_reset_day: number
  total_rx: number
  total_tx: number
  month_rx: number
  month_tx: number
  month_used?: number
  month_start: string
  day_rx: number
  day_tx: number
}
export interface Me {
  authed: boolean
  site_name: string
  public_page: boolean
  github: boolean
  history_days: number
}
export interface MetricPoint {
  ts: number
  cpu: number | null
  mem_used: number | null
  disk_used: number | null
  net_rx: number | null
  net_tx: number | null
  minutes?: number
}
export interface PingPoint {
  task_id: number
  ts: number
  latency: number | null
  band?: [number, number]
  loss?: number
}
export interface HistoryResponse {
  metrics: MetricPoint[]
  ping: PingPoint[]
  probes: Record<string, string>
  loss: Record<string, number>
  step: number
}
export type SkinId = 'gold' | 'silver' | 'bronze' | 'weekly-black' | 'pioneer' | 'legend'
export type TemplateId = SkinId | 'auto'
export type CarrierId = 'telecom' | 'unicom' | 'mobile'
export interface CarrierConfig {
  taskId?: number
  line?: string
}
export interface PortraitConfig {
  url?: string
  scale: number
  x: number
  y: number
  fit: 'cover' | 'contain'
  area: 'full' | 'upper'
  hidden?: boolean
  /** Exported image already covers the whole bleed box. */
  box?: 'bleed'
}
/** VPS provider: a registry id, or `custom` with the owner's own name and HTTPS logo. */
export interface ProviderConfig {
  id: string
  name?: string
  logo?: string
}
export interface NodeConfig {
  template?: TemplateId
  provider?: ProviderConfig
  portrait?: PortraitConfig
  carriers?: Partial<Record<CarrierId, CarrierConfig>>
}
export interface GlobalConfig {
  default_template: TemplateId
  layout: 'comfortable' | 'compact'
  card_size: 'standard' | 'large'
  appearance: 'dark' | 'light' | 'system'
  motion: boolean
  show_summary: boolean
  show_traffic: boolean
  show_billing: boolean
  show_carriers: boolean
  exchange_rates: string
  upload_endpoint: string
}
export interface ThemeConfig extends GlobalConfig {
  nodes: Record<string, NodeConfig>
  configWarning: string
}
export interface ConfigPatch {
  values?: Partial<GlobalConfig>
  nodes?: Record<string, NodeConfig | null>
}
export type RawConfig = Record<string, unknown>
