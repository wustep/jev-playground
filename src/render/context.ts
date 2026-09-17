import type { BarPlan, BarRoleId, PaletteId } from '../plan/schema'
import type { KeyInfo, ResolvedChord } from './harmony'
import { clamp } from './pitch'
import type { MeterInfo, Note, Voice } from './score'

/** State a texture carries from bar to bar (voice-leading, motif memory). */
export interface RenderMemory {
  /** Last sounding pitch of a named line, as MIDI. */
  lines: Record<string, number>
  /** Last voicing of a named hand/part. */
  voicings: Record<string, string[]>
  /** Rhythm of the first statement, reused by restatements. */
  rhythms: Record<string, number[]>
  bass?: string
}

export interface BarContext {
  index: number
  count: number
  isLast: boolean
  plan: BarPlan
  chord: ResolvedChord
  next?: ResolvedChord
  /** Melody / passing-tone pitch classes for this bar. */
  scale: string[]
  palette: PaletteId
  /** Base MIDI velocity for this bar, after the dynamic shape is applied. */
  velocity: number
  meter: MeterInfo
  key: KeyInfo
  rand: () => number
  memory: RenderMemory
}

export interface BarNotes {
  treble: Voice[]
  bass: Voice[]
}

export type Texture = (bar: BarContext) => BarNotes

export interface Slot {
  start: number
  dur: number
}

/** Durations → slots. Negative durations are rests. */
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

/** Rhythm vocabulary for one meter, keyed by what the bar needs to do. */
export interface RhythmBank {
  main: number[][]
  busy: number[][]
  sparse: number[][]
  pause: number[][]
  close: number[][]
}

const BANK_FOR_ROLE: Record<BarRoleId, keyof RhythmBank> = {
  statement: 'main',
  restatement: 'main',
  development: 'busy',
  contrast: 'sparse',
  climax: 'busy',
  half_cadence: 'pause',
  cadence: 'close',
}

/**
 * Pick a rhythm for this bar's role. The first statement's rhythm is
 * remembered under `memoryKey`, and restatements reuse it — that repetition
 * is most of what makes a generated line read as a motif.
 */
export function rhythmFor(bar: BarContext, bank: RhythmBank, memoryKey: string): number[] {
  const role = bar.plan.role
  if (bar.isLast) return choose(bank.close, bar.rand)
  if (role === 'statement' || role === 'restatement') {
    const remembered = bar.memory.rhythms[memoryKey]
    if (remembered) return remembered
    const fresh = choose(bank.main, bar.rand)
    bar.memory.rhythms[memoryKey] = fresh
    return fresh
  }
  return choose(bank[BANK_FOR_ROLE[role]], bar.rand)
}
