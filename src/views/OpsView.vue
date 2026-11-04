<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { ArrowLeft, Maximize, Minimize, Server, WifiOff } from '@lucide/vue'
import { useMonitorStore } from '../stores/monitor'
import type { MonitorNode } from '../domain/types'
import { bytes, countryName } from '../domain/format'
import { flagUrl } from '../domain/flags'
import {
  STALE_AFTER,
  countryCard,
  countryMarkers,
  diffEvents,
  eventBadge,
  issueList,
  issueText,
  metricChanges,
  nodeAlerts,
  nodeCard,
  pastLoss,
  shouldReload,
  snapshot,
  statusCounts,
  tourStops,
  type Change,
  type NodeAlert,
  type OpsEvent,
  type Places,
  type WallSnapshot,
} from '../domain/ops'
import centroids from '../domain/centroids.json'
import OpsCard from '../components/OpsCard.vue'
import OpsGlobe from '../components/OpsGlobe.vue'
import RollingNumber from '../components/RollingNumber.vue'
import Sparkline from '../components/Sparkline.vue'
import '../styles/ops.css'
const store = useMonitorStore(),
  route = useRoute()
// Where each country's nodes sit on the globe (npm run centroids).
const places = centroids as unknown as Places
const STOP_MS = 6000,
  MAX_ISSUES = 9

// One clock drives the time, the offline figures and the out-of-date check.
const now = ref(Date.now())
const seconds = computed(() => Math.floor(now.value / 1000))
const pad = (n: number) => String(n).padStart(2, '0')
const stamp = (ms: number | null) => {
  if (ms === null) return '—'
  const d = new Date(ms)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}
const time = computed(() => stamp(now.value))
const date = computed(() => {
  const d = new Date(now.value)
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日 · 周${'日一二三四五六'[d.getDay()]}`
})

// `?group=` narrows the wall to one group; an unknown one shows everything and says so.
const group = computed(() => (typeof route.query.group === 'string' ? route.query.group : null))
const groupMissing = computed(
  () => group.value !== null && store.nodes.length > 0 && !store.nodes.some((n) => n.group === group.value),
)
const nodes = computed(() =>
  group.value === null || groupMissing.value
    ? store.nodes
    : store.nodes.filter((n) => n.group === group.value),
)
const alerts = computed(() => {
  const result: Record<number, NodeAlert[]> = {}
  for (const n of nodes.value) result[n.id] = nodeAlerts(n, store.ping[n.id], store.config, seconds.value)
  return result
})
const counts = computed(() => statusCounts(nodes.value, alerts.value))
const issues = computed(() => issueList(nodes.value, alerts.value))
const globe = computed(() => countryMarkers(nodes.value, alerts.value, places))
const stops = computed(() => tourStops(issues.value, places))
const online = computed(() => nodes.value.filter((n) => n.online))
const average = computed(() => {
  const s = online.value.map((n) => store.scores[n.id]?.overall).filter((v): v is number => v != null)
  return s.length ? Math.round(s.reduce((a, b) => a + b, 0) / s.length) : null
})

// Site-wide rates, one point per arrival of node data since the page opened; nothing is made up before that.
const rateUp = ref<number[]>([]),
  rateDown = ref<number[]>([])
const sum = (key: 'net_tx' | 'net_rx') => online.value.reduce((s, n) => s + (n.metrics?.[key] ?? 0), 0)
watch(
  () => store.updatedAt,
  (at) => {
    if (at === null || !nodes.value.length) return
    rateUp.value = [...rateUp.value, sum('net_tx')].slice(-60)
    rateDown.value = [...rateDown.value, sum('net_rx')].slice(-60)
  },
  { immediate: true },
)
const scaled = (value: number | undefined) => {
  if (value === undefined) return { value: null, unit: 'B/s' }
  const units = ['B/s', 'KB/s', 'MB/s', 'GB/s'],
    i = Math.min(3, Math.max(0, Math.floor(Math.log(value || 1) / Math.log(1024))))
  return { value: value / 1024 ** i, unit: units[i]! }
}
const up = computed(() => scaled(rateUp.value.at(-1))),
  down = computed(() => scaled(rateDown.value.at(-1)))
const totals = computed(() => ({
  up: nodes.value.reduce((s, n) => s + n.total_tx, 0),
  down: nodes.value.reduce((s, n) => s + n.total_rx, 0),
}))

const connectionText = computed(
  () =>
    ({
      connecting: '正在连接',
      live: '实时连接',
      polling: 'HTTP 轮询',
      paused: '更新已暂停',
      closed: '需要登录',
    })[store.connection],
)
const staleFor = computed(() =>
  store.updatedAt === null ? 0 : Math.max(0, Math.floor((now.value - store.updatedAt) / 1000)),
)
const stale = computed(() => staleFor.value > STALE_AFTER)
const staleReason = computed(
  () =>
    ({
      polling: '实时连接中断，正在用 HTTP 轮询重试',
      connecting: '正在连接 Hub',
      closed: '站点已关闭或需要登录',
      paused: '更新已暂停',
      live: '实时连接仍在，但 Hub 没有推送新数据',
    })[store.connection],
)

// What the card shows: the tour turns to each troubled node in turn; picking a marker, a row or a change
// stops the tour and shows that node, or every node of a country.
type Selection = { kind: 'node'; id: number } | { kind: 'country'; code: string }
const touring = ref(true),
  stopIndex = ref(0),
  picked = ref<Selection | null>(null)
const shown = computed<Selection | null>(() => {
  if (touring.value && stops.value.length)
    return { kind: 'node', id: stops.value[stopIndex.value % stops.value.length]!.node.id }
  return picked.value
})
let tourTimer: ReturnType<typeof setInterval> | undefined
function restartTour() {
  clearInterval(tourTimer)
  tourTimer = setInterval(() => {
    if (touring.value && !stale.value)
      stopIndex.value = (stopIndex.value + 1) % Math.max(1, stops.value.length)
  }, STOP_MS)
}
function pick(selection: Selection | null) {
  touring.value = false
  picked.value = selection
}
const visit = (id: number) => pick({ kind: 'node', id })
function pickCountry(code: string) {
  const here = nodes.value.filter((n) => n.country === code)
  pick(here.length === 1 ? { kind: 'node', id: here[0]!.id } : { kind: 'country', code })
}
function toggleTour() {
  touring.value = !touring.value
  picked.value = null
  // A fresh tour starts from the most severe issue.
  stopIndex.value = 0
  if (touring.value) restartTour()
}
const shownNode = computed(() =>
  shown.value?.kind === 'node'
    ? nodes.value.find((n) => n.id === (shown.value as { id: number }).id)
    : undefined,
)
const card = computed(() => {
  const s = shown.value
  if (s?.kind === 'country')
    return { kind: 'country' as const, data: countryCard(s.code, nodes.value, alerts.value, seconds.value) }
  const n = shownNode.value
  if (!n) return null
  const list = alerts.value[n.id] ?? [],
    starts = list.map((a) => firstSeen.get(`${n.id}:${a.kind}`) ?? null)
  const since = starts.length && starts.every((t) => t !== null) ? Math.min(...(starts as number[])) : null
  return {
    kind: 'node' as const,
    data: nodeCard(
      n,
      list,
      store.ping[n.id],
      store.config.nodes[String(n.id)],
      seconds.value,
      since,
      nodes.value.filter((m) => m.country === n.country).length,
    ),
  }
})
// Where the globe looks and the reticle sits: the shown node's country or the shown country.
const target = computed(() => {
  const code = shown.value?.kind === 'country' ? shown.value.code : shownNode.value?.country
  const at = code ? places[code.trim().toUpperCase()] : undefined
  if (!code || !at || !card.value) return null
  return { key: shown.value!.kind === 'node' ? `node-${shownNode.value!.id}` : `country-${code}`, code, at }
})

// Recent changes: what happened since the page opened, newest first.
// Each change keeps its tag and figure from the moment it happened.
const events = ref<(OpsEvent & { at: number; n: number; badge: ReturnType<typeof eventBadge> })[]>([])
let previous: WallSnapshot | null = null,
  counter = 0
// When this page first saw each alert (seconds); alerts already there on opening have no known start.
const firstSeen = new Map<string, number | null>()
watch(
  [nodes, alerts],
  () => {
    if (!nodes.value.length) return
    const next = snapshot(nodes.value, alerts.value),
      found = diffEvents(previous, next)
    for (const key of next.alerts.keys())
      if (!firstSeen.has(key)) firstSeen.set(key, previous ? seconds.value : null)
    for (const key of firstSeen.keys()) if (!next.alerts.has(key)) firstSeen.delete(key)
    previous = next
    if (found.length)
      events.value = [
        ...found
          .map((e) => ({ ...e, at: Date.now(), n: ++counter, badge: eventBadge(e, seconds.value) }))
          .reverse(),
        ...events.value,
      ].slice(0, 20)
  },
  { immediate: true },
)
// Busy CPUs and traffic jumps, judged against each node's own recent totals as data arrives.
const metricSeen = ref<Change[]>([])
let lastNodes: MonitorNode[] | null = null
const traffic = new Map<number, number[]>()
watch(
  () => store.updatedAt,
  (at) => {
    if (at === null || !nodes.value.length) return
    const found = metricChanges(lastNodes, nodes.value, Object.fromEntries(traffic), Math.floor(at / 1000))
    if (found.length) metricSeen.value = [...found, ...metricSeen.value].slice(0, 20)
    for (const n of nodes.value)
      if (n.online && n.metrics)
        traffic.set(n.id, [...(traffic.get(n.id) ?? []), n.metrics.net_rx + n.metrics.net_tx].slice(-20))
    lastNodes = nodes.value
  },
)
// Everything in one list, newest first: lossy moments already in the last hour of probes, then what this page
// has seen since opening.
const changes = computed(() =>
  [
    ...pastLoss(nodes.value, store.ping, seconds.value).map((c) => ({ ...c, at: c.at * 1000 })),
    ...metricSeen.value.map((c) => ({ ...c, at: c.at * 1000 })),
    ...events.value.map((e) => ({ key: `event-${e.n}`, at: e.at, nodeId: e.nodeId, ...e.badge })),
  ]
    .sort((a, b) => b.at - a.at)
    .slice(0, 5),
)

// Probes: the last hour per node, refreshed every minute like the home page cards.
const loadProbes = () => {
  for (const n of online.value) void store.loadPing(n.id)
}
watch(() => online.value.map((n) => n.id).join(), loadProbes, { immediate: true })

// Long running: the screen stays on, the controls step aside, the page shifts a little and reloads daily.
const idle = ref(false),
  full = ref(false),
  shift = ref(0)
const canFull = typeof document.documentElement.requestFullscreen === 'function'
let idleTimer: ReturnType<typeof setTimeout> | undefined
function wake() {
  idle.value = false
  clearTimeout(idleTimer)
  idleTimer = setTimeout(() => (idle.value = true), 3000)
}
function toggleFull() {
  if (document.fullscreenElement) void document.exitFullscreen()
  else void document.documentElement.requestFullscreen().catch(() => undefined)
}
const onFull = () => (full.value = Boolean(document.fullscreenElement))
let lock: WakeLockSentinel | null = null
async function keepAwake() {
  if (document.hidden || !('wakeLock' in navigator) || (lock && !lock.released)) return
  try {
    lock = await navigator.wakeLock.request('screen')
  } catch {
    /* Refused or unsupported: the screen follows its own settings. */
  }
}
const onVisible = () => void keepAwake()
const openedAt = Date.now()
const SHIFTS = ['0px, 0px', '2px, 0px', '2px, 2px', '0px, 2px']
const timers: ReturnType<typeof setInterval>[] = []
onMounted(() => {
  timers.push(
    setInterval(() => {
      now.value = Date.now()
      if (shouldReload(openedAt, new Date(now.value))) location.reload()
    }, 1000),
    setInterval(() => !document.hidden && loadProbes(), 60000),
    setInterval(() => (shift.value = (shift.value + 1) % SHIFTS.length), 600000),
  )
  restartTour()
  document.addEventListener('fullscreenchange', onFull)
  document.addEventListener('visibilitychange', onVisible)
  window.addEventListener('pointermove', wake)
  wake()
  void keepAwake()
})
onBeforeUnmount(() => {
  timers.forEach(clearInterval)
  clearInterval(tourTimer)
  clearTimeout(idleTimer)
  document.removeEventListener('fullscreenchange', onFull)
  document.removeEventListener('visibilitychange', onVisible)
  window.removeEventListener('pointermove', wake)
  void lock?.release().catch(() => undefined)
  lock = null
})
</script>
<template>
  <div
    class="ops-wall"
    :data-idle="idle || undefined"
    :data-stale="stale || undefined"
    :style="{ transform: `translate(${SHIFTS[shift]})` }"
  >
    <h1 class="sr-only">运维模式</h1>
    <header class="ops-top">
      <RouterLink to="/" class="ops-control ops-back" aria-label="返回首页" title="返回首页"
        ><ArrowLeft :size="18"
      /></RouterLink>
      <span class="ops-brand">FOOTBALL <b>MONITOR</b><small>运维模式</small></span>
      <span class="ops-live" :data-state="store.connection"
        ><i class="ops-pulse" :data-online="!stale" aria-hidden="true" />{{ connectionText }} · 最后更新
        {{ stamp(store.updatedAt) }}</span
      >
      <button
        v-if="canFull"
        type="button"
        class="ops-control ops-full"
        :aria-label="full ? '退出全屏' : '全屏'"
        :title="full ? '退出全屏' : '全屏'"
        @click="toggleFull"
      >
        <Minimize v-if="full" :size="18" /><Maximize v-else :size="18" />
      </button>
    </header>

    <div v-if="stale" class="ops-banner" role="alert">
      数据已 <b>{{ Math.floor(staleFor / 60) }} 分 {{ pad(staleFor % 60) }} 秒</b>没有更新：{{
        staleReason
      }}。画面是最后收到的数据。
    </div>

    <div v-if="store.closed" class="ops-empty" role="alert">
      <WifiOff :size="40" />
      <h2>此刻，主场暂未开放</h2>
      <p>{{ store.error }}</p>
      <a class="primary-link" href="/admin/">前往 Hub 登录 ↗</a>
    </div>
    <div v-else-if="!store.nodes.length" class="ops-empty" :aria-busy="store.loading || undefined">
      <Server :size="40" />
      <h2>{{ store.loading ? '正在加载节点…' : store.error ? '暂时无法获取节点' : '还没有可显示的节点' }}</h2>
    </div>
    <div v-else class="ops-stage">
      <section class="ops-left" aria-label="全场态势">
        <p class="ops-eyebrow">LIVE STATUS</p>
        <h2 class="ops-heading">全场节点态势</h2>
        <dl class="ops-counts">
          <div data-tone="ok" :data-zero="!counts.ok || undefined">
            <dd><RollingNumber :value="counts.ok" /></dd>
            <dt>正常</dt>
          </div>
          <div data-tone="warn" :data-zero="!counts.warn || undefined">
            <dd><RollingNumber :value="counts.warn" /></dd>
            <dt>有异常</dt>
          </div>
          <div data-tone="off" :data-zero="!counts.off || undefined">
            <dd><RollingNumber :value="counts.off" /></dd>
            <dt>离线</dt>
          </div>
        </dl>
        <p class="ops-score">
          平均评分 <b><RollingNumber :value="average" /></b><span>共 {{ nodes.length }} 台</span>
        </p>
        <div class="ops-traffic">
          <p class="ops-label">实时流量</p>
          <div class="ops-rates">
            <span
              ><small><i class="ops-arrow-up">↑</i> 上行</small
              ><b
                ><RollingNumber :value="up.value" :digits="2" /><em>{{ up.unit }}</em></b
              ></span
            >
            <span
              ><small><i class="ops-arrow-down">↓</i> 下行</small
              ><b
                ><RollingNumber :value="down.value" :digits="2" /><em>{{ down.unit }}</em></b
              ></span
            >
          </div>
          <div class="ops-rate-lines">
            <Sparkline class="ops-rate-line" :values="rateDown" color="#ff7a1a" />
            <Sparkline class="ops-rate-line" :values="rateUp" color="#e7e9ee" :fill="false" />
          </div>
          <p class="ops-total">累计 上行 {{ bytes(totals.up) }} · 下行 {{ bytes(totals.down) }}</p>
        </div>
      </section>

      <section class="ops-centre" aria-label="节点分布">
        <OpsGlobe
          :markers="globe.markers"
          :target="target"
          :stale="stale"
          @pick="pickCountry"
          @grab="pick(shown)"
          @blank="pick(null)"
        >
          <OpsCard
            v-if="card"
            :card="card"
            @close="pick(null)"
            @node="visit"
            @country="(code) => pick({ kind: 'country', code })"
          />
        </OpsGlobe>
        <p class="ops-note">
          <span v-if="groupMissing">分组“{{ group }}”不存在，显示全部节点</span
          ><span v-else-if="group">分组：{{ group }}</span
          ><span v-if="globe.unplaced">{{ globe.unplaced }} 台未设置国家或地区，未在地球上标出</span>
        </p>
      </section>

      <aside class="ops-right" aria-label="正在发生">
        <header class="ops-clock">
          <b>{{ time }}</b
          ><span>{{ date }}</span>
        </header>
        <section class="ops-rail-section ops-rail-grow">
          <h2 class="ops-label">
            正在发生<b>{{ issues.length }}</b>
          </h2>
          <div v-if="issues.length" class="ops-issues">
            <button
              v-for="(it, i) in issues.slice(0, MAX_ISSUES)"
              :key="`${it.node.id}-${it.alert.kind}-${i}`"
              type="button"
              class="ops-row"
              :data-tone="issueText(it.alert, seconds).tone"
              :data-focus="shownNode?.id === it.node.id || undefined"
              :title="`在地球上查看 ${it.node.name}`"
              @click="visit(it.node.id)"
            >
              <span class="or-main"
                ><b>{{ it.node.name }}</b
                ><small
                  ><img
                    v-if="flagUrl(it.node.country)"
                    class="or-flag"
                    :src="flagUrl(it.node.country)"
                    alt=""
                  />{{ it.node.country ? countryName(it.node.country) : '未设置地区' }}</small
                ></span
              >
              <span class="or-side"
                >{{ issueText(it.alert, seconds).label
                }}<em>{{ issueText(it.alert, seconds).value }}</em></span
              >
            </button>
            <p v-if="issues.length > MAX_ISSUES" class="ops-more">另有 {{ issues.length - MAX_ISSUES }} 项</p>
          </div>
          <p v-else class="ops-allok">全部 {{ nodes.length }} 台运行正常</p>
        </section>
        <section class="ops-rail-section">
          <h2 class="ops-label">最近变化</h2>
          <div class="ops-changes">
            <button
              v-for="c in changes"
              :key="c.key"
              type="button"
              class="ops-change"
              title="在地球上查看这台节点"
              @click="visit(c.nodeId)"
            >
              <time>{{ stamp(c.at) }}</time
              ><span class="ops-tag" :data-tone="c.tone">{{ c.tag }}</span
              ><span class="ops-change-text">{{ c.text }}</span>
            </button>
            <p v-if="!changes.length" class="ops-quiet">最近 1 小时没有新的变化</p>
          </div>
        </section>
        <button
          v-if="stops.length"
          type="button"
          class="ops-tour"
          :aria-pressed="touring"
          @click="toggleTour"
        >
          {{ touring ? '停止依次查看' : `依次查看 ${stops.length} 台` }}
        </button>
      </aside>
    </div>
  </div>
</template>
