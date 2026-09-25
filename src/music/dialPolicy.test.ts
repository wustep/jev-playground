import { describe, expect, it } from 'vitest'
import type { CompositionPlan } from '../plan/schema'
import { heuristicPlanner, type PlanInput, type PlanTrace, type ScoreResult } from '../planner'
import { STYLE_IDS } from '../plan/schema'
import {
  DIAL_PLANNER,
  autoplayAfterStyleSwitch,
  dialPendingTag,
  displayedPlanUsesJevScore,
  generatePlanner,
  resolveDialPlan,
  resolveMatchScore,
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

describe('resolveMatchScore', () => {
  const idle = { edited: false, busy: false, jevCanScore: true }

  it('scores a dial/boot stub plan with the heuristic (stub score), without Best', () => {
    expect(resolveMatchScore({ ...idle, generated: stubGenerated({ planner: 'heuristic' }) })).toEqual({ kind: 'score', scorer: 'heuristic' })
  })

  it('scores a Jev plan with Jev when Jev can score', () => {
    const generated = stubGenerated({ planner: 'jev' })
    expect(resolveMatchScore({ ...idle, generated })).toEqual({ kind: 'score', scorer: 'jev' })
    expect(resolveMatchScore({ ...idle, generated, jevCanScore: false })).toEqual({ kind: 'score', scorer: 'heuristic' })
  })

  it('waits while a plan or Best-of is in flight', () => {
    expect(resolveMatchScore({ ...idle, busy: true, generated: stubGenerated() })).toEqual({ kind: 'wait' })
    expect(resolveMatchScore({ ...idle, generated: null })).toEqual({ kind: 'wait' })
  })

  it('reuses scores carried by a (cached) Best-of winner, but rescores an edited plan', () => {
    const matches: ScoreResult = { scores: { bach: { match: 'high', confidence: 0.9 } } as ScoreResult['scores'], exchanges: [] }
    const generated = { ...stubGenerated(), matches }
    expect(resolveMatchScore({ ...idle, generated })).toEqual({ kind: 'reuse', matches })
    expect(resolveMatchScore({ ...idle, generated, edited: true })).toEqual({ kind: 'score', scorer: 'heuristic' })
  })

  it('stub score fills every style card for a real heuristic plan', async () => {
    const input: PlanInput = { style: 'bach', bars: 16, pick: 'sample', brief: true, seed: 11 }
    const result = await heuristicPlanner.plan(input)
    const action = resolveMatchScore({ ...idle, generated: { ...result, input, notice: null } })
    expect(action).toEqual({ kind: 'score', scorer: 'heuristic' })
    const { scores } = await heuristicPlanner.score!(result.plan, STYLE_IDS)
    for (const id of STYLE_IDS) expect(['low', 'medium', 'high']).toContain(scores[id]?.match)
  })
})
