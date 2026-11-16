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
    projects: [
      { name: '博客', kind: 'site', note: '主站' },
      { name: 'Gitea', kind: 'docker' },
    ],
  },
  2: {
    projects: [
      { name: '博客', kind: 'site' },
      { name: 'Alist', kind: 'docker', note: '网盘' },
      { name: '数据库备份', kind: 'cron', note: '每天 04:00' },
    ],
  },
  4: { projects: [{ name: 'Umami', kind: 'docker' }] },
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
    expect(stats(wrapper)).toContain('5 个项目')
    expect(stats(wrapper)).toContain('3 台机器在用')
    expect(stats(wrapper)).toContain('1 台空闲')
    expect(stats(wrapper)).toContain('3 个项目受离线影响')
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
  it("groups a machine's projects by kind and links nowhere outside the theme", async () => {
    const { wrapper } = await mountProjects()
    const [hk, sg] = wrapper.findAll('.pj-machine')
    expect(sg!.findAll('.pj-group-title').map((t) => t.text())).toEqual(['Docker 1', '网站 1', '定时任务 1'])
    expect(hk!.findAll('.pj-group-title').map((t) => t.text())).toEqual(['Docker 1', '网站 1'])
    const [gitea, blog] = hk!.findAll('.pj-item')
    expect(gitea!.find('.pj-text b').text()).toBe('Gitea')
    expect(gitea!.find('.pj-text small').text()).toBe('Docker')
    expect(blog!.element.tagName).toBe('DIV')
    expect(blog!.attributes('title')).toBe('主站')
    expect(blog!.find('.pj-text small').text()).toBe('主站')
    expect(blog!.find('.pj-tile').text()).toBe('博')
    expect(wrapper.find('a[href^="http"]').exists()).toBe(false)
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
    expect(rows).toHaveLength(5)
    expect(wrapper.find('.pj-thead').text()).toContain('类型')
    const blog = rows.find((r) => r.find('.pj-name').text() === '博客')!
    expect(blog.findAll('.pj-host').map((h) => h.text())).toEqual(['HK-01', 'SG-01离线'])
    expect(blog.find('.pj-kind').text()).toBe('网站')
    expect(blog.find('.pj-kind').attributes('data-kind')).toBe('site')
    expect(blog.attributes('data-down')).toBe('true')
    expect(rows.find((r) => r.find('.pj-name').text() === 'Gitea')!.attributes('data-down')).toBe('false')
    await button(wrapper, '按机器').trigger('click')
    await flushPromises()
    expect('view' in router.currentRoute.value.query).toBe(false)
  })
  it('opens straight on the project view from the address', async () => {
    const { wrapper } = await mountProjects('/projects?view=project')
    expect(wrapper.findAll('.pj-row')).toHaveLength(5)
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
    expect(stats(wrapper)).toContain('5 个项目')
  })
  it('says so when nothing matches and clears the filters', async () => {
    const { wrapper, router } = await mountProjects('/projects?q=zzz&kind=docker')
    expect(wrapper.find<HTMLInputElement>('.pj-search input').element.value).toBe('zzz')
    expect(wrapper.find('.empty-state').text()).toContain('没有找到匹配的项目')
    await button(wrapper, '清除筛选').trigger('click')
    await flushPromises()
    expect('q' in router.currentRoute.value.query).toBe(false)
    expect('kind' in router.currentRoute.value.query).toBe(false)
    expect(machines(wrapper)).toEqual(['HK-01', 'SG-01', 'DE-01'])
  })
  it('narrows to one kind through the address, keeps the totals and ignores an unknown kind', async () => {
    const { wrapper, router } = await mountProjects()
    const kinds = () => wrapper.find('[role="group"][aria-label="项目类型"]').findAll('button')
    expect(kinds().map((b) => b.text())).toEqual(['全部', 'Docker', '网站', '定时任务'])
    await kinds()[3]!.trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query.kind).toBe('cron')
    expect(kinds()[3]!.attributes('aria-pressed')).toBe('true')
    expect(machines(wrapper)).toEqual(['SG-01'])
    expect(wrapper.findAll('.pj-item').map((i) => i.find('b').text())).toEqual(['数据库备份'])
    expect(stats(wrapper)).toContain('5 个项目')
    expect(wrapper.find('.pj-idle').exists()).toBe(false)
    await kinds()[0]!.trigger('click')
    await flushPromises()
    expect('kind' in router.currentRoute.value.query).toBe(false)
    wrapper.unmount()
    const odd = await mountProjects('/projects?kind=nope')
    expect(machines(odd.wrapper)).toEqual(['HK-01', 'SG-01', 'DE-01'])
    expect(odd.wrapper.find('[aria-label="项目类型"] button').attributes('aria-pressed')).toBe('true')
  })
  it('narrows to a group', async () => {
    const { wrapper } = await mountProjects()
    await button(wrapper, '欧洲节点').trigger('click')
    await flushPromises()
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
    // Straight to the node settings, where projects are listed.
    const link = owner.wrapper.find('.empty-state').find('a')
    expect(link.text()).toBe('去登记')
    expect(link.attributes('href')).toBe('/settings?tab=node')
  })
  it('says what went wrong, and offers a retry, when the nodes cannot be read', async () => {
    let retry!: ReturnType<typeof vi.spyOn>
    const { wrapper } = await mountProjects('/projects', (s) => {
      s.nodes = []
      s.error = '实时连接中断，正在重试'
      retry = vi.spyOn(s, 'bootstrap').mockResolvedValue()
    })
    const empty = wrapper.find('.empty-state')
    expect(empty.find('h3').text()).toBe('暂时无法获取节点')
    expect(empty.find('p').text()).toBe('实时连接中断，正在重试')
    expect(empty.text()).not.toContain('添加节点')
    await empty.find('button').trigger('click')
    expect(retry).toHaveBeenCalled()
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
