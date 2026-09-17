import { describe, expect, it } from 'vitest'
import {
  BAR_ROLE_IDS,
  CHARACTER_IDS,
  CHORD_IDS,
  DYNAMIC_SHAPE_IDS,
  FORM_IDS,
  CONTOUR_IDS,
  KEY_IDS,
  METER_IDS,
  PALETTE_IDS,
  STYLE_IDS,
  TEXTURE_IDS,
  parsePlan,
  type CompositionPlan,
} from '../plan/schema'
import { HeuristicPlanner } from '../planner/HeuristicPlanner'
import { rng } from '../planner/pick'
import { keyInfo, resolveChord, scaleFor } from './harmony'
import { midiOf } from './pitch'
import { renderPlan, timeline } from './renderPlan'
import type { Score } from './score'

function assertWellFormed(score: Score) {
  expect(score.bars.length).toBe(score.plan.bars.length)
  for (const bar of score.bars) {
    const voices = [...bar.treble, ...bar.bass]
    expect(voices.length, `bar ${bar.index} has notes`).toBeGreaterThan(0)
    expect(bar.treble.length).toBeLessThanOrEqual(2)
    expect(bar.bass.length).toBeLessThanOrEqual(2)
    for (const voice of voices) {
      let cursor = 0
      for (const n of voice) {
        expect(Number.isInteger(n.start) && Number.isInteger(n.dur)).toBe(true)
        expect(n.start, 'voices are sorted and never overlap').toBeGreaterThanOrEqual(cursor)
        expect(n.dur).toBeGreaterThan(0)
        expect(n.start + n.dur, 'notes stay inside the bar').toBeLessThanOrEqual(score.meter.ticksPerBar)
        expect(n.pitches.length).toBeGreaterThan(0)
        for (const pitch of n.pitches) {
          const midi = midiOf(pitch)
          expect(midi).toBeGreaterThanOrEqual(24)
          expect(midi).toBeLessThanOrEqual(103)
          expect(pitch, 'no double accidentals reach the sheet').not.toMatch(/##|bb/)
        }
        expect(n.velocity).toBeGreaterThanOrEqual(1)
        expect(n.velocity).toBeLessThanOrEqual(127)
        cursor = n.start + n.dur
      }
    }
  }
}

describe('resolveChord', () => {
  it('resolves every chord label in every key', () => {
    for (const key of KEY_IDS) {
      for (const chord of CHORD_IDS) {
        const resolved = resolveChord(keyInfo(key), chord)
        expect(resolved.pcs.length, `${chord} in ${key}`).toBeGreaterThanOrEqual(3)
        expect(resolved.core.length).toBeGreaterThanOrEqual(3)
      }
    }
  })

  it('puts the bass the label asks for under inversions and pedal chords', () => {
    const c = keyInfo('C_major')
    expect(resolveChord(c, 'I6')).toMatchObject({ bass: 'E', symbol: 'C/E', fixedBass: true })
    expect(resolveChord(c, 'V65')).toMatchObject({ bass: 'B', symbol: 'G7/B' })
    expect(resolveChord(c, 'V65_of_V')).toMatchObject({ bass: 'F#', symbol: 'D7/F#' })
    expect(resolveChord(c, 'IV64')).toMatchObject({ bass: 'C', symbol: 'F/C' })
    expect(resolveChord(c, 'I')).toMatchObject({ bass: 'C', symbol: 'C', fixedBass: false })
    // Moonlight bar 3: the Neapolitan sixth, D major over F# in C-sharp minor.
    expect(resolveChord(keyInfo('Cs_minor'), 'bII6')).toMatchObject({ root: 'D', bass: 'F#' })
  })

  it('bends the melody scale toward chromatic chord tones', () => {
    const c = keyInfo('C_major')
    expect(scaleFor(c, 'diatonic', resolveChord(c, 'V7_of_V'))).toContain('F#')
    expect(scaleFor(c, 'diatonic', resolveChord(c, 'V7_of_V'))).not.toContain('F')
    expect(scaleFor(c, 'diatonic', resolveChord(c, 'bVI'))).toEqual(expect.arrayContaining(['Ab', 'Eb']))
    expect(scaleFor(keyInfo('A_minor'), 'diatonic', resolveChord(keyInfo('A_minor'), 'V7'))).toContain('G#')
    // Gapped palettes keep their own colour.
    expect(scaleFor(c, 'pentatonic', resolveChord(c, 'V7_of_V'))).toEqual(['C', 'D', 'E', 'G', 'A'])
  })

  it('spells chords relative to the key', () => {
    expect(resolveChord(keyInfo('C_minor'), 'V7').pcs).toEqual(['G', 'B', 'D', 'F'])
    expect(resolveChord(keyInfo('Eb_major'), 'IVmaj7').pcs).toEqual(['Ab', 'C', 'Eb', 'G'])
    expect(resolveChord(keyInfo('Fs_minor'), 'bVI').symbol).toBe('D')
  })
})

describe('renderPlan', () => {
  it('renders every heuristic plan for every style into a well-formed score', async () => {
    const planner = new HeuristicPlanner()
    for (const style of STYLE_IDS) {
      for (let seed = 1; seed <= 25; seed++) {
        const { plan } = await planner.plan({ style, bars: 'auto', pick: 'sample', seed, brief: true })
        expect(parsePlan(JSON.parse(JSON.stringify(plan)))).toEqual(plan)
        assertWellFormed(renderPlan(plan, seed))
      }
    }
  })

  it('survives any combination a planner could emit', () => {
    const random = rng(7)
    const any = <T>(items: readonly T[]) => items[Math.floor(random() * items.length)]
    for (const texture of TEXTURE_IDS) {
      for (const meter of METER_IDS) {
        for (let trial = 0; trial < 12; trial++) {
          const plan: CompositionPlan = {
            version: 1,
            style: any(STYLE_IDS),
            character: any(CHARACTER_IDS),
            form: any(FORM_IDS),
            key: any(KEY_IDS),
            meter,
            texture,
            palette: any(PALETTE_IDS),
            tempo: 'moderato',
            dynamics: 'mf',
            dynamicShape: any(DYNAMIC_SHAPE_IDS),
            defaultInstrument: 'grand_piano',
            bars: Array.from({ length: trial % 3 === 0 ? 16 : trial % 2 ? 4 : 8 }, () => ({
              chord: any(CHORD_IDS),
              role: any(BAR_ROLE_IDS),
              contour: any(CONTOUR_IDS),
            })),
          }
          assertWellFormed(renderPlan(plan, trial))
        }
      }
    }
  }, 30_000)

  it('plays the same plan differently under a different seed, and the same under the same', async () => {
    const { plan } = await new HeuristicPlanner().plan({ style: 'beethoven', bars: 8, pick: 'argmax', seed: 1, brief: true })
    const flat = (seed: number) => JSON.stringify(renderPlan(plan, seed).bars.map((bar) => [bar.treble, bar.bass]))
    expect(flat(5)).toBe(flat(5))
    expect(new Set([1, 2, 3, 4, 5, 6].map(flat)).size).toBeGreaterThan(3)
  })

  it('brings the tune back when a restatement returns to the statement\'s chord', () => {
    const bar = (chord: 'I' | 'V7', role: 'statement' | 'restatement' | 'development' | 'cadence') => ({ chord, role, contour: 'arch' as const })
    const plan: CompositionPlan = {
      version: 1, style: 'beethoven', character: 'lyrical_song', form: 'period', key: 'C_major', meter: 'four_four', texture: 'alberti_melody', palette: 'diatonic',
      tempo: 'adagio', dynamics: 'p', dynamicShape: 'steady', defaultInstrument: 'grand_piano',
      bars: [bar('I', 'statement'), bar('V7', 'development'), bar('I', 'restatement'), bar('I', 'cadence')],
    }
    const score = renderPlan(plan, 3)
    const tune = (index: number) => score.bars[index].treble[0].map((n) => `${n.start}:${n.pitches.join('+')}`)
    expect(tune(2)).toEqual(tune(0))
    expect(tune(1)).not.toEqual(tune(0))
  })

  it('is deterministic for a given plan and seed', async () => {
    const { plan } = await new HeuristicPlanner().plan({ style: 'debussy', bars: 8, pick: 'sample', seed: 3, brief: true })
    expect(renderPlan(plan, 11)).toEqual(renderPlan(plan, 11))
  })

  it('flattens to a timeline that fits the piece', async () => {
    const { plan } = await new HeuristicPlanner().plan({ style: 'bach', bars: 8, pick: 'argmax', seed: 1, brief: true })
    const score = renderPlan(plan, 1)
    const notes = timeline(score)
    expect(notes.length).toBeGreaterThan(20)
    expect(notes[0].time).toBeGreaterThanOrEqual(0)
    expect(notes.every((n, i) => i === 0 || n.time >= notes[i - 1].time)).toBe(true)
  })
})
