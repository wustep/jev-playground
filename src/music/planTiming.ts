import { heuristicPlanner, type PlanInput, type PlanResult } from '../planner'
import type { Generated } from './styleCache'

/** Sub-10ms stamps are stub/cache noise — never let them beat a real Generate wait. */
const STUB_STAMP_MS = 10

/** Prefer a recorded planner latency; otherwise the wall clock around the call. */
export function stampWallClockLatency<T extends PlanResult>(result: T, started: number, ended = performance.now()): T {
  const latencyMs = Math.max(result.trace.latencyMs, ended - started)
  if (latencyMs === result.trace.latencyMs) return result
  return { ...result, trace: { ...result.trace, latencyMs } }
}

/**
 * User-visible Generate duration: wall clock from click/start to plan ready.
 * True network/planner latency may raise the value; a sub-10ms stub stamp cannot.
 */
export function generateStatusLatencyMs(wallClockMs: number, plannerLatencyMs = 0): number {
  const elapsed = Math.max(0, wallClockMs)
  if (plannerLatencyMs < STUB_STAMP_MS) return elapsed
  return Math.max(elapsed, plannerLatencyMs)
}

/** Persist this Generate’s own timing. Never copy a previous cache entry’s latency. */
export function stampGenerateLatency<T extends PlanResult>(result: T, started: number, ended = performance.now()): T {
  const latencyMs = generateStatusLatencyMs(ended - started, result.trace.latencyMs)
  if (latencyMs === result.trace.latencyMs) return result
  return { ...result, trace: { ...result.trace, latencyMs } }
}

/**
 * Enough digits that a real sub-10ms stub never collapses to `0.00`.
 * Jev-scale times stay at two decimals (`3.43`).
 */
export function formatPlanSeconds(latencyMs: number): string {
  const seconds = latencyMs / 1000
  if (!(seconds > 0)) return '0.00'
  if (seconds >= 0.01) return seconds.toFixed(2)
  if (seconds >= 0.001) return seconds.toFixed(3)
  return seconds.toFixed(4)
}

export function generatedPlanStatus(bars: number, latencyMs: number): string {
  return `Generated plan and ${bars} bars in ${formatPlanSeconds(latencyMs)}s`
}

/** Dial cache hit / prewarm land / stub ready — never fake Generate timing. */
export function readyPlanStatus(bars: number): string {
  return `Ready — ${bars} bars`
}

/** Session restore of a previously shown plan — never fake Generate timing. */
export function restoredPlanStatus(bars: number): string {
  return `Restored plan · ${bars} bars`
}

/** Offline stub sample with a measured wall-clock duration written into the trace. */
export async function planHeuristicSample(input: PlanInput): Promise<Generated> {
  const started = performance.now()
  const result = await heuristicPlanner.plan(input)
  return { ...stampWallClockLatency(result, started), input, notice: null }
}
