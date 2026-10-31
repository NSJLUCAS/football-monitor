import { computed, ref } from 'vue'
import type { CardView } from '../domain/types'
import { useMonitorStore } from '../stores/monitor'

/**
 * A visitor's own home page card view, kept in this browser together with the site default it overrode.
 * When the site owner changes the default, the old pick no longer applies; picking the default clears it.
 */
const KEY = 'football-monitor:card-view'
const VIEWS: CardView[] = ['stacked', 'split']
const isView = (value: unknown): value is CardView => VIEWS.includes(value as CardView)

export function visitorView(site: CardView): CardView | null {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null') as { view?: unknown; site?: unknown } | null
    return saved && isView(saved.view) && saved.site === site ? saved.view : null
  } catch {
    /* Optional visitor preference; unreadable or old values count as none. */
    return null
  }
}
export function saveVisitorView(view: CardView, site: CardView) {
  try {
    if (view === site) localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, JSON.stringify({ view, site }))
  } catch {
    /* Preference lasts this visit. */
  }
  picks.value++
}
export function clearVisitorView() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* Nothing stored. */
  }
  picks.value++
}
// Storage is not reactive; every change bumps this so the header button and the home page agree.
const picks = ref(0)
/** The card view the home page shows, and a toggle between the two; the config may arrive after mount. */
export function useCardView() {
  const store = useMonitorStore()
  const view = computed(() => {
    void picks.value
    return visitorView(store.config.card_view) ?? store.config.card_view
  })
  const toggle = () => saveVisitorView(view.value === 'split' ? 'stacked' : 'split', store.config.card_view)
  return { view, toggle }
}
