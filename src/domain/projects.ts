import type { MonitorNode, NodeConfig, ProjectConfig } from './types'

/** One Hub node with what the owner listed on it; an empty list is an idle machine. */
export interface MachineProjects {
  node: MonitorNode
  projects: ProjectConfig[]
}
/** One project across every machine that lists it. */
export interface ProjectEntry {
  key: string
  name: string
  urls: string[]
  notes: string[]
  hosts: MonitorNode[]
  /** At least one of its machines is offline. */
  down: boolean
}
export interface ProjectSummary {
  projects: number
  machines: number
  idle: number
  down: number
}

/** The same project on two machines is matched by name alone, whatever its case or padding. */
export const projectKey = (name: string) => name.trim().toLowerCase()
export function urlHost(url?: string): string {
  try {
    return url ? new URL(url).hostname : ''
  } catch {
    return ''
  }
}
/** First character of the name, whole even when it is an emoji or a rare ideograph. */
export const tileLetter = (name: string) => (Array.from(name.trim())[0] ?? '').toUpperCase()
/** A hue that stays with the name, so a project keeps its colour wherever it shows. */
export const tileHue = (name: string) =>
  Array.from(projectKey(name)).reduce((hue, c) => (hue * 31 + c.codePointAt(0)!) % 360, 7)

export const machineProjects = (
  nodes: MonitorNode[],
  config: Record<string, NodeConfig>,
): MachineProjects[] => nodes.map((node) => ({ node, projects: config[String(node.id)]?.projects ?? [] }))

/** Machines that have projects, narrowed to a search term; a machine matched by its own name keeps them all. */
export function matchProjects(list: MachineProjects[], term: string): MachineProjects[] {
  const q = term.trim().toLowerCase(),
    used = list.filter((m) => m.projects.length)
  if (!q) return used
  return used
    .map((m) =>
      m.node.name.toLowerCase().includes(q)
        ? m
        : {
            ...m,
            projects: m.projects.filter((p) =>
              `${p.name} ${urlHost(p.url)} ${p.note ?? ''}`.toLowerCase().includes(q),
            ),
          },
    )
    .filter((m) => m.projects.length)
}

export function byProject(list: MachineProjects[]): ProjectEntry[] {
  const entries = new Map<string, ProjectEntry>()
  for (const { node, projects } of list)
    for (const p of projects) {
      const key = projectKey(p.name)
      let entry = entries.get(key)
      if (!entry)
        entries.set(key, (entry = { key, name: p.name.trim(), urls: [], notes: [], hosts: [], down: false }))
      if (p.url && !entry.urls.includes(p.url)) entry.urls.push(p.url)
      if (p.note && !entry.notes.includes(p.note)) entry.notes.push(p.note)
      if (!entry.hosts.includes(node)) entry.hosts.push(node)
      if (!node.online) entry.down = true
    }
  return [...entries.values()].sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'))
}

export function projectSummary(list: MachineProjects[]): ProjectSummary {
  const entries = byProject(list),
    machines = list.filter((m) => m.projects.length).length
  return {
    projects: entries.length,
    machines,
    idle: list.length - machines,
    down: entries.filter((e) => e.down).length,
  }
}

/** Project names and link hosts of one node, for the home page search. */
export const projectSearchText = (projects: ProjectConfig[] | undefined) =>
  (projects ?? [])
    .map((p) => `${p.name} ${urlHost(p.url)}`)
    .join(' ')
    .toLowerCase()
