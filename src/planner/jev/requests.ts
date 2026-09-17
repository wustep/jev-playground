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
//  • Chords DO depend on each other, so they are asked one bar at a time with
//    the progression-so-far in state ("respond to changing state").
//  • Choice criteria are the enum descriptions from schema.ts; Score levels
//    describe standalone situations because the model never sees the ordering.

import {
  BAR_COUNTS,
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
  PlanValidationError,
  parseGlobals,
  parseOption,
  parsePlan,
  parseStyle,
  type BarRoleId,
  type CharacterId,
  type ChordId,
  type CompositionPlan,
  type GlobalField,
  type KeyId,
  type PlanGlobals,
  type StyleId,
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
      index: number
    }
  | { op: 'score'; plan: CompositionPlan; styles: StyleId[] }

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
  questions.barCount = choice(
    'How long should a piece with the character in `piece_character` be, in the style of `requested_style.name`?',
    BAR_COUNTS,
  )
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

function barRequest(op: Extract<JevOp, { op: 'bar' }>, model: string): SystemOneRequest {
  const bars: Json[] = op.roles.map((role, i) => ({
    bar: i + 1,
    role: `${role} — ${BAR_ROLES[role]}`,
    chord:
      i < op.index
        ? `${op.chords[i]} — ${CHORDS[op.chords[i]]}`
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
      chord: `${bar.chord} — ${CHORDS[bar.chord]}`,
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
    case 'score':
      return scoreRequest(op, model)
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
      return {
        op: 'bar',
        style: parseStyle(obj.style),
        brief: obj.brief === true,
        globals: parseGlobals(obj.globals, 'op.globals'),
        roles: roles.map((role, i) => parseOption(BAR_ROLES, role, `op.roles[${i}]`)),
        chords: chords.map((chord, i) => parseOption(CHORDS, chord, `op.chords[${i}]`)),
        index,
      }
    }
    case 'score': {
      const styles = Array.isArray(obj.styles) ? obj.styles.map((style) => parseStyle(style)) : []
      const unique = STYLE_IDS.filter((style) => styles.includes(style))
      if (unique.length === 0) throw new PlanValidationError('op.styles: expected at least one style')
      return { op: 'score', plan: parsePlan(obj.plan), styles: unique }
    }
    default:
      throw new PlanValidationError('op.op: expected "concept", "globals", "bar" or "score"')
  }
}
