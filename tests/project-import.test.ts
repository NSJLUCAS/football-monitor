import { describe, expect, it } from 'vitest'
import {
  PROJECT_PROMPT,
  looksLikeAddress,
  mergeImported,
  parseProjectImport,
} from '../src/domain/projectImport'
import { ConfigError } from '../src/domain/config'
import type { ProjectConfig } from '../src/domain/types'

describe('telling an address from a name', () => {
  it('finds links, IPs, host ports and domains', () => {
    for (const text of [
      'https://blog.example.com',
      'http://10.0.0.1',
      'blog.example.com',
      'example.com',
      '博客 blog.example.cn',
      'pan.mysite.top',
      '10.0.0.1',
      '后台 192.168.1.20',
      'localhost:8080',
      '端口 :8443',
      'db:5432',
      'git.example.dev',
    ])
      expect(looksLikeAddress(text), text).toBe(true)
  })
  it('leaves times, file names and plain names alone', () => {
    for (const text of [
      '每天 04:00',
      '每天 4:30 备份',
      '00:00–06:00',
      'acme.sh',
      'Node.js',
      'docker-compose.yml',
      'v1.2.3',
      'Uptime Kuma',
      '网盘挂载',
      'Next.js 站点',
      '',
    ])
      expect(looksLikeAddress(text), text).toBe(false)
  })
})

describe('the prompt for an SSH agent', () => {
  it('asks for a read-only look at the three kinds and a bare JSON list without addresses', () => {
    expect(PROJECT_PROMPT).toContain('只读')
    expect(PROJECT_PROMPT).toContain('docker ps')
    expect(PROJECT_PROMPT).toContain('crontab')
    expect(PROJECT_PROMPT).toContain('systemd')
    expect(PROJECT_PROMPT).toMatch(/nginx|Nginx/)
    expect(PROJECT_PROMPT).toContain('"kind"')
    expect(PROJECT_PROMPT).toContain('docker|site|cron')
    expect(PROJECT_PROMPT).toContain('不要输出域名、IP、端口')
    expect(PROJECT_PROMPT).toContain('20')
  })
})

describe('reading what the agent answered', () => {
  it('finds the list inside a code block and the words around it', () => {
    const answer = `查完了，结果如下：
\`\`\`json
[
  { "kind": "docker", "name": "Alist", "note": "网盘" },
  { "kind": "cron", "name": "数据库备份", "note": "每天 04:00" },
  { "kind": "web", "name": "博客" },
  { "kind": "site", "name": "" },
  { "kind": "site", "name": "${'长'.repeat(41)}" },
  "junk"
]
\`\`\`
如需修改请告诉我。`
    expect(parseProjectImport(answer)).toEqual([
      { name: 'Alist', kind: 'docker', note: '网盘' },
      { name: '数据库备份', kind: 'cron', note: '每天 04:00' },
      { name: '博客', kind: 'site' },
    ])
  })
  it('says so when there is no list to read', () => {
    for (const text of ['', '没有找到任何项目', '{"kind":"docker","name":"a"}', '[not json]'])
      expect(() => parseProjectImport(text), text).toThrow(new ConfigError('没有找到可导入的 JSON 列表'))
  })
})

describe('adding what was read to the list', () => {
  it('appends new names, skips names already there and stops at twenty', () => {
    const have: ProjectConfig[] = Array.from({ length: 18 }, (_, i) => ({ name: `p${i}`, kind: 'site' }))
    const imported: ProjectConfig[] = [
      { name: 'P1 ', kind: 'docker' },
      { name: 'Alist', kind: 'docker' },
      { name: 'alist', kind: 'docker' },
      { name: 'Memos', kind: 'docker' },
      { name: 'Gitea', kind: 'docker' },
    ]
    const result = mergeImported(have, imported)
    expect(result.added).toBe(2)
    expect(result.skipped).toBe(3)
    expect(result.list).toHaveLength(20)
    expect(result.list.slice(18)).toEqual([
      { name: 'Alist', kind: 'docker' },
      { name: 'Memos', kind: 'docker' },
    ])
    expect(have).toHaveLength(18)
  })
})
