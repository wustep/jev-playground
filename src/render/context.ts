import type { BarPlan, BaseRoleId, CharacterId, PaletteId } from '../plan/schema'
import type { StyleDialect } from './dialect'
import type { KeyInfo, ResolvedChord } from './harmony'
import { clamp } from './pitch'
import { phrasingOf, phraseRestTicks, withEndRest } from './phrasing'
import type { MeterInfo, Note, Voice } from './score'

/** A remembered bar of one line: its pitches, and the chord they were heard over. */
export interface Figure {
  chord: string
  root: string
  core: string[]
  pitches: string[]
}

/** State a texture carries from bar to bar (voice-leading, motif memory). */
export interface RenderMemory {
  /** Last sounding pitch of a named line, as MIDI. */
  lines: Record<string, number>
  /** Last voicing of a named hand/part. */
  voicings: Record<string, string[]>
  /** Rhythm of the first statement, reused by restatements. */
  rhythms: Record<string, number[]>
  /**
   * The first statement per line — its chord, the chord's root and its
   * pitches. A restatement brings the tune back (reharmonised over a related
   * chord, transposed onto a distant one); a development bar fragments it and
   * sequences the fragment.
   */
  motifs: Record<string, Figure>
  /** Rhythm of the previous bar per line, so `sequence` and `echo` bars can repeat its figure. */
  lastRhythms: Record<string, number[]>
  /** Pitches of the previous bar per line, with that bar's chord root: what a `sequence` moves onto the new harmony. */
  lastFigures: Record<string, { root: string; pitches: string[] }>
  /**
   * The theme: every bar's figure per line, by bar index, and every bar's
   * rhythm per rhythm key. A bar that brings an earlier one back
   * (`BarContext.returns`) reads its tune from here, so what returns is the
   * phrase — three bars of it — and not only its first bar.
   */
  figures: Record<string, Record<number, Figure>>
  barRhythms: Record<string, Record<number, number[]>>
  /**
   * Per-piece pattern choices (which Alberti figure, which cell shape …),
   * rolled once from the seed so a piece is consistent with itself but two
   * seeds of the same plan don't sound identical.
   */
  choices: Record<string, number>
  bass?: string
}

export const newMemory = (): RenderMemory => ({ lines: {}, voicings: {}, rhythms: {}, motifs: {}, lastRhythms: {}, lastFigures: {}, figures: {}, barRhythms: {}, choices: {} })

/** Pick one of `count` variants for this piece, once, and remember it. */
export function pieceChoice(bar: BarContext, key: string, count: number): number {
  const known = bar.memory.choices[key]
  if (known != null) return known % count
  const rolled = Math.floor(bar.rand() * count)
  bar.memory.choices[key] = rolled
  return rolled
}

export interface BarContext {
  index: number
  count: number
  isLast: boolean
  plan: BarPlan
  /**
   * The earlier bar whose tune this bar brings back, when the form says this
   * phrase is a return (src/plan/forms.ts `themeSources`). Undefined where the
   * line is new.
   */
  returns?: number
  /** Last bar of a four-bar phrase (or of the piece). */
  phraseFinal: boolean
  /** Whether this character's tune lands, holds and rests at phrase ends. */
  breathes: boolean
  /**
   * Arrangement density for this bar (0 bare … 3 full). Textures that carry
   * a song line may thin or double their figure; a post-pass in renderPlan
   * applies the same levels to every texture.
   */
  arrangement: 0 | 1 | 2 | 3
  /** `plan.role` folded onto the seven roles the gesture tables are keyed by. */
  role: BaseRoleId
  character: CharacterId
  chord: ResolvedChord
  next?: ResolvedChord
  /** Melody / passing-tone pitch classes for this bar. */
  scale: string[]
  palette: PaletteId
  /** Base MIDI velocity for this bar, after the dynamic shape is applied. */
  velocity: number
  meter: MeterInfo
  key: KeyInfo
  /** Closed per-style renderer knobs (non-chord tones, cadence ornament, bass, timing). */
  dialect: StyleDialect
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

/** Rhythm-table family for textures that still key off bar length rather than meter id. */
export type MeterGrid = 'eight' | 'twelve' | 'sixteen' | 'eighteen' | 'twentyfour'

export function meterGrid(meter: Pick<MeterInfo, 'ticksPerBar'>): MeterGrid {
  switch (meter.ticksPerBar) {
    case 8:
      return 'eight'
    case 12:
      return 'twelve'
    case 18:
      return 'eighteen'
    case 24:
      return 'twentyfour'
    default:
      return 'sixteen'
  }
}

/** Rhythm vocabulary for one meter, keyed by what the bar needs to do. */
export interface RhythmBank {
  main: number[][]
  busy: number[][]
  sparse: number[][]
  pause: number[][]
  close: number[][]
}

const BANK_FOR_ROLE: Record<BaseRoleId, keyof RhythmBank> = {
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
  const remember = (rhythm: number[]) => {
    ;(bar.memory.barRhythms[memoryKey] ??= {})[bar.index] = rhythm
    return (bar.memory.lastRhythms[memoryKey] = rhythm)
  }
  const air = (rhythm: number[]) => {
    if (!bar.breathes || bar.returns !== undefined) return remember(rhythm)
    if (!bar.phraseFinal && !bar.isLast) return remember(rhythm)
    const rest = phraseRestTicks(bar.meter, phrasingOf(bar.character))
    return remember(withEndRest(rhythm, rest))
  }
  if (bar.isLast) return air(choose(bank.close, bar.rand))
  // A returning phrase comes back with its rhythm, bar for bar.
  const returning = bar.returns === undefined ? undefined : bar.memory.barRhythms[memoryKey]?.[bar.returns]
  if (returning) return remember(returning)
  // Phrase ends land early and rest even when the role is development.
  if (bar.breathes && bar.phraseFinal) return air(choose(bar.role === 'cadence' ? bank.close : bank.pause, bar.rand))
  // A sequence or an echo IS the previous bar's figure on a new chord / at a new dynamic.
  const previous = bar.memory.lastRhythms[memoryKey]
  if ((bar.plan.role === 'sequence' || bar.plan.role === 'echo') && previous) return remember(previous)
  if (bar.role === 'statement' || bar.role === 'restatement') {
    const remembered = bar.memory.rhythms[memoryKey]
    if (remembered) return remember(remembered)
    const fresh = choose(bank.main, bar.rand)
    bar.memory.rhythms[memoryKey] = fresh
    return remember(fresh)
  }
  return air(choose(bank[BANK_FOR_ROLE[bar.role]], bar.rand))
}
