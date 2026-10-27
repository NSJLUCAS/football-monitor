import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { DEFAULT_PORTRAIT, ConfigError, validPortrait } from '../src/domain/config'
import { autoPortrait, builtinPortraits, resolvePortrait } from '../src/domain/portraits'
import PlayerPortrait from '../src/components/PlayerPortrait.vue'
import PortraitEditor from '../src/components/PortraitEditor.vue'

const builtin = (id: string) => builtinPortraits.find((p) => p.id === id)!

describe('built-in portraits', () => {
  it('ships five portraits with a bundled image and a framing preset each', () => {
    expect(builtinPortraits.map((p) => p.id)).toEqual([
      'arsenal',
      'brazil',
      'argentina',
      'france',
      'portugal',
    ])
    for (const p of builtinPortraits) {
      expect(p.src).toMatch(/portraits\/.+\.webp/)
      expect(p.label).toBeTruthy()
      expect(p.preset.scale).toBeGreaterThan(1)
    }
  })
  it('gives nodes without a portrait one of the five in turn by node id', () => {
    expect([1, 2, 3, 4, 5].map(autoPortrait).sort()).toEqual(builtinPortraits.map((p) => p.id).sort())
    expect(autoPortrait(6)).toBe(autoPortrait(1))
  })
})

describe('resolvePortrait', () => {
  it('uses the automatic portrait with its preset when the node chose nothing', () => {
    const r = resolvePortrait(undefined, 'brazil')
    expect(r).toMatchObject({ kind: 'builtin', id: 'brazil', src: builtin('brazil').src })
    expect(r.config).toEqual({ ...DEFAULT_PORTRAIT, ...builtin('brazil').preset })
    // Old framing tweaks made for the neutral figure do not carry over to the automatic portrait.
    expect(resolvePortrait({ ...DEFAULT_PORTRAIT, scale: 0.8 }, 'brazil').config.scale).toBe(
      builtin('brazil').preset.scale,
    )
  })
  it('honours a chosen built-in portrait with the owner’s own framing', () => {
    const chosen = { ...DEFAULT_PORTRAIT, builtin: 'france', scale: 2.2, y: 30 }
    expect(resolvePortrait(chosen, 'brazil')).toMatchObject({ kind: 'builtin', id: 'france', config: chosen })
    expect(resolvePortrait({ ...DEFAULT_PORTRAIT, builtin: 'neutral' }, 'brazil')).toMatchObject({
      kind: 'neutral',
      src: '/athlete.svg',
    })
  })
  it('prefers a local preview, then the bound image', () => {
    const bound = { ...DEFAULT_PORTRAIT, url: 'https://img.example.org/a.webp', builtin: 'france' }
    expect(resolvePortrait(bound, 'brazil')).toMatchObject({ kind: 'custom', src: bound.url })
    expect(resolvePortrait(bound, 'brazil', 'blob:x')).toMatchObject({ kind: 'custom', src: 'blob:x' })
  })
})

describe('portrait config', () => {
  it('keeps known built-in ids and refuses unknown ones when saving', () => {
    expect(validPortrait({ builtin: 'argentina' }).builtin).toBe('argentina')
    expect(validPortrait({ builtin: 'neutral' }).builtin).toBe('neutral')
    expect(validPortrait({ builtin: 'nobody' }).builtin).toBeUndefined()
    expect(() => validPortrait({ builtin: 'nobody' }, true)).toThrow(ConfigError)
  })
})

describe('PlayerPortrait with built-in art', () => {
  it('draws the automatic portrait and falls back to it when a bound image fails', async () => {
    const auto = mount(PlayerPortrait, { props: { fallback: 'portugal' } })
    expect(auto.find('.default-portrait').attributes('href')).toBe(builtin('portugal').src)
    expect(auto.find('.default-portrait').attributes('data-portrait')).toBe('portugal')
    const bound = mount(PlayerPortrait, {
      props: {
        fallback: 'portugal',
        portrait: { ...DEFAULT_PORTRAIT, url: 'https://img.example.org/a.webp' },
      },
    })
    await bound.find('.custom-portrait').trigger('error')
    expect(bound.find('.default-portrait').attributes('data-portrait')).toBe('portugal')
  })
})

describe('PortraitEditor on the automatic portrait', () => {
  it('shows the automatic portrait framing and pins that portrait when adjusted', async () => {
    const id = autoPortrait(3),
      preset = builtin(id).preset
    const wrapper = mount(PortraitEditor, { props: { nodeId: 3, endpoint: '' } })
    expect(wrapper.find<HTMLInputElement>('#portrait-scale').element.value).toBe(String(preset.scale))
    await wrapper.find('#portrait-scale').setValue('2.5')
    expect(wrapper.emitted('update:modelValue')!.at(-1)).toEqual([
      { ...DEFAULT_PORTRAIT, ...preset, scale: 2.5, builtin: id },
      3,
    ])
  })
})

describe('PortraitEditor built-in picker', () => {
  it('offers automatic, the five portraits and the neutral figure', async () => {
    const wrapper = mount(PortraitEditor, { props: { nodeId: 3, endpoint: '' } })
    const options = wrapper.findAll('.builtin-option')
    expect(options.map((o) => o.attributes('data-portrait'))).toEqual([
      'auto',
      'arsenal',
      'brazil',
      'argentina',
      'france',
      'portugal',
      'neutral',
    ])
    expect(wrapper.find('.builtin-option[data-portrait="auto"]').attributes('aria-pressed')).toBe('true')
    await wrapper.find('.builtin-option[data-portrait="france"]').trigger('click')
    expect(wrapper.emitted('update:modelValue')!.at(-1)).toEqual([
      { ...DEFAULT_PORTRAIT, ...builtin('france').preset, builtin: 'france' },
      3,
    ])
    await wrapper.setProps({ modelValue: { ...DEFAULT_PORTRAIT, builtin: 'france' } })
    expect(wrapper.find('.builtin-option[data-portrait="france"]').attributes('aria-pressed')).toBe('true')
    await wrapper.find('.builtin-option[data-portrait="auto"]').trigger('click')
    expect(wrapper.emitted('update:modelValue')!.at(-1)).toEqual([undefined, 3])
  })
})
