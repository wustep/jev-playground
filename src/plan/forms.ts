// A form label → the phrase layout of the piece.
//
// Both planners decide a FORM (one label); code expands it into four-bar
// phrase slots. Each slot carries the per-bar roles the renderer reads, plus —
// for the offline HeuristicPlanner only — a recipe for how its harmony is
// assembled from a style's harmony book (src/plan/styles.ts).
//
// Why a form label instead of one role question per bar: live Jev answers the
// per-bar questions in parallel, so each answer is a marginal that knows
// nothing of its neighbours, and the argmax came out as "statement,
// development, half cadence ×4, cadence" for almost every style. One Choice
// between whole layouts is coherent by construction — and 60 questions cheaper.
//
// NOTE: imported by the /api/jev serverless chain → explicit `.js` extensions.

import type { BarCount, BarRoleId, FormId } from './schema.js'

/** How a phrase ends harmonically. */
export type PhraseEnd = 'open' | 'half' | 'closed'

/**
 * How a slot's four chords are put together:
 *  head_tail  2-bar opening + 2-bar ending (the workhorse; may use a whole verified 4-bar phrase instead)
 *  head_seq   2-bar opening + 2-bar travelling unit (runs on into the next slot)
 *  seq_tail   2-bar travelling unit + 2-bar ending
 *  seq_seq    two travelling units (development, sequence chains)
 *  duplicate  a 2-bar idea and its immediate repeat
 *  loop       the next four bars of the piece's chord cycle
 *  pedal      a 4-bar standing-on-the-dominant (or drone) phrase
 *  coda       a 4-bar closing phrase / tag
 */
export type PhraseBuild = 'head_tail' | 'head_seq' | 'seq_tail' | 'seq_seq' | 'duplicate' | 'loop' | 'pedal' | 'coda'

export interface PhraseSlot {
  /** Slots with the same letter share their opening harmony: that is what makes a return a return. */
  material: 'a' | 'b' | 'c'
  /** A later appearance, lightly reharmonised. */
  varied: boolean
  end: PhraseEnd
  build: PhraseBuild
  roles: readonly [BarRoleId, BarRoleId, BarRoleId, BarRoleId]
}

type Roles = PhraseSlot['roles']
const slot = (material: PhraseSlot['material'], build: PhraseBuild, end: PhraseEnd, roles: Roles, varied = false): PhraseSlot => ({ material, varied, end, build, roles })

// ── four-bar role shapes ────────────────────────────────────────────────────

const R = {
  antecedent: ['statement', 'development', 'development', 'half_cadence'],
  antecedentRepeat: ['statement', 'restatement', 'development', 'half_cadence'],
  consequent: ['restatement', 'development', 'climax', 'cadence'],
  consequentSoft: ['restatement', 'development', 'development', 'cadence'],
  miniPeriod: ['statement', 'development', 'half_cadence', 'cadence'],

  presentation: ['statement', 'development', 'restatement', 'development'],
  presentationAgain: ['restatement', 'development', 'restatement', 'development'],
  continuation: ['sequence', 'sequence', 'climax', 'cadence'],
  continuationHalf: ['sequence', 'development', 'climax', 'half_cadence'],
  miniSentence: ['statement', 'restatement', 'climax', 'cadence'],

  vordersatz: ['statement', 'development', 'sequence', 'sequence'],
  spin: ['sequence', 'sequence', 'development', 'sequence'],
  spinToHalf: ['sequence', 'development', 'development', 'half_cadence'],
  epilog: ['sequence', 'development', 'climax', 'cadence'],
  frame: ['statement', 'development', 'development', 'restatement'],
  intensify: ['contrast', 'sequence', 'surprise', 'development'],
  standing: ['development', 'development', 'climax', 'half_cadence'],
  tonicPedal: ['restatement', 'development', 'development', 'cadence'],
  miniSpin: ['statement', 'sequence', 'development', 'cadence'],

  depart: ['statement', 'restatement', 'development', 'development'],
  farPoint: ['contrast', 'sequence', 'sequence', 'development'],
  wayHome: ['contrast', 'sequence', 'climax', 'cadence'],
  digress: ['development', 'surprise', 'development', 'half_cadence'],
  miniBinary: ['statement', 'half_cadence', 'development', 'cadence'],

  archOpen: ['statement', 'restatement', 'contrast', 'development'],
  archClose: ['climax', 'restatement', 'echo', 'cadence'],
  middle: ['contrast', 'contrast', 'development', 'surprise'],
  middlePeak: ['development', 'climax', 'development', 'half_cadence'],
  echoReturn: ['restatement', 'echo', 'dissolve', 'cadence'],
  miniArch: ['statement', 'contrast', 'restatement', 'cadence'],

  cellAlone: ['statement', 'restatement', 'restatement', 'restatement'],
  cellBreaker: ['statement', 'restatement', 'restatement', 'surprise'],
  cellGrow: ['restatement', 'development', 'restatement', 'surprise'],
  cellFast: ['development', 'development', 'climax', 'development'],
  cellPeak: ['development', 'sequence', 'climax', 'climax'],
  cellStop: ['restatement', 'restatement', 'dissolve', 'cadence'],
  miniLoop: ['statement', 'restatement', 'development', 'cadence'],

  pair: ['statement', 'development', 'restatement', 'echo'],
  pairNew: ['contrast', 'development', 'contrast', 'echo'],
  pairPeak: ['restatement', 'climax', 'development', 'surprise'],
  pairClose: ['contrast', 'climax', 'dissolve', 'cadence'],
  fade: ['restatement', 'echo', 'dissolve', 'cadence'],
  miniMosaic: ['statement', 'echo', 'surprise', 'cadence'],

  bare: ['statement', 'restatement', 'restatement', 'development'],
  addLayer: ['restatement', 'development', 'restatement', 'development'],
  thicken: ['development', 'sequence', 'development', 'surprise'],
  summit: ['development', 'climax', 'climax', 'development'],
  release: ['climax', 'development', 'dissolve', 'cadence'],
  buildAndLand: ['development', 'development', 'climax', 'cadence'],
  miniBuild: ['statement', 'development', 'climax', 'cadence'],

  vamp: ['statement', 'restatement', 'development', 'restatement'],
  vampFill: ['restatement', 'development', 'contrast', 'development'],
  vampLift: ['restatement', 'development', 'climax', 'surprise'],
  tag: ['development', 'surprise', 'dissolve', 'cadence'],
  bridge: ['contrast', 'development', 'sequence', 'half_cadence'],

  call: ['statement', 'echo', 'development', 'contrast'],
  callAgain: ['restatement', 'echo', 'climax', 'cadence'],
  callHalf: ['statement', 'echo', 'development', 'half_cadence'],
  reply: ['contrast', 'echo', 'development', 'sequence'],
  miniCall: ['statement', 'contrast', 'restatement', 'cadence'],

  gesture: ['statement', 'development', 'half_cadence', 'contrast'],
  wander: ['surprise', 'development', 'sequence', 'half_cadence'],
  recit: ['contrast', 'dissolve', 'statement', 'development'],
  arrive: ['surprise', 'development', 'climax', 'cadence'],
  miniFantasia: ['statement', 'surprise', 'development', 'cadence'],
} as const satisfies Record<string, Roles>

// ── the layouts ─────────────────────────────────────────────────────────────

type Layout = Record<BarCount, readonly PhraseSlot[]>

const LAYOUTS: Record<FormId, Layout> = {
  period: {
    4: [slot('a', 'head_tail', 'closed', R.miniPeriod)],
    8: [slot('a', 'head_tail', 'half', R.antecedent), slot('a', 'head_tail', 'closed', R.consequent, true)],
    16: [
      slot('a', 'head_tail', 'half', R.antecedentRepeat),
      slot('a', 'head_tail', 'closed', R.consequentSoft, true),
      slot('b', 'seq_tail', 'half', R.continuationHalf),
      slot('a', 'head_tail', 'closed', R.consequent, true),
    ],
    32: [
      slot('a', 'head_tail', 'half', R.antecedent),
      slot('a', 'head_tail', 'closed', R.consequentSoft, true),
      slot('b', 'head_seq', 'open', R.farPoint),
      slot('b', 'seq_tail', 'half', R.continuationHalf),
      slot('c', 'seq_seq', 'open', R.middle),
      slot('c', 'pedal', 'half', R.standing),
      slot('a', 'head_tail', 'half', R.antecedentRepeat, true),
      slot('a', 'head_tail', 'closed', R.consequent, true),
    ],
  },

  sentence: {
    4: [slot('a', 'head_tail', 'closed', R.miniSentence)],
    8: [slot('a', 'duplicate', 'open', R.presentation), slot('a', 'seq_tail', 'closed', R.continuation)],
    16: [
      slot('a', 'duplicate', 'open', R.presentation),
      slot('a', 'seq_tail', 'half', R.continuationHalf),
      slot('a', 'duplicate', 'open', R.presentationAgain, true),
      slot('a', 'seq_tail', 'closed', R.continuation),
    ],
    32: [
      slot('a', 'duplicate', 'open', R.presentation),
      slot('a', 'seq_tail', 'half', R.continuationHalf),
      slot('a', 'duplicate', 'open', R.presentationAgain, true),
      slot('a', 'seq_tail', 'closed', R.continuation),
      slot('b', 'head_seq', 'open', R.farPoint),
      slot('b', 'pedal', 'half', R.standing),
      slot('a', 'duplicate', 'open', R.presentationAgain, true),
      slot('a', 'seq_tail', 'closed', R.continuation),
    ],
  },

  spinning_out: {
    4: [slot('a', 'head_tail', 'closed', R.miniSpin)],
    8: [slot('a', 'head_seq', 'open', R.vordersatz), slot('a', 'seq_tail', 'closed', R.epilog)],
    16: [
      slot('a', 'head_seq', 'open', R.vordersatz),
      slot('a', 'seq_tail', 'half', R.spinToHalf),
      slot('b', 'seq_seq', 'open', R.spin),
      slot('a', 'seq_tail', 'closed', R.epilog),
    ],
    // The C-major prelude's plan: frame, sequence to V, sequence home, intensification, dominant pedal, tonic pedal.
    32: [
      slot('a', 'head_tail', 'closed', R.frame),
      slot('a', 'seq_seq', 'open', R.spin),
      slot('a', 'seq_tail', 'half', R.spinToHalf),
      slot('b', 'seq_seq', 'open', R.spin),
      slot('a', 'seq_tail', 'closed', R.tonicPedal, true),
      slot('c', 'seq_seq', 'open', R.intensify),
      slot('c', 'pedal', 'half', R.standing),
      slot('a', 'coda', 'closed', R.tonicPedal),
    ],
  },

  binary_dance: {
    4: [slot('a', 'head_tail', 'closed', R.miniBinary)],
    8: [slot('a', 'head_tail', 'half', R.antecedent), slot('b', 'seq_tail', 'closed', R.wayHome)],
    16: [
      slot('a', 'head_seq', 'open', R.depart),
      slot('a', 'seq_tail', 'half', R.continuationHalf),
      slot('b', 'seq_seq', 'open', R.farPoint),
      slot('a', 'head_tail', 'closed', R.consequent, true),
    ],
    // Cadences where the Goldberg aria puts them: bar 8 home, bar 16 on the dominant, bar 24 away, bar 32 home.
    32: [
      slot('a', 'head_seq', 'open', R.depart),
      slot('a', 'seq_tail', 'closed', R.consequentSoft),
      slot('b', 'head_seq', 'open', R.vordersatz),
      slot('b', 'seq_tail', 'half', R.spinToHalf),
      slot('c', 'seq_seq', 'open', R.farPoint),
      slot('c', 'seq_tail', 'open', R.digress),
      slot('a', 'head_seq', 'open', R.presentationAgain, true),
      slot('a', 'seq_tail', 'closed', R.epilog),
    ],
  },

  arch_return: {
    4: [slot('a', 'head_tail', 'closed', R.miniArch)],
    8: [slot('a', 'head_seq', 'open', R.archOpen), slot('a', 'head_tail', 'closed', R.archClose, true)],
    16: [
      slot('a', 'head_tail', 'open', R.antecedentRepeat),
      slot('b', 'seq_seq', 'open', R.middle),
      slot('b', 'seq_tail', 'half', R.middlePeak),
      slot('a', 'head_tail', 'closed', R.echoReturn, true),
    ],
    32: [
      slot('a', 'head_tail', 'open', R.antecedentRepeat),
      slot('a', 'head_tail', 'half', R.consequentSoft, true),
      slot('b', 'duplicate', 'open', R.pairNew),
      slot('b', 'seq_seq', 'open', R.middle),
      slot('c', 'seq_seq', 'open', R.summit),
      slot('c', 'seq_tail', 'half', R.middlePeak),
      slot('a', 'head_tail', 'open', R.presentationAgain, true),
      slot('a', 'coda', 'closed', R.echoReturn),
    ],
  },

  additive_loop: {
    4: [slot('a', 'loop', 'closed', R.miniLoop)],
    8: [slot('a', 'loop', 'open', R.cellBreaker), slot('a', 'loop', 'closed', R.buildAndLand, true)],
    16: [
      slot('a', 'loop', 'open', R.cellAlone),
      slot('a', 'loop', 'open', R.cellGrow, true),
      slot('a', 'loop', 'open', R.cellFast, true),
      slot('a', 'loop', 'closed', R.cellStop, true),
    ],
    32: [
      slot('a', 'loop', 'open', R.cellAlone),
      slot('a', 'loop', 'open', R.cellBreaker, true),
      slot('a', 'loop', 'open', R.cellGrow, true),
      slot('a', 'loop', 'open', R.cellFast, true),
      slot('a', 'loop', 'open', R.cellBreaker, true),
      slot('a', 'loop', 'open', R.addLayer, true),
      slot('a', 'loop', 'open', R.cellPeak, true),
      slot('a', 'loop', 'closed', R.cellStop, true),
    ],
  },

  mosaic_pairs: {
    4: [slot('a', 'head_tail', 'closed', R.miniMosaic)],
    8: [slot('a', 'duplicate', 'open', R.pair), slot('b', 'head_tail', 'closed', R.pairClose)],
    16: [
      slot('a', 'duplicate', 'open', R.pair),
      slot('b', 'duplicate', 'open', R.pairNew),
      slot('a', 'head_seq', 'open', R.pairPeak, true),
      slot('a', 'coda', 'closed', R.fade),
    ],
    32: [
      slot('a', 'duplicate', 'open', R.pair),
      slot('b', 'duplicate', 'open', R.pairNew),
      slot('b', 'seq_tail', 'half', R.digress),
      slot('c', 'duplicate', 'open', R.pairNew),
      slot('c', 'seq_seq', 'open', R.summit),
      slot('a', 'duplicate', 'open', R.pair, true),
      slot('b', 'head_tail', 'open', R.pairPeak, true),
      slot('a', 'coda', 'closed', R.fade),
    ],
  },

  layered_build: {
    4: [slot('a', 'loop', 'closed', R.miniBuild)],
    8: [slot('a', 'loop', 'open', R.bare), slot('a', 'loop', 'closed', R.buildAndLand, true)],
    16: [
      slot('a', 'loop', 'open', R.cellAlone),
      slot('a', 'loop', 'open', R.addLayer, true),
      slot('a', 'loop', 'open', R.thicken, true),
      slot('a', 'loop', 'closed', R.release, true),
    ],
    32: [
      slot('a', 'loop', 'open', R.cellAlone),
      slot('a', 'loop', 'open', R.bare, true),
      slot('a', 'loop', 'open', R.addLayer, true),
      slot('a', 'loop', 'open', R.addLayer, true),
      slot('b', 'seq_seq', 'open', R.thicken),
      slot('a', 'loop', 'open', R.thicken, true),
      slot('a', 'loop', 'open', R.summit, true),
      slot('a', 'loop', 'closed', R.release, true),
    ],
  },

  vamp_and_tag: {
    4: [slot('a', 'loop', 'closed', R.miniLoop)],
    8: [slot('a', 'loop', 'open', R.vamp), slot('a', 'coda', 'closed', R.tag)],
    16: [
      slot('a', 'loop', 'open', R.vamp),
      slot('a', 'loop', 'open', R.vampFill, true),
      slot('a', 'loop', 'open', R.vampLift, true),
      slot('a', 'coda', 'closed', R.tag),
    ],
    // AABA with a tag, as the pianist teaches it.
    32: [
      slot('a', 'loop', 'open', R.vamp),
      slot('a', 'head_tail', 'half', R.vampFill, true),
      slot('a', 'loop', 'open', R.vamp, true),
      slot('a', 'head_tail', 'closed', R.consequentSoft, true),
      slot('b', 'head_seq', 'open', R.bridge),
      slot('b', 'seq_tail', 'half', R.middlePeak),
      slot('a', 'loop', 'open', R.vampLift, true),
      slot('a', 'coda', 'closed', R.tag),
    ],
  },

  call_and_response: {
    4: [slot('a', 'head_tail', 'closed', R.miniCall)],
    8: [slot('a', 'head_tail', 'half', R.callHalf), slot('a', 'head_tail', 'closed', R.callAgain, true)],
    16: [
      slot('a', 'head_tail', 'half', R.callHalf),
      slot('a', 'head_tail', 'open', R.call, true),
      slot('b', 'seq_seq', 'open', R.reply),
      slot('a', 'head_tail', 'closed', R.callAgain, true),
    ],
    32: [
      slot('a', 'head_tail', 'half', R.callHalf),
      slot('a', 'head_tail', 'closed', R.callAgain, true),
      slot('b', 'head_seq', 'open', R.reply),
      slot('b', 'seq_tail', 'half', R.continuationHalf),
      slot('a', 'head_tail', 'open', R.call, true),
      slot('c', 'seq_seq', 'open', R.summit),
      slot('c', 'pedal', 'half', R.standing),
      slot('a', 'head_tail', 'closed', R.callAgain, true),
    ],
  },

  free_fantasia: {
    4: [slot('a', 'head_tail', 'closed', R.miniFantasia)],
    8: [slot('a', 'head_seq', 'open', R.gesture), slot('b', 'seq_tail', 'closed', R.arrive)],
    16: [
      slot('a', 'head_seq', 'open', R.gesture),
      slot('b', 'seq_tail', 'half', R.wander),
      slot('c', 'head_seq', 'open', R.recit),
      slot('b', 'seq_tail', 'closed', R.arrive, true),
    ],
    32: [
      slot('a', 'head_seq', 'open', R.gesture),
      slot('b', 'seq_tail', 'half', R.wander),
      slot('c', 'head_seq', 'open', R.recit),
      slot('c', 'seq_seq', 'open', R.intensify),
      slot('b', 'pedal', 'half', R.standing),
      slot('a', 'head_seq', 'open', R.recit, true),
      slot('c', 'seq_seq', 'open', R.summit),
      slot('a', 'coda', 'closed', R.arrive),
    ],
  },
}

/** The four-bar phrase slots of `form` at `bars` bars. */
export function formSlots(form: FormId, bars: BarCount): readonly PhraseSlot[] {
  return LAYOUTS[form][bars]
}

/** Per-bar roles of `form` at `bars` bars — what both planners write into the plan. */
export function formRoles(form: FormId, bars: BarCount): BarRoleId[] {
  return formSlots(form, bars).flatMap((phrase) => [...phrase.roles])
}
