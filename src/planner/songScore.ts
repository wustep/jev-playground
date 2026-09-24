// Deterministic stand-in for the `song_quality` Score.
//
// Jev judges only `describePlan` labels. This counts how many of the four
// cues are high and maps 0→0, 1→1, 2→2, 3–4→3 so offline Best moves. Not
// ground truth — plumbing, same as heuristicMatch.
//
// The cues used to be read off `character`, `texture`, `opening` and
// `arrangement`, which is part of why they could all be high while the piece
// sounded like an étude: none of those four labels reached the melody. They
// now read the fields that do.

import { barPositions } from '../plan/phrase'
import { type AccompanimentId, type BarCount, type CompositionPlan, type DynamicShapeId, type FormId, type MotionId } from '../plan/schema'
import type { SongQualityScore } from './Planner'

/** Accompaniments that leave room for a tune rather than being the music themselves. */
const SUPPORTING: ReadonlySet<AccompanimentId> = new Set<AccompanimentId>(['sustained', 'broken', 'pulse', 'stride'])
/** Motions whose line has room to land and breathe between phrases. */
const BREATHING: ReadonlySet<MotionId> = new Set<MotionId>(['sustained', 'walking', 'flowing'])
const RETURNING_FORMS: ReadonlySet<FormId> = new Set<FormId>(['period', 'sentence', 'arch'])
const SUMMIT_SHAPES: ReadonlySet<DynamicShapeId> = new Set<DynamicShapeId>(['late_surge', 'arch', 'build_then_drop'])

/** A singing line with air in it, over something that supports rather than competes. */
export function breathCueHigh(plan: CompositionPlan): boolean {
  return BREATHING.has(plan.motion) && SUPPORTING.has(plan.accompaniment)
}

/** The form brings a phrase-length idea back. */
export function returnCueHigh(plan: CompositionPlan): boolean {
  if (RETURNING_FORMS.has(plan.form)) return true
  return barPositions(plan.form, plan.bars.length as BarCount).some((position) => position.returnsFrom !== undefined)
}

/**
 * The return arrives in new clothes rather than as a literal repeat.
 *
 * Gated on there being a singing line at all: an ornamented return means
 * nothing if no voice is the tune, and without this gate a two-voice
 * counterpoint study in period form scored as high as an actual song.
 */
export function arrangementCueHigh(plan: CompositionPlan): boolean {
  if (!breathCueHigh(plan)) return false
  return barPositions(plan.form, plan.bars.length as BarCount).some((position) => position.returnsFrom !== undefined && position.ornamentReturn)
}

/**
 * One late summit the listener can actually hear.
 *
 * Climax placement is derived now, and always lands in the last third — so
 * "is there a late climax" no longer discriminates between plans and is not
 * worth asking. What still varies is whether the dynamics rise to meet it.
 */
export function summitCueHigh(plan: CompositionPlan): boolean {
  if (!SUMMIT_SHAPES.has(plan.dynamicShape)) return false
  const n = plan.bars.length
  const climaxes = barPositions(plan.form, n as BarCount).map((position, i) => (position.role === 'climax' ? i : -1)).filter((i) => i >= 0)
  return climaxes.length === 1 && climaxes[0] >= Math.floor((n * 2) / 3)
}

export function songQualityCues(plan: CompositionPlan): number {
  return [breathCueHigh, returnCueHigh, arrangementCueHigh, summitCueHigh].filter((cue) => cue(plan)).length
}

/** 0–3 raw on the same scale as the `song_quality` Score. */
export function heuristicSongQuality(plan: CompositionPlan): SongQualityScore {
  const cues = songQualityCues(plan)
  return { raw: cues >= 3 ? 3 : cues, confidence: 0.7 }
}
