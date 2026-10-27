import { describe, expect, it, vi } from 'vitest'
import { HistoryRepository } from '../src/services/history'
import { ApiError } from '../src/services/api'

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
  it('starts queued requests by priority, first come first served within one', async () => {
    const started: string[] = [],
      gates: (() => void)[] = []
    const get = vi.fn((path: string) => {
      started.push(
        path
          .match(/nodes\/(\d+).*hours=(\d+)/)!
          .slice(1)
          .join('/'),
      )
      return new Promise((r) => gates.push(() => r(value)))
    })
    const repo = new HistoryRepository(get)
    // Queued in one go, as the start-up prefetch does: order follows priority, not arrival.
    const all = [1, 2, 3, 4, 5].map((id) => repo.get(id, 24, 'ping', false, 3))
    all.push(repo.get(6, 1, 'ping', false, 2), repo.get(7, 24, 'ping', false, 1), repo.get(8, 1, 'ping'))
    // A card coming into view moves its queued request up; asking again at a lower priority does not.
    all.push(repo.get(5, 24, 'ping', false, 0), repo.get(8, 1, 'ping', false, 3))
    expect(started).toEqual([])
    await Promise.resolve()
    expect(started).toEqual(['8/1', '5/24', '7/24'])
    // Arriving later still goes ahead of everything waiting at a lower priority.
    all.push(repo.get(9, 1, 'ping', false, 1))
    for (let i = 0; i < 9; i++) {
      gates[i]!()
      await new Promise((r) => setTimeout(r))
    }
    await Promise.all(all)
    expect(started).toEqual(['8/1', '5/24', '7/24', '9/1', '6/1', '1/24', '2/24', '3/24', '4/24'])
  })
  it('retries a request the Hub turned away as busy, then gives up', async () => {
    vi.useFakeTimers()
    const busy = () => Promise.reject(new ApiError(503, '查询历史的请求太多，稍后再试'))
    const get = vi.fn().mockImplementationOnce(busy).mockResolvedValueOnce(value)
    const repo = new HistoryRepository(get)
    const first = repo.get(1, 1, 'ping')
    await vi.advanceTimersByTimeAsync(2000)
    await expect(first).resolves.toMatchObject(value)
    expect(get).toHaveBeenCalledTimes(2)
    get.mockImplementation(busy)
    const second = repo.get(2, 1, 'ping').catch((e: ApiError) => e.status)
    await vi.advanceTimersByTimeAsync(30000)
    await expect(second).resolves.toBe(503)
    // The first try and three retries.
    expect(get).toHaveBeenCalledTimes(6)
    vi.useRealTimers()
  })
})
