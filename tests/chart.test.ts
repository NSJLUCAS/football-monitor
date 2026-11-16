import { describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import HistoryChart from '../src/components/HistoryChart.vue'
import {
  chartSegments,
  cpuTop,
  despike,
  latencyAxis,
  rateAxis,
  timeTicks,
  windowPeak,
} from '../src/domain/chart'
import { normalizeHistory } from '../src/domain/normalize'

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
    // The line runs to 18 units short of the right edge.
    expect(chart.find('path').attributes('d')).toMatch(/L1182\.00,/)
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

describe('history chart scales', () => {
  const at = (h: number, m = 0, day = 16) => new Date(2026, 10, day, h, m).getTime() / 1000
  it('marks whole hours across six hours and whole days across a week', () => {
    expect(timeTicks(at(4, 9), at(10, 9)).map((t) => t.label)).toEqual([
      '05:00',
      '06:00',
      '07:00',
      '08:00',
      '09:00',
      '10:00',
    ])
    expect(timeTicks(at(10, 9, 9), at(10, 9, 16)).map((t) => t.label)).toEqual([
      '11/10',
      '11/11',
      '11/12',
      '11/13',
      '11/14',
      '11/15',
      '11/16',
    ])
    const hour = timeTicks(at(9, 9), at(10, 9)).map((t) => t.label)
    expect(hour[0]).toBe('09:10')
    expect(hour.length).toBeLessThanOrEqual(7)
  })
  it('tops the CPU axis at the next 15% above the busiest moment, never past 100%', () => {
    expect(cpuTop(42)).toBe(45)
    expect(cpuTop(45)).toBe(45)
    expect(cpuTop(2)).toBe(15)
    expect(cpuTop(97)).toBe(100)
    expect(cpuTop(null)).toBe(15)
  })
  it('spans rates over whole steps of ten, from the slowest to the highest peak', () => {
    const KB = 1024,
      MB = 1024 ** 2
    expect(rateAxis([150 * KB, 7.9 * MB])).toEqual({
      low: 100 * KB,
      high: 10 * MB,
      ticks: [100 * KB, MB, 10 * MB],
    })
    expect(rateAxis([0, 0])).toEqual({ low: KB, high: 10 * KB, ticks: [KB, 10 * KB] })
    // Ends on 1, 2 or 5 of a unit hugging the data, so a 14 MB/s peak does not leave the top tenfold empty.
    expect(rateAxis([0.9 * MB, 14.1 * MB])).toEqual({
      low: 500 * KB,
      high: 20 * MB,
      ticks: [500 * KB, MB, 10 * MB, 20 * MB],
    })
    expect(rateAxis([]).ticks).toEqual([KB, 10 * KB])
  })
  it('reads the window’s peak each way, or nothing from a hub that sends no peak', () => {
    const point = (net_rx_max?: number, net_tx_max?: number) => ({
      ts: 1,
      cpu: 1,
      mem_used: 1,
      disk_used: 1,
      net_rx: 10,
      net_tx: 10,
      ...(net_rx_max === undefined ? {} : { net_rx_max, net_tx_max }),
    })
    expect(windowPeak([point(700, 800), point(900, 300)])).toEqual({ rx: 900, tx: 800 })
    expect(windowPeak([point(), point()])).toBeNull()
  })
  it('keeps the busiest minute Hub reports for each bucket', () => {
    const h = normalizeHistory({
      metrics: [
        { ts: 60, cpu: 1, net_rx: 10, net_tx: 20, net_rx_max: 400, net_tx_max: 300 },
        { ts: 120, net_rx: 1 },
      ],
      ping: [],
    })
    expect(h.metrics[0]).toMatchObject({ net_rx_max: 400, net_tx_max: 300 })
    expect('net_rx_max' in h.metrics[1]!).toBe(false)
  })
})

describe('history charts for resources', () => {
  const MB = 1024 ** 2,
    rate = (v: number) => `${Number((v / MB).toFixed(1))} MB/s`
  const minute = (i: number) => 1_800_000_000 + i * 60
  it('draws rates on a log axis with the band from mean to peak, the peak dashed', () => {
    const chart = mount(HistoryChart, {
      props: {
        title: '网络速率',
        unit: '',
        scale: 'log',
        ticks: [0.1 * MB, MB, 10 * MB],
        format: rate,
        legend: 'top',
        series: [
          { name: '下行', color: '#3b82f6', points: [0, 1, 2].map((i) => ({ ts: minute(i), value: MB })) },
          {
            name: '下行峰值',
            color: '#3b82f6',
            dashed: true,
            legend: false,
            points: [0, 1, 2].map((i) => ({ ts: minute(i), value: 4 * MB })),
          },
        ],
        bands: [
          {
            color: '#999',
            low: [0, 1, 2].map((i) => ({ ts: minute(i), value: MB })),
            high: [0, 1, 2].map((i) => ({ ts: minute(i), value: 4 * MB })),
          },
        ],
      },
    })
    const labels = chart.findAll('.chart-axis-y').map((t) => t.text())
    expect(labels).toEqual(['0.1 MB/s', '1 MB/s', '10 MB/s'])
    // On a log axis 1 MB/s sits halfway between 0.1 and 10.
    const at = (label: string) =>
      Number(
        chart
          .findAll('.chart-axis-y')
          .find((t) => t.text() === label)!
          .attributes('y'),
      )
    expect(Math.abs(at('1 MB/s') - (at('0.1 MB/s') + at('10 MB/s')) / 2)).toBeLessThan(1)
    expect(chart.find('.chart-band').exists()).toBe(true)
    expect(chart.find('path[stroke-dasharray]').exists()).toBe(true)
    // The legend sits beside the title and leaves out the peak line.
    expect(chart.find('.chart-head .chart-legend').text()).toContain('下行')
    expect(chart.find('.chart-head .chart-legend').text()).not.toContain('下行峰值')
  })
  it('fills under a filled line and labels the time axis on whole hours', () => {
    const start = new Date(2026, 10, 16, 4, 9).getTime() / 1000
    const chart = mount(HistoryChart, {
      props: {
        title: 'CPU',
        unit: '%',
        maximum: 45,
        ticks: [0, 15, 30, 45],
        series: [
          {
            name: 'CPU',
            color: '#333',
            fill: true,
            points: Array.from({ length: 7 }, (_, i) => ({ ts: start + i * 3600, value: 20 })),
          },
        ],
      },
    })
    expect(chart.find('.chart-area').exists()).toBe(true)
    expect(chart.findAll('.chart-axis-y').map((t) => t.text())).toEqual(['0%', '15%', '30%', '45%'])
    expect(chart.findAll('.chart-axis-x').map((t) => t.text())).toEqual([
      '05:00',
      '06:00',
      '07:00',
      '08:00',
      '09:00',
      '10:00',
    ])
  })
})

describe('latency history', () => {
  it('fits the latency axis to the data on whole steps, five spaces at most', () => {
    expect(latencyAxis([38, 42]).ticks).toEqual([38, 39, 40, 41, 42])
    expect(latencyAxis([150, 162]).ticks).toEqual([150, 155, 160, 165])
    expect(latencyAxis([12, 180]).ticks).toEqual([0, 50, 100, 150, 200])
    // A flat line still gets an axis with room, and no samples a plain one.
    expect(latencyAxis([40, 40]).ticks).toEqual([40, 41])
    expect(latencyAxis([]).ticks).toEqual([0, 2, 4, 6, 8, 10])
  })
  it('flattens a lone spike with the median of its neighbours and keeps failures as gaps', () => {
    const pts = (values: (number | null)[]) => values.map((value, i) => ({ ts: i * 60, value }))
    const values = (p: { value: number | null }[]) => p.map((x) => x.value)
    expect(values(despike(pts([10, 11, 90, 12, 10])))).toEqual([11, 11.5, 11, 11.5, 12])
    expect(values(despike(pts([90, 10, 10, 10, 10])))).toEqual([10, 10, 10, 10, 10])
    expect(values(despike(pts([10, null, 12])))).toEqual([11, null, 11])
    // Marks on the points survive.
    expect(despike([{ ts: 0, value: 5, mark: '丢包 2.0%' }])[0]!.mark).toBe('丢包 2.0%')
  })
  const minute = (i: number) => 1_800_000_000 + i * 60
  const chart = () =>
    mount(HistoryChart, {
      props: {
        title: 'TCP 延迟历史',
        unit: ' ms',
        ticks: [30, 35, 40, 45],
        series: [
          {
            name: '上海电信',
            color: '#0af',
            points: [
              { ts: minute(0), value: 30 },
              { ts: minute(1), value: 45, mark: '丢包 2.0%' },
              { ts: minute(2), value: null, mark: '丢包 100.0%' },
              { ts: minute(3), value: 40 },
            ],
          },
        ],
      },
      attachTo: document.body,
    })
  it('starts the axis at its first tick instead of zero', () => {
    const c = chart()
    const labels = c.findAll('.chart-axis-y')
    expect(labels.map((t) => t.text())).toEqual(['30 ms', '35 ms', '40 ms', '45 ms'])
    // The first tick sits on the plot's bottom (140 - 27) and the last on its top (11).
    expect(Number(labels[0]!.attributes('y')) - 3).toBe(113)
    expect(Number(labels.at(-1)!.attributes('y')) - 3).toBe(11)
    c.unmount()
  })
  it('marks lossy samples in red, a fully failed one on the floor, and names the loss on hover', async () => {
    const c = chart()
    const marks = c.findAll('.chart-mark')
    expect(marks).toHaveLength(2)
    expect(Number(marks[0]!.attributes('cy'))).toBe(11)
    expect(Number(marks[1]!.attributes('cy'))).toBe(113)
    const svg = c.find('svg')
    svg.element.getBoundingClientRect = () => ({ left: 0, top: 0, width: 480, height: 140 }) as DOMRect
    // Sample 1 of 0..3 lies a third across the plot, between x = 64 and 462.
    await svg.trigger('mousemove', { clientX: 64 + 398 / 3, clientY: 50 })
    expect(c.find('.chart-tip').text()).toContain('丢包 2.0%')
    c.unmount()
  })
  it('shades a band behind the line without counting it as a series', () => {
    const c = mount(HistoryChart, {
      props: {
        title: 'TCP',
        unit: ' ms',
        ticks: [30, 40, 50],
        legend: 'none',
        series: [{ name: 'a', color: '#0af', points: [0, 1].map((i) => ({ ts: minute(i), value: 40 })) }],
        bands: [
          {
            color: '#0af',
            low: [0, 1].map((i) => ({ ts: minute(i), value: 32 })),
            high: [0, 1].map((i) => ({ ts: minute(i), value: 48 })),
          },
        ],
      },
    })
    expect(c.find('.chart-band').attributes('fill')).toBe('#0af')
    expect(c.find('.chart-legend').exists()).toBe(false)
  })
})
