<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
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
const score = computed(() => store.scores[props.node.id] ?? emptyScore())
const tier = computed(() => store.tiers[props.node.id] ?? nextTier(score.value.overall))
const label = computed(
  () =>
    `查看 ${props.node.name} 详情，${props.node.online ? '在线' : '离线'}，综合 ${score.value.overall ?? '无数据'}`,
)
onBeforeUnmount(() => {
  observer?.disconnect()
  clearInterval(timer)
})
</script>
<template>
  <div ref="element" class="live-card">
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
      />
    </RouterLink>
  </div>
</template>
