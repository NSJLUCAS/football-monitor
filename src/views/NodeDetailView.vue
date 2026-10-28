<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { RefreshCw, Settings2 } from '@lucide/vue'
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
import type { HistoryResponse } from '../domain/types'
import { emptyScore, nextTier, type Tier } from '../domain/score'
import { carriers, resolveCarrier } from '../domain/carriers'
import { nodeTemplate, skinOf } from '../domain/skins'
import type { ChartSeries } from '../domain/chart'
import { ApiError } from '../services/api'
import { Button } from '../components/ui/button'
import PageHeading from '../components/PageHeading.vue'
import PlayerCard from '../components/PlayerCard.vue'
import CardLiveStrip from '../components/CardLiveStrip.vue'
import CarrierRow from '../components/CarrierRow.vue'
import HistoryChart from '../components/HistoryChart.vue'
import ScoreBreakdown from '../components/ScoreBreakdown.vue'
const store = useMonitorStore(),
  route = useRoute()
const node = computed(() => store.nodes.find((n) => n.id === Number(route.params.id)))
const score = computed(() => (node.value ? (store.scores[node.value.id] ?? emptyScore()) : null))
const tier = computed(() =>
  node.value && score.value ? (store.tiers[node.value.id] ?? nextTier(score.value.overall)) : 'silver',
)
const hours = ref(6),
  data = ref<HistoryResponse>(),
  busy = ref(false),
  error = ref('')
const ranges = computed(() => windows(store.me?.history_days || 7))
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
const timer = setInterval(() => {
  if (!document.hidden && !store.closed) void load()
}, 60000)
onBeforeUnmount(() => {
  generation++
  clearInterval(timer)
})
const resource = (key: 'cpu' | 'mem_used' | 'disk_used', name: string, color: string): ChartSeries[] => [
  {
    name,
    color,
    points: (data.value?.metrics || []).map((p) => ({
      ts: p.ts,
      value:
        key === 'cpu'
          ? p.cpu
          : percent(p[key], key === 'mem_used' ? node.value?.mem_total : node.value?.disk_total),
    })),
  },
]
const network = computed<ChartSeries[]>(() =>
  ['net_rx', 'net_tx'].map((key, i) => ({
    name: i ? '上传' : '下载',
    color: i ? '#60a5fa' : '#4ade80',
    points: (data.value?.metrics || []).map((p) => ({
      ts: p.ts,
      value: p[key as 'net_rx' | 'net_tx'] === null ? null : p[key as 'net_rx' | 'net_tx']! / 1024 ** 2,
    })),
  })),
)
const pingSeries = computed<ChartSeries[]>(() => {
  const ids = [...new Set((data.value?.ping || []).map((p) => p.task_id))]
  return ids.map((id, i) => ({
    name: data.value?.probes[id] || `任务 #${id}`,
    color: carriers[i % 3]!.color,
    points: (data.value?.ping || [])
      .filter((p) => p.task_id === id)
      .map((p) => ({ ts: p.ts, value: p.latency })),
  }))
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
const tabs = computed(() =>
  [
    { id: 'billing', label: '费用与流量', show: showBilling.value },
    { id: 'carriers', label: '三网线路', show: config.value.show_carriers },
    { id: 'score', label: '评分明细', show: true },
    { id: 'history', label: '历史表现', show: true },
    { id: 'system', label: '系统信息', show: true },
  ].filter((t) => t.show),
)
function jump(id: string) {
  const target = document.getElementById(id)
  if (!target) return
  const smooth = config.value.motion && !matchMedia('(prefers-reduced-motion: reduce)').matches
  target.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' })
  // Keep the router's own history state; only the fragment changes so the panel can be linked.
  window.history.replaceState(window.history.state, '', `#${id}`)
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
        const key = r.taskId === undefined ? '' : String(r.taskId)
        return {
          ...c,
          ...r,
          probe: key ? data.value?.probes[key] : undefined,
          loss: key ? data.value?.loss[key] : undefined,
        }
      })
    : [],
)
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
        ><RouterLink :to="`/settings?node=${node.id}`"
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
      <a v-for="t in tabs" :key="t.id" :href="`#${t.id}`" @click.prevent="jump(t.id)">{{ t.label }}</a>
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
              <span class="carrier-task-name"><i aria-hidden="true" />{{ c.name }} · {{ c.line }}</span>
              <span>{{ c.taskId ? `任务 #${c.taskId}${c.probe ? ` ${c.probe}` : ''}` : '未配置探测' }}</span>
              <span>当前 {{ c.latency === null ? c.label : `${Number(c.latency.toFixed(1))} ms` }}</span>
              <span>窗口丢包 {{ c.loss === undefined ? '—' : `${c.loss.toFixed(1)}%` }}</span>
            </li>
          </ul>
          <p>节点向目标发起 TCP 连接的握手时延，不保证等于访客到 VPS 的访问延迟。线路名称由站长配置。</p>
          <p v-if="data && Object.keys(data.loss).length">
            整个窗口探测丢包率：<span v-for="(loss, id) in data.loss" :key="id"
              >{{ data.probes[id] || `#${id}` }} {{ loss.toFixed(1) }}%
            </span>
          </p>
        </section>
        <section v-if="score" id="score" class="detail-section detail-score panel" aria-label="评分明细">
          <ScoreBreakdown :node="node" :score="score" />
        </section>
        <section id="history" class="detail-section" aria-labelledby="history-title">
          <div class="range-toolbar">
            <h2 id="history-title" class="detail-section-title">
              历史表现 <small v-if="busy" class="muted text-xs">读取中…</small>
            </h2>
            <div class="range-buttons" aria-label="历史时间范围">
              <button v-for="h in ranges" :key="h" :class="{ selected: hours === h }" @click="hours = h">
                {{ windowLabel(h) }}</button
              ><Button variant="ghost" size="icon" aria-label="刷新历史" :disabled="busy" @click="load(true)"
                ><RefreshCw :size="13"
              /></Button>
            </div>
          </div>
          <div v-if="error" class="inline-notice" role="alert">
            {{ error }}<Button variant="ghost" size="sm" @click="load(true)">重新读取</Button>
          </div>
          <div class="charts-grid" :aria-busy="busy">
            <HistoryChart
              title="CPU 使用率"
              :series="resource('cpu', 'CPU', '#ff7a1a')"
              unit="%"
              :maximum="100"
              :step="data?.step"
            /><HistoryChart
              title="内存使用率"
              :series="resource('mem_used', '内存', '#a78bfa')"
              unit="%"
              :maximum="100"
              :step="data?.step"
            /><HistoryChart title="网络速率" :series="network" unit=" MB/s" :step="data?.step" /><HistoryChart
              title="硬盘使用率"
              :series="resource('disk_used', '硬盘', '#64748b')"
              unit="%"
              :maximum="100"
              :step="data?.step"
            /><HistoryChart
              class="wide"
              title="TCP 延迟历史"
              :height="200"
              :series="pingSeries"
              unit=" ms"
              :step="data?.step"
            />
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
