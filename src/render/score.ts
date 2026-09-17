// The renderer's output: notes on a sixteenth-note grid, already split into
// staves and voices. Sheet, playback and MIDI export all read this one shape.

import type { BarPlan, CompositionPlan, DynamicId, MeterId } from '../plan/schema'

/** Sixteenth notes. Every duration and onset in a Score is a whole number of ticks. */
export const TICKS_PER_QUARTER = 4

export interface MeterInfo {
  id: MeterId
  num: number
  den: number
  ticksPerBar: number
  /** Length of one felt beat: a quarter (4) or, in 6/8, a dotted quarter (6). */
  beatTicks: number
}

export const METER_INFO: Record<MeterId, MeterInfo> = {
  four_four: { id: 'four_four', num: 4, den: 4, ticksPerBar: 16, beatTicks: 4 },
  three_four: { id: 'three_four', num: 3, den: 4, ticksPerBar: 12, beatTicks: 4 },
  six_eight: { id: 'six_eight', num: 6, den: 8, ticksPerBar: 12, beatTicks: 6 },
}

export interface Note {
  /** Onset in ticks from the start of the bar. */
  start: number
  /** Length in ticks; never crosses the barline. */
  dur: number
  /** Spelled pitches, low to high, e.g. ['Eb4', 'G4']. One entry = single note. */
  pitches: string[]
  /** MIDI velocity 1–127. */
  velocity: number
  accent?: boolean
  /** Spread the chord upward on playback (harp / rolled voicing). */
  roll?: boolean
}

/** Monophonic-in-time line: sorted, non-overlapping. Gaps are rests. */
export type Voice = Note[]

export interface Bar {
  index: number
  plan: BarPlan
  /** Absolute chord name in the chosen key, e.g. "Abmaj7". */
  chordSymbol: string
  /** Up to two voices per staff (first = stems up). */
  treble: Voice[]
  bass: Voice[]
  /** Dynamic marking in force; the sheet prints it when it changes. */
  dynamic: DynamicId
}

export interface Score {
  plan: CompositionPlan
  seed: number
  /** VexFlow key spec: "Eb", "F#m", … */
  keySignature: string
  meter: MeterInfo
  bpm: number
  bars: Bar[]
  /** Hold the sustain pedal through each bar (playback + MIDI CC64). */
  pedal: boolean
  /** 0–1: how much of a short note's written length sounds (the character's touch). */
  articulation: number
}

/** A sounding note with absolute timing, for playback and MIDI export. */
export interface TimedNote {
  midi: number
  /** Seconds from the start of the piece. */
  time: number
  duration: number
  velocity: number
  bar: number
  hand: 'right' | 'left'
}
