<script setup lang="ts">
import { computed, ref, useId } from 'vue'
import { chartSegments, type ChartSeries, type ChartPoint } from '../domain/chart'
const props = withDefaults(
  defineProps<{ title: string; series: ChartSeries[]; unit: string; step?: number; maximum?: number }>(),
  { step: 60, maximum: undefined },
)
const titleId = useId(),
  hover = ref<ChartPoint | null>(null)
const points = computed(() => props.series.flatMap((s) => s.points))
const valid = computed(() => points.value.filter((p) => p.value !== null))
const minTime = computed(() => Math.min(...points.value.map((p) => p.ts)))
const maxTime = computed(() => Math.max(...points.value.map((p) => p.ts)))
const top = computed(() => props.maximum || Math.max(1, ...valid.value.map((p) => p.value || 0)) * 1.1)
const x = (ts: number) => 38 + ((ts - minTime.value) / (maxTime.value - minTime.value || 1)) * 424
const y = (value: number | null) => 113 - ((value || 0) / top.value) * 102
const paths = computed(() =>
  props.series.map((s) => ({
    ...s,
    segments: chartSegments(s.points, props.step).map((seg) => ({
      points: seg,
      path: seg.map((p, i) => `${i ? 'L' : 'M'}${x(p.ts).toFixed(2)},${y(p.value).toFixed(2)}`).join(' '),
    })),
  })),
)
const short = (v: number) => `${Number(v.toFixed(1))}${props.unit}`
const latest = (series: ChartSeries) => {
  const value = series.points.filter((p) => p.value !== null).at(-1)?.value
  return value == null ? '—' : short(value)
}
const clock = (ts: number) =>
  new Date(ts * 1000).toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
function move(event: MouseEvent) {
  const box = (event.currentTarget as SVGElement).getBoundingClientRect()
  const ts =
    minTime.value +
    ((((event.clientX - box.left) / box.width) * 480 - 38) / 424) * (maxTime.value - minTime.value)
  hover.value = valid.value.reduce<ChartPoint | null>(
    (a, p) => (!a || Math.abs(p.ts - ts) < Math.abs(a.ts - ts) ? p : a),
    null,
  )
}
</script>
<template>
  <section class="chart-panel panel">
    <h3 :id="titleId">{{ title }}</h3>
    <template v-if="valid.length">
      <svg
        class="chart-svg"
        viewBox="0 0 480 140"
        role="img"
        :aria-labelledby="titleId"
        @mousemove="move"
        @mouseleave="hover = null"
      >
        <g v-for="tick in [0, 0.5, 1]" :key="tick">
          <line
            x1="38"
            x2="462"
            :y1="113 - tick * 102"
            :y2="113 - tick * 102"
            stroke="currentColor"
            stroke-opacity=".12"
            stroke-dasharray="3 4"
          />
          <text x="0" :y="116 - tick * 102">{{ short(top * tick) }}</text>
        </g>
        <g v-for="seriesItem in paths" :key="seriesItem.name">
          <g v-for="(segment, index) in seriesItem.segments" :key="index">
            <path
              :d="segment.path"
              fill="none"
              :stroke="seriesItem.color"
              stroke-width="1.8"
              vector-effect="non-scaling-stroke"
            />
            <circle
              v-if="segment.points.length === 1"
              :cx="x(segment.points[0]!.ts)"
              :cy="y(segment.points[0]!.value)"
              r="2"
              :fill="seriesItem.color"
            />
          </g>
        </g>
        <text x="38" y="137">{{ clock(minTime) }}</text>
        <text x="462" y="137" text-anchor="end">{{ clock(maxTime) }}</text>
        <g v-if="hover">
          <line
            :x1="x(hover.ts)"
            :x2="x(hover.ts)"
            y1="10"
            y2="113"
            stroke="currentColor"
            stroke-opacity=".5"
          />
          <circle :cx="x(hover.ts)" :cy="y(hover.value)" r="3" fill="var(--primary)" />
        </g>
      </svg>
      <div class="chart-legend">
        <span v-for="s in series" :key="s.name"
          ><i :style="{ background: s.color }" />{{ s.name }} · {{ latest(s) }}</span
        >
      </div>
      <p v-if="hover" class="muted text-xs">{{ clock(hover.ts) }} · {{ short(hover.value || 0) }}</p>
      <details>
        <summary>查看数据与时间</summary>
        <div class="chart-table-wrap">
          <table>
            <thead>
              <tr>
                <th>指标</th>
                <th>时间</th>
                <th>数值</th>
              </tr>
            </thead>
            <tbody>
              <template v-for="s in series" :key="s.name"
                ><tr v-for="(point, i) in s.points" :key="i">
                  <td>{{ s.name }}</td>
                  <td>{{ clock(point.ts) }}</td>
                  <td>{{ point.value === null ? '无数据 / 探测失败' : short(point.value) }}</td>
                </tr></template
              >
            </tbody>
          </table>
        </div>
      </details>
    </template>
    <div v-else class="chart-empty">
      {{ points.length ? '此窗口没有成功样本（可能离线或探测失败）' : '暂无历史数据' }}
    </div>
  </section>
</template>
