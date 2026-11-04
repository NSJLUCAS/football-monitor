<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
/** A number that eases to each new value; with motion switched off it shows the new value at once. */
const props = withDefaults(defineProps<{ value: number | null; digits?: number }>(), { digits: 0 })
const shown = ref(props.value)
let frame = 0
const still = () =>
  document.documentElement.dataset.motion === 'false' ||
  matchMedia('(prefers-reduced-motion: reduce)').matches
watch(
  () => props.value,
  (to, from) => {
    cancelAnimationFrame(frame)
    if (to === null || from === null || still()) {
      shown.value = to
      return
    }
    const start = performance.now(),
      begin = shown.value ?? from
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / 900)
      shown.value = begin + (to - begin) * (1 - (1 - k) ** 3)
      if (k < 1) frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
  },
)
onBeforeUnmount(() => cancelAnimationFrame(frame))
</script>
<template>
  <span class="rolling-number">{{ shown === null ? '—' : shown.toFixed(digits) }}</span>
</template>
