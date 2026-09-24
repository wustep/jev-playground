// Best-of-N critic: sample cheap heuristic plans, score each, keep the one
// that looks most like the target style (and least like the others) *and*
// most like a song rather than an étude.
//
// Jev plan × N is too expensive (5 POSTs each at 16 bars, 17 at 64). Heuristic plan is free;
// Jev `score` is one request per candidate (style `match_*` + `song_quality`
// on the same POST). Five score POSTs stay well under the 90/min budget.
//
// Dual critic: docs/fable-context/JEV_REQUEST_STRUCTURE_REVIEW.md Appendix B.

import { STYLE_IDS, type CompositionPlan, type StyleId, type StyleMatchScore } from '../plan/schema'
import type { PlanInput, PlanResult, Planner, ScoreResult } from './Planner'

/** Five score POSTs stay well under the 90/min /api/jev budget. */
export const BEST_OF_N = 5

/**
 * dualObjective = styleContrast + SONG_QUALITY_WEIGHT * (song_quality.raw - SONG_QUALITY_MID)
 *
 * Style contrast is `target.raw − max(other.raw)` on the 0–2 `match_*` scale
 * (typical range ≈ −2…+2). `song_quality.raw` is 0–3; centering at 1.5 means
 * an étude (0) hurts and a dressed song (3) helps by the same 0.675.
 *
 * Worked examples (Appendix B.4):
 *   on-style étude     0.90 + 0.45×(0 − 1.5) = 0.225
 *   milder song        0.40 + 0.45×(3 − 1.5) = 1.075  ← Best
 *   wrong-style song  −1.00 + 0.45×(3 − 1.5) = −0.325 ← loses to the étude
 *
 * Song overturns a mild style edge and breaks ties. It cannot elect a wrong
 * style. Missing / NaN song_quality fails open (style contrast only).
 */
export const SONG_QUALITY_WEIGHT = 0.45
export const SONG_QUALITY_MID = 1.5

/**
 * Numeric style-match used by the critic.
 * Closest available API: `StyleMatchScore.raw` — probability-weighted
 * position on the low→high scale (0–2) from both planners.
 */
export function styleMatchValue(score: StyleMatchScore | undefined): number | null {
  if (!score || typeof score.raw !== 'number' || Number.isNaN(score.raw)) return null
  return score.raw
}

/**
 * `score(targetStyle) - max(score(otherStyles))`.
 * Higher means more like the requested style and less like the rest.
 * `null` when the target has no usable score.
 */
export function contrastiveScore(scores: Partial<Record<StyleId, StyleMatchScore>>, target: StyleId): number | null {
  const targetValue = styleMatchValue(scores[target])
  if (targetValue === null) return null
  let otherMax: number | null = null
  for (const id of STYLE_IDS) {
    if (id === target) continue
    const value = styleMatchValue(scores[id])
    if (value === null) continue
    if (otherMax === null || value > otherMax) otherMax = value
  }
  return targetValue - (otherMax ?? 0)
}

/**
 * Appendix B.4: style contrast plus a centered song_quality term.
 * Missing song_quality → style contrast only.
 */
export function dualObjective(styleContrast: number | null, songRaw: number | null): number | null {
  if (styleContrast === null || !Number.isFinite(styleContrast)) return null
  if (songRaw == null || !Number.isFinite(songRaw)) return styleContrast
  return styleContrast + SONG_QUALITY_WEIGHT * (songRaw - SONG_QUALITY_MID)
}

/** First index of the highest finite total. `-1` if none are usable. */
export function pickBestIndex(contrasts: readonly (number | null)[]): number {
  let best = -1
  let bestValue = -Infinity
  for (let i = 0; i < contrasts.length; i++) {
    const value = contrasts[i]
    if (value === null || !Number.isFinite(value)) continue
    if (value > bestValue) {
      bestValue = value
      best = i
    }
  }
  return best
}

export interface BestOfCandidate {
  seed: number
  input: PlanInput
  result: PlanResult
  scores: ScoreResult
  contrast: number | null
  /** `song_quality.raw` (0–3), or null when the scorer omitted it. */
  song: number | null
  /** `dualObjective` — what Best actually maximises. */
  total: number | null
}

export interface BestOfResult {
  winner: BestOfCandidate
  /** 0-based index of the kept candidate. */
  index: number
  n: number
  scoredWith: 'jev' | 'heuristic'
}

export interface SelectBestOfOptions {
  input: Omit<PlanInput, 'seed'>
  n?: number
  seeds?: readonly number[]
  planner?: Planner
  /** Preferred scorer (live Jev when available). Falls back per candidate. */
  scorer?: Planner
  fallback?: Planner
  signal?: AbortSignal
  onProgress?: (scored: number, n: number) => void
}

function uniqueSeeds(n: number, given?: readonly number[]): number[] {
  if (given && given.length >= n) return given.slice(0, n)
  const seeds = new Set(given ?? [])
  while (seeds.size < n) seeds.add(Math.floor(Math.random() * 99_999) + 1)
  return [...seeds]
}

async function scoreOne(
  plan: CompositionPlan,
  preferred: Planner | undefined,
  fallback: Planner,
  signal?: AbortSignal,
): Promise<{ scores: ScoreResult; used: 'jev' | 'heuristic' }> {
  const tryScore = async (planner: Planner) => {
    if (!planner.score) throw new Error('planner has no score()')
    return planner.score(plan, STYLE_IDS, { signal })
  }
  if (preferred?.score && preferred !== fallback) {
    try {
      return { scores: await tryScore(preferred), used: preferred.id === 'jev' ? 'jev' : 'heuristic' }
    } catch {
      if (signal?.aborted) throw new DOMException('aborted', 'AbortError')
    }
  }
  return { scores: await tryScore(fallback), used: 'heuristic' }
}

/**
 * Sample N heuristic plans (distinct seeds), score each, keep the max
 * `dualObjective`. Never calls `plan()` on the Jev planner — only `score()`,
 * when provided.
 */
export async function selectBestOfN(options: SelectBestOfOptions): Promise<BestOfResult> {
  const n = options.n ?? BEST_OF_N
  const planner = options.planner
  const fallback = options.fallback
  if (!planner?.plan) throw new Error('selectBestOfN: planner.plan is required')
  if (!fallback?.score) throw new Error('selectBestOfN: fallback.score is required')

  const seeds = uniqueSeeds(n, options.seeds)
  const candidates: BestOfCandidate[] = []
  let jevScores = 0

  for (let i = 0; i < n; i++) {
    if (options.signal?.aborted) throw new DOMException('aborted', 'AbortError')
    const input: PlanInput = { ...options.input, seed: seeds[i], pick: 'sample' }
    const result = await planner.plan(input, { signal: options.signal })
    const { scores, used } = await scoreOne(result.plan, options.scorer, fallback, options.signal)
    if (used === 'jev') jevScores += 1
    const contrast = contrastiveScore(scores.scores, input.style)
    const song = scores.songQuality && Number.isFinite(scores.songQuality.raw) ? scores.songQuality.raw : null
    candidates.push({
      seed: input.seed,
      input,
      result,
      scores,
      contrast,
      song,
      total: dualObjective(contrast, song),
    })
    options.onProgress?.(i + 1, n)
  }

  const index = pickBestIndex(candidates.map((candidate) => candidate.total))
  const winner = candidates[index === -1 ? 0 : index]
  return {
    winner,
    index: index === -1 ? 0 : index,
    n,
    scoredWith: jevScores === n ? 'jev' : 'heuristic',
  }
}
