import { describe, expect, it } from 'vitest'
import { validateEntries, validateManifest } from '../scripts/verify-package.mjs'
import manifest from '../theme.json'
const file = (path, content) => ({
  path,
  type: 'file',
  size: Buffer.byteLength(content),
  data: Buffer.from(content),
})
const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
const html =
  '<!doctype html><html><head><link rel="icon" href="/favicon.svg" /><link rel="apple-touch-icon" href="/apple-touch-icon.png" /></head></html>'
const base = () => [
  file('theme.json', JSON.stringify(manifest)),
  file('dist/index.html', html),
  file('dist/apple-touch-icon.png', png),
  file('preview.png', png),
]
describe('package safety and actual Hub layout', () => {
  it('requires all six official string fields and valid config declarations', () => {
    expect(() => validateManifest(manifest)).not.toThrow()
    expect(() => validateManifest({ ...manifest, url: undefined })).toThrow(/url/)
    expect(() => validateManifest({ ...manifest, short: '../x' })).toThrow()
    expect(() => validateManifest({ ...manifest, version: '0.9.9' })).toThrow(/package\.json/)
  })
  it('points url at the GitHub repository so the panel can update from its releases', () => {
    expect(manifest.url).toBe('https://github.com/NSJLUCAS/football-monitor')
    expect(() => validateManifest({ ...manifest, url: '' })).toThrow(/url/)
    expect(() => validateManifest({ ...manifest, url: 'https://example.com/x' })).toThrow(/url/)
  })
  it('ships the Hub-replaceable site icons at their fixed root paths', () => {
    expect(validateEntries(base(), 'hub').files).toBe(4)
    expect(() =>
      validateEntries(
        base().filter((e) => e.path !== 'dist/apple-touch-icon.png'),
        'hub',
      ),
    ).toThrow(/apple-touch-icon/)
    const withoutLink = base().map((e) =>
      e.path === 'dist/index.html'
        ? file(e.path, '<!doctype html><link rel="icon" href="/favicon.svg" />')
        : e,
    )
    expect(() => validateEntries(withoutLink, 'hub')).toThrow(/apple-touch-icon/)
    const hashedIcon = base().map((e) =>
      e.path === 'dist/index.html'
        ? file(e.path, html.replace('href="/favicon.svg"', 'href="/assets/f.svg"'))
        : e,
    )
    expect(() => validateEntries(hashedIcon, 'hub')).toThrow(/favicon/)
  })
  it('accepts the flat Hub archive and separately the requested directory wrapper', () => {
    expect(validateEntries(base(), 'hub').files).toBe(4)
    const wrapped = base().map((e) => ({ ...e, path: `football-monitor/${e.path}` }))
    expect(validateEntries(wrapped, 'wrapped').files).toBe(4)
    expect(() => validateEntries(wrapped, 'hub')).toThrow()
  })
  it('reports hashed card faces and rejects design sources or build scripts', () => {
    const report = validateEntries(
      [
        ...base(),
        file('dist/assets/weekly-black-D1nIydJY.webp', 'x'),
        file('dist/assets/gold-BeFnHefC.webp', 'x'),
      ],
      'hub',
    )
    expect(report.cardFaces).toEqual(['gold', 'weekly-black'])
    expect(report.designOrScriptsIncluded).toBe(false)
    expect(() => validateEntries([...base(), file('dist/design/cards/gold.png', 'x')], 'hub')).toThrow(
      /design/,
    )
    expect(() => validateEntries([...base(), file('dist/scripts/cards.mjs', 'x')], 'hub')).toThrow(/scripts/)
  })
  it('rejects traversal, links, duplicate entries, huge files and mock content', () => {
    expect(() => validateEntries([...base(), file('../escape', 'x')], 'hub')).toThrow()
    expect(() =>
      validateEntries([...base(), { path: 'dist/link', type: 'symlink', size: 0 }], 'hub'),
    ).toThrow()
    expect(() => validateEntries([...base(), file('theme.json', '{}')], 'hub')).toThrow()
    expect(() =>
      validateEntries([...base(), { path: 'dist/huge', type: 'file', size: 9 * 1024 ** 2 }], 'hub'),
    ).toThrow()
    expect(() =>
      validateEntries([...base(), file('dist/assets/mock.js', '本地模拟验收 · 非真实服务器')], 'hub'),
    ).toThrow(/模拟/)
  })
})
