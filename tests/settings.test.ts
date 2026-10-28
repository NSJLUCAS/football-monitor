import { describe, expect, it, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useMonitorStore } from '../src/stores/monitor'
import { parseConfig } from '../src/domain/config'

describe('settings permission boundary', () => {
  it('clears authenticated data when /me downgrades despite a public HTTP 200 site', async () => {
    setActivePinia(createPinia())
    const fetcher = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(Response.json({ metrics: [], ping: [], probes: {} }))
      .mockResolvedValueOnce(Response.json({ authed: false, public_page: true }))
      .mockResolvedValueOnce(Response.json({}))
    const store = useMonitorStore()
    store.me = { authed: true, site_name: 'x', public_page: true, github: false, history_days: 7 }
    await store.history.get(9, 6)
    expect(store.history.size).toBe(1)
    await store.refreshIdentity(new AbortController().signal)
    expect(store.me.authed).toBe(false)
    expect(store.history.size).toBe(0)
    expect(store.nodes).toEqual([])
    expect(store.closed).toBe(false)
    expect(fetcher).toHaveBeenCalledTimes(3)
  })
  it('refuses anonymous writes without calling any server', async () => {
    setActivePinia(createPinia())
    const fetcher = vi.spyOn(globalThis, 'fetch')
    const store = useMonitorStore()
    await expect(store.save({ values: { motion: false } })).rejects.toThrow(/站长/)
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('clears authenticated nodes, config and history on authorization loss', () => {
    setActivePinia(createPinia())
    const store = useMonitorStore()
    store.me = { authed: true, site_name: 'x', public_page: false, github: false, history_days: 7 }
    store.config = parseConfig({ node_config: '{"version":1,"nodes":{"9":{"template":"black-elite"}}}' })
    store.unauthorized()
    expect(store.me.authed).toBe(false)
    expect(store.nodes).toEqual([])
    expect(store.config.nodes).toEqual({})
    expect(store.closed).toBe(true)
  })
})

describe('TemplatePicker', () => {
  it('renders auto plus every skin, and an extra inherit option for nodes', async () => {
    const { mount } = await import('@vue/test-utils')
    const { default: TemplatePicker } = await import('../src/components/TemplatePicker.vue')
    const global = mount(TemplatePicker, { props: { modelValue: 'auto' } })
    expect(global.findAll('button')).toHaveLength(18)
    expect(global.find('[aria-label="选择自动（按评分）"]').exists()).toBe(true)
    expect(global.find('[aria-label="选择星环"]').exists()).toBe(true)
    expect(global.findAll('img.skin-thumb')).toHaveLength(20)
    const node = mount(TemplatePicker, { props: { inherit: true } })
    expect(node.findAll('button')).toHaveLength(19)
    expect(node.text()).toContain('继承全局卡面')
  })
  it('emits the skin id when a skin is chosen', async () => {
    const { mount } = await import('@vue/test-utils')
    const { default: TemplatePicker } = await import('../src/components/TemplatePicker.vue')
    const wrapper = mount(TemplatePicker, { props: { modelValue: 'auto' } })
    await wrapper.get('[aria-label="选择周黑"]').trigger('click')
    expect(wrapper.emitted('update:modelValue')).toEqual([['weekly-black']])
    await wrapper.get('[aria-label="选择自动（按评分）"]').trigger('click')
    expect(wrapper.emitted('update:modelValue')?.[1]).toEqual(['auto'])
  })
  it('emits undefined when a node goes back to the global skin', async () => {
    const { mount } = await import('@vue/test-utils')
    const { default: TemplatePicker } = await import('../src/components/TemplatePicker.vue')
    const wrapper = mount(TemplatePicker, { props: { modelValue: 'legend', inherit: true } })
    await wrapper.get('.inherit-option').trigger('click')
    expect(wrapper.emitted('update:modelValue')).toEqual([[undefined]])
  })
})

describe('ExchangeRatesField', () => {
  it('emits only well-formed rates and explains malformed ones', async () => {
    const { mount } = await import('@vue/test-utils')
    const { default: ExchangeRatesField } = await import('../src/components/ExchangeRatesField.vue')
    const wrapper = mount(ExchangeRatesField, { props: { modelValue: 'USD=7.10' } })
    await wrapper.find('#exchange-rates').setValue('USD=7.2, JPY=0.05 ')
    expect(wrapper.emitted('update:modelValue')).toEqual([['USD=7.2, JPY=0.05']])
    await wrapper.find('#exchange-rates').setValue('USD=')
    expect(wrapper.emitted('update:modelValue')).toHaveLength(1)
    expect(wrapper.find('.form-error').text()).toContain('币种=汇率')
    await wrapper.setProps({ modelValue: 'EUR=7.8' })
    expect(wrapper.find<HTMLInputElement>('#exchange-rates').element.value).toBe('EUR=7.8')
    expect(wrapper.find('.form-error').exists()).toBe(false)
  })
})
