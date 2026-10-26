import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import ProviderPicker from '../src/components/ProviderPicker.vue'
import { providers } from '../src/domain/providers'

const picker = (props: Record<string, unknown> = {}) =>
  mount(ProviderPicker, { props: { modelValue: undefined, nodeId: 4, endpoint: '', ...props } })
const last = (wrapper: ReturnType<typeof picker>) => wrapper.emitted('update:modelValue')!.at(-1)

describe('provider picker', () => {
  it('offers none, every provider and a custom entry', async () => {
    const wrapper = picker()
    const options = wrapper.findAll('#provider-select option').map((o) => o.attributes('value'))
    expect(options).toEqual(['', ...providers.map((p) => p.id), 'custom'])
    await wrapper.find('#provider-select').setValue('vultr')
    expect(last(wrapper)).toEqual([{ id: 'vultr' }])
    await wrapper.find('#provider-select').setValue('')
    expect(last(wrapper)).toEqual([undefined])
  })
  it('edits a custom provider name and only accepts public HTTPS logos', async () => {
    const wrapper = picker({ modelValue: { id: 'custom', name: '小鸡云' } })
    await wrapper.find('#provider-name').setValue('小鸡云 Pro')
    expect(last(wrapper)).toEqual([{ id: 'custom', name: '小鸡云 Pro' }])
    const count = wrapper.emitted('update:modelValue')!.length
    await wrapper.find('#provider-logo').setValue('http://10.0.0.1/logo.png')
    expect(wrapper.find('.form-error').text()).toContain('HTTPS')
    expect(wrapper.emitted('update:modelValue')!.length).toBe(count)
    await wrapper.find('#provider-logo').setValue('https://img.example.org/logo.png')
    expect(last(wrapper)).toEqual([
      { id: 'custom', name: '小鸡云', logo: 'https://img.example.org/logo.png' },
    ])
  })
  it('uploads a custom logo through the configured upload service', async () => {
    expect(
      picker({ modelValue: { id: 'custom' } })
        .find('#provider-upload')
        .exists(),
    ).toBe(false)
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ url: 'https://img.example.org/nodes/4/x.png' }), { status: 200 }),
      )
    vi.stubGlobal('fetch', fetcher)
    const wrapper = picker({
      modelValue: { id: 'custom', name: 'X' },
      endpoint: 'https://up.example.org/upload',
    })
    const png = readFileSync('tests/fixtures/athlete.png')
    const input = wrapper.find<HTMLInputElement>('#provider-upload')
    const file = new File([png], 'logo.png', { type: 'image/png' })
    // jsdom's File lacks arrayBuffer(); browsers provide it.
    Object.defineProperty(file, 'arrayBuffer', { value: async () => new Uint8Array(png).buffer })
    Object.defineProperty(input.element, 'files', { value: [file] })
    await input.trigger('change')
    await flushPromises()
    vi.unstubAllGlobals()
    expect(fetcher).toHaveBeenCalledOnce()
    expect(fetcher.mock.calls[0]![1]).toMatchObject({ method: 'POST', headers: { 'x-node-id': '4' } })
    expect(last(wrapper)).toEqual([
      { id: 'custom', name: 'X', logo: 'https://img.example.org/nodes/4/x.png' },
    ])
  })
})
