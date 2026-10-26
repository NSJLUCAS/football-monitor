import { describe, expect, it } from 'vitest'
import {
  PORTRAIT_BLEED,
  cardPortraitBox,
  portraitBounds,
  portraitClipRect,
  portraitPlacement,
  portraitTransform,
} from '../src/domain/portrait'
import { DEFAULT_PORTRAIT } from '../src/domain/config'
describe('one canonical preview/export coordinate system', () => {
  it('uses centered 800x1000 geometry with the same scale and translation', () => {
    const config = { ...DEFAULT_PORTRAIT, scale: 1.5, x: 10, y: -20 }
    expect(portraitBounds(400, 400, config)).toEqual({ x: -120, y: -300, width: 1200, height: 1200 })
    expect(portraitTransform(config)).toBe('translate(480 300) scale(1.5) translate(-400 -500)')
  })
  it('lets the portrait draw beyond the 800x1000 reference frame inside a 4:5 bleed box', () => {
    expect(PORTRAIT_BLEED).toEqual({ x: -200, y: -250, width: 1200, height: 1500 })
    expect(portraitClipRect(DEFAULT_PORTRAIT)).toEqual(PORTRAIT_BLEED)
    expect(portraitClipRect({ ...DEFAULT_PORTRAIT, area: 'upper' })).toEqual({
      x: -200,
      y: -250,
      width: 1200,
      height: 970,
    })
    expect(portraitPlacement(DEFAULT_PORTRAIT)).toEqual({ x: 0, y: 0, width: 800, height: 1000 })
    expect(portraitPlacement({ ...DEFAULT_PORTRAIT, box: 'bleed' })).toEqual(PORTRAIT_BLEED)
  })
  it('centres the bleed box on the card reference frame', () => {
    const box = cardPortraitBox({ inset: 13, portraitTop: 15 })
    expect(box.left).toBeCloseTo(23.36, 2)
    expect(box.width).toBeCloseTo(71.04, 2)
    expect(box.top).toBeCloseTo(3.99, 1)
    expect(box.height).toBeCloseTo(66.08, 1)
  })
})
