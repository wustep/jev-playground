import { describe, expect, it } from 'vitest'
import type { CompositionPlan } from '../plan/schema'
import type { PlanInput, PlanTrace } from '../planner'
import { displayedSheetIsStale, planInputMatchesDisplayed, plannerSelectIsDirty, staleSettingsStatus } from './sheetStale'
import type { Generated } from './styleCache'

function stubGenerated(
  overrides: {
    planner?: PlanTrace['planner']
    bars?: PlanInput['bars']
    style?: PlanInput['style']
    pick?: PlanInput['pick']
    brief?: boolean
    seed?: number
  } = {},
): Generated {
  const bars = overrides.bars ?? 16
  const style = overrides.style ?? 'bach'
  const input: PlanInput = {
    style,
    bars,
    pick: overrides.pick ?? 'sample',
    brief: overrides.brief ?? true,
    seed: overrides.seed ?? 7,
  }
  const plan = { style, bars: Array.from({ length: bars }, () => ({})) } as unknown as CompositionPlan
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

const matchingInput = (generated: Generated): PlanInput => ({ ...generated.input })

describe('planInputMatchesDisplayed', () => {
  it('matches the Generate inputs and fails closed on each field', () => {
    const generated = stubGenerated()
    expect(planInputMatchesDisplayed(generated, matchingInput(generated))).toBe(true)
    expect(planInputMatchesDisplayed(null, matchingInput(generated))).toBe(true)
    expect(planInputMatchesDisplayed(generated, { ...generated.input, bars: 32 })).toBe(false)
    expect(planInputMatchesDisplayed(generated, { ...generated.input, pick: 'argmax' })).toBe(false)
    expect(planInputMatchesDisplayed(generated, { ...generated.input, brief: false })).toBe(false)
    expect(planInputMatchesDisplayed(generated, { ...generated.input, seed: 99 })).toBe(false)
    expect(planInputMatchesDisplayed(generated, { ...generated.input, style: 'chopin' })).toBe(false)
  })
})

describe('displayedSheetIsStale', () => {
  const base = () => {
    const generated = stubGenerated()
    return {
      busy: false,
      pendingStyle: null as string | null,
      plannerDirty: false,
      generated,
      input: matchingInput(generated),
    }
  }

  it('matches the dial-tab pending pattern (busy, pendingStyle, await-inflight)', () => {
    expect(displayedSheetIsStale(base())).toBe(false)
    expect(displayedSheetIsStale({ ...base(), busy: true })).toBe(true)
    expect(displayedSheetIsStale({ ...base(), pendingStyle: 'chopin' })).toBe(true)
  })

  it('goes stale when Planner / Bars / Decide-by / Style brief / Seed disagree', () => {
    const generated = stubGenerated()
    expect(displayedSheetIsStale({ ...base(), plannerDirty: true })).toBe(true)
    expect(displayedSheetIsStale({ ...base(), input: { ...generated.input, bars: 64 } })).toBe(true)
    expect(displayedSheetIsStale({ ...base(), input: { ...generated.input, pick: 'argmax' } })).toBe(true)
    expect(displayedSheetIsStale({ ...base(), input: { ...generated.input, brief: false } })).toBe(true)
    expect(displayedSheetIsStale({ ...base(), input: { ...generated.input, seed: 1 } })).toBe(true)
  })

})

describe('plannerSelectIsDirty', () => {
  it('ignores detectJev / no-key no-ops and flags a real planner swap', () => {
    expect(plannerSelectIsDirty('heuristic', undefined)).toBe(false)
    expect(plannerSelectIsDirty('heuristic', 'heuristic')).toBe(false)
    expect(plannerSelectIsDirty('jev', 'heuristic')).toBe(true)
    expect(plannerSelectIsDirty('heuristic', 'jev')).toBe(true)
  })
})

describe('staleSettingsStatus', () => {
  it('tells the user to Generate when controls drifted', () => {
    expect(staleSettingsStatus()).toMatch(/Generate/)
  })
})
