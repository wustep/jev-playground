import { describe, expect, it } from 'vitest'
import { MELODY_DEGREE_IDS, rhythmHasLongTone } from '../../plan/notes'
import {
  NOTES_PRIOR_MIX,
  blendJevPrior,
  degreeProximityBonus,
  degreesNearlyIdentical,
  nudgeMelodyDegrees,
  prefersLongAndRest,
  withDegreeProximity,
  withLyricalRhythmBias,
} from './notesPriors'

describe('notes sample priors', () => {
  it('marks lyrical / song characters as wanting long tones and rests', () => {
    expect(prefersLongAndRest('lyrical_song')).toBe(true)
    expect(prefersLongAndRest('solemn_hymn')).toBe(true)
    expect(prefersLongAndRest('meditative_stillness')).toBe(true)
    expect(prefersLongAndRest('stormy_drama')).toBe(false)
    expect(prefersLongAndRest('flowing_perpetual')).toBe(false)
    expect(prefersLongAndRest('playful_wit')).toBe(false)
    expect(prefersLongAndRest('dance_lilt')).toBe(false)
  })

  it('boosts degrees near the previous sounding one without erasing a peaked Jev answer', () => {
    expect(degreeProximityBonus('supertonic', 'tonic', false)).toBeGreaterThan(degreeProximityBonus('mediant_high', 'tonic', false))
    expect(degreeProximityBonus('dominant', 'tonic', false)).toBeGreaterThan(degreeProximityBonus('mediant_high', 'tonic', false))
    expect(degreeProximityBonus('rest', 'tonic', true)).toBeGreaterThan(degreeProximityBonus('rest', 'tonic', false))

    const peaked = Object.fromEntries(MELODY_DEGREE_IDS.map((id) => [id, id === 'tonic_high' ? 0.9 : 0.01])) as Record<string, number>
    const blended = withDegreeProximity(peaked, 'tonic', { lyrical: false })
    expect(blended.tonic_high).toBeGreaterThan(blended.supertonic)
    expect(blended.tonic).toBeGreaterThan(peaked.tonic * (1 - NOTES_PRIOR_MIX) - 1e-9)

    const open = { tonic: 0.22, dominant: 0.22, leading: 0.2, rest: 0.18, mediant_high: 0.18 }
    const nearTonic = withDegreeProximity(open, 'tonic', { lyrical: false })
    expect(nearTonic.tonic).toBeGreaterThan(nearTonic.mediant_high)
    expect(nearTonic.dominant).toBeGreaterThan(nearTonic.mediant_high)
  })

  it('tilts lyrical rhythms toward a long tone and away from four even attacks', () => {
    expect(rhythmHasLongTone('four_long_short')).toBe(true)
    expect(rhythmHasLongTone('four_even')).toBe(false)
    const even = { four_even: 0.4, four_long_short: 0.3, four_short_long: 0.3 }
    const tilted = withLyricalRhythmBias(even)
    expect(tilted.four_long_short).toBeGreaterThan(tilted.four_even)
    expect(tilted.four_short_long).toBeGreaterThan(tilted.four_even)
  })

  it('keeps a 90 % Jev favourite on top after the blend', () => {
    const blended = blendJevPrior({ a: 0.9, b: 0.1 }, { a: 0.1, b: 0.9 })
    expect(blended.a).toBeGreaterThan(blended.b)
  })

  it('nudges the last sounding degree when two new bars stamp the same shape', () => {
    const stamped = ['tonic', 'dominant', 'mediant', 'tonic'] as const
    expect(degreesNearlyIdentical(stamped, stamped)).toBe(true)
    expect(degreesNearlyIdentical(stamped, ['tonic', 'dominant', 'mediant', 'supertonic'])).toBe(true)
    expect(degreesNearlyIdentical(stamped, ['leading', 'submediant', 'supertonic', 'dominant_low'])).toBe(false)
    const nudged = nudgeMelodyDegrees(stamped)
    expect(nudged.slice(0, 3)).toEqual(['tonic', 'dominant', 'mediant'])
    expect(nudged[3]).not.toBe('tonic')
    expect(nudgeMelodyDegrees(['rest', 'rest', 'rest', 'rest'])).toEqual(['rest', 'rest', 'rest', 'rest'])
  })
})
