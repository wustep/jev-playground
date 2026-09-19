import { describe, expect, it } from 'vitest'
import {
  lastSoundingDegree,
  melodyMemoryFrom,
  parseBassSoFar,
  parseMelodySoFar,
  type MelodyMemoryBar,
} from '../../plan/notes'
import { PlanValidationError } from '../../plan/schema'
import {
  describeMelodySoFar,
  melodyMotionHint,
  notesContinuityState,
  notesTask,
} from './notesContinuity'

const prior: MelodyMemoryBar[] = [
  { rhythm: 'four_even', degrees: ['tonic', 'rest', 'dominant', 'tonic_high'] },
  { rhythm: 'four_long_short', degrees: ['mediant', 'dominant', 'leading', 'tonic'] },
]

describe('multi-bar melody continuity helpers', () => {
  it('skips rests when naming the last sounding degree', () => {
    expect(lastSoundingDegree(['tonic', 'dominant', 'rest'])).toBe('dominant')
    expect(lastSoundingDegree(['rest', 'rest'])).toBeNull()
    expect(lastSoundingDegree([])).toBeNull()
    expect(lastSoundingDegree(prior[0].degrees)).toBe('tonic_high')
  })

  it('copies closed rhythm + degree ids from realized phrases', () => {
    expect(melodyMemoryFrom(prior)).toEqual(prior)
    expect(melodyMemoryFrom(prior)[0].degrees).not.toBe(prior[0].degrees)
  })

  it('builds melody_so_far with ids and labels, plus last degree and next chord', () => {
    const state = notesContinuityState({
      barIndex: 2,
      bar: { chord: 'V', role: 'development', contour: 'rise' },
      nextChord: 'I',
      melodySoFar: prior,
      bassSoFar: ['root_fifth', 'walk_down'],
    })
    expect(state.melody_so_far).toHaveLength(2)
    expect(state.melody_so_far[0]).toMatchObject({
      bar: 1,
      rhythm_id: 'four_even',
      degree_ids: ['tonic', 'rest', 'dominant', 'tonic_high'],
    })
    expect(JSON.stringify(state.melody_so_far)).toContain('Four even quarter notes')
    expect(state.last_sounding_degree_id).toBe('tonic')
    expect(state.last_sounding_degree).toContain('Tonic')
    expect(state.this_bar).toMatchObject({ bar_number: 3, next_chord: expect.stringContaining('I —') })
    expect(state.melody_motion).toBe('stepwise_echo')
    expect(state.motif_echo).toMatch(/melody_so_far/)
    expect(state.piece_frame).toEqual({})
    expect(state.bass_so_far).toEqual([
      { bar: 1, pattern_id: 'root_fifth', pattern: expect.stringContaining('fifth') },
      { bar: 2, pattern_id: 'walk_down', pattern: expect.stringContaining('Walk down') },
    ])
    expect(describeMelodySoFar([])).toEqual([])
  })

  it('allows a leap only on contrast, climax, or surprise', () => {
    expect(melodyMotionHint('statement')).toBe('stepwise_echo')
    expect(melodyMotionHint('cadence')).toBe('stepwise_echo')
    expect(melodyMotionHint('contrast')).toBe('contrast_ok')
    expect(melodyMotionHint('climax')).toBe('contrast_ok')
    expect(melodyMotionHint('surprise')).toBe('contrast_ok')
    const climax = notesContinuityState({
      barIndex: 0,
      bar: { chord: 'V', role: 'climax', contour: 'rise' },
      melodySoFar: [],
    })
    expect(climax.melody_so_far).toEqual([])
    expect(climax.last_sounding_degree).toBeNull()
    expect(climax.melody_motion).toBe('contrast_ok')
    expect(climax.motif_echo).toBeNull()
  })

  it('carries character, texture and arrangement on the piece frame', () => {
    const state = notesContinuityState({
      barIndex: 0,
      bar: { chord: 'I', role: 'statement', contour: 'arch' },
      melodySoFar: [],
      character: 'lyrical_song',
      texture: 'rolling_nocturne',
      arrangement: 'lift_on_return',
    })
    expect(state.piece_frame).toMatchObject({
      character: expect.stringContaining('singing'),
      texture: expect.stringContaining('nocturne'),
      arrangement: expect.stringContaining('return'),
    })
  })

  it('wording on bar 1 mentions empty prior; later bars continue melody_so_far', () => {
    expect(notesTask(1, false)).toMatch(/melody_so_far` is empty/)
    expect(notesTask(4, true)).toMatch(/Continue the right-hand melody from `melody_so_far`/)
    expect(notesTask(4, true)).toMatch(/stepwise motion/)
    expect(notesTask(4, true)).toMatch(/avoid random leaps/i)
    expect(notesTask(2, true, true)).toMatch(/long tone and a rest/)
  })

  it('parses melodySoFar / bassSoFar against closed enums and prior length', () => {
    expect(parseMelodySoFar(undefined, 'four_four')).toEqual([])
    expect(parseMelodySoFar(prior, 'four_four', 2)).toEqual(prior)
    expect(() => parseMelodySoFar(prior, 'four_four', 1)).toThrow(PlanValidationError)
    expect(() => parseMelodySoFar([{ rhythm: 'four_even', degrees: ['tonic'] }], 'four_four')).toThrow(/degrees/)
    expect(() => parseMelodySoFar([{ rhythm: 'four_even', degrees: prior[0].degrees }], 'three_four')).toThrow()
    expect(parseBassSoFar(['root_hold', 'pedal'], 2)).toEqual(['root_hold', 'pedal'])
    expect(() => parseBassSoFar(['walk_sideways'], 1)).toThrow(PlanValidationError)
    expect(() => parseBassSoFar(undefined, 2)).toThrow(/bassSoFar/)
  })
})
