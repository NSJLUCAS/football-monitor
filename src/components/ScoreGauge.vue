<script setup lang="ts">
import { computed } from 'vue'
const props = defineProps<{ value: number | null; label: string }>()
// Same lines as the card tiers: 75+ gold, 65–74 silver, below 65 bronze.
const color = computed(() =>
  props.value === null ? null : props.value >= 75 ? '#4ade80' : props.value >= 65 ? '#facc15' : '#f87171',
)
const ARC = 'M8 46 A38 38 0 0 1 84 46'
</script>
<template>
  <div
    class="score-gauge"
    role="meter"
    aria-valuemin="1"
    aria-valuemax="99"
    :aria-valuenow="value ?? undefined"
    :aria-valuetext="value === null ? '无数据' : undefined"
    :aria-label="`${label} 评分`"
  >
    <svg viewBox="0 0 92 52" aria-hidden="true">
      <path class="gauge-track" :d="ARC" pathLength="99" />
      <path
        v-if="value !== null"
        class="gauge-value-arc"
        :d="ARC"
        pathLength="99"
        :stroke="color!"
        :stroke-dasharray="`${value} 99`"
      />
    </svg>
    <strong class="gauge-value">{{ value ?? '—' }}</strong>
    <span class="gauge-label">{{ label }}</span>
  </div>
</template>
