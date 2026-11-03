<script setup lang="ts">
import { computed } from 'vue'
import { levelColor } from '../domain/carriers'
import { SEGMENTS, type Segment } from '../domain/network'
const props = withDefaults(defineProps<{ segments: Segment[] | null; label: string; loading?: boolean }>(), {
  loading: true,
})
const pad = (n: number) => String(n).padStart(2, '0')
// Slices longer than an hour (the 7- and 30-day windows) carry their date.
const stamp = (ts: number, dated: boolean) => {
  const d = new Date(ts * 1000)
  return `${dated ? `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` : ''}${pad(d.getHours())}:${pad(d.getMinutes())}`
}
const cells = computed(() =>
  props.segments
    ? props.segments.map((s) => {
        const dated = s.to - s.from > 3600,
          span = `${stamp(s.from, dated)}–${stamp(s.to, dated)}`
        return {
          color: s.color,
          title:
            s.latency === null && s.loss === null
              ? `${span} · 无数据`
              : `${span} · 平均 ${s.latency === null ? '—' : `${Math.round(s.latency)} ms`} · 丢包 ${s.loss === null ? '—' : `${s.loss.toFixed(1)}%`}`,
        }
      })
    : Array.from({ length: SEGMENTS }, () => ({ color: levelColor(null), title: undefined })),
)
</script>
<template>
  <span
    class="quality-bar"
    role="img"
    :aria-label="label"
    :data-state="!segments && loading ? 'loading' : undefined"
    ><i v-for="(c, n) in cells" :key="n" :style="{ background: c.color, '--i': n }" :title="c.title"
  /></span>
</template>
