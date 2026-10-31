<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { latencyColor, lossColor, probeBars, shownProbes } from '../domain/carriers'
import { bytes, rate } from '../domain/format'
import type { HistoryResponse, MonitorNode, NodeConfig } from '../domain/types'
const props = defineProps<{
  node: MonitorNode
  nodeConfig?: NodeConfig
  history?: HistoryResponse
  unavailable?: boolean
  showCarriers: boolean
  showTraffic?: boolean
}>()
const metrics = computed(() => (props.node.online ? props.node.metrics : null))
// The bars sweep while the probes load, then fill in from the left the first time they arrive; probes
// already loaded when the card mounts, refreshes and failed requests show as they are.
const arrived = ref(false)
watch(
  () => props.history,
  (now, before) => {
    if (now && !before) arrived.value = true
  },
)
const barState = computed(() =>
  !props.history && !props.unavailable ? 'loading' : arrived.value ? 'fill' : undefined,
)
const rows = computed(() =>
  shownProbes(props.history, props.nodeConfig, props.node.online, props.unavailable),
)
const bars = computed(() => {
  const b = probeBars(
    props.history,
    rows.value.map((r) => r.taskId),
  )
  return [
    {
      kind: 'latency',
      label: '延迟',
      value: props.node.online && b.currentLatency !== null ? `${Math.round(b.currentLatency)} ms` : '—',
      colors: b.latency.map(latencyColor),
    },
    {
      kind: 'loss',
      label: '丢包',
      value: b.windowLoss === null ? '—' : `${b.windowLoss.toFixed(1)}%`,
      colors: b.loss.map(lossColor),
    },
  ]
})
</script>
<template>
  <div class="card-live-strip">
    <div class="strip-line strip-speed">
      <span class="strip-bar-label">速率</span><i class="strip-bar-leader" aria-hidden="true" /><span
        class="strip-bar-value"
        ><span class="strip-down"
          ><span class="sr-only">下载 </span><b aria-hidden="true">↓</b>{{ rate(metrics?.net_rx) }}</span
        ><span class="strip-up"
          ><span class="sr-only">上传 </span><b aria-hidden="true">↑</b>{{ rate(metrics?.net_tx) }}</span
        ></span
      >
    </div>
    <!-- Hub-booked counters, so offline nodes keep today's figure. -->
    <div
      v-if="showTraffic"
      class="strip-line strip-bar"
      data-kind="today"
      :title="`↓ ${bytes(node.day_rx)} · ↑ ${bytes(node.day_tx)}`"
    >
      <span class="strip-bar-label">今日流量</span><i class="strip-bar-leader" aria-hidden="true" /><span
        class="strip-bar-value"
        >{{ bytes(node.day_rx + node.day_tx) }}</span
      >
    </div>
    <template v-if="showCarriers">
      <div class="strip-row strip-carriers">
        <span v-if="!rows.length" class="strip-empty">—</span>
        <span
          v-for="p in rows"
          :key="p.taskId"
          class="strip-carrier"
          :data-carrier="p.carrier"
          :style="p.color ? { '--carrier': p.color } : undefined"
          :title="p.title"
          ><span class="strip-carrier-name"
            ><img
              v-if="p.logo"
              class="strip-carrier-logo"
              :src="p.logo"
              alt=""
              aria-hidden="true"
              decoding="async"
            /><i v-else aria-hidden="true" /><span>{{ p.region }}</span></span
          ><span class="strip-latency"
            >{{ p.latency === null ? '—' : `${Number(p.latency.toFixed(1))}`
            }}<small v-if="p.latency !== null" class="strip-unit">ms</small></span
          ></span
        >
      </div>
      <div class="strip-bars">
        <div
          v-for="bar in bars"
          :key="bar.kind"
          class="strip-line strip-bar"
          :data-kind="bar.kind"
          :data-state="barState"
        >
          <span class="strip-bar-label">{{ bar.label }}</span
          ><i class="strip-bar-leader" aria-hidden="true" /><span class="strip-bar-value">{{
            bar.value
          }}</span>
          <span class="strip-segs" aria-hidden="true"
            ><i
              v-for="(color, i) in bar.colors"
              :key="i"
              class="strip-seg"
              :style="{ background: color, '--i': i }"
          /></span>
        </div>
      </div>
    </template>
  </div>
</template>
