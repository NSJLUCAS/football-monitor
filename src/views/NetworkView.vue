<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ChevronDown, Server, WifiOff } from '@lucide/vue'
import { useMonitorStore } from '../stores/monitor'
import { carriers, levelColor } from '../domain/carriers'
import { windowLabel, windows } from '../domain/format'
import {
  LOSS_ALERT,
  nodeQuality,
  qualityBar,
  sortNodes,
  type NetworkSort,
  type Source,
} from '../domain/network'
import type { HistoryResponse } from '../domain/types'
import { ApiError } from '../services/api'
import { Button } from '../components/ui/button'
import PageHeading from '../components/PageHeading.vue'
import NetworkRow from '../components/NetworkRow.vue'
import QualityBar from '../components/QualityBar.vue'
import '../styles/network.css'
const store = useMonitorStore(),
  route = useRoute(),
  router = useRouter(),
  group = ref<string | null>(null)
const crumbs = [{ label: 'Football Monitor', to: '/' }, { label: '网络质量' }]
const SORTS: { id: NetworkSort; label: string }[] = [
  { id: 'hub', label: 'Hub 顺序' },
  { id: 'latency', label: '综合延迟' },
  { id: 'loss', label: '丢包' },
  { id: 'jitter', label: '抖动' },
]
const LEGEND = [
  { level: 0, label: '≤60ms' },
  { level: 1, label: '≤120ms' },
  { level: 2, label: '≤200ms 或丢包 <3%' },
  { level: 3, label: '≤300ms 或丢包 <10%' },
  { level: 4, label: '更高或丢包 ≥10%' },
]
// Window, order and the offline switch live in the address beside the header search; defaults stay out of it.
function setQuery(key: string, value: string | undefined) {
  const query = { ...route.query }
  if (value === undefined) delete query[key]
  else query[key] = value
  void router.replace({ query })
}
const ranges = computed(() => windows(store.me?.history_days || 7))
const hours = computed<number>({
  get: () => ranges.value.find((h) => String(h) === route.query.hours) ?? 24,
  set: (value) => setQuery('hours', value === 24 ? undefined : String(value)),
})
const sort = computed<NetworkSort>({
  get: () => SORTS.find((s) => s.id === route.query.sort)?.id ?? 'hub',
  set: (value) => setQuery('sort', value === 'hub' ? undefined : value),
})
const showOffline = computed<boolean>({
  get: () => route.query.offline !== '0',
  set: (value) => setQuery('offline', value ? undefined : '0'),
})
const search = computed(() => (typeof route.query.q === 'string' ? route.query.q.toLowerCase().trim() : ''))
const matched = computed(() =>
  store.nodes.filter(
    (n) =>
      (group.value === null || n.group === group.value) &&
      `${n.name} ${n.group} ${n.public_remark}`.toLowerCase().includes(search.value),
  ),
)
const onlineIds = computed(() => store.nodes.filter((n) => n.online).map((n) => n.id))

// The day comes from the home page's score prefetch; other windows are fetched here, one request per node.
const extra = ref<Record<number, HistoryResponse>>({}),
  failures = ref<Record<number, string>>({}),
  now = ref(Date.now() / 1000)
let generation = 0,
  shown = 24
function load() {
  const epoch = ++generation,
    window = hours.value
  for (const id of onlineIds.value)
    store.history.get(id, window, 'ping', false, 0).then(
      (result) => {
        if (epoch !== generation) return
        extra.value[id] = result
        delete failures.value[id]
      },
      (e: unknown) => {
        if (e instanceof ApiError && e.status === 401) store.unauthorized()
        else if (epoch === generation)
          failures.value[id] = e instanceof Error ? e.message : '历史数据加载失败'
      },
    )
}
// Requests still queued for a window the page has left would hold up the next one and the Hub's shared slots.
function dropWindow(window: number) {
  if (window !== 24) store.history.drop((_id, h, series) => series === 'ping' && h === window)
}
function refresh() {
  now.value = Date.now() / 1000
  if (hours.value === 24) {
    for (const id of onlineIds.value)
      if (!store.quality[id] && !store.qualityErrors[id]) void store.loadQuality(id, false, 0)
  } else load()
}
watch(
  [hours, () => onlineIds.value.join()],
  ([window], previous) => {
    // A new window starts empty; a changed node list keeps what has already arrived.
    if (window !== previous?.[0]) {
      if (previous?.[0] !== undefined) dropWindow(previous[0])
      shown = window
      generation++
      extra.value = {}
      failures.value = {}
    }
    refresh()
  },
  { immediate: true },
)
const timer = setInterval(() => {
  if (!document.hidden && !store.closed) {
    // The day follows the store's own pace; its ten-minute guard keeps this cheap.
    if (hours.value === 24) for (const id of onlineIds.value) void store.loadQuality(id, false, 0)
    refresh()
  }
}, 60000)
onBeforeUnmount(() => {
  // The route has already moved on by now, so the window comes from what was last loaded.
  dropWindow(shown)
  generation++
  clearInterval(timer)
})

const rows = computed(() => {
  const list = matched.value
    .filter((n) => showOffline.value || n.online)
    .map((node) => {
      const history = node.online
        ? hours.value === 24
          ? store.quality[node.id]
          : extra.value[node.id]
        : undefined
      const quality = history ? nodeQuality(history, store.config.nodes[String(node.id)]) : null
      return {
        node,
        history,
        quality,
        segments:
          history && quality
            ? qualityBar([{ history, taskIds: quality.lines }], hours.value, now.value)
            : null,
        failed:
          node.online &&
          !history &&
          Boolean(hours.value === 24 ? store.qualityErrors[node.id] : failures.value[node.id]),
      }
    })
  return sortNodes(list, sort.value)
})
const summary = computed(() => {
  const online = matched.value.filter((n) => n.online),
    loaded = rows.value.filter((r) => r.node.online && r.history && r.quality)
  const sources: Source[] = loaded.map((r) => ({ history: r.history!, taskIds: r.quality!.lines }))
  return {
    online: online.length,
    total: matched.value.length,
    lines: loaded.reduce((sum, r) => sum + r.quality!.lines.length, 0),
    lossy: loaded.reduce((sum, r) => sum + r.quality!.lossyLines, 0),
    bar: loaded.length ? qualityBar(sources, hours.value, now.value) : null,
    // Sweeps only while an online node still has neither probes nor a failure.
    pending: rows.value.some((r) => r.node.online && !r.history && !r.failed),
  }
})
function clearFilters() {
  group.value = null
  const query = { ...route.query }
  delete query.q
  delete query.offline
  void router.replace({ query })
}
</script>
<template>
  <PageHeading :crumbs="crumbs" title="网络质量" description="所有节点各条探测线路的延迟、丢包与抖动。">
    <template v-if="!store.closed" #tabs>
      <div class="group-tabs" role="group" aria-label="节点分组">
        <button :class="{ selected: group === null }" :aria-pressed="group === null" @click="group = null">
          全部节点 <small>{{ store.nodes.length }}</small></button
        ><button
          v-for="g in store.groups"
          :key="g"
          :class="{ selected: group === g }"
          :aria-pressed="group === g"
          @click="group = g"
        >
          {{ g }}</button
        ><button
          v-if="store.groups.length && store.nodes.some((n) => !n.group)"
          :class="{ selected: group === '' }"
          :aria-pressed="group === ''"
          @click="group = ''"
        >
          未分组
        </button>
      </div>
    </template>
  </PageHeading>
  <div v-if="store.closed" class="empty-state panel" role="alert">
    <WifiOff :size="34" />
    <h2>此刻，主场暂未开放</h2>
    <p>{{ store.error }}</p>
    <a class="primary-link" href="/admin/">前往 Hub 登录 ↗</a
    ><Button variant="outline" @click="store.bootstrap">重新检查</Button>
  </div>
  <div v-else-if="store.loading && !store.nodes.length" class="network-loading panel" aria-busy="true">
    <QualityBar :segments="null" label="正在加载节点" />
  </div>
  <div v-else-if="!store.nodes.length" class="empty-state panel">
    <Server :size="32" />
    <h3>{{ store.error ? '暂时无法获取节点' : '阵容正在等待第一位球员' }}</h3>
    <p>请在 Monitor Hub 中添加节点，并允许在公开页显示。</p>
  </div>
  <template v-else>
    <section class="network-summary panel" aria-label="网络质量概览">
      <span class="ns-title"><i class="ns-dot" aria-hidden="true" />网络质量</span>
      <QualityBar
        class="ns-bar"
        :segments="summary.bar"
        :loading="summary.pending"
        :label="`全站近 ${windowLabel(hours)}质量走势`"
      />
      <span class="ns-window">过去 {{ windowLabel(hours) }}</span>
      <span class="ns-stats"
        ><span class="ns-online"
          ><b>{{ summary.online }}/{{ summary.total }}</b> 在线</span
        ><span class="ns-lines"
          ><b>{{ summary.lines }}</b> 条线路</span
        ><span v-if="summary.lossy" class="ns-lossy" :title="`所选时段丢包 ≥${LOSS_ALERT}% 的线路`"
          >{{ summary.lossy }} 条丢包</span
        ></span
      >
      <span class="ns-ranges" role="group" aria-label="时间范围"
        ><button
          v-for="h in ranges"
          :key="h"
          type="button"
          :class="{ selected: hours === h }"
          :aria-pressed="hours === h"
          @click="hours = h"
        >
          {{ windowLabel(h) }}
        </button></span
      >
    </section>
    <div class="network-controls">
      <label class="network-offline" for="network-offline"
        ><input id="network-offline" v-model="showOffline" type="checkbox" />显示离线</label
      >
      <label class="sort-control" for="network-sort"
        >排序<span class="sort-select"
          ><select id="network-sort" v-model="sort">
            <option v-for="s in SORTS" :key="s.id" :value="s.id">{{ s.label }}</option></select
          ><ChevronDown :size="14" aria-hidden="true" /></span
      ></label>
    </div>
    <div v-if="!rows.length" class="empty-state panel">
      <Server :size="32" />
      <h3>没有找到匹配的节点</h3>
      <p>试试其他名称，或切换分组。</p>
      <Button variant="outline" @click="clearFilters">查看全部节点</Button>
    </div>
    <section
      v-else
      class="network-table panel"
      :data-carriers="store.config.show_carriers"
      aria-label="节点网络质量"
    >
      <div class="network-head" aria-hidden="true">
        <span
          >节点 <small>{{ rows.length }}</small></span
        >
        <span
          >质量走势<small>过去 {{ windowLabel(hours) }}</small></span
        >
        <span>综合<small>全部线路均值</small></span>
        <template v-if="store.config.show_carriers">
          <span v-for="c in carriers" :key="c.id" :data-carrier="c.id"
            >{{ c.short }}<small>延迟 · 丢包</small></span
          >
        </template>
        <span
          >最近丢包<small>丢包 ≥{{ LOSS_ALERT }}%</small></span
        >
        <span>抖动<small>延迟波动</small></span>
      </div>
      <NetworkRow
        v-for="r in rows"
        :key="r.node.id"
        :node="r.node"
        :quality="r.quality"
        :segments="r.segments"
        :show-carriers="store.config.show_carriers"
        :failed="r.failed"
        :now="now"
      />
    </section>
    <ul class="network-legend" aria-label="颜色说明">
      <li v-for="l in LEGEND" :key="l.level">
        <i :style="{ background: levelColor(l.level) }" aria-hidden="true" />{{ l.label }}
      </li>
    </ul>
  </template>
</template>
