import { describe, expect, it } from 'vitest'
import type { PlanResult } from '../planner'
import { formatPlanSeconds, generatedPlanStatus, planHeuristicSample, stampWallClockLatency } from './planTiming'

const stubResult = (latencyMs: number): PlanResult => ({
  plan: { version: 1, style: 'bach', bars: [] } as PlanResult['plan'],
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

describe('planHeuristicSample', () => {
  it('records a real non-zero wall-clock duration on the stub trace', async () => {
    const made = await planHeuristicSample({ style: 'bach', bars: 16, pick: 'sample', brief: true, seed: 3 })
    expect(made.trace.planner).toBe('heuristic')
    expect(made.trace.latencyMs).toBeGreaterThan(0)
    expect(formatPlanSeconds(made.trace.latencyMs)).not.toBe('0.00')
    expect(generatedPlanStatus(made.input.bars, made.trace.latencyMs)).toMatch(/^Generated plan and 16 bars in 0\.\d+s$/)
  })
})
