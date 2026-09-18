// Closed enums for the Debug-only “Jev writes notes” experiment.
//
// Jev never sees free-form MIDI. It picks a bar-filling rhythm (four slots)
// and four scale degrees; code turns those labels into Score notes. Illegal
// tick values and unparseable pitches are rejected here so the renderer can
// fall back to renderPlan.

import { METERS, PlanValidationError, parseOption, type MeterId, type OptionTable } from './schema.js'

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

export const pitchQuestionId = (index: number) => `pitch_${index + 1}`

export interface JevNoteChoices {
  rhythm: PhraseRhythmId
  degrees: MelodyDegreeId[]
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
  return {
    rhythm,
    degrees: degrees.map((degree, i) => parseOption(MELODY_DEGREES, degree, `notes.degrees[${i}]`)),
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
