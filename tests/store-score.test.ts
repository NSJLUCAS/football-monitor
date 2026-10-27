import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import { normalizeNodes } from '../src/domain/normalize'
import type { HistoryResponse } from '../src/domain/types'
import { useMonitorStore } from '../src/stores/monitor'

function node(id: number, online = true) {
  return normalizeNodes({ nodes: [{ id, online, metrics: null }] })[0]!
}
// One probe, one reading, no loss and no band: overall = (35 × latency part + 4000) / 75,
// so 30 ms -> 99, 140 ms -> 81, 178 ms -> 74, 190 ms -> 72.
const quality = (latency: number): HistoryResponse => ({
  metrics: [],
  ping: [{ task_id: 7, ts: 1000, latency }],
  probes: { '7': '上海 TCP 目标' },
  loss: {},
  step: 720,
})

describe('monitor store network scores and tiers', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('derives scores from the 24-hour probe history', () => {
    const store = useMonitorStore()
    vi.spyOn(store.history, 'get').mockReturnValue(new Promise(() => {}))
    store.nodes = [node(1)]
    expect(store.scores[1]?.overall).toBeNull()
    store.quality = { '1': quality(30) }
    expect(store.scores[1]?.overall).toBe(99)
    expect(store.scores[1]?.values.latency).toBe(30)
    store.nodes = [node(1), node(2)]
    expect(Object.keys(store.scores)).toEqual(['1', '2'])
  })

  it('keeps the tier through small drops and only demotes past the hysteresis gap', async () => {
    const store = useMonitorStore()
    vi.spyOn(store.history, 'get').mockReturnValue(new Promise(() => {}))
    store.nodes = [node(1)]
    store.quality = { '1': quality(140) }
    await nextTick()
    expect(store.scores[1]?.overall).toBe(81)
    expect(store.tiers[1]).toBe('gold')
    store.quality = { '1': quality(178) }
    await nextTick()
    expect(store.scores[1]?.overall).toBe(74)
    expect(store.tiers[1]).toBe('gold')
    store.quality = { '1': quality(190) }
    await nextTick()
    expect(store.scores[1]?.overall).toBe(72)
    expect(store.tiers[1]).toBe('silver')
  })

  it('freezes the tier when a node goes offline and drops vanished nodes', async () => {
    const store = useMonitorStore()
    vi.spyOn(store.history, 'get').mockReturnValue(new Promise(() => {}))
    store.nodes = [node(1), node(2)]
    store.quality = { '1': quality(30), '2': quality(30) }
    await nextTick()
    store.nodes = [node(1, false), node(2)]
    await nextTick()
    expect(store.scores[1]?.overall).toBeNull()
    expect(store.tiers[1]).toBe('gold')
    store.nodes = [node(2)]
    await nextTick()
    expect(Object.keys(store.tiers)).toEqual(['2'])
  })

  it('clears tiers and probe history with the sensitive state', async () => {
    const store = useMonitorStore()
    vi.spyOn(store.history, 'get').mockReturnValue(new Promise(() => {}))
    store.nodes = [node(1)]
    store.quality = { '1': quality(30) }
    await nextTick()
    expect(store.tiers).toEqual({ 1: 'gold' })
    store.clearSensitiveState()
    await nextTick()
    expect(store.tiers).toEqual({})
    expect(store.scores).toEqual({})
    expect(store.quality).toEqual({})
  })
})

describe('monitor store 24-hour probe history', () => {
  beforeEach(() => setActivePinia(createPinia()))
  afterEach(() => vi.restoreAllMocks())

  it('prefetches it once for every online node, whatever was scrolled into view', async () => {
    const store = useMonitorStore()
    const get = vi.spyOn(store.history, 'get').mockResolvedValue(quality(30))
    store.nodes = [node(1), node(2), node(3, false)]
    await flushPromises()
    expect(get.mock.calls.map((c) => c[0]).sort()).toEqual([1, 2])
    // The start-up prefetch runs in the background queue.
    expect(get).toHaveBeenCalledWith(1, 24, 'ping', false, true)
    store.nodes = [node(1), node(2), node(3, false)]
    await flushPromises()
    expect(get).toHaveBeenCalledTimes(2)
    store.nodes = [node(1), node(2), node(3)]
    await flushPromises()
    expect(get.mock.calls.map((c) => c[0]).sort()).toEqual([1, 2, 3])
  })

  it('moves a queued prefetch ahead when its card asks for it', async () => {
    const store = useMonitorStore()
    vi.spyOn(store.history, 'get').mockReturnValue(new Promise(() => {}))
    const prioritize = vi.spyOn(store.history, 'prioritize')
    store.nodes = [node(1)]
    await flushPromises()
    expect(prioritize).not.toHaveBeenCalled()
    void store.loadQuality(1)
    expect(prioritize).toHaveBeenCalledWith(1, 24, 'ping')
  })

  it('refreshes at most every ten minutes unless forced', async () => {
    const store = useMonitorStore()
    const get = vi.spyOn(store.history, 'get').mockResolvedValue(quality(30))
    let now = 1_000_000
    vi.spyOn(Date, 'now').mockImplementation(() => now)
    await store.loadQuality(1)
    await store.loadQuality(1)
    expect(get).toHaveBeenCalledTimes(1)
    now += 9 * 60_000
    await store.loadQuality(1)
    expect(get).toHaveBeenCalledTimes(1)
    now += 60_000
    await store.loadQuality(1)
    expect(get).toHaveBeenCalledTimes(2)
    await store.loadQuality(1, true)
    expect(get).toHaveBeenCalledTimes(3)
    expect(get).toHaveBeenLastCalledWith(1, 24, 'ping', true, false)
  })

  it('waits for the history before assigning the first tier', async () => {
    const store = useMonitorStore()
    let resolve!: (value: HistoryResponse) => void
    vi.spyOn(store.history, 'get').mockReturnValue(new Promise((r) => (resolve = r)))
    store.nodes = [node(1)]
    await flushPromises()
    expect(store.scores[1]?.overall).toBeNull()
    expect(store.tiers[1]).toBeUndefined()
    resolve(quality(30))
    await flushPromises()
    expect(store.scores[1]?.overall).toBe(99)
    expect(store.tiers[1]).toBe('gold')
  })

  it('falls back to silver once the request fails', async () => {
    const store = useMonitorStore()
    vi.spyOn(store.history, 'get').mockRejectedValue(new Error('down'))
    store.nodes = [node(1)]
    await flushPromises()
    expect(store.qualityErrors[1]).toBe('down')
    expect(store.scores[1]?.overall).toBeNull()
    expect(store.tiers[1]).toBe('silver')
  })
})
