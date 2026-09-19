// Closed enums for the Debug-only “Jev writes the tune” experiment.
//
// Jev never sees free-form MIDI. It picks a bar-filling rhythm (four slots)
// and four scale degrees; code turns those labels into Score notes. Illegal
// tick values and unparseable pitches are rejected here so the renderer can
// fall back to renderPlan.

import { METERS, PlanValidationError, parseOption, type BarRoleId, type MeterId, type OptionTable } from './schema.js'

/** Tick lengths VexFlow can engrave (see src/sheet/notation.ts). */
export const NOTE_TICKS = {
  '1': 'Sixteenth note — 1 tick on the sixteenth-note grid',
  '2': 'Eighth note — 2 ticks',
  '3': 'Dotted eighth — 3 ticks',
  '4': 'Quarter note — 4 ticks',
  '6': 'Dotted quarter — 6 ticks',
  '8': 'Half note — 8 ticks',
  '12': 'Dotted half, or a full bar of 3/4 or 6/8 — 12 ticks',
  '16': 'Whole note, a full bar of 4/4 — 16 ticks',
  '18': 'A full bar of 9/8 — 18 ticks (split on the page into a dotted half and a dotted quarter)',
  '24': 'A full bar of 12/8 — 24 ticks (split on the page into two dotted halves)',
} as const
export type NoteTickId = keyof typeof NOTE_TICKS
export const NOTE_TICK_IDS = Object.keys(NOTE_TICKS) as NoteTickId[]
export const NOTE_TICK_VALUES = NOTE_TICK_IDS.map((id) => Number(id))
export const isNoteTick = (value: number): boolean => Object.hasOwn(NOTE_TICKS, String(value))

/** Four-note bar phrase. One request per new plan bar; pitches asked in parallel. */
export const PHRASE_NOTE_COUNT = 4

export const MELODY_DEGREES = {
  rest: 'A rest — silence for this slot, no pitch',
  tonic: 'Tonic, the home note of the key',
  supertonic: 'Second degree of the scale',
  mediant: 'Third degree of the scale',
  subdominant: 'Fourth degree of the scale',
  dominant: 'Fifth degree, the dominant',
  submediant: 'Sixth degree of the scale',
  leading: 'Seventh degree / leading tone',
  tonic_high: 'Tonic an octave above the home note',
  dominant_low: 'Dominant below the tonic',
  mediant_high: 'Third degree an octave above',
} as const
export type MelodyDegreeId = keyof typeof MELODY_DEGREES
export const MELODY_DEGREE_IDS = Object.keys(MELODY_DEGREES) as MelodyDegreeId[]

/** Contrast / climax / surprise may leap; every other role wants stepwise motion. */
export function melodyAllowsLeap(role: BarRoleId): boolean {
  return role === 'contrast' || role === 'climax' || role === 'surprise'
}

const DEGREE_HEIGHT: Record<Exclude<MelodyDegreeId, 'rest'>, number> = {
  dominant_low: -3,
  tonic: 0,
  supertonic: 1,
  mediant: 2,
  subdominant: 3,
  dominant: 4,
  submediant: 5,
  leading: 6,
  tonic_high: 7,
  mediant_high: 9,
}

/** Scale-step height for proximity priors. `rest` has none. */
export function degreeHeight(degree: MelodyDegreeId): number | null {
  return degree === 'rest' ? null : DEGREE_HEIGHT[degree]
}

export function degreeDistance(a: MelodyDegreeId, b: MelodyDegreeId): number {
  const left = degreeHeight(a)
  const right = degreeHeight(b)
  if (left == null || right == null) return 99
  return Math.abs(left - right)
}

export interface PhraseRhythm {
  meter: MeterId
  ticks: readonly [number, number, number, number]
  label: string
}

/** Bar-filling 4-slot rhythms. Every tick is in NOTE_TICKS and the four sum to the bar. */
export const PHRASE_RHYTHMS = {
  four_even: { meter: 'four_four', ticks: [4, 4, 4, 4], label: 'Four even quarter notes filling the bar' },
  four_long_short: { meter: 'four_four', ticks: [8, 4, 2, 2], label: 'Half note, quarter, two eighths' },
  four_short_long: { meter: 'four_four', ticks: [2, 2, 4, 8], label: 'Two eighths, quarter, half note' },
  four_dotted: { meter: 'four_four', ticks: [6, 2, 4, 4], label: 'Dotted quarter, eighth, two quarters' },
  four_syncop: { meter: 'four_four', ticks: [4, 2, 2, 8], label: 'Quarter, two eighths, half note' },
  four_gallop: { meter: 'four_four', ticks: [2, 4, 2, 8], label: 'Eighth, quarter, eighth, half note' },
  triple_long_shorts: { meter: 'three_four', ticks: [4, 4, 2, 2], label: 'Two quarters and two eighths' },
  triple_shorts_long: { meter: 'three_four', ticks: [2, 2, 4, 4], label: 'Two eighths and two quarters' },
  triple_opening: { meter: 'three_four', ticks: [6, 2, 2, 2], label: 'Dotted quarter and three eighths' },
  triple_closing: { meter: 'three_four', ticks: [2, 2, 2, 6], label: 'Three eighths and a dotted quarter' },
  triple_rock: { meter: 'three_four', ticks: [4, 2, 4, 2], label: 'Quarter, eighth, quarter, eighth' },
  triple_sway: { meter: 'three_four', ticks: [2, 4, 2, 4], label: 'Eighth, quarter, eighth, quarter' },
  compound_long: { meter: 'six_eight', ticks: [6, 2, 2, 2], label: 'Dotted quarter and three eighths' },
  compound_close: { meter: 'six_eight', ticks: [2, 2, 2, 6], label: 'Three eighths and a dotted quarter' },
  compound_even: { meter: 'six_eight', ticks: [3, 3, 3, 3], label: 'Four dotted eighths' },
  compound_rock: { meter: 'six_eight', ticks: [2, 4, 2, 4], label: 'Eighth, quarter, eighth, quarter' },
  compound_sway: { meter: 'six_eight', ticks: [4, 2, 4, 2], label: 'Quarter, eighth, quarter, eighth' },
  compound_split: { meter: 'six_eight', ticks: [4, 4, 2, 2], label: 'Two quarters and two eighths' },
  two_even: { meter: 'two_four', ticks: [2, 2, 2, 2], label: 'Four even eighths filling a 2/4 bar' },
  two_march: { meter: 'two_four', ticks: [4, 2, 1, 1], label: 'Quarter, eighth, two sixteenths' },
  two_upbeat: { meter: 'two_four', ticks: [1, 1, 2, 4], label: 'Two sixteenths, eighth, quarter' },
  two_swing: { meter: 'two_four', ticks: [3, 1, 3, 1], label: 'Two dotted-eighth / sixteenth pairs' },
  two_split: { meter: 'two_four', ticks: [2, 4, 1, 1], label: 'Eighth, quarter, two sixteenths' },
  two_close: { meter: 'two_four', ticks: [2, 2, 1, 3], label: 'Two eighths, sixteenth, dotted eighth' },
  nine_even: { meter: 'nine_eight', ticks: [6, 4, 4, 4], label: 'Dotted quarter and three quarters' },
  nine_long: { meter: 'nine_eight', ticks: [6, 6, 4, 2], label: 'Two dotted quarters, quarter, eighth' },
  nine_close: { meter: 'nine_eight', ticks: [4, 2, 6, 6], label: 'Quarter, eighth, two dotted quarters' },
  nine_rock: { meter: 'nine_eight', ticks: [4, 2, 4, 8], label: 'Quarter, eighth, quarter, half' },
  nine_sway: { meter: 'nine_eight', ticks: [3, 3, 6, 6], label: 'Two dotted eighths and two dotted quarters' },
  nine_split: { meter: 'nine_eight', ticks: [2, 4, 6, 6], label: 'Eighth, quarter, two dotted quarters' },
  twelve_even: { meter: 'twelve_eight', ticks: [6, 6, 6, 6], label: 'Four dotted quarters filling 12/8' },
  twelve_long: { meter: 'twelve_eight', ticks: [8, 4, 6, 6], label: 'Half, quarter, two dotted quarters' },
  twelve_close: { meter: 'twelve_eight', ticks: [6, 6, 4, 8], label: 'Two dotted quarters, quarter, half' },
  twelve_sway: { meter: 'twelve_eight', ticks: [4, 2, 6, 12], label: 'Quarter, eighth, dotted quarter, dotted half' },
  twelve_split: { meter: 'twelve_eight', ticks: [8, 8, 4, 4], label: 'Two halves and two quarters' },
  twelve_rock: { meter: 'twelve_eight', ticks: [6, 2, 8, 8], label: 'Dotted quarter, eighth, two halves' },
} as const satisfies Record<string, PhraseRhythm>
export type PhraseRhythmId = keyof typeof PHRASE_RHYTHMS

export function rhythmsFor(meter: MeterId): OptionTable<string> {
  return Object.fromEntries(
    Object.entries(PHRASE_RHYTHMS)
      .filter(([, spec]) => spec.meter === meter)
      .map(([id, spec]) => [id, spec.label]),
  )
}

/** True when one slot is at least half the bar — a long tone the line can sit on. */
export function rhythmHasLongTone(rhythm: PhraseRhythmId): boolean {
  const ticks = PHRASE_RHYTHMS[rhythm].ticks
  const bar = ticks.reduce((sum, tick) => sum + tick, 0)
  return Math.max(...ticks) >= bar / 2
}

export function rhythmIsEven(rhythm: PhraseRhythmId): boolean {
  const ticks = PHRASE_RHYTHMS[rhythm].ticks
  return ticks.every((tick) => tick === ticks[0])
}

/**
 * Rhythm Choice criteria. Lyrical / song characters get an extra clause so
 * Jev prefers a long tone and a rest instead of four even attacks.
 */
export function rhythmCriteriaFor(meter: MeterId, lyrical: boolean): OptionTable<string> {
  const base = rhythmsFor(meter)
  if (!lyrical) return base
  return Object.fromEntries(
    Object.entries(base).map(([id, label]) => {
      const rhythm = id as PhraseRhythmId
      if (rhythmHasLongTone(rhythm)) {
        return [id, `${label}. Prefer this for a lyrical line: keep one slot long and make another a rest so the phrase can breathe.`]
      }
      if (rhythmIsEven(rhythm)) {
        return [id, `${label}. Even attacks — only if at least one slot is a rest; a lyrical line should not fill every slot.`]
      }
      return [id, `${label}. A lyrical line still wants a rest or a long tone in one of the four slots.`]
    }),
  )
}

export const pitchQuestionId = (index: number) => `pitch_${index + 1}`

export interface JevNoteChoices {
  rhythm: PhraseRhythmId
  degrees: MelodyDegreeId[]
  /** Closed left-hand pattern. Omitted = RH-only (legacy phrases). */
  bassPattern?: BassPatternId
}

/** Prior bar’s closed RH choices — ids only, so the notes op stays allowlisted. */
export interface MelodyMemoryBar {
  rhythm: PhraseRhythmId
  degrees: MelodyDegreeId[]
}

/**
 * Simpler than the RH 4-slot phrase: one Choice for the whole left-hand bar.
 * Code expands the pattern onto the sixteenth grid (root / fifth / walking).
 */
export const BASS_PATTERNS = {
  root_hold: 'Hold the chord’s bass note for the whole bar',
  root_fifth: 'Bass note on the first half of the bar, chord fifth on the second',
  fifth_root: 'Chord fifth on the first half, bass note on the second',
  octave_drop: 'Bass note, then the same note an octave lower',
  walk_down: 'Walk down the scale by step from the chord’s bass note, one note per beat',
  walk_up: 'Walk up the triad from the bass note (root, third, fifth, octave as the bar allows)',
  pedal: 'Repeat the chord’s bass note on every beat',
  alberti: 'Broken-chord Alberti figure: bass, fifth, third, fifth, one tone per beat',
  afterbeat: 'Rest on each beat, a chord tone on the afterbeat — an off-beat left hand',
} as const
export type BassPatternId = keyof typeof BASS_PATTERNS
export const BASS_PATTERN_IDS = Object.keys(BASS_PATTERNS) as BassPatternId[]

export const BASS_PATTERN_QUESTION_ID = 'bass_pattern'

export function parseBassPattern(value: unknown, path = 'notes.bassPattern'): BassPatternId {
  return parseOption(BASS_PATTERNS, value, path)
}

/** Last non-rest degree, for stepwise continuation across the barline. */
export function lastSoundingDegree(degrees: readonly MelodyDegreeId[]): MelodyDegreeId | null {
  for (let i = degrees.length - 1; i >= 0; i--) {
    if (degrees[i] !== 'rest') return degrees[i]
  }
  return null
}

export function melodyMemoryFrom(
  phrases: readonly { rhythm: PhraseRhythmId; degrees: readonly MelodyDegreeId[] }[],
): MelodyMemoryBar[] {
  return phrases.map((phrase) => ({ rhythm: phrase.rhythm, degrees: [...phrase.degrees] }))
}

export function parseMelodyMemoryBar(raw: unknown, _path: string, meter: MeterId): MelodyMemoryBar {
  const choices = parseJevNoteChoices(raw, meter)
  return { rhythm: choices.rhythm, degrees: choices.degrees }
}

/**
 * Prior RH choices on the notes op. Omitted = none.
 * When `expectedLength` is set (the current `barIndex`), the list must match.
 */
export function parseMelodySoFar(raw: unknown, meter: MeterId, expectedLength?: number): MelodyMemoryBar[] {
  if (raw === undefined) {
    if (expectedLength !== undefined && expectedLength > 0) {
      throw new PlanValidationError('op.melodySoFar: expected one entry per earlier bar')
    }
    return []
  }
  if (!Array.isArray(raw)) throw new PlanValidationError('op.melodySoFar: expected an array')
  if (raw.length > 64) throw new PlanValidationError('op.melodySoFar: expected at most 64 bars')
  if (expectedLength !== undefined && raw.length !== expectedLength) {
    throw new PlanValidationError('op.melodySoFar: expected one entry per earlier bar')
  }
  return raw.map((bar, i) => parseMelodyMemoryBar(bar, `op.melodySoFar[${i}]`, meter))
}

export function parseBassSoFar(raw: unknown, expectedLength?: number): BassPatternId[] {
  if (raw === undefined) {
    if (expectedLength !== undefined && expectedLength > 0) {
      throw new PlanValidationError('op.bassSoFar: expected one entry per earlier bar')
    }
    return []
  }
  if (!Array.isArray(raw)) throw new PlanValidationError('op.bassSoFar: expected an array')
  if (raw.length > 64) throw new PlanValidationError('op.bassSoFar: expected at most 64 bars')
  if (expectedLength !== undefined && raw.length !== expectedLength) {
    throw new PlanValidationError('op.bassSoFar: expected one entry per earlier bar')
  }
  return raw.map((pattern, i) => parseBassPattern(pattern, `op.bassSoFar[${i}]`))
}

export function parseNoteTick(value: unknown, path: string): number {
  if (typeof value === 'number' && Number.isInteger(value) && isNoteTick(value)) return value
  if (typeof value === 'string' && Object.hasOwn(NOTE_TICKS, value)) return Number(value)
  const shown = typeof value === 'string' ? `"${value}"` : String(value)
  throw new PlanValidationError(`${path}: ${shown} is not a legal note duration (${NOTE_TICK_IDS.join(', ')} ticks)`)
}

/** Spelled pitch on the score (no MIDI numbers, no degree names). */
export const SPELLED_PITCH = /^[A-G](?:#{1,2}|b{1,2})?[0-8]$/

export function parseSpelledPitch(value: unknown, path: string): string {
  if (typeof value !== 'string' || !SPELLED_PITCH.test(value)) {
    const shown = typeof value === 'string' ? `"${value}"` : String(value)
    throw new PlanValidationError(`${path}: ${shown} is not a spelled pitch (e.g. Eb4, F#5)`)
  }
  return value
}

export function parseJevNoteChoices(raw: unknown, meter: MeterId): JevNoteChoices {
  if (!raw || typeof raw !== 'object') throw new PlanValidationError('notes: expected an object')
  const obj = raw as Record<string, unknown>
  const rhythm = parseOption(rhythmsFor(meter), obj.rhythm, 'notes.rhythm') as PhraseRhythmId
  const spec = PHRASE_RHYTHMS[rhythm]
  if (spec.meter !== meter) throw new PlanValidationError(`notes.rhythm: "${rhythm}" does not belong to ${METERS[meter]}`)
  const degrees = Array.isArray(obj.degrees) ? obj.degrees : []
  if (degrees.length !== PHRASE_NOTE_COUNT) {
    throw new PlanValidationError(`notes.degrees: expected ${PHRASE_NOTE_COUNT} scale degrees`)
  }
  const bassPattern = obj.bassPattern === undefined ? undefined : parseBassPattern(obj.bassPattern)
  return {
    rhythm,
    degrees: degrees.map((degree, i) => parseOption(MELODY_DEGREES, degree, `notes.degrees[${i}]`)),
    ...(bassPattern ? { bassPattern } : {}),
  }
}

export function startsFromRhythm(rhythm: PhraseRhythmId): number[] {
  const ticks = PHRASE_RHYTHMS[rhythm].ticks
  const starts: number[] = []
  let at = 0
  for (const dur of ticks) {
    starts.push(at)
    at += dur
  }
  return starts
}

// ── D1: Jev guides the tune (figure + goal; code writes the line) ───────────

/**
 * Debug notes write path. Omitted on the op = `line` (today’s 4-slot rhythm +
 * degrees), so a Coder allowlist that only knows the original notes shape
 * still validates. `guide` is D1: closed figure + goal, no `pitch_1..4`.
 */
export const NOTES_WRITE_MODES = {
  guide: 'Jev guides the tune — a closed figure and a chord-tone goal; code writes the singing line',
  line: 'Jev writes the line — a closed 4-slot rhythm and four scale degrees',
} as const
export type NotesWriteMode = keyof typeof NOTES_WRITE_MODES
export const NOTES_WRITE_MODE_IDS = Object.keys(NOTES_WRITE_MODES) as NotesWriteMode[]

export const FIGURE_QUESTION_ID = 'figure'
export const GOAL_QUESTION_ID = 'goal'

/** Closed singing-line figures. ~7 well-described shapes; code realizes them. */
export const MELODY_FIGURES = {
  step_to_goal:
    'Step toward this bar’s goal tone — mostly conjunct motion, landing on the goal by the last sounding slot',
  neighbour:
    'A neighbour-tone figure around the goal: sit or approach the goal, lean a step above or below, then return',
  arpeggio_up: 'Rise through the chord tones of this bar, finishing on the goal',
  arpeggio_down: 'Fall through the chord tones of this bar, finishing on the goal',
  motif_echo: 'Echo the previous bar’s figure and shape, re-aimed at this bar’s goal tone',
  leap_recover: 'Leap toward or past the goal, then recover by step onto it',
  hold_resolve: 'Hold a long tone, then resolve onto the goal — a sung arrival, not four even attacks',
} as const
export type MelodyFigureId = keyof typeof MELODY_FIGURES
export const MELODY_FIGURE_IDS = Object.keys(MELODY_FIGURES) as MelodyFigureId[]

/** Chord-relative goal tones. Seventh is only a real seventh when the chord has one. */
export const MELODY_GOALS = {
  root: 'The chord root — the home tone of this bar’s harmony',
  third: 'The chord third — the colour tone that makes the harmony major or minor',
  fifth: 'The chord fifth — the open, stable tone of this bar’s harmony',
  seventh: 'The chord seventh when this harmony has one; otherwise the fifth (still a chord tone)',
} as const
export type MelodyGoalId = keyof typeof MELODY_GOALS
export const MELODY_GOAL_IDS = Object.keys(MELODY_GOALS) as MelodyGoalId[]

export interface JevGuideChoices {
  figure: MelodyFigureId
  goal: MelodyGoalId
}

/** Prior bar’s closed guide picks — ids only, so the notes op stays allowlisted. */
export interface GuideMemoryBar {
  figure: MelodyFigureId
  goal: MelodyGoalId
}

export function parseNotesWriteMode(value: unknown, path = 'notes.mode'): NotesWriteMode {
  return parseOption(NOTES_WRITE_MODES, value, path)
}

export function parseMelodyFigure(value: unknown, path = 'notes.figure'): MelodyFigureId {
  return parseOption(MELODY_FIGURES, value, path)
}

export function parseMelodyGoal(value: unknown, path = 'notes.goal'): MelodyGoalId {
  return parseOption(MELODY_GOALS, value, path)
}

export function parseJevGuideChoices(raw: unknown): JevGuideChoices {
  if (!raw || typeof raw !== 'object') throw new PlanValidationError('notes: expected an object')
  const obj = raw as Record<string, unknown>
  return {
    figure: parseMelodyFigure(obj.figure, 'notes.figure'),
    goal: parseMelodyGoal(obj.goal, 'notes.goal'),
  }
}

export function isGuideMemoryBar(value: unknown): value is GuideMemoryBar {
  return !!value && typeof value === 'object' && 'figure' in value && 'goal' in value
}

export function parseGuideMemoryBar(raw: unknown, path: string): GuideMemoryBar {
  if (!raw || typeof raw !== 'object') throw new PlanValidationError(`${path}: expected an object`)
  const obj = raw as Record<string, unknown>
  return {
    figure: parseMelodyFigure(obj.figure, `${path}.figure`),
    goal: parseMelodyGoal(obj.goal, `${path}.goal`),
  }
}

export function guideMemoryFrom(phrases: readonly { figure?: MelodyFigureId; goal?: MelodyGoalId }[]): GuideMemoryBar[] {
  return phrases.map((phrase, i) => {
    if (!phrase.figure || !phrase.goal) {
      throw new PlanValidationError(`notes.guideSoFar[${i}]: expected figure and goal`)
    }
    return { figure: phrase.figure, goal: phrase.goal }
  })
}

/**
 * Prior guide picks on the notes op. Omitted = none.
 * When `expectedLength` is set (the current `barIndex`), the list must match.
 */
export function parseGuideSoFar(raw: unknown, expectedLength?: number): GuideMemoryBar[] {
  if (raw === undefined) {
    if (expectedLength !== undefined && expectedLength > 0) {
      throw new PlanValidationError('op.melodySoFar: expected one entry per earlier bar')
    }
    return []
  }
  if (!Array.isArray(raw)) throw new PlanValidationError('op.melodySoFar: expected an array')
  if (raw.length > 64) throw new PlanValidationError('op.melodySoFar: expected at most 64 bars')
  if (expectedLength !== undefined && raw.length !== expectedLength) {
    throw new PlanValidationError('op.melodySoFar: expected one entry per earlier bar')
  }
  return raw.map((bar, i) => parseGuideMemoryBar(bar, `op.melodySoFar[${i}]`))
}

/**
 * Default 4-slot rhythm for a guide figure in this meter. Lyrical characters
 * borrow the hold_resolve rhythm (a long tone) except on arpeggios. Motif
 * echo reuses the previous bar’s rhythm when one is given.
 */
export const GUIDE_RHYTHMS: Record<MeterId, Record<MelodyFigureId, PhraseRhythmId>> = {
  four_four: {
    step_to_goal: 'four_even',
    neighbour: 'four_dotted',
    arpeggio_up: 'four_even',
    arpeggio_down: 'four_even',
    motif_echo: 'four_even',
    leap_recover: 'four_gallop',
    hold_resolve: 'four_long_short',
  },
  three_four: {
    step_to_goal: 'triple_long_shorts',
    neighbour: 'triple_rock',
    arpeggio_up: 'triple_long_shorts',
    arpeggio_down: 'triple_long_shorts',
    motif_echo: 'triple_long_shorts',
    leap_recover: 'triple_shorts_long',
    hold_resolve: 'triple_opening',
  },
  two_four: {
    step_to_goal: 'two_even',
    neighbour: 'two_swing',
    arpeggio_up: 'two_even',
    arpeggio_down: 'two_even',
    motif_echo: 'two_even',
    leap_recover: 'two_upbeat',
    hold_resolve: 'two_march',
  },
  six_eight: {
    step_to_goal: 'compound_even',
    neighbour: 'compound_rock',
    arpeggio_up: 'compound_even',
    arpeggio_down: 'compound_even',
    motif_echo: 'compound_even',
    leap_recover: 'compound_close',
    hold_resolve: 'compound_long',
  },
  nine_eight: {
    step_to_goal: 'nine_even',
    neighbour: 'nine_rock',
    arpeggio_up: 'nine_even',
    arpeggio_down: 'nine_even',
    motif_echo: 'nine_even',
    leap_recover: 'nine_close',
    hold_resolve: 'nine_long',
  },
  twelve_eight: {
    step_to_goal: 'twelve_even',
    neighbour: 'twelve_sway',
    arpeggio_up: 'twelve_even',
    arpeggio_down: 'twelve_even',
    motif_echo: 'twelve_even',
    leap_recover: 'twelve_close',
    hold_resolve: 'twelve_long',
  },
}

export function rhythmForGuideFigure(
  figure: MelodyFigureId,
  meter: MeterId,
  options: { lyrical?: boolean; echoRhythm?: PhraseRhythmId } = {},
): PhraseRhythmId {
  if (figure === 'motif_echo' && options.echoRhythm && PHRASE_RHYTHMS[options.echoRhythm]?.meter === meter) {
    return options.echoRhythm
  }
  const table = GUIDE_RHYTHMS[meter]
  if (options.lyrical && figure !== 'arpeggio_up' && figure !== 'arpeggio_down') {
    return table.hold_resolve
  }
  return table[figure]
}

/**
 * Q2: a rest may sit on a short weak slot, never the longest slot and never
 * the first mid-phrase beat (first slot that starts on a beat at or after
 * the bar’s midpoint).
 */
export function guideRestSlot(
  ticks: readonly number[],
  beatTicks: number,
  ticksPerBar: number,
): number | null {
  if (ticks.length === 0) return null
  const starts: number[] = []
  let at = 0
  for (const dur of ticks) {
    starts.push(at)
    at += dur
  }
  const longest = Math.max(...ticks)
  const longestIndex = ticks.findIndex((tick) => tick === longest)
  const mid = Math.floor(ticksPerBar / 2)
  let midPhrase = ticks.findIndex((_, i) => starts[i] >= mid && starts[i] % beatTicks === 0)
  if (midPhrase < 0) {
    midPhrase = ticks.findIndex((_, i) => starts[i] > 0 && starts[i] % beatTicks === 0)
  }
  const eligible = ticks
    .map((_, i) => i)
    .filter((i) => i !== longestIndex && i !== midPhrase)
  if (eligible.length === 0) return null
  eligible.sort((a, b) => {
    const aStrong = starts[a] % beatTicks === 0 ? 1 : 0
    const bStrong = starts[b] % beatTicks === 0 ? 1 : 0
    if (ticks[a] !== ticks[b]) return ticks[a] - ticks[b]
    if (aStrong !== bStrong) return aStrong - bStrong
    return a - b
  })
  return eligible[0]
}
