<script setup lang="ts">
import { computed, ref, useId } from 'vue'
import { chartSegments, type ChartSeries } from '../domain/chart'
const props = withDefaults(
  defineProps<{ title: string; series: ChartSeries[]; unit: string; step?: number; maximum?: number }>(),
  { step: 60, maximum: undefined },
)
const titleId = useId(),
  hover = ref<{ ts: number; left: number; flip: boolean } | null>(null)
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
const nearest = <T extends { ts: number }>(list: T[], ts: number) =>
  list.reduce<T | null>((a, p) => (!a || Math.abs(p.ts - ts) < Math.abs(a.ts - ts) ? p : a), null)
// The viewBox keeps its aspect ratio, so a wide panel letterboxes it: map the pointer through that fit.
function move(event: MouseEvent) {
  const box = (event.currentTarget as SVGElement).getBoundingClientRect(),
    scale = Math.min(box.width / 480, box.height / 140) || 1,
    offset = (box.width - 480 * scale) / 2,
    vx = (event.clientX - box.left - offset) / scale
  const point = nearest(valid.value, minTime.value + ((vx - 38) / 424) * (maxTime.value - minTime.value))
  if (!point) return void (hover.value = null)
  const left = offset + x(point.ts) * scale
  hover.value = { ts: point.ts, left, flip: left > box.width * 0.6 }
}
// Every series at the hovered time; a series with no sample close by reads as missing.
const readings = computed(() => {
  const at = hover.value?.ts
  if (at === undefined) return []
  return props.series.map((s) => {
    // The sample nearest the hovered time, failed ones included: a failure reads as missing.
    const p = nearest(s.points, at),
      value = p && Math.abs(p.ts - at) <= props.step * 1.7 ? p.value : null
    return {
      name: s.name,
      color: s.color,
      value: value === null ? '—' : short(value),
      y: value === null ? null : y(value),
    }
  })
})
</script>
<template>
  <section class="chart-panel panel">
    <h3 :id="titleId">{{ title }}</h3>
    <template v-if="valid.length">
      <div class="chart-plot">
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
            <template v-for="r in readings" :key="r.name">
              <circle
                v-if="r.y !== null"
                class="chart-hover-dot"
                :cx="x(hover.ts)"
                :cy="r.y"
                r="3"
                :fill="r.color"
                stroke="var(--surface)"
                stroke-width="1"
              />
            </template>
          </g>
        </svg>
        <div
          v-if="hover"
          class="chart-tip"
          :class="{ flip: hover.flip }"
          :style="{ left: `${hover.left}px` }"
          role="status"
        >
          <strong>{{ clock(hover.ts) }}</strong>
          <span v-for="r in readings" :key="r.name"
            ><i :style="{ background: r.color }" />{{ r.name }}<b>{{ r.value }}</b></span
          >
        </div>
      </div>
      <div class="chart-legend">
        <span v-for="s in series" :key="s.name"
          ><i :style="{ background: s.color }" />{{ s.name }} · {{ latest(s) }}</span
        >
      </div>
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
