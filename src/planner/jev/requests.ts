// Everything Jev is ever asked, as pure functions: JevOp → { state, questions }.
//
// The browser never sends raw state/questions to the proxy — it sends a small
// typed JevOp, and the server re-validates it and builds the request itself
// with these same functions. That keeps /api/jev from being an open relay for
// whoever finds the URL.
//
// Three ops, down from six. `concept` asked for a `character` that turned out
// to change no sounding note; `bar` was superseded by `phrase`; `notes` was
// the two experimental note-writing paths, which are gone with the modes they
// served. What is left is: decide the piece, decide its phrases, judge it.
//
// Design notes (from docs.typesafe.ai, and from watching live distributions):
//  • Questions in one request run in parallel and cannot see each other, so
//    everything independent is fanned out in ONE call (all the globals).
//  • Register, motion and accompaniment lead the globals question set. They
//    are the three that decide what a listener actually hears, and they are
//    the three the old schema had no way to say at all.
//  • Phrase layout is ONE Choice between whole forms, not a role question per
//    bar: parallel per-bar marginals can't see each other and came back as
//    "half cadence" four bars running.
//  • Harmony is one Choice per 4-bar form slot, whose options are that style's
//    HarmonyBook heads / seqs / tails / verified phrases for the slot's
//    PhraseEnd.
//  • Choice criteria are the enum descriptions from schema.ts; Score levels
//    describe standalone situations because the model never sees the ordering.

import { BARS_PER_PHRASE, formSlots, barPositions, type BarRole } from '../../plan/phrase.js'
import { phraseCriteria, PHRASE_ENDS, slotCatalog, slotContourQuestionId } from '../../plan/harmonyPhrases.js'
import {
  ACCOMPANIMENTS,
  BAR_COUNT_VALUES,
  CHORDS,
  CONTOURS,
  DYNAMIC_SHAPES,
  DYNAMICS,
  FORMS,
  GLOBAL_FIELDS,
  GLOBAL_FIELD_IDS,
  KEYS,
  METERS,
  MOTIONS,
  PALETTES,
  PlanValidationError,
  parseOption,
  REGISTERS,
  STYLE_LABELS,
  TEMPOS,
  parseGlobals,
  parsePlan,
  parseStyle,
  type BarCount,
  type ChordId,
  type CompositionPlan,
  type ContourId,
  type GlobalField,
  type PlanGlobals,
  type StyleId,
} from '../../plan/schema.js'
import { STYLE_PROFILES } from '../../plan/styles.js'
import type { ChoiceQuestion, Json, Question, ScoreQuestion, SystemOneRequest } from './systemOne.js'

export type JevOp =
  | { op: 'globals'; style: StyleId; brief: boolean }
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

// ── State helpers ───────────────────────────────────────────────────────────

function styleState(style: StyleId, brief: boolean): Json {
  return brief ? { name: STYLE_LABELS[style], description: STYLE_PROFILES[style].brief } : { name: STYLE_LABELS[style] }
}

/** Enum ids mean nothing to the model; state always carries the descriptions. */
function describeGlobals(globals: PlanGlobals): Json {
  return {
    melody_register: REGISTERS[globals.register],
    melody_motion: MOTIONS[globals.motion],
    accompaniment: ACCOMPANIMENTS[globals.accompaniment],
    phrase_layout: FORMS[globals.form],
    key: KEYS[globals.key],
    meter: METERS[globals.meter],
    melodic_palette: PALETTES[globals.palette],
    tempo: TEMPOS[globals.tempo],
    dynamics: DYNAMICS[globals.dynamics],
    dynamic_shape: DYNAMIC_SHAPES[globals.dynamicShape],
  }
}

const TASK =
  'Plan a short piece for solo keyboard in the requested style. Software will expand the plan into notes: it writes the singing line first, in the register and at the motion you choose, and then accompanies it with the pattern you choose. Choose what that composer would plausibly write.'

// ── Question wording ────────────────────────────────────────────────────────

const GLOBAL_INSTRUCTIONS: Record<GlobalField, string> = {
  register:
    'Where would the singing line of a short keyboard piece by `requested_style.name` sit? Low is a covered cantabile around and just above middle C; mid is a plain soprano; high is a bright vocal line with air under it. Answer for the tune itself, not for the accompaniment or the instrument\'s range.',
  motion:
    'How fast would that singing line move, in notes per beat? Sustained is one or two long notes to a bar; walking is about one note a beat; flowing is about two; florid is running figuration decorating a slower skeleton.',
  accompaniment:
    'What holds the tune up in a short keyboard piece by `requested_style.name`? Held chords, a chord broken and rolled continuously, a repeated pulse, a bass-then-chords dance pattern, or a second independent line of equal weight.',
  form: 'How would `requested_style.name` most plausibly lay out the phrases of a short piece?',
  key: 'Which key would `requested_style.name` plausibly choose for a short piece?',
  meter: 'Which meter suits a short piece in the style of `requested_style.name`?',
  palette: 'Which pool of melody and passing notes fits a short piece in the style of `requested_style.name`?',
  tempo: 'Which tempo suits a short piece in the style of `requested_style.name`?',
  dynamics: 'Which overall dynamic level suits a short piece in the style of `requested_style.name`?',
  dynamicShape: 'How would the dynamics behave over a short piece in the style of `requested_style.name`?',
}

const choice = (instructions: string, criteria: Record<string, string>): ChoiceQuestion => ({
  type: 'choice',
  instructions,
  criteria,
})

function globalsRequest(op: Extract<JevOp, { op: 'globals' }>, model: string): SystemOneRequest {
  const questions: Record<string, Question> = {}
  for (const field of GLOBAL_FIELD_IDS) questions[field] = choice(GLOBAL_INSTRUCTIONS[field], GLOBAL_FIELDS[field])
  return { model, state: { task: TASK, requested_style: styleState(op.style, op.brief) }, questions }
}

const describeChord = (chord: ChordId, chord2: ChordId | null | undefined) =>
  `${chord} — ${CHORDS[chord]}` + (chord2 ? `; second half of the bar: ${chord2} — ${CHORDS[chord2]}` : '')

/** What a bar is doing, in words — derived from the form, never planned. */
const ROLE_WORDS: Record<BarRole, string> = {
  statement: 'presents the idea',
  continuation: 'carries it on',
  sequence: 'the previous bar\'s figure on a new harmony',
  contrast: 'departs — new register or colour',
  climax: 'the peak of the piece',
  half_cadence: 'pauses, unresolved',
  cadence: 'closes',
}

function phraseRequest(op: Extract<JevOp, { op: 'phrase' }>, model: string): SystemOneRequest {
  const { slot, options } = slotCatalog(op.style, op.globals, op.barCount, op.slotIndex)
  const slots = formSlots(op.globals.form, op.barCount)
  const positions = barPositions(op.globals.form, op.barCount)
  const start = op.slotIndex * BARS_PER_PHRASE
  const roleAt = (bar: number) => positions[bar]?.role ?? 'continuation'
  const priorSlots = slots.slice(0, op.slotIndex).map((earlier, s) => ({
    slot: s + 1,
    how_it_ends: PHRASE_ENDS[earlier.end],
    bars: [0, 1, 2, 3].map((k) => {
      const bar = s * BARS_PER_PHRASE + k
      return {
        bar: bar + 1,
        role: `${roleAt(bar)} — ${ROLE_WORDS[roleAt(bar)]}`,
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
      roles: [0, 1, 2, 3].map((k) => `${roleAt(start + k)} — ${ROLE_WORDS[roleAt(start + k)]}`),
      how_it_ends: PHRASE_ENDS[slot.end],
      ...(slot.returnsFrom !== undefined ? { brings_back_phrase: slot.returnsFrom + 1 } : {}),
      prior_melodic_shapes: op.contours.slice(-4).map((contour) => CONTOURS[contour]),
    },
  }
  const questions: Record<string, Question> = {
    phrase: choice(
      'Which four-bar harmonic phrase should occupy `current_slot` so the progression in `phrases_so_far` continues in this style? Options are stock openings, travelling units, cadences and verified phrases from the style book, described functionally. Match the close described in `current_slot.how_it_ends`. Do not name composers.',
      phraseCriteria(options),
    ),
  }
  for (let k = 0; k < 4; k++) {
    const role = roleAt(start + k)
    questions[slotContourQuestionId(k)] = choice(
      `Which shape should the singing line have in bar ${start + k + 1}? That bar ${ROLE_WORDS[role]}. Take the shapes already chosen in \`current_slot.prior_melodic_shapes\` and \`phrases_so_far\` into account.`,
      CONTOURS,
    )
  }
  return { model, state, questions }
}

export function describePlan(plan: CompositionPlan): Json {
  const positions = barPositions(plan.form, plan.bars.length as BarCount)
  return {
    ...(describeGlobals(plan) as Record<string, Json>),
    length_in_bars: plan.bars.length,
    bars: plan.bars.map((bar, i) => ({
      bar: i + 1,
      chord: describeChord(bar.chord, bar.chord2),
      role: ROLE_WORDS[positions[i]?.role ?? 'continuation'],
      melodic_shape: CONTOURS[bar.contour],
    })),
  }
}

export const scoreQuestionId = (style: StyleId) => `match_${style}`

/** Song-quality Score on the existing `score` op. Not a new op. */
export const SONG_SCORE_QUESTION_ID = 'song_quality'

function styleMatchQuestion(style: StyleId): ScoreQuestion {
  const name = STYLE_LABELS[style]
  return {
    type: 'score',
    instructions: `How closely does \`plan\` match the musical style of ${name}? Judge where the tune sings, how fast it moves, what holds it up, the harmony and the phrase layout together. The style name is not written on the plan; do not reward a lucky guess at the label.`,
    criteria: [
      "A different tradition: the register, the accompaniment and the harmony would not be recognised as this musician's.",
      'Partial: some choices fit, but the accompaniment, the phrase layout or the chord vocabulary points elsewhere, or at a generic étude.',
      'Immediate: someone who knows the music would recognise the kind of piece — where the tune sits, how it moves, what is under it, and how it returns.',
    ],
  }
}

/**
 * Song-quality Score. The criteria used to be written in terms of
 * `character`, `texture`, `opening` and `arrangement`, none of which reached
 * the melody — so a plan could score well here and still sound like an étude.
 * They are now written in terms of the fields that decide the sound.
 */
function songQualityQuestion(): ScoreQuestion {
  return {
    type: 'score',
    instructions:
      'How song-like is the composition plan in `plan`? Judge only the labels in `plan` — where the melody sings, how fast it moves, what accompanies it, the phrase layout, the dynamic shape, the length, and each bar\'s role. Do not imagine notes, rests, MIDI, or a performance. A song here means a short keyboard piece a listener would hear as a tune that returns, can breathe, and changes clothes; an étude means unbroken figuration with no line above it.',
    criteria: [
      'Étude or study. There is no singing line to speak of: the melody runs continuously at the same rate as its accompaniment, or the accompaniment is a second line of equal weight so no voice is the tune. The phrase layout brings nothing back. Realising this plan would attack every beat of every bar and never land.',
      'A finished piece, not yet a song. There is a real melodic register and something supporting it, but the song cues are missing or fight each other: the layout does not bring a phrase back, or a returning layout is paired with a line so busy it cannot breathe. Someone would hear a coherent miniature, still an étude\'s cousin.',
      'Song-shaped. A melody in a definite register, moving slowly enough to land and rest, over an accompaniment that supports rather than competes — and a phrase layout that brings a four-bar idea back. The return may still be literal. On the page this is a short song without words.',
      'A song that returns in new clothes. Song-shaped, and the return is decorated rather than repeated, with one summit late in the piece: a climax bar in the last third, or an arch or late-surge shape peaking past the midpoint — not a climax at half-time and again at the end.',
    ],
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
    case 'globals':
      return globalsRequest(op, model)
    case 'phrase':
      return phraseRequest(op, model)
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
    case 'phrase': {
      const barCount = obj.barCount
      if (typeof barCount !== 'number' || !(BAR_COUNT_VALUES as readonly number[]).includes(barCount)) {
        throw new PlanValidationError(`op.barCount: expected one of ${BAR_COUNT_VALUES.join(', ')}`)
      }
      const globals = parseGlobals(obj.globals, 'op.globals')
      const slots = formSlots(globals.form, barCount as BarCount)
      const slotIndex = obj.slotIndex
      if (typeof slotIndex !== 'number' || !Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= slots.length) {
        throw new PlanValidationError('op.slotIndex: out of range')
      }
      const chords = Array.isArray(obj.chords) ? obj.chords : []
      const contours = Array.isArray(obj.contours) ? obj.contours : []
      if (chords.length !== slotIndex * BARS_PER_PHRASE) throw new PlanValidationError('op.chords: expected one chord per earlier bar')
      if (contours.length !== slotIndex * BARS_PER_PHRASE) throw new PlanValidationError('op.contours: expected one contour per earlier bar')
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
      const styles = Array.isArray(obj.styles) ? obj.styles : []
      const unique = [...new Set(styles.map((style, i) => parseStyle(style, `op.styles[${i}]`)))]
      if (!unique.length) throw new PlanValidationError('op.styles: expected at least one style')
      return { op: 'score', plan: parsePlan(obj.plan), styles: unique }
    }
  }
  throw new PlanValidationError(`op: unknown op "${String(obj.op)}"`)
}
