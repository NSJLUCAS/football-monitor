<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { carriers, latencyColor } from '../domain/carriers'
import { flagUrl } from '../domain/flags'
import { countryName } from '../domain/format'
import { LOSS_ALERT, sinceText, type NodeQuality, type Segment } from '../domain/network'
import type { MonitorNode } from '../domain/types'
import QualityBar from './QualityBar.vue'
const props = defineProps<{
  node: MonitorNode
  quality: NodeQuality | null
  segments: Segment[] | null
  showCarriers: boolean
  failed: boolean
  now: number
}>()
const flag = computed(() => (props.node.country ? flagUrl(props.node.country) : undefined))
// Offline nodes keep no readings; their last figures would read as current.
const q = computed(() => (props.node.online ? props.quality : null))
const cell = (latency: number | null | undefined, loss: number | null | undefined) =>
  latency == null && loss == null
    ? null
    : {
        // A line that failed every probe has no latency: a plain dash, not an empty-colour "—ms".
        latency: latency == null ? null : String(Math.round(latency)),
        color: latency == null ? undefined : latencyColor(latency),
        loss: loss == null ? '—' : `${loss.toFixed(1)}%`,
        alert: loss != null && loss >= LOSS_ALERT,
      }
const overall = computed(() => cell(q.value?.latency, q.value?.loss))
const lines = computed(() =>
  carriers.map((c) => {
    const r = q.value?.carriers[c.id]
    return {
      id: c.id,
      short: c.short,
      reading: cell(r?.latency, r?.loss),
      title: r ? `${c.name} · ${r.line} · ${r.name}` : `${c.name} · 未配置或本时段无数据`,
    }
  }),
)
const last = computed(() =>
  !q.value || !q.value.lines.length
    ? null
    : q.value.lastLoss === null
      ? (['无', '统计时段内'] as const)
      : sinceText(q.value.lastLoss, props.now),
)
const trendLabel = computed(() =>
  props.failed
    ? '加载失败'
    : !props.node.online
      ? '离线'
      : props.segments
        ? `${props.node.name} 质量走势`
        : '正在加载',
)
</script>
<template>
  <RouterLink :to="`/node/${node.id}#carriers`" class="network-row" :data-online="node.online">
    <span class="nr-node"
      ><img v-if="flag" class="nr-flag" :src="flag" :title="countryName(node.country)" alt="" /><span
        class="nr-name"
        ><b :title="node.name">{{ node.name }}</b
        ><small>{{ node.group || '未分组' }}</small></span
      ><em v-if="!node.online" class="nr-offline">离线</em></span
    >
    <span class="nr-trend"
      ><span v-if="failed" class="nr-failed">加载失败</span
      ><QualityBar v-else :segments="segments" :label="trendLabel" :loading="node.online"
    /></span>
    <span class="nr-overall nr-cell" data-label="综合"
      ><template v-if="overall"
        ><b :style="overall.color ? { color: overall.color } : undefined"
          >{{ overall.latency ?? '—' }}<em v-if="overall.latency">ms</em></b
        ><small :data-alert="overall.alert || undefined">{{ overall.loss }}</small></template
      ><template v-else>—</template></span
    >
    <template v-if="showCarriers">
      <span
        v-for="l in lines"
        :key="l.id"
        class="nr-carrier nr-cell"
        :data-carrier="l.id"
        :data-label="l.short"
        :title="l.title"
        ><template v-if="l.reading"
          ><b :style="l.reading.color ? { color: l.reading.color } : undefined"
            >{{ l.reading.latency ?? '—' }}<em v-if="l.reading.latency">ms</em></b
          ><small :data-alert="l.reading.alert || undefined">{{ l.reading.loss }}</small></template
        ><template v-else>—</template></span
      >
    </template>
    <span class="nr-last nr-cell" data-label="最近丢包"
      ><template v-if="last"
        ><b>{{ last[0] }}</b
        ><small>{{ last[1] }}</small></template
      ><template v-else>—</template></span
    >
    <span class="nr-jitter nr-cell" data-label="抖动"
      ><template v-if="q?.jitter != null"
        ><b>{{ q.jitter.toFixed(1) }}<em>ms</em></b></template
      ><template v-else>—</template></span
    >
  </RouterLink>
</template>
