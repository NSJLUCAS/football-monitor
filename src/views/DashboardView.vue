<script setup lang="ts">
import { computed, ref, type Component } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import {
  CalendarClock,
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
import { useMonitorStore } from '../stores/monitor'
import { bytes, cycle, money, rate } from '../domain/format'
import { expiringSoon, fleetSummary, parseRates } from '../domain/fleet'
import { flagUrl } from '../domain/flags'
import type { MonitorNode } from '../domain/types'
import { Button } from '../components/ui/button'
import LiveCard from '../components/LiveCard.vue'
import PageHeading from '../components/PageHeading.vue'
type Status = 'all' | 'online' | 'offline'
type Sort = 'hub' | 'score' | 'name'
const store = useMonitorStore(),
  route = useRoute(),
  router = useRouter(),
  group = ref<string | null>(null),
  status = ref<Status>('all'),
  sort = ref<Sort>('hub')
const statuses: { id: Status; label: string }[] = [
  { id: 'all', label: '全部' },
  { id: 'online', label: '在线' },
  { id: 'offline', label: '离线' },
]
const crumbs = [{ label: 'Football Monitor', to: '/' }, { label: '首页' }]
const search = computed(() => (typeof route.query.q === 'string' ? route.query.q : ''))
function clearFilters() {
  group.value = null
  status.value = 'all'
  if ('q' in route.query) {
    const query = { ...route.query }
    delete query.q
    void router.replace({ query })
  }
}
const grouped = computed(() => store.nodes.filter((n) => group.value === null || n.group === group.value))
const overall = (n: MonitorNode) => store.scores[n.id]?.overall ?? null
const filtered = computed(() => {
  const term = search.value.toLowerCase().trim()
  const list = grouped.value.filter(
    (n) =>
      (status.value === 'all' || n.online === (status.value === 'online')) &&
      `${n.name} ${n.group} ${n.public_remark}`.toLowerCase().includes(term),
  )
  if (sort.value === 'name') return [...list].sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
  if (sort.value === 'score') return [...list].sort((a, b) => (overall(b) ?? -1) - (overall(a) ?? -1))
  return list
})
const summary = computed(() =>
  fleetSummary(grouped.value, parseRates(store.config.exchange_rates) ?? { CNY: 1 }),
)
const expiring = computed(() => expiringSoon(grouped.value))
// "9.7 GB" -> ["9.7", "GB"]: big number, small unit.
const split = (text: string) => {
  const i = text.lastIndexOf(' ')
  return i < 0 ? [text, ''] : [text.slice(0, i), text.slice(i + 1)]
}
const usage = (used: number, total: number) => {
  if (!total) return { value: '—', unit: '' }
  const [value, unit] = split(bytes(used))
  return { value: value!, unit: `${unit} / ${bytes(total)}` }
}
const tiles = computed(() => {
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
    },
    { label: '平均评分', icon: Gauge, value: average.value, tone: 'summary-score' },
    { label: '内存用量', icon: MemoryStick, ...usage(s.memUsed, s.memTotal) },
    { label: '硬盘用量', icon: HardDrive, ...usage(s.diskUsed, s.diskTotal) },
    ...(store.config.show_billing
      ? [
          {
            label: '剩余价值',
            icon: Wallet,
            value: s.value === null ? '—' : `¥${s.value.toFixed(2)}`,
            unit: s.value === null ? '' : 'CNY',
            note: s.uncounted ? `${s.uncounted} 台缺到期日或汇率，未计入` : '',
          },
        ]
      : []),
    { label: '累计流量', icon: Database, value: traffic!, unit: trafficUnit },
    { label: '实时上行', icon: ChevronsUp, value: up!, unit: upUnit },
    { label: '实时下行', icon: ChevronsDown, value: down!, unit: downUnit },
  ] as { label: string; icon: Component; value: string; unit?: string; tone?: string; note?: string }[]
})
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
  <template v-else>
    <div
      v-if="store.config.show_summary"
      class="overview"
      :class="{ 'with-board': store.config.show_billing }"
    >
      <section class="summary-grid" aria-label="服务器汇总">
        <div v-for="t in tiles" :key="t.label" class="summary-stat panel">
          <span class="summary-stat-label">{{ t.label }}</span>
          <component :is="t.icon" class="summary-icon" :size="18" aria-hidden="true" />
          <strong class="summary-stat-value" :class="t.tone"
            >{{ t.value }}<small v-if="t.unit">{{ t.unit }}</small></strong
          >
          <span v-if="t.note" class="summary-note">{{ t.note }}</span>
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
              : '请在 Monitor Hub 中添加节点，并允许在公开页显示。'
          }}
        </p>
        <Button v-if="store.nodes.length" variant="outline" @click="clearFilters">查看全部节点</Button>
      </div>
      <div v-else class="card-grid" :data-layout="store.config.layout" :data-size="store.config.card_size">
        <LiveCard v-for="node in filtered" :key="node.id" :node="node" />
      </div>
      <p class="squad-footnote">
        <span>●</span> 三网延迟为节点到指定目标的 TCP 握手时间，非访客到节点的访问延迟。
      </p>
    </section>
  </template>
</template>
