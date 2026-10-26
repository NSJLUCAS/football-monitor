<script setup lang="ts">
import { computed } from 'vue'
import {
  carriers,
  latencyColor,
  lossColor,
  probeBars,
  probeRegion,
  resolveTask,
  statusText,
} from '../domain/carriers'
import { rate } from '../domain/format'
import type { HistoryResponse, MonitorNode, NodeConfig } from '../domain/types'
const props = defineProps<{
  node: MonitorNode
  nodeConfig?: NodeConfig
  history?: HistoryResponse
  unavailable?: boolean
  showCarriers: boolean
}>()
const metrics = computed(() => (props.node.online ? props.node.metrics : null))
// The first three Hub probes of this node, in Hub order (ascending task id), labelled by region.
const rows = computed(() => {
  const probes = props.history?.probes ?? {},
    now = Date.now() / 1000
  return Object.keys(probes)
    .map(Number)
    .sort((a, b) => a - b)
    .slice(0, 3)
    .map((taskId) => {
      const name = probes[String(taskId)] ?? '',
        carrier = carriers.find((c) => props.nodeConfig?.carriers?.[c.id]?.taskId === taskId),
        r = resolveTask(taskId, props.history, now, props.unavailable),
        // Offline nodes show no live latency, the same as their rates.
        latency = props.node.online ? r.latency : null,
        label = props.node.online ? statusText[r.status] : '节点离线'
      return {
        taskId,
        region: probeRegion(name) || `#${taskId}`,
        carrier: carrier?.id,
        color: carrier?.color,
        latency,
        title: [carrier?.name, name, label].filter(Boolean).join(' · '),
      }
    })
})
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
    <div class="strip-row strip-speed">
      <span class="strip-down"
        ><span class="sr-only">下载 </span><b aria-hidden="true">↓</b>{{ rate(metrics?.net_rx) }}</span
      >
      <span class="strip-up"
        ><span class="sr-only">上传 </span><b aria-hidden="true">↑</b>{{ rate(metrics?.net_tx) }}</span
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
          ><span class="strip-carrier-name"><i aria-hidden="true" />{{ p.region }}</span
          ><span class="strip-latency"
            >{{ p.latency === null ? '—' : `${Number(p.latency.toFixed(1))}`
            }}<small v-if="p.latency !== null" class="strip-unit">ms</small></span
          ></span
        >
      </div>
      <div v-for="bar in bars" :key="bar.kind" class="strip-bar" :data-kind="bar.kind">
        <span class="strip-bar-label">{{ bar.label }}</span
        ><i class="strip-bar-leader" aria-hidden="true" /><span class="strip-bar-value">{{ bar.value }}</span>
        <span class="strip-segs" aria-hidden="true"
          ><i v-for="(color, i) in bar.colors" :key="i" class="strip-seg" :style="{ background: color }"
        /></span>
      </div>
    </template>
  </div>
</template>
