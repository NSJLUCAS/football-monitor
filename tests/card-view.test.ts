import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import {
  clearVisitorView,
  saveVisitorView,
  siteView,
  useCardView,
  visitorView,
} from '../src/services/cardView'
import { useMonitorStore } from '../src/stores/monitor'

const KEY = 'football-monitor:card-view'
beforeEach(() => setActivePinia(createPinia()))
afterEach(() => {
  localStorage.removeItem(KEY)
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('visitor card view', () => {
  it('applies a pick only while the site default it overrode stays the same', () => {
    expect(visitorView('stacked')).toBeNull()
    saveVisitorView('split', 'stacked')
    expect(visitorView('stacked')).toBe('split')
    expect(visitorView('split')).toBeNull()
    clearVisitorView()
    expect(visitorView('stacked')).toBeNull()
  })
  it('stores nothing for the default and ignores unreadable or unknown values', () => {
    saveVisitorView('split', 'stacked')
    saveVisitorView('stacked', 'stacked')
    expect(localStorage.getItem(KEY)).toBeNull()
    for (const value of ['split', '{', JSON.stringify({ view: 'grid', site: 'stacked' })]) {
      localStorage.setItem(KEY, value)
      expect(visitorView('stacked')).toBeNull()
    }
  })
  it('keeps working when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(visitorView('stacked')).toBeNull()
    expect(() => saveVisitorView('split', 'stacked')).not.toThrow()
  })
  it('toggles between the two views and follows a new site default', () => {
    const store = useMonitorStore(),
      { view, toggle } = useCardView()
    expect(view.value).toBe('stacked')
    toggle()
    expect(view.value).toBe('split')
    store.config = { ...store.config, card_view: 'split' }
    expect(view.value).toBe('split')
    toggle()
    expect(view.value).toBe('stacked')
    clearVisitorView()
    expect(view.value).toBe('split')
  })
  it('opens the theme gallery demo, which has no settings, on the split view', () => {
    const config = useMonitorStore().config
    expect(siteView(config, 'football-monitor.monitor-themes.pages.dev')).toBe('split')
    expect(siteView(config, 'monitor-themes.pages.dev')).toBe('split')
    expect(siteView(config, 'status.example.com')).toBe('stacked')
    expect(siteView(config, 'monitor-themes.pages.dev.example.com')).toBe('stacked')
    expect(siteView({ ...config, card_view: 'split' }, 'status.example.com')).toBe('split')
  })
  it('lets a demo visitor switch back to the stacked view', () => {
    vi.stubGlobal('location', { hostname: 'football-monitor.monitor-themes.pages.dev' })
    // A pick made before the demo opened on the split view no longer applies.
    saveVisitorView('split', 'stacked')
    const { view, toggle } = useCardView()
    expect(view.value).toBe('split')
    toggle()
    expect(view.value).toBe('stacked')
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual({ view: 'stacked', site: 'split' })
  })
})
