import { describe, expect, it } from 'vitest'
import frames from '../src/assets/cards/frames.json'
import manifest from '../theme.json'
import { isTemplate, migrateTemplate, resolveSkin, skinOf, skins } from '../src/domain/skins'

const ids = ['gold', 'silver', 'bronze', 'weekly-black', 'pioneer', 'legend']

describe('skin registry', () => {
  it('registers the six skins in order with images and frames from frames.json', () => {
    expect(skins.map((s) => s.id)).toEqual(ids)
    expect(skins.map((s) => s.name)).toEqual(['金卡', '银卡', '铜卡', '周黑', '开拓者', '传奇'])
    expect(skins.map((s) => s.kind)).toEqual(['tier', 'tier', 'tier', 'special', 'special', 'special'])
    for (const skin of skins) {
      expect(skin.image).toBeTruthy()
      expect(skin.frame).toEqual(frames[skin.id])
      expect(skinOf(skin.id)).toBe(skin)
    }
  })
  it('keeps the content inset inside the card for every skin', () => {
    for (const skin of skins) {
      expect(skin.layout.inset).toBeGreaterThan(0)
      expect(skin.layout.inset).toBeLessThan(30)
    }
  })
  it('keeps group chip text at WCAG AA contrast on every skin', () => {
    const luminance = (hex: string) => {
      const [r, g, b] = [1, 3, 5].map((i) => {
        const c = parseInt(hex.slice(i, i + 2), 16) / 255
        return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
      })
      return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
    }
    for (const skin of skins) {
      const [a, b] = skin.chip.map(luminance).sort((x, y) => y - x)
      expect((a! + 0.05) / (b! + 0.05), skin.id).toBeGreaterThanOrEqual(4.5)
    }
  })
  it('offers auto plus every registered skin as the theme.json default_template options', () => {
    const field = manifest.config.find((f) => 'key' in f && f.key === 'default_template')
    expect(field && 'options' in field ? field.options!.map((o) => o.value) : []).toEqual([
      'auto',
      ...skins.map((s) => s.id),
    ])
  })
  it('recognises current ids and auto only', () => {
    for (const id of [...ids, 'auto']) expect(isTemplate(id)).toBe(true)
    for (const id of ['classic-gold', 'deleted', 42, undefined, null]) expect(isTemplate(id)).toBe(false)
  })
  it('resolves auto by tier and keeps fixed skins', () => {
    expect(resolveSkin('auto', 'bronze').id).toBe('bronze')
    expect(resolveSkin('auto', 'silver').id).toBe('silver')
    expect(resolveSkin('auto', 'gold').id).toBe('gold')
    expect(resolveSkin('legend', 'bronze').id).toBe('legend')
    expect(resolveSkin('weekly-black', 'gold').id).toBe('weekly-black')
  })
})

describe('legacy template migration', () => {
  it.each([
    ['classic-gold', 'auto', 'gold'],
    ['black-elite', 'weekly-black', 'weekly-black'],
    ['white-icon', 'legend', 'legend'],
    ['blue-europe', 'auto', 'auto'],
    ['minimal-carbon', 'auto', 'auto'],
  ])('%s -> global %s, node %s', (legacy, global, node) => {
    expect(migrateTemplate(legacy, 'global')).toBe(global)
    expect(migrateTemplate(legacy, 'node')).toBe(node)
  })
  it('passes current ids through and rejects unknown values', () => {
    for (const id of [...ids, 'auto'])
      for (const scope of ['global', 'node'] as const) expect(migrateTemplate(id, scope)).toBe(id)
    for (const bad of ['deleted', 42, undefined, null, {}])
      for (const scope of ['global', 'node'] as const) expect(migrateTemplate(bad, scope)).toBeUndefined()
  })
})
