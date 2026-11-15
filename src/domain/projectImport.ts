import { ConfigError, PROJECT_LIMITS, validProjects } from './config'
import { projectKey } from './projects'
import type { ProjectConfig } from './types'
export { looksLikeAddress } from './address'

/** Handed to an AI agent that can reach the machine over SSH; its answer is pasted back into settings. */
export const PROJECT_PROMPT = `请登录这台服务器，只读地查看上面运行着哪些项目，不要修改、重启或删除任何东西。

需要检查：
1. Docker：docker ps（含 docker compose ls 列出的 compose 项目），每个项目算一项，不要把同一项目的多个容器拆开。
2. 网站：Nginx、Caddy、Apache 等 Web 服务配置的站点。
3. 定时任务：crontab -l、/etc/crontab、/etc/cron.d 下的任务，以及 systemd 定时器（systemctl list-timers）。系统自带的维护任务（如 logrotate、apt、man-db）不用列。

输出要求：
- 只输出一个 JSON 数组，不要其他文字，格式为：
  [{"kind":"docker|site|cron","name":"项目名称","note":"备注"}]
- kind 只能是 docker、site 或 cron。
- name 用简短易懂的项目名（最多 ${PROJECT_LIMITS.name} 字），例如 "Alist"、"博客"、"数据库备份"。
- note 可选（最多 ${PROJECT_LIMITS.note} 字）：定时任务写执行时间与内容，如 "每天 04:00 备份数据库"。
- 最多 ${PROJECT_LIMITS.perNode} 项，名称不要重复。
- 这些内容会公开显示：不要输出域名、IP、端口、网址、文件路径、用户名、密码、Token 或任何密钥。

网站的名称（不能用域名，按顺序找）：
1. 反向代理到某个服务或容器时，用那个服务的名字，如 "Sun-Panel 面板"，备注写 "反代到 Sun-Panel 容器"。
2. 静态网站读首页（如 index.html）的 <title>，或用站点根目录的文件夹名。
3. 都找不到时，只用子域名最前面的一段（如 blog.example.com 只写 "blog"），不要带后面的部分。
- 每个站点单独一项；不要用“静态网站”“反向代理网站”这类笼统的名称。`

/** The list inside whatever the agent answered: a code block, words around it, or the bare list. */
export function parseProjectImport(text: string): ProjectConfig[] {
  const start = text.indexOf('['),
    end = text.lastIndexOf(']')
  let value: unknown
  try {
    value = start >= 0 && end > start ? JSON.parse(text.slice(start, end + 1)) : undefined
  } catch {
    value = undefined
  }
  if (!Array.isArray(value)) throw new ConfigError('没有找到可导入的 JSON 列表')
  // Read as saved settings are read: a wrong kind is a site, an empty or overlong name is left out.
  return validProjects(value.slice(0, PROJECT_LIMITS.perNode * 5))
}

/** Appends the names not listed yet, up to the per-machine limit; what is already there is never changed. */
export function mergeImported(list: ProjectConfig[], imported: ProjectConfig[]) {
  const next = [...list],
    seen = new Set(list.map((p) => projectKey(p.name)))
  let added = 0
  for (const p of imported) {
    const key = projectKey(p.name)
    if (seen.has(key) || next.length >= PROJECT_LIMITS.perNode) continue
    seen.add(key)
    next.push(p)
    added++
  }
  return { list: next, added, skipped: imported.length - added }
}
