import { describe, expect, it } from 'vitest'
import type { CompositionPlan } from '../plan/schema'
import type { PlanInput, PlanTrace } from '../planner'
import {
  DIAL_PLANNER,
  autoplayAfterStyleSwitch,
  dialPendingTag,
  displayedPlanUsesJevScore,
  generatePlanner,
  resolveDialPlan,
} from './dialPolicy'
import type { Generated } from './styleCache'

function stubGenerated(overrides: { planner?: PlanTrace['planner']; bars?: PlanInput['bars']; style?: PlanInput['style'] } = {}): Generated {
  const bars = overrides.bars ?? 16
  const style = overrides.style ?? 'bach'
  const input: PlanInput = { style, bars, pick: 'sample', brief: true, seed: 7 }
  const plan = { style, defaultInstrument: 'grand_piano', bars: [] } as unknown as CompositionPlan
  return {
    plan,
    input,
    notice: null,
    trace: {
      planner: overrides.planner ?? 'heuristic',
      requests: 0,
      latencyMs: 12,
      decisions: [],
      exchanges: [],
    },
  }
}

describe('resolveDialPlan', () => {
  it('never prefers Jev over a stub cache hit that matches bars', () => {
    const cached = stubGenerated({ planner: 'heuristic' })
    expect(resolveDialPlan({ cached, inflight: undefined, bars: 16 })).toEqual({ kind: 'use-cache', cached })
  })

  it('keeps a prior Generate cache hit for that style', () => {
    const cached = stubGenerated({ planner: 'jev', style: 'chopin' })
    expect(resolveDialPlan({ cached, inflight: undefined, bars: 16 })).toEqual({ kind: 'use-cache', cached })
  })

  it('plans with the heuristic on a bars mismatch, even if Jev is selected', () => {
    const cached = stubGenerated({ planner: 'jev', bars: 16 })
    expect(resolveDialPlan({ cached, inflight: undefined, bars: 32 })).toEqual({ kind: 'plan-heuristic' })
    expect(DIAL_PLANNER).toBe('heuristic')
  })

  it('plans with the heuristic on a total miss', () => {
    expect(resolveDialPlan({ cached: undefined, inflight: undefined, bars: 16 })).toEqual({ kind: 'plan-heuristic' })
  })

  it('waits on in-flight work instead of starting a new plan', () => {
    const inflight = Promise.resolve(stubGenerated())
    expect(resolveDialPlan({ cached: undefined, inflight, bars: 16 })).toEqual({ kind: 'await-inflight', inflight })
  })
})

describe('generatePlanner', () => {
  it('uses live Jev only when Generate chose it and a planner is available', () => {
    expect(generatePlanner('jev', true)).toBe('jev')
    expect(generatePlanner('jev', false)).toBe('heuristic')
    expect(generatePlanner('heuristic', true)).toBe('heuristic')
  })
})

describe('displayedPlanUsesJevScore', () => {
  it('does not start a Jev score just because the planner picker is set to Jev', () => {
    expect(displayedPlanUsesJevScore('heuristic')).toBe(false)
    expect(displayedPlanUsesJevScore('jev')).toBe(true)
  })
})

describe('dialPendingTag', () => {
  it('says planning… for dial-driven work and asking Jev… only when Generate is talking to Jev', () => {
    expect(dialPendingTag(false, 0.4)).toBe('planning…')
    expect(dialPendingTag(true, 0.4)).toBe('asking Jev… 40%')
  })
})

describe('autoplayAfterStyleSwitch', () => {
  it('restarts playback only when the previous style was already playing', () => {
    expect(autoplayAfterStyleSwitch(true)).toBe(true)
    expect(autoplayAfterStyleSwitch(false)).toBe(false)
  })
})
