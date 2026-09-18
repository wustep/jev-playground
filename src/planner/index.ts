import { HeuristicPlanner } from './HeuristicPlanner'
import { directTransport, JevPlanner, proxyTransport } from './JevPlanner'
import type { Planner } from './Planner'

export type { Decision, Exchange, PlanInput, PlanResult, PlanTrace, Planner, PlannerId, ScoreResult } from './Planner'
export { BEST_OF_N, contrastiveScore, pickBestIndex, selectBestOfN } from './bestOf'
export { JevPlanner } from './JevPlanner'

export const heuristicPlanner: Planner = new HeuristicPlanner()

export interface JevAvailability {
  planner: Planner | null
  /** Human-readable: where the key lives, or why Jev is off. */
  detail: string
}

/**
 * Work out how (and whether) this build can reach Jev. Never throws: with no
 * key anywhere the playground simply runs on the heuristic stub.
 *
 *  1. `VITE_JEV_API_KEY` set   → call TypeSafe straight from the browser
 *  2. `/api/jev` says it has a key → go through the server-side proxy
 *  3. otherwise                → Jev unavailable
 */
export async function detectJev(): Promise<JevAvailability> {
  const env = import.meta.env
  if (env.VITE_JEV_API_KEY) {
    return {
      planner: new JevPlanner(directTransport(env.VITE_JEV_API_KEY, env.VITE_JEV_BASE_URL, env.VITE_JEV_MODEL), env.VITE_JEV_MODEL),
      detail: 'direct from browser (VITE_JEV_API_KEY — local use only)',
    }
  }
  try {
    const response = await fetch('/api/jev')
    const status = (await response.json()) as { available?: boolean; model?: string }
    if (response.ok && status.available) {
      return { planner: new JevPlanner(proxyTransport('/api/jev'), status.model), detail: `via /api/jev proxy · ${status.model ?? 'jev-latest'}` }
    }
    return { planner: null, detail: 'no TYPESAFE_API_KEY on the server — using the offline stub' }
  } catch {
    return { planner: null, detail: 'no /api/jev endpoint here — using the offline stub' }
  }
}
