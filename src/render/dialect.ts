// Per-style renderer dialect: closed knobs textures and phrasing read from
// BarContext. This is feel and local grammar, not composition — the planner
// still only emits enum labels. Every option is a small closed set so two
// seeds of the same style stay comparable and tests can assert the table.
//
// Lives next to FEEL in renderPlan: character decides *how hard* the metre
// is leaned on; style dialect decides *which* non-chord tones, cadence
// ornaments, bass spacing and timing curve the renderer is allowed to use.

import { Note as TonalNote } from 'tonal'
import type { StyleId } from '../plan/schema'
import { note, type BarContext, type BarNotes, type Slot } from './context'
import { clamp, ladder, midiOf, nearestIndex, tidyNote } from './pitch'
import type { Note, Score, Voice } from './score'

export const NON_CHORD_TONES = {
  passing: 'Weak notes fill the step between neighbouring chord tones',
  appoggiatura: 'A strong beat may lean on a neighbour and resolve by step',
  leave_added: 'Added sixths and ninths stay as colour; they are not resolved away',
} as const
export type NonChordToneId = keyof typeof NON_CHORD_TONES

export const CADENCE_ORNAMENTS = {
  mordent: 'The cadence’s first long treble note turns: main – lower neighbour – main',
  trill: 'The cadence’s first long treble note alternates with its upper neighbour',
  sforzando: 'The cadence’s downbeat is a sudden accent, no extra notes',
  none: 'The cadence is played as written, without an extra ornament',
} as const
export type CadenceOrnamentId = keyof typeof CADENCE_ORNAMENTS

export const BASS_SPACINGS = {
  close_chorale: 'Left-hand fill sits a third or fourth above the bass',
  default: 'Left-hand fill sits a fifth-ish above the bass',
  open_tenths: 'Left-hand fill sits a tenth above the bass',
} as const
export type BassSpacingId = keyof typeof BASS_SPACINGS

export const TIMING_CURVES = {
  even: 'Every attack sits on the written sixteenth grid',
  light_rubato: 'A small sine leans the middle of the bar; barlines stay put',
  swing_laid_back: 'Off-beats delay a little and the whole line sits behind the beat',
  two_against_three: 'In duple metres the second of each eighth pair delays toward a triplet; compound metres stay even',
} as const
export type TimingCurveId = keyof typeof TIMING_CURVES

export interface StyleDialect {
  nonChordTone: NonChordToneId
  cadenceOrnament: CadenceOrnamentId
  bassSpacing: BassSpacingId
  timing: TimingCurveId
}

export const STYLE_DIALECTS: Record<StyleId, StyleDialect> = {
  bach: { nonChordTone: 'passing', cadenceOrnament: 'mordent', bassSpacing: 'close_chorale', timing: 'even' },
  beethoven: { nonChordTone: 'passing', cadenceOrnament: 'sforzando', bassSpacing: 'default', timing: 'even' },
  chopin: { nonChordTone: 'appoggiatura', cadenceOrnament: 'mordent', bassSpacing: 'open_tenths', timing: 'light_rubato' },
  debussy: { nonChordTone: 'leave_added', cadenceOrnament: 'none', bassSpacing: 'open_tenths', timing: 'light_rubato' },
  glass: { nonChordTone: 'leave_added', cadenceOrnament: 'none', bassSpacing: 'default', timing: 'two_against_three' },
  hans_zimmer: { nonChordTone: 'passing', cadenceOrnament: 'sforzando', bassSpacing: 'open_tenths', timing: 'even' },
  laufey: { nonChordTone: 'appoggiatura', cadenceOrnament: 'none', bassSpacing: 'default', timing: 'swing_laid_back' },
  elijah_fox: { nonChordTone: 'leave_added', cadenceOrnament: 'none', bassSpacing: 'open_tenths', timing: 'light_rubato' },
}

/** Semitone target above the bass for the left-hand fill tone. */
export const BASS_SPACING_INTERVAL: Record<BassSpacingId, number> = {
  close_chorale: 3,
  default: 7,
  open_tenths: 16,
}

/** True when `pitch` is an added colour tone of this bar's chord (6, 9, or a written extension). */
export function isAddedTone(bar: BarContext, pitch: string): boolean {
  const pitchChroma = TonalNote.chroma(pitch)
  if (pitchChroma == null) return false
  if (bar.chord.extensions.some((pc) => TonalNote.chroma(pc) === pitchChroma)) return true
  const root = TonalNote.chroma(bar.chord.root)
  if (root == null) return false
  const delta = (pitchChroma - root + 12) % 12
  const added = delta === 9 || delta === 2
  return added && !bar.chord.core.some((pc) => TonalNote.chroma(pc) === pitchChroma)
}

function neighbour(bar: BarContext, pitch: string, direction: -1 | 1): string {
  const rungs = ladder(bar.scale, 20, 108)
  if (rungs.length === 0) return pitch
  return rungs[clamp(nearestIndex(rungs, midiOf(pitch)) + direction, 0, rungs.length - 1)]
}

/**
 * Rewrite a freshly drawn melody according to the style's non-chord-tone knob.
 * Strong beats stay chord tones (except a true appoggiatura); weak beats may
 * become passing tones. `leave_added` keeps colour tones and skips the
 * chromatic-approach rewrite the caller would otherwise apply.
 */
export function applyNonChordTones(bar: BarContext, slots: readonly Slot[], pitches: string[], isStrong: (slot: Slot) => boolean): string[] {
  if (pitches.length === 0) return pitches
  const out = [...pitches]
  switch (bar.dialect.nonChordTone) {
    case 'leave_added':
      return out
    case 'passing': {
      for (let k = 1; k < out.length - 1; k++) {
        if (isStrong(slots[k])) continue
        const prev = midiOf(out[k - 1])
        const next = midiOf(out[k + 1])
        const span = Math.abs(next - prev)
        if (span < 3 || span > 5) continue
        const lo = Math.min(prev, next) + 1
        const hi = Math.max(prev, next) - 1
        const between = ladder(bar.scale, lo, hi)
        if (between.length > 0) out[k] = between[nearestIndex(between, (prev + next) / 2)]
      }
      return out
    }
    case 'appoggiatura': {
      for (let k = 1; k < out.length; k++) {
        if (!isStrong(slots[k])) continue
        if (slots[k].dur < 2) continue
        const target = out[k]
        if (k + 1 < out.length && !isStrong(slots[k + 1])) {
          out[k] = neighbour(bar, target, 1)
          out[k + 1] = target
        } else {
          // No weak slot to resolve onto: lean a chromatic step above and keep the written length.
          out[k] = tidyNote(TonalNote.transpose(target, '2m'))
        }
      }
      return out
    }
  }
}

function accentDownbeats(notes: BarNotes): BarNotes {
  const mark = (voices: Voice[]): Voice[] =>
    voices.map((voice) =>
      voice.map((n) => (n.start === 0 ? { ...n, velocity: clamp(n.velocity + 14, 1, 127), accent: true } : n)),
    )
  return { treble: mark(notes.treble), bass: mark(notes.bass) }
}

function ornamentFirstTreble(notes: BarNotes, bar: BarContext, kind: 'mordent' | 'trill'): BarNotes {
  const voice = notes.treble[0]
  if (!voice?.length) return notes
  const first = voice[0]
  const minDur = kind === 'trill' ? 6 : 4
  if (first.dur < minDur || first.start % bar.meter.beatTicks !== 0) return notes
  const top = first.pitches[first.pitches.length - 1]
  const below = neighbour(bar, top, -1)
  const above = neighbour(bar, top, 1)
  const extra: Note[] = []
  if (kind === 'mordent') {
    extra.push(note(first.start, 1, top, first.velocity + 2), note(first.start + 1, 1, below, first.velocity - 4))
    extra.push({ ...first, start: first.start + 2, dur: first.dur - 2 })
  } else {
    extra.push(
      note(first.start, 1, top, first.velocity + 2),
      note(first.start + 1, 1, above, first.velocity - 2),
      note(first.start + 2, 1, top, first.velocity),
      note(first.start + 3, 1, above, first.velocity - 2),
    )
    extra.push({ ...first, start: first.start + 4, dur: first.dur - 4 })
  }
  return { ...notes, treble: [[...extra, ...voice.slice(1)], ...notes.treble.slice(1)] }
}

/** Cadence-only ornament. Other bars are returned unchanged. */
export function applyCadenceOrnament(notes: BarNotes, bar: BarContext): BarNotes {
  if (bar.role !== 'cadence' && !bar.isLast) return notes
  switch (bar.dialect.cadenceOrnament) {
    case 'none':
      return notes
    case 'sforzando':
      return accentDownbeats(notes)
    case 'mordent':
      return ornamentFirstTreble(notes, bar, 'mordent')
    case 'trill':
      return ornamentFirstTreble(notes, bar, 'trill')
  }
}

/**
 * Seconds to shift an attack. Closed curves only: a few milliseconds of
 * rubato / swing / 2:3, never a free clock. Barlines stay on the grid.
 */
export function timingOffsetSeconds(score: Score, startTick: number, secondsPerTick: number): number {
  const dialect = STYLE_DIALECTS[score.plan.style]
  const { beatTicks, ticksPerBar } = score.meter
  const t = startTick / ticksPerBar
  switch (dialect.timing) {
    case 'even':
      return 0
    case 'light_rubato':
      // Peak ±0.35 of a sixteenth at mid-bar; zero at the barline.
      return Math.sin(2 * Math.PI * t) * secondsPerTick * 0.35
    case 'swing_laid_back': {
      const laidBack = secondsPerTick * 0.14
      const inBeat = startTick % beatTicks
      const swing = inBeat === 0 ? 0 : inBeat === beatTicks / 2 ? secondsPerTick * 0.2 : secondsPerTick * 0.08
      return laidBack + swing
    }
    case 'two_against_three': {
      if (beatTicks !== 4) return 0
      const inBeat = startTick % 4
      if (inBeat === 2) return secondsPerTick * 0.33
      if (inBeat === 1 || inBeat === 3) return secondsPerTick * 0.12
      return 0
    }
  }
}
