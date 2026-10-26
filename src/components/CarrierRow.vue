<script setup lang="ts">
import { computed } from 'vue'
import { carriers, resolveCarrier } from '../domain/carriers'
import type { HistoryResponse, NodeConfig } from '../domain/types'
const props = defineProps<{ config?: NodeConfig; history?: HistoryResponse; unavailable?: boolean }>()
const rows = computed(() =>
  carriers.map((c) => ({
    ...c,
    ...resolveCarrier(props.config?.carriers?.[c.id], props.history, Date.now() / 1000, props.unavailable),
  })),
)
</script>
<template>
  <div class="carrier-row">
    <div
      v-for="c in rows"
      :key="c.id"
      class="carrier-cell"
      :style="{ '--carrier': c.color }"
      :title="`${c.name} · ${c.label}${c.taskId ? ` · 任务 #${c.taskId}` : ''}`"
    >
      <span class="carrier-name"
        ><svg viewBox="0 0 20 20" aria-hidden="true">
          <path d="m10 2 7 4v8l-7 4-7-4V6Zm0 0v16M3 6l14 8M17 6 3 14" /></svg
        >{{ c.short }}</span
      >
      <strong
        >{{ c.latency === null ? '—' : `${Number(c.latency.toFixed(1))}`
        }}<small v-if="c.latency !== null">ms</small></strong
      >
      <span class="carrier-line">{{ c.line }}</span>
      <span v-if="c.status !== 'success'" class="carrier-state">{{ c.label }}</span>
    </div>
  </div>
</template>
