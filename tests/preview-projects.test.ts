import { describe, expect, it } from 'vitest'
import { parseConfig } from '../src/domain/config'
import { withPreviewProjects } from '../src/domain/previewProjects'

const DEMO = 'football-monitor.monitor-themes.pages.dev'
const named = (config: ReturnType<typeof parseConfig>) =>
  Object.entries(config.nodes)
    .filter(([, n]) => n.projects?.length)
    .map(([id, n]) => [id, n.projects!.map((p) => p.name)])

describe('sample projects on the theme gallery demo', () => {
  it('fills the demo, whose settings are empty, with a few machines’ projects', () => {
    const config = withPreviewProjects(parseConfig({}), DEMO)
    const listed = named(config)
    expect(listed.length).toBeGreaterThanOrEqual(4)
    // One project on two machines, and machines left without any.
    const names = listed.flatMap(([, n]) => n as string[])
    expect(names.filter((n) => n === '博客')).toHaveLength(2)
    expect(config.nodes['3']?.projects).toBeUndefined()
    expect(
      new Set(
        Object.values(config.nodes)
          .flatMap((n) => n.projects ?? [])
          .map((p) => p.kind),
      ),
    ).toEqual(new Set(['docker', 'site', 'cron']))
  })
  it('leaves any other site alone', () => {
    expect(named(withPreviewProjects(parseConfig({}), 'status.example.com'))).toEqual([])
    expect(named(withPreviewProjects(parseConfig({}), 'monitor-themes.pages.dev.example.com'))).toEqual([])
  })
  it('keeps projects the demo already has, and every other node setting', () => {
    const own = parseConfig({
      node_config: JSON.stringify({
        version: 1,
        nodes: { '1': { template: 'legend' }, '2': { projects: [{ name: '自己的', kind: 'site' }] } },
      }),
    })
    expect(named(withPreviewProjects(own, DEMO))).toEqual([['2', ['自己的']]])
    const filled = withPreviewProjects(
      parseConfig({ node_config: JSON.stringify({ version: 1, nodes: { '1': { template: 'legend' } } }) }),
      DEMO,
    )
    expect(filled.nodes['1']?.template).toBe('legend')
    expect(filled.nodes['1']?.projects?.length).toBeGreaterThan(0)
  })
})
