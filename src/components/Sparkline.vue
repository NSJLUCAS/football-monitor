<script setup lang="ts">
import { computed, ref, watch } from 'vue'
/**
 * A line of recent values. The drawing is one step wider than its box and rests shifted left by that step, so
 * the newest point sits at the right edge; each new point redraws it unshifted and slides it over, which reads
 * as the line scrolling. With motion off it simply rests at the shifted end.
 */
const props = withDefaults(defineProps<{ values: number[]; color: string; fill?: boolean }>(), { fill: true })
const version = ref(0)
watch(
  () => props.values.join(),
  () => version.value++,
)
const shape = computed(() => {
  const v = props.values
  if (v.length < 3) return null
  const max = Math.max(...v),
    min = Math.min(...v),
    span = max - min || 1,
    steps = v.length - 1
  const points = v
    .map((y, i) => `${((i / steps) * 100).toFixed(2)},${(92 - ((y - min) / span) * 80).toFixed(2)}`)
    .join(' ')
  return {
    points,
    area: `0,100 ${points} 100,100`,
    width: `${(steps / (steps - 1)) * 100}%`,
    step: `${-100 / steps}%`,
  }
})
</script>
<template>
  <span class="sparkline" aria-hidden="true"
    ><svg
      v-if="shape"
      :key="version"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      :style="{ width: shape.width, '--spark-step': shape.step }"
    >
      <polygon v-if="fill" :points="shape.area" :fill="color" opacity="0.14" />
      <polyline
        :points="shape.points"
        fill="none"
        :stroke="color"
        stroke-width="2"
        stroke-linejoin="round"
        vector-effect="non-scaling-stroke"
      /></svg
  ></span>
</template>
