import { onBeforeUnmount, ref, watch, type Ref } from 'vue'

export interface ShortRow {
  count: number
  /** Widest a card may get, in px. */
  cap: number
}

/** A grid whose cards do not fill its first row: they widen by up to a quarter, and what is left is centred.
    Null when the row is full, or when there is nothing to measure. */
export function shortRow(width: number, min: number, gap: number, count: number): ShortRow | null {
  if (!(width > 0) || !(min > 0) || !(gap >= 0) || count < 1) return null
  const columns = Math.floor((width + gap) / (min + gap))
  if (columns < 2 || count >= columns) return null
  const usual = (width - gap * (columns - 1)) / columns
  return { count, cap: Math.min(usual * 1.25, (width - gap * (count - 1)) / count) }
}

/** Measures the card grid and says how a short first row is laid out; `deps` are what changes its columns. */
export function useShortRow(grid: Ref<HTMLElement | null>, count: () => number, deps: () => unknown) {
  const fit = ref<ShortRow | null>(null)
  function measure() {
    const el = grid.value
    if (!el) return (fit.value = null)
    const style = getComputedStyle(el),
      min = style.getPropertyValue('--card-min').trim()
    // On phones the split view asks for the whole row ("100%"): one column, nothing to centre.
    fit.value = min.endsWith('px')
      ? shortRow(el.clientWidth, parseFloat(min), parseFloat(style.columnGap) || 0, count())
      : null
  }
  const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
  watch(
    grid,
    (el, old) => {
      if (old) observer?.unobserve(old)
      if (el) observer?.observe(el)
      measure()
    },
    { flush: 'post' },
  )
  watch([count, deps], measure, { flush: 'post' })
  onBeforeUnmount(() => observer?.disconnect())
  return fit
}
