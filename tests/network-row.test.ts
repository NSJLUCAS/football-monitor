import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import NetworkRow from '../src/components/NetworkRow.vue'
import QualityBar from '../src/components/QualityBar.vue'
import { nodeQuality, qualityBar, type NodeQuality } from '../src/domain/network'
import { normalizeNodes } from '../src/domain/normalize'
import type { HistoryResponse } from '../src/domain/types'

const now = 1_800_000_000
const empty: HistoryResponse = { metrics: [], ping: [], probes: {}, loss: {}, step: 720 }
const [online, offline] = normalizeNodes({
  nodes: [
    { id: 7, name: '北京 BGP', group: '国内', country: 'CN', online: true },
    { id: 8, name: '圣何塞', group: '北美', country: 'US', online: false },
  ],
})
const quality = (patch: Partial<NodeQuality> = {}): NodeQuality => ({
  ...nodeQuality(empty),
  lines: [1, 2],
  latency: 107.4,
  loss: 2.5,
  jitter: 1.74,
  carriers: {
    telecom: { taskId: 1, line: 'CN2 GIA', name: '上海电信', latency: 98, loss: 0.4 },
    unicom: null,
    mobile: null,
  },
  ...patch,
})
async function row(props: Partial<InstanceType<typeof NetworkRow>['$props']> = {}) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:p(.*)*', component: { template: '<div />' } }],
  })
  await router.push('/network')
  return mount(NetworkRow, {
    props: {
      node: online!,
      quality: quality(),
      segments: qualityBar([], 24, now),
      showCarriers: true,
      failed: false,
      now,
      ...props,
    },
    global: { plugins: [router] },
  })
}

describe('network row', () => {
  it('shows overall, carrier and jitter readings', async () => {
    const w = await row()
    expect(w.find('.nr-overall').text()).toContain('107ms')
    expect(w.find('.nr-overall').text()).toContain('2.5%')
    expect(w.find('.nr-jitter').text()).toContain('1.7ms')
    const [telecom, unicom] = w.findAll('.nr-carrier')
    expect(telecom!.attributes('data-carrier')).toBe('telecom')
    expect(telecom!.text()).toContain('98ms')
    expect(telecom!.attributes('title')).toContain('CN2 GIA')
    expect(unicom!.text()).toBe('—')
  })

  it('flags loss at or above 3%', async () => {
    expect(
      (await row({ quality: quality({ loss: 3 }) })).find('.nr-overall small').attributes('data-alert'),
    ).toBeDefined()
    expect(
      (await row({ quality: quality({ loss: 2.9 }) })).find('.nr-overall small').attributes('data-alert'),
    ).toBeUndefined()
  })

  it('writes the last loss time or 无', async () => {
    expect(
      (await row({ quality: quality({ lastLoss: now - 19 * 3600 }) })).find('.nr-last').text(),
    ).toContain('19 小时前')
    const none = (await row()).find('.nr-last').text()
    expect(none).toContain('无')
    expect(none).toContain('统计时段内')
  })

  it('hides the carrier columns when show_carriers is off', async () => {
    expect((await row({ showCarriers: false })).findAll('.nr-carrier')).toHaveLength(0)
  })

  it('marks offline and failed rows', async () => {
    const off = await row({ node: offline!, quality: null, segments: null })
    expect(off.find('.nr-node').text()).toContain('离线')
    expect(off.attributes('data-online')).toBe('false')
    for (const cell of off.findAll('.nr-overall, .nr-carrier, .nr-jitter')) expect(cell.text()).toBe('—')
    expect((await row({ failed: true, quality: null, segments: null })).find('.nr-trend').text()).toContain(
      '加载失败',
    )
  })

  it('reads a node without lines as dashes', async () => {
    const w = await row({ quality: nodeQuality(empty) })
    expect(w.text()).not.toContain('NaN')
    expect(w.find('.nr-overall').text()).toBe('—')
    expect(w.find('.nr-jitter').text()).toBe('—')
    expect(w.find('.nr-last').text()).toBe('—')
  })

  it('shows a plain dash for a line that failed every probe', async () => {
    const w = await row({ quality: quality({ latency: null, loss: 100 }) })
    const latency = w.find('.nr-overall b')
    expect(latency.text()).toBe('—')
    expect(latency.find('em').exists()).toBe(false)
    expect(latency.attributes('style')).toBeUndefined()
    expect(w.find('.nr-overall small').text()).toBe('100.0%')
  })

  it('links to the carriers section', async () => {
    expect((await row()).attributes('href')).toBe('/node/7#carriers')
  })
})

describe('quality bar', () => {
  it('renders 24 cells and a loading state', () => {
    const loading = mount(QualityBar, { props: { segments: null, label: '加载中' } })
    expect(loading.findAll('i')).toHaveLength(24)
    expect(loading.attributes('data-state')).toBe('loading')
    expect(loading.attributes('role')).toBe('img')
    expect(loading.attributes('aria-label')).toBe('加载中')
  })

  it('titles each cell with its time, latency and loss', () => {
    const segments = qualityBar(
      [
        {
          history: { ...empty, ping: [{ task_id: 1, ts: now - 100, latency: 42.4, loss: 1.25 }] },
          taskIds: [1],
        },
      ],
      24,
      now,
    )
    const w = mount(QualityBar, { props: { segments, label: '走势' } })
    expect(w.attributes('data-state')).toBeUndefined()
    const cells = w.findAll('i')
    expect(cells.at(-1)!.attributes('title')).toMatch(/^\d\d:\d\d–\d\d:\d\d · 平均 42 ms · 丢包 1\.3%$/)
    expect(cells[0]!.attributes('title')).toMatch(/ · 无数据$/)
  })
})
