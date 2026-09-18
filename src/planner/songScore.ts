// Deterministic stand-in for the `song` Score on the `score` op.
//
// Jev judges the plan JSON it sees in state (form, opening, arrangement,
// dynamic shape, character, texture, bar roles). This function reads the
// same fields and approximates that rubric so Best-of-N still works offline.
//
// Criteria come from docs/fable-context/FIDELITY_FINDINGS.md (phrase-length
// returns, breath/pickup/vamp, arrangement that changes on return, one late
// summit; not a perpetual on-the-beat étude). JEV_REQUEST_STRUCTURE_REVIEW.md
// was not on main; the Score wording in requests.ts is invented from those
// findings.

import { themeSources } from '../plan/forms'
import {
  MATCH_LEVELS,
  type ArrangementId,
  type BarCount,
  type CharacterId,
  type CompositionPlan,
  type DynamicShapeId,
  type OpeningId,
  type StyleMatchScore,
  type TextureId,
} from '../plan/schema'

const PERPETUAL_CHARACTERS = new Set<CharacterId>(['flowing_perpetual', 'hypnotic_pulse'])
const BREATHING_CHARACTERS = new Set<CharacterId>([
  'lyrical_song',
  'warm_groove',
  'dreamy_haze',
  'meditative_stillness',
  'dance_lilt',
])
const PERPETUAL_TEXTURES = new Set<TextureId>([
  'toccata_perpetual',
  'broken_chord_prelude',
  'two_voice_counterpoint',
  'minimal_cells',
  'interlocking_hands',
  'displaced_arpeggio',
])
const SINGING_TEXTURES = new Set<TextureId>([
  'alberti_melody',
  'stride_dance',
  'rolling_nocturne',
  'chordal_melody',
  'aria_walking_bass',
  'lush_voicings',
  'melody_over_ostinato',
])
const CHANGING_ARRANGEMENTS = new Set<ArrangementId>(['lift_on_return', 'build', 'peak_then_bare', 'terraced_blocks'])
const BREATHING_OPENINGS = new Set<OpeningId>(['pickup', 'vamp_intro'])
const SUMMIT_SHAPES = new Set<DynamicShapeId>(['arch', 'late_surge'])
const BUILD_SHAPES = new Set<DynamicShapeId>(['crescendo', 'build_then_drop'])

/** Longest run of consecutive bars that bring back earlier material. */
export function longestReturnRun(plan: CompositionPlan): number {
  const sources = themeSources(plan.form, plan.bars.length as BarCount)
  let longest = 0
  let run = 0
  for (const source of sources) {
    if (source !== undefined) {
      run += 1
      if (run > longest) longest = run
    } else {
      run = 0
    }
  }
  return longest
}

function returnCue(plan: CompositionPlan): number {
  const run = longestReturnRun(plan)
  // Repertoire returning runs are typically 3–4 bars (FIDELITY_FINDINGS).
  if (run >= 3) return 1
  if (run === 2) return 0.7
  if (run === 1) return 0.25
  return 0
}

function breathCue(plan: CompositionPlan): number {
  let score = 0
  if (BREATHING_OPENINGS.has(plan.opening ?? 'straight_in')) score += 0.6
  if (BREATHING_CHARACTERS.has(plan.character)) score += 0.25
  if (SINGING_TEXTURES.has(plan.texture)) score += 0.15
  if (plan.bars.some((bar) => bar.role === 'half_cadence' || bar.role === 'echo' || bar.role === 'dissolve')) score += 0.15
  return Math.min(1, score)
}

function arrangementCue(plan: CompositionPlan): number {
  return CHANGING_ARRANGEMENTS.has(plan.arrangement ?? 'constant') ? 1 : 0
}

function summitCue(plan: CompositionPlan): number {
  let score = 0
  if (SUMMIT_SHAPES.has(plan.dynamicShape)) score += 0.7
  else if (BUILD_SHAPES.has(plan.dynamicShape)) score += 0.45
  else if (plan.dynamicShape === 'waves') score += 0.25
  const lastClimax = plan.bars.reduce((last, bar, i) => (bar.role === 'climax' ? i : last), -1)
  const climaxCount = plan.bars.filter((bar) => bar.role === 'climax').length
  // One (or a few) late peaks, not climaxes everywhere.
  if (lastClimax >= plan.bars.length * 0.5 && climaxCount > 0 && climaxCount <= 3) score += 0.35
  return Math.min(1, score)
}

function etudePenalty(plan: CompositionPlan): number {
  const perpetual = PERPETUAL_CHARACTERS.has(plan.character) || PERPETUAL_TEXTURES.has(plan.texture)
  if (!perpetual) return 0
  const noReturns = longestReturnRun(plan) < 2
  const flat =
    (plan.arrangement ?? 'constant') === 'constant' && (plan.opening ?? 'straight_in') === 'straight_in'
  return 0.15 + (noReturns ? 0.45 : 0) + (flat ? 0.25 : 0)
}

/**
 * 0–2 raw, low/medium/high — same shape as a style-match Score, so Best can
 * add it to contrast without rescaling.
 */
export function heuristicSongQuality(plan: CompositionPlan): StyleMatchScore {
  const fit = Math.max(
    0,
    Math.min(
      1,
      0.28 * returnCue(plan) + 0.24 * breathCue(plan) + 0.24 * arrangementCue(plan) + 0.24 * summitCue(plan) - etudePenalty(plan),
    ),
  )
  const thresholds = [0.4, 0.68]
  const level = fit < thresholds[0] ? 0 : fit < thresholds[1] ? 1 : 2
  const margin = Math.min(...thresholds.map((t) => Math.abs(fit - t)))
  return {
    match: MATCH_LEVELS[level],
    confidence: Math.min(1, margin / 0.2),
    raw: fit * 2,
  }
}
