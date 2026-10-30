import { describe, expect, it } from 'vitest'
import { clockCells, clockText, CLOCK_ROWS } from '../src/domain/clock'

describe('character clock', () => {
  it('reads the visitor’s local time as zero-padded HH:MM:SS', () => {
    expect(clockText(new Date(2026, 9, 30, 7, 5, 9))).toBe('07:05:09')
    expect(clockText(new Date(2026, 9, 30, 23, 59, 0))).toBe('23:59:00')
  })
  it('lays digits out as 3×5 dot matrices with one blank column between characters', () => {
    const { cells, cols } = clockCells('12:34:56')
    // Six digits of three columns, two one-column colons and seven gaps.
    expect(cols).toBe(6 * 3 + 2 + 7)
    expect(Math.max(...cells.map((c) => c.row))).toBe(CLOCK_ROWS - 1)
    // Each lit cell carries its own character, and the colons are two dots each.
    expect(cells.filter((c) => c.glyph === ':')).toHaveLength(4)
    expect(cells.filter((c) => c.index === 2).map((c) => c.col)).toEqual([8, 8])
    expect(cells.every((c) => '12:34:56'[c.index] === c.glyph)).toBe(true)
  })
  it('gives every digit its own shape', () => {
    const shapes = [...'0123456789'].map((d) =>
      clockCells(d)
        .cells.map((c) => `${c.col},${c.row}`)
        .join(' '),
    )
    expect(new Set(shapes).size).toBe(10)
    expect(clockCells('8').cols).toBe(3)
  })
})
