import { describe, expect, it } from 'vitest'
import { formRoles } from '../plan/forms'
import type { ChordId, CompositionPlan, ContourId } from '../plan/schema'
import { arrangementLevels, figureStep } from './arrangement'
import { midiOf } from './pitch'
import { renderPlan } from './renderPlan'

const CONTOURS: ContourId[] = ['arch', 'leap_fall', 'wave', 'rise']
const PERIOD: ChordId[] = ['I', 'vi', 'ii6', 'V', 'I', 'vi', 'ii6', 'I', 'IV', 'ii', 'V7_of_V', 'V', 'I', 'vi', 'V7', 'I']

function periodPlan(overrides: Partial<CompositionPlan> = {}): CompositionPlan {
  const roles = formRoles('period', 16)
  return {
    version: 1,
    style: 'beethoven',
    character: 'lyrical_song',
    form: 'period',
    key: 'C_major',
    meter: 'four_four',
    texture: 'alberti_melody',
    palette: 'diatonic',
    tempo: 'adagio',
    dynamics: 'p',
    dynamicShape: 'steady',
    defaultInstrument: 'grand_piano',
    arrangement: 'lift_on_return',
    bars: PERIOD.map((chord, i) => ({ chord, role: roles[i], contour: CONTOURS[i % 4] })),
    ...overrides,
  }
}

const onsets = (score: ReturnType<typeof renderPlan>, index: number) =>
  [...score.bars[index].treble, ...score.bars[index].bass].reduce((n, voice) => n + voice.length, 0)

describe('arrangementLevels', () => {
  it('lifts a returning phrase above its first statement', () => {
    const levels = arrangementLevels(periodPlan())
    // First A is simple; both consequents (same material, later slots) are full.
    expect(levels[0]).toBeLessThan(levels[4])
    expect(levels[12]).toBeGreaterThanOrEqual(2)
    expect(Math.max(...levels)).toBe(3)
  })

  it('builds, then strips a peak_then_bare piece', () => {
    const levels = arrangementLevels(periodPlan({ arrangement: 'peak_then_bare' }))
    expect(levels[0]).toBeLessThanOrEqual(1)
    expect(Math.max(...levels.slice(0, 12))).toBeGreaterThanOrEqual(2)
    expect(levels[15]).toBe(0)
  })

  it('keeps a constant arrangement flat except for role inflections', () => {
    const levels = arrangementLevels(periodPlan({ arrangement: 'constant' }))
    expect(new Set(levels.filter((_, i) => periodPlan().bars[i].role !== 'climax' && periodPlan().bars[i].role !== 'echo')).size).toBeLessThanOrEqual(2)
  })
})

describe('figureStep', () => {
  it('halves, keeps, or doubles the written step', () => {
    expect(figureStep({ arrangement: 0 }, 2)).toBe(4)
    expect(figureStep({ arrangement: 2 }, 2)).toBe(2)
    expect(figureStep({ arrangement: 3 }, 2)).toBe(1)
  })
})

describe('a lifted return', () => {
  it('keeps the sung line and adds an octave voice when the theme comes back', () => {
    const score = renderPlan(periodPlan(), 3)
    const first = score.bars[0]
    const back = score.bars[4]
    expect(first.treble[0].map((n) => n.pitches[n.pitches.length - 1])).toEqual(back.treble[0].map((n) => n.pitches[n.pitches.length - 1]))
    expect(back.treble.length).toBeGreaterThan(first.treble.length)
    const extra = back.treble[1][0]
    const sung = back.treble[0][0]
    expect(midiOf(extra.pitches.at(-1)!) - midiOf(sung.pitches.at(-1)!)).toBe(12)
    expect(onsets(score, 4)).toBeGreaterThan(onsets(score, 0))
  })

  it('does not rewrite a constant arrangement as a copy of the first bar only', () => {
    const lifted = renderPlan(periodPlan({ arrangement: 'lift_on_return' }), 2)
    const flat = renderPlan(periodPlan({ arrangement: 'constant' }), 2)
    expect(onsets(lifted, 4) - onsets(lifted, 0)).toBeGreaterThan(onsets(flat, 4) - onsets(flat, 0))
  })
})
