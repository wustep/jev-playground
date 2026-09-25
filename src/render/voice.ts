// Primitives shared by the melody writer and the accompaniment patterns.
//
// Deliberately small. The previous renderer had a 200-line `BarContext` that
// every one of 23 textures reached into for anything it fancied; the two
// writers here take what they need as arguments instead.

import type { ContourId, PaletteId } from '../plan/schema'
import type { BarPosition } from '../plan/phrase'
import type { KeyInfo, ResolvedChord } from './harmony'
import { clamp } from './pitch'
import type { MeterInfo, Note } from './score'

/** A sounding position in a bar. Gaps between slots are rests, and they are the point. */
export interface Slot {
  start: number
  dur: number
}

/** Durations → slots. A negative duration is a rest of that length. */
export function slotsFrom(rhythm: readonly number[]): Slot[] {
  const slots: Slot[] = []
  let start = 0
  for (const value of rhythm) {
    if (value > 0) slots.push({ start, dur: value })
    start += Math.abs(value)
  }
  return slots
}

export function note(start: number, dur: number, pitches: string | string[], velocity: number, extra: Partial<Note> = {}): Note {
  return {
    start,
    dur,
    pitches: Array.isArray(pitches) ? pitches : [pitches],
    velocity: clamp(Math.round(velocity), 1, 127),
    ...extra,
  }
}

export const choose = <T>(items: readonly T[], rand: () => number): T => items[Math.floor(rand() * items.length)]

/** A bar of the melody, remembered so a later bar can bring it back. */
export interface Remembered {
  chord: string
  root: string
  core: string[]
  /** One spelled pitch per slot, in order. */
  pitches: string[]
  /** The slots those pitches were written on. */
  slots: Slot[]
}

/** Everything the writers carry from bar to bar. One object per piece. */
export interface PieceMemory {
  /** Last sounding MIDI of the melody, so the line continues rather than restarting. */
  melodyLast?: number
  /** Every melody bar, by index — what a return reads. */
  melody: Record<number, Remembered>
  /** Last left-hand voicing and bass note, for voice-leading. */
  voicing?: string[]
  bass?: string
  /** Last sounding MIDI of the counterline, for the duet accompaniment. */
  counterLast?: number
  /** Per-piece pattern choices, rolled once so a piece is consistent with itself. */
  choices: Record<string, number>
}

export const newMemory = (): PieceMemory => ({ melody: {}, choices: {} })

/** Pick one of `count` variants for this piece, once, and remember it. */
export function pieceChoice(memory: PieceMemory, rand: () => number, key: string, count: number): number {
  const known = memory.choices[key]
  if (known != null) return known % count
  return (memory.choices[key] = Math.floor(rand() * count)) % count
}

/** One bar of context, the same shape for both writers. */
export interface BarView {
  index: number
  count: number
  isLast: boolean
  position: BarPosition
  /**
   * Dress this bar's return with fioritura rather than restate it. The form
   * asks for it on a late return; a style that decorates its first answer
   * too (`StyleVoice.answers`) asks for it on every return.
   */
  ornament: boolean
  contour: ContourId
  chord: ResolvedChord
  /** The bar's second harmony, when it has one. */
  chord2?: ResolvedChord
  next?: ResolvedChord
  /** Melody / passing-tone pitch classes under this bar's chord. */
  scale: string[]
  /** The same under the bar's second chord, when it has one. */
  scale2?: string[]
  palette: PaletteId
  key: KeyInfo
  meter: MeterInfo
  /** Base MIDI velocity for this bar after the dynamic shape. */
  velocity: number
  rand: () => number
  memory: PieceMemory
}

/** Which half of a split bar a tick belongs to. */
export const chordAt = (bar: BarView, tick: number): ResolvedChord =>
  bar.chord2 && tick >= bar.meter.splitTick ? bar.chord2 : bar.chord

/**
 * The passing-note scale at a tick: the second chord's from where it takes
 * over. The line's weak notes used to come from the first chord's scale all
 * bar long, so a minor-key i6/4–V7 bar ran B♭ and A♭ against the V7's B.
 */
export const scaleAt = (bar: Pick<BarView, 'chord2' | 'scale' | 'scale2' | 'meter'>, tick: number): string[] =>
  bar.chord2 && bar.scale2 && tick >= bar.meter.splitTick ? bar.scale2 : bar.scale

/** Beats in a bar, counting the felt beat (a dotted quarter in compound metres). */
export const beatsPerBar = (meter: MeterInfo) => Math.round(meter.ticksPerBar / meter.beatTicks)

