// Deterministic stand-in for the `song_quality` Score (Appendix B).
//
// Jev judges only `describePlan` labels. This counts how many of the four
// B.2 cues are high and maps 0→0, 1→1, 2→2, 3–4→3 so offline Best moves.
// Not ground truth — plumbing, same as heuristicMatch.

import {
  type ArrangementId,
  type CharacterId,
  type CompositionPlan,
  type DynamicShapeId,
  type FormId,
  type OpeningId,
  type TextureId,
} from '../plan/schema'
import type { SongQualityScore } from './Planner'

const SINGING_CHARACTERS = new Set<CharacterId>([
  'lyrical_song',
  'solemn_hymn',
  'dance_lilt',
  'warm_groove',
  'restless_searching',
  'meditative_stillness',
  'dreamy_haze',
])
const SINGING_TEXTURES = new Set<TextureId>([
  'alberti_melody',
  'rolling_nocturne',
  'chordal_melody',
  'aria_walking_bass',
  'stride_dance',
  'lush_voicings',
  'bossa_comp',
  'melody_over_ostinato',
  'chorale',
  'pulsing_chords',
])
const BREATHING_OPENINGS = new Set<OpeningId>(['pickup', 'vamp_intro'])
const RETURNING_FORMS = new Set<FormId>([
  'period',
  'sentence',
  'arch_return',
  'call_and_response',
  'vamp_and_tag',
  'binary_dance',
])
const LOOP_LAYER_FORMS = new Set<FormId>(['additive_loop', 'layered_build', 'spinning_out'])
const LOOP_TUNE_TEXTURES = new Set<TextureId>(['melody_over_ostinato', 'pulsing_chords'])
const LIFT_ARRANGEMENTS = new Set<ArrangementId>(['lift_on_return', 'build', 'peak_then_bare', 'terraced_blocks'])
const SUMMIT_SHAPES = new Set<DynamicShapeId>(['late_surge', 'arch'])

function openingOf(plan: CompositionPlan): OpeningId {
  return plan.opening ?? 'straight_in'
}

function arrangementOf(plan: CompositionPlan): ArrangementId {
  return plan.arrangement ?? 'lift_on_return'
}

/** Breath / rests / not perpetual downbeats (B.2). */
export function breathCueHigh(plan: CompositionPlan): boolean {
  const singingCharacter = SINGING_CHARACTERS.has(plan.character)
  const breathingOpen = BREATHING_OPENINGS.has(openingOf(plan))
  return (singingCharacter || breathingOpen) && SINGING_TEXTURES.has(plan.texture)
}

/** Phrase-length return, or a loop/layer with a tune on top (B.2). */
export function returnCueHigh(plan: CompositionPlan): boolean {
  if (RETURNING_FORMS.has(plan.form)) return true
  if (!LOOP_LAYER_FORMS.has(plan.form)) return false
  return arrangementOf(plan) !== 'constant' || LOOP_TUNE_TEXTURES.has(plan.texture)
}

/** Arrangement lift on return (B.2). */
export function arrangementCueHigh(plan: CompositionPlan): boolean {
  return LIFT_ARRANGEMENTS.has(arrangementOf(plan))
}

/**
 * One late summit: exactly one climax in the last third, or late_surge/arch
 * with the last climax past the midpoint (B.2).
 */
export function summitCueHigh(plan: CompositionPlan): boolean {
  const n = plan.bars.length
  const climaxes = plan.bars.map((bar, i) => (bar.role === 'climax' ? i : -1)).filter((i) => i >= 0)
  const lastThirdStart = Math.floor((n * 2) / 3) + 1
  if (climaxes.length === 1 && climaxes[0] + 1 >= lastThirdStart) return true
  if (!SUMMIT_SHAPES.has(plan.dynamicShape) || climaxes.length === 0) return false
  return climaxes[climaxes.length - 1] + 1 > n / 2
}

export function songQualityCues(plan: CompositionPlan): number {
  return [breathCueHigh, returnCueHigh, arrangementCueHigh, summitCueHigh].filter((cue) => cue(plan)).length
}

/** 0–3 raw on the same scale as the `song_quality` Score. */
export function heuristicSongQuality(plan: CompositionPlan): SongQualityScore {
  const cues = songQualityCues(plan)
  const raw = cues >= 3 ? 3 : cues
  return { raw, confidence: 0.7 }
}
