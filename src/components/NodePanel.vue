<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { latencyColor, lossColor, probeBars, shownProbes, taskLoss } from '../domain/carriers'
import { flagUrl } from '../domain/flags'
import { remainingValue } from '../domain/fleet'
import { bytes, countryName, cycle, money, offlineSince, rate, trafficUsed } from '../domain/format'
import { osBadge } from '../domain/providers'
import type { HistoryResponse, MonitorNode, NodeConfig } from '../domain/types'
const props = defineProps<{
  node: MonitorNode
  nodeConfig?: NodeConfig
  history?: HistoryResponse
  unavailable?: boolean
  showCarriers: boolean
  showTraffic: boolean
  showBilling: boolean
}>()
const metrics = computed(() => (props.node.online ? props.node.metrics : null))
const os = computed(() => osBadge(props.node.os))
const flag = computed(() => (props.node.country ? flagUrl(props.node.country) : undefined))
const tags = computed(() => {
  const n = props.node,
    m = metrics.value,
    list: string[] = []
  if (!n.online) list.push(offlineSince(n))
  else if (m)
    list.push(
      m.uptime >= 86400
        ? `在线 ${Math.floor(m.uptime / 86400)} 天`
        : `在线 ${Math.floor(m.uptime / 3600)} 小时`,
    )
  if (props.showBilling && n.price !== null)
    list.push(n.price === 0 ? '免费' : `${money(n.price, n.currency)} / ${cycle(n.billing_cycle)}`)
  if (n.public_remark) list.push(n.public_remark)
  return list
})
type Grade = 'good' | 'ok' | 'bad'
interface Meter {
  key: string
  label: string
  value: string
  /** Bar share, 0 to 1; none for an unlimited allowance or a missing reading. */
  share: number | null
  grade?: Grade
  detail: string
}
// The same thresholds as the card's usage readings.
const grade = (share: number): Grade => (share < 0.6 ? 'good' : share < 0.85 ? 'ok' : 'bad')
const meter = (key: string, label: string, share: number | null, detail: string): Meter =>
  share === null
    ? { key, label, value: '—', share: null, detail }
    : {
        key,
        label,
        value: `${(share * 100).toFixed(1)}%`,
        share: Math.min(1, share),
        grade: grade(share),
        detail,
      }
const meters = computed((): Meter[] => {
  const n = props.node,
    m = metrics.value,
    used = trafficUsed(n)
  return [
    meter('cpu', 'CPU', m ? m.cpu / 100 : null, m ? m.load.map((v) => v.toFixed(2)).join(', ') : '—'),
    meter(
      'mem',
      '内存',
      m && m.mem_total ? m.mem_used / m.mem_total : null,
      m ? `${bytes(m.mem_used)} / ${bytes(m.mem_total)}` : bytes(n.mem_total),
    ),
    meter(
      'disk',
      '硬盘',
      m && m.disk_total ? m.disk_used / m.disk_total : null,
      m ? `${bytes(m.disk_used)} / ${bytes(m.disk_total)}` : bytes(n.disk_total),
    ),
    // Hub-booked traffic, so offline nodes keep this period's figure.
    n.traffic_limit > 0
      ? meter('traffic', '流量', used / n.traffic_limit, `${bytes(used)} / ${bytes(n.traffic_limit)}`)
      : { key: 'traffic', label: '流量', value: bytes(used), share: null, detail: '本周期 · 不限量' },
  ]
})
const expiry = computed(() => {
  const n = props.node,
    left = remainingValue(n)
  return {
    days:
      n.expires_in == null
        ? '未设到期日'
        : n.expires_in < 0
          ? `已过期 ${-n.expires_in} 天`
          : n.expires_in === 0
            ? '今天到期'
            : `剩余 ${n.expires_in} 天`,
    value: left ? money(Number(left.amount.toFixed(2)), left.currency) : '—',
  }
})
// As on the card strip, the bars sweep while the probes load, then fill in from the left the first time they
// arrive; probes already loaded when the panel mounts, refreshes and failed requests show as they are.
const arrived = ref(false)
watch(
  () => props.history,
  (now, before) => {
    if (now && !before) arrived.value = true
  },
)
const loading = computed(() => !props.history && !props.unavailable)
const barState = computed(() => (loading.value ? 'loading' : arrived.value ? 'fill' : undefined))
const EMPTY = Array.from({ length: 10 }, () => latencyColor(null))
// Each shown probe gets its own latency and loss segments, as on the detail page's carrier rows; three empty
// rows hold the place while the probes load.
const probes = computed(() =>
  loading.value
    ? [1, 2, 3].map((n) => ({
        taskId: -n,
        region: '—',
        carrier: undefined,
        color: undefined,
        logo: undefined,
        latency: null,
        loss: null,
        title: '正在加载探测数据',
        latencyColors: EMPTY,
        lossColors: EMPTY,
      }))
    : shownProbes(props.history, props.nodeConfig, props.node.online, props.unavailable).map((p) => {
        const b = probeBars(props.history, [p.taskId]),
          loss = props.unavailable ? null : taskLoss(props.history, p.taskId)
        return {
          ...p,
          loss,
          latencyColors: b.latency.map(latencyColor),
          lossColors: b.loss.map(lossColor),
        }
      }),
)
</script>
<template>
  <div class="node-panel">
    <div class="np-head">
      <span class="np-dot" :data-online="node.online" aria-hidden="true" />
      <h3 class="np-name" :title="node.name">{{ node.name }}</h3>
      <svg v-if="os?.icon" class="np-os" viewBox="0 0 24 24" aria-hidden="true">
        <title>{{ os.name }}</title>
        <path :d="os.icon.path" :fill="`#${os.icon.hex}`" />
      </svg>
      <span v-else-if="os?.short" class="np-os-text" :title="os.name">{{ os.short }}</span>
      <img v-if="flag" class="np-flag" :src="flag" :title="countryName(node.country)" alt="" />
    </div>
    <div v-if="tags.length" class="np-tags">
      <span v-for="tag in tags" :key="tag" class="np-tag" :title="tag">{{ tag }}</span>
    </div>
    <div class="np-meters">
      <div v-for="m in meters" :key="m.key" class="np-meter" :data-key="m.key">
        <div class="np-meter-top">
          <span>{{ m.label }}</span
          ><b :data-grade="m.grade">{{ m.value }}</b>
        </div>
        <span class="np-bar" aria-hidden="true"
          ><i v-if="m.share !== null" :data-grade="m.grade" :style="{ width: `${m.share * 100}%` }"
        /></span>
        <span class="np-detail" :title="m.detail">{{ m.detail }}</span>
      </div>
    </div>
    <div class="np-boxes">
      <div class="np-box">
        <span class="np-down"><b aria-hidden="true">↓</b>{{ rate(metrics?.net_rx) }}</span>
        <span class="np-up"><b aria-hidden="true">↑</b>{{ rate(metrics?.net_tx) }}</span>
      </div>
      <div
        v-if="showTraffic"
        class="np-box"
        :title="`累计上行 ${bytes(node.total_tx)} · 累计下行 ${bytes(node.total_rx)}`"
      >
        <span><b aria-hidden="true">⇡</b>{{ bytes(node.total_tx) }}</span>
        <span><b aria-hidden="true">⇣</b>{{ bytes(node.total_rx) }}</span>
      </div>
      <div v-if="showBilling" class="np-box">
        <span>{{ expiry.days }}</span>
        <span>{{ expiry.value }}</span>
      </div>
      <!-- Hub-booked counters, so offline nodes keep today's figure, as on the card strip. -->
      <div
        v-if="showTraffic"
        class="np-box np-today"
        :title="`今日下行 ${bytes(node.day_rx)} · 今日上行 ${bytes(node.day_tx)}`"
      >
        <span class="np-box-label">今日流量</span>
        <b>{{ bytes(node.day_rx + node.day_tx) }}</b>
      </div>
    </div>
    <div v-if="showCarriers" class="np-probes" :data-state="barState">
      <span v-if="!probes.length" class="np-empty">暂无探测任务</span>
      <div
        v-for="p in probes"
        :key="p.taskId"
        class="np-probe"
        :data-carrier="p.carrier"
        :style="p.color ? { '--carrier': p.color } : undefined"
        :title="p.title"
      >
        <span class="np-probe-name"
          ><img v-if="p.logo" :src="p.logo" alt="" decoding="async" /><i v-else aria-hidden="true" /><span>{{
            p.region
          }}</span></span
        >
        <span class="np-segs" aria-hidden="true"
          ><i v-for="(color, i) in p.latencyColors" :key="i" :style="{ background: color, '--i': i }"
        /></span>
        <b class="np-probe-value"
          >{{ p.latency === null ? '—' : Number(p.latency.toFixed(1))
          }}<small v-if="p.latency !== null">ms</small></b
        >
        <span class="np-segs" aria-hidden="true"
          ><i v-for="(color, i) in p.lossColors" :key="i" :style="{ background: color, '--i': i }"
        /></span>
        <b class="np-probe-value"
          >{{ p.loss === null ? '—' : p.loss.toFixed(1) }}<small v-if="p.loss !== null">%</small></b
        >
      </div>
    </div>
  </div>
</template>
