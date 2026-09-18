import { describe, expect, it } from 'vitest'
import { Formatter, Stave } from 'vexflow/bravura'
import { METER_INFO, type Voice } from '../render/score'
import { attachVoicesToStave, buildVoice, LEDGER_STROKE_PX, unifyBeamStems, usablePitches, vexKey, type BuiltVoice } from './drawScore'

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

describe('vexKey', () => {
  it('translates spelled pitches and rejects ones VexFlow cannot place', () => {
    expect(vexKey('Eb4')).toBe('eb/4')
    expect(vexKey('F#5')).toBe('f#/5')
    expect(vexKey('Cb3')).toBe('cb/3')
    expect(vexKey('Eb')).toBeNull()
    expect(vexKey('')).toBeNull()
    expect(vexKey('H4')).toBeNull()
    expect(vexKey('MIDI 60')).toBeNull()
    expect(vexKey('C10')).toBe('c/8')
    expect(usablePitches(['Eb', '', 'C4', 'H4'])).toEqual(['C4'])
  })
})

function ysAfterFormat(voices: BuiltVoice[], clefY = 40) {
  attachVoicesToStave(voices, new Stave(10, clefY, 420))
  const formatter = new Formatter()
  formatter.joinVoices(voices.map((b) => b.voice))
  formatter.format(
    voices.map((b) => b.voice),
    340,
  )
  return voices.flatMap((built) => built.notes.map((note) => note.getYs()))
}

describe('NoYValues hardening', () => {
  it('turns empty pitches into a rest that still has Y values after format', () => {
    const built = buildVoice([{ start: 0, dur: 16, pitches: [], velocity: 80 }], 'treble', 0, 2, meter)
    expect(built.notes.some((note) => note.isRest())).toBe(true)
    expect(built.notes.reduce((ticks, note) => ticks + note.getTicks().value(), 0)).toBeGreaterThan(0)
    const ys = ysAfterFormat([built])
    expect(ys.length).toBeGreaterThan(0)
    for (const row of ys) expect(row.length).toBeGreaterThan(0)
  })

  it('repairs a missing-octave spelling next to a legal pitch', () => {
    const built = buildVoice(
      [
        { start: 0, dur: 8, pitches: ['Eb'], velocity: 72 },
        { start: 8, dur: 8, pitches: ['C4'], velocity: 72 },
      ],
      'treble',
      0,
      1,
      meter,
    )
    expect(built.notes[0].isRest()).toBe(true)
    expect(built.notes.some((note) => !note.isRest())).toBe(true)
    for (const row of ysAfterFormat([built])) expect(row.length).toBeGreaterThan(0)
  })

  it('engraves an empty voice as a full-bar rest', () => {
    const built = buildVoice([], 'bass', 0, 1, meter)
    expect(built.notes.length).toBeGreaterThan(0)
    expect(built.notes.every((note) => note.isRest())).toBe(true)
    for (const row of ysAfterFormat([built], 136)) expect(row.length).toBeGreaterThan(0)
  })

  it('formats a weird beam group (16ths, empty pitch, rest gap) without NoYValues', () => {
    const voice: Voice = [
      { start: 0, dur: 1, pitches: ['G5'], velocity: 70 },
      { start: 1, dur: 1, pitches: [], velocity: 70 },
      { start: 2, dur: 1, pitches: ['H4'], velocity: 70 },
      { start: 3, dur: 1, pitches: ['E5'], velocity: 70 },
      { start: 8, dur: 4, pitches: ['C4', 'Eb'], velocity: 70 },
      { start: 12, dur: 4, pitches: ['G4'], velocity: 70 },
    ]
    const upper = [buildVoice(voice, 'treble', 0, 2, meter)]
    const lower = [buildVoice([{ start: 0, dur: 16, pitches: ['C3'], velocity: 64 }], 'bass', 0, 1, meter)]
    formatTogether(upper, lower, true)
    for (const row of upper[0].notes.map((note) => note.getYs())) expect(row.length).toBeGreaterThan(0)
    for (const row of lower[0].notes.map((note) => note.getYs())) expect(row.length).toBeGreaterThan(0)
  })
})
