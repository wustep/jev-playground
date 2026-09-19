import { describe, expect, it } from 'vitest'
import type { PlanResult } from '../planner'
import {
  formatPlanSeconds,
  generateStatusLatencyMs,
  generatedPlanStatus,
  planHeuristicSample,
  readyPlanStatus,
  restoredPlanStatus,
  stampGenerateLatency,
  stampWallClockLatency,
} from './planTiming'

const stubResult = (latencyMs: number): PlanResult => ({
  plan: { version: 1, style: 'bach', bars: [] } as unknown as PlanResult['plan'],
  trace: { planner: 'heuristic', requests: 0, latencyMs, decisions: [], exchanges: [] },
})

describe('formatPlanSeconds', () => {
  it('keeps Jev-scale times at two decimals', () => {
    expect(formatPlanSeconds(3430)).toBe('3.43')
    expect(formatPlanSeconds(12)).toBe('0.01')
  })

  it('does not collapse a measured stub into 0.00', () => {
    expect(formatPlanSeconds(4)).toBe('0.004')
    expect(formatPlanSeconds(0.4)).toBe('0.0004')
    expect(formatPlanSeconds(0.4)).not.toBe('0.00')
    expect(generatedPlanStatus(16, 4)).toBe('Generated plan and 16 bars in 0.004s')
  })
})

describe('stampWallClockLatency', () => {
  it('keeps a larger planner latency (live Jev) and lifts a 0 stub to the wall clock', () => {
    expect(stampWallClockLatency(stubResult(3430), 0, 12).trace.latencyMs).toBe(3430)
    expect(stampWallClockLatency(stubResult(0), 10, 14.2).trace.latencyMs).toBeCloseTo(4.2)
  })
})

describe('generateStatusLatencyMs', () => {
  it('uses wall-clock seconds for Generate when the planner stamp is a tiny stub', () => {
    expect(generateStatusLatencyMs(3420, 1)).toBe(3420)
    expect(generatedPlanStatus(16, generateStatusLatencyMs(3420, 1))).toBe('Generated plan and 16 bars in 3.42s')
    expect(generatedPlanStatus(16, generateStatusLatencyMs(3420, 1))).not.toBe('Generated plan and 16 bars in 0.001s')
  })

  it('does not copy a previous cache entry’s latency onto a fresh Generate', () => {
    const cachedStub = stubResult(1)
    const fresh = stampGenerateLatency(stubResult(1), 100, 3520)
    expect(fresh.trace.latencyMs).not.toBe(cachedStub.trace.latencyMs)
    expect(fresh.trace.latencyMs).toBe(3420)
    expect(generatedPlanStatus(16, fresh.trace.latencyMs)).toBe('Generated plan and 16 bars in 3.42s')
  })

  it('keeps an honest small wall clock for heuristic-only Generate', () => {
    expect(generateStatusLatencyMs(4.2, 1)).toBeCloseTo(4.2)
    expect(generatedPlanStatus(16, generateStatusLatencyMs(4.2, 1))).toBe('Generated plan and 16 bars in 0.004s')
  })

  it('may raise the status to true network/planner latency, but never a sub-10ms stamp', () => {
    expect(generateStatusLatencyMs(3400, 3430)).toBe(3430)
    expect(generateStatusLatencyMs(3400, 9)).toBe(3400)
  })
})

describe('planHeuristicSample', () => {
  it('records a real non-zero wall-clock duration on the stub trace', async () => {
    const made = await planHeuristicSample({ style: 'bach', bars: 16, pick: 'sample', brief: true, seed: 3 })
    expect(made.trace.planner).toBe('heuristic')
    expect(made.trace.latencyMs).toBeGreaterThan(0)
    expect(formatPlanSeconds(made.trace.latencyMs)).not.toBe('0.00')
    expect(generatedPlanStatus(made.input.bars, made.trace.latencyMs)).toMatch(/^Generated plan and 16 bars in 0\.\d+s$/)
  })

  it('does not surface Generate timing when a stub is only landing from cache', async () => {
    const made = await planHeuristicSample({ style: 'bach', bars: 16, pick: 'sample', brief: true, seed: 3 })
    expect(readyPlanStatus(made.input.bars)).toBe('Ready — 16 bars')
    expect(readyPlanStatus(made.input.bars)).not.toMatch(/Generated|in \d/)
    expect(restoredPlanStatus(made.input.bars)).toBe('Restored plan · 16 bars')
    expect(restoredPlanStatus(made.input.bars)).not.toMatch(/Generated|in \d/)
  })
})

describe('readyPlanStatus / restoredPlanStatus', () => {
  it('uses quiet ready/restored copy with no generate seconds', () => {
    expect(readyPlanStatus(16)).toBe('Ready — 16 bars')
    expect(readyPlanStatus(32)).toBe('Ready — 32 bars')
    expect(readyPlanStatus(64)).toBe('Ready — 64 bars')
    expect(restoredPlanStatus(16)).toBe('Restored plan · 16 bars')
    expect(restoredPlanStatus(8)).toBe('Restored plan · 8 bars')
    expect(readyPlanStatus(16)).not.toContain('Generated')
    expect(restoredPlanStatus(16)).not.toContain('Generated')
    expect(readyPlanStatus(16)).not.toMatch(/in \d/)
    expect(restoredPlanStatus(16)).not.toMatch(/in \d/)
  })
})
