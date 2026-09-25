import { describe, expect, it, vi } from 'vitest'
import { Formatter, Stave, StaveTie } from 'vexflow/bravura'
import type { CompositionPlan } from '../plan/schema'
import { renderPlan } from '../render/renderPlan'
import { METER_INFO, type Bar, type Score, type Voice } from '../render/score'
import {
  attachVoicesToStave,
  barDensity,
  buildVoice,
  CHORD_ABOVE_STAFF,
  chooseBarsPerSystem,
  drawScore,
  DYNAMIC_BELOW_BASS,
  flattenWideBeams,
  LEDGER_STROKE_PX,
  minBarWidth,
  packSystems,
  settleRests,
  sheetLabelLayout,
  systemPadding,
  tieIndexes,
  unifyBeamStems,
  usablePitches,
  vexKey,
  voicesForStaff,
  type BuiltVoice,
} from './drawScore'

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

  it('engraves an empty staff as a full-bar rest', () => {
    const built = voicesForStaff([], 'treble', meter)
    expect(built).toHaveLength(1)
    expect(built[0].notes.length).toBeGreaterThan(0)
    expect(built[0].notes.every((note) => note.isRest())).toBe(true)
    for (const row of ysAfterFormat(built)) expect(row.length).toBeGreaterThan(0)
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

describe('rest placement', () => {
  it('sits a rest in a low bass run next to those notes, not on the middle line', () => {
    const voice: Voice = [
      { start: 0, dur: 1, pitches: ['C2'], velocity: 70 },
      { start: 2, dur: 1, pitches: ['C2'], velocity: 70 },
      { start: 3, dur: 1, pitches: ['Eb2'], velocity: 70 },
    ]
    const [built] = voicesForStaff([voice], 'bass', meter)
    settleRests([built])
    const rest = built.notes.find((note) => note.isRest())
    expect(rest).toBeTruthy()
    const restLine = rest!.getKeyLine(0)
    const noteLine = built.notes.find((note) => !note.isRest())!.getKeyLine(0)
    expect(Math.abs(restLine - noteLine)).toBeLessThan(2)
  })

  it('pushes a two-voice rest off the other voice\'s noteheads', () => {
    const upper: Voice = [{ start: 8, dur: 8, pitches: ['C5'], velocity: 80 }]
    const inner: Voice = [
      { start: 0, dur: 2, pitches: ['G5'], velocity: 64 },
      { start: 2, dur: 2, pitches: ['Bb5'], velocity: 64 },
      { start: 4, dur: 2, pitches: ['D6'], velocity: 64 },
      { start: 6, dur: 2, pitches: ['G5'], velocity: 64 },
      { start: 8, dur: 8, pitches: ['G5'], velocity: 64 },
    ]
    const voices = voicesForStaff([upper, inner], 'treble', meter)
    const before = voices[0].notes[0]
    expect(before.isRest()).toBe(true)
    const colliding = inner.flatMap((n) => n.pitches)
    expect(colliding.some((p) => p === 'G5' || p === 'Bb5')).toBe(true)
    settleRests(voices)
    const restLine = voices[0].notes[0].getKeyLine(0)
    const otherLines = voices[1].notes.filter((note) => !note.isRest()).flatMap((note) => note.getKeys().map((_, i) => note.getKeyLine(i)))
    expect(otherLines.some((line) => Math.abs(line - restLine) < 1.5)).toBe(false)
  })
})

describe('beams, ties, and system padding', () => {
  it('beams a middle 16th rest instead of leaving flagged orphans', () => {
    const voice: Voice = [
      { start: 0, dur: 1, pitches: ['G4'], velocity: 70 },
      { start: 2, dur: 1, pitches: ['G4'], velocity: 70 },
      { start: 3, dur: 1, pitches: ['A4'], velocity: 70 },
    ]
    const [built] = voicesForStaff([voice], 'treble', meter)
    const beamed = built.beams.some((beam) => beam.getNotes().some((note) => note.isRest()) && beam.getNotes().some((note) => !note.isRest()))
    expect(beamed).toBe(true)
  })

  it('flattens a beam that leaps more than an octave on the staff', () => {
    const voice: Voice = [
      { start: 0, dur: 1, pitches: ['C6'], velocity: 70 },
      { start: 1, dur: 1, pitches: ['C4'], velocity: 70 },
      { start: 2, dur: 1, pitches: ['C6'], velocity: 70 },
      { start: 3, dur: 1, pitches: ['C4'], velocity: 70 },
    ]
    const [built] = voicesForStaff([voice], 'treble', meter)
    expect(built.beams.length).toBeGreaterThan(0)
    built.beams.forEach(flattenWideBeams)
    expect(built.beams.some((beam) => beam.renderOptions.flatBeams)).toBe(true)
  })

  it('ties only shared keys and keeps the tie on the voice\'s stem side', () => {
    const voice: Voice = [{ start: 0, dur: 5, pitches: ['C4', 'G4'], velocity: 70 }]
    const [built] = voicesForStaff([voice], 'treble', meter)
    expect(built.ties.length).toBeGreaterThan(0)
    const first = built.ties[0]
    const notes = first.getNotes()
    const { firstIndexes, lastIndexes } = tieIndexes(notes.firstNote as never, notes.lastNote as never)
    expect(firstIndexes.length).toBeGreaterThan(0)
    expect(firstIndexes).toEqual(lastIndexes)
    expect(first.getDirection()).toBeDefined()
  })

  it('widens the grand-staff gap when bass climbs into the treble', () => {
    const quiet = systemPadding([
      { index: 0, plan: { chord: 'I', contour: 'arch' }, role: 'statement' as const, chordSymbol: 'C', treble: [[{ start: 0, dur: 16, pitches: ['G4'], velocity: 70 }]], bass: [[{ start: 0, dur: 16, pitches: ['C3'], velocity: 64 }]], dynamic: 'mf' },
    ])
    const crowded = systemPadding([
      { index: 0, plan: { chord: 'I', contour: 'arch' }, role: 'statement' as const, chordSymbol: 'C', treble: [[{ start: 0, dur: 16, pitches: ['G4'], velocity: 70 }]], bass: [[{ start: 0, dur: 16, pitches: ['E4', 'F#4'], velocity: 64 }]], dynamic: 'mf' },
    ])
    expect(quiet.gap).toBe(0)
    expect(crowded.gap).toBeGreaterThan(quiet.gap)
  })
})

function testBar(index: number, treble: Voice[], bass: Voice[] = [whole('C3')]): Bar {
  return {
    index,
    plan: { chord: 'i', contour: 'arch' },
    role: 'statement',
    chordSymbol: 'Fm',
    treble,
    bass,
    dynamic: 'pp',
  }
}

function testScore(bars: Bar[]): Score {
  return {
    plan: { version: 2 } as unknown as Score['plan'],
    seed: 1,
    keySignature: 'C',
    meter,
    bpm: 80,
    bars,
    pedal: 'half',
    articulation: 1,
    ritardando: false,
  }
}

const DESKTOP_WIDTH = 960
const FIRST_LEAD = 54 + 6 + 30

describe('dense-bar width and labels', () => {
  it('gives a 16th-note bar a width floor so Formatter is not squeezed', () => {
    const bar = testBar(0, [sixteenths('G5')], [sixteenths('C3')])
    const density = barDensity(bar, meter)
    expect(density).toBeGreaterThanOrEqual(16)
    expect(minBarWidth(density)).toBeGreaterThanOrEqual(400)
    expect(() => {
      const upper = buildStaff([sixteenths('G5')], 'treble')
      const lower = buildStaff([sixteenths('C3')], 'bass')
      formatTogether(upper, lower, true)
      for (const row of upper[0].notes.map((note) => note.getYs())) expect(row.length).toBeGreaterThan(0)
      for (const dirs of [...beamStemSets(upper), ...beamStemSets(lower)]) expect(dirs).toHaveLength(1)
    }).not.toThrow()
  })

  it('puts a dense 16th bar on its own system at desktop width', () => {
    const dense = testScore(Array.from({ length: 4 }, (_, i) => testBar(i, [sixteenths('G5')], [sixteenths('Eb2')])))
    expect(chooseBarsPerSystem(dense, DESKTOP_WIDTH, FIRST_LEAD)).toBe(1)
    const systems = packSystems(dense, DESKTOP_WIDTH, FIRST_LEAD, FIRST_LEAD - 30)
    expect(systems.every((system) => system.length === 1)).toBe(true)
    expect(systems).toHaveLength(4)
  })

  it('still packs four sparse bars onto one system', () => {
    const sparse = testScore(Array.from({ length: 4 }, (_, i) => testBar(i, [whole('G4')])))
    const systems = packSystems(sparse, DESKTOP_WIDTH, FIRST_LEAD, FIRST_LEAD - 30)
    expect(systems).toHaveLength(1)
    expect(systems[0]).toHaveLength(4)
  })

  it('charges extra density when two voices share a staff', () => {
    const single = testBar(0, [sixteenths('G5')])
    const doubled = testBar(0, [sixteenths('G5'), sixteenths('E5')])
    expect(barDensity(doubled, meter)).toBeGreaterThan(barDensity(single, meter))
  })

  it('formats a Jev melody over a leftover 16th inner voice without fighting stems', () => {
    const melody: Voice = [
      { start: 0, dur: 4, pitches: ['C5'], velocity: 80 },
      { start: 4, dur: 4, pitches: ['G4'], velocity: 80 },
      { start: 8, dur: 4, pitches: ['E4'], velocity: 80 },
      { start: 12, dur: 4, pitches: ['C5'], velocity: 80 },
    ]
    const leftover = sixteenths('G4')
    expect(voicesForStaff([melody, leftover, leftover], 'treble', meter)).toHaveLength(2)
    const upper = voicesForStaff([melody], 'treble', meter)
    const lower = voicesForStaff([whole('C3')], 'bass', meter)
    expect(() => formatTogether(upper, lower, true)).not.toThrow()
    expect(upper).toHaveLength(1)
    for (const dirs of beamStemSets(upper)) expect(dirs).toHaveLength(1)
    for (const row of upper[0].notes.map((note) => note.getYs())) expect(row.length).toBeGreaterThan(0)
  })

  it('places dynamics below the bass staff and chords above the treble', () => {
    const top = 80
    const gap = 96
    const x = 20
    const noteStart = 110
    const first = sheetLabelLayout(top, gap, x, noteStart, true)
    const later = sheetLabelLayout(top, gap, x, noteStart, false)
    expect(first.chordY).toBe(top - CHORD_ABOVE_STAFF)
    expect(first.chordY).toBeLessThan(top - 8)
    expect(first.dynamicY).toBe(top + gap + DYNAMIC_BELOW_BASS)
    // VexFlow bass lines occupy staveY+40 .. staveY+80.
    expect(first.dynamicY).toBeGreaterThan(top + gap + 80)
    expect(first.dynamicX).toBeLessThan(noteStart)
    expect(first.roleY).toBeGreaterThan(first.dynamicY)
    expect(later.dynamicX).toBeGreaterThanOrEqual(x)
  })
})

/** A canvas whose 2D context accepts every call and draws nothing. */
function blankCanvas(): HTMLCanvasElement {
  const canvas = { width: 0, height: 0, style: {}, toDataURL: () => '', getContext: () => context } as unknown as HTMLCanvasElement
  const context: object = new Proxy({} as Record<string | symbol, unknown>, {
    get: (target, prop) =>
      prop in target
        ? target[prop]
        : prop === 'measureText'
          ? () => ({ width: 8, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 })
          : prop === 'canvas'
            ? canvas
            : prop === 'getLineDash'
              ? () => []
              : () => {},
    set: (target, prop, value) => ((target[prop] = value), true),
  })
  return canvas
}

describe('ties over the barline', () => {
  it('ties the tune into the next bar, and across a system break in two halves', () => {
    const plan: CompositionPlan = {
      version: 2,
      style: 'bach',
      register: 'mid',
      motion: 'flowing',
      accompaniment: 'counterline',
      form: 'period',
      key: 'C_major',
      meter: 'four_four',
      palette: 'diatonic',
      tempo: 'adagio',
      dynamics: 'mf',
      dynamicShape: 'steady',
      bars: Array.from({ length: 16 }, (_, i) => ({ chord: (['I', 'IV', 'V', 'I'] as const)[i % 4], contour: 'wave' as const })),
    }
    const score = renderPlan(plan, 2)
    const heldBars = score.bars.flatMap((bar) => (bar.treble[0]?.[0]?.tied ? [bar.index] : []))
    expect(heldBars.length).toBeGreaterThan(0)
    const theme = { ink: '#000', muted: '#666', accent: '#a00' } as unknown as Parameters<typeof drawScore>[3]
    // VexFlow warns that it cannot measure text without a DOM; the notes do not care.
    const quiet = vi.spyOn(console, 'warn').mockImplementation(() => {})
    for (const width of [420, 6000]) {
      const drawn: { first: boolean; last: boolean }[] = []
      const draw = vi.spyOn(StaveTie.prototype, 'draw').mockImplementation(function (this: StaveTie) {
        drawn.push({ first: Boolean(this.getNotes().firstNote), last: Boolean(this.getNotes().lastNote) })
        return true
      })
      const layout = drawScore(blankCanvas(), score, width, theme)
      draw.mockRestore()
      const top = new Map(layout.bars.map((bar) => [bar.index, bar.top]))
      const broken = heldBars.filter((i) => top.get(i) !== top.get(i - 1)).length
      expect(drawn.filter((tie) => tie.first && !tie.last), `${width}px: a half-tie leaves each system that breaks a held note`).toHaveLength(broken)
      expect(drawn.filter((tie) => !tie.first && tie.last), `${width}px: and one arrives on the next`).toHaveLength(broken)
      expect(drawn.filter((tie) => tie.first && tie.last).length, `${width}px: whole ties within a system`).toBeGreaterThanOrEqual(heldBars.length - broken)
    }
    quiet.mockRestore()
  })

  it('draws a generated piece in every style and metre', async () => {
    // Syncopations, run-on cadences and figured bars write lengths the old
    // rhythms never did; every one of them has to engrave.
    const { HeuristicPlanner } = await import('../planner/HeuristicPlanner')
    const { METER_IDS, STYLE_IDS } = await import('../plan/schema')
    const theme = { ink: '#000', muted: '#666', accent: '#a00' } as unknown as Parameters<typeof drawScore>[3]
    const quiet = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const planner = new HeuristicPlanner()
    for (const style of STYLE_IDS) {
      for (const [k, meter] of METER_IDS.entries()) {
        const { plan } = await planner.plan({ style, bars: 16, pick: 'sample', seed: k + 1, brief: true })
        const score = renderPlan({ ...plan, meter }, k + 1)
        const layout = drawScore(blankCanvas(), score, 900, theme)
        expect(layout.bars, `${style} in ${meter}`).toHaveLength(16)
      }
    }
    quiet.mockRestore()
  }, 30_000)
})
