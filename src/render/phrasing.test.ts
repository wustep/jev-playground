import { describe, expect, it } from 'vitest'
import { formRoles } from '../plan/forms'
import type { ChordId, CompositionPlan, ContourId } from '../plan/schema'
import { midiOf } from './pitch'
import { isPhraseFinalBar, phrasingOf, pickupNotes, withEndRest } from './phrasing'
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
    expect(phrasingOf('dreamy_haze')).toBe('long_breathed')
    expect(phrasingOf('flowing_perpetual')).toBe('on_the_beat')
    expect(phrasingOf('hypnotic_pulse')).toBe('on_the_beat')
  })

  it('lets a stormy plan breathe when phrasing is set, and keeps a lyrical plan on the beat when asked', () => {
    expect(phrasingOf({ character: 'stormy_drama', phrasing: 'breathing' })).toBe('breathing')
    expect(phrasingOf({ character: 'lyrical_song', phrasing: 'on_the_beat' })).toBe('on_the_beat')
  })

  it('treats every fourth bar as a phrase end', () => {
    expect([0, 1, 2, 3, 4, 7, 15].map((i) => isPhraseFinalBar(i, 16))).toEqual([false, false, false, true, false, true, true])
  })

  it('keeps an anacrusis in the destination octave instead of climbing from the bass', () => {
    const notes = pickupNotes('C2', 'C5', 12, 16, ['C', 'D', 'E', 'F', 'G', 'A', 'B'], 64)
    expect(notes.length).toBeGreaterThan(0)
    for (const n of notes) {
      expect(midiOf(n.pitches[0])).toBeGreaterThanOrEqual(55)
      expect(midiOf(n.pitches[0])).toBeLessThan(midiOf('C5'))
    }
  })

  it('carves a rest from the end of a bar-filling rhythm', () => {
    expect(withEndRest([4, 4, 4, 4], 4)).toEqual([4, 4, 4, -4])
    expect(withEndRest([4, 8, -4], 4)).toEqual([4, 8, -4])
    expect(withEndRest([16], 4)).toEqual([12, -4])
    expect(withEndRest([6, 2, 8], 4)).toEqual([6, 2, 4, -4])
  })
})

describe('a breathing tune', () => {
  it('leaves the last beat of a phrase-end bar silent — no pickup filling the air', () => {
    const score = renderPlan(songPlan({ phrasing: 'breathing' }), 3)
    const beat = METER_INFO.four_four.beatTicks
    const phraseEnds = [3, 7, 11]
    for (const index of phraseEnds) {
      const voice = score.bars[index].treble[0]
      const coveringLast = voice.filter((n) => n.start < score.meter.ticksPerBar && n.start + n.dur > score.meter.ticksPerBar - beat)
      expect(coveringLast, `bar ${index + 1} last beat should be silent`).toHaveLength(0)
      expect(lastOnset(index, score), `bar ${index + 1} should not pick up`).toBeLessThan(score.meter.ticksPerBar - beat)
    }
  })

  it('fills an upbeat phrase-end rest with a pickup into the return', () => {
    const score = renderPlan(songPlan({ phrasing: 'upbeat' }), 3)
    const beat = METER_INFO.four_four.beatTicks
    expect(lastOnset(3, score)).toBeGreaterThanOrEqual(score.meter.ticksPerBar - beat)
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

  it('rests a stormy piece when phrasing is breathing, and does not rest a lyrical piece marked on_the_beat', () => {
    const beat = METER_INFO.four_four.beatTicks
    const stormBreathes = renderPlan(songPlan({ character: 'stormy_drama', phrasing: 'breathing', texture: 'alberti_melody' }), 3)
    const stormOnBeat = renderPlan(songPlan({ character: 'stormy_drama', phrasing: 'on_the_beat', texture: 'alberti_melody' }), 3)
    const lyricalOnBeat = renderPlan(songPlan({ character: 'lyrical_song', phrasing: 'on_the_beat', texture: 'alberti_melody' }), 3)
    const lyricalBreathes = renderPlan(songPlan({ character: 'lyrical_song', phrasing: 'breathing', texture: 'alberti_melody' }), 3)
    const heldLast = (score: ReturnType<typeof renderPlan>) =>
      score.bars[3].treble[0].filter((n) => n.start >= score.meter.ticksPerBar - beat && n.dur >= beat)
    const beforeLast = (score: ReturnType<typeof renderPlan>) =>
      score.bars[3].treble[0].filter((n) => n.start < score.meter.ticksPerBar - beat).reduce((sum, n) => sum + n.dur, 0)
    expect(heldLast(stormBreathes)).toHaveLength(0)
    expect(heldLast(lyricalBreathes)).toHaveLength(0)
    expect(stormBreathes.bars[3].treble[0]).not.toEqual(stormOnBeat.bars[3].treble[0])
    expect(lyricalOnBeat.bars[3].treble[0]).not.toEqual(lyricalBreathes.bars[3].treble[0])
    expect(beforeLast(stormOnBeat)).toBeGreaterThanOrEqual(beforeLast(stormBreathes))
    expect(beforeLast(lyricalOnBeat)).toBeGreaterThanOrEqual(beforeLast(lyricalBreathes))
  })
})
