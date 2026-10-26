import { mergeConfig, parseConfig } from '../domain/config'
import { normalizeMe, record } from '../domain/normalize'
import type { ConfigPatch, RawConfig } from '../domain/types'

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}
export type Fetcher = typeof fetch
export async function request(
  path: string,
  init: RequestInit = {},
  fetcher: Fetcher = fetch,
): Promise<unknown> {
  try {
    const response = await fetcher(path, {
      ...init,
      credentials: 'same-origin',
      signal: AbortSignal.any([AbortSignal.timeout(15000), ...(init.signal ? [init.signal] : [])]),
    })
    if (!response.ok) {
      const message = response.headers.get('content-type')?.startsWith('text/plain')
        ? (await response.text()).trim().slice(0, 500)
        : ''
      throw new ApiError(
        response.status,
        message ||
          (response.status === 401 ? '需要登录后查看' : `服务暂时无法访问（HTTP ${response.status}）`),
      )
    }
    if (response.status === 204) return undefined
    try {
      return await response.json()
    } catch {
      throw new ApiError(response.status, '收到的不是有效状态数据，请检查 Hub 或反向代理')
    }
  } catch (e) {
    if (e instanceof ApiError) throw e
    if (init.signal?.aborted) throw e
    throw new ApiError(0, '网络连接失败或请求超时，请稍后重试')
  }
}
export function rawObject(value: unknown): RawConfig {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    throw new ApiError(200, '主题配置格式不正确，未覆盖原配置')
  return record(value)
}
export async function saveConfig(patch: ConfigPatch, fetcher: Fetcher = fetch) {
  const me = normalizeMe(await request('/api/me', {}, fetcher))
  if (!me.authed) throw new ApiError(401, '登录已失效，请在 Hub 登录后保存')
  const url = '/api/themes/football-monitor/config'
  const raw = rawObject(await request(url, {}, fetcher))
  const next = mergeConfig(raw, patch)
  await request(
    url,
    { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(next) },
    fetcher,
  )
  const confirmed = rawObject(await request(url, { cache: 'no-store' }, fetcher))
  for (const key of Object.keys(patch.values || {})) {
    if (JSON.stringify(confirmed[key]) !== JSON.stringify(next[key]))
      throw new ApiError(409, '保存后读取的配置不一致，请重试；可能有其他站长同时修改')
  }
  if (patch.nodes && Object.keys(patch.nodes).length && confirmed.node_config !== next.node_config)
    throw new ApiError(409, '节点配置保存后校验失败，请重新载入设置')
  return parseConfig(confirmed)
}
