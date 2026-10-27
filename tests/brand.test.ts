import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import sharp from 'sharp'

const favicon = readFileSync('public/favicon.svg', 'utf8')

describe('brand mark', () => {
  it('draws the pitch on the Monitor 16-unit grid in the single theme accent', () => {
    expect(favicon).toContain('viewBox="0 0 16 16"')
    expect(favicon).toMatch(/<rect [^>]*rx=/)
    expect(favicon).toContain('<circle')
    const colours = new Set(favicon.match(/#[0-9a-f]{3,6}\b/gi)?.map((c) => c.toLowerCase()))
    expect([...colours]).toEqual(['#ff7a1a'])
  })
  it('stays a self-contained image the Hub can swap in place', () => {
    expect(favicon).not.toMatch(/<script|href=|url\(|<image|<text/i)
  })
  it('ships an opaque 180x180 touch icon, since iOS paints transparency black', async () => {
    const meta = await sharp('public/apple-touch-icon.png').metadata()
    expect([meta.width, meta.height, meta.format, meta.hasAlpha]).toEqual([180, 180, 'png', false])
    const { data } = await sharp('public/apple-touch-icon.png').raw().toBuffer({ resolveWithObject: true })
    // The corner shows the dark theme ground, the pitch lines the accent.
    expect([...data.subarray(0, 3)]).toEqual([0x14, 0x16, 0x1c])
  })
})
