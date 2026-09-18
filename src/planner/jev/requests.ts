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
import { MELODY_DEGREES, PHRASE_NOTE_COUNT, pitchQuestionId, rhythmsFor } from '../../plan/notes.js'
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
  /** Debug-only: one right-hand phrase. Closed enums; callers repeat per plan bar. */
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
    ...(globals.arrangement ? { arrangement: ARRANGEMENTS[globals.arrangement] } : {}),
    ...(globals.opening ? { opening: OPENINGS[globals.opening] } : {}),
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

function styleMatchQuestion(style: StyleId): ScoreQuestion {
  const name = STYLE_LABELS[style]
  return {
    type: 'score',
    instructions: `How closely does the composition plan in \`plan\` match the musical style of ${name}? Judge texture, chord vocabulary, tempo, dynamics and instrument together.`,
    criteria: [
      `The plan's texture, harmony, tempo and dynamics belong to a clearly different musical tradition from ${name}; someone who knows ${name}'s music would not recognise it here.`,
      `Some of the plan's choices are typical of ${name}, but others are generic or point to a different composer; the resemblance is only partial.`,
      `The plan's texture, chord vocabulary, tempo, dynamics and instrument are all characteristic of ${name}; someone who knows the music would recognise the style immediately.`,
    ],
  }
}

function notesRequest(op: Extract<JevOp, { op: 'notes' }>, model: string): SystemOneRequest {
  const barNumber = (op.barIndex ?? 0) + 1
  const questions: Record<string, Question> = {
    rhythm: choice(
      `Which rhythm should the right-hand melody of bar ${barNumber} use? Each option fills the bar with exactly four slots on the sixteenth-note grid.`,
      rhythmsFor(op.meter),
    ),
  }
  for (let i = 0; i < PHRASE_NOTE_COUNT; i++) {
    questions[pitchQuestionId(i)] = choice(
      `Which scale degree (or rest) should slot ${i + 1} of that four-note melody sing? Degrees are relative to the key in \`piece.key\`, coloured by the harmony in \`this_bar\`.`,
      MELODY_DEGREES,
    )
  }
  return {
    model,
    state: {
      task: `Write the right-hand melody for bar ${barNumber} of a short keyboard piece. Software will place your choices on a sixteenth-note grid; pick only from the options given — never invent pitches or durations.`,
      requested_style: styleState(op.style, op.brief),
      piece_character: CHARACTERS[op.character],
      piece: {
        key: KEYS[op.key],
        meter: METERS[op.meter],
        tempo: TEMPOS[op.tempo],
        texture: TEXTURES[op.texture],
        melodic_palette: PALETTES[op.palette],
      },
      this_bar: {
        bar_number: barNumber,
        chord: `${op.bar.chord} — ${CHORDS[op.bar.chord]}`,
        ...(op.bar.chord2 ? { second_half_chord: `${op.bar.chord2} — ${CHORDS[op.bar.chord2]}` } : {}),
        role: `${op.bar.role} — ${BAR_ROLES[op.bar.role]}`,
        melodic_shape: CONTOURS[op.bar.contour],
      },
      voice: `treble — the singing right-hand line of bar ${barNumber}`,
    },
    questions,
  }
}

function scoreRequest(op: Extract<JevOp, { op: 'score' }>, model: string): SystemOneRequest {
  // The plan's own `style` field is withheld: the model should judge the
  // musical content, not read the label.
  const questions: Record<string, Question> = {}
  for (const style of op.styles) questions[scoreQuestionId(style)] = styleMatchQuestion(style)
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
      return {
        op: 'notes',
        style: parseStyle(obj.style),
        brief: obj.brief === true,
        character: parseOption(CHARACTERS, obj.character, 'op.character'),
        key: parseOption(KEYS, obj.key, 'op.key'),
        meter: parseOption(METERS, obj.meter, 'op.meter'),
        tempo: parseOption(TEMPOS, obj.tempo, 'op.tempo'),
        texture: parseOption(TEXTURES, obj.texture, 'op.texture'),
        palette: parseOption(PALETTES, obj.palette, 'op.palette'),
        bar: parseBarPlan(obj.bar, 'op.bar'),
        ...(barIndex !== undefined ? { barIndex } : {}),
      }
    }
    default:
      throw new PlanValidationError('op.op: expected "concept", "globals", "bar", "phrase", "score" or "notes"')
  }
}
