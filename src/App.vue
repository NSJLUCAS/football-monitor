<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch, watchEffect } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import { Sun, Moon, Settings2, ArrowUpRight, Search } from '@lucide/vue'
import { useMonitorStore } from './stores/monitor'
import manifest from '../theme.json'
import { Button } from './components/ui/button'
const store = useMonitorStore(),
  route = useRoute(),
  router = useRouter()
const visitor = ref<string | null>(null)
try {
  visitor.value = localStorage.getItem('football-monitor:appearance')
} catch {
  /* Optional visitor preference. */
}
const media = matchMedia('(prefers-color-scheme: dark)'),
  systemDark = ref(media.matches)
const appearance = computed(() => visitor.value || store.config.appearance)
const dark = computed(() => (appearance.value === 'system' ? systemDark.value : appearance.value !== 'light'))
const systemChange = () => {
  systemDark.value = media.matches
}
function toggleAppearance() {
  visitor.value = dark.value ? 'light' : 'dark'
  try {
    localStorage.setItem('football-monitor:appearance', visitor.value)
  } catch {
    /* Preference lasts this visit. */
  }
}
watchEffect(() => {
  document.documentElement.classList.toggle('dark', dark.value)
  document.documentElement.dataset.motion = String(store.config.motion)
})
// The header search mirrors `?q=`: it filters the home page live and jumps back there from other pages.
const search = ref('')
watch(
  () => route.query.q,
  (q) => {
    search.value = typeof q === 'string' ? q : ''
  },
  { immediate: true },
)
function onSearchInput(event: Event) {
  search.value = (event.target as HTMLInputElement).value
  if (route.path !== '/') return
  const query = { ...route.query }
  if (search.value) query.q = search.value
  else delete query.q
  void router.replace({ query })
}
function onSearchEnter(event: KeyboardEvent) {
  // Enter also confirms a Chinese IME candidate; only a finished query should navigate.
  if (event.isComposing || event.keyCode === 229) return
  if (route.path !== '/') void router.push({ path: '/', query: search.value ? { q: search.value } : {} })
}
function searchShortcut(event: KeyboardEvent) {
  const target = event.target as HTMLElement | null
  if (
    event.key !== '/' ||
    event.ctrlKey ||
    event.metaKey ||
    event.altKey ||
    target?.isContentEditable ||
    ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName || '')
  )
    return
  event.preventDefault()
  document.getElementById('node-search')?.focus()
}
onMounted(() => {
  media.addEventListener('change', systemChange)
  window.addEventListener('keydown', searchShortcut)
  store.start()
})
onBeforeUnmount(() => {
  media.removeEventListener('change', systemChange)
  window.removeEventListener('keydown', searchShortcut)
  store.stop()
})
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
</script>
<template>
  <a href="#main" class="skip-link">跳到主要内容</a>
  <header class="site-header">
    <div class="header-inner">
      <RouterLink to="/" class="brand" aria-label="Football Monitor 首页"
        ><img src="/favicon.svg" alt="" /><span class="brand-word"
          >FOOTBALL <strong>MONITOR</strong></span
        ></RouterLink
      >
      <nav class="main-nav" aria-label="主导航">
        <RouterLink to="/" exact-active-class="active">首页</RouterLink
        ><RouterLink to="/#squad">服务器</RouterLink>
      </nav>
      <label class="header-search"
        ><Search :size="15" /><input
          id="node-search"
          :value="search"
          type="search"
          aria-label="搜索服务器"
          placeholder="搜索名称、分组或备注…"
          autocomplete="off"
          @input="onSearchInput"
          @keydown.enter="onSearchEnter"
        /><kbd>/</kbd></label
      >
      <div class="header-actions">
        <span class="connection-pill" :data-state="store.connection" :title="connectionText"
          ><i aria-hidden="true" /><span class="connection-text">{{ connectionText }}</span></span
        ><Button v-if="store.me?.authed" variant="ghost" size="icon" as-child aria-label="主题设置"
          ><RouterLink to="/settings"><Settings2 :size="18" /></RouterLink></Button
        ><Button
          variant="ghost"
          size="icon"
          :aria-label="dark ? '切换浅色外观' : '切换深色外观'"
          @click="toggleAppearance"
          ><Sun v-if="dark" :size="19" /><Moon v-else :size="19" /></Button
        ><a href="/admin/" class="admin-link">控制台<ArrowUpRight :size="13" /></a>
      </div>
    </div>
  </header>
  <main id="main" class="page-container" tabindex="-1"><RouterView /></main>
  <footer class="site-footer">
    <div class="footer-brand">
      FOOTBALL<strong>MONITOR</strong> <span>V{{ manifest.version }}</span>
    </div>
    <p>每一次连接，都是主场。<span class="footer-divider">/</span> {{ store.me?.site_name || 'Monitor' }}</p>
  </footer>
</template>
