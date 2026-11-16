import { onPreviewHost } from './skins'
import type { ProjectConfig, ThemeConfig } from './types'

/**
 * Sample projects for the theme gallery demo only (D056). Its hub always answers an empty config, so without
 * these the projects page would never appear there. Keyed by the demo hub's node ids; other sites never see them.
 */
const SAMPLES: Record<string, ProjectConfig[]> = {
  '1': [
    { name: '博客', kind: 'site', note: '个人博客' },
    { name: '图床', kind: 'docker' },
    { name: 'Uptime Kuma', kind: 'docker', note: '监控面板' },
  ],
  '2': [
    { name: 'API 网关', kind: 'site', note: '给小程序用' },
    { name: 'Vaultwarden', kind: 'docker', note: '密码管理' },
    { name: '证书续期', kind: 'cron', note: '每周一 03:00' },
  ],
  '4': [
    { name: 'Alist', kind: 'docker', note: '网盘挂载' },
    { name: 'RSSHub', kind: 'docker' },
    { name: 'Memos', kind: 'docker' },
    { name: '定时备份', kind: 'cron', note: '每天 04:00 打包到对象存储' },
    { name: '博客', kind: 'site', note: '备用节点' },
  ],
  '5': [{ name: 'Gitea', kind: 'docker', note: '私有仓库' }],
  '8': [
    { name: 'Nextcloud', kind: 'docker', note: '团队文件' },
    { name: '日志清理', kind: 'cron', note: '每天 05:00' },
  ],
  // An offline machine, so the page shows what an outage takes down.
  '15': [{ name: 'AdGuard Home', kind: 'docker', note: '备用 DNS' }],
  '12': [
    { name: 'Jellyfin', kind: 'docker', note: '家庭影音' },
    { name: 'qBittorrent', kind: 'docker' },
    { name: '相册备份', kind: 'cron', note: '每天 02:00' },
  ],
}

/** On the demo, and only while it lists no project of its own, the sample projects are added to its nodes. */
export function withPreviewProjects(
  config: ThemeConfig,
  host = globalThis.location?.hostname ?? '',
): ThemeConfig {
  if (!onPreviewHost(host) || Object.values(config.nodes).some((n) => n.projects?.length)) return config
  const nodes = { ...config.nodes }
  for (const [id, projects] of Object.entries(SAMPLES)) nodes[id] = { ...nodes[id], projects }
  return { ...config, nodes }
}
