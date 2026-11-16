<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { Activity, Clock, RefreshCw, Settings2, Tag } from '@lucide/vue'
import { useMonitorStore } from '../stores/monitor'
import {
  bytes,
  countryName,
  cycle,
  duration,
  expiry,
  money,
  percent,
  trafficUsed,
  windows,
  windowLabel,
} from '../domain/format'
import type { HistoryResponse, MetricPoint } from '../domain/types'
import { emptyScore, nextTier, type Tier } from '../domain/score'
import { carriers, lossColor, lossGrade, lossLevel, resolveCarrier, taskLoss } from '../domain/carriers'
import { nodeTemplate, skinOf } from '../domain/skins'
import {
  cpuTop,
  despike,
  latencyAxis,
  rateAxis,
  windowPeak,
  type ChartBand,
  type ChartPoint,
  type ChartSeries,
} from '../domain/chart'
import { ApiError } from '../services/api'
import { Button } from '../components/ui/button'
import PageHeading from '../components/PageHeading.vue'
import PlayerCard from '../components/PlayerCard.vue'
import CardLiveStrip from '../components/CardLiveStrip.vue'
import CarrierRow from '../components/CarrierRow.vue'
import HistoryChart from '../components/HistoryChart.vue'
import ScoreBreakdown from '../components/ScoreBreakdown.vue'
import ProjectGroups from '../components/ProjectGroups.vue'
import '../styles/detail.css'
const store = useMonitorStore(),
  route = useRoute(),
  router = useRouter()
const node = computed(() => store.nodes.find((n) => n.id === Number(route.params.id)))
const score = computed(() => (node.value ? (store.scores[node.value.id] ?? emptyScore()) : null))
const tier = computed(() =>
  node.value && score.value ? (store.tiers[node.value.id] ?? nextTier(score.value.overall)) : 'silver',
)
const data = ref<HistoryResponse>(),
  busy = ref(false),
  error = ref('')
const ranges = computed(() => windows(store.me?.history_days || 7))
// The window and the chart tab live in the address, so a refresh or a shared link keeps them; defaults stay out.
function setQuery(key: string, value: string | undefined) {
  const query = { ...route.query }
  if (value === undefined) delete query[key]
  else query[key] = value
  // Without the fragment: the reader stays where they are instead of being scrolled back to a section.
  void router.replace({ query })
}
const hours = computed<number>({
  get: () => ranges.value.find((h) => String(h) === route.query.hours) ?? 6,
  set: (value) => setQuery('hours', value === 6 ? undefined : String(value)),
})
let generation = 0
async function load(force = false) {
  if (!node.value) return
  const epoch = ++generation,
    id = node.value.id
  busy.value = true
  error.value = ''
  try {
    const response = await store.history.get(id, hours.value, 'all', force)
    if (epoch === generation) {
      data.value = response
      if (hours.value <= 6) void store.loadPing(id)
      void store.loadQuality(id)
    }
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) store.unauthorized()
    else if (epoch === generation) error.value = e instanceof Error ? e.message : '历史数据加载失败'
  } finally {
    if (epoch === generation) busy.value = false
  }
}
watch(
  [() => node.value?.id, hours],
  () => {
    data.value = undefined
    void load()
  },
  { immediate: true },
)
// The tab names the node; the router's generic title lands first on every navigation, hash jumps included.
watch(
  [() => node.value?.name, () => route.fullPath],
  ([name]) => {
    if (name) document.title = `${name} · Football Monitor`
  },
  { immediate: true },
)
const timer = setInterval(() => {
  if (!document.hidden && !store.closed) void load()
}, 60000)
onBeforeUnmount(() => {
  generation++
  clearInterval(timer)
})
// History: resources as four full-width charts on one tab, probe latency on the other.
type HistoryTab = 'resources' | 'latency'
const HISTORY_TABS: { id: HistoryTab; label: string }[] = [
  { id: 'resources', label: '资源' },
  { id: 'latency', label: '网络延迟' },
]
const historyTab = computed<HistoryTab>({
  get: () => (route.query.chart === 'latency' ? 'latency' : 'resources'),
  set: (value) => setQuery('chart', value === 'latency' ? 'latency' : undefined),
})
// Left and right move between the two tabs, as a tab list is expected to.
function tabKey(event: KeyboardEvent) {
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
  event.preventDefault()
  const next = historyTab.value === 'resources' ? 'latency' : 'resources'
  historyTab.value = next
  void nextTick(() => document.getElementById(`history-tab-${next}`)?.focus())
}
const metrics = computed(() => data.value?.metrics || [])
const line = (pick: (p: MetricPoint) => number | null | undefined) =>
  metrics.value.map((p) => ({ ts: p.ts, value: pick(p) ?? null }))
// One shaded line in the page's own ink, as for every resource but the rates.
const shaded = (name: string, pick: (p: MetricPoint) => number | null | undefined): ChartSeries[] => [
  { name, color: 'var(--foreground)', fill: true, points: line(pick) },
]
const cpu = computed(() => {
  const top = cpuTop(Math.max(0, ...metrics.value.map((p) => p.cpu ?? 0)))
  // Steps of 15% while that leaves few lines, quarters on a busy machine's taller axis.
  const ticks = top / 15 <= 4 ? Array.from({ length: top / 15 + 1 }, (_, i) => i * 15) : [0, 25, 50, 75, 100]
  return { series: shaded('CPU', (p) => p.cpu), ticks }
})
// Memory and disk in bytes against their totals; a total Hub does not report falls back to the busiest sample.
const capacity = (key: 'mem_used' | 'disk_used', total: number | undefined, parts: number) => {
  const top = total || Math.max(1, ...metrics.value.map((p) => p[key] ?? 0))
  return {
    top,
    series: shaded(key === 'mem_used' ? '内存' : '硬盘', (p) => p[key]),
    ticks: Array.from({ length: parts + 1 }, (_, i) => (top * i) / parts),
  }
}
const memory = computed(() => capacity('mem_used', node.value?.mem_total, 4))
const disk = computed(() => capacity('disk_used', node.value?.disk_total, 2))
// Rates: the mean each way, and from a Hub that records it the busiest minute, dashed, with the gap shaded.
const peak = computed(() => windowPeak(metrics.value))
const network = computed(() => {
  const rx = line((p) => p.net_rx),
    tx = line((p) => p.net_tx)
  const series: ChartSeries[] = [
    { name: '下行', color: '#3b82f6', points: rx },
    { name: '上行', color: '#f59e0b', points: tx },
  ]
  const bands: ChartBand[] = []
  if (peak.value) {
    const rxTop = line((p) => p.net_rx_max ?? p.net_rx),
      txTop = line((p) => p.net_tx_max ?? p.net_tx)
    series.push(
      { name: '下行峰值', color: '#3b82f6', dashed: true, legend: false, points: rxTop },
      { name: '上行峰值', color: '#f59e0b', dashed: true, legend: false, points: txTop },
    )
    // One shade from the lower of the two means to the higher of the two peaks: two overlapping ones would
    // darken wherever they cross.
    const pair = (a: ChartPoint[], b: ChartPoint[], pick: (x: number, y: number) => number) =>
      a.map((p, i) => {
        const other = b[i]?.value ?? null
        return { ts: p.ts, value: p.value === null || other === null ? null : pick(p.value, other) }
      })
    bands.push({ color: '#94a3b8', low: pair(rx, tx, Math.min), high: pair(rxTop, txTop, Math.max) })
  }
  const axis = rateAxis(series.flatMap((s) => s.points.map((p) => p.value ?? 0)))
  return { series, bands, ticks: axis.ticks }
})
const rateText = (v: number) => `${bytes(v)}/s`
const networkTitle = computed(() =>
  peak.value
    ? `网络速率 · 窗口内峰值 ↓ ${rateText(peak.value.rx)} · ↑ ${rateText(peak.value.tx)}`
    : '网络速率',
)
// Latency: one card per probe, which shows or hides its line; one probe alone shows its range behind it.
const hiddenProbes = ref<number[]>([]),
  despiked = ref(false)
const ms = (v: number) => `${Number(v.toFixed(1))} ms`
const probes = computed(() => {
  const ping = data.value?.ping || []
  return [...new Set(ping.map((p) => p.task_id))].map((id, i) => {
    const own = ping.filter((p) => p.task_id === id)
    const ok = own.flatMap((p) => (p.latency === null ? [] : [p.latency]))
    return {
      id,
      name: data.value?.probes[id] || `任务 #${id}`,
      color: carriers[i % 3]!.color,
      mean: ok.length ? ok.reduce((a, b) => a + b, 0) / ok.length : null,
      loss: taskLoss(data.value, id) ?? 0,
      points: own.map((p) => ({
        ts: p.ts,
        value: p.latency,
        ...(p.loss ? { mark: `丢包 ${p.loss.toFixed(1)}%` } : {}),
      })),
      low: own.map((p) => ({ ts: p.ts, value: p.band?.[0] ?? null })),
      high: own.map((p) => ({ ts: p.ts, value: p.band?.[1] ?? null })),
      banded: own.some((p) => p.band),
    }
  })
})
// Should new data leave nothing shown, every line comes back.
const shownProbes = computed(() => {
  const shown = probes.value.filter((p) => !hiddenProbes.value.includes(p.id))
  return shown.length ? shown : probes.value
})
const probeShown = (id: number) => shownProbes.value.some((p) => p.id === id)
watch(
  () => node.value?.id,
  () => (hiddenProbes.value = []),
)
function toggleProbe(id: number) {
  if (hiddenProbes.value.includes(id)) hiddenProbes.value = hiddenProbes.value.filter((h) => h !== id)
  // The last line shown stays, so the chart never goes blank.
  else if (shownProbes.value.length > 1) hiddenProbes.value = [...hiddenProbes.value, id]
}
const latency = computed(() => {
  const smooth = (points: ChartPoint[]) => (despiked.value ? despike(points) : points)
  const series: ChartSeries[] = shownProbes.value.map((p) => ({
    name: p.name,
    color: p.color,
    points: smooth(p.points),
  }))
  const only = shownProbes.value.length === 1 ? shownProbes.value[0]! : null
  const bands: ChartBand[] = only?.banded
    ? [{ color: only.color, low: smooth(only.low), high: smooth(only.high) }]
    : []
  const values = [...series, ...bands.flatMap((b) => [{ points: b.low }, { points: b.high }])].flatMap((s) =>
    s.points.flatMap((p) => (p.value === null ? [] : [p.value])),
  )
  return { series, bands, ticks: latencyAxis(values).ticks }
})
const crumbs = computed(() => [
  { label: 'Football Monitor', to: '/' },
  { label: '首页', to: '/' },
  { label: node.value?.name ?? '服务器详情' },
])
const config = computed(() => store.config)
// Offline nodes keep their last report in `metrics`; never show it as a live value.
const live = computed(() => (node.value?.online ? node.value.metrics : null))
const tierNames: Record<Tier, string> = { gold: '金卡', silver: '银卡', bronze: '铜卡' }
const tierLabel = computed(() => {
  if (!node.value) return ''
  const template = nodeTemplate(config.value, node.value.id)
  return template === 'auto'
    ? `${tierNames[tier.value]} · 卡面自动（按评分）`
    : `${tierNames[tier.value]} · 卡面固定为${skinOf(template).name}`
})
const lastSeen = computed(() => {
  const n = node.value
  if (!n?.last_seen) return '—'
  const at = new Date(n.last_seen * 1000).toLocaleString('zh-CN', { hour12: false })
  if (n.last_seen_ago == null) return at
  return `${at}（${n.last_seen_ago < 60 ? '刚刚' : `${duration(n.last_seen_ago)}前`}）`
})
const showBilling = computed(() => config.value.show_billing || config.value.show_traffic)
const traffic = computed(() => {
  const n = node.value!
  const used = trafficUsed(n)
  return { used, share: n.traffic_limit > 0 ? percent(used, n.traffic_limit) : null }
})
// What the owner listed on this node; the section and its tab stay away when there is nothing.
const projects = computed(() =>
  node.value ? (store.config.nodes[String(node.value.id)]?.projects ?? []) : [],
)
const tabs = computed(() =>
  [
    { id: 'projects', label: '项目', show: projects.value.length > 0 },
    { id: 'billing', label: '费用与流量', show: showBilling.value },
    { id: 'carriers', label: '三网线路', show: config.value.show_carriers },
    { id: 'score', label: '评分明细', show: true },
    { id: 'history', label: '历史表现', show: true },
    { id: 'system', label: '系统信息', show: true },
  ].filter((t) => t.show),
)
// The sticky bar marks the section under it: the last one whose top has passed the bar.
const current = ref('')
function spy() {
  const bar = document.querySelector('.detail-tabs')
  if (!bar) return
  const line = bar.getBoundingClientRect().bottom + 24
  let found = tabs.value[0]?.id ?? ''
  for (const t of tabs.value) {
    const top = document.getElementById(t.id)?.getBoundingClientRect().top
    if (top !== undefined && top <= line) found = t.id
  }
  // The last section may be too short to ever reach the bar.
  const page = document.documentElement
  if (page.scrollHeight > innerHeight && innerHeight + scrollY >= page.scrollHeight - 2)
    found = tabs.value.at(-1)?.id ?? found
  current.value = found
}
onMounted(() => window.addEventListener('scroll', spy, { passive: true }))
onBeforeUnmount(() => window.removeEventListener('scroll', spy))
watch(tabs, () => void nextTick(spy), { immediate: true })
function jump(id: string) {
  const target = document.getElementById(id)
  if (!target) return
  const smooth = config.value.motion && !matchMedia('(prefers-reduced-motion: reduce)').matches
  target.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' })
  // Keep the router's own history state; only the fragment changes so the panel can be linked.
  window.history.replaceState(window.history.state, '', `${location.pathname}${location.search}#${id}`)
}
const carrierTasks = computed(() =>
  node.value
    ? carriers.map((c) => {
        const r = resolveCarrier(
          config.value.nodes[node.value!.id]?.carriers?.[c.id],
          store.ping[node.value!.id],
          Date.now() / 1000,
          !!store.pingErrors[node.value!.id],
        )
        return {
          ...c,
          ...r,
          probe: r.taskId ? data.value?.probes[String(r.taskId)] : undefined,
          loss: r.taskId ? taskLoss(data.value, r.taskId) : null,
        }
      })
    : [],
)
// Probes with loss that are not tied to a carrier row, so they are not lost from view.
const otherLoss = computed(() => {
  const shown = new Set(carrierTasks.value.map((c) => c.taskId))
  return Object.entries(data.value?.loss ?? {})
    .filter(([id]) => !shown.has(Number(id)))
    .map(([id, loss]) => ({ id, name: data.value!.probes[id] || `任务 #${id}`, loss }))
})
const pct = (loss: number) => `${Number(loss.toFixed(1))}%`
</script>
<template>
  <PageHeading
    class="detail-head"
    :crumbs="crumbs"
    :title="node?.name ?? '服务器详情'"
    :description="node ? node.public_remark || '节点信息由 Monitor Hub 提供。' : undefined"
  >
    <template v-if="node">
      <span class="detail-status" :class="{ offline: !node.online }"
        ><i aria-hidden="true" />{{ node.online ? '在线' : '离线' }}</span
      >
      <Button v-if="store.me?.authed" as-child
        ><RouterLink :to="`/settings?node=${node.id}&tab=node`"
          ><Settings2 :size="15" /> 配置此节点</RouterLink
        ></Button
      >
    </template>
  </PageHeading>
  <div v-if="!node" class="empty-state panel">
    <h2>{{ store.loading ? '正在读取节点…' : '这个节点暂时不在阵容中' }}</h2>
    <p>{{ store.closed ? '请先登录 Hub。' : '节点可能已移除、设为私有，或暂时无法加载。' }}</p>
    <RouterLink to="/" class="primary-link">返回首页</RouterLink>
  </div>
  <template v-else>
    <nav class="detail-tabs" aria-label="详情分区">
      <a
        v-for="t in tabs"
        :key="t.id"
        :href="`#${t.id}`"
        :aria-current="current === t.id ? 'location' : undefined"
        @click.prevent="jump(t.id)"
        >{{ t.label }}</a
      >
    </nav>
    <div class="detail-layout">
      <aside class="detail-card-column">
        <PlayerCard
          v-if="score"
          :node="node"
          :config="store.config"
          :score="score"
          :tier="tier"
          size="lg"
          :interactive="false"
        />
        <CardLiveStrip
          :node="node"
          :node-config="store.config.nodes[node.id]"
          :history="store.ping[node.id]"
          :unavailable="!!store.pingErrors[node.id]"
          :show-carriers="store.config.show_carriers"
        />
        <section class="detail-basic panel" aria-labelledby="basic-title">
          <h2 id="basic-title" class="detail-section-title">基本信息</h2>
          <dl class="detail-list">
            <div>
              <dt>档位</dt>
              <dd>{{ tierLabel }}</dd>
            </div>
            <div>
              <dt>分组</dt>
              <dd>{{ node.group || '未分组' }}</dd>
            </div>
            <div>
              <dt>国家 / 地区</dt>
              <dd>{{ countryName(node.country) }}{{ node.country ? ` · ${node.country}` : '' }}</dd>
            </div>
            <div>
              <dt>最后上报</dt>
              <dd>{{ lastSeen }}</dd>
            </div>
          </dl>
        </section>
      </aside>
      <div class="detail-content">
        <section
          v-if="projects.length"
          id="projects"
          class="detail-section detail-projects panel"
          aria-labelledby="projects-title"
        >
          <h2 id="projects-title" class="detail-section-title">部署的项目</h2>
          <ProjectGroups :projects="projects" />
        </section>
        <section v-if="showBilling" id="billing" class="detail-section" aria-labelledby="billing-title">
          <h2 id="billing-title" class="detail-section-title">费用与流量</h2>
          <div class="billing-blocks">
            <div v-if="store.config.show_billing" class="billing-block billing-fee panel">
              <span>费用 / 周期</span>
              <strong>{{ money(node.price, node.currency) }}</strong>
              <small>{{ node.price ? `每${cycle(node.billing_cycle)}` : '未设置计费周期' }}</small>
            </div>
            <div v-if="store.config.show_billing" class="billing-block billing-expiry panel">
              <span>到期状态</span>
              <strong>{{ expiry(node) }}</strong>
              <small>{{ node.expires_at ? `到期日 ${node.expires_at}` : '长期有效或未填写' }}</small>
            </div>
            <div v-if="store.config.show_traffic" class="billing-block billing-traffic panel">
              <span>本周期流量 / 配额</span>
              <strong
                >{{ bytes(traffic.used) }}
                <small>/ {{ node.traffic_limit > 0 ? bytes(node.traffic_limit) : '不限量' }}</small></strong
              >
              <div v-if="traffic.share !== null" class="traffic-bar" aria-hidden="true">
                <i :style="{ width: `${traffic.share}%` }" />
              </div>
              <small>{{
                traffic.share !== null
                  ? `已用 ${Number(traffic.share.toFixed(1))}% · 每月 ${node.traffic_reset_day} 日重置`
                  : '本周期不限流量'
              }}</small>
            </div>
            <div v-if="store.config.show_traffic" class="billing-block billing-today panel">
              <span>今日流量</span>
              <strong
                ><span class="billing-today-part">↓ {{ bytes(node.day_rx) }}</span> ·
                <span class="billing-today-part">↑ {{ bytes(node.day_tx) }}</span></strong
              >
              <small>合计 {{ bytes(node.day_rx + node.day_tx) }}</small>
            </div>
          </div>
        </section>
        <section
          v-if="store.config.show_carriers"
          id="carriers"
          class="detail-section detail-carriers panel"
          aria-labelledby="carriers-title"
        >
          <div class="section-heading">
            <h2 id="carriers-title">三网线路</h2>
            <span>明确任务关联 · 不推断线路</span>
          </div>
          <CarrierRow
            :config="store.config.nodes[node.id]"
            :history="store.ping[node.id]"
            :unavailable="!!store.pingErrors[node.id]"
          />
          <ul class="carrier-tasks">
            <li v-for="c in carrierTasks" :key="c.id" :style="{ '--carrier': c.color }">
              <span class="carrier-task-name"
                ><img class="carrier-logo" :src="c.logo" alt="" aria-hidden="true" decoding="async" />{{
                  c.name
                }}
                · {{ c.line }}</span
              >
              <span>{{ c.taskId ? `任务 #${c.taskId}${c.probe ? ` ${c.probe}` : ''}` : '未配置探测' }}</span>
              <span>当前 {{ c.latency === null ? c.label : `${Number(c.latency.toFixed(1))} ms` }}</span>
              <span v-if="c.loss === null" class="carrier-task-loss"
                >丢包 {{ c.taskId && !data ? '读取中' : '暂无数据' }}</span
              >
              <span
                v-else
                class="carrier-task-loss"
                :data-level="lossLevel(c.loss)"
                :style="{ '--loss': lossColor(c.loss) }"
                :title="`近 ${windowLabel(hours)}内探测失败的比例`"
                >丢包 <b>{{ pct(c.loss) }}</b><em>{{ lossGrade(c.loss) }}</em></span
              >
            </li>
          </ul>
          <div v-if="otherLoss.length" class="carrier-others">
            <h3>其他探测任务</h3>
            <ul>
              <li
                v-for="o in otherLoss"
                :key="o.id"
                class="carrier-other-loss"
                :data-level="lossLevel(o.loss)"
                :style="{ '--loss': lossColor(o.loss) }"
                :title="`近 ${windowLabel(hours)}内探测失败的比例`"
              >
                <span>{{ o.name }}</span> <b>{{ pct(o.loss) }}</b><em>{{ lossGrade(o.loss) }}</em>
              </li>
            </ul>
          </div>
          <ul class="carrier-notes">
            <li>
              <Clock :size="16" aria-hidden="true" /><span
                ><strong>延迟</strong>节点向目标发起 TCP 连接的握手时延，不等于访客到 VPS 的访问延迟</span
              >
            </li>
            <li>
              <Activity :size="16" aria-hidden="true" /><span
                ><strong>丢包</strong>近
                {{ windowLabel(hours) }}内探测失败的比例，随“历史表现”的时间范围切换，0% 即没有丢包</span
              >
            </li>
            <li>
              <Tag :size="16" aria-hidden="true" /><span
                ><strong>线路名称</strong>由站长配置，不自动推断</span
              >
            </li>
          </ul>
        </section>
        <section v-if="score" id="score" class="detail-section detail-score panel" aria-label="评分明细">
          <ScoreBreakdown
            :node="node"
            :score="score"
            :ping="store.ping[node.id]"
            :ping-unavailable="!!store.pingErrors[node.id]"
          />
        </section>
        <section id="history" class="detail-section" aria-labelledby="history-title">
          <div class="range-toolbar">
            <h2 id="history-title" class="detail-section-title">
              历史表现 <small v-if="busy" class="muted text-xs">读取中…</small>
            </h2>
            <div class="range-buttons" role="group" aria-label="历史时间范围">
              <button
                v-for="h in ranges"
                :key="h"
                type="button"
                :class="{ selected: hours === h }"
                :aria-pressed="hours === h"
                @click="hours = h"
              >
                {{ windowLabel(h) }}</button><Button
                variant="ghost"
                size="icon"
                aria-label="刷新历史"
                :disabled="busy"
                @click="load(true)"
                ><RefreshCw :size="13"
              /></Button>
            </div>
          </div>
          <div v-if="error" class="inline-notice" role="alert">
            {{ error }}<Button variant="ghost" size="sm" @click="load(true)">重新读取</Button>
          </div>
          <div class="history-tabs" role="tablist" aria-label="历史图表">
            <button
              v-for="t in HISTORY_TABS"
              :id="`history-tab-${t.id}`"
              :key="t.id"
              role="tab"
              type="button"
              aria-controls="history-panel"
              :aria-selected="historyTab === t.id"
              :tabindex="historyTab === t.id ? 0 : -1"
              @click="historyTab = t.id"
              @keydown="tabKey"
            >
              {{ t.label }}
            </button>
          </div>
          <div
            id="history-panel"
            class="history-charts panel"
            :aria-busy="busy"
            role="tabpanel"
            :aria-labelledby="`history-tab-${historyTab}`"
          >
            <template v-if="historyTab === 'resources'">
              <HistoryChart
                class="stacked"
                title="CPU"
                :series="cpu.series"
                unit="%"
                :ticks="cpu.ticks"
                :height="180"
                legend="none"
                :step="data?.step"
              />
              <HistoryChart
                class="stacked"
                :title="`内存 · ${bytes(memory.top, 2)}`"
                :series="memory.series"
                unit=""
                :ticks="memory.ticks"
                :format="(v: number) => bytes(v, 2)"
                :height="180"
                legend="none"
                :step="data?.step"
              />
              <HistoryChart
                class="stacked"
                :title="networkTitle"
                :series="network.series"
                :bands="network.bands"
                unit=""
                scale="log"
                :ticks="network.ticks"
                :format="rateText"
                :height="200"
                legend="top"
                note="对数刻度"
                :step="data?.step"
              >
                <template v-if="peak" #legend>
                  <span class="chart-key"><i class="solid" />平均</span>
                  <span class="chart-key"><i class="dashed" />峰值（一分钟内最高）</span>
                </template>
              </HistoryChart>
              <HistoryChart
                class="stacked"
                :title="`硬盘 · ${bytes(disk.top)}`"
                :series="disk.series"
                unit=""
                :ticks="disk.ticks"
                :format="(v: number) => bytes(v)"
                :height="120"
                legend="none"
                :step="data?.step"
              />
            </template>
            <HistoryChart
              v-else
              class="stacked"
              title="TCP 延迟历史"
              :height="300"
              :series="latency.series"
              :bands="latency.bands"
              :ticks="latency.ticks"
              unit=" ms"
              legend="none"
              :step="data?.step"
            >
              <template v-if="probes.length" #toolbar>
                <div class="probe-bar">
                  <div class="probe-chips" aria-label="显示或隐藏线路">
                    <button
                      v-for="p in probes"
                      :key="p.id"
                      type="button"
                      class="probe-chip"
                      :aria-pressed="probeShown(p.id)"
                      @click="toggleProbe(p.id)"
                    >
                      <i :style="{ background: p.color }" /><span class="probe-name">{{ p.name }}</span
                      ><span class="probe-stats"
                        ><b>平均 {{ p.mean === null ? '—' : ms(p.mean) }}</b
                        ><em v-if="p.loss > 0">丢 {{ Number(p.loss.toFixed(1)) }}%</em></span
                      >
                    </button>
                  </div>
                  <label class="probe-despike"><input v-model="despiked" type="checkbox" />削峰</label>
                </div>
              </template>
            </HistoryChart>
          </div>
        </section>
        <section id="system" class="detail-section detail-system panel" aria-labelledby="system-title">
          <h2 id="system-title" class="detail-section-title">系统信息</h2>
          <dl class="fact-grid">
            <div class="fact">
              <dt>处理器</dt>
              <dd>{{ node.cpu_name || '—' }} / {{ node.cpu_cores || '—' }} 核</dd>
            </div>
            <div class="fact">
              <dt>操作系统 / 架构</dt>
              <dd>{{ node.os || '—' }} · {{ node.arch || '—' }}</dd>
            </div>
            <div class="fact">
              <dt>内核</dt>
              <dd>{{ node.kernel || '—' }}</dd>
            </div>
            <div class="fact">
              <dt>虚拟化 / Agent</dt>
              <dd>{{ node.virt || '—' }} / {{ node.agent_version || '—' }}</dd>
            </div>
            <div class="fact">
              <dt>TCP / UDP / 进程</dt>
              <dd>{{ live?.tcp ?? '—' }} / {{ live?.udp ?? '—' }} / {{ live?.procs ?? '—' }}</dd>
            </div>
            <div class="fact">
              <dt>节点 ID</dt>
              <dd>#{{ node.id }}</dd>
            </div>
          </dl>
        </section>
      </div>
    </div>
  </template>
</template>
