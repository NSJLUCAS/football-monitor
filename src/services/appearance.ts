import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { GlobalConfig } from '../domain/types'
import { useMonitorStore } from '../stores/monitor'

/**
 * A visitor's own light or dark pick, kept in this browser together with the site default it overrode.
 * When the site owner changes the default, the old pick no longer applies; picking what the site already
 * shows clears it, so a browser is never pinned to one appearance for good.
 */
const KEY = 'football-monitor:appearance'
type Mode = 'light' | 'dark'
type Site = GlobalConfig['appearance']
const isMode = (value: unknown): value is Mode => value === 'light' || value === 'dark'

const read = () => {
  try {
    return localStorage.getItem(KEY)
  } catch {
    /* Optional visitor preference. */
    return null
  }
}
export function visitorAppearance(site: Site): Mode | null {
  const raw = read()
  // Picks stored before the site default was recorded beside them are honoured until they can be tied to one.
  if (isMode(raw)) return raw
  try {
    const saved = JSON.parse(raw ?? 'null') as { appearance?: unknown; site?: unknown } | null
    return saved && isMode(saved.appearance) && saved.site === site ? saved.appearance : null
  } catch {
    return null
  }
}
/** `shown` is what the site default looks like right now, which for `system` depends on the device. */
export function saveVisitorAppearance(mode: Mode, site: Site, shown: Mode) {
  try {
    if (mode === shown) localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, JSON.stringify({ appearance: mode, site }))
  } catch {
    /* Preference lasts this visit. */
  }
  picks.value++
}
export function clearVisitorAppearance() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* Nothing stored. */
  }
  picks.value++
}
// Storage is not reactive; every change bumps this so the page follows.
const picks = ref(0)
/** Whether the page is dark, and the header's toggle; the config may arrive after mount. */
export function useAppearance() {
  const store = useMonitorStore()
  const media = matchMedia('(prefers-color-scheme: dark)'),
    systemDark = ref(media.matches)
  const systemChange = () => {
    systemDark.value = media.matches
  }
  onMounted(() => media.addEventListener('change', systemChange))
  onBeforeUnmount(() => media.removeEventListener('change', systemChange))
  const site = computed(() => store.config.appearance)
  const shown = computed<Mode>(() =>
    site.value === 'system'
      ? systemDark.value
        ? 'dark'
        : 'light'
      : site.value === 'light'
        ? 'light'
        : 'dark',
  )
  const mode = computed<Mode>(() => {
    void picks.value
    return visitorAppearance(site.value) ?? shown.value
  })
  // Once the site's settings are in, an older bare pick is tied to the default it now overrides.
  watch(
    () => store.me,
    (me) => {
      const raw = read()
      if (me && isMode(raw)) saveVisitorAppearance(raw, site.value, shown.value)
    },
  )
  const toggle = () =>
    saveVisitorAppearance(mode.value === 'dark' ? 'light' : 'dark', site.value, shown.value)
  return { dark: computed(() => mode.value === 'dark'), toggle }
}
