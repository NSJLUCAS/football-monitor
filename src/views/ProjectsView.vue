<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { Boxes, ExternalLink, Search, Server, WifiOff } from '@lucide/vue'
import { useMonitorStore } from '../stores/monitor'
import { flagUrl } from '../domain/flags'
import { countryName } from '../domain/format'
import {
  byProject,
  machineProjects,
  matchProjects,
  projectSummary,
  tileHue,
  tileLetter,
  urlHost,
} from '../domain/projects'
import { providerBadge } from '../domain/providers'
import type { MonitorNode } from '../domain/types'
import { Button } from '../components/ui/button'
import PageHeading from '../components/PageHeading.vue'
import ProjectTile from '../components/ProjectTile.vue'
import '../styles/network.css'
import '../styles/projects.css'
const store = useMonitorStore(),
  route = useRoute(),
  router = useRouter(),
  group = ref<string | null>(null)
const crumbs = [{ label: 'Football Monitor', to: '/' }, { label: '项目' }]
// The view and the search term live in the address, beside the header search; defaults stay out of it.
function setQuery(key: string, value: string | undefined) {
  const query = { ...route.query }
  if (value === undefined) delete query[key]
  else query[key] = value
  void router.replace({ query })
}
const view = computed<'node' | 'project'>({
  get: () => (route.query.view === 'project' ? 'project' : 'node'),
  set: (value) => setQuery('view', value === 'project' ? 'project' : undefined),
})
const q = computed(() => (typeof route.query.q === 'string' ? route.query.q : ''))
const all = computed(() => machineProjects(store.nodes, store.config.nodes))
const grouped = computed(() => all.value.filter((m) => group.value === null || m.node.group === group.value))
const any = computed(() => all.value.some((m) => m.projects.length))
// The totals describe the group, whatever is typed in the search box.
const summary = computed(() => projectSummary(grouped.value))
const shown = computed(() => matchProjects(grouped.value, q.value))
const idle = computed(() => grouped.value.filter((m) => !m.projects.length))
const entries = computed(() => byProject(shown.value))
const flag = (node: MonitorNode) => (node.country ? flagUrl(node.country) : undefined)
const badge = (node: MonitorNode) => providerBadge(store.config.nodes[String(node.id)]?.provider)
const score = (node: MonitorNode) => (node.online ? String(store.scores[node.id]?.overall ?? '—') : 'OFF')
function clearFilters() {
  group.value = null
  setQuery('q', undefined)
}
</script>
<template>
  <PageHeading :crumbs="crumbs" title="项目" description="每台机器上部署了什么，每个项目在哪台机器上。">
    <template v-if="!store.closed && any" #tabs>
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
  <div v-else-if="store.loading && !store.nodes.length" class="empty-state panel" aria-busy="true">
    <Boxes :size="32" />
    <p>正在加载节点…</p>
  </div>
  <div v-else-if="!store.nodes.length" class="empty-state panel">
    <Server :size="32" />
    <h3>{{ store.error ? '暂时无法获取节点' : '阵容正在等待第一位球员' }}</h3>
    <p>请在 Monitor Hub 中添加节点，并允许在公开页显示。</p>
  </div>
  <div v-else-if="!any" class="empty-state panel">
    <Boxes :size="32" />
    <h3>还没有登记项目</h3>
    <p>在“主题设置 → 节点设置”里为每台机器添加项目。</p>
    <RouterLink v-if="store.me?.authed" class="primary-link" to="/settings">去登记</RouterLink>
  </div>
  <template v-else>
    <section class="network-summary panel pj-summary" aria-label="项目概览">
      <span class="ns-title"><i class="ns-dot" aria-hidden="true" />项目分布</span>
      <span class="pj-stats"
        ><span
          ><b>{{ summary.projects }}</b> 个项目</span
        ><span
          ><b>{{ summary.machines }}</b> 台机器在用</span
        ><span
          ><b>{{ summary.idle }}</b> 台空闲</span
        ><span class="pj-down" :data-on="summary.down > 0"
          ><b>{{ summary.down }}</b> 个项目受离线影响</span
        ></span
      >
      <label class="pj-search"
        ><Search :size="14" aria-hidden="true" /><input
          :value="q"
          type="search"
          aria-label="搜索项目"
          placeholder="搜索项目、域名或机器"
          autocomplete="off"
          @input="setQuery('q', ($event.target as HTMLInputElement).value || undefined)"
      /></label>
      <span class="ns-ranges" role="group" aria-label="查看方式"
        ><button
          type="button"
          :class="{ selected: view === 'node' }"
          :aria-pressed="view === 'node'"
          @click="view = 'node'"
        >
          按机器</button
        ><button
          type="button"
          :class="{ selected: view === 'project' }"
          :aria-pressed="view === 'project'"
          @click="view = 'project'"
        >
          按项目
        </button></span
      >
    </section>
    <div v-if="!shown.length" class="empty-state panel">
      <Boxes :size="32" />
      <h3>没有找到匹配的项目</h3>
      <p>试试其他名称或域名，或切换分组。</p>
      <Button variant="outline" @click="clearFilters">清除筛选</Button>
    </div>
    <div v-else-if="view === 'node'" class="pj-grid">
      <section
        v-for="m in shown"
        :key="m.node.id"
        class="pj-machine panel"
        :data-online="m.node.online"
        :aria-label="`${m.node.name} 的项目`"
      >
        <RouterLink :to="`/node/${m.node.id}`" class="pj-head"
          ><img
            v-if="flag(m.node)"
            class="nr-flag"
            :src="flag(m.node)"
            :title="countryName(m.node.country)"
            alt=""
          /><b :title="m.node.name">{{ m.node.name }}</b
          ><span v-if="badge(m.node)" class="pj-provider" :title="badge(m.node)!.name"
            ><img v-if="badge(m.node)!.image" :src="badge(m.node)!.image" alt="" /><svg
              v-else-if="badge(m.node)!.icon"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path :d="badge(m.node)!.icon!.path" /></svg
            ><template v-else>{{ badge(m.node)!.short }}</template></span
          ><small>{{ m.node.group || '未分组' }}</small
          ><em :data-online="m.node.online">{{ m.node.online ? '在线' : '离线' }}</em
          ><span class="pj-score" title="综合评分">{{ score(m.node) }}</span
          ><span class="pj-count">{{ m.projects.length }} 个项目</span></RouterLink
        >
        <ul class="pj-list">
          <li v-for="p in m.projects" :key="p.name"><ProjectTile :project="p" /></li>
        </ul>
      </section>
    </div>
    <section v-else class="pj-table panel" aria-label="按项目查看">
      <div class="pj-thead" aria-hidden="true">
        <span
          >项目 <small>{{ entries.length }}</small></span
        ><span>网址</span><span>所在机器</span><span>备注</span>
      </div>
      <div v-for="e in entries" :key="e.key" class="pj-row" :data-down="e.down">
        <span class="pj-item"
          ><i class="pj-tile" :style="{ '--h': tileHue(e.name) }" aria-hidden="true">{{
            tileLetter(e.name)
          }}</i
          ><b class="pj-name">{{ e.name }}</b></span
        >
        <span class="pj-urls"
          ><a
            v-for="url in e.urls"
            :key="url"
            class="pj-url"
            :href="url"
            target="_blank"
            rel="noopener noreferrer"
            ><span>{{ urlHost(url) }}</span
            ><ExternalLink :size="12" aria-hidden="true" /></a
          ><span v-if="!e.urls.length" class="pj-muted">—</span></span
        >
        <span class="pj-hosts"
          ><RouterLink
            v-for="h in e.hosts"
            :key="h.id"
            :to="`/node/${h.id}`"
            class="pj-host"
            :data-online="h.online"
            ><img v-if="flag(h)" class="nr-flag" :src="flag(h)" alt="" /><span>{{ h.name }}</span
            ><em v-if="!h.online">离线</em></RouterLink
          ></span
        >
        <span class="pj-muted pj-note" :title="e.notes.join(' · ')">{{ e.notes.join(' · ') || '—' }}</span>
      </div>
    </section>
    <p v-if="view === 'node' && !q.trim() && idle.length" class="pj-idle panel">
      <b>空闲 {{ idle.length }} 台</b>
      <RouterLink v-for="m in idle" :key="m.node.id" :to="`/node/${m.node.id}`"
        ><img v-if="flag(m.node)" class="nr-flag" :src="flag(m.node)" alt="" />{{ m.node.name }}</RouterLink
      >
    </p>
  </template>
</template>
