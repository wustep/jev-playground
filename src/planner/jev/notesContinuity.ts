// Pure helpers for the Debug notes op: prior-melody state and question wording.
//
// Jev's per-bar Choices run in parallel and cannot see each other, so later
// bars only stay coherent if state carries the closed choices already made.

import {
  BASS_PATTERNS,
  MELODY_DEGREES,
  PHRASE_RHYTHMS,
  lastSoundingDegree,
  type BassPatternId,
  type MelodyDegreeId,
  type MelodyMemoryBar,
} from '../../plan/notes.js'
import {
  BAR_ROLES,
  CHORDS,
  CONTOURS,
  type BarPlan,
  type BarRoleId,
  type ChordId,
} from '../../plan/schema.js'
import type { Json } from './systemOne.js'

const CONTRAST_ROLES: ReadonlySet<BarRoleId> = new Set<BarRoleId>(['contrast', 'climax', 'surprise'])

export function melodyMotionHint(role: BarRoleId): 'stepwise_echo' | 'contrast_ok' {
  return CONTRAST_ROLES.has(role) ? 'contrast_ok' : 'stepwise_echo'
}

export function describeDegree(degree: MelodyDegreeId): string {
  return `${degree} — ${MELODY_DEGREES[degree]}`
}

export function describeMelodyBar(bar: MelodyMemoryBar, index: number): Json {
  return {
    bar: index + 1,
    rhythm_id: bar.rhythm,
    rhythm: PHRASE_RHYTHMS[bar.rhythm].label,
    degree_ids: [...bar.degrees],
    degrees: bar.degrees.map(describeDegree),
  }
}

export function describeMelodySoFar(memory: readonly MelodyMemoryBar[]): Json[] {
  return memory.map((bar, i) => describeMelodyBar(bar, i))
}

export function describeBassSoFar(patterns: readonly BassPatternId[]): Json[] {
  return patterns.map((pattern, i) => ({
    bar: i + 1,
    pattern_id: pattern,
    pattern: BASS_PATTERNS[pattern],
  }))
}

export function describeChordId(chord: ChordId): string {
  return `${chord} — ${CHORDS[chord]}`
}

export interface NotesContinuityInput {
  barIndex: number
  bar: BarPlan
  nextChord?: ChordId
  melodySoFar: readonly MelodyMemoryBar[]
  bassSoFar?: readonly BassPatternId[]
}

export interface NotesContinuityState {
  melody_so_far: Json[]
  last_sounding_degree: string | null
  last_sounding_degree_id: MelodyDegreeId | null
  bass_so_far: Json[]
  this_bar: Json
  melody_motion: 'stepwise_echo' | 'contrast_ok'
}

export function notesContinuityState(input: NotesContinuityInput): NotesContinuityState {
  const last = lastSoundingDegree(input.melodySoFar.at(-1)?.degrees ?? [])
  const hint = melodyMotionHint(input.bar.role)
  return {
    melody_so_far: describeMelodySoFar(input.melodySoFar),
    last_sounding_degree: last ? describeDegree(last) : null,
    last_sounding_degree_id: last,
    bass_so_far: describeBassSoFar(input.bassSoFar ?? []),
    this_bar: {
      bar_number: input.barIndex + 1,
      chord: describeChordId(input.bar.chord),
      ...(input.bar.chord2 ? { second_half_chord: describeChordId(input.bar.chord2) } : {}),
      ...(input.nextChord ? { next_chord: describeChordId(input.nextChord) } : {}),
      role: `${input.bar.role} — ${BAR_ROLES[input.bar.role]}`,
      melodic_shape: CONTOURS[input.bar.contour],
    },
    melody_motion: hint,
  }
}

export function notesTask(barNumber: number, hasPrior: boolean): string {
  const continueFrom = hasPrior
    ? 'Continue the right-hand melody from `melody_so_far` and the left-hand bass from `bass_so_far`.'
    : 'Write the opening right-hand melody and left-hand bass; `melody_so_far` is empty.'
  return `${continueFrom} This is bar ${barNumber} of a short keyboard piece. Prefer stepwise motion from \`last_sounding_degree\` and a motivic echo of the earlier rhythm / degree shape unless \`this_bar.role\` is contrast, climax, or surprise. Software will place your choices on a sixteenth-note grid; pick only from the options given — never invent pitches or durations.`
}

export function melodyRhythmInstructions(barNumber: number, hint: 'stepwise_echo' | 'contrast_ok'): string {
  const motion =
    hint === 'contrast_ok'
      ? 'This bar’s role allows a new figure or a leap.'
      : 'Prefer a motivic echo of the rhythm already chosen in `melody_so_far` unless the line must cadence or rest.'
  return `Which rhythm should the right-hand melody of bar ${barNumber} use so it continues the line in \`melody_so_far\`? Each option fills the bar with exactly four slots on the sixteenth-note grid. ${motion}`
}

export function melodyPitchInstructions(slot: number, hint: 'stepwise_echo' | 'contrast_ok'): string {
  const motion =
    hint === 'contrast_ok'
      ? 'A leap is allowed because this bar’s role is contrast, climax, or surprise.'
      : 'Prefer a step or repeated tone from `last_sounding_degree` (and the previous slot of this bar) unless the harmony forces a chord tone a third away.'
  return `Which scale degree (or rest) should slot ${slot} of that four-note melody sing so the right-hand line continues from \`melody_so_far\`? Degrees are relative to the key in \`piece.key\`, coloured by the harmony in \`this_bar\`. ${motion}`
}

export function bassPatternInstructions(barNumber: number): string {
  return `Which left-hand bass pattern should bar ${barNumber} use? Options are root, fifth, octave and walking figures that fill the bar. Continue \`bass_so_far\` unless \`this_bar.role\` is contrast, climax, or surprise, or the next chord asks for a new approach.`
}
