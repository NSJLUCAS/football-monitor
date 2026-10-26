/** Development-only data. Never imported from src or included in the theme package. */
export const demoNodes = [
  {
    id: 101,
    name: 'HK-01',
    country: 'HK',
    group: '亚洲节点',
    public_remark: '香港 · CN2 GIA',
    price: 49,
    currency: 'CNY',
    template: 'classic-gold',
    cpu: 12,
    mem: 36,
    disk: 28,
    rx: 12.4,
    tx: 3.1,
    expires_in: 36,
  },
  {
    id: 102,
    name: 'US-Los Angeles',
    country: 'US',
    group: '美洲节点',
    public_remark: '洛杉矶 · 9929',
    price: 9.9,
    currency: 'USD',
    template: 'black-elite',
    cpu: 8,
    mem: 42,
    disk: 31,
    rx: 8.2,
    tx: 1.4,
    expires_in: 78,
  },
  {
    id: 103,
    name: 'JP-Tokyo',
    country: 'JP',
    group: '亚洲节点',
    public_remark: '东京 · 优质软银线路',
    price: 1500,
    currency: 'JPY',
    template: 'white-icon',
    cpu: 16,
    mem: 48,
    disk: 62,
    rx: 6.7,
    tx: 2.3,
    expires_in: 5,
  },
  {
    id: 104,
    name: 'SG-01',
    country: 'SG',
    group: '亚洲节点',
    public_remark: '新加坡 · CMIN2',
    price: 88,
    currency: 'CNY',
    template: 'pioneer',
    cpu: 24,
    mem: 52,
    disk: 40,
    rx: 18.6,
    tx: 4.9,
    expires_in: 106,
  },
  {
    id: 105,
    name: 'DE-Frankfurt',
    country: 'DE',
    group: '欧洲节点',
    public_remark: '法兰克福 · 稳定连接每一刻',
    price: 0,
    currency: 'EUR',
    template: 'minimal-carbon',
    cpu: 5,
    mem: 21,
    disk: 13,
    rx: 2.4,
    tx: 0.8,
    expires_in: null,
  },
]
const GiB = 1024 ** 3
export function nodes() {
  return demoNodes.map((n, i) => ({
    id: n.id,
    name: n.name,
    sort: i,
    public: true,
    online: true,
    country: n.country,
    group: n.group,
    public_remark: n.public_remark,
    last_seen: Math.floor(Date.now() / 1000),
    last_seen_ago: 1,
    metrics: {
      uptime: 12 * 86400 + i * 9 * 86400 + 21600,
      cpu: n.cpu,
      load: [0.22, 0.18, 0.12],
      mem_total: 4 * GiB,
      mem_used: (n.mem / 100) * 4 * GiB,
      swap_total: GiB,
      swap_used: 0.1 * GiB,
      disk_total: 60 * GiB,
      disk_used: (n.disk / 100) * 60 * GiB,
      net_rx: n.rx * 1024 ** 2,
      net_tx: n.tx * 1024 ** 2,
      total_rx: (218.5 + i * 150) * GiB,
      total_tx: (65 + i * 40) * GiB,
      month_rx: (170 + i * 120) * GiB,
      month_tx: (48.5 + i * 20) * GiB,
      tcp: 110 + i * 34,
      udp: 12 + i * 8,
      procs: 58 + i,
    },
    os: ['Debian 12', 'Ubuntu 22.04.4 LTS', 'Rocky Linux 9.3', 'Alpine Linux v3.20', 'Windows Server 2022'][
      i
    ]!,
    kernel: '6.1.0-23-amd64',
    arch: 'x86_64',
    virt: 'KVM',
    cpu_name: 'AMD EPYC 7B13',
    cpu_cores: 2 + i,
    mem_total: 4 * GiB,
    swap_total: GiB,
    disk_total: 60 * GiB,
    agent_version: '1.0.0',
    price: n.price,
    currency: n.currency,
    billing_cycle: 'monthly',
    // Keep the date in step with the days left so the expiry board reads true.
    expires_at:
      n.expires_in === null
        ? null
        : new Date(Date.now() + n.expires_in * 86400000).toISOString().slice(0, 10),
    expires_in: n.expires_in,
    traffic_limit: i === 4 ? 0 : (1 + (i % 2)) * 1024 * GiB,
    traffic_mode: 'sum',
    traffic_reset_day: 1,
    total_rx: (218.5 + i * 150) * GiB,
    total_tx: (65 + i * 40) * GiB,
    month_rx: (170 + i * 120) * GiB,
    month_tx: (48.5 + i * 20) * GiB,
    month_used: (218.5 + i * 140) * GiB,
    month_start: '2026-10-01',
    day_rx: 8 * GiB,
    day_tx: 2 * GiB,
  }))
}
export const initialConfig = {
  preserved_external_setting: 'must survive saves',
  node_config: JSON.stringify({
    version: 1,
    nodes: Object.fromEntries(
      demoNodes.map((n, i) => [
        n.id,
        {
          template: n.template,
          provider: [
            { id: 'aliyun' },
            { id: 'vultr' },
            { id: 'aws' },
            { id: 'hetzner' },
            { id: 'digitalocean' },
          ][i],
          carriers: {
            telecom: { taskId: 201, line: ['CN2 GIA', '163', '163', '163', '普通线路'][i] },
            unicom: { taskId: 202, line: i % 2 ? '9929' : '4837' },
            mobile: { taskId: 203, line: i % 2 ? 'CMI' : 'CMIN2' },
          },
        },
      ]),
    ),
  }),
}
export function history(id: number, hours = 6, series = '') {
  const start = Math.floor(Date.now() / 60000) * 60 - hours * 3600,
    step = Math.max(60, Math.ceil((hours * 3600) / 120 / 60) * 60)
  const base = nodes().find((n) => n.id === id) || nodes()[0]!
  const count = Math.min(120, Math.floor((hours * 3600) / step))
  const metrics = Array.from({ length: count }, (_, i) => ({
    ts: start + i * step,
    cpu: Math.max(1, base.metrics.cpu + Math.sin(i / 8) * 6 + Math.cos(i / 2) * 2),
    mem_used: base.mem_total * (0.35 + Math.sin(i / 19) * 0.05),
    disk_used: base.disk_total * 0.28,
    net_rx: base.metrics.net_rx * (0.7 + Math.sin(i / 8) * 0.3),
    net_tx: base.metrics.net_tx * (0.7 + Math.cos(i / 5) * 0.3),
    minutes: step / 60,
  }))
  const ping = [201, 202, 203].flatMap((task_id, t) =>
    Array.from({ length: count }, (_, i) => {
      const latency = Math.round((28 + (id - 101) * 15 + t * 8 + Math.sin(i / 6) * 3) * 10) / 10,
        // Each node gets its own spread so the jitter part of the score varies in development.
        spread = 2 + ((id * 7) % 5) * 3 + Math.abs(Math.cos(i / 4)) * 4
      return {
        task_id,
        ts: start + i * step,
        latency,
        band: [Math.round(latency - spread / 2), Math.round(latency + spread)],
        // Occasional packet loss so the strip's loss bar has something to show in development.
        ...((i + t * 7 + id) % 23 === 0 ? { loss: (id % 3) * 4 + 2 } : {}),
      }
    }),
  )
  return {
    metrics: series === 'ping' ? [] : metrics,
    ping: series === 'metrics' ? [] : ping,
    probes:
      series === 'metrics' ? {} : { '201': '上海 TCP 目标', '202': '广州 TCP 目标', '203': '北京 TCP 目标' },
    loss: {},
    step,
  }
}
