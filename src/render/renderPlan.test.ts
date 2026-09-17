import { describe, expect, it } from 'vitest'
import {
  BAR_ROLE_IDS,
  CHORD_IDS,
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
import { keyInfo, resolveChord } from './harmony'
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
            key: any(KEY_IDS),
            meter,
            texture,
            palette: any(PALETTE_IDS),
            tempo: 'moderato',
            dynamics: 'mf',
            dynamicShape: 'arch',
            defaultInstrument: 'grand_piano',
            bars: Array.from({ length: trial % 2 ? 4 : 8 }, () => ({
              chord: any(CHORD_IDS),
              role: any(BAR_ROLE_IDS),
              contour: any(CONTOUR_IDS),
            })),
          }
          assertWellFormed(renderPlan(plan, trial))
        }
      }
    }
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
