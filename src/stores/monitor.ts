import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { parseConfig } from '../domain/config'
import { normalizeMe, record } from '../domain/normalize'
import { networkScore, nextTier, type NodeScore, type Tier } from '../domain/score'
import type { ConfigPatch, HistoryResponse, Me, MonitorNode } from '../domain/types'
import { ApiError, request, saveConfig } from '../services/api'
import { HistoryRepository } from '../services/history'
import { RealtimeController, type ConnectionState } from '../services/realtime'

export const useMonitorStore = defineStore('monitor', () => {
  const me = ref<Me | null>(null),
    nodes = ref<MonitorNode[]>([]),
    config = ref(parseConfig({}))
  const loading = ref(true),
    error = ref(''),
    closed = ref(false),
    connection = ref<ConnectionState>('connecting')
  const updatedAt = ref<number | null>(null),
    ping = ref<Record<string, HistoryResponse>>({}),
    pingErrors = ref<Record<string, string>>({}),
    // The last 24 hours of probes per node, for the network quality score.
    quality = ref<Record<string, HistoryResponse>>({}),
    qualityErrors = ref<Record<string, string>>({})
  let qualityAt: Record<number, number> = {}
  const saving = ref(false)
  const history = new HistoryRepository()
  let realtime: RealtimeController | null = null,
    boot = 0,
    mounted = false
  const groups = computed(() => [...new Set(nodes.value.map((n) => n.group).filter(Boolean))])
  const scores = computed(() => {
    const result: Record<number, NodeScore> = {}
    for (const node of nodes.value) result[node.id] = networkScore(node, quality.value[node.id])
    return result
  })
  const tiers = ref<Record<number, Tier>>({})
  // A failed history request settles the first tier as well, without changing any score.
  watch(
    [scores, () => Object.keys(qualityErrors.value).join()],
    ([current]) => {
      const next: Record<number, Tier> = {}
      for (const id of Object.keys(current).map(Number)) {
        const previous = tiers.value[id]
        // An online node gets its first tier only once its probe history has loaded or failed.
        const waiting =
          !previous &&
          !!nodes.value.find((n) => n.id === id)?.online &&
          !quality.value[id] &&
          !qualityErrors.value[id]
        if (!waiting) next[id] = nextTier(current[id]!.overall, previous)
      }
      tiers.value = next
    },
    { immediate: true },
  )
  // Probe history is fetched once for every online node so scores do not depend on which cards were
  // scrolled into view; visible cards refresh it every ten minutes.
  const prefetched = new Set<number>()
  watch(
    nodes,
    () => {
      if (closed.value) return
      for (const node of nodes.value)
        if (node.online && !prefetched.has(node.id)) {
          prefetched.add(node.id)
          void loadQuality(node.id, false, true)
        }
    },
    { immediate: true },
  )
  function clearSensitiveState() {
    boot++
    prefetched.clear()
    tiers.value = {}
    nodes.value = []
    ping.value = {}
    pingErrors.value = {}
    quality.value = {}
    qualityErrors.value = {}
    qualityAt = {}
    updatedAt.value = null
    history.clear()
    config.value = parseConfig({})
  }
  async function refreshIdentity(signal: AbortSignal): Promise<boolean> {
    const identity = normalizeMe(await request('/api/me', { signal }))
    const downgraded = me.value?.authed === true && !identity.authed
    if (downgraded) clearSensitiveState()
    me.value = identity
    if (!identity.authed && !identity.public_page) {
      unauthorized()
      return false
    }
    if (downgraded) {
      try {
        config.value = parseConfig(record(await request('/api/themes/football-monitor/config', { signal })))
      } catch {
        /* Defaults are safe after dropping the authenticated state. */
      }
    }
    return true
  }
  function unauthorized() {
    closed.value = true
    clearSensitiveState()
    if (me.value) me.value.authed = false
    config.value = parseConfig({})
    error.value = '登录已失效或公开页面已关闭，请重新登录后重试'
    realtime?.pause()
  }
  async function bootstrap() {
    const epoch = ++boot
    realtime?.stop()
    realtime = null
    loading.value = true
    error.value = ''
    closed.value = false
    const started = Promise.allSettled([request('/api/me'), request('/api/themes/football-monitor/config')])
    // Nodes are requested in the same round trip; the reply is used only once identity allows it.
    const early = request('/api/nodes')
    early.catch(() => {})
    const [identity, settings] = await started
    if (epoch !== boot) return
    if (identity.status === 'rejected') {
      error.value = '无法读取站点信息，请检查网络后重试'
      loading.value = false
      return
    }
    me.value = normalizeMe(identity.value)
    if (!me.value.authed && !me.value.public_page) {
      unauthorized()
      loading.value = false
      return
    }
    config.value = parseConfig(settings.status === 'fulfilled' ? record(settings.value) : {})
    const scheme = location.protocol === 'https:' ? 'wss' : 'ws'
    realtime = new RealtimeController({
      url: `${scheme}://${location.host}/api/ws${typeof DecompressionStream === 'function' ? '?gzip' : ''}`,
      onNodes: (data) => {
        nodes.value = data
        updatedAt.value = Date.now()
        loading.value = false
        error.value = ''
        closed.value = false
      },
      onStatus: (state, message) => {
        connection.value = state
        if (message) {
          error.value = message
          loading.value = false
        }
      },
      onUnauthorized: unauthorized,
      beforeRefresh: refreshIdentity,
      // A tab opened in the background starts later, with a fresh request.
      initialNodes: document.hidden ? undefined : early,
    })
    if (!document.hidden) realtime.start()
  }
  async function loadPing(id: number, force = false) {
    const epoch = boot
    try {
      const result = await history.get(id, 1, 'ping', force)
      if (epoch === boot && !closed.value) {
        ping.value[id] = result
        delete pingErrors.value[id]
      }
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) unauthorized()
      else if (epoch === boot) pingErrors.value[id] = e instanceof Error ? e.message : '延迟数据不可用'
    }
  }
  async function loadQuality(id: number, force = false, background = false) {
    if (!force && Date.now() - (qualityAt[id] ?? -Infinity) < 600000) {
      // A visible card moves its still-queued prefetch ahead.
      if (!background) history.prioritize(id, 24, 'ping')
      return
    }
    const epoch = boot
    qualityAt[id] = Date.now()
    try {
      const result = await history.get(id, 24, 'ping', force, background)
      if (epoch === boot && !closed.value) {
        quality.value[id] = result
        delete qualityErrors.value[id]
      }
    } catch (e) {
      // A failed request may be retried by the next visible-card refresh.
      delete qualityAt[id]
      if (e instanceof ApiError && e.status === 401) unauthorized()
      else if (epoch === boot) qualityErrors.value[id] = e instanceof Error ? e.message : '延迟数据不可用'
    }
  }
  async function save(patch: ConfigPatch) {
    if (!me.value?.authed) throw new ApiError(401, '仅站长可保存设置')
    saving.value = true
    try {
      config.value = await saveConfig(patch)
      return config.value
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) unauthorized()
      throw e
    } finally {
      saving.value = false
    }
  }
  // Cards rendered in the first batch of a page load fade in; cards mounted later appear at once.
  let introCards = 0,
    introClosed = false
  function introSlot(): number | null {
    if (introClosed) return null
    if (introCards === 0) setTimeout(() => (introClosed = true))
    return introCards++
  }
  const visibility = () => {
    if (document.hidden) realtime?.pause()
    else if (!closed.value) realtime?.start()
  }
  function start() {
    if (mounted) return
    mounted = true
    document.addEventListener('visibilitychange', visibility)
    void bootstrap()
  }
  function stop() {
    mounted = false
    boot++
    prefetched.clear()
    qualityAt = {}
    realtime?.stop()
    history.clear()
    document.removeEventListener('visibilitychange', visibility)
  }
  return {
    me,
    nodes,
    config,
    loading,
    error,
    closed,
    connection,
    updatedAt,
    groups,
    scores,
    tiers,
    ping,
    pingErrors,
    saving,
    history,
    start,
    stop,
    bootstrap,
    loadPing,
    quality,
    qualityErrors,
    loadQuality,
    introSlot,
    save,
    unauthorized,
    refreshIdentity,
    clearSensitiveState,
  }
})
