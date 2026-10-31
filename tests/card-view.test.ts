import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { clearVisitorView, saveVisitorView, useCardView, visitorView } from '../src/services/cardView'
import { useMonitorStore } from '../src/stores/monitor'

const KEY = 'football-monitor:card-view'
beforeEach(() => setActivePinia(createPinia()))
afterEach(() => {
  localStorage.removeItem(KEY)
  vi.restoreAllMocks()
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
})
