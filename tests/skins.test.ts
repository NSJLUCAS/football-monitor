import { describe, expect, it } from 'vitest'
import frames from '../src/assets/cards/frames.json'
import manifest from '../theme.json'
import { parseConfig } from '../src/domain/config'
import { isTemplate, migrateTemplate, nodeTemplate, resolveSkin, skinOf, skins } from '../src/domain/skins'

const ids = [
  'gold',
  'silver',
  'bronze',
  'weekly-black',
  'pioneer',
  'legend',
  'galaxy',
  'shatter',
  'toty-xi',
  'neon',
  'splash',
  'lapis',
  'neon-city',
  'emerald',
  'toty-orbit',
  'prism',
  'glitch',
]

describe('skin registry', () => {
  it('registers every skin in order with images and frames from frames.json', () => {
    expect(skins.map((s) => s.id)).toEqual(ids)
    expect(skins.map((s) => s.name)).toEqual([
      '金卡',
      '银卡',
      '铜卡',
      '周黑',
      '开拓者',
      '传奇',
      '星河',
      '碎焰',
      '年度最佳',
      '霓虹',
      '幻彩',
      '青金',
      '霓虹城',
      '翡翠',
      '星环',
      '棱镜',
      '故障',
    ])
    expect(skins.map((s) => s.kind)).toEqual(['tier', 'tier', 'tier', ...Array(14).fill('special')])
    expect(skins.filter((s) => s.tone === 'light').map((s) => s.id)).toEqual([
      'gold',
      'silver',
      'bronze',
      'legend',
    ])
    for (const skin of skins) expect(skin.tone === 'dark', skin.id).toBe(skin.badge !== undefined)
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

describe('theme preview showcase', () => {
  const preview = 'football-monitor.monitor-themes.pages.dev'
  it('rotates every face by node id on the theme preview site, whose demo hub has no settings', () => {
    const empty = parseConfig({})
    expect(skins.map((_, i) => nodeTemplate(empty, i + 1, preview))).toEqual(skins.map((s) => s.id))
    expect(nodeTemplate(empty, skins.length + 1, preview)).toBe('gold')
  })
  it('keeps saved templates and leaves every other host on the configured default', () => {
    expect(nodeTemplate(parseConfig({}), 1, 'tz.example.com')).toBe('auto')
    expect(nodeTemplate(parseConfig({}), 1, 'monitor-themes.pages.dev.example.com')).toBe('auto')
    expect(nodeTemplate(parseConfig({ default_template: 'legend' }), 1, preview)).toBe('legend')
    const node = parseConfig({
      node_config: JSON.stringify({ version: 1, nodes: { 2: { template: 'lapis' } } }),
    })
    expect(nodeTemplate(node, 2, preview)).toBe('lapis')
    expect(nodeTemplate(node, 2, 'tz.example.com')).toBe('lapis')
  })
})
