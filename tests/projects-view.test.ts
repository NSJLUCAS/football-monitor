import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import ProjectsView from '../src/views/ProjectsView.vue'
import { parseConfig } from '../src/domain/config'
import { normalizeNodes } from '../src/domain/normalize'
import { useMonitorStore } from '../src/stores/monitor'

const fixtures = () =>
  normalizeNodes({
    nodes: [
      { id: 1, name: 'HK-01', group: '亚洲节点', online: true, country: 'hk' },
      { id: 2, name: 'SG-01', group: '亚洲节点', online: false },
      { id: 3, name: 'JP-Tokyo', group: '亚洲节点', online: true },
      { id: 4, name: 'DE-01', group: '欧洲节点', online: true },
    ],
  })
const PROJECTS = {
  1: {
    provider: { id: 'vultr' },
    projects: [{ name: '博客', url: 'https://blog.example.com', note: '主站' }, { name: 'Gitea' }],
  },
  2: {
    projects: [
      { name: '博客', url: 'https://blog2.example.com' },
      { name: 'Alist', note: '网盘' },
    ],
  },
  4: { projects: [{ name: 'Umami', url: 'https://stat.example.com' }] },
}
const config = (nodes: unknown) => parseConfig({ node_config: JSON.stringify({ version: 1, nodes }) })

async function mountProjects(
  path = '/projects',
  configure?: (store: ReturnType<typeof useMonitorStore>) => void,
) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/projects', component: ProjectsView },
      { path: '/node/:id', component: { template: '<div />' } },
      { path: '/settings', component: { template: '<div />' } },
    ],
  })
  await router.push(path)
  await router.isReady()
  const store = useMonitorStore()
  store.me = { authed: false, site_name: 'Monitor', public_page: true, github: false, history_days: 7 }
  store.nodes = fixtures()
  store.loading = false
  store.config = config(PROJECTS)
  configure?.(store)
  const wrapper = mount(ProjectsView, { global: { plugins: [router] } })
  await flushPromises()
  return { wrapper, router, store }
}
const machines = (w: VueWrapper) => w.findAll('.pj-machine .pj-head b').map((b) => b.text())
const stats = (w: VueWrapper) => w.find('.pj-stats').text().replace(/\s+/g, ' ')
const button = (w: VueWrapper, label: string) => w.findAll('button').find((b) => b.text().startsWith(label))!

beforeEach(() => setActivePinia(createPinia()))
enableAutoUnmount(afterEach)
afterEach(() => vi.restoreAllMocks())

describe('projects page', () => {
  it('shows every machine that has projects, the totals and the idle machines', async () => {
    const { wrapper } = await mountProjects()
    expect(machines(wrapper)).toEqual(['HK-01', 'SG-01', 'DE-01'])
    expect(stats(wrapper)).toContain('4 个项目')
    expect(stats(wrapper)).toContain('3 台机器在用')
    expect(stats(wrapper)).toContain('1 台空闲')
    expect(stats(wrapper)).toContain('2 个项目受离线影响')
    expect(wrapper.find('.pj-down').attributes('data-on')).toBe('true')
    const idle = wrapper.find('.pj-idle')
    expect(idle.text()).toContain('空闲 1 台')
    expect(idle.find('a').text()).toBe('JP-Tokyo')
    expect(idle.find('a').attributes('href')).toBe('/node/3')
  })
  it('marks an offline machine and leaves the others alone', async () => {
    const { wrapper } = await mountProjects()
    const [hk, sg] = wrapper.findAll('.pj-machine')
    expect(hk!.attributes('data-online')).toBe('true')
    expect(hk!.find('.pj-head em').text()).toBe('在线')
    expect(sg!.attributes('data-online')).toBe('false')
    expect(sg!.find('.pj-head em').text()).toBe('离线')
    expect(sg!.find('.pj-score').text()).toBe('OFF')
    expect(hk!.find('.pj-head').attributes('href')).toBe('/node/1')
    expect(hk!.find('.pj-count').text()).toBe('2 个项目')
    expect(hk!.find('.pj-provider').attributes('title')).toBe('Vultr')
    expect(sg!.find('.pj-provider').exists()).toBe(false)
  })
  it('opens a project link in a new tab and leaves a project without one as plain text', async () => {
    const { wrapper } = await mountProjects()
    const [blog, gitea] = wrapper.findAll('.pj-machine')[0]!.findAll('.pj-item')
    expect(blog!.element.tagName).toBe('A')
    expect(blog!.attributes()).toMatchObject({
      href: 'https://blog.example.com',
      target: '_blank',
      rel: 'noopener noreferrer',
      title: '主站',
    })
    expect(blog!.find('.pj-text b').text()).toBe('博客')
    expect(blog!.find('.pj-text small').text()).toBe('blog.example.com')
    expect(blog!.find('.pj-tile').text()).toBe('博')
    expect(gitea!.element.tagName).toBe('DIV')
    expect(gitea!.attributes('href')).toBeUndefined()
    expect(gitea!.find('.pj-text small').text()).toBe('未填网址')
    expect(wrapper.find('img[src*="example.com"]').exists()).toBe(false)
  })
  it('switches to one row per project and keeps the choice in the address', async () => {
    const { wrapper, router } = await mountProjects()
    await button(wrapper, '按项目').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query.view).toBe('project')
    expect(button(wrapper, '按项目').attributes('aria-pressed')).toBe('true')
    expect(wrapper.find('.pj-machine').exists()).toBe(false)
    const rows = wrapper.findAll('.pj-row')
    expect(rows).toHaveLength(4)
    const blog = rows.find((r) => r.find('.pj-name').text() === '博客')!
    expect(blog.findAll('.pj-host').map((h) => h.text())).toEqual(['HK-01', 'SG-01离线'])
    expect(blog.findAll('.pj-url').map((a) => a.attributes('href'))).toEqual([
      'https://blog.example.com',
      'https://blog2.example.com',
    ])
    expect(blog.attributes('data-down')).toBe('true')
    expect(rows.find((r) => r.find('.pj-name').text() === 'Gitea')!.attributes('data-down')).toBe('false')
    await button(wrapper, '按机器').trigger('click')
    await flushPromises()
    expect('view' in router.currentRoute.value.query).toBe(false)
  })
  it('opens straight on the project view from the address', async () => {
    const { wrapper } = await mountProjects('/projects?view=project')
    expect(wrapper.findAll('.pj-row')).toHaveLength(4)
  })
  it('searches from its own box, through the address', async () => {
    const { wrapper, router } = await mountProjects()
    const input = wrapper.find<HTMLInputElement>('.pj-search input')
    expect(input.attributes('aria-label')).toBe('搜索项目')
    await input.setValue('alist')
    await flushPromises()
    expect(router.currentRoute.value.query.q).toBe('alist')
    expect(machines(wrapper)).toEqual(['SG-01'])
    expect(wrapper.findAll('.pj-item')).toHaveLength(1)
    expect(wrapper.find('.pj-idle').exists()).toBe(false)
    // The totals describe the fleet, not the search.
    expect(stats(wrapper)).toContain('4 个项目')
  })
  it('says so when nothing matches and clears the filters', async () => {
    const { wrapper, router } = await mountProjects('/projects?q=zzz')
    expect(wrapper.find<HTMLInputElement>('.pj-search input').element.value).toBe('zzz')
    expect(wrapper.find('.empty-state').text()).toContain('没有找到匹配的项目')
    await button(wrapper, '清除筛选').trigger('click')
    await flushPromises()
    expect('q' in router.currentRoute.value.query).toBe(false)
    expect(machines(wrapper)).toEqual(['HK-01', 'SG-01', 'DE-01'])
  })
  it('narrows to a group', async () => {
    const { wrapper } = await mountProjects()
    await button(wrapper, '欧洲节点').trigger('click')
    expect(machines(wrapper)).toEqual(['DE-01'])
    expect(stats(wrapper)).toContain('1 个项目')
    expect(stats(wrapper)).toContain('0 台空闲')
    expect(wrapper.find('.pj-down').attributes('data-on')).toBe('false')
    expect(wrapper.find('.pj-idle').exists()).toBe(false)
  })
  it('explains where to add projects when there are none, with a link only for the owner', async () => {
    const visitor = await mountProjects('/projects', (s) => (s.config = config({})))
    expect(visitor.wrapper.find('.empty-state').text()).toContain('还没有登记项目')
    expect(visitor.wrapper.find('.empty-state').find('a').exists()).toBe(false)
    expect(visitor.wrapper.find('.pj-summary').exists()).toBe(false)
    visitor.wrapper.unmount()
    const owner = await mountProjects('/projects', (s) => {
      s.config = config({})
      s.me = { ...s.me!, authed: true }
    })
    expect(owner.wrapper.find('.empty-state').find('a[href="/settings"]').text()).toBe('去登记')
  })
  it('shows the closed notice when the Hub page is not public', async () => {
    const { wrapper } = await mountProjects('/projects', (s) => {
      s.closed = true
      s.error = '需要登录'
    })
    expect(wrapper.find('.empty-state').text()).toContain('此刻，主场暂未开放')
    expect(wrapper.find('.pj-machine').exists()).toBe(false)
  })
})
