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

describe('node projects', () => {
  const doc = (nodes: unknown) => ({ node_config: JSON.stringify({ version: 1, nodes }) })
  const nodesOf = (raw: Record<string, unknown>) => JSON.parse(raw.node_config as string).nodes
  it('reads projects leniently: an old entry without a kind is a site and its link is dropped', () => {
    const { nodes } = parseConfig(
      doc({
        1: {
          projects: [
            { name: '  博客 ', url: 'https://blog.example.com', note: 'Halo' },
            { name: '' },
            { name: 'Alist', kind: 'docker' },
            { name: '备份', kind: 'cron', note: '每天 04:00' },
            { name: '怪', kind: 'nope' },
            { name: '博客', kind: 'docker' },
            'junk',
          ],
        },
      }),
    )
    expect(nodes['1']!.projects).toEqual([
      { name: '博客', kind: 'site', note: 'Halo' },
      { name: 'Alist', kind: 'docker' },
      { name: '备份', kind: 'cron', note: '每天 04:00' },
      { name: '怪', kind: 'site' },
    ])
  })
  it('rejects bad projects on save', () => {
    const save = (projects: unknown) => () => mergeConfig({}, { nodes: { 1: { projects } as never } })
    expect(save([{ name: ' ', kind: 'site' }])).toThrow('项目名称需为 1–40 字')
    expect(save([{ name: 'x'.repeat(41), kind: 'site' }])).toThrow('项目名称需为 1–40 字')
    expect(save([{ name: 'a', kind: 'nope' }])).toThrow('项目类型无效')
    expect(save([{ name: 'a', kind: 'site', note: 'n'.repeat(81) }])).toThrow('项目备注最多 80 字')
    expect(
      save([
        { name: 'Blog', kind: 'site' },
        { name: 'blog ', kind: 'docker' },
      ]),
    ).toThrow('项目“blog”重复')
    expect(save(Array.from({ length: 21 }, (_, i) => ({ name: `p${i}`, kind: 'site' })))).toThrow(
      '每台机器最多 20 个项目',
    )
    expect(save('nope')).toThrow(ConfigError)
  })
  it('refuses to save an address in a project name or note, but still reads one already saved', () => {
    const save = (projects: unknown) => () => mergeConfig({}, { nodes: { 1: { projects } as never } })
    expect(save([{ name: 'blog.example.com', kind: 'site' }])).toThrow(
      '项目“blog.example.com”含有网址、IP 或端口，请改掉后保存',
    )
    expect(save([{ name: '面板', kind: 'docker', note: '10.0.0.1:9000' }])).toThrow(
      '项目“面板”含有网址、IP 或端口',
    )
    expect(save([{ name: '备份', kind: 'cron', note: '每天 04:00 acme.sh' }])).not.toThrow()
    const { nodes } = parseConfig(doc({ 1: { projects: [{ name: 'blog.example.com', kind: 'site' }] } }))
    expect(nodes['1']!.projects).toEqual([{ name: 'blog.example.com', kind: 'site' }])
  })
  it('stores projects with their kind and never a link, keeps unknown keys and drops an emptied list', () => {
    const raw = doc({ 1: { future_key: 'keep' }, 999: { projects: [{ name: 'ghost' }] } })
    const saved = mergeConfig(raw, {
      nodes: {
        1: {
          projects: [
            { name: ' 博客 ', url: 'https://b.example.com', note: '' } as never,
            { name: 'Gitea', kind: 'docker' },
          ],
        },
      },
    })
    expect(nodesOf(saved)['1']).toEqual({
      future_key: 'keep',
      projects: [
        { name: '博客', kind: 'site' },
        { name: 'Gitea', kind: 'docker' },
      ],
    })
    expect(nodesOf(saved)['999']).toEqual({ projects: [{ name: 'ghost' }] })
    const cleared = mergeConfig(saved, { nodes: { 1: { projects: [] } } })
    expect(nodesOf(cleared)['1']).toEqual({ future_key: 'keep' })
  })
  it('wipes links left from before on any save, even of global settings only', () => {
    const raw = {
      motion: false,
      ...doc({
        1: {
          template: 'gold',
          future_key: 'keep',
          projects: [{ name: '博客', url: 'https://b.example.com', x: 1 }],
        },
        2: { projects: [{ name: 'Gitea', kind: 'docker', url: 'https://g.example.com' }] },
        3: { template: 'gold' },
      }),
    }
    expect(parseConfig(raw).projectUrlsLeft).toBe(true)
    const next = mergeConfig(raw, { values: { motion: true } })
    expect(String(next.node_config)).not.toContain('url')
    expect(nodesOf(next)).toEqual({
      1: { template: 'gold', future_key: 'keep', projects: [{ name: '博客', x: 1 }] },
      2: { projects: [{ name: 'Gitea', kind: 'docker' }] },
      3: { template: 'gold' },
    })
    expect(parseConfig(next).projectUrlsLeft).toBe(false)
    expect(mergeConfig(raw, {}).node_config).toBe(next.node_config)
    // Nothing to wipe: the stored text is left exactly as it was.
    const clean = doc({ 3: { template: 'gold' } })
    expect(mergeConfig(clean, { values: { motion: true } }).node_config).toBe(clean.node_config)
    // An unreadable node document still lets global settings be saved.
    expect(mergeConfig({ node_config: '{bad' }, { values: { motion: true } }).node_config).toBe('{bad')
  })
})
