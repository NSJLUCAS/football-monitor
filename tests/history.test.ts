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
  it('serves visible cards before background prefetch, promoting queued prefetch on demand', async () => {
    const started: number[] = [],
      gates: (() => void)[] = []
    const get = vi.fn((path: string) => {
      started.push(Number(path.split('/')[3]))
      return new Promise((r) => gates.push(() => r(value)))
    })
    const repo = new HistoryRepository(get)
    const all = [1, 2, 3, 4, 5].map((id) => repo.get(id, 24, 'ping', false, true))
    all.push(repo.get(6, 1, 'ping'))
    repo.prioritize(5, 24, 'ping')
    expect(started).toEqual([1, 2, 3])
    for (let i = 0; i < 6; i++) {
      gates[i]!()
      await new Promise((r) => setTimeout(r))
    }
    await Promise.all(all)
    expect(started).toEqual([1, 2, 3, 6, 5, 4])
  })
})
