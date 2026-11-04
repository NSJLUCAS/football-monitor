<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { geoContains, geoDistance, geoInterpolate, geoOrthographic, geoPath } from 'd3-geo'
import { feature, mesh } from 'topojson-client'
import type { Topology, GeometryCollection } from 'topojson-specification'
import type { Feature, FeatureCollection, MultiLineString } from 'geojson'
import world from 'world-atlas/countries-110m.json'
import landAtlas from 'world-atlas/land-110m.json'
import { flagUrl } from '../domain/flags'
import { countryName } from '../domain/format'
import type { CountryMarker } from '../domain/ops'

/**
 * The ops wall's globe: Natural Earth countries (world-atlas, 1:110m) drawn on a canvas in orthographic
 * projection, turning slowly, with one clickable marker per country laid over it. A target (a node or a
 * country) turns the globe to that place, comes closer, and puts a reticle there, with the card slot beside it. Drawing runs at
 * most 30 frames a second (60 while dragged) and stops while the page is hidden; with motion off the globe stays
 * still and jumps.
 */
const props = defineProps<{
  markers: CountryMarker[]
  /** Where to look: `key` changes with what is shown, so the reticle and card replay their entrance. */
  target: { key: string; code: string; at: readonly [number, number] } | null
  stale: boolean
}>()
const emit = defineEmits<{ pick: [code: string]; grab: []; blank: [] }>()

const countries = (
  feature(
    world as unknown as Topology,
    (world as unknown as Topology).objects.countries as GeometryCollection,
  ) as FeatureCollection
).features as Feature[]
// Every border and coast once, so the outlines are one stroke instead of one per country.
const borders = mesh(
  world as unknown as Topology,
  (world as unknown as Topology).objects.countries as GeometryCollection,
) as MultiLineString
// All land as one shape and its coastline: far fewer points to project than every country, for the fill and
// the far side.
const landTopology = landAtlas as unknown as Topology
const land = feature(landTopology, landTopology.objects.land as GeometryCollection) as FeatureCollection
const coast = mesh(landTopology, landTopology.objects.land as GeometryCollection) as MultiLineString
// A regular grid: a meridian every 15 degrees, all ending on the parallel at 75 degrees, and a parallel every 15
// degrees up to it, each sampled every degree so the lines stay smooth curves without adaptive resampling.
const STEP = 15,
  EDGE = 75,
  span = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i)
const graticule: MultiLineString = {
  type: 'MultiLineString',
  coordinates: [
    ...span(0, 360 / STEP - 1).map((i) => span(-EDGE, EDGE).map((lat) => [i * STEP - 180, lat])),
    ...span(-EDGE / STEP, EDGE / STEP).map((i) => span(-180, 180).map((lon) => [lon, i * STEP])),
  ],
}
const TILT = -18,
  SPIN = 4, // degrees a second
  // How close the globe comes to a shown place, and how far it backs off mid-flight between two far places.
  ZOOM = 1.7,
  DIP = 0.35

const box = ref<HTMLElement | null>(null),
  canvas = ref<HTMLCanvasElement | null>(null),
  layer = ref<HTMLElement | null>(null)
const size = ref({ width: 0, height: 0 })
let rotation: [number, number] = [-110, TILT]
let flight: {
  from: [number, number]
  to: [number, number]
  start: number
  zoom: number
  dip: number
} | null = null
let zoom = 1
const zoomGoal = () => (props.target ? ZOOM : 1)
let frame = 0,
  pending = 0,
  looping = false,
  last = 0,
  observer: ResizeObserver | undefined

const still = () =>
  document.documentElement.dataset.motion === 'false' ||
  matchMedia('(prefers-reduced-motion: reduce)').matches
// Countries holding nodes are lit; worked out once per change of markers, not per frame.
const lit = computed(() => {
  const points = props.markers.map((m) => m.at as [number, number])
  const on = countries.filter((c) => points.some((p) => geoContains(c, p)))
  return on
})

function draw() {
  const el = canvas.value,
    ctx = el?.getContext('2d')
  const { width, height } = size.value
  if (!el || !ctx || !width || !height) return
  const ratio = Math.min(2, devicePixelRatio || 1)
  if (el.width !== Math.round(width * ratio)) el.width = Math.round(width * ratio)
  if (el.height !== Math.round(height * ratio)) el.height = Math.round(height * ratio)
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
  ctx.clearRect(0, 0, width, height)
  // As tall as the stage, so it fills the screen and runs off its left edge, behind the status column.
  const radius = height * 0.52 * zoom,
    cx = width / 2,
    cy = height / 2
  const at = (rotate: [number, number, number]) =>
    geoOrthographic().scale(radius).translate([cx, cy]).rotate(rotate).clipAngle(90).precision(0)
  // The far side, seen through the glass: the antipode's view, mirrored.
  const back = at([rotation[0] + 180, -rotation[1], 0]).reflectX(true)
  const behind = geoPath(back, ctx)
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)'
  ctx.lineWidth = 0.5
  ctx.beginPath()
  behind(coast)
  ctx.stroke()
  const projection = at([rotation[0], rotation[1], 0])
  const path = geoPath(projection, ctx)
  // A faint glass sphere rather than a solid sea: lighter towards the upper left, nearly clear at the rim.
  const sea = ctx.createRadialGradient(cx - radius * 0.35, cy - radius * 0.4, radius * 0.05, cx, cy, radius)
  sea.addColorStop(0, 'rgba(255, 255, 255, 0.06)')
  sea.addColorStop(1, 'rgba(255, 255, 255, 0.012)')
  ctx.fillStyle = sea
  ctx.beginPath()
  path({ type: 'Sphere' })
  ctx.fill()
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)'
  ctx.lineWidth = 0.6
  ctx.beginPath()
  path(graticule)
  ctx.stroke()
  // Land in one fill, every border in one stroke, then the countries holding nodes over them.
  ctx.fillStyle = 'rgba(255, 255, 255, 0.075)'
  ctx.beginPath()
  path(land)
  ctx.fill()
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)'
  ctx.lineWidth = 0.5
  ctx.beginPath()
  path(borders)
  ctx.stroke()
  ctx.fillStyle = 'rgba(255, 255, 255, 0.2)'
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)'
  ctx.lineWidth = 1.2
  ctx.beginPath()
  for (const c of lit.value) path(c)
  ctx.fill()
  ctx.stroke()
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)'
  ctx.lineWidth = 1
  ctx.beginPath()
  path({ type: 'Sphere' })
  ctx.stroke()
  place(projection)
}

// Markers and the reticle are HTML over the canvas: written straight to their style each frame, hidden on the
// far side. Their places are read from the markup once.
const places = new WeakMap<HTMLElement, [number, number]>()
function place(projection: ReturnType<typeof geoOrthographic>) {
  const centre: [number, number] = [-rotation[0], -rotation[1]]
  for (const el of layer.value?.querySelectorAll<HTMLElement>('[data-at]') ?? []) {
    let at = places.get(el)
    if (!at) places.set(el, (at = JSON.parse(el.dataset.at!) as [number, number]))
    const point = projection(at),
      away = geoDistance(at, centre)
    const shown = point && away < Math.PI / 2 - 0.08
    el.style.opacity = shown ? String(Math.min(1, (Math.PI / 2 - away) * 3)) : '0'
    el.style.visibility = shown ? '' : 'hidden'
    if (point) el.style.transform = `translate(${point[0]}px, ${point[1]}px)`
  }
}

const ease = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2)
function tick(time: number) {
  frame = requestAnimationFrame(tick)
  if (time - last < (drag ? 1000 / 60 : 1000 / 30) - 1) return
  const dt = last ? Math.min(0.1, (time - last) / 1000) : 0
  last = time
  if (flight) {
    const k = Math.min(1, (time - flight.start) / 1600)
    const [lon, lat] = geoInterpolate(
      [-flight.from[0], -flight.from[1]],
      [-flight.to[0], -flight.to[1]],
    )(ease(k))
    rotation = [-lon, -lat]
    // Pull back on the way and close in again on arrival, like a camera moving between places.
    zoom = flight.zoom + (zoomGoal() - flight.zoom) * ease(k) - flight.dip * Math.sin(Math.PI * k)
    if (k === 1) flight = null
  } else if (drag) {
    // The hand is in charge.
  } else if (Math.abs(fling[0]) + Math.abs(fling[1]) > 0.5) {
    // A released drag keeps turning and slows down.
    rotation = turned(rotation, fling[0] * dt, fling[1] * dt)
    const decay = Math.exp(-3 * dt)
    fling = [fling[0] * decay, fling[1] * decay]
  } else if (!props.target && !props.stale && time > quietUntil)
    rotation = [rotation[0] + SPIN * dt, rotation[1] + (TILT - rotation[1]) * dt]
  // Closing a card lets the globe settle back to its full view.
  if (!flight) zoom += (zoomGoal() - zoom) * (1 - Math.exp(-4 * dt))
  draw()
}

// Dragging turns the globe under the pointer; letting go throws it on. A drag stops the tour (`grab`), and the
// idle spin waits a few seconds before it starts again.
let drag: { id: number; x: number; y: number; t: number } | null = null,
  // Where and when the press began, to tell a click from a drag.
  press = { x: 0, y: 0, t: 0 },
  fling: [number, number] = [0, 0],
  quietUntil = 0
const turned = (r: [number, number], dLon: number, dLat: number): [number, number] => [
  r[0] + dLon,
  Math.max(-85, Math.min(85, r[1] + dLat)),
]
// Degrees per pixel at the globe's centre.
const perPixel = () => 180 / (Math.PI * Math.max(1, size.value.height * 0.52 * zoom))
function grab(e: PointerEvent) {
  if (e.button !== 0) return
  // No text selection or image drag starts under a globe drag.
  e.preventDefault()
  drag = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now() }
  press = { x: e.clientX, y: e.clientY, t: drag.t }
  flight = null
  fling = [0, 0]
  canvas.value?.setPointerCapture?.(e.pointerId)
  emit('grab')
}
function move(e: PointerEvent) {
  if (!drag || e.pointerId !== drag.id) return
  const k = perPixel(),
    now = performance.now(),
    dLon = (e.clientX - drag.x) * k,
    dLat = -(e.clientY - drag.y) * k,
    dt = Math.max(0.008, (now - drag.t) / 1000)
  rotation = turned(rotation, dLon, dLat)
  fling = [dLon / dt, dLat / dt]
  drag = { id: drag.id, x: e.clientX, y: e.clientY, t: now }
  // Pointer events come faster than frames: the running loop picks the turn up; when it is off, one frame does.
  if (!looping && !pending)
    pending = requestAnimationFrame(() => {
      pending = 0
      draw()
    })
}
function release(e: PointerEvent) {
  if (!drag || e.pointerId !== drag.id) return
  // A pause before letting go means no throw; with motion off there is never one.
  if (performance.now() - drag.t > 80 || still()) fling = [0, 0]
  drag = null
  quietUntil = performance.now() + 4000
  // A press that barely moved is a click on the globe itself: it closes the card and lets the globe back off.
  if (Math.hypot(e.clientX - press.x, e.clientY - press.y) < 6 && performance.now() - press.t < 500)
    emit('blank')
}
function start() {
  cancelAnimationFrame(frame)
  last = 0
  looping = !still() && !document.hidden
  if (!looping) {
    draw()
    return
  }
  frame = requestAnimationFrame(tick)
}
const onVisible = () => {
  if (!document.hidden) return start()
  cancelAnimationFrame(frame)
  looping = false
}

// A target turns the globe so the place sits a little above the middle; with motion off it jumps there.
watch(
  () => props.target && `${props.target.at[0]},${props.target.at[1]}`,
  () => {
    const t = props.target
    if (!t) {
      if (still()) {
        zoom = 1
        void nextTick(draw)
      }
      return
    }
    const to: [number, number] = [-t.at[0], Math.max(-60, Math.min(60, -t.at[1] + 8))]
    if (still()) {
      rotation = to
      zoom = ZOOM
      void nextTick(draw)
    } else {
      const far = geoDistance([-rotation[0], -rotation[1]], [-to[0], -to[1]]) / (Math.PI / 2)
      flight = { from: rotation, to, start: performance.now(), zoom, dip: DIP * Math.min(1, far) }
    }
  },
  { immediate: true },
)
watch(
  () => [props.markers, props.target?.key],
  () => void nextTick(draw),
)

onMounted(() => {
  observer = new ResizeObserver(([entry]) => {
    if (!entry) return
    size.value = { width: entry.contentRect.width, height: entry.contentRect.height }
    draw()
  })
  if (box.value) observer.observe(box.value)
  document.addEventListener('visibilitychange', onVisible)
  // The first view faces the nodes rather than an empty ocean.
  const first = props.markers[0]
  if (first && !props.target) rotation = [-first.at[0], TILT]
  start()
})
onBeforeUnmount(() => {
  cancelAnimationFrame(frame)
  cancelAnimationFrame(pending)
  observer?.disconnect()
  document.removeEventListener('visibilitychange', onVisible)
})

const ring = (m: CountryMarker) => {
  const ok = (m.ok / m.total) * 100,
    warn = ok + (m.warn / m.total) * 100
  return `conic-gradient(var(--success) 0 ${ok}%, var(--warning) ${ok}% ${warn}%, var(--danger) ${warn}% 100%)`
}
const label = (m: CountryMarker) =>
  `${countryName(m.code)} · ${m.total} 台${m.off ? ` · ${m.off} 台离线` : ''}${m.warn ? ` · ${m.warn} 台有异常` : ''}`
</script>
<template>
  <div ref="box" class="ops-globe">
    <canvas
      ref="canvas"
      class="og-canvas"
      role="img"
      :aria-label="`节点分布地球，${markers.length} 个国家与地区，可拖动旋转`"
      @pointerdown="grab"
      @pointermove="move"
      @pointerup="release"
      @pointercancel="release"
    />
    <div ref="layer" class="og-layer">
      <button
        v-for="m in markers"
        :key="m.code"
        type="button"
        class="og-marker"
        :data-at="JSON.stringify(m.at)"
        :data-state="m.off ? 'off' : m.warn ? 'warn' : 'ok'"
        :data-focus="target?.code === m.code || undefined"
        :aria-label="label(m)"
        :title="label(m)"
        @click="emit('pick', m.code)"
      >
        <span class="og-dot" :style="{ background: ring(m) }"
          ><b>{{ m.total }}</b></span
        ><img v-if="flagUrl(m.code)" class="og-flag" :src="flagUrl(m.code)" alt="" />
      </button>
      <div v-if="target" :key="target.key" class="og-hud" :data-at="JSON.stringify(target.at)">
        <svg class="og-reticle" viewBox="0 0 132 132" fill="none" aria-hidden="true">
          <g class="og-reticle-spin">
            <circle class="og-reticle-dash" cx="66" cy="66" r="60" />
            <path class="og-reticle-tick" d="M66 2v10M66 120v10M2 66h10M120 66h10" />
          </g>
          <circle class="og-reticle-inner" cx="66" cy="66" r="38" />
          <path class="og-reticle-corner" d="M28 44V28h16M88 28h16v16M104 88v16H88M44 104H28V88" />
        </svg>
        <i class="og-lead" aria-hidden="true" />
        <div class="og-card"><slot /></div>
      </div>
    </div>
  </div>
</template>
