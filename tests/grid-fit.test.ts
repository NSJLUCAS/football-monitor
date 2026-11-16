import { describe, expect, it } from 'vitest'
import { shortRow } from '../src/services/gridFit'

describe('shortRow', () => {
  it('leaves a grid alone once its cards fill the first row', () => {
    // 1408 wide, 190 minimum, 16 gap: six columns.
    expect(shortRow(1408, 190, 16, 6)).toBeNull()
    expect(shortRow(1408, 190, 16, 14)).toBeNull()
  })
  it('widens five cards to fill a row of six', () => {
    const fit = shortRow(1408, 190, 16, 5)!
    expect(fit.count).toBe(5)
    expect(fit.cap * 5 + 16 * 4).toBeCloseTo(1408)
  })
  it('stops widening at a quarter over the usual width, leaving the rest to be centred', () => {
    const usual = (1408 - 16 * 5) / 6
    expect(shortRow(1408, 190, 16, 2)).toEqual({ count: 2, cap: usual * 1.25 })
  })
  it('has nothing to say about an empty grid, an unmeasured one or a single column', () => {
    expect(shortRow(1408, 190, 16, 0)).toBeNull()
    expect(shortRow(0, 190, 16, 3)).toBeNull()
    expect(shortRow(1408, Number.NaN, 16, 3)).toBeNull()
    expect(shortRow(300, 440, 16, 1)).toBeNull()
  })
})
