<script setup lang="ts">
import { computed, ref, watch, type Component } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import {
  CalendarClock,
  ChartBarDecreasing,
  ChevronDown,
  ChevronsDown,
  ChevronsUp,
  Database,
  Gauge,
  HardDrive,
  MemoryStick,
  Server,
  Wallet,
  WifiOff,
} from '@lucide/vue'
import { projectSearchText } from '../domain/projects'
import { useMonitorStore } from '../stores/monitor'
import { useCardView } from '../services/cardView'
import { useGroupFilter } from '../services/filters'
import { useShortRow } from '../services/gridFit'
import { bytes, cycle, money, rate } from '../domain/format'
import { expiringSoon, fleetSummary, parseRates, todayTrafficTop } from '../domain/fleet'
import { flagUrl } from '../domain/flags'
import { nextTier, type Tier } from '../domain/score'
import type { MonitorNode } from '../domain/types'
import { Button } from '../components/ui/button'
import GroupTabs from '../components/GroupTabs.vue'
import LiveCard from '../components/LiveCard.vue'
import PageHeading from '../components/PageHeading.vue'
import AsciiClock from '../components/AsciiClock.vue'
type Status = 'all' | 'online' | 'offline'
type Sort = 'hub' | 'score' | 'name'
const store = useMonitorStore(),
  route = useRoute(),
  router = useRouter(),
  group = useGroupFilter()
const statuses: { id: Status; label: string }[] = [
  { id: 'all', label: '全部' },
  { id: 'online', label: '在线' },
  { id: 'offline', label: '离线' },
]
// Group, status, sort and search all live in the address, so a refresh or a shared link keeps them.
function setQuery(key: string, value: string | undefined) {
  const query = { ...route.query }
  if (value === undefined) delete query[key]
  else query[key] = value
  void router.replace({ query })
}
const status = computed<Status>({
  get: () => statuses.find((s) => s.id === route.query.status)?.id ?? 'all',
  set: (value) => setQuery('status', value === 'all' ? undefined : value),
})
const { view } = useCardView()
const crumbs = [{ label: 'Football Monitor', to: '/' }, { label: '首页' }]
const search = computed(() => (typeof route.query.q === 'string' ? route.query.q : ''))
const SORTS: Sort[] = ['hub', 'score', 'name']
// Hub order leaves `?sort=` out.
const sort = computed<Sort>({
  get: () => SORTS.find((s) => s === route.query.sort) ?? 'hub',
  set: (value) => setQuery('sort', value === 'hub' ? undefined : value),
})
function clearFilters() {
  const query = { ...route.query }
  delete query.group
  delete query.status
  delete query.q
  void router.replace({ query })
}
const grouped = computed(() => store.nodes.filter((n) => group.value === null || n.group === group.value))
const overall = (n: MonitorNode) => store.scores[n.id]?.overall ?? null
const filtered = computed(() => {
  const term = search.value.toLowerCase().trim()
  const list = grouped.value.filter(
    (n) =>
      (status.value === 'all' || n.online === (status.value === 'online')) &&
      // Nothing typed: no text is put together for every node on every update.
      (!term ||
        `${n.name} ${n.group} ${n.public_remark} ${projectSearchText(store.config.nodes[String(n.id)]?.projects)}`
          .toLowerCase()
          .includes(term)),
  )
  if (sort.value === 'name') return [...list].sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
  if (sort.value === 'score') return [...list].sort((a, b) => (overall(b) ?? -1) - (overall(a) ?? -1))
  return list
})
// Fewer cards than one row holds: they widen a little and sit in the middle rather than leaving half the row bare.
const grid = ref<HTMLElement | null>(null)
const short = useShortRow(
  grid,
  () => filtered.value.length,
  () => [view.value, store.config.layout, store.config.card_size],
)
const summary = computed(() =>
  fleetSummary(grouped.value, parseRates(store.config.exchange_rates) ?? { CNY: 1 }),
)
const expiring = computed(() => expiringSoon(grouped.value))
const trafficTop = computed(() => todayTrafficTop(grouped.value))
const boards = computed(() => Number(store.config.show_billing) + Number(store.config.show_traffic))
// "9.7 GB" -> ["9.7", "GB"]: big number, small unit.
const split = (text: string) => {
  const i = text.lastIndexOf(' ')
  return i < 0 ? [text, ''] : [text.slice(0, i), text.slice(i + 1)]
}
interface Segment {
  share: number
  tone: string
}
interface Tile {
  label: string
  icon: Component
  value: string
  unit?: string
  tone?: string
  /** The two readings the page is opened for: drawn larger than the rest. */
  lead?: boolean
  note?: string
  /** Shares of a thin bar under the value, 0 to 1. */
  bar?: Segment[]
  detail?: string
  /** Recent rates, oldest first, drawn as a line in the empty space of the tile. */
  spark?: { kind: 'up' | 'down'; line: string; area: string } | null
}
const usage = (used: number, total: number): Partial<Tile> => {
  if (!total) return { value: '—', unit: '' }
  const [value, unit] = split(bytes(used)),
    share = used / total
  return {
    value: value!,
    unit: `${unit} / ${bytes(total)}`,
    // The same thresholds as the card's usage readings.
    bar: [{ share, tone: share < 0.6 ? 'good' : share < 0.85 ? 'ok' : 'bad' }],
    detail: `已用 ${Math.round(share * 100)}%`,
  }
}
const TIER_NAMES: Record<Tier, string> = { gold: '金', silver: '银', bronze: '铜' }
// Tier split of the scored nodes, best first, as on their cards.
const tierSplit = computed((): Partial<Tile> => {
  const counts: Record<Tier, number> = { gold: 0, silver: 0, bronze: 0 }
  for (const n of grouped.value) {
    const score = overall(n)
    if (score !== null) counts[store.tiers[n.id] ?? nextTier(score)]++
  }
  const shown = (Object.keys(counts) as Tier[]).filter((t) => counts[t]),
    total = shown.reduce((sum, t) => sum + counts[t], 0)
  if (!total) return {}
  return {
    bar: shown.map((t) => ({ share: counts[t] / total, tone: t })),
    detail: shown.map((t) => `${TIER_NAMES[t]} ${counts[t]}`).join(' · '),
  }
})
// Fleet rates of the last updates in this group; a group switch starts over.
const SAMPLES = 30
const samples = ref<{ rx: number; tx: number }[]>([])
watch(
  () => store.updatedAt,
  (at) => {
    if (at === null) return
    const { rx, tx } = summary.value
    samples.value = [...samples.value, { rx, tx }].slice(-SAMPLES)
  },
)
watch(group, () => (samples.value = []))
// Sparkline in a 100 × 24 box: the samples span the whole width however few there are, spread between the
// lowest and the highest; a steady rate runs through the middle. One sample is not a line yet.
function spark(kind: 'up' | 'down', values: number[]) {
  if (values.length < 2) return null
  const lo = Math.min(...values),
    hi = Math.max(...values),
    steady = hi - lo <= hi * 0.02,
    step = 100 / (values.length - 1),
    pts = values.map((v, i) => {
      const y = steady ? 12 : 22 - ((v - lo) / (hi - lo)) * 20
      return `${Number((i * step).toFixed(1))},${Number(y.toFixed(1))}`
    })
  return { kind, line: pts.join(' '), area: `0,24 ${pts.join(' ')} 100,24` }
}
const tiles = computed((): Tile[] => {
  const s = summary.value,
    [traffic, trafficUnit] = split(bytes(s.traffic)),
    [up, upUnit] = split(rate(s.tx)),
    [down, downUnit] = split(rate(s.rx))
  return [
    {
      label: '在线节点',
      icon: Server,
      value: String(s.online),
      unit: `/ ${s.total}`,
      tone: 'summary-online',
      lead: true,
      ...(s.total && {
        bar: [{ share: s.online / s.total, tone: 'online' }],
        detail: s.online === s.total ? '全部在线' : `离线 ${s.total - s.online} 台`,
      }),
    },
    {
      label: '平均评分',
      icon: Gauge,
      value: average.value,
      tone: 'summary-score',
      lead: true,
      ...tierSplit.value,
    },
    { label: '内存用量', icon: MemoryStick, ...usage(s.memUsed, s.memTotal) } as Tile,
    { label: '硬盘用量', icon: HardDrive, ...usage(s.diskUsed, s.diskTotal) } as Tile,
    ...(store.config.show_billing
      ? [
          {
            label: '剩余价值',
            icon: Wallet,
            value: s.value === null ? '—' : `¥${s.value.toFixed(2)}`,
            unit: s.value === null ? '' : 'CNY',
            detail: s.monthly === null ? '' : `折合每月 ¥${s.monthly.toFixed(2)}`,
            note: s.uncounted ? `${s.uncounted} 台缺到期日或汇率，未计入` : '',
          },
        ]
      : []),
    {
      label: '累计流量',
      icon: Database,
      value: traffic!,
      unit: trafficUnit,
      detail: `今日 ${bytes(s.today)}`,
    },
    {
      label: '实时上行',
      icon: ChevronsUp,
      value: up!,
      unit: upUnit,
      spark: spark(
        'up',
        samples.value.map((v) => v.tx),
      ),
    },
    {
      label: '实时下行',
      icon: ChevronsDown,
      value: down!,
      unit: downUnit,
      spark: spark(
        'down',
        samples.value.map((v) => v.rx),
      ),
    },
  ]
})
// Phones open on the squad: the overview folds behind one line there until asked for, remembered per browser.
const OVERVIEW_KEY = 'football-monitor:overview'
const overviewOpen = ref(false)
try {
  overviewOpen.value = localStorage.getItem(OVERVIEW_KEY) === 'open'
} catch {
  /* Optional visitor preference. */
}
function toggleOverview() {
  overviewOpen.value = !overviewOpen.value
  try {
    if (overviewOpen.value) localStorage.setItem(OVERVIEW_KEY, 'open')
    else localStorage.removeItem(OVERVIEW_KEY)
  } catch {
    /* Preference lasts this visit. */
  }
}
const daysText = (days: number | null) =>
  days === null ? '' : days < 0 ? `已过期 ${-days} 天` : days === 0 ? '今天' : `${days} 天`
const level = (days: number | null) =>
  days === null ? undefined : days <= 7 ? 'danger' : days <= 30 ? 'warning' : 'ok'
const average = computed(() => {
  const values = grouped.value.map(overall).filter((v): v is number => v !== null)
  return values.length ? String(Math.round(values.reduce((a, b) => a + b, 0) / values.length)) : '—'
})
</script>
<template>
  <PageHeading :crumbs="crumbs" title="首发阵容" description="每个节点都是一名球员，评分为网络质量（0–99）。">
    <span class="sync-note"
      ><span class="live-dot" />{{ store.updatedAt ? '与 Hub 保持同步' : '等待首次数据' }}</span
    >
    <template v-if="store.config.show_clock" #aside><AsciiClock :motion="store.config.motion" /></template>
    <template v-if="!store.closed" #tabs>
      <GroupTabs />
    </template>
  </PageHeading>
  <div v-if="store.closed" class="empty-state panel" role="alert">
    <WifiOff :size="34" />
    <h2>此刻，主场暂未开放</h2>
    <p>{{ store.error }}</p>
    <a class="primary-link" href="/admin/">前往 Hub 登录 ↗</a
    ><Button variant="outline" @click="store.bootstrap">重新检查</Button>
  </div>
  <template v-else>
    <button
      v-if="store.config.show_summary"
      type="button"
      class="overview-toggle panel"
      aria-controls="overview"
      :aria-expanded="overviewOpen"
      @click="toggleOverview"
    >
      <span
        >在线 <b class="summary-online">{{ summary.online }}/{{ summary.total }}</b></span
      >
      <span
        >评分 <b class="summary-score">{{ average }}</b></span
      >
      <span class="overview-rates">↑ {{ rate(summary.tx) }} ↓ {{ rate(summary.rx) }}</span>
      <span class="overview-more"
        >{{ overviewOpen ? '收起' : '汇总' }}<ChevronDown :size="14" aria-hidden="true"
      /></span>
    </button>
    <div
      v-if="store.config.show_summary"
      id="overview"
      class="overview"
      :data-boards="boards"
      :data-open="overviewOpen"
    >
      <section class="summary-grid" aria-label="服务器汇总">
        <div
          v-for="t in tiles"
          :key="t.label"
          class="summary-stat panel"
          :data-lead="t.lead ? '' : undefined"
        >
          <span class="summary-stat-label">{{ t.label }}</span>
          <component :is="t.icon" class="summary-icon" :size="18" aria-hidden="true" />
          <svg
            v-if="t.spark"
            class="summary-spark"
            :data-kind="t.spark.kind"
            viewBox="0 0 100 24"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <polygon :points="t.spark.area" />
            <polyline :points="t.spark.line" />
          </svg>
          <div class="summary-stat-body">
            <strong class="summary-stat-value" :class="t.tone"
              >{{ t.value }}<small v-if="t.unit">{{ t.unit }}</small></strong
            >
            <span v-if="t.bar" class="summary-bar" aria-hidden="true"
              ><i
                v-for="seg in t.bar"
                :key="seg.tone"
                :data-tone="seg.tone"
                :style="{ width: `${seg.share * 100}%` }"
            /></span>
            <span v-if="t.detail" class="summary-detail">{{ t.detail }}</span>
            <span v-if="t.note" class="summary-note">{{ t.note }}</span>
          </div>
        </div>
      </section>
      <section v-if="store.config.show_billing" class="expiry-board panel" aria-labelledby="expiry-title">
        <h2 id="expiry-title"><CalendarClock :size="15" aria-hidden="true" />即将到期</h2>
        <ol v-if="expiring.length">
          <li v-for="e in expiring" :key="e.node.id">
            <RouterLink :to="`/node/${e.node.id}`" class="expiry-row">
              <img
                v-if="e.node.country && flagUrl(e.node.country)"
                class="expiry-flag"
                :src="flagUrl(e.node.country)"
                alt=""
              />
              <span class="expiry-name">{{ e.node.name }}</span>
              <span class="expiry-days" :data-level="level(e.days)">{{ daysText(e.days) }}</span>
              <span class="expiry-meta"
                >{{ e.node.expires_at }} 到期<template v-if="e.node.price !== null">
                  · {{ money(e.node.price, e.node.currency) }}/{{ cycle(e.node.billing_cycle) }}</template
                ></span
              >
            </RouterLink>
          </li>
        </ol>
        <p v-else class="expiry-empty">还没有设置到期日的节点</p>
      </section>
      <section v-if="store.config.show_traffic" class="traffic-board panel" aria-labelledby="traffic-title">
        <h2 id="traffic-title"><ChartBarDecreasing :size="15" aria-hidden="true" />今日流量</h2>
        <ol v-if="trafficTop.length">
          <li v-for="(t, i) in trafficTop" :key="t.node.id">
            <RouterLink
              :to="`/node/${t.node.id}`"
              class="traffic-row"
              :title="`今日下行 ${bytes(t.node.day_rx)} · 今日上行 ${bytes(t.node.day_tx)}`"
            >
              <span class="traffic-rank" :data-rank="i + 1">{{ i + 1 }}</span>
              <img
                v-if="t.node.country && flagUrl(t.node.country)"
                class="expiry-flag"
                :src="flagUrl(t.node.country)"
                alt=""
              />
              <span class="expiry-name">{{ t.node.name }}</span>
              <span class="traffic-total">{{ bytes(t.total) }}</span>
              <span class="traffic-bar" aria-hidden="true"
                ><i :style="{ width: `${t.share * 100}%` }"
              /></span>
            </RouterLink>
          </li>
        </ol>
        <p v-else class="expiry-empty">今天还没有节点产生流量</p>
      </section>
    </div>
    <section id="squad" class="squad-section" aria-label="节点列表">
      <div class="squad-toolbar">
        <div class="status-filter" role="group" aria-label="状态筛选">
          <button
            v-for="s in statuses"
            :key="s.id"
            :class="{ selected: status === s.id }"
            :aria-pressed="status === s.id"
            @click="status = s.id"
          >
            {{ s.label }}
          </button>
        </div>
        <span class="node-count">{{ filtered.length }} 名球员</span>
        <label class="sort-control" for="node-sort"
          >排序<span class="sort-select"
            ><select id="node-sort" v-model="sort">
              <option value="hub">Hub 顺序</option>
              <option value="score">综合分</option>
              <option value="name">名称</option></select
            ><ChevronDown :size="14" aria-hidden="true" /></span
        ></label>
      </div>
      <div v-if="store.error" class="inline-notice" role="status">
        <WifiOff :size="16" /><span
          >{{ store.error }}{{ store.updatedAt ? ' · 当前显示上次成功数据' : '' }}</span
        ><Button variant="ghost" size="sm" @click="store.bootstrap">重试</Button>
      </div>
      <div
        v-if="store.loading"
        class="card-grid loading-grid"
        :data-layout="store.config.layout"
        :data-size="store.config.card_size"
        :data-view="view"
        aria-busy="true"
        aria-label="正在加载节点"
      >
        <div v-for="i in 7" :key="i" class="card-skeleton"><span /><span /><span /></div>
      </div>
      <div v-else-if="!filtered.length" class="empty-state panel">
        <Server :size="32" />
        <h3>
          {{
            store.nodes.length
              ? '没有找到匹配的球员'
              : store.error
                ? '暂时无法获取节点'
                : '阵容正在等待第一位球员'
          }}
        </h3>
        <p>
          {{
            store.nodes.length
              ? '试试其他名称，或切换分组。'
              : store.error
                ? '连接恢复后会自动显示，也可以点上方的“重试”。'
                : '请在 Monitor Hub 中添加节点，并允许在公开页显示。'
          }}
        </p>
        <Button v-if="store.nodes.length" variant="outline" @click="clearFilters">查看全部节点</Button>
      </div>
      <div
        v-else
        ref="grid"
        class="card-grid"
        :data-layout="store.config.layout"
        :data-size="store.config.card_size"
        :data-view="view"
        :data-short="short ? '' : undefined"
        :style="short ? { '--short-count': short.count, '--short-cap': `${short.cap}px` } : undefined"
      >
        <LiveCard v-for="node in filtered" :key="node.id" :node="node" :view="view" />
      </div>
      <p class="squad-footnote">
        <span>●</span> 三网延迟为节点到指定目标的 TCP 握手时间，非访客到节点的访问延迟。
      </p>
    </section>
  </template>
</template>
