import { describe, expect, it } from 'vitest'
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
