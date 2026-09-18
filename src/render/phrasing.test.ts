import { describe, expect, it } from 'vitest'
import { formRoles } from '../plan/forms'
import type { ChordId, CompositionPlan, ContourId } from '../plan/schema'
import { midiOf } from './pitch'
import { isPhraseFinalBar, phrasingOf, withEndRest } from './phrasing'
import { renderPlan } from './renderPlan'
import { METER_INFO } from './score'

const CONTOURS: ContourId[] = ['arch', 'leap_fall', 'wave', 'rise']
function songPlan(overrides: Partial<CompositionPlan> = {}): CompositionPlan {
  const chords: ChordId[] = ['I', 'vi', 'ii6', 'V', 'I', 'vi', 'ii6', 'I', 'IV', 'ii', 'V7_of_V', 'V', 'I', 'vi', 'V7', 'I']
  const roles = formRoles('period', 16)
  return {
    version: 1,
    style: 'chopin',
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
    bars: chords.map((chord, i) => ({ chord, role: roles[i], contour: CONTOURS[i % 4] })),
    ...overrides,
  }
}

const lastOnset = (index: number, score: ReturnType<typeof renderPlan>) => {
  const voice = score.bars[index].treble[0]
  return voice[voice.length - 1]?.start ?? -1
}

describe('phrasing helpers', () => {
  it('lets lyrical songs breathe and keeps perpetual motion on the beat', () => {
    expect(phrasingOf('lyrical_song')).toBe('breathing')
    expect(phrasingOf('dreamy_haze')).toBe('long')
    expect(phrasingOf('flowing_perpetual')).toBe('none')
    expect(phrasingOf('hypnotic_pulse')).toBe('none')
  })

  it('treats every fourth bar as a phrase end', () => {
    expect([0, 1, 2, 3, 4, 7, 15].map((i) => isPhraseFinalBar(i, 16))).toEqual([false, false, false, true, false, true, true])
  })

  it('carves a rest from the end of a bar-filling rhythm', () => {
    expect(withEndRest([4, 4, 4, 4], 4)).toEqual([4, 4, 4, -4])
    expect(withEndRest([4, 8, -4], 4)).toEqual([4, 8, -4])
    expect(withEndRest([16], 4)).toEqual([12, -4])
    expect(withEndRest([6, 2, 8], 4)).toEqual([6, 2, 4, -4])
  })
})

describe('a breathing tune', () => {
  it('leaves the last beat of a phrase-end bar without a melody attack, then picks up into the return', () => {
    const score = renderPlan(songPlan(), 3)
    const beat = METER_INFO.four_four.beatTicks
    const phraseEnds = [3, 7, 11]
    for (const index of phraseEnds) {
      const voice = score.bars[index].treble[0]
      const attacksOnLastBeat = voice.filter((n) => n.start >= score.meter.ticksPerBar - beat && n.dur >= beat)
      expect(attacksOnLastBeat, `bar ${index + 1} should not hold through the last beat`).toHaveLength(0)
      expect(lastOnset(index, score), `bar ${index + 1} should pick up into the next phrase`).toBeGreaterThanOrEqual(score.meter.ticksPerBar - beat)
    }
    // The pickup steps toward the next bar's first pitch (the returning theme).
    const pickup = score.bars[3].treble[0].at(-1)!
    const next = score.bars[4].treble[0][0]
    expect(Math.abs(midiOf(pickup.pitches.at(-1)!) - midiOf(next.pitches.at(-1)!))).toBeLessThanOrEqual(7)
  })

  it('does not punch holes in a flowing perpetual line', () => {
    const score = renderPlan(songPlan({ character: 'flowing_perpetual', texture: 'toccata_perpetual' }), 4)
    const midPhrase = score.bars[2].treble[0]
    const phraseEnd = score.bars[3].treble[0]
    const covered = (voice: typeof midPhrase) => voice.reduce((sum, n) => sum + n.dur, 0)
    expect(covered(phraseEnd)).toBeGreaterThanOrEqual(covered(midPhrase) - 4)
  })
})
