import { describe, expect, it } from 'vitest'
import { levelColor } from '../src/domain/carriers'
import { probeSummary } from '../src/domain/score'
import {
  lineIds,
  nodeQuality,
  qualityBar,
  sinceText,
  sortNodes,
  type NodeQuality,
} from '../src/domain/network'
import { normalizeNodes } from '../src/domain/normalize'
import type { HistoryResponse, PingPoint } from '../src/domain/types'

const ping = (task_id: number, ts: number, latency: number | null, loss?: number): PingPoint =>
  loss === undefined ? { task_id, ts, latency } : { task_id, ts, latency, loss }
const hist = (ping: PingPoint[], loss: Record<string, number> = {}): HistoryResponse => ({
  metrics: [],
  ping,
  probes: Object.fromEntries([...new Set(ping.map((p) => p.task_id))].map((id) => [id, `任务 ${id}`])),
  loss,
  step: 720,
})
const HOUR = 3600

describe('qualityBar', () => {
  it('aligns 24 segments to the fixed window', () => {
    const bar = qualityBar([{ history: hist([ping(1, 100, 40)]), taskIds: [1] }], 24, 24 * HOUR)
    expect(bar).toHaveLength(24)
    expect(bar[0]!.from).toBe(0)
    expect(bar[23]!.to).toBe(24 * HOUR)
    expect(bar[0]!.latency).toBe(40)
    expect(bar[5]).toMatchObject({ latency: null, loss: null, color: levelColor(null) })
  })

  it('colours each segment by the worse grade', () => {
    const bar = qualityBar(
      [
        {
          history: hist([ping(1, 100, 50, 5), ping(1, HOUR + 100, 250), ping(1, 2 * HOUR + 100, 40)]),
          taskIds: [1],
        },
      ],
      24,
      24 * HOUR,
    )
    expect(bar[0]!.color).toBe(levelColor(3))
    expect(bar[1]!.color).toBe(levelColor(3))
    expect(bar[2]!.color).toBe(levelColor(0))
  })

  it('counts failed probes as full loss and a missing loss as none', () => {
    const [first] = qualityBar(
      [{ history: hist([ping(1, 100, null), ping(1, 200, 30)]), taskIds: [1] }],
      24,
      24 * HOUR,
    )
    expect(first).toMatchObject({ latency: 30, loss: 50 })
  })

  it('drops points outside the window and other tasks', () => {
    const [first] = qualityBar(
      [{ history: hist([ping(1, -50, 999), ping(2, 100, 999), ping(1, 100, 20)]), taskIds: [1] }],
      24,
      24 * HOUR,
    )
    expect(first!.latency).toBe(20)
  })

  it('merges several sources for the site bar', () => {
    const [first] = qualityBar(
      [
        { history: hist([ping(1, 100, 100)]), taskIds: [1] },
        { history: hist([ping(5, 100, 200)]), taskIds: [5] },
      ],
      24,
      24 * HOUR,
    )
    expect(first!.latency).toBe(150)
  })
})

describe('nodeQuality', () => {
  const four = hist([ping(4, 10, 40), ping(1, 10, 10), ping(2, 10, 20), ping(3, 10, 30)])

  it('averages every line, not the first three', () => {
    const q = nodeQuality(four)
    expect(q.lines).toEqual([1, 2, 3, 4])
    expect(lineIds(four)).toEqual([1, 2, 3, 4])
    expect(q.latency).toBe(25)
  })

  it('reads carriers from the node config', () => {
    const h = hist([ping(11, 10, 98), ping(11, 20, 100), ping(12, 10, 50)], { '11': 0.4 })
    const q = nodeQuality(h, { carriers: { telecom: { taskId: 11, line: 'CN2 GIA' } } })
    expect(q.carriers.telecom).toEqual({
      taskId: 11,
      line: 'CN2 GIA',
      name: '任务 11',
      latency: probeSummary(11, h).latency,
      loss: 0.4,
    })
    expect(q.carriers.unicom).toBeNull()
    expect(q.carriers.mobile).toBeNull()
  })

  it('reads a configured task missing from the window as null', () => {
    const q = nodeQuality(four, { carriers: { telecom: { taskId: 99, line: 'CN2 GIA' } } })
    expect(q.carriers.telecom).toBeNull()
  })

  it('gives a node without probe points no lines', () => {
    expect(nodeQuality(hist([]))).toEqual({
      lines: [],
      latency: null,
      loss: null,
      jitter: null,
      carriers: { telecom: null, unicom: null, mobile: null },
      lossyLines: 0,
      lastLoss: null,
    })
  })

  it('takes jitter from the shared probe summary', () => {
    const h = hist([ping(1, 10, 10), ping(1, 20, 14), ping(2, 10, 50), ping(2, 20, 52)])
    expect(nodeQuality(h).jitter).toBe(3)
  })

  it('counts lines at or above 3% loss', () => {
    const q = nodeQuality(four, { carriers: {} })
    expect(q.lossyLines).toBe(0)
    expect(nodeQuality({ ...four, loss: { '1': 3, '2': 2.9 } }).lossyLines).toBe(1)
  })

  it('finds the newest point at or above 3% loss', () => {
    expect(nodeQuality(hist([ping(1, 100, 40, 5), ping(1, 200, 40, 2), ping(2, 300, 40, 3)])).lastLoss).toBe(
      300,
    )
    expect(nodeQuality(hist([ping(1, 100, 40, 2.9), ping(1, 200, 40)])).lastLoss).toBeNull()
    expect(nodeQuality(hist([ping(1, 100, 40), ping(1, 200, null)])).lastLoss).toBe(200)
  })
})

describe('sinceText', () => {
  const now = Date.UTC(2026, 10, 3, 12) / 1000
  const hm = (ts: number) => {
    const d = new Date(ts * 1000)
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }
  const md = (ts: number) => {
    const d = new Date(ts * 1000)
    return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }
  it('writes minutes, hours or days ago with the start time', () => {
    const minutes = now - 30 * 60,
      hours = now - 19 * HOUR,
      days = now - 3 * 86400
    expect(sinceText(minutes, now)).toEqual(['30 分钟前', `${hm(minutes)} 起`])
    expect(sinceText(hours, now)).toEqual(['19 小时前', `${hm(hours)} 起`])
    expect(sinceText(days, now)).toEqual(['3 天前', `${md(days)} ${hm(days)} 起`])
    expect(sinceText(now - 10, now)[0]).toBe('刚刚')
  })
})

describe('sortNodes', () => {
  const quality = (latency: number | null, loss: number | null, jitter: number | null): NodeQuality => ({
    ...nodeQuality(hist([])),
    latency,
    loss,
    jitter,
  })
  const nodes = normalizeNodes({
    nodes: [
      { id: 1, name: '香港', online: true },
      { id: 2, name: '东京', online: true },
      { id: 3, name: '离线机', online: false },
      { id: 4, name: '阿姆', online: true },
      { id: 5, name: '巴黎', online: true },
    ],
  })
  const rows = [
    { node: nodes[0]!, quality: quality(80, 1, 3) },
    { node: nodes[1]!, quality: quality(40, 2, 1) },
    { node: nodes[2]!, quality: null },
    { node: nodes[3]!, quality: quality(null, null, null) },
    { node: nodes[4]!, quality: quality(40, 0.5, 2) },
  ]
  const names = (key: Parameters<typeof sortNodes>[1]) => sortNodes(rows, key).map((r) => r.node.name)

  it('keeps Hub order with offline nodes last', () => {
    expect(names('hub')).toEqual(['香港', '东京', '阿姆', '巴黎', '离线机'])
  })

  it('sorts ascending, missing values after, ties by name, offline last', () => {
    expect(names('latency')).toEqual(['巴黎', '东京', '香港', '阿姆', '离线机'])
    expect(names('loss')).toEqual(['巴黎', '香港', '东京', '阿姆', '离线机'])
    expect(names('jitter')).toEqual(['东京', '巴黎', '香港', '阿姆', '离线机'])
  })
})
