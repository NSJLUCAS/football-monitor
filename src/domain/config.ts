import manifest from '../../theme.json'
import { finite, record } from './normalize'
import { migrateTemplate } from './skins'
import { providerOf } from './providers'
import { parseRates } from './fleet'
import { isBuiltinPortrait } from './portraits'
import type {
  ConfigPatch,
  GlobalConfig,
  NodeConfig,
  PortraitConfig,
  ProviderConfig,
  RawConfig,
  ThemeConfig,
} from './types'

export class ConfigError extends Error {}
export const DEFAULT_PORTRAIT: PortraitConfig = { scale: 1, x: 0, y: 0, fit: 'contain', area: 'full' }
const defaults = Object.fromEntries(manifest.config.filter((f) => 'key' in f).map((f) => [f.key, f.default]))
export const DEFAULT_CONFIG = Object.fromEntries(
  Object.entries(defaults).filter(([key]) => key !== 'node_config'),
) as unknown as GlobalConfig
export const EMPTY_NODES = '{"version":1,"nodes":{}}'
export function safeImageUrl(value: string): boolean {
  try {
    const url = new URL(value)
    const host = url.hostname.toLowerCase()
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      host.length > 253 ||
      url.href.length > 2048
    )
      return false
    if (
      !host.includes('.') ||
      host.includes(':') ||
      /(^|\.)(localhost|local|internal|lan|test|invalid)$/.test(host)
    )
      return false
    if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
      const [a = 0, b = 0] = host.split('.').map(Number)
      if (
        a === 0 ||
        a === 10 ||
        a === 127 ||
        a >= 224 ||
        (a === 169 && b === 254) ||
        (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && (b === 168 || b === 0)) ||
        (a === 100 && b >= 64 && b <= 127) ||
        (a === 198 && (b === 18 || b === 19))
      )
        return false
    }
    return true
  } catch {
    return false
  }
}
export function validPortrait(value: unknown, strict = false): PortraitConfig {
  const p = record(value)
  const bounded = (key: string, min: number, max: number, fallback: number) => {
    const v = p[key]
    if (v === undefined) return fallback
    if (finite(v) && v >= min && v <= max) return v
    if (strict) throw new ConfigError(`立绘 ${key} 参数超出范围`)
    return fallback
  }
  if (p.url && (typeof p.url !== 'string' || !safeImageUrl(p.url))) {
    if (strict) throw new ConfigError('图片地址必须是公开 HTTPS URL，不能包含凭据或本地地址')
  }
  if (strict && p.box !== undefined && p.box !== 'bleed') throw new ConfigError('立绘区域参数不合法')
  if (strict && p.builtin !== undefined && !isBuiltinPortrait(p.builtin))
    throw new ConfigError('内置立绘不存在')
  return {
    ...DEFAULT_PORTRAIT,
    ...(typeof p.url === 'string' && safeImageUrl(p.url) ? { url: p.url } : {}),
    scale: bounded('scale', 0.65, 3, 1),
    x: bounded('x', -60, 60, 0),
    y: bounded('y', -60, 60, 0),
    fit: p.fit === 'cover' ? 'cover' : 'contain',
    area: p.area === 'upper' ? 'upper' : 'full',
    hidden: p.hidden === true,
    ...(p.box === 'bleed' ? { box: 'bleed' as const } : {}),
    ...(isBuiltinPortrait(p.builtin) ? { builtin: p.builtin } : {}),
  }
}
function providerValue(value: unknown, strict: boolean): ProviderConfig | undefined {
  const p = record(value)
  const invalid = (message: string) => {
    if (strict) throw new ConfigError(message)
    return undefined
  }
  if (p.id !== 'custom') return providerOf(p.id) ? { id: String(p.id) } : invalid('无效服务商')
  if (p.name !== undefined && (typeof p.name !== 'string' || p.name.trim().length > 32))
    return invalid('服务商名称最多 32 字')
  if (p.logo !== undefined && (typeof p.logo !== 'string' || !safeImageUrl(p.logo)))
    return invalid('服务商 LOGO 必须是公开 HTTPS 图片地址')
  const name = typeof p.name === 'string' ? p.name.trim() : ''
  if (!name && !p.logo) return invalid('自定义服务商需要名称或 LOGO')
  return { id: 'custom', ...(name ? { name } : {}), ...(p.logo ? { logo: String(p.logo) } : {}) }
}
function nodeValue(value: unknown, strict = false): NodeConfig {
  const n = record(value)
  const result: NodeConfig = {}
  const template = migrateTemplate(n.template, 'node')
  if (template) result.template = template
  else if (strict && n.template !== undefined) throw new ConfigError('无效卡面模板')
  if (n.provider !== undefined) {
    const provider = providerValue(n.provider, strict)
    if (provider) result.provider = provider
  }
  if (n.portrait !== undefined) result.portrait = validPortrait(n.portrait, strict)
  if (n.carriers !== undefined) {
    result.carriers = {}
    for (const id of ['telecom', 'unicom', 'mobile'] as const) {
      const c = record(record(n.carriers)[id])
      if (strict && c.taskId !== undefined && (!Number.isSafeInteger(c.taskId) || Number(c.taskId) < 1))
        throw new ConfigError('探测任务 ID 不合法')
      if (strict && c.line !== undefined && (typeof c.line !== 'string' || c.line.length > 64))
        throw new ConfigError('线路名称最多 64 字')
      result.carriers[id] = {
        ...(Number.isSafeInteger(c.taskId) && Number(c.taskId) > 0 ? { taskId: Number(c.taskId) } : {}),
        ...(typeof c.line === 'string' ? { line: c.line.slice(0, 64) } : {}),
      }
    }
  }
  return result
}
function nodeDocument(value: unknown): { version: number; nodes: RawConfig } {
  if (value === undefined || value === '') return { version: 1, nodes: {} }
  if (typeof value !== 'string') throw new ConfigError('节点配置不是 JSON 字符串，已阻止覆盖')
  try {
    const d = record(JSON.parse(value))
    if (d.version !== 0 && d.version !== 1) throw new ConfigError('节点配置版本不受支持，已阻止覆盖')
    if (!d.nodes || typeof d.nodes !== 'object' || Array.isArray(d.nodes))
      throw new ConfigError('节点配置 nodes 格式错误，已阻止覆盖')
    if (Object.keys(d.nodes).some((id) => !/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id))))
      throw new ConfigError('节点配置包含不合法 ID')
    return { ...d, version: 1, nodes: record(d.nodes) }
  } catch (e) {
    throw e instanceof ConfigError
      ? e
      : new ConfigError('节点配置 JSON 损坏，已阻止覆盖。请先在 Hub 后台修复或备份。')
  }
}
function fits(key: string, value: unknown): boolean {
  const field = manifest.config.find((f) => 'key' in f && f.key === key)
  if (!field) return false
  if (field.type === 'select') return field.options?.some((o) => o.value === value) === true
  if (field.type === 'boolean') return typeof value === 'boolean'
  if (typeof value !== 'string') return false
  if (key === 'exchange_rates') return parseRates(value) !== null
  return key !== 'upload_endpoint' || value === '' || safeImageUrl(value)
}
export function parseConfig(raw: RawConfig): ThemeConfig {
  const config = Object.fromEntries(
    Object.keys(DEFAULT_CONFIG)
      .filter((k) => k !== 'node_config')
      .map((key) => {
        const value = key === 'default_template' ? migrateTemplate(raw[key], 'global') : raw[key]
        return [key, fits(key, value) ? value : defaults[key]]
      }),
  ) as unknown as GlobalConfig
  let nodes: Record<string, NodeConfig> = {},
    configWarning = ''
  try {
    nodes = Object.fromEntries(
      Object.entries(nodeDocument(raw.node_config).nodes).map(([id, n]) => [id, nodeValue(n)]),
    )
  } catch (e) {
    configWarning = e instanceof Error ? e.message : '节点配置不可读取'
  }
  return { ...config, nodes, configWarning }
}
export function mergeConfig(raw: RawConfig, patch: ConfigPatch): RawConfig {
  const next = { ...raw }
  for (const [key, value] of Object.entries(patch.values || {})) {
    if (!fits(key, value) || key === 'node_config') throw new ConfigError(`配置 ${key} 不合法`)
    if (value === defaults[key]) delete next[key]
    else next[key] = value
  }
  if (patch.nodes && Object.keys(patch.nodes).length) {
    const doc = nodeDocument(raw.node_config)
    for (const [id, change] of Object.entries(patch.nodes)) {
      if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id))) throw new ConfigError('节点 ID 不合法')
      if (change === null) delete doc.nodes[id]
      else {
        const validated = nodeValue(change, true)
        const old = { ...record(doc.nodes[id]) }
        delete old.template
        delete old.portrait
        delete old.carriers
        delete old.provider
        doc.nodes[id] = { ...old, ...validated }
      }
    }
    const serialized = JSON.stringify(doc)
    if (serialized === EMPTY_NODES) delete next.node_config
    else next.node_config = serialized
  }
  if (new TextEncoder().encode(JSON.stringify(next)).byteLength > 65536)
    throw new ConfigError('配置超过 64 KiB，请减少节点配置或图片 URL 长度')
  return next
}
