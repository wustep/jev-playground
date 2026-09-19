// Pure helpers for the Debug notes op: prior-melody state and question wording.
//
// Jev's per-bar Choices run in parallel and cannot see each other, so later
// bars only stay coherent if state carries the closed choices already made.

import {
  BASS_PATTERNS,
  MELODY_DEGREES,
  MELODY_FIGURES,
  MELODY_GOALS,
  PHRASE_RHYTHMS,
  lastSoundingDegree,
  melodyAllowsLeap,
  type BassPatternId,
  type GuideMemoryBar,
  type MelodyDegreeId,
  type MelodyFigureId,
  type MelodyGoalId,
  type MelodyMemoryBar,
} from '../../plan/notes.js'
import {
  ARRANGEMENTS,
  BAR_ROLES,
  CHARACTERS,
  CHORDS,
  CONTOURS,
  TEXTURES,
  type ArrangementId,
  type BarPlan,
  type BarRoleId,
  type CharacterId,
  type ChordId,
  type TextureId,
} from '../../plan/schema.js'
import type { Json } from './systemOne.js'

export function melodyMotionHint(role: BarRoleId): 'stepwise_echo' | 'contrast_ok' {
  return melodyAllowsLeap(role) ? 'contrast_ok' : 'stepwise_echo'
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

export function describeGuideBar(bar: GuideMemoryBar, index: number): Json {
  return {
    bar: index + 1,
    figure_id: bar.figure,
    figure: MELODY_FIGURES[bar.figure],
    goal_id: bar.goal,
    goal: MELODY_GOALS[bar.goal],
  }
}

export function describeGuideSoFar(memory: readonly GuideMemoryBar[]): Json[] {
  return memory.map((bar, i) => describeGuideBar(bar, i))
}

export function describeFigure(figure: MelodyFigureId): string {
  return `${figure} — ${MELODY_FIGURES[figure]}`
}

export function describeGoal(goal: MelodyGoalId): string {
  return `${goal} — ${MELODY_GOALS[goal]}`
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
  character?: CharacterId
  texture?: TextureId
  arrangement?: ArrangementId
}

export interface NotesContinuityState {
  melody_so_far: Json[]
  last_sounding_degree: string | null
  last_sounding_degree_id: MelodyDegreeId | null
  bass_so_far: Json[]
  this_bar: Json
  melody_motion: 'stepwise_echo' | 'contrast_ok'
  piece_frame: Json
  motif_echo: string | null
}

export function notesContinuityState(input: NotesContinuityInput): NotesContinuityState {
  const last = lastSoundingDegree(input.melodySoFar.at(-1)?.degrees ?? [])
  const hint = melodyMotionHint(input.bar.role)
  const hasPrior = input.melodySoFar.length > 0
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
    piece_frame: {
      ...(input.character ? { character: CHARACTERS[input.character] } : {}),
      ...(input.texture ? { texture: TEXTURES[input.texture] } : {}),
      ...(input.arrangement ? { arrangement: ARRANGEMENTS[input.arrangement] } : {}),
    },
    motif_echo: hasPrior
      ? 'Echo the rhythm id and degree-shape already written in melody_so_far unless this_bar.role is contrast, climax, or surprise.'
      : null,
  }
}

export interface NotesGuideContinuityInput {
  barIndex: number
  bar: BarPlan
  nextChord?: ChordId
  melodySoFar: readonly GuideMemoryBar[]
  character?: CharacterId
  texture?: TextureId
  arrangement?: ArrangementId
}

export function notesGuideContinuityState(input: NotesGuideContinuityInput): NotesContinuityState {
  const last = input.melodySoFar.at(-1)
  const hint = melodyMotionHint(input.bar.role)
  const hasPrior = input.melodySoFar.length > 0
  return {
    melody_so_far: describeGuideSoFar(input.melodySoFar),
    last_sounding_degree: last ? describeGoal(last.goal) : null,
    last_sounding_degree_id: null,
    bass_so_far: [],
    this_bar: {
      bar_number: input.barIndex + 1,
      chord: describeChordId(input.bar.chord),
      ...(input.bar.chord2 ? { second_half_chord: describeChordId(input.bar.chord2) } : {}),
      ...(input.nextChord ? { next_chord: describeChordId(input.nextChord) } : {}),
      role: `${input.bar.role} — ${BAR_ROLES[input.bar.role]}`,
      melodic_shape: CONTOURS[input.bar.contour],
    },
    melody_motion: hint,
    piece_frame: {
      ...(input.character ? { character: CHARACTERS[input.character] } : {}),
      ...(input.texture ? { texture: TEXTURES[input.texture] } : {}),
      ...(input.arrangement ? { arrangement: ARRANGEMENTS[input.arrangement] } : {}),
    },
    motif_echo: hasPrior
      ? 'Echo the figure already written in melody_so_far unless this_bar.role is contrast, climax, or surprise. Aim the echo at this bar’s goal.'
      : null,
  }
}

export function notesTask(barNumber: number, hasPrior: boolean, lyrical = false): string {
  const continueFrom = hasPrior
    ? 'Continue the right-hand melody from `melody_so_far` and the left-hand bass from `bass_so_far`. Echo the motif — the earlier rhythm and degree shape — unless `this_bar.role` is contrast, climax, or surprise.'
    : 'Write the opening right-hand melody and left-hand bass; `melody_so_far` is empty. Plant a motif the later bars can echo.'
  const air = lyrical
    ? ' This character is lyrical or song-like: prefer a long tone and a rest so the line can breathe; do not fill every slot with even attacks.'
    : ''
  return `${continueFrom} This is bar ${barNumber} of a short keyboard piece. Use the style in \`requested_style\`, the character, texture and arrangement in \`piece\`, and the phrase role in \`this_bar\`. Prefer stepwise motion from \`last_sounding_degree\`; avoid random leaps.${air} Software will place your choices on a sixteenth-note grid; pick only from the options given — never invent pitches or durations.`
}

export function notesGuideTask(barNumber: number, hasPrior: boolean, lyrical = false): string {
  const continueFrom = hasPrior
    ? 'Continue the singing line from `melody_so_far` (prior figures and goals). Echo the last figure unless `this_bar.role` is contrast, climax, or surprise.'
    : 'Guide the opening singing line; `melody_so_far` is empty. Pick a figure the later bars can echo, and a goal tone in this bar’s chord.'
  const air = lyrical
    ? ' This character is lyrical or song-like: prefer a figure that can hold a long tone and breathe; do not ask for four even attacks.'
    : ''
  return `${continueFrom} This is bar ${barNumber} of a short keyboard piece. Use the style in \`requested_style\`, the character, texture and arrangement in \`piece\`, and the phrase role in \`this_bar\`. Aim the figure at \`this_bar\`’s goal tone; prefer stepwise motion from the previous goal.${air} Software will write the notes from your figure and goal — pick only from the options given; never invent pitches or durations.`
}

export function melodyFigureInstructions(barNumber: number, hint: 'stepwise_echo' | 'contrast_ok'): string {
  const motion =
    hint === 'contrast_ok'
      ? 'This bar’s role allows a new figure or a leap — leap_recover, arpeggio, or contrast is fine.'
      : 'Prefer a motivic echo of the figure already chosen in `melody_so_far` unless the line must cadence or rest.'
  return `Which singing-line figure should bar ${barNumber} use so it continues the line in \`melody_so_far\`? Each option is a closed shape; software will write the notes toward the goal you pick. ${motion}`
}

export function melodyGoalInstructions(barNumber: number): string {
  return `Which chord-tone should the singing line of bar ${barNumber} aim at? Options are relative to the harmony in \`this_bar\` (root, third, fifth, or seventh when the chord has one). The figure you pick will land on this goal.`
}

export function melodyRhythmInstructions(barNumber: number, hint: 'stepwise_echo' | 'contrast_ok', lyrical = false): string {
  const motion =
    hint === 'contrast_ok'
      ? 'This bar’s role allows a new figure or a leap.'
      : 'Prefer a motivic echo of the rhythm already chosen in `melody_so_far` unless the line must cadence or rest.'
  const air = lyrical
    ? ' This character is lyrical or song-like: prefer a rhythm with a long tone, and put a rest in another slot so the line can breathe. Avoid four even attacks.'
    : ''
  return `Which rhythm should the right-hand melody of bar ${barNumber} use so it continues the line in \`melody_so_far\`? Each option fills the bar with exactly four slots on the sixteenth-note grid. ${motion}${air}`
}

export function melodyPitchInstructions(slot: number, hint: 'stepwise_echo' | 'contrast_ok'): string {
  const motion =
    hint === 'contrast_ok'
      ? 'A leap is allowed because this bar’s role is contrast, climax, or surprise.'
      : 'Prefer a step or repeated tone from `last_sounding_degree` (and the previous slot of this bar) unless the harmony forces a chord tone a third away. Do not take a random leap. Echo the degree-shape in `melody_so_far` when this bar restates or answers the idea.'
  return `Which scale degree (or rest) should slot ${slot} of that four-note melody sing so the right-hand line continues from \`melody_so_far\`? Degrees are relative to the key in \`piece.key\`, coloured by the harmony in \`this_bar\`. ${motion}`
}

export function bassPatternInstructions(barNumber: number): string {
  return `Which left-hand bass pattern should bar ${barNumber} use? Options are a held bass, fifth/octave answers, walking figures, a broken Alberti pattern, or off-beat afterbeats. One pattern fills the whole bar. Continue \`bass_so_far\` unless \`this_bar.role\` is contrast, climax, or surprise, or the next chord asks for a new approach.`
}
