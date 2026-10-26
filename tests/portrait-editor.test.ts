import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import PortraitEditor from '../src/components/PortraitEditor.vue'
import PlayerPortrait from '../src/components/PlayerPortrait.vue'
import { DEFAULT_PORTRAIT } from '../src/domain/config'

describe('portrait editing range', () => {
  it('offers 65–300% zoom and ±60% offsets', () => {
    const wrapper = mount(PortraitEditor, { props: { nodeId: 1, endpoint: '' } })
    const ranges = wrapper
      .findAll('input[type="range"]')
      .map((r) => [r.attributes('min'), r.attributes('max')])
    expect(ranges).toEqual([
      ['0.65', '3'],
      ['-60', '60'],
      ['-60', '60'],
    ])
  })
  it('draws the portrait in a bleed box instead of clipping at the reference frame', () => {
    const plain = mount(PlayerPortrait, { props: { portrait: DEFAULT_PORTRAIT } })
    expect(plain.find('svg').attributes('viewBox')).toBe('-200 -250 1200 1500')
    expect(plain.find('defs rect').attributes()).toMatchObject({ x: '-200', y: '-250', height: '1500' })
    expect(plain.find('image').attributes()).toMatchObject({ x: '0', y: '0', width: '800', height: '1000' })
    const exported = mount(PlayerPortrait, {
      props: { portrait: { ...DEFAULT_PORTRAIT, url: 'https://images.example.org/a.webp', box: 'bleed' } },
    })
    expect(exported.find('image').attributes()).toMatchObject({
      x: '-200',
      y: '-250',
      width: '1200',
      height: '1500',
    })
  })
})
