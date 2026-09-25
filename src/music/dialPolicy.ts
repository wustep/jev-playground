import type { BarCount } from '../plan/schema'
import type { PlannerId, ScoreResult } from '../planner'
import type { Generated } from './styleCache'

export type DialPlanAction =
  | { kind: 'await-inflight'; inflight: Promise<Generated> }
  | { kind: 'use-cache'; cached: Generated }
  | { kind: 'plan-heuristic' }

/** Landing, prewarm, and style-tab clicks never call Jev. */
export const DIAL_PLANNER: PlannerId = 'heuristic'

/**
 * Style-tab click: never talk to Jev.
 * A cache hit that matches `bars` wins whether it is a stub or a prior Generate.
 * A miss plans with the offline heuristic only.
 */
export function resolveDialPlan(args: {
  cached: Generated | undefined
  inflight: Promise<Generated> | undefined
  bars: BarCount
}): DialPlanAction {
  if (args.inflight) return { kind: 'await-inflight', inflight: args.inflight }
  if (args.cached && args.cached.input.bars === args.bars) return { kind: 'use-cache', cached: args.cached }
  return { kind: 'plan-heuristic' }
}

/** Generate may use Jev when the user chose it and a live planner is available. */
export function generatePlanner(choice: PlannerId, jevAvailable: boolean): PlannerId {
  return choice === 'jev' && jevAvailable ? 'jev' : 'heuristic'
}

/**
 * Score with Jev only when the displayed plan came from Jev.
 * `plannerChoice === 'jev'` while showing a stub must not trigger a live score.
 */
export function displayedPlanUsesJevScore(displayedPlanner: PlannerId): boolean {
  return displayedPlanner === 'jev'
}

/** Only Generate-driven Jev work may show “asking Jev…”. Dial misses say “planning…”. */
export function dialPendingTag(pendingAsksJev: boolean, progress: number): string {
  return pendingAsksJev ? `asking Jev… ${Math.round(progress * 100)}%` : 'planning…'
}

/** Dial switch: restart the new piece only if the previous style was already sounding. */
export function autoplayAfterStyleSwitch(wasPlaying: boolean): boolean {
  return wasPlaying
}

export type MatchScoreAction =
  | { kind: 'wait' }
  | { kind: 'reuse'; matches: ScoreResult }
  | { kind: 'score'; scorer: PlannerId }

/**
 * Style-match panel after a plan lands. Waits while planning or Best-of is
 * running, reuses scores that came with the plan (Best-of winner, cached or
 * not), and otherwise scores the displayed plan: Jev only for a Jev plan.
 */
export function resolveMatchScore(args: {
  generated: Generated | null
  edited: boolean
  busy: boolean
  jevCanScore: boolean
}): MatchScoreAction {
  const { generated } = args
  if (!generated || args.busy) return { kind: 'wait' }
  if (!args.edited && generated.matches) return { kind: 'reuse', matches: generated.matches }
  return { kind: 'score', scorer: displayedPlanUsesJevScore(generated.trace.planner) && args.jevCanScore ? 'jev' : 'heuristic' }
}
