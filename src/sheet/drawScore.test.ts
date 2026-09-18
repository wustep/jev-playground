import { describe, expect, it } from 'vitest'
import { Formatter, Stave } from 'vexflow/bravura'
import { METER_INFO, type Voice } from '../render/score'
import { attachVoicesToStave, buildVoice, LEDGER_STROKE_PX, unifyBeamStems, type BuiltVoice } from './drawScore'

const meter = METER_INFO.four_four

function sixteenths(pitch: string): Voice {
  return Array.from({ length: 16 }, (_, i) => ({ start: i, dur: 1, pitches: [pitch], velocity: 72 }))
}

function whole(pitch: string): Voice {
  return [{ start: 0, dur: 16, pitches: [pitch], velocity: 80 }]
}

function buildStaff(voices: Voice[], clef: 'treble' | 'bass'): BuiltVoice[] {
  return voices.map((voice, i) => buildVoice(voice, clef, i, voices.length, meter))
}

function formatTogether(upper: BuiltVoice[], lower: BuiltVoice[], attach: boolean) {
  if (attach) {
    attachVoicesToStave(upper, new Stave(10, 40, 420))
    attachVoicesToStave(lower, new Stave(10, 136, 420))
  }
  const formatter = new Formatter()
  if (upper.length) formatter.joinVoices(upper.map((b) => b.voice))
  if (lower.length) formatter.joinVoices(lower.map((b) => b.voice))
  formatter.format([...upper, ...lower].map((b) => b.voice), 340)
}

function beamStemSets(voices: BuiltVoice[]): number[][] {
  return voices.flatMap((built) =>
    built.beams.map((beam) => [...new Set(beam.getNotes().filter((note) => !note.isRest()).map((note) => note.getStemDirection()))]),
  )
}

describe('sheet engraving', () => {
  it('keeps ledger lines a notehead-and-a-bit, not a measure-wide bar', () => {
    expect(LEDGER_STROKE_PX).toBeLessThanOrEqual(1)
    const [built] = buildStaff([sixteenths('C2')], 'bass')
    expect(built.notes[0].getLedgerLineStyle()).toEqual({})
    expect(built.notes[0].renderOptions.strokePx).toBe(LEDGER_STROKE_PX)
  })

  it('formats a treble whole note against bass 16ths without flipping stems mid-beam', () => {
    const upper = buildStaff([whole('C6')], 'treble')
    const lower = buildStaff([sixteenths('C2')], 'bass')
    formatTogether(upper, lower, true)
    for (const dirs of beamStemSets(lower)) expect(dirs).toHaveLength(1)
  })

  it('formats running 16ths in both hands without mixed-stem beams', () => {
    const upper = buildStaff([sixteenths('G5')], 'treble')
    const lower = buildStaff([sixteenths('Eb2')], 'bass')
    formatTogether(upper, lower, true)
    for (const dirs of [...beamStemSets(upper), ...beamStemSets(lower)]) expect(dirs).toHaveLength(1)
  })

  it('assigns each staff its own stave before format so ModifierContexts stay apart', () => {
    const upper = buildStaff([whole('C6')], 'treble')
    const lower = buildStaff([sixteenths('C2')], 'bass')
    expect(upper[0].notes[0].getStave()).toBeUndefined()
    expect(lower[0].notes[0].getStave()).toBeUndefined()
    formatTogether(upper, lower, true)
    const trebleStave = upper[0].notes[0].getStave()
    const bassStave = lower[0].notes[0].getStave()
    expect(trebleStave).toBeDefined()
    expect(bassStave).toBeDefined()
    expect(trebleStave).not.toBe(bassStave)
    for (const note of upper[0].notes) expect(note.getStave()).toBe(trebleStave)
    for (const note of lower[0].notes) expect(note.getStave()).toBe(bassStave)
  })

  it('unifyBeamStems restores a consistent direction after a bad format', () => {
    const upper = buildStaff([whole('C6')], 'treble')
    const lower = buildStaff([sixteenths('C2')], 'bass')
    formatTogether(upper, lower, false)
    lower.forEach((built) => built.beams.forEach(unifyBeamStems))
    for (const dirs of beamStemSets(lower)) expect(dirs).toHaveLength(1)
  })
})
