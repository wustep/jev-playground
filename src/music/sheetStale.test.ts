import { describe, expect, it } from 'vitest'
import type { CompositionPlan } from '../plan/schema'
import type { PlanInput, PlanTrace } from '../planner'
import {
  displayedPlanIdentity,
  displayedSheetIsStale,
  notesDisplayIsSettled,
  planInputMatchesDisplayed,
  plannerSelectIsDirty,
  staleSettingsStatus,
} from './sheetStale'
import type { Generated } from './styleCache'

function stubGenerated(
  overrides: {
    planner?: PlanTrace['planner']
    bars?: PlanInput['bars']
    style?: PlanInput['style']
    pick?: PlanInput['pick']
    brief?: boolean
    seed?: number
    noteMode?: Generated['noteMode']
    notePhrases?: Generated['notePhrases']
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
  const plan = { style, defaultInstrument: 'grand_piano', bars: Array.from({ length: bars }, () => ({})) } as unknown as CompositionPlan
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
    noteMode: overrides.noteMode,
    notePhrases: overrides.notePhrases,
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

describe('notesDisplayIsSettled', () => {
  it('treats Debug off and Notes:code as settled even if a prior overlay is cached', () => {
    const generated = stubGenerated({ noteMode: 'guide', notePhrases: [] })
    expect(notesDisplayIsSettled({ notesMode: 'code', debug: true, generated, pendingNotes: false })).toBe(true)
    expect(notesDisplayIsSettled({ notesMode: 'guide', debug: false, generated, pendingNotes: false })).toBe(true)
  })

  it('is unsettled while a guide/line rewrite is in flight or the cache is the other mode', () => {
    const generated = stubGenerated({ noteMode: 'line', notePhrases: [] })
    expect(notesDisplayIsSettled({ notesMode: 'guide', debug: true, generated, pendingNotes: true })).toBe(false)
    expect(notesDisplayIsSettled({ notesMode: 'guide', debug: true, generated, pendingNotes: false })).toBe(false)
    expect(notesDisplayIsSettled({ notesMode: 'line', debug: true, generated: stubGenerated(), pendingNotes: false })).toBe(false)
  })

  it('treats a failed notes pass ([]) as settled for that mode', () => {
    const generated = stubGenerated({ noteMode: 'guide', notePhrases: [] })
    expect(notesDisplayIsSettled({ notesMode: 'guide', debug: true, generated, pendingNotes: false })).toBe(true)
  })
})

describe('displayedSheetIsStale', () => {
  const base = () => {
    const generated = stubGenerated()
    return {
      busy: false,
      pendingStyle: null as string | null,
      pendingNotes: false,
      plannerDirty: false,
      generated,
      input: matchingInput(generated),
      notesMode: 'code' as const,
      debug: false,
    }
  }

  it('matches the dial-tab pending pattern (busy, pendingStyle, await-inflight)', () => {
    expect(displayedSheetIsStale(base())).toBe(false)
    expect(displayedSheetIsStale({ ...base(), busy: true })).toBe(true)
    expect(displayedSheetIsStale({ ...base(), pendingStyle: 'chopin' })).toBe(true)
  })

  it('goes stale when Planner / Notes / Bars / Decide-by / Style brief / Seed disagree', () => {
    const generated = stubGenerated()
    expect(displayedSheetIsStale({ ...base(), plannerDirty: true })).toBe(true)
    expect(displayedSheetIsStale({ ...base(), pendingNotes: true, notesMode: 'guide', debug: true })).toBe(true)
    expect(displayedSheetIsStale({ ...base(), input: { ...generated.input, bars: 64 } })).toBe(true)
    expect(displayedSheetIsStale({ ...base(), input: { ...generated.input, pick: 'argmax' } })).toBe(true)
    expect(displayedSheetIsStale({ ...base(), input: { ...generated.input, brief: false } })).toBe(true)
    expect(displayedSheetIsStale({ ...base(), input: { ...generated.input, seed: 1 } })).toBe(true)
  })

  it('does not stale for Debug alone when the score path stays code', () => {
    expect(displayedSheetIsStale({ ...base(), debug: true, notesMode: 'code' })).toBe(false)
    expect(displayedSheetIsStale({ ...base(), debug: false, notesMode: 'guide' })).toBe(false)
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

describe('displayedPlanIdentity', () => {
  it('changes when the settled plan changes and ignores notes overlays', () => {
    const a = stubGenerated({ noteMode: 'guide', notePhrases: [] })
    const b = { ...a, noteMode: 'line' as const, notePhrases: [] }
    const c = stubGenerated({ seed: 8 })
    expect(displayedPlanIdentity(a)).toBe(displayedPlanIdentity(b))
    expect(displayedPlanIdentity(a)).not.toBe(displayedPlanIdentity(c))
    expect(displayedPlanIdentity(null)).toBeNull()
  })
})

describe('staleSettingsStatus', () => {
  it('tells the user to Generate when controls drifted', () => {
    expect(staleSettingsStatus()).toMatch(/Generate/)
  })
})
