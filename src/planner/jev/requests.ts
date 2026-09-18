// Everything Jev is ever asked, as pure functions: JevOp → { state, questions }.
//
// The browser never sends raw state/questions to the proxy — it sends a small
// typed JevOp, and the server re-validates it and builds the request itself
// with these same functions. That keeps /api/jev from being an open relay for
// whoever finds the URL.
//
// Design notes (from docs.typesafe.ai, and from watching live distributions):
//  • Questions in one request run in parallel and cannot see each other, so
//    everything independent is fanned out in ONE call (all the globals).
//  • Asked "what is most characteristic of Beethoven?", Jev is — rightly —
//    sure: C minor, block chords, allegro, every time. So the first request
//    asks only about the CHARACTER of the piece, two ways at once: a Choice
//    (which is most typical — 95 % "stormy" for Beethoven) and one Noul per
//    character (is this a real part of their output — yes for stormy, lyrical,
//    heroic, playful, solemn; no for "warm groove"). Several characters apply
//    at once, which is what Nouls are for; alone they are too flat, and the
//    Choice alone too peaked. Code combines the two (JevPlanner) and draws
//    one; every later question is conditioned on it. Variety comes from the
//    composer's range, coherence from one shared premise in state.
//  • Phrase layout is ONE Choice between whole forms (src/plan/forms.ts), not
//    a role question per bar: parallel per-bar marginals can't see each other
//    and came back as "half cadence" four bars running.
//  • Harmony is one Choice per 4-bar form slot, whose options are that style's
//    HarmonyBook heads / seqs / tails / verified phrases for the slot's
//    PhraseEnd. Per-bar `bar` ops stay parseable (chord2 / notes tests).
//  • Choice criteria are the enum descriptions from schema.ts; Score levels
//    describe standalone situations because the model never sees the ordering.

import { formSlots } from '../../plan/forms.js'
import { bookFor, phraseCriteria, PHRASE_ENDS, slotContourQuestionId } from '../../plan/harmonyPhrases.js'
import {
  BASS_PATTERNS,
  BASS_PATTERN_QUESTION_ID,
  MELODY_DEGREES,
  PHRASE_NOTE_COUNT,
  parseBassSoFar,
  parseMelodySoFar,
  pitchQuestionId,
  rhythmsFor,
  type BassPatternId,
  type MelodyMemoryBar,
} from '../../plan/notes.js'
import {
  BAR_COUNT_VALUES,
  BAR_ROLES,
  CHARACTERS,
  CHARACTER_IDS,
  CHORDS,
  CONTOURS,
  FORMS,
  GLOBAL_FIELDS,
  GLOBAL_FIELD_IDS,
  KEYS,
  METERS,
  PALETTES,
  STYLE_IDS,
  STYLE_LABELS,
  TEMPOS,
  TEXTURES,
  INSTRUMENTS,
  DYNAMICS,
  DYNAMIC_SHAPES,
  ARRANGEMENTS,
  PEDALS,
  OPENINGS,
  PlanValidationError,
  parseBarPlan,
  parseGlobals,
  parseOption,
  parsePlan,
  parseStyle,
  type BarCount,
  type BarPlan,
  type BarRoleId,
  type CharacterId,
  type ChordId,
  type CompositionPlan,
  type ContourId,
  type GlobalField,
  type KeyId,
  type MeterId,
  type PaletteId,
  type PlanGlobals,
  type StyleId,
  type TempoId,
  type TextureId,
} from '../../plan/schema.js'
import { STYLE_PROFILES } from '../../plan/styles.js'
import {
  bassPatternInstructions,
  melodyPitchInstructions,
  melodyRhythmInstructions,
  notesContinuityState,
  notesTask,
} from './notesContinuity.js'
import type { ChoiceQuestion, Json, NoulQuestion, Question, ScoreQuestion, SystemOneRequest } from './systemOne.js'

export type JevOp =
  | { op: 'concept'; style: StyleId; brief: boolean }
  | { op: 'globals'; style: StyleId; brief: boolean; character: CharacterId }
  | {
      op: 'bar'
      style: StyleId
      brief: boolean
      globals: PlanGlobals
      roles: BarRoleId[]
      /** chords already fixed for bars 0..index-1 */
      chords: ChordId[]
      /** their second-half harmonies, where a bar has one (same length as `chords`; omitted = none) */
      chord2s?: (ChordId | null)[]
      index: number
    }
  | {
      op: 'phrase'
      style: StyleId
      brief: boolean
      globals: PlanGlobals
      barCount: BarCount
      /** 4-bar form slot being decided now. */
      slotIndex: number
      /** Chords already fixed for bars 0..slotIndex*4-1 */
      chords: ChordId[]
      /** Contours already fixed for those same bars */
      contours: ContourId[]
    }
  | { op: 'score'; plan: CompositionPlan; styles: StyleId[] }
  /**
   * Debug-only: one bar of closed-schema RH + bass. Callers repeat per new
   * plan bar. Optional memory fields stay on this op so Coder’s allowlist
   * does not need a new verb — parse them against the existing note enums.
   */
  | {
      op: 'notes'
      style: StyleId
      brief: boolean
      character: CharacterId
      key: KeyId
      meter: MeterId
      tempo: TempoId
      texture: TextureId
      palette: PaletteId
      bar: BarPlan
      /** 0-based plan bar this request writes. Omitted = bar 1 (legacy). */
      barIndex?: number
      /** Prior bars’ closed RH choices (rhythm id + four degree ids). */
      melodySoFar?: MelodyMemoryBar[]
      /** Prior bars’ closed bass pattern ids. */
      bassSoFar?: BassPatternId[]
      /** Next plan bar’s chord, when known. */
      nextChord?: ChordId
    }

// ── State helpers ───────────────────────────────────────────────────────────

function styleState(style: StyleId, brief: boolean): Json {
  return brief
    ? { name: STYLE_LABELS[style], description: STYLE_PROFILES[style].brief }
    : { name: STYLE_LABELS[style] }
}

/** Enum ids mean nothing to the model; state always carries the descriptions. */
function describeGlobals(globals: PlanGlobals): Json {
  return {
    character: CHARACTERS[globals.character],
    phrase_layout: FORMS[globals.form],
    key: KEYS[globals.key],
    meter: METERS[globals.meter],
    texture: TEXTURES[globals.texture],
    melodic_palette: PALETTES[globals.palette],
    tempo: TEMPOS[globals.tempo],
    dynamics: DYNAMICS[globals.dynamics],
    dynamic_shape: DYNAMIC_SHAPES[globals.dynamicShape],
    instrument: INSTRUMENTS[globals.defaultInstrument],
    arrangement: ARRANGEMENTS[globals.arrangement ?? 'lift_on_return'],
    opening: OPENINGS[globals.opening ?? 'straight_in'],
    ...(globals.pedal ? { sustain_pedal: PEDALS[globals.pedal] } : {}),
  }
}

const TASK =
  'Plan a short piece for solo keyboard in the requested style. A composer writes many kinds of piece; this one has the character given in `piece_character`. Software will expand the plan into notes, so choose what that composer would plausibly write for a piece of this character.'

const CONCEPT_TASK = 'Plan a short piece for solo keyboard in the requested style. First decide what kind of piece it is.'

// ── Question wording ────────────────────────────────────────────────────────

const CHARACTER_INSTRUCTIONS =
  'Which character is most typical of a short keyboard piece in the style of `requested_style.name`?'

/** Question ids of the character fan-out, e.g. `writes_dance_lilt`. */
export const characterQuestionId = (character: CharacterId) => `writes_${character}`

const characterQuestion = (character: CharacterId): NoulQuestion => ({
  type: 'noul',
  instructions: `A composer writes pieces of many different characters, not only the one they are most famous for. Is a short keyboard piece with the following character a recognisable part of what \`requested_style.name\` wrote or plays? Character: ${CHARACTERS[character]}`,
  criteria: {
    true: 'Yes — pieces of this character are a real part of that musician\'s output, even if not the most famous part',
    false: 'No — this character is foreign to that musician\'s music',
  },
})

const GLOBAL_INSTRUCTIONS: Record<Exclude<GlobalField, 'character'>, string> = {
  form: 'How would `requested_style.name` most plausibly lay out the phrases of a short piece with the character in `piece_character`?',
  key: 'Which key would `requested_style.name` plausibly choose for a piece with the character in `piece_character`?',
  meter: 'Which meter suits a piece with the character in `piece_character`, in the style of `requested_style.name`?',
  texture: 'Which keyboard texture best realises the character in `piece_character` the way `requested_style.name` would write it?',
  palette: 'Which pool of melody and passing notes fits a piece with the character in `piece_character`, in the style of `requested_style.name`?',
  tempo: 'Which tempo suits a piece with the character in `piece_character`, in the style of `requested_style.name`?',
  dynamics: 'Which overall dynamic level suits a piece with the character in `piece_character`, in the style of `requested_style.name`?',
  dynamicShape: 'How would the dynamics behave over a piece with the character in `piece_character`, in the style of `requested_style.name`?',
  defaultInstrument: 'Which of these instruments would `requested_style.name` most plausibly use for a piece with the character in `piece_character`?',
  arrangement: 'How would the keyboard arrangement change as phrases return in a piece with the character in `piece_character`, in the style of `requested_style.name`? The options describe density over the form, not which notes to write.',
  opening: 'How would a short piece with the character in `piece_character` begin, in the style of `requested_style.name`? Straight in, a bar or two of accompaniment alone, or a short pickup into the first downbeat.',
  pedal: 'How much sustain pedal would a piece with the character in `piece_character` use, in the style of `requested_style.name`? Dry cuts notes at their written length; half lets chords overlap a little; full holds the pedal so sonorities ring through the bar.',
}

const choice = (instructions: string, criteria: Record<string, string>): ChoiceQuestion => ({
  type: 'choice',
  instructions,
  criteria,
})

function conceptRequest(op: Extract<JevOp, { op: 'concept' }>, model: string): SystemOneRequest {
  return {
    model,
    state: { task: CONCEPT_TASK, requested_style: styleState(op.style, op.brief) },
    questions: {
      character: choice(CHARACTER_INSTRUCTIONS, CHARACTERS),
      ...Object.fromEntries(CHARACTER_IDS.map((character) => [characterQuestionId(character), characterQuestion(character)])),
    },
  }
}

function globalsRequest(op: Extract<JevOp, { op: 'globals' }>, model: string): SystemOneRequest {
  const questions: Record<string, Question> = {}
  for (const field of GLOBAL_FIELD_IDS) {
    if (field === 'character') continue
    questions[field] = choice(GLOBAL_INSTRUCTIONS[field], GLOBAL_FIELDS[field])
  }
  return {
    model,
    state: { task: TASK, requested_style: styleState(op.style, op.brief), piece_character: CHARACTERS[op.character] },
    questions,
  }
}

// Labels that only make sense in one mode are not offered in the other: the
// model can't pick what it isn't shown, and ~25 fewer options is ~25 fewer
// ways to go wrong. The root-position tonic triads of BOTH modes stay in
// (Picardy thirds, mode flips), as do the borrowed chords that are the point
// of modal mixture.
const MAJOR_ONLY: ReadonlySet<ChordId> = new Set<ChordId>(['I6', 'I64', 'iii', 'iii6', 'iii64', 'iii7', 'iii9', 'vi', 'vi6', 'vi7', 'vi9', 'vi11', 'Imaj42', 'ii6', 'ii65', 'ii42', 'ii7', 'ii9', 'V7_of_ii', 'V7_of_vi', 'sharp_i_dim7', 'biii7', 'I6_9', 'Imaj9', 'Iadd9', 'Iadd6', 'Imaj7s5', 'Imaj7s11', 'II_over_I', 'IVmaj7s11'])
const MINOR_ONLY: ReadonlySet<ChordId> = new Set<ChordId>(['i6', 'i64', 'i42', 'i9', 'i11', 'i_add9', 'i_maj7', 'i_add6', 'ii_dim', 'ii_dim6', 'ii_half_dim65', 'iv64', 'v6', 'iv9'])

/** The chord labels offered to Jev in `key`. */
export function chordOptionsFor(key: KeyId): Record<string, string> {
  const hidden = key.endsWith('_minor') ? MAJOR_ONLY : MINOR_ONLY
  return Object.fromEntries(Object.entries(CHORDS).filter(([id]) => !hidden.has(id as ChordId)))
}

/**
 * Chords offered as the first half of a bar that arrives on a cadence chord in
 * its second half: the cadential six-four and the pre-dominants. Asked only on
 * the bar before a cadence and on a half-cadence bar, in the same request as
 * that bar's chord, so a two-chord cadence costs no extra round trip.
 */
const APPROACHES: readonly ChordId[] = ['I64', 'i64', 'ii6', 'ii65', 'ii7', 'ii_dim6', 'ii_half_dim65', 'ii_half_dim7', 'IV', 'iv', 'IV6', 'iv6', 'IVmaj7', 'vi', 'bII6', 'bVI', 'V7_of_V', 'V65_of_V']
export const NO_APPROACH = 'none'

/** Options for the approach question in `key`, `none` first. */
export function approachOptionsFor(key: KeyId): Record<string, string> {
  const offered = chordOptionsFor(key)
  return {
    [NO_APPROACH]: 'One harmony for the whole bar',
    ...Object.fromEntries(APPROACHES.filter((id) => id in offered).map((id) => [id, `First half of the bar only: ${CHORDS[id]}, the chosen chord arriving in the second half`])),
  }
}

/** Whether bar `index` is asked for an approach chord: it pauses on a half cadence, or leads straight into the cadence bar. */
export function asksApproach(roles: readonly BarRoleId[], index: number): boolean {
  return index < roles.length - 1 && (roles[index] === 'half_cadence' || roles[index + 1] === 'cadence')
}

const describeChord = (chord: ChordId, chord2: ChordId | null | undefined) =>
  `${chord} — ${CHORDS[chord]}` + (chord2 ? `; second half of the bar: ${chord2} — ${CHORDS[chord2]}` : '')

function phraseRequest(op: Extract<JevOp, { op: 'phrase' }>, model: string): SystemOneRequest {
  const slots = formSlots(op.globals.form, op.barCount)
  const slot = slots[op.slotIndex]
  const start = op.slotIndex * 4
  const priorSlots = slots.slice(0, op.slotIndex).map((earlier, s) => ({
    slot: s + 1,
    how_it_ends: PHRASE_ENDS[earlier.end],
    bars: earlier.roles.map((role, k) => {
      const bar = s * 4 + k
      return {
        bar: bar + 1,
        role: `${role} — ${BAR_ROLES[role]}`,
        chord: describeChord(op.chords[bar], undefined),
        melodic_shape: CONTOURS[op.contours[bar]],
      }
    }),
  }))
  const state: Json = {
    task: TASK,
    requested_style: styleState(op.style, op.brief),
    piece: { ...(describeGlobals(op.globals) as Record<string, Json>), length_in_bars: op.barCount },
    phrases_so_far: priorSlots,
    current_slot: {
      slot: op.slotIndex + 1,
      bars: `${start + 1}–${start + 4}`,
      roles: slot.roles.map((role) => `${role} — ${BAR_ROLES[role]}`),
      how_it_ends: PHRASE_ENDS[slot.end],
      prior_melodic_shapes: op.contours.slice(-4).map((contour) => CONTOURS[contour]),
    },
  }
  const questions: Record<string, Question> = {
    phrase: choice(
      'Which four-bar harmonic phrase should occupy `current_slot` so the progression in `phrases_so_far` continues in this style? Options are stock openings, travelling units, cadences and verified phrases from the style book, described functionally. Match the close described in `current_slot.how_it_ends`. Do not name composers.',
      phraseCriteria(bookFor(op.style, op.globals.key), slot),
    ),
  }
  slot.roles.forEach((role, k) => {
    questions[slotContourQuestionId(k)] = choice(
      `Which melodic shape should bar ${start + k + 1} have? Its role is ${role} — ${BAR_ROLES[role]}. Take the shapes already chosen in \`current_slot.prior_melodic_shapes\` and \`phrases_so_far\` into account.`,
      CONTOURS,
    )
  })
  return { model, state, questions }
}

function barRequest(op: Extract<JevOp, { op: 'bar' }>, model: string): SystemOneRequest {
  const bars: Json[] = op.roles.map((role, i) => ({
    bar: i + 1,
    role: `${role} — ${BAR_ROLES[role]}`,
    chord:
      i < op.index
        ? describeChord(op.chords[i], op.chord2s?.[i])
        : i === op.index
          ? '(to be decided now)'
          : '(not decided yet)',
  }))
  const state: Json = {
    task: TASK,
    requested_style: styleState(op.style, op.brief),
    piece: { ...(describeGlobals(op.globals) as Record<string, Json>), length_in_bars: op.roles.length },
    bars,
    current_bar: op.index + 1,
  }
  return {
    model,
    state,
    questions: {
      chord: choice(
        'Which chord should bar `current_bar` use so that the progression in `bars` continues the way `requested_style.name` would write a piece of this character? Chords are roman numerals relative to the key in `piece.key`. Take the role of the current bar and the chords already chosen into account; a restated idea may be reharmonised, and the bass may move by step through inverted chords.',
        chordOptionsFor(op.globals.key),
      ),
      contour: choice(
        'Which melodic shape should bar `current_bar` have, given its role in `bars` and the way `requested_style.name` typically shapes lines?',
        CONTOURS,
      ),
      ...(asksApproach(op.roles, op.index)
        ? {
            approach: choice(
              'Bar `current_bar` closes or pauses a phrase. Would `requested_style.name` give it two harmonies — an approach chord in its first half, with the chord chosen for this bar arriving in the second half (a cadential six-four resolving to the dominant, ii–V in one bar) — or keep one harmony for the whole bar?',
              approachOptionsFor(op.globals.key),
            ),
          }
        : {}),
    },
  }
}

/** Readable, id-free rendering of a plan — also handy for debugging. */
export function describePlan(plan: CompositionPlan): Json {
  return {
    ...(describeGlobals(plan) as Record<string, Json>),
    length_in_bars: plan.bars.length,
    bars: plan.bars.map((bar, i) => ({
      bar: i + 1,
      chord: describeChord(bar.chord, bar.chord2),
      role: BAR_ROLES[bar.role],
      melodic_shape: CONTOURS[bar.contour],
    })),
  }
}

export const scoreQuestionId = (style: StyleId) => `match_${style}`

/** Song-quality Score on the existing `score` op — Appendix B. Not a new op. */
export const SONG_SCORE_QUESTION_ID = 'song_quality'

function styleMatchQuestion(style: StyleId): ScoreQuestion {
  const name = STYLE_LABELS[style]
  return {
    type: 'score',
    instructions: `How closely does \`plan\` match the musical style of ${name}? Judge character, phrase layout, texture, harmony, arrangement, opening, tempo and dynamics together. The style name is not written on the plan; do not reward a lucky guess at the label.`,
    criteria: [
      "A different tradition: texture, phrase layout and harmony would not be recognised as this musician's.",
      'Partial: some globals fit, but the form, arrangement or chord vocabulary point elsewhere or at a generic étude.',
      'Immediate: someone who knows the music would recognise the kind of piece, the texture, the harmony and how it opens and returns.',
    ],
  }
}

/** Appendix B.3 — copy the locked criteria; four standalone levels, raw 0–3. */
function songQualityQuestion(): ScoreQuestion {
  return {
    type: 'score',
    instructions:
      'How song-like is the composition plan in `plan`? Judge only the labels in `plan` — character, phrase_layout, texture, arrangement, opening, dynamic_shape, length_in_bars, and each bar\'s role. Do not imagine notes, rests, MIDI, or a performance. A song here means a short keyboard piece a listener would hear as a tune that returns, can breathe, and changes clothes; an étude means unbroken figuration that starts again every bar. Loop-and-layer plans (a short cycle that builds or peaks then drops, often with a vamp) count as songs in the film-score and minimal sense.',
    criteria: [
      'Étude / perpetual study. The character is continuous figuration or a motor pulse, the texture is two-hand perpetual motion or unbroken broken-chord / cell figuration, the opening is straight in (or omitted), and the arrangement is constant. The phrase layout does not bring a three-to-four-bar idea back — it spins, fantasises, or loops without a sung line on top. Bar roles have no single late peak: no climax, or climaxes scattered through the middle. Realising this plan would attack every downbeat and never change clothes.',
      "A finished piece, not yet a song. There is a real character, texture and phrase layout, but the song cues are missing or they fight each other. Either the layout does not return a phrase-length idea (a fantasia, or a loop/spin with a constant arrangement and no melody riding an ostinato), or a returning layout is paired with a straight-in opening, a perpetual or on-the-beat character, and a constant arrangement. Dynamics may swell, but climaxes sit at the midpoint or repeat. Someone would hear a coherent miniature, still an étude's cousin.",
      'Song-shaped. The phrase layout is one where a three-to-four-bar idea comes back (question and answer, sentence, arch with return, call and response, vamp and tag, or a binary that returns home), or it is a loop/layer form whose texture is a tune over a repeating figure. The character and texture are a singing line over accompaniment — lyrical, hymn, dance, warm groove, searching, still, or hazy; nocturne, alberti, chordal melody, aria, stride, chorale, ostinato-under-tune, pulsing chords — not a two-hand perpetual. The opening is a vamp or a pickup, or the character is one that lands and rests at phrase ends. Arrangement may still be constant. At most one clear climax, and it is not early. On the page this is a short song without words, even if the return is not yet dressed.',
      'A song that returns in new clothes. Song-shaped, and the plan also marks the return and the peak. Arrangement is lift-on-return, a build, peak-then-bare, or terraced blocks — not constant. There is one summit late in the piece: a climax role in the last third of the bars, or a late-surge / arch dynamic shape whose climax is past the midpoint, not a climax at half-time and again at the end. A film-score or minimal plan qualifies at this level when a short loop accumulates layers or peaks then drops to a bare texture, the opening is a vamp, and a melody sits on the ostinato. A straight-in perpetual texture with a constant arrangement cannot be this level.',
    ],
  }
}

function notesRequest(op: Extract<JevOp, { op: 'notes' }>, model: string): SystemOneRequest {
  const barIndex = op.barIndex ?? 0
  const barNumber = barIndex + 1
  const memory = notesContinuityState({
    barIndex,
    bar: op.bar,
    nextChord: op.nextChord,
    melodySoFar: op.melodySoFar ?? [],
    bassSoFar: op.bassSoFar ?? [],
  })
  const hint = memory.melody_motion
  const questions: Record<string, Question> = {
    rhythm: choice(melodyRhythmInstructions(barNumber, hint), rhythmsFor(op.meter)),
  }
  for (let i = 0; i < PHRASE_NOTE_COUNT; i++) {
    questions[pitchQuestionId(i)] = choice(melodyPitchInstructions(i + 1, hint), MELODY_DEGREES)
  }
  questions[BASS_PATTERN_QUESTION_ID] = choice(bassPatternInstructions(barNumber), BASS_PATTERNS)
  return {
    model,
    state: {
      task: notesTask(barNumber, (op.melodySoFar?.length ?? 0) > 0),
      requested_style: styleState(op.style, op.brief),
      piece_character: CHARACTERS[op.character],
      piece: {
        key: KEYS[op.key],
        meter: METERS[op.meter],
        tempo: TEMPOS[op.tempo],
        texture: TEXTURES[op.texture],
        melodic_palette: PALETTES[op.palette],
      },
      melody_so_far: memory.melody_so_far,
      last_sounding_degree: memory.last_sounding_degree,
      bass_so_far: memory.bass_so_far,
      this_bar: memory.this_bar,
      voices: {
        treble: `right-hand melody of bar ${barNumber}, continuing melody_so_far`,
        bass: `left-hand bass of bar ${barNumber}, continuing bass_so_far`,
      },
    },
    questions,
  }
}

function scoreRequest(op: Extract<JevOp, { op: 'score' }>, model: string): SystemOneRequest {
  // The plan's own `style` field is withheld: the model should judge the
  // musical content, not read the label. Style questions and the song
  // Score share this one POST — not a new op.
  const questions: Record<string, Question> = {}
  for (const style of op.styles) questions[scoreQuestionId(style)] = styleMatchQuestion(style)
  questions[SONG_SCORE_QUESTION_ID] = songQualityQuestion()
  return {
    model,
    state: { task: 'Judge a composition plan for a short solo keyboard piece.', plan: describePlan(op.plan) },
    questions,
  }
}

export function buildRequest(op: JevOp, model: string): SystemOneRequest {
  switch (op.op) {
    case 'concept':
      return conceptRequest(op, model)
    case 'globals':
      return globalsRequest(op, model)
    case 'bar':
      return barRequest(op, model)
    case 'phrase':
      return phraseRequest(op, model)
    case 'score':
      return scoreRequest(op, model)
    case 'notes':
      return notesRequest(op, model)
  }
}

// ── Validation of untrusted ops (server side) ───────────────────────────────

export function parseOp(raw: unknown): JevOp {
  if (!raw || typeof raw !== 'object') throw new PlanValidationError('op: expected an object')
  const obj = raw as Record<string, unknown>
  switch (obj.op) {
    case 'concept':
      return { op: 'concept', style: parseStyle(obj.style), brief: obj.brief === true }
    case 'globals':
      return { op: 'globals', style: parseStyle(obj.style), brief: obj.brief === true, character: parseOption(CHARACTERS, obj.character, 'op.character') }
    case 'bar': {
      const roles = Array.isArray(obj.roles) ? obj.roles : []
      if (![4, 8, 16, 32].includes(roles.length)) throw new PlanValidationError('op.roles: expected 4, 8, 16 or 32 roles')
      const chords = Array.isArray(obj.chords) ? obj.chords : []
      const index = obj.index
      if (typeof index !== 'number' || !Number.isInteger(index) || index < 0 || index >= roles.length) {
        throw new PlanValidationError('op.index: out of range')
      }
      if (chords.length !== index) throw new PlanValidationError('op.chords: expected one chord per earlier bar')
      const chord2s = obj.chord2s === undefined ? undefined : obj.chord2s
      if (chord2s !== undefined && (!Array.isArray(chord2s) || chord2s.length !== index)) throw new PlanValidationError('op.chord2s: expected one entry (chord or null) per earlier bar')
      return {
        op: 'bar',
        style: parseStyle(obj.style),
        brief: obj.brief === true,
        globals: parseGlobals(obj.globals, 'op.globals'),
        roles: roles.map((role, i) => parseOption(BAR_ROLES, role, `op.roles[${i}]`)),
        chords: chords.map((chord, i) => parseOption(CHORDS, chord, `op.chords[${i}]`)),
        ...(chord2s ? { chord2s: chord2s.map((chord, i) => (chord == null ? null : parseOption(CHORDS, chord, `op.chord2s[${i}]`))) } : {}),
        index,
      }
    }
    case 'phrase': {
      const globals = parseGlobals(obj.globals, 'op.globals')
      const barCount = obj.barCount
      if (typeof barCount !== 'number' || !(BAR_COUNT_VALUES as readonly number[]).includes(barCount)) {
        throw new PlanValidationError('op.barCount: expected 4, 8, 16 or 32')
      }
      const slots = formSlots(globals.form, barCount as BarCount)
      const slotIndex = obj.slotIndex
      if (typeof slotIndex !== 'number' || !Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= slots.length) {
        throw new PlanValidationError('op.slotIndex: out of range')
      }
      const expected = slotIndex * 4
      const chords = Array.isArray(obj.chords) ? obj.chords : []
      const contours = Array.isArray(obj.contours) ? obj.contours : []
      if (chords.length !== expected) throw new PlanValidationError('op.chords: expected one chord per earlier bar')
      if (contours.length !== expected) throw new PlanValidationError('op.contours: expected one contour per earlier bar')
      return {
        op: 'phrase',
        style: parseStyle(obj.style),
        brief: obj.brief === true,
        globals,
        barCount: barCount as BarCount,
        slotIndex,
        chords: chords.map((chord, i) => parseOption(CHORDS, chord, `op.chords[${i}]`)),
        contours: contours.map((contour, i) => parseOption(CONTOURS, contour, `op.contours[${i}]`)),
      }
    }
    case 'score': {
      const styles = Array.isArray(obj.styles) ? obj.styles.map((style) => parseStyle(style)) : []
      const unique = STYLE_IDS.filter((style) => styles.includes(style))
      if (unique.length === 0) throw new PlanValidationError('op.styles: expected at least one style')
      return { op: 'score', plan: parsePlan(obj.plan), styles: unique }
    }
    case 'notes': {
      const barIndex = obj.barIndex
      if (barIndex !== undefined && (typeof barIndex !== 'number' || !Number.isInteger(barIndex) || barIndex < 0)) {
        throw new PlanValidationError('op.barIndex: expected a non-negative integer')
      }
      const meter = parseOption(METERS, obj.meter, 'op.meter')
      // New fields are optional so a Coder allowlist that only knows the
      // original notes shape still validates. When present, check them
      // against the closed note enums and (if barIndex is set) the prior count.
      const priorLength = typeof barIndex === 'number' ? barIndex : 0
      const melodySoFar = parseMelodySoFar(
        obj.melodySoFar,
        meter,
        obj.melodySoFar === undefined ? undefined : priorLength,
      )
      const bassSoFar = parseBassSoFar(obj.bassSoFar, obj.bassSoFar === undefined ? undefined : priorLength)
      const nextChord = obj.nextChord === undefined ? undefined : parseOption(CHORDS, obj.nextChord, 'op.nextChord')
      return {
        op: 'notes',
        style: parseStyle(obj.style),
        brief: obj.brief === true,
        character: parseOption(CHARACTERS, obj.character, 'op.character'),
        key: parseOption(KEYS, obj.key, 'op.key'),
        meter,
        tempo: parseOption(TEMPOS, obj.tempo, 'op.tempo'),
        texture: parseOption(TEXTURES, obj.texture, 'op.texture'),
        palette: parseOption(PALETTES, obj.palette, 'op.palette'),
        bar: parseBarPlan(obj.bar, 'op.bar'),
        ...(barIndex !== undefined ? { barIndex } : {}),
        ...(melodySoFar && melodySoFar.length > 0 ? { melodySoFar } : {}),
        ...(bassSoFar && bassSoFar.length > 0 ? { bassSoFar } : {}),
        ...(nextChord ? { nextChord } : {}),
      }
    }
    default:
      throw new PlanValidationError('op.op: expected "concept", "globals", "bar", "phrase", "score" or "notes"')
  }
}
