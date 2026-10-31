import { DEFAULT_RATES } from '../src/domain/fleet'
import { describe, expect, it, vi } from 'vitest'
import {
  parseConfig,
  mergeConfig,
  safeImageUrl,
  validPortrait,
  DEFAULT_CONFIG,
  ConfigError,
} from '../src/domain/config'
import { saveConfig } from '../src/services/api'

describe('site config contract', () => {
  it('can restore global defaults without treating node JSON as a global field', () => {
    const raw = {
      motion: false,
      node_config: '{"version":1,"nodes":{"1":{"template":"blue-europe"}}}',
      foreign: 1,
    }
    const next = mergeConfig(raw, { values: { ...DEFAULT_CONFIG } })
    expect(next.motion).toBeUndefined()
    expect(next.node_config).toBe(raw.node_config)
    expect(next.foreign).toBe(1)
  })
  it('inherits defaults, migrates v0 and falls back from removed and legacy templates', () => {
    expect(parseConfig({ default_template: 'deleted' }).default_template).toBe('auto')
    expect(parseConfig({ default_template: 'black-elite' }).default_template).toBe('weekly-black')
    expect(parseConfig({ default_template: 'classic-gold' }).default_template).toBe('auto')
    const legacy = (template: string) =>
      parseConfig({
        node_config: JSON.stringify({ version: 0, nodes: { '1': { template } } }),
      }).nodes['1']?.template
    expect(legacy('white-icon')).toBe('legend')
    expect(legacy('blue-europe')).toBe('auto')
    expect(parseConfig({}).nodes).toEqual({})
    expect(DEFAULT_CONFIG.motion).toBe(true)
  })
  it('does not silently overwrite corrupt or future node settings', () => {
    expect(() => mergeConfig({ node_config: '{broken' }, { nodes: { '1': {} } })).toThrow(ConfigError)
    expect(() => mergeConfig({ node_config: '{"version":5,"nodes":{}}' }, { nodes: { '1': {} } })).toThrow(
      ConfigError,
    )
    expect(parseConfig({ node_config: 'bad' }).configWarning).toBeTruthy()
  })
  it('merges only dirty node IDs and preserves unrelated raw and node keys', () => {
    const raw = {
      custom: 'keep',
      node_config: JSON.stringify({
        version: 1,
        nodes: { '1': { template: 'gold', future: 42 }, '2': { template: 'legend' } },
      }),
    }
    const next = mergeConfig(raw, { values: { motion: false }, nodes: { '1': { template: 'weekly-black' } } })
    expect(next.custom).toBe('keep')
    expect(JSON.parse(String(next.node_config)).nodes).toEqual({
      '1': { template: 'weekly-black', future: 42 },
      '2': { template: 'legend' },
    })
    expect(mergeConfig(next, { nodes: { '1': null } }).node_config).not.toContain('future')
  })
  it('strict save converts legacy ids and rejects unknown ids', () => {
    const raw = { custom: 'keep' }
    const saved = mergeConfig(raw, { nodes: { '1': { template: 'classic-gold' as never } } })
    expect(JSON.parse(String(saved.node_config)).nodes['1'].template).toBe('gold')
    expect(() => mergeConfig(raw, { nodes: { '1': { template: 'deleted' as never } } })).toThrow(ConfigError)
    expect(() => mergeConfig(raw, { values: { default_template: 'black-elite' as never } })).toThrow(
      ConfigError,
    )
    expect(mergeConfig(raw, { values: { default_template: 'legend' } }).default_template).toBe('legend')
  })
  it('validates UTF-8 size including unknown keys and forbids prototype IDs', () => {
    expect(() => mergeConfig({ other: '汉'.repeat(23000) }, { values: { motion: false } })).toThrow(/64/)
    expect(() => mergeConfig({}, { nodes: JSON.parse('{"__proto__":{}}') })).toThrow()
    expect(() => mergeConfig({}, { values: { upload_endpoint: 'http://local' } })).toThrow()
  })
  it('only allows public https portrait URLs without credentials', () => {
    for (const url of [
      'javascript:alert(1)',
      'data:image/png;base64,a',
      'http://example.com/a',
      'https://127.0.0.1/x',
      'https://user:pass@example.com/x',
      'https://[::1]/x',
      'https://10.1.2.3/a',
      'https://localhost/a',
    ])
      expect(safeImageUrl(url)).toBe(false)
    expect(safeImageUrl('https://images.example.org/a.webp')).toBe(true)
  })
  it('requires auth, reads raw, writes and confirms before returning success', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ authed: true }))
      .mockResolvedValueOnce(Response.json({ other: 8 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(Response.json({ other: 8, motion: false }))
    await saveConfig({ values: { motion: false } }, fetcher)
    expect(fetcher).toHaveBeenCalledTimes(4)
    expect(JSON.parse(fetcher.mock.calls[2]![1].body)).toEqual({ other: 8, motion: false })
  })
  it('never pretends PUT/auth/confirmation failure succeeded', async () => {
    const unauth = vi.fn().mockResolvedValue(Response.json({ authed: false }))
    await expect(saveConfig({ values: { motion: false } }, unauth)).rejects.toThrow()
    expect(unauth).toHaveBeenCalledTimes(1)
    const fail = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ authed: true }))
      .mockResolvedValueOnce(Response.json({}))
      .mockResolvedValueOnce(
        new Response('拒绝保存', { status: 401, headers: { 'content-type': 'text/plain' } }),
      )
    await expect(saveConfig({ values: { motion: false } }, fail)).rejects.toThrow('拒绝保存')
  })
  it('accepts portraits up to 300% zoom and ±60% offsets with an optional bleed box', () => {
    expect(validPortrait({ scale: 3, x: 60, y: -60, box: 'bleed' }, true)).toMatchObject({
      scale: 3,
      x: 60,
      y: -60,
      box: 'bleed',
    })
    expect(() => validPortrait({ scale: 3.01 }, true)).toThrow(ConfigError)
    expect(() => validPortrait({ y: 61 }, true)).toThrow(ConfigError)
    expect(() => validPortrait({ box: 'huge' }, true)).toThrow(ConfigError)
    expect(validPortrait({ box: 'huge' }).box).toBeUndefined()
  })
  it('keeps valid exchange rates and refuses malformed ones', () => {
    expect(parseConfig({}).exchange_rates).toBe(DEFAULT_RATES)
    expect(parseConfig({ exchange_rates: 'USD=7' }).exchange_rates).toBe('USD=7')
    expect(parseConfig({ exchange_rates: 'USD=abc' }).exchange_rates).toBe(DEFAULT_RATES)
    expect(mergeConfig({ a: 1 }, { values: { exchange_rates: 'USD=7.2' } })).toEqual({
      a: 1,
      exchange_rates: 'USD=7.2',
    })
    expect(() => mergeConfig({}, { values: { exchange_rates: 'USD' } })).toThrow()
  })
  it('defaults the home page to the stacked card view and saves only a known view', () => {
    expect(parseConfig({}).card_view).toBe('stacked')
    expect(parseConfig({ card_view: 'split' }).card_view).toBe('split')
    expect(parseConfig({ card_view: 'grid' }).card_view).toBe('stacked')
    expect(mergeConfig({ a: 1 }, { values: { card_view: 'split' } })).toEqual({ a: 1, card_view: 'split' })
    expect(mergeConfig({ card_view: 'split' }, { values: { card_view: 'stacked' } })).toEqual({})
    expect(() => mergeConfig({}, { values: { card_view: 'grid' as never } })).toThrow(ConfigError)
  })
  it('validates the node provider and keeps it when saving', () => {
    const parsed = parseConfig({
      node_config: JSON.stringify({
        version: 1,
        nodes: {
          '1': { provider: { id: 'vultr' } },
          '2': { provider: { id: 'custom', name: '小鸡云', logo: 'https://img.example.org/logo.png' } },
          '3': { provider: { id: 'nope' } },
          '4': { provider: { id: 'custom', logo: 'http://10.0.0.1/x.png' } },
        },
      }),
    })
    expect(parsed.nodes['1']?.provider).toEqual({ id: 'vultr' })
    expect(parsed.nodes['2']?.provider).toEqual({
      id: 'custom',
      name: '小鸡云',
      logo: 'https://img.example.org/logo.png',
    })
    expect(parsed.nodes['3']?.provider).toBeUndefined()
    expect(parsed.nodes['4']?.provider).toBeUndefined()
    expect(() => mergeConfig({}, { nodes: { '1': { provider: { id: 'nope' } } } })).toThrow(ConfigError)
    expect(() =>
      mergeConfig({}, { nodes: { '1': { provider: { id: 'custom', name: 'x'.repeat(33) } } } }),
    ).toThrow(ConfigError)
    expect(() =>
      mergeConfig({}, { nodes: { '1': { provider: { id: 'custom', logo: 'http://a.example/x.png' } } } }),
    ).toThrow(ConfigError)
    const raw = mergeConfig(
      { node_config: JSON.stringify({ version: 1, nodes: { '1': { provider: { id: 'aws' }, extra: 1 } } }) },
      { nodes: { '1': { provider: { id: 'hetzner' } } } },
    )
    expect(JSON.parse(String(raw.node_config)).nodes['1']).toEqual({ provider: { id: 'hetzner' }, extra: 1 })
  })
})
