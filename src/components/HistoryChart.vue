<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue'
import { chartSegments, timeTicks, type ChartBand, type ChartSeries } from '../domain/chart'
const props = withDefaults(
  defineProps<{
    title: string
    series: ChartSeries[]
    unit: string
    step?: number
    maximum?: number
    height?: number
    /** A log axis needs `ticks`: its first and last are the axis ends. */
    scale?: 'linear' | 'log'
    /** Values to mark on the value axis; by default 0, half and the top. */
    ticks?: number[]
    format?: (value: number) => string
    /** Ranges filled between two lines, such as a rate's mean and its peak. */
    bands?: ChartBand[]
    /** Where the legend goes: under the plot, beside the title, or nowhere. */
    legend?: 'bottom' | 'top' | 'none'
    /** A note beside the legend, such as the axis being logarithmic. */
    note?: string
  }>(),
  {
    step: 60,
    maximum: undefined,
    height: 140,
    scale: 'linear',
    ticks: undefined,
    format: undefined,
    bands: () => [],
    legend: 'bottom',
    note: undefined,
  },
)
const titleId = useId(),
  hover = ref<{ ts: number; left: number; flip: boolean } | null>(null)
const points = computed(() => props.series.flatMap((s) => s.points))
const valid = computed(() => points.value.filter((p) => p.value !== null))
const minTime = computed(() => Math.min(...points.value.map((p) => p.ts)))
const maxTime = computed(() => Math.max(...points.value.map((p) => p.ts)))
const top = computed(
  () => props.ticks?.at(-1) ?? (props.maximum || Math.max(1, ...valid.value.map((p) => p.value || 0)) * 1.1),
)
// A linear axis starts at its first tick, so latency can hug the data; by default that is zero.
const floor = computed(() => (props.scale === 'log' ? (props.ticks?.[0] ?? 1) : (props.ticks?.[0] ?? 0)))
const marks = computed(() => props.ticks ?? [0, top.value / 2, top.value])
// Drawn at the panel's own width, one unit to a pixel, so a wide panel is filled and text keeps its size.
const plot = ref<HTMLElement>(),
  width = ref(480)
// The plot exists only while there is history to draw, so it is measured whenever it appears.
watch(plot, (element, _, onCleanup) => {
  if (!element || typeof ResizeObserver !== 'function') return
  const observer = new ResizeObserver(([entry]) => {
    if (entry && entry.contentRect.width > 0) width.value = Math.round(entry.contentRect.width)
  })
  observer.observe(element)
  onCleanup(() => observer.disconnect())
})
// Value labels on the left, time labels along the bottom.
const LEFT = 64,
  RIGHT = 18,
  TOP = 11
const right = computed(() => width.value - RIGHT),
  bottom = computed(() => props.height - 27)
const x = (ts: number) =>
  LEFT + ((ts - minTime.value) / (maxTime.value - minTime.value || 1)) * (right.value - LEFT)
// Share of the axis height a value reaches; a log axis has no zero, so slower values sit on its floor.
const share = (value: number) => {
  if (props.scale !== 'log') return Math.max(0, (value - floor.value) / (top.value - floor.value || 1))
  const lo = Math.log10(floor.value),
    hi = Math.log10(top.value)
  return (Math.log10(Math.max(value, floor.value)) - lo) / (hi - lo || 1)
}
const y = (value: number | null) =>
  value === null ? bottom.value : bottom.value - share(value) * (bottom.value - TOP)
const line = (seg: { ts: number; value: number | null }[]) =>
  seg.map((p, i) => `${i ? 'L' : 'M'}${x(p.ts).toFixed(2)},${y(p.value).toFixed(2)}`).join(' ')
const paths = computed(() =>
  props.series.map((s) => ({
    ...s,
    segments: chartSegments(s.points, props.step).map((seg) => {
      const path = line(seg)
      return {
        points: seg,
        path,
        // A filled line closes down to the axis floor.
        area: s.fill
          ? `${path} L${x(seg.at(-1)!.ts).toFixed(2)},${bottom.value} L${x(seg[0]!.ts).toFixed(2)},${bottom.value} Z`
          : '',
      }
    }),
  })),
)
// A band runs along its high edge and back along its low one, wherever both are known.
const bandPaths = computed(() =>
  props.bands.map((band) => {
    const lows = new Map(band.low.map((p) => [p.ts, p.value]))
    const paired = band.high.map((p) => ({
      ts: p.ts,
      value: p.value === null ? null : p.value,
      low: lows.get(p.ts),
    }))
    const both = paired.map((p) => ({ ts: p.ts, value: p.low == null ? null : p.value }))
    return {
      color: band.color,
      paths: chartSegments(both, props.step).map((seg) => {
        const back = [...seg].reverse().map((p) => ({ ts: p.ts, value: lows.get(p.ts) ?? null }))
        return `${line(seg)} ${line(back).replace(/^M/, 'L')} Z`
      }),
    }
  }),
)
// Noted samples, a failed one on the floor of the plot.
const marked = computed(() =>
  props.series.flatMap((s) =>
    s.points.flatMap((p) => (p.mark ? [{ key: `${s.name}-${p.ts}`, cx: x(p.ts), cy: y(p.value) }] : [])),
  ),
)
const xTicks = computed(() => timeTicks(minTime.value, maxTime.value))
const short = (v: number) => (props.format ? props.format(v) : `${Number(v.toFixed(1))}${props.unit}`)
const latest = (series: ChartSeries) => {
  const value = series.points.filter((p) => p.value !== null).at(-1)?.value
  return value == null ? '—' : short(value)
}
const listed = computed(() => props.series.filter((s) => s.legend !== false))
const clock = (ts: number) =>
  new Date(ts * 1000).toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
const nearest = <T extends { ts: number }>(list: T[], ts: number) =>
  list.reduce<T | null>((a, p) => (!a || Math.abs(p.ts - ts) < Math.abs(a.ts - ts) ? p : a), null)
function move(event: MouseEvent) {
  const box = (event.currentTarget as SVGElement).getBoundingClientRect(),
    scale = box.width / width.value || 1,
    vx = (event.clientX - box.left) / scale
  const point = nearest(
    valid.value,
    minTime.value + ((vx - LEFT) / (right.value - LEFT)) * (maxTime.value - minTime.value),
  )
  if (!point) return void (hover.value = null)
  const left = x(point.ts) * scale
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
      mark: p && Math.abs(p.ts - at) <= props.step * 1.7 ? p.mark : undefined,
      y: value === null ? null : y(value),
    }
  })
})
</script>
<template>
  <section class="chart-panel panel">
    <div class="chart-head">
      <h3 :id="titleId">{{ title }}</h3>
      <div v-if="legend === 'top' && valid.length" class="chart-legend">
        <span v-for="s in listed" :key="s.name"><i :style="{ background: s.color }" />{{ s.name }}</span>
        <slot name="legend" />
        <small v-if="note" class="chart-note">{{ note }}</small>
      </div>
    </div>
    <slot name="toolbar" />
    <template v-if="valid.length">
      <div ref="plot" class="chart-plot">
        <svg
          class="chart-svg"
          :viewBox="`0 0 ${width} ${height}`"
          :style="{ height: `${height}px` }"
          role="img"
          :aria-labelledby="titleId"
          @mousemove="move"
          @mouseleave="hover = null"
        >
          <g v-for="tick in marks" :key="tick">
            <line
              :x1="LEFT"
              :x2="right"
              :y1="y(tick)"
              :y2="y(tick)"
              stroke="currentColor"
              stroke-opacity=".12"
              stroke-dasharray="3 4"
            />
            <text class="chart-axis-y" :x="LEFT - 8" :y="y(tick) + 3" text-anchor="end">
              {{ short(tick) }}
            </text>
          </g>
          <g v-for="(band, b) in bandPaths" :key="`band-${b}`">
            <path
              v-for="(d, i) in band.paths"
              :key="i"
              class="chart-band"
              :d="d"
              :fill="band.color"
              fill-opacity=".1"
              stroke="none"
            />
          </g>
          <g v-for="seriesItem in paths" :key="seriesItem.name">
            <g v-for="(segment, index) in seriesItem.segments" :key="index">
              <path
                v-if="segment.area"
                class="chart-area"
                :d="segment.area"
                fill="currentColor"
                fill-opacity=".09"
                stroke="none"
              />
              <path
                :d="segment.path"
                fill="none"
                :stroke="seriesItem.color"
                :stroke-width="seriesItem.dashed ? 1 : 1.6"
                :stroke-dasharray="seriesItem.dashed ? '3 3' : undefined"
                :stroke-opacity="seriesItem.dashed ? 0.45 : undefined"
                stroke-linejoin="round"
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
          <circle
            v-for="m in marked"
            :key="m.key"
            class="chart-mark"
            :cx="m.cx"
            :cy="m.cy"
            r="2.6"
            fill="#ef4444"
            stroke="var(--surface)"
            stroke-width="1"
          />
          <text
            v-for="t in xTicks"
            :key="t.ts"
            class="chart-axis-x"
            :x="x(t.ts)"
            :y="height - 3"
            text-anchor="middle"
          >
            {{ t.label }}
          </text>
          <g v-if="hover">
            <line
              :x1="x(hover.ts)"
              :x2="x(hover.ts)"
              :y1="TOP - 1"
              :y2="bottom"
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
            ><i :style="{ background: r.color }" />{{ r.name }}<b>{{ r.value }}</b
            ><em v-if="r.mark" class="chart-tip-mark">{{ r.mark }}</em></span
          >
        </div>
      </div>
      <div v-if="legend === 'bottom'" class="chart-legend">
        <span v-for="s in listed" :key="s.name"
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
