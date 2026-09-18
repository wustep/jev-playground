import { describe, expect, it } from 'vitest'
import { Note } from 'tonal'
import type { BarPlan, ChordId, CompositionPlan } from '../plan/schema'
import { keyInfo, resolveChord } from './harmony'
import { fitTo, rootShift } from './melody'
import { midiOf } from './pitch'
import { renderPlan } from './renderPlan'
import type { Voice } from './score'

const bar = (chord: ChordId, role: BarPlan['role'], chord2?: ChordId): BarPlan => ({ chord, role, contour: 'arch', ...(chord2 ? { chord2 } : {}) })
const plan = (bars: BarPlan[], overrides: Partial<CompositionPlan> = {}): CompositionPlan => ({
  version: 1, style: 'beethoven', character: 'lyrical_song', form: 'period', key: 'C_major', meter: 'four_four', texture: 'alberti_melody', palette: 'diatonic',
  tempo: 'adagio', dynamics: 'p', dynamicShape: 'steady', defaultInstrument: 'grand_piano', bars, ...overrides,
})
const tops = (voice: Voice) => voice.map((n) => midiOf(n.pitches[n.pitches.length - 1]))
const rhythm = (voice: Voice) => voice.map((n) => `${n.start}:${n.dur}`).join(' ')
const intervals = (line: number[]) => line.map((m) => m - line[0])
const chroma = (pitch: string) => Note.chroma(pitch) ?? -1
const chordChromas = (key: 'C_major', chord: ChordId) => new Set(resolveChord(keyInfo(key), chord).pcs.map(chroma))

describe('motif transposition', () => {
  it('moves a figure by the smallest interval between chord roots', () => {
    expect(rootShift('C', 'D')).toBe(2)
    expect(rootShift('C', 'G')).toBe(-5) // a fifth up is heard as a fourth down
    expect(rootShift('G', 'C')).toBe(5)
    expect(rootShift('C', 'A')).toBe(-3)
    expect(rootShift('C', 'C')).toBe(0)
    expect(fitTo(['C4', 'E4', 'G4'], 3)).toEqual(['C4', 'E4', 'G4'])
    expect(fitTo(['C4', 'E4', 'G4', 'B4'], 2)).toEqual(['C4', 'B4'])
    expect(fitTo(['C4', 'G4'], 3)).toEqual(['C4', 'G4', 'G4'])
    expect(fitTo([], 4)).toEqual([])
  })

  it('sequences the previous bar onto a new chord with the same rhythm and interval shape', () => {
    const score = renderPlan(plan([bar('I', 'statement'), bar('ii', 'sequence'), bar('iii', 'sequence'), bar('I', 'cadence')]), 5)
    const [statement, up, upAgain] = score.bars.map((b) => b.treble[0])
    expect(rhythm(up)).toBe(rhythm(statement))
    expect(rhythm(upAgain)).toBe(rhythm(statement))
    // A tonal sequence: every interval within ±1 semitone of the model, and the whole figure a step higher each time.
    const [a, b, c] = [tops(statement), tops(up), tops(upAgain)]
    intervals(b).forEach((ivl, k) => expect(Math.abs(ivl - intervals(a)[k])).toBeLessThanOrEqual(1))
    intervals(c).forEach((ivl, k) => expect(Math.abs(ivl - intervals(a)[k])).toBeLessThanOrEqual(1))
    // (mod 12: a figure that would leave the register is brought back down an octave)
    expect([1, 2]).toContain(((b[0] - a[0]) % 12 + 12) % 12)
    expect([1, 2]).toContain(((c[0] - b[0]) % 12 + 12) % 12)
    // Downbeats sit on chord tones of the new harmony.
    const ii = chordChromas('C_major', 'ii')
    expect(up.filter((n) => n.start % 4 === 0).every((n) => ii.has(chroma(n.pitches[n.pitches.length - 1])))).toBe(true)
  })

  it('echoes the previous bar literally over the same chord, and transposes it over another', () => {
    const same = renderPlan(plan([bar('I', 'statement'), bar('I', 'echo'), bar('V7', 'development'), bar('I', 'cadence')]), 2)
    expect(tops(same.bars[1].treble[0])).toEqual(tops(same.bars[0].treble[0]))
    expect(rhythm(same.bars[1].treble[0])).toBe(rhythm(same.bars[0].treble[0]))
    const moved = renderPlan(plan([bar('I', 'statement'), bar('IV', 'echo'), bar('V7', 'development'), bar('I', 'cadence')]), 2)
    const [a, b] = [tops(moved.bars[0].treble[0]), tops(moved.bars[1].treble[0])]
    expect(b).not.toEqual(a)
    intervals(b).forEach((ivl, k) => expect(Math.abs(ivl - intervals(a)[k])).toBeLessThanOrEqual(1))
  })

  it('keeps the tune when a restatement is reharmonised over a related chord', () => {
    // I and vi share two tones: the return keeps the melody and only settles strong beats on the new chord.
    const score = renderPlan(plan([bar('I', 'statement'), bar('V7', 'development'), bar('vi', 'restatement'), bar('I', 'cadence')]), 3)
    const [a, c] = [tops(score.bars[0].treble[0]), tops(score.bars[2].treble[0])]
    expect(rhythm(score.bars[2].treble[0])).toBe(rhythm(score.bars[0].treble[0]))
    const kept = c.filter((m, k) => m === a[k]).length
    expect(kept).toBeGreaterThanOrEqual(Math.ceil(a.length / 2))
    const vi = chordChromas('C_major', 'vi')
    expect(score.bars[2].treble[0].filter((n) => n.start % 4 === 0).every((n) => vi.has(chroma(n.pitches[n.pitches.length - 1])))).toBe(true)
  })

  it('develops by stating the head of the motif on the new chord and then a step on', () => {
    const score = renderPlan(plan([bar('I', 'statement'), bar('V7', 'development'), bar('I', 'restatement'), bar('I', 'cadence')]), 4)
    const motif = tops(score.bars[0].treble[0])
    const developed = tops(score.bars[1].treble[0])
    const head = Math.ceil(developed.length / 2)
    // The first fragment has the motif's opening shape (transposed); the second is that fragment moved by a step.
    const first = developed.slice(0, head)
    const second = developed.slice(head)
    const model = fitTo(motif.map(String), head).map(Number)
    intervals(first).forEach((ivl, k) => expect(Math.abs(ivl - intervals(model)[k])).toBeLessThanOrEqual(2))
    second.forEach((m, k) => expect(Math.abs(m - first[k])).toBeLessThanOrEqual(3))
    expect(developed).not.toEqual(motif)
  })
})

describe('two harmonies in one bar', () => {
  it('changes the accompaniment to the second chord at the split tick and holds common tones through', () => {
    const score = renderPlan(plan([bar('I', 'statement'), bar('I64', 'half_cadence', 'V'), bar('I', 'restatement'), bar('I', 'cadence')]), 7)
    const split = score.bars[1]
    expect(split.split).toEqual({ tick: 8, chordSymbol: 'G' })
    expect(score.bars[0].split).toBeUndefined()
    const left = split.bass[0]
    const before = left.filter((n) => n.start < 8)
    const after = left.filter((n) => n.start >= 8)
    expect(before.length).toBeGreaterThan(0)
    expect(after.length).toBeGreaterThan(0)
    const i64 = chordChromas('C_major', 'I64')
    const v = chordChromas('C_major', 'V')
    expect(before.every((n) => n.pitches.every((p) => i64.has(chroma(p))))).toBe(true)
    expect(after.every((n) => n.pitches.every((p) => v.has(chroma(p))))).toBe(true)
    // The bass note under the six-four IS the dominant: it stays put across the split.
    expect(chroma(before[0].pitches[0])).toBe(chroma(after[0].pitches[0]))
    // Every voice is still clean and inside the bar.
    for (const voice of [...split.treble, ...split.bass]) {
      let cursor = 0
      for (const n of voice) {
        expect(n.start).toBeGreaterThanOrEqual(cursor)
        expect(n.start + n.dur).toBeLessThanOrEqual(16)
        cursor = n.start + n.dur
      }
    }
  })

  it('splits at the third beat in 3/4 and at the half bar in 6/8, for every texture', () => {
    for (const [meter, tick] of [['three_four', 8], ['six_eight', 6]] as const) {
      const score = renderPlan(plan([bar('I', 'statement'), bar('ii65', 'development', 'V7'), bar('I', 'restatement'), bar('I', 'cadence')], { meter }), 1)
      expect(score.bars[1].split?.tick).toBe(tick)
    }
  })

  it('is deterministic and leaves the bars around a split bar unchanged', () => {
    const bars = [bar('I', 'statement'), bar('V7', 'development'), bar('I', 'restatement'), bar('I', 'cadence')]
    const plain = renderPlan(plan(bars), 9)
    const withSplit = renderPlan(plan([bars[0], bar('ii65', 'development', 'V7'), bars[2], bars[3]]), 9)
    expect(renderPlan(plan([bars[0], bar('ii65', 'development', 'V7'), bars[2], bars[3]]), 9)).toEqual(withSplit)
    expect(withSplit.bars[0].treble).toEqual(plain.bars[0].treble)
    expect(withSplit.bars[0].bass).toEqual(plain.bars[0].bass)
  })
})
