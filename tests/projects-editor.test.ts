import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import ProjectsEditor from '../src/components/ProjectsEditor.vue'
import { saveConfig } from '../src/services/api'
import type { ProjectConfig } from '../src/domain/types'

const editor = (modelValue?: ProjectConfig[]) => mount(ProjectsEditor, { props: { modelValue, nodeId: 7 } })
const last = (w: ReturnType<typeof editor>) => w.emitted('update:modelValue')!.at(-1)![0]
const add = (w: ReturnType<typeof editor>) => w.findAll('button').find((b) => b.text().includes('添加项目'))!

describe('ProjectsEditor', () => {
  it('says that what is entered is public, links included, and what to keep out', () => {
    const text = editor().text()
    expect(text).toContain('项目名称、类型与备注对所有访客公开')
    expect(text).toContain('不要填写网址、端口、内网地址、后台入口或任何密钥')
  })
  it('adds an empty site row', async () => {
    const w = editor()
    expect(w.findAll('.project-row')).toHaveLength(0)
    await add(w).trigger('click')
    expect(last(w)).toEqual([{ name: '', kind: 'site' }])
  })
  it('offers the three kinds and no link field', () => {
    const row = editor([{ name: 'Gitea', kind: 'docker' }]).find('.project-row')
    const select = row.find<HTMLSelectElement>('select[aria-label="项目类型"]')
    expect(select.findAll('option').map((o) => [o.attributes('value'), o.text()])).toEqual([
      ['docker', 'Docker'],
      ['site', '网站'],
      ['cron', '定时任务'],
    ])
    expect(select.element.value).toBe('docker')
    expect(row.find('input[aria-label="项目网址"]').exists()).toBe(false)
    expect(row.find('input[type="url"]').exists()).toBe(false)
  })
  it('emits the whole list on every edit and leaves an empty note out', async () => {
    const w = editor([
      { name: '', kind: 'site', note: '旧备注' },
      { name: 'Gitea', kind: 'docker' },
    ])
    const row = w.findAll('.project-row')[0]!
    await row.find('input[aria-label="项目名称"]').setValue('备份')
    expect(last(w)).toEqual([
      { name: '备份', kind: 'site', note: '旧备注' },
      { name: 'Gitea', kind: 'docker' },
    ])
    await row.find('select[aria-label="项目类型"]').setValue('cron')
    expect(last(w)).toEqual([
      { name: '', kind: 'cron', note: '旧备注' },
      { name: 'Gitea', kind: 'docker' },
    ])
    await row.find('input[aria-label="项目备注"]').setValue('')
    expect(last(w)).toEqual([
      { name: '', kind: 'site' },
      { name: 'Gitea', kind: 'docker' },
    ])
  })
  it('suggests writing the schedule in the note of a scheduled task', () => {
    const w = editor([
      { name: '备份', kind: 'cron' },
      { name: '博客', kind: 'site' },
    ])
    const [cron, site] = w.findAll('input[aria-label="项目备注"]')
    expect(cron!.attributes('placeholder')).toContain('执行时间')
    expect(site!.attributes('placeholder')).not.toContain('执行时间')
  })
  it('removes a row', async () => {
    const w = editor([
      { name: '博客', kind: 'site' },
      { name: 'Gitea', kind: 'docker' },
    ])
    await w.find('button[aria-label="删除项目 博客"]').trigger('click')
    expect(last(w)).toEqual([{ name: 'Gitea', kind: 'docker' }])
  })
  it('points out what would be refused on save, without blocking typing', () => {
    expect(
      editor([{ name: '博客', kind: 'site' }])
        .find('.form-error')
        .exists(),
    ).toBe(false)
    const empty = editor([{ name: '', kind: 'site' }]).find('.form-error')
    expect(empty.attributes('role')).toBe('alert')
    expect(empty.text()).toContain('项目名称需为 1–40 字')
    expect(
      editor([
        { name: 'A', kind: 'site' },
        { name: 'a', kind: 'docker' },
      ])
        .find('.form-error')
        .text(),
    ).toContain('重复')
  })
  it('stops adding at twenty projects', () => {
    const full = editor(Array.from({ length: 20 }, (_, i) => ({ name: `p${i}`, kind: 'site' as const })))
    expect(add(full).attributes('disabled')).toBeDefined()
    expect(full.text()).toContain('每台机器最多 20 个项目')
    expect(add(editor([{ name: 'a', kind: 'site' }])).attributes('disabled')).toBeUndefined()
  })
  it('caps what can be typed at the saved limits', () => {
    const row = editor([{ name: 'a', kind: 'site' }]).find('.project-row')
    expect(row.find('input[aria-label="项目名称"]').attributes('maxlength')).toBe('40')
    expect(row.find('input[aria-label="项目备注"]').attributes('maxlength')).toBe('80')
  })
})

describe('saving a half-filled project row', () => {
  it('is refused with the reason before anything is written', async () => {
    const fetcher = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'PUT') return new Response(null, { status: 204 })
      return String(url).endsWith('/api/me')
        ? Response.json({ authed: true, public_page: true })
        : Response.json({ node_config: '{"version":1,"nodes":{"7":{"template":"gold"}}}' })
    })
    await expect(
      saveConfig(
        { nodes: { 7: { template: 'gold', projects: [{ name: '', kind: 'site' }] } } },
        fetcher as typeof fetch,
      ),
    ).rejects.toThrow('项目名称需为 1–40 字')
    expect(fetcher.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(false)
  })
})
