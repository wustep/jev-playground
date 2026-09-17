import type { CompositionPlan, StyleId, StyleMatchScore } from '../plan/schema'
import type { JevOp } from './jev/requests'
import type { SystemOneRequest, SystemOneResponse } from './jev/systemOne'

export interface PlanInput {
  style: StyleId
  /** Force a length, or let the planner decide. */
  bars: 4 | 8 | 'auto'
  /**
   * How code turns a distribution into a decision:
   *  • `argmax` — always the most probable option (deterministic per style)
   *  • `sample` — draw from the distribution with the seeded RNG, so every
   *    seed gives a different-but-plausible plan
   */
  pick: 'argmax' | 'sample'
  seed: number
  /** Jev only: include the prose style brief in state, or just the name. */
  brief: boolean
}

/** One enum decision and the distribution it was taken from. */
export interface Decision {
  /** e.g. `texture`, `bars[3].chord` */
  field: string
  choice: string
  /** 0–1. Jev: reported confidence. Heuristic: normalised margin of the prior. */
  confidence: number
  probabilities: Record<string, number>
}

/**
 * One System One round-trip, kept for the engineer debug panel.
 * JevPlanner records what it really sent and got back. HeuristicPlanner
 * records the payloads Jev WOULD have been sent for the same plan (`sent:
 * false`), built by the same pure request builders — so the debug view looks
 * identical on both paths.
 */
export interface Exchange {
  label: string
  /** The small typed op the browser hands to /api/jev. */
  op: JevOp
  /** The full request body for POST /v1/systemone. */
  request: SystemOneRequest
  response?: SystemOneResponse
  latencyMs?: number
  sent: boolean
}

export interface PlanTrace {
  planner: PlannerId
  /** Versioned model id reported by the API, when there is one. */
  model?: string
  requests: number
  latencyMs: number
  inputTokens?: number
  decisions: Decision[]
  exchanges: Exchange[]
}

export interface ScoreResult {
  scores: Partial<Record<StyleId, StyleMatchScore>>
  exchanges: Exchange[]
}

export interface PlanResult {
  plan: CompositionPlan
  trace: PlanTrace
}

export interface PlanOptions {
  signal?: AbortSignal
  /** Called as decisions land, so the UI can fill the plan in bar by bar. */
  onProgress?: (decisions: Decision[]) => void
}

export type PlannerId = 'heuristic' | 'jev'

/**
 * The seam between "what should this sound like" and "which notes".
 * A planner only ever emits enum labels; src/render turns them into notes.
 */
export interface Planner {
  readonly id: PlannerId
  readonly label: string
  plan(input: PlanInput, options?: PlanOptions): Promise<PlanResult>
  /** Optional: how well does this plan match each style? */
  score?(
    plan: CompositionPlan,
    styles: readonly StyleId[],
    options?: Pick<PlanOptions, 'signal'>,
  ): Promise<ScoreResult>
}
