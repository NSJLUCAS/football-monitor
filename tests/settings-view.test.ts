import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import SettingsView from '../src/views/SettingsView.vue'
import { normalizeNodes } from '../src/domain/normalize'
import { useMonitorStore } from '../src/stores/monitor'

const fixtures = () =>
  normalizeNodes({
    nodes: [
      { id: 1, name: 'HK-01', group: '亚洲节点', online: true },
      { id: 4, name: 'DE-01', group: '欧洲节点', online: true },
    ],
  })

async function mountSettings(path = '/settings', nodes = fixtures()) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div class="home-stub" />' } },
      { path: '/settings', component: SettingsView },
    ],
  })
  await router.push(path)
  await router.isReady()
  const store = useMonitorStore()
  store.me = { authed: true, site_name: 'Monitor', public_page: true, github: false, history_days: 7 }
  store.loading = false
  store.nodes = nodes
  vi.spyOn(store, 'loadPing').mockResolvedValue()
  const wrapper = mount(RouterView, { global: { plugins: [router] }, attachTo: document.body })
  await flushPromises()
  return { wrapper, router, store }
}
const heading = (w: ReturnType<typeof mount>) => w.find('.settings-panel-header h2').text()
const category = (w: ReturnType<typeof mount>, label: string) =>
  w.findAll('.settings-sidebar nav button').find((b) => b.text().startsWith(label))!

beforeEach(() => setActivePinia(createPinia()))
enableAutoUnmount(afterEach)
afterEach(() => {
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

describe('settings page', () => {
  it('opens the category named in the address and keeps the choice there', async () => {
    const { wrapper, router } = await mountSettings('/settings?node=4&tab=node')
    expect(heading(wrapper)).toBe('节点设置')
    expect(wrapper.find<HTMLSelectElement>('#node-select').element.value).toBe('4')
    await category(wrapper, '全局设置').trigger('click')
    await flushPromises()
    expect(heading(wrapper)).toBe('全局设置')
    expect(router.currentRoute.value.query).toEqual({ node: '4', tab: 'global' })
    // The first category is the default and stays out of the address; an unknown one falls back to it.
    await category(wrapper, '卡面风格').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query).toEqual({ node: '4' })
    await router.replace({ query: { tab: 'nonsense' } })
    await flushPromises()
    expect(heading(wrapper)).toBe('卡面风格')
  })

  it('keeps the node asked for in the address when the node list arrives after the page', async () => {
    const { wrapper, store } = await mountSettings('/settings?node=4&tab=node', [])
    store.nodes = fixtures()
    await flushPromises()
    expect(wrapper.find<HTMLSelectElement>('#node-select').element.value).toBe('4')
    // A node that is gone falls back to the first one.
    store.nodes = fixtures().slice(0, 1)
    await flushPromises()
    expect(wrapper.find<HTMLSelectElement>('#node-select').element.value).toBe('1')
  })

  it('asks before leaving with unsaved changes, in the app and on closing the tab', async () => {
    const { wrapper, router } = await mountSettings('/settings?tab=global')
    const closing = () => {
      const event = new Event('beforeunload', { cancelable: true })
      window.dispatchEvent(event)
      return event.defaultPrevented
    }
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    // Nothing changed: leaving is free.
    expect(closing()).toBe(false)
    await wrapper.find('#global-layout').setValue('compact')
    expect(closing()).toBe(true)
    await router.push('/')
    await flushPromises()
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(router.currentRoute.value.path).toBe('/settings')
    // Moving between categories stays on the page and asks nothing.
    await category(wrapper, '卡面风格').trigger('click')
    await flushPromises()
    expect(confirm).toHaveBeenCalledTimes(1)
    confirm.mockReturnValue(true)
    await router.push('/')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/')
    expect(closing()).toBe(false)
  })

  it('drops the owner’s own light or dark pick when they change the site default, so they see it', async () => {
    localStorage.setItem('football-monitor:appearance', JSON.stringify({ appearance: 'light', site: 'dark' }))
    const { wrapper } = await mountSettings('/settings?tab=global')
    await wrapper.find('#global-appearance').setValue('system')
    expect(localStorage.getItem('football-monitor:appearance')).toBeNull()
  })

  it('keeps a save bar in reach while there are unsaved changes', async () => {
    const { wrapper, store } = await mountSettings('/settings?tab=global')
    expect(wrapper.find('.settings-dirty-bar').exists()).toBe(false)
    await wrapper.find('#global-layout').setValue('compact')
    const bar = wrapper.find('.settings-dirty-bar')
    expect(bar.text()).toContain('更改尚未保存')
    const save = vi.spyOn(store, 'save').mockResolvedValue(store.config)
    await bar.find('button').trigger('click')
    await flushPromises()
    expect(save).toHaveBeenCalledWith({ values: { layout: 'compact' }, nodes: {} })
    // Saved: the bar says so for a moment instead of vanishing under the reader's eyes.
    expect(wrapper.find('.settings-dirty-bar').text()).toContain('已保存')
  })

  it('names a failed save in the bar and keeps the draft', async () => {
    const { wrapper, store } = await mountSettings('/settings?tab=global')
    await wrapper.find('#global-layout').setValue('compact')
    vi.spyOn(store, 'save').mockRejectedValue(new Error('模拟保存失败'))
    await wrapper.find('.settings-dirty-bar button').trigger('click')
    await flushPromises()
    expect(wrapper.find('.settings-dirty-bar').text()).toContain('模拟保存失败')
    expect(wrapper.find('.settings-dirty-bar').attributes('data-state')).toBe('failed')
  })
})
