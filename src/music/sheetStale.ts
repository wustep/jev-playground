import type { PlanInput, PlannerId } from '../planner'
import type { Generated } from './styleCache'

/** Controls that decide whether the stand still shows the current piece. */
export type SheetControlInput = Pick<PlanInput, 'style' | 'bars' | 'pick' | 'brief' | 'seed'>

/**
 * Identity of the settled plan (not notes overlays). Used to clear a
 * user-dirtied Planner select once a new plan actually lands.
 */
export function displayedPlanIdentity(generated: Generated | null | undefined): string | null {
  if (!generated) return null
  const { input, trace } = generated
  return `${input.style}|${input.bars}|${input.pick}|${input.brief}|${input.seed}|${trace.planner}`
}

/** True when the shown plan was produced with these Generate inputs. */
export function planInputMatchesDisplayed(
  generated: { input: SheetControlInput } | null | undefined,
  input: SheetControlInput,
): boolean {
  if (!generated) return true
  const got = generated.input
  return (
    got.style === input.style &&
    got.bars === input.bars &&
    got.pick === input.pick &&
    got.brief === input.brief &&
    got.seed === input.seed
  )
}

export function displayedSheetIsStale(args: {
  /** Generate progress or Best-of scoring. */
  busy: boolean
  /** Dial / generate targeting a style — includes await-inflight, which is not `busy`. */
  pendingStyle: string | null
  /**
   * User changed Planner away from the planner that produced the shown plan.
   * Dial/boot stubs and detectJev auto-select must leave this false.
   */
  plannerDirty: boolean
  generated: Generated | null | undefined
  input: SheetControlInput
}): boolean {
  if (args.busy || args.pendingStyle !== null || args.plannerDirty) return true
  return !planInputMatchesDisplayed(args.generated, args.input)
}

/** Status when controls no longer match the stand and nothing is in flight. */
export function staleSettingsStatus(): string {
  return 'Settings changed — Generate to apply'
}

/** Planner select is dirty only when the effective planner disagrees with the stand. */
export function plannerSelectIsDirty(effectivePlanner: PlannerId, displayedPlanner: PlannerId | undefined): boolean {
  if (displayedPlanner == null) return false
  return effectivePlanner !== displayedPlanner
}
