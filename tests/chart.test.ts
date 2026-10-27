import { describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import HistoryChart from '../src/components/HistoryChart.vue'
import { chartSegments } from '../src/domain/chart'

describe('small accessible SVG charts', () => {
  it('never presents an entirely failed probe as zero latency', () => {
    const chart = mount(HistoryChart, {
      props: {
        title: 'TCP',
        unit: 'ms',
        series: [
          { name: 'failed', color: '#f00', points: [{ ts: 60, value: null }] },
          { name: 'ok', color: '#0f0', points: [{ ts: 60, value: 5 }] },
        ],
      },
    })
    expect(chart.text()).toContain('failed · —')
    expect(chart.text()).not.toContain('failed · 0ms')
  })
  it('shows every series at the hovered time in a tooltip', async () => {
    const chart = mount(HistoryChart, {
      props: {
        title: 'TCP',
        unit: 'ms',
        series: [
          {
            name: '广东移动',
            color: '#0af',
            points: [
              { ts: 1000, value: 150 },
              { ts: 1060, value: 170.4 },
            ],
          },
          {
            name: '广东联通',
            color: '#f55',
            points: [
              { ts: 1000, value: 160 },
              { ts: 1060, value: null },
            ],
          },
        ],
      },
      attachTo: document.body,
    })
    const svg = chart.find('svg')
    svg.element.getBoundingClientRect = () => ({ left: 0, top: 0, width: 480, height: 140 }) as DOMRect
    // The right edge of the plot (x = 462) is the latest sample.
    await svg.trigger('mousemove', { clientX: 462, clientY: 50 })
    const tip = chart.find('.chart-tip')
    expect(tip.exists()).toBe(true)
    expect(tip.text()).toContain('广东移动')
    expect(tip.text()).toContain('170.4ms')
    expect(tip.text()).toContain('广东联通')
    expect(tip.text()).toContain('—')
    expect(chart.findAll('.chart-hover-dot')).toHaveLength(1)
    await svg.trigger('mouseleave')
    expect(chart.find('.chart-tip').exists()).toBe(false)
    chart.unmount()
  })
  it('draws at the width of its panel and the requested height, so a wide panel is filled', async () => {
    let resize: (entries: { contentRect: { width: number } }[]) => void = () => {}
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: typeof resize) {
          resize = callback
        }
        observe() {}
        disconnect() {}
      },
    )
    // The plot appears only once history has loaded, after the chart itself has mounted.
    const chart = mount(HistoryChart, {
      props: { title: 'TCP', unit: 'ms', height: 200, series: [] },
      attachTo: document.body,
    })
    await chart.setProps({
      series: [
        {
          name: '广东移动',
          color: '#0af',
          points: [
            { ts: 1000, value: 150 },
            { ts: 1060, value: 170 },
          ],
        },
      ],
    })
    resize([{ contentRect: { width: 1200 } }])
    await nextTick()
    const svg = chart.find('svg')
    expect(svg.attributes('viewBox')).toBe('0 0 1200 200')
    expect(svg.attributes('style')).toContain('height: 200px')
    // The line runs to 18 units short of the right edge, where the latest time is labelled.
    expect(chart.find('path').attributes('d')).toMatch(/L1182\.00,/)
    expect(chart.findAll('text').at(-1)!.attributes('x')).toBe('1182')
    // One unit is one pixel: the tooltip sits right under the pointer.
    svg.element.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1200, height: 200 }) as DOMRect
    await svg.trigger('mousemove', { clientX: 1182, clientY: 50 })
    expect(chart.find('.chart-tip').attributes('style')).toContain('left: 1182px')
    chart.unmount()
    vi.unstubAllGlobals()
  })
  it('does not join null values or offline gaps', () => {
    expect(
      chartSegments(
        [
          { ts: 60, value: 0 },
          { ts: 120, value: null },
          { ts: 180, value: 12 },
          { ts: 600, value: 15 },
        ],
        60,
      ),
    ).toHaveLength(3)
  })
  it('exposes values and timestamps, renders zero and empty states', () => {
    const chart = mount(HistoryChart, {
      props: {
        title: 'CPU',
        series: [
          {
            name: 'CPU',
            color: '#fff',
            points: [
              { ts: 1760000000, value: 0 },
              { ts: 1760000060, value: 25 },
            ],
          },
        ],
        unit: '%',
      },
    })
    expect(chart.find('svg[role="img"]').exists()).toBe(true)
    expect(chart.text()).toContain('25')
    expect(chart.find('details').exists()).toBe(true)
    chart.unmount()
    expect(mount(HistoryChart, { props: { title: '空', series: [], unit: '' } }).text()).toContain(
      '暂无历史数据',
    )
  })
})
