<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { bytes } from '../domain/format'
import { emptyScore, nextTier } from '../domain/score'
import type { MonitorNode } from '../domain/types'
import { useMonitorStore } from '../stores/monitor'
import PlayerCard from './PlayerCard.vue'
import CardLiveStrip from './CardLiveStrip.vue'
const props = defineProps<{ node: MonitorNode }>()
const store = useMonitorStore(),
  element = ref<HTMLElement>(),
  visible = ref(false)
let observer: IntersectionObserver | undefined, timer: ReturnType<typeof setInterval> | undefined
// The last hour feeds the strip's Hub probes, so visible cards load it even when the carrier row is
// switched off or no carrier is mapped; the store refreshes the 24-hour score history at most every
// ten minutes.
const refresh = () => {
  if (!visible.value || document.hidden) return
  void store.loadPing(props.node.id)
  if (props.node.online) void store.loadQuality(props.node.id)
}
onMounted(() => {
  observer = new IntersectionObserver(
    (entries) => {
      visible.value = entries[0]?.isIntersecting || false
      refresh()
    },
    { rootMargin: '120px' },
  )
  if (element.value) observer.observe(element.value)
  timer = setInterval(refresh, 60000)
})
// The first cards of a page load wait for their face image (at most 1.2 s), then fade up in turn.
const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches,
  slot = store.config.motion && !reduced ? store.introSlot() : null,
  ready = ref(false)
let introTimer: ReturnType<typeof setTimeout> | undefined
const show = () => {
  ready.value = true
  clearTimeout(introTimer)
}
onMounted(() => {
  if (slot === null) return
  const face = element.value?.querySelector<HTMLImageElement>('img.pc-face')
  if (face?.complete && face.naturalWidth) return show()
  face?.addEventListener('load', show, { once: true })
  face?.addEventListener('error', show, { once: true })
  introTimer = setTimeout(show, 1200)
})
const score = computed(() => store.scores[props.node.id] ?? emptyScore())
const tier = computed(() => store.tiers[props.node.id] ?? nextTier(score.value.overall))
const label = computed(
  () =>
    `查看 ${props.node.name} 详情，${props.node.online ? '在线' : '离线'}，综合 ${score.value.overall ?? '无数据'}` +
    (store.config.show_traffic
      ? `，今日下行 ${bytes(props.node.day_rx)}，上行 ${bytes(props.node.day_tx)}`
      : ''),
)
onBeforeUnmount(() => {
  observer?.disconnect()
  clearInterval(timer)
  clearTimeout(introTimer)
})
</script>
<template>
  <div
    ref="element"
    class="live-card"
    :class="{ 'card-intro': slot !== null, 'card-ready': ready }"
    :style="slot === null ? undefined : { '--intro-delay': `${Math.min(slot, 12) * 40}ms` }"
  >
    <RouterLink class="live-card-link" :to="`/node/${node.id}`">
      <!-- The link is named by this text alone (name, status, overall); the card face and strip are hidden. -->
      <span class="sr-only">{{ label }}</span>
      <PlayerCard :node="node" :config="store.config" :score="score" :tier="tier" aria-hidden="true" />
      <CardLiveStrip
        aria-hidden="true"
        :node="node"
        :node-config="store.config.nodes[node.id]"
        :history="store.ping[node.id]"
        :unavailable="!!store.pingErrors[node.id]"
        :show-carriers="store.config.show_carriers"
        :show-traffic="store.config.show_traffic"
      />
    </RouterLink>
  </div>
</template>
