import { PROJECT_KINDS } from './config'
import type { MonitorNode, NodeConfig, ProjectConfig, ProjectKind } from './types'

/** One Hub node with what the owner listed on it; an empty list is an idle machine. */
export interface MachineProjects {
  node: MonitorNode
  projects: ProjectConfig[]
}
/** One project across every machine that lists it. */
export interface ProjectEntry {
  key: string
  name: string
  /** The kind it was first listed with. */
  kind: ProjectKind
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
export const KIND_LABEL: Record<ProjectKind, string> = { docker: 'Docker', site: '网站', cron: '定时任务' }
/** One machine's projects by kind, Docker first, kinds with nothing left out. */
export const kindGroups = (projects: ProjectConfig[]) =>
  PROJECT_KINDS.map((kind) => ({ kind, projects: projects.filter((p) => p.kind === kind) })).filter(
    (g) => g.projects.length,
  )
const searchable = (p: ProjectConfig) =>
  `${p.name} ${p.note ?? ''} ${p.kind} ${KIND_LABEL[p.kind]}`.toLowerCase()
/** First character of the name, whole even when it is an emoji or a rare ideograph. */
export const tileLetter = (name: string) => (Array.from(name.trim())[0] ?? '').toUpperCase()
/** A hue that stays with the name, so a project keeps its colour wherever it shows. */
export const tileHue = (name: string) =>
  Array.from(projectKey(name)).reduce((hue, c) => (hue * 31 + c.codePointAt(0)!) % 360, 7)

export const machineProjects = (
  nodes: MonitorNode[],
  config: Record<string, NodeConfig>,
): MachineProjects[] => nodes.map((node) => ({ node, projects: config[String(node.id)]?.projects ?? [] }))

/** Machines that have projects, narrowed to a kind and a search term; a machine matched by its own name keeps all of that kind. */
export function matchProjects(
  list: MachineProjects[],
  term: string,
  kind?: ProjectKind | null,
): MachineProjects[] {
  const q = term.trim().toLowerCase()
  return list
    .map((m) => {
      const ofKind = kind ? m.projects.filter((p) => p.kind === kind) : m.projects
      return {
        ...m,
        projects:
          !q || m.node.name.toLowerCase().includes(q)
            ? ofKind
            : ofKind.filter((p) => searchable(p).includes(q)),
      }
    })
    .filter((m) => m.projects.length)
}

export function byProject(list: MachineProjects[]): ProjectEntry[] {
  const entries = new Map<string, ProjectEntry>()
  for (const { node, projects } of list)
    for (const p of projects) {
      const key = projectKey(p.name)
      let entry = entries.get(key)
      if (!entry)
        entries.set(
          key,
          (entry = { key, name: p.name.trim(), kind: p.kind, notes: [], hosts: [], down: false }),
        )
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

/** Project names and kinds of one node, for the home page search. */
export const projectSearchText = (projects: ProjectConfig[] | undefined) =>
  (projects ?? [])
    .map((p) => `${p.name} ${p.kind} ${KIND_LABEL[p.kind]}`)
    .join(' ')
    .toLowerCase()
