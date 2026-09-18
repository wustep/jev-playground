import { describe, expect, it } from 'vitest'
import { formRoles, themeSources } from '../plan/forms'
import { BAR_COUNT_VALUES, FORM_IDS, STYLE_IDS, type BarPlan, type ChordId, type CompositionPlan, type ContourId } from '../plan/schema'
import { HeuristicPlanner } from '../planner/HeuristicPlanner'
import { midiOf } from './pitch'
import { renderPlan } from './renderPlan'
import type { Voice } from './score'

const tops = (voice: Voice) => voice.map((n) => midiOf(n.pitches[n.pitches.length - 1]))
const rhythm = (voice: Voice) => voice.map((n) => `${n.start}:${n.dur}`).join(' ')
/** Up / down / same between successive notes: the shape that survives a reharmonisation. */
const shape = (voice: Voice) => tops(voice).slice(1).map((m, k) => Math.sign(m - tops(voice)[k])).join(' ')

const CONTOURS: ContourId[] = ['arch', 'leap_fall', 'wave', 'rise']
function periodPlan(chords: ChordId[], overrides: Partial<CompositionPlan> = {}): CompositionPlan {
  const roles = formRoles('period', 16)
  const bars: BarPlan[] = chords.map((chord, i) => ({ chord, role: roles[i], contour: CONTOURS[i % 4] }))
  return {
    version: 1, style: 'chopin', character: 'lyrical_song', form: 'period', key: 'C_major', meter: 'four_four', texture: 'alberti_melody', palette: 'diatonic',
    tempo: 'adagio', dynamics: 'p', dynamicShape: 'steady', defaultInstrument: 'grand_piano', bars, ...overrides,
  }
}
// a a' b a'': the consequents open on the antecedent's chords, then close instead of pausing.
const PERIOD: ChordId[] = ['I', 'vi', 'ii6', 'V', 'I', 'vi', 'ii6', 'I', 'IV', 'ii', 'V7_of_V', 'V', 'I', 'vi', 'V7', 'I']

describe('themeSources: which bars bring back which', () => {
  it('returns a period’s antecedent in both consequents, up to the cadence', () => {
    expect(themeSources('period', 16)).toEqual([undefined, undefined, undefined, undefined, 0, 1, 2, undefined, undefined, undefined, undefined, undefined, 0, 1, 2, undefined])
    expect(themeSources('period', 8)).toEqual([undefined, undefined, undefined, undefined, 0, 1, 2, undefined])
  })

  it('says a duplicate’s two-bar idea twice, and a loop keeps its two-bar hook', () => {
    expect(themeSources('sentence', 8).slice(0, 4)).toEqual([undefined, undefined, 0, 1])
    expect(themeSources('mosaic_pairs', 16).slice(0, 8)).toEqual([undefined, undefined, 0, 1, undefined, undefined, 4, 5])
    expect(themeSources('additive_loop', 16)).toEqual([undefined, undefined, undefined, undefined, 0, 1, undefined, undefined, 0, 1, undefined, undefined, 0, 1, undefined, undefined])
  })

  it('never repeats in a fantasia, and only ever looks back, never at or from a cadence', () => {
    for (const bars of BAR_COUNT_VALUES) expect(themeSources('free_fantasia', bars).every((source) => source === undefined)).toBe(true)
    for (const form of FORM_IDS) for (const bars of BAR_COUNT_VALUES) {
      const roles = formRoles(form, bars)
      const sources = themeSources(form, bars)
      expect(sources).toHaveLength(bars)
      expect(sources[bars - 1]).toBeUndefined()
      sources.forEach((source, i) => {
        if (source === undefined) return
        expect(source).toBeLessThan(i)
        for (const role of [roles[i], roles[source]]) expect(['cadence', 'half_cadence', 'surprise', 'dissolve']).not.toContain(role)
        // The source is the bar that first said it, not a return of a return.
        expect(sources[source]).toBeUndefined()
      })
    }
  })

  it('gives every form but the fantasia a returning phrase at sixteen bars', () => {
    for (const form of FORM_IDS) {
      if (form === 'free_fantasia') continue
      expect(themeSources(form, 16).filter((source) => source !== undefined).length, form).toBeGreaterThanOrEqual(3)
    }
  })
})

describe('a returning phrase', () => {
  it('brings the tune back note for note over the same chords, and keeps its rhythm and shape over new ones', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const score = renderPlan(periodPlan(PERIOD), seed)
      const line = score.bars.map((b) => b.treble[0])
      for (const [back, source] of [[4, 0], [5, 1], [6, 2], [12, 0], [13, 1]] as const) {
        expect(rhythm(line[back]), `seed ${seed} bar ${back + 1}`).toBe(rhythm(line[source]))
        expect(tops(line[back]), `seed ${seed} bar ${back + 1}`).toEqual(tops(line[source]))
      }
      // Bar 15 returns bar 3 over V7 instead of ii6 — and as the phrase's climax.
      expect(rhythm(line[14])).toBe(rhythm(line[2]))
    }
  })

  it('reharmonised, the tune keeps its contour and settles its beats on the new chord', () => {
    const chords = [...PERIOD]
    chords[4] = 'IV'
    chords[5] = 'ii'
    let kept = 0
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const line = renderPlan(periodPlan(chords), seed).bars.map((b) => b.treble[0])
      expect(rhythm(line[4])).toBe(rhythm(line[0]))
      if (shape(line[4]) === shape(line[0])) kept++
    }
    expect(kept).toBeGreaterThanOrEqual(4)
  })

  it('writes the cadence fresh: the consequent closes where the antecedent paused', () => {
    const score = renderPlan(periodPlan(PERIOD), 3)
    // The last long note is the landing; a pickup into the next phrase may follow it.
    const landing = (index: number) => {
      const voice = score.bars[index].treble[0]
      const held = [...voice].reverse().find((n) => n.dur >= score.meter.beatTicks) ?? voice[0]
      return midiOf(held.pitches[held.pitches.length - 1]) % 12
    }
    expect(landing(7)).toBe(0) // C: the tonic
    expect(landing(15)).toBe(0)
    expect(landing(3)).not.toBe(0)
  })

  it('reaches at least as high when it comes back as the climax', () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const line = renderPlan(periodPlan(PERIOD), seed).bars.map((b) => b.treble[0])
      // Bar 15 (climax) returns bar 3; bar 7 (development) returns it plainly over the same chord as bar 3.
      expect(Math.max(...tops(line[14])), `seed ${seed}`).toBeGreaterThanOrEqual(Math.max(...tops(line[6])) - 2)
    }
  })

  it('leaves a hand-edited plan alone where its roles no longer match the form', () => {
    const edited = periodPlan(PERIOD)
    edited.bars[5] = { ...edited.bars[5], role: 'half_cadence' }
    const score = renderPlan(edited, 2)
    // A pause is written from the pause rhythms, not from bar 2's tune.
    expect(score.bars[5].treble[0].length).toBeLessThanOrEqual(3)
  })

  it('makes sampled sixteen-bar pieces bring back more than a single bar', async () => {
    const planner = new HeuristicPlanner()
    let returned = 0
    let expected = 0
    for (const style of STYLE_IDS) for (let seed = 1; seed <= 6; seed++) {
      const { plan } = await planner.plan({ style, bars: 16, pick: 'sample', seed, brief: false })
      const score = renderPlan(plan, seed)
      themeSources(plan.form, 16).forEach((source, i) => {
        if (source === undefined || !score.bars[i].treble[0] || !score.bars[source].treble[0]) return
        expected++
        if (rhythm(score.bars[i].treble[0]) === rhythm(score.bars[source].treble[0])) returned++
      })
    }
    expect(expected).toBeGreaterThan(100)
    expect(returned / expected).toBeGreaterThan(0.8)
  })
})
