<script setup lang="ts">
import { computed } from 'vue'
import { bytes, duration, trafficUsed } from '../domain/format'
import { probeRegion } from '../domain/carriers'
import {
  NET_LABELS,
  NET_WEIGHTS,
  STAT_LABELS,
  statReadings,
  type NetKey,
  type NodeScore,
  type StatKey,
} from '../domain/score'
import type { MonitorNode } from '../domain/types'
import ScoreGauge from './ScoreGauge.vue'
const props = defineProps<{ node: MonitorNode; score: NodeScore }>()
const pair = (a: number | null | undefined, b: number | null | undefined) => `${bytes(a)} / ${bytes(b)}`
const ms = (v: number | null) => (v === null ? '—' : `${Number(v.toFixed(1))} ms`)
const pct = (v: number | null) => (v === null ? '—' : `${Number(v.toFixed(2))}%`)
const weights = (Object.keys(NET_WEIGHTS) as NetKey[])
  .map((k) => `${NET_LABELS[k]} ${Math.round(NET_WEIGHTS[k] * 100)}%`)
  .join(' + ')
const network = computed<{ key: NetKey; name: string; rows: [string, string][] }[]>(() => {
  const { values, probes } = props.score,
    region = (p: (typeof probes)[number]) => probeRegion(p.name) || `#${p.taskId}`
  return [
    {
      key: 'latency',
      name: '平均延迟',
      rows: [
        ['三个测速点平均', ms(values.latency)],
        ...probes.map((p): [string, string] => [region(p), ms(p.latency)]),
      ],
    },
    {
      key: 'jitter',
      name: '延迟抖动',
      rows: [
        ['平均波动', ms(values.jitter)],
        ...probes.map((p): [string, string] => [region(p), ms(p.jitter)]),
      ],
    },
    {
      key: 'loss',
      name: '丢包率',
      rows: [
        ['平均丢包', pct(values.loss)],
        ...probes.map((p): [string, string] => [region(p), pct(p.loss)]),
      ],
    },
  ]
})
const resources = computed<{ key: StatKey; name: string; rows: [string, string][] }[]>(() => {
  // An offline node's last report is history, not a live value: only record totals and counters stay.
  const n = props.node,
    m = n.online ? n.metrics : null
  return [
    {
      key: 'cpu',
      name: '处理器占用',
      rows: [
        ['占用', m ? `${Number(m.cpu.toFixed(1))}%` : '—'],
        ['负载 1 / 5 / 15', m ? m.load.map((v) => v.toFixed(2)).join(' / ') : '—'],
        ['核心数', n.cpu_cores ? `${n.cpu_cores} 核` : '—'],
      ],
    },
    {
      key: 'mem',
      name: '内存占用',
      rows: [
        ['已用 / 总量', pair(m?.mem_used, n.mem_total)],
        ['Swap 已用 / 总量', pair(m?.swap_used, n.swap_total)],
      ],
    },
    { key: 'dsk', name: '硬盘占用', rows: [['已用 / 总量', pair(m?.disk_used, n.disk_total)]] },
    {
      key: 'net',
      name: '流量使用',
      rows: [
        [
          '本周期已用 / 配额',
          `${bytes(trafficUsed(n))} / ${n.traffic_limit > 0 ? bytes(n.traffic_limit) : '不限量'}`,
        ],
        ['今日 ↓ / ↑', pair(n.day_rx, n.day_tx)],
        ['累计 ↓ / ↑', pair(n.total_rx, n.total_tx)],
      ],
    },
    {
      key: 'upt',
      name: '持续运行',
      rows: [['系统 Uptime（非 Agent 连续在线）', duration(m?.uptime)]],
    },
  ]
})
const readings = computed(() => statReadings(props.node, props.score))
</script>
<template>
  <div class="score-breakdown">
    <div class="section-heading">
      <h2>
        评分明细 <span class="score-overall">综合 {{ score.overall ?? '—' }}</span>
      </h2>
      <span>网络质量 = {{ weights }} · 最近 24 小时前三个测速点</span>
    </div>
    <p v-if="!node.online" class="score-offline">离线，无实时数据 · 下列仅显示配置总量与流量计数</p>
    <p v-else-if="score.overall === null" class="score-offline">最近 24 小时没有测速数据，暂不评分</p>
    <div class="score-groups">
      <div v-for="g in network" :key="g.key" class="score-group">
        <ScoreGauge :value="score.parts[g.key]" :label="NET_LABELS[g.key]" />
        <div class="score-group-body">
          <h3>{{ g.name }}</h3>
          <dl>
            <div v-for="[label, value] in g.rows" :key="label">
              <dt>{{ label }}</dt>
              <dd>{{ value }}</dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
    <h3 class="score-subtitle">资源状况</h3>
    <div class="score-groups">
      <div v-for="g in resources" :key="g.key" class="score-group">
        <div class="score-reading-box">
          <strong class="score-reading" :data-grade="readings[g.key].grade ?? undefined"
            >{{ readings[g.key].value
            }}<small v-if="readings[g.key].unit">{{ readings[g.key].unit }}</small></strong
          >
          <span class="gauge-label">{{ STAT_LABELS[g.key] }}</span>
        </div>
        <div class="score-group-body">
          <h3>{{ g.name }}</h3>
          <dl>
            <div v-for="[label, value] in g.rows" :key="label">
              <dt>{{ label }}</dt>
              <dd>{{ value }}</dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  </div>
</template>
