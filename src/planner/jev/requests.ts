// Everything Jev is ever asked, as pure functions: JevOp → { state, questions }.
//
// The browser never sends raw state/questions to the proxy — it sends a small
// typed JevOp, and the server re-validates it and builds the request itself
// with these same functions. That keeps /api/jev from being an open relay for
// whoever finds the URL.
//
// Design notes (from docs.typesafe.ai):
//  • Questions in one request run in parallel and cannot see each other, so
//    everything independent is fanned out in ONE call (globals + the bar roles
//    for all supported lengths, speculatively).
//  • Chords DO depend on each other, so they are asked one bar at a time with
//    the progression-so-far in state ("respond to changing state").
//  • Choice criteria are the enum descriptions from schema.ts; Score levels
//    describe standalone situations because the model never sees the ordering.

import {
  BAR_COUNTS,
  BAR_ROLES,
  CHORDS,
  CONTOURS,
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
  type ChordId,
  type CompositionPlan,
  type GlobalField,
  type PlanGlobals,
  type StyleId,
} from '../../plan/schema.js'
import { STYLE_PROFILES } from '../../plan/styles.js'
import type { ChoiceQuestion, Json, Question, ScoreQuestion, SystemOneRequest } from './systemOne.js'

export type JevOp =
  | { op: 'globals'; style: StyleId; brief: boolean }
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
  'Plan a short piece for solo keyboard in the requested style. Software will expand the plan into notes, so every decision should be the option most characteristic of that style.'

// ── Question wording ────────────────────────────────────────────────────────

const GLOBAL_INSTRUCTIONS: Record<GlobalField, string> = {
  key: 'Which key is most characteristic for a short keyboard piece in the style of `requested_style.name`?',
  meter: 'Which meter is most characteristic for a short keyboard piece in the style of `requested_style.name`?',
  texture: 'Which keyboard texture would most immediately sound like `requested_style.name` to a listener?',
  palette: 'Which pool of melody and passing notes best fits the style of `requested_style.name`?',
  tempo: 'Which tempo best suits a characteristic short keyboard piece in the style of `requested_style.name`?',
  dynamics: 'Which overall dynamic level best suits a characteristic short piece in the style of `requested_style.name`?',
  dynamicShape: 'How do dynamics typically behave over a phrase in the style of `requested_style.name`?',
  defaultInstrument: 'Which of these instruments is most closely associated with the style of `requested_style.name`?',
}

const choice = (instructions: string, criteria: Record<string, string>): ChoiceQuestion => ({
  type: 'choice',
  instructions,
  criteria,
})

/** Question ids for the speculative role fan-out, e.g. `role8_3`. */
export const roleQuestionId = (length: 4 | 8 | 16 | 32, index: number) => `role${length}_${index}`

function globalsRequest(op: Extract<JevOp, { op: 'globals' }>, model: string): SystemOneRequest {
  const questions: Record<string, Question> = {}
  for (const field of GLOBAL_FIELD_IDS) {
    questions[field] = choice(GLOBAL_INSTRUCTIONS[field], GLOBAL_FIELDS[field])
  }
  questions.barCount = choice(
    'How long should a characteristic musical idea in the style of `requested_style.name` be?',
    BAR_COUNTS,
  )
  // Speculative fan-out: ask the phrase role of every bar under all supported
  // lengths. Code reads only the set matching the chosen length.
  for (const length of [4, 8, 16, 32] as const) {
    for (let i = 0; i < length; i++) {
      questions[roleQuestionId(length, i)] = choice(
        `Suppose the piece is exactly ${length} bars long. What role should bar ${i + 1} of ${length} play in a phrase shaped the way \`requested_style.name\` typically shapes phrases? The first bar normally presents the idea and the last bar normally closes.`,
        BAR_ROLES,
      )
    }
  }
  return { model, state: { task: TASK, requested_style: styleState(op.style, op.brief) }, questions }
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
        'Which chord should bar `current_bar` use so that the progression in `bars` continues the way `requested_style.name` would most characteristically write it? Chords are roman numerals relative to the key in `piece.key`; take the role of the current bar and the chords already chosen into account.',
        CHORDS,
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
    case 'globals':
      return { op: 'globals', style: parseStyle(obj.style), brief: obj.brief === true }
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
      throw new PlanValidationError('op.op: expected "globals", "bar" or "score"')
  }
}
