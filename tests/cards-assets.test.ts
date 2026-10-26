// @vitest-environment node
import { readFileSync, statSync } from 'node:fs'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'

const ids = ['gold', 'silver', 'bronze', 'weekly-black', 'pioneer', 'legend']
const file = (id: string) => `src/assets/cards/${id}.webp`
const frames = () =>
  JSON.parse(readFileSync('src/assets/cards/frames.json', 'utf8')) as Record<
    string,
    { left: number; right: number; top: number; bottom: number }
  >
async function pixel(id: string, x: number, y: number) {
  const { data, info } = await sharp(file(id)).raw().toBuffer({ resolveWithObject: true })
  const i = (y * info.width + x) * info.channels
  return Array.from(data.subarray(i, i + info.channels))
}

describe('card face assets', () => {
  it.each(ids)('%s is a 640x860 transparent WebP under 150 KiB', async (id) => {
    const meta = await sharp(file(id)).metadata()
    expect(meta.format).toBe('webp')
    expect(meta.width).toBe(640)
    expect(meta.height).toBe(860)
    expect(meta.hasAlpha).toBe(true)
    expect((await pixel(id, 0, 0))[3]).toBe(0)
    expect(statSync(file(id)).size).toBeLessThanOrEqual(150 * 1024)
  })
  it.each(ids)('%s has a sane frame box in frames.json', (id) => {
    const f = frames()[id]
    expect(f).toBeDefined()
    expect(f.left).toBeGreaterThanOrEqual(0)
    expect(f.left).toBeLessThan(f.right)
    expect(f.right).toBeLessThanOrEqual(100)
    expect(f.bottom - f.top).toBeGreaterThanOrEqual(95)
  })
  it('silver is desaturated', async () => {
    const [r, g, b] = await pixel('silver', 320, 430)
    expect(Math.max(r, g, b) - Math.min(r, g, b)).toBeLessThanOrEqual(12)
  })
  it('bronze is a darker, redder tier than gold', async () => {
    const [r, g, b] = await pixel('bronze', 320, 430)
    const [gr, gg, gb] = await pixel('gold', 320, 430)
    const luma = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b
    expect(r).toBeGreaterThan(g)
    expect(g).toBeGreaterThan(b)
    expect(luma(r, g, b)).toBeLessThanOrEqual(luma(gr, gg, gb) * 0.85)
    expect(r / g).toBeGreaterThan(gr / gg)
  })
})
