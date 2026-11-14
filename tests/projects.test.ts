import { describe, expect, it } from 'vitest'
import { normalizeNodes } from '../src/domain/normalize'
import {
  byProject,
  machineProjects,
  matchProjects,
  projectKey,
  projectSearchText,
  projectSummary,
  tileHue,
  tileLetter,
  urlHost,
} from '../src/domain/projects'
import type { NodeConfig } from '../src/domain/types'

const nodes = () =>
  normalizeNodes({
    nodes: [
      { id: 1, name: 'HK-01', online: true },
      { id: 2, name: 'SG-01', online: false },
      { id: 3, name: 'JP-Tokyo', online: true },
    ],
  })
const config: Record<string, NodeConfig> = {
  '1': { projects: [{ name: '博客', url: 'https://blog.example.com', note: '主站' }, { name: 'Gitea' }] },
  '2': {
    projects: [
      { name: ' 博客', url: 'https://blog2.example.com' },
      { name: 'Alist', note: '网盘' },
    ],
  },
  // A node the Hub no longer lists.
  '999': { projects: [{ name: 'ghost' }] },
}
const list = () => machineProjects(nodes(), config)
const names = (l: ReturnType<typeof list>) =>
  l.map((m) => [m.node.name, m.projects.map((p) => p.name.trim())])

describe('projects by machine', () => {
  it('lists every Hub node in order and ignores config for nodes that are gone', () => {
    const l = list()
    expect(l.map((m) => m.node.name)).toEqual(['HK-01', 'SG-01', 'JP-Tokyo'])
    expect(l[2]!.projects).toEqual([])
    expect(JSON.stringify(l)).not.toContain('ghost')
  })
  it('counts projects, machines in use, idle machines and projects on an offline machine', () => {
    expect(projectSummary(list())).toEqual({ projects: 3, machines: 2, idle: 1, down: 2 })
    expect(projectSummary([])).toEqual({ projects: 0, machines: 0, idle: 0, down: 0 })
  })
  it('searches project name, link host, note and machine name', () => {
    expect(names(matchProjects(list(), ''))).toEqual([
      ['HK-01', ['博客', 'Gitea']],
      ['SG-01', ['博客', 'Alist']],
    ])
    expect(names(matchProjects(list(), ' BLOG2 '))).toEqual([['SG-01', ['博客']]])
    expect(names(matchProjects(list(), 'hk'))).toEqual([['HK-01', ['博客', 'Gitea']]])
    expect(names(matchProjects(list(), '网盘'))).toEqual([['SG-01', ['Alist']]])
    expect(matchProjects(list(), 'zzz')).toEqual([])
  })
})
describe('projects merged across machines', () => {
  it('joins the same name whatever its case or padding and keeps every link', () => {
    const entries = byProject(list())
    expect(entries.map((e) => e.name)).toEqual(
      ['博客', 'Alist', 'Gitea'].sort((a, b) => a.localeCompare(b, 'zh-Hans-CN')),
    )
    const blog = entries.find((e) => e.key === projectKey('博客'))!
    expect(blog.urls).toEqual(['https://blog.example.com', 'https://blog2.example.com'])
    expect(blog.notes).toEqual(['主站'])
    expect(blog.hosts.map((n) => n.name)).toEqual(['HK-01', 'SG-01'])
    expect(blog.down).toBe(true)
    expect(entries.find((e) => e.name === 'Gitea')!.down).toBe(false)
    expect(projectKey(' BLOG ')).toBe('blog')
  })
})
describe('project display helpers', () => {
  it('takes a whole first character for the tile', () => {
    expect(tileLetter('😀站')).toBe('😀')
    expect(tileLetter('alist')).toBe('A')
    expect(tileLetter('博客')).toBe('博')
  })
  it('gives a name the same hue every time', () => {
    const hue = tileHue('博客')
    expect(tileHue('博客')).toBe(hue)
    expect(Number.isInteger(hue) && hue >= 0 && hue < 360).toBe(true)
    expect(tileHue('Gitea')).not.toBe(hue)
  })
  it('reads the host of a link', () => {
    expect(urlHost('https://Blog.Example.com/a?b')).toBe('blog.example.com')
    expect(urlHost('nope')).toBe('')
    expect(urlHost()).toBe('')
  })
  it('builds the text the home page search looks through', () => {
    const text = projectSearchText(config['1']!.projects)
    expect(text).toContain('博客')
    expect(text).toContain('gitea')
    expect(text).toContain('blog.example.com')
    expect(projectSearchText(undefined)).toBe('')
  })
})
