import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import ProjectsEditor from '../src/components/ProjectsEditor.vue'
import { saveConfig } from '../src/services/api'
import type { ProjectConfig } from '../src/domain/types'

const editor = (modelValue?: ProjectConfig[]) => mount(ProjectsEditor, { props: { modelValue, nodeId: 7 } })
const last = (w: ReturnType<typeof editor>) => w.emitted('update:modelValue')!.at(-1)![0]
const add = (w: ReturnType<typeof editor>) => w.findAll('button').find((b) => b.text().includes('添加项目'))!

describe('ProjectsEditor', () => {
  it('says that what is entered is public and what to keep out', () => {
    const text = editor().text()
    expect(text).toContain('对所有访客公开')
    expect(text).toContain('不要填写端口、内网地址、后台入口或任何密钥')
  })
  it('adds an empty row', async () => {
    const w = editor()
    expect(w.findAll('.project-row')).toHaveLength(0)
    await add(w).trigger('click')
    expect(last(w)).toEqual([{ name: '' }])
  })
  it('emits the whole list on every edit and leaves empty optional fields out', async () => {
    const w = editor([{ name: '', note: '旧备注' }, { name: 'Gitea' }])
    const row = w.findAll('.project-row')[0]!
    await row.find('input[aria-label="项目名称"]').setValue('博客')
    expect(last(w)).toEqual([{ name: '博客', note: '旧备注' }, { name: 'Gitea' }])
    await row.find('input[aria-label="项目网址"]').setValue('https://b.example.com')
    expect(last(w)).toEqual([{ name: '', url: 'https://b.example.com', note: '旧备注' }, { name: 'Gitea' }])
    await row.find('input[aria-label="项目备注"]').setValue('')
    expect(last(w)).toEqual([{ name: '' }, { name: 'Gitea' }])
  })
  it('removes a row', async () => {
    const w = editor([{ name: '博客' }, { name: 'Gitea' }])
    await w.find('button[aria-label="删除项目 博客"]').trigger('click')
    expect(last(w)).toEqual([{ name: 'Gitea' }])
  })
  it('points out what would be refused on save, without blocking typing', async () => {
    const ok = editor([{ name: '博客', url: 'https://b.example.com' }])
    expect(ok.find('.form-error').exists()).toBe(false)
    const bad = editor([{ name: '博客', url: 'http://10.0.0.1:8080' }])
    expect(bad.find('.form-error').attributes('role')).toBe('alert')
    expect(bad.find('.form-error').text()).toContain('公开 HTTPS')
    expect(
      editor([{ name: '' }])
        .find('.form-error')
        .text(),
    ).toContain('项目名称需为 1–40 字')
    expect(
      editor([{ name: 'A' }, { name: 'a' }])
        .find('.form-error')
        .text(),
    ).toContain('重复')
  })
  it('stops adding at twenty projects', () => {
    const full = editor(Array.from({ length: 20 }, (_, i) => ({ name: `p${i}` })))
    expect(add(full).attributes('disabled')).toBeDefined()
    expect(full.text()).toContain('每台机器最多 20 个项目')
    expect(add(editor([{ name: 'a' }])).attributes('disabled')).toBeUndefined()
  })
  it('caps what can be typed at the saved limits', () => {
    const row = editor([{ name: 'a' }]).find('.project-row')
    expect(row.find('input[aria-label="项目名称"]').attributes('maxlength')).toBe('40')
    expect(row.find('input[aria-label="项目网址"]').attributes('maxlength')).toBe('200')
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
      saveConfig({ nodes: { 7: { template: 'gold', projects: [{ name: '' }] } } }, fetcher as typeof fetch),
    ).rejects.toThrow('项目名称需为 1–40 字')
    expect(fetcher.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(false)
  })
})
