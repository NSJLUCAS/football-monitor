import { describe, expect, it } from 'vitest'
import {
  carrierFromName,
  latencyColor,
  lineSkills,
  lossColor,
  lossGrade,
  probeBars,
  probeRegion,
  taskLoss,
} from '../src/domain/carriers'
import type { HistoryResponse } from '../src/domain/types'

describe('line skills', () => {
  it('keeps named lines in carrier order, drops unknown/ordinary lines and repeats', () => {
    expect(
      lineSkills({
        carriers: {
          mobile: { line: 'CMIN2' },
          telecom: { line: 'CN2 GIA' },
          unicom: { line: 'CN2 GIA' },
        },
      }).map((s) => [s.carrier, s.line]),
    ).toEqual([
      ['telecom', 'CN2 GIA'],
      ['mobile', 'CMIN2'],
    ])
    expect(
      lineSkills({ carriers: { telecom: { line: '普通线路' }, unicom: { line: ' ' }, mobile: {} } }),
    ).toEqual([])
    expect(lineSkills(undefined)).toEqual([])
  })
  it('recognises the carrier a Hub probe is named after', () => {
    expect(carrierFromName('广东移动')).toBe('mobile')
    expect(carrierFromName('广东联通-V6')).toBe('unicom')
    expect(carrierFromName('上海电信 TCP 目标')).toBe('telecom')
    expect(carrierFromName('China Mobile ping')).toBe('mobile')
    expect(carrierFromName('北京 TCP 目标')).toBeUndefined()
    expect(carrierFromName(undefined)).toBeUndefined()
  })
  it('takes the first word of a Hub probe name as its region', () => {
    expect(probeRegion('上海 TCP 目标')).toBe('上海')
    expect(probeRegion('  Tokyo-CN2 ping ')).toBe('Tokyo-CN2')
    expect(probeRegion('')).toBe('')
    expect(probeRegion(undefined)).toBe('')
  })
  it('summarises the shown probes into ten latency and loss segments', () => {
    const history: HistoryResponse = {
      metrics: [],
      // 20 minutes of two probes; the last 2 minutes of task 1 fail.
      ping: Array.from({ length: 20 }, (_, i) => [
        { task_id: 1, ts: 1000 + i * 60, latency: i >= 18 ? null : 40 },
        { task_id: 2, ts: 1000 + i * 60, latency: 60, ...(i === 5 ? { loss: 20 } : {}) },
        { task_id: 9, ts: 1000 + i * 60, latency: 999 },
      ]).flat(),
      probes: { '1': 'a', '2': 'b', '9': 'c' },
      loss: { '1': 10, '2': 1 },
      step: 60,
    }
    const bars = probeBars(history, [1, 2], 1000 + 19 * 60)
    expect(bars.latency).toHaveLength(10)
    expect(bars.loss).toHaveLength(10)
    expect(bars.latency[0]).toBe(50)
    expect(bars.latency[9]).toBe(60)
    expect(bars.loss[0]).toBe(0)
    expect(bars.loss[2]).toBe(5)
    expect(bars.loss[9]).toBe(50)
    expect(bars.currentLatency).toBe(60)
    expect(bars.windowLoss).toBe(5.5)
    const empty = probeBars(undefined, [1])
    expect(empty.latency).toEqual(Array(10).fill(null))
    expect(empty.currentLatency).toBeNull()
    expect(empty.windowLoss).toBeNull()
  })
  it('grades latency and loss segments from green to red, grey without data', () => {
    expect([30, 100, 150, 250, 400, null].map(latencyColor)).toEqual([
      '#4ade80',
      '#a3e635',
      '#facc15',
      '#fb923c',
      '#f87171',
      'var(--strip-empty-seg)',
    ])
    expect([0, 0.5, 2, 5, 20, null].map(lossColor)).toEqual([
      '#4ade80',
      '#a3e635',
      '#facc15',
      '#fb923c',
      '#f87171',
      'var(--strip-empty-seg)',
    ])
    expect([0, 0.5, 2, 5, 20].map(lossGrade)).toEqual(['无丢包', '极少', '轻微', '偏高', '严重'])
  })
  it('reads a task’s window loss, treating a loss Hub left out as 0% when samples exist', () => {
    const history: HistoryResponse = {
      metrics: [],
      ping: [
        { task_id: 1, ts: 1000, latency: 40 },
        { task_id: 2, ts: 1000, latency: 40 },
        { task_id: 2, ts: 1060, latency: 40 },
        { task_id: 3, ts: 1000, latency: 40 },
        { task_id: 3, ts: 1060, latency: null },
      ],
      probes: {},
      loss: { '1': 5 },
      step: 60,
    }
    expect(taskLoss(history, 1)).toBe(5)
    expect(taskLoss(history, 2)).toBe(0)
    expect(taskLoss(history, 3)).toBe(50)
    expect(taskLoss(history, 4)).toBeNull()
    expect(taskLoss(undefined, 1)).toBeNull()
  })
})
