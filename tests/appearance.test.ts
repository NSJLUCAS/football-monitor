import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import {
  clearVisitorAppearance,
  saveVisitorAppearance,
  useAppearance,
  visitorAppearance,
} from '../src/services/appearance'
import { useMonitorStore } from '../src/stores/monitor'

const KEY = 'football-monitor:appearance'
const system = (dark: boolean) =>
  vi.stubGlobal('matchMedia', () => ({ matches: dark, addEventListener() {}, removeEventListener() {} }))
// The composable listens to the system setting, so it runs inside a component.
function mountAppearance() {
  let api!: ReturnType<typeof useAppearance>
  mount(
    defineComponent({
      setup() {
        api = useAppearance()
        return () => h('div')
      },
    }),
  )
  return api
}

beforeEach(() => {
  setActivePinia(createPinia())
  system(true)
})
enableAutoUnmount(afterEach)
afterEach(() => {
  localStorage.removeItem(KEY)
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('visitor appearance', () => {
  it('applies a pick only while the site default it overrode stays the same', () => {
    expect(visitorAppearance('dark')).toBeNull()
    saveVisitorAppearance('light', 'dark', 'dark')
    expect(visitorAppearance('dark')).toBe('light')
    expect(visitorAppearance('system')).toBeNull()
    clearVisitorAppearance()
    expect(visitorAppearance('dark')).toBeNull()
  })
  it('stores nothing for what the site already shows, also when the site follows the system', () => {
    saveVisitorAppearance('light', 'dark', 'dark')
    saveVisitorAppearance('dark', 'dark', 'dark')
    expect(localStorage.getItem(KEY)).toBeNull()
    saveVisitorAppearance('light', 'system', 'dark')
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual({ appearance: 'light', site: 'system' })
    saveVisitorAppearance('dark', 'system', 'dark')
    expect(localStorage.getItem(KEY)).toBeNull()
  })
  it('still honours a pick stored before the site default was recorded beside it', () => {
    localStorage.setItem(KEY, 'light')
    expect(visitorAppearance('dark')).toBe('light')
    expect(visitorAppearance('system')).toBe('light')
    for (const value of ['sepia', '{', JSON.stringify({ appearance: 'sepia', site: 'dark' })]) {
      localStorage.setItem(KEY, value)
      expect(visitorAppearance('dark')).toBeNull()
    }
  })
  it('keeps working when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(visitorAppearance('dark')).toBeNull()
    expect(() => saveVisitorAppearance('light', 'dark', 'dark')).not.toThrow()
  })
  it('toggles, and lets go of the pick once the owner changes the site default', async () => {
    const store = useMonitorStore(),
      { dark, toggle } = mountAppearance()
    expect(dark.value).toBe(true)
    toggle()
    expect(dark.value).toBe(false)
    // The owner switches the site to light, then back to dark: the visitor follows both times.
    store.config = { ...store.config, appearance: 'light' }
    expect(dark.value).toBe(false)
    store.config = { ...store.config, appearance: 'system' }
    expect(dark.value).toBe(true)
    // Back on the default the pick was made against, it applies again; picking the default clears it.
    store.config = { ...store.config, appearance: 'dark' }
    expect(dark.value).toBe(false)
    toggle()
    expect(dark.value).toBe(true)
    expect(localStorage.getItem(KEY)).toBeNull()
  })
  it('ties an older pick to the site default once the site is known, dropping one that matches it', async () => {
    localStorage.setItem(KEY, 'light')
    const store = useMonitorStore(),
      { dark } = mountAppearance()
    expect(dark.value).toBe(false)
    store.config = { ...store.config, appearance: 'dark' }
    store.me = { authed: false, site_name: 'Monitor', public_page: true, github: false, history_days: 7 }
    await flushPromises()
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual({ appearance: 'light', site: 'dark' })
    localStorage.setItem(KEY, 'dark')
    setActivePinia(createPinia())
    const next = useMonitorStore()
    mountAppearance()
    next.me = { authed: false, site_name: 'Monitor', public_page: true, github: false, history_days: 7 }
    await flushPromises()
    expect(localStorage.getItem(KEY)).toBeNull()
  })
})
