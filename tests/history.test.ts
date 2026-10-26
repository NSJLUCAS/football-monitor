import { describe, expect, it, vi } from 'vitest'
import { HistoryRepository } from '../src/services/history'

const value = { metrics: [], ping: [], probes: {}, step: 60 }
describe('on demand bounded history', () => {
  it('deduplicates, caches with TTL and respects capacity', async () => {
    let now = 0
    const get = vi.fn().mockResolvedValue(value)
    const repo = new HistoryRepository(get, () => now, 2)
    await Promise.all([repo.get(1, 6, 'ping'), repo.get(1, 6, 'ping')])
    await repo.get(1, 6, 'ping')
    expect(get).toHaveBeenCalledTimes(1)
    now = 61000
    await repo.get(1, 6, 'ping')
    expect(get).toHaveBeenCalledTimes(2)
    await repo.get(2, 6)
    await repo.get(3, 6)
    expect(repo.size).toBe(2)
    repo.clear()
    expect(repo.size).toBe(0)
  })
  it('limits simultaneous history requests to three and releases failed jobs', async () => {
    let active = 0,
      maximum = 0
    const get = vi.fn(async () => {
      active++
      maximum = Math.max(maximum, active)
      await new Promise((r) => setTimeout(r, 4))
      active--
      return value
    })
    const repo = new HistoryRepository(get)
    await Promise.all(Array.from({ length: 9 }, (_, i) => repo.get(i + 1, 1)))
    expect(maximum).toBe(3)
  })
})
