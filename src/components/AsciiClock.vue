<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { clockCells, clockText, CLOCK_ROWS, type ClockCell } from '../domain/clock'
// A clock drawn the way ascii-pond draws its water: a grid of monospace character cells on a canvas.
// Digits are dot-matrix tiles, the rest is faint water; a changed digit or the pointer sends out a ripple.
const props = defineProps<{ motion: boolean }>()
const root = ref<HTMLElement>(),
  canvas = ref<HTMLCanvasElement>(),
  label = ref(`当前时间 ${clockText(new Date()).slice(0, 5)}`)
interface Ripple {
  x: number
  y: number
  at: number
  strength: number
}
const RIPPLE_SPEED = 9, // cells per second
  RIPPLE_LIFE = 1.6,
  WATER = '.:~'
const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
const animate = () => props.motion && !reduced
let ctx: CanvasRenderingContext2D | null = null,
  width = 0,
  height = 0,
  cw = 10,
  ch = 14,
  cols = 0,
  rows = 0,
  originX = 0,
  originY = 0,
  leftX = 0,
  topY = 0,
  text = '',
  cells: ClockCell[] = [],
  lit = new Map<number, ClockCell>(),
  changedAt: number[] = [],
  ripples: Ripple[] = [],
  colors = { digit: '#ff7a1a', water: '#565d6d' },
  frame = 0,
  timer = 0,
  lastFrame = 0,
  lastStir = 0,
  observer: ResizeObserver | null = null,
  themeObserver: MutationObserver | null = null
// Fixed per cell, so the water keeps its pattern between frames.
const noise = (c: number, r: number) => {
  const s = Math.sin(c * 127.1 + r * 311.7) * 43758.5453
  return s - Math.floor(s)
}
function readColors() {
  const style = getComputedStyle(root.value!)
  colors = {
    digit: style.getPropertyValue('--primary').trim() || colors.digit,
    water: style.getPropertyValue('--muted').trim() || colors.water,
  }
}
function layout() {
  const el = canvas.value!,
    dpr = Math.min(2, window.devicePixelRatio || 1)
  width = el.clientWidth
  height = el.clientHeight
  if (!width) return
  el.width = Math.round(width * dpr)
  el.height = Math.round(height * dpr)
  ctx = el.getContext('2d')
  ctx?.setTransform(dpr, 0, 0, dpr, 0, 0)
  const textCols = clockCells('00:00:00').cols
  cw = Math.max(5, Math.min(9, Math.floor(width / (textCols + 2))))
  ch = Math.round(cw * 1.35)
  cols = Math.ceil(width / cw)
  rows = Math.ceil(height / ch)
  originX = cols - textCols
  // The grid is anchored to the bottom right, so the digits end flush with the text above and stand on the line.
  leftX = width - cols * cw
  topY = height - rows * ch
  originY = rows - CLOCK_ROWS
  setText(clockText(new Date()), false)
}
function setText(next: string, ripple: boolean) {
  const now = performance.now() / 1000
  const changed = [...next].map((c, i) => c !== text[i])
  text = next
  label.value = `当前时间 ${next.slice(0, 5)}`
  const layoutCells = clockCells(next)
  cells = layoutCells.cells
  lit = new Map(cells.map((c) => [(originY + c.row) * cols + originX + c.col, c]))
  changedAt = changed.map((c, i) => (c ? now : (changedAt[i] ?? 0)))
  if (!ripple || !animate()) return
  // Each changed digit sends a ripple out from its middle.
  changed.forEach((c, i) => {
    if (!c || next[i] === ':') return
    const own = cells.filter((cell) => cell.index === i)
    if (!own.length) return
    const x = own.reduce((a, cell) => a + cell.col, 0) / own.length + originX
    ripples.push({ x, y: originY + CLOCK_ROWS / 2, at: now, strength: 0.9 })
  })
}
function draw(now: number) {
  if (!ctx) return
  ripples = ripples.filter((r) => now - r.at < RIPPLE_LIFE)
  ctx.clearRect(0, 0, width, height)
  ctx.font = `600 ${Math.round(ch * 0.72)}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const moving = animate(),
    half = now % 1 < 0.5
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const x = leftX + c * cw,
        y = topY + r * ch
      // The strongest ripple ring passing this cell, 0 when none is near.
      let wave = 0
      for (const p of ripples) {
        const age = now - p.at,
          d = Math.hypot((c - p.x) * 0.8, r - p.y),
          band = 1 - Math.abs(d - age * RIPPLE_SPEED) / 1.3
        if (band > 0) wave = Math.max(wave, band * p.strength * (1 - age / RIPPLE_LIFE))
      }
      const cell = lit.get(r * cols + c)
      if (cell) {
        // A digit that just changed settles in over a quarter second; the colons breathe each half second.
        const settle = moving ? Math.min(1, (now - (changedAt[cell.index] ?? 0)) / 0.25) : 1,
          colon = cell.glyph === ':' && moving && !half ? 0.35 : 1,
          alpha = (0.35 + 0.65 * settle) * colon
        ctx.fillStyle = colors.digit
        ctx.globalAlpha = (0.24 + 0.22 * wave) * alpha
        ctx.fillRect(x + 0.5, y + 0.5, cw - 1, ch - 1)
        ctx.globalAlpha = alpha
        ctx.fillText(cell.glyph, x + cw / 2, y + ch / 2 + 1)
        continue
      }
      const n = noise(c, r)
      if (wave > 0.05) {
        ctx.fillStyle = colors.water
        ctx.globalAlpha = Math.min(0.55, wave * 0.6)
        ctx.fillText('~', x + cw / 2, y + ch / 2 + 1)
      } else if (n < 0.14) {
        ctx.fillStyle = colors.water
        ctx.globalAlpha = 0.12 + (moving ? 0.08 * Math.sin(now * 0.8 + n * 60) : 0)
        ctx.fillText(WATER[Math.floor(n * 100) % WATER.length]!, x + cw / 2, y + ch / 2 + 1)
      }
    }
  ctx.globalAlpha = 1
}
function tick() {
  if (document.hidden || !width) return
  const next = clockText(new Date())
  if (next !== text) setText(next, true)
  if (!animate()) draw(performance.now() / 1000)
  clearTimeout(timer)
  // Wake on the next half second: the time changes on whole seconds, the colons on halves.
  timer = window.setTimeout(tick, 500 - (Date.now() % 500) + 5)
}
function loop(ms: number) {
  frame = requestAnimationFrame(loop)
  // About 30 frames a second is plenty for drifting characters.
  if (ms - lastFrame < 32) return
  lastFrame = ms
  draw(ms / 1000)
}
function start() {
  cancelAnimationFrame(frame)
  clearTimeout(timer)
  // Hidden pages and narrow screens (where the clock is not displayed) draw nothing.
  if (document.hidden || !width) return
  readColors()
  tick()
  if (animate()) frame = requestAnimationFrame(loop)
}
function stir(e: PointerEvent) {
  if (!animate() || !canvas.value) return
  const now = performance.now() / 1000
  if (now - lastStir < 0.12) return
  lastStir = now
  const box = canvas.value.getBoundingClientRect()
  ripples.push({
    x: (e.clientX - box.left - leftX) / cw,
    y: (e.clientY - box.top - topY) / ch,
    at: now,
    strength: 0.6,
  })
}
const onVisibility = () => (document.hidden ? cancelAnimationFrame(frame) : start())
watch(() => props.motion, start)
onMounted(() => {
  layout()
  if (typeof ResizeObserver !== 'function') return
  observer = new ResizeObserver(() => {
    const was = width
    layout()
    if (!was !== !width) start()
    else draw(performance.now() / 1000)
  })
  observer.observe(canvas.value!)
  // Light and dark themes switch on <html>; pick up the new colours at once.
  themeObserver = new MutationObserver(() => {
    readColors()
    draw(performance.now() / 1000)
  })
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
  document.addEventListener('visibilitychange', onVisibility)
  start()
})
onBeforeUnmount(() => {
  cancelAnimationFrame(frame)
  clearTimeout(timer)
  observer?.disconnect()
  themeObserver?.disconnect()
  document.removeEventListener('visibilitychange', onVisibility)
})
</script>
<template>
  <div ref="root" class="ascii-clock" role="img" :aria-label="label">
    <canvas ref="canvas" aria-hidden="true" @pointermove="stir" />
  </div>
</template>
