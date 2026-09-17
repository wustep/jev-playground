// Offline stand-in for Jev. Same interface, same enum-only output, no network:
// it samples hand-written per-style priors (src/plan/styles.ts) instead of
// asking a model. It exists so the playground is demoable without an API key
// and so there is a baseline to compare Jev's choices against.

import {
  BAR_COUNT_IDS,
  BAR_ROLE_IDS,
  CHORD_IDS,
  CONTOUR_IDS,
  GLOBAL_FIELDS,
  GLOBAL_FIELD_IDS,
  type BarPlan,
  type BarRoleId,
  type ChordId,
  type CompositionPlan,
  type ContourId,
  type GlobalField,
  type MatchLevel,
  type PlanGlobals,
  type StyleId,
  type StyleMatchScore,
} from '../plan/schema'
import { STYLE_PROFILES, type StyleProfile, type Weights } from '../plan/styles'
import type { Decision, Exchange, PlanInput, PlanOptions, PlanResult, Planner, ScoreResult } from './Planner'
import { decision, normalize, pickFrom, rng } from './pick'
import { buildRequest, type JevOp } from './jev/requests'
import { DEFAULT_MODEL } from './jev/systemOne'

/** The request Jev would have received for this op — never actually sent. */
const unsent = (label: string, op: JevOp): Exchange => ({ label, op, request: buildRequest(op, DEFAULT_MODEL), sent: false })

/** Replay a finished plan as the sequence of ops JevPlanner would have issued. */
export function shadowExchanges(plan: CompositionPlan, brief: boolean): Exchange[] {
  const { version: _version, style, bars, ...globals } = plan
  const roles = bars.map((bar) => bar.role)
  return [
    unsent('globals + roles', { op: 'globals', style, brief }),
    ...bars.map((_, index) =>
      unsent(`bar ${index + 1} chord`, {
        op: 'bar',
        style,
        brief,
        globals,
        roles,
        chords: bars.slice(0, index).map((bar) => bar.chord),
        index,
      }),
    ),
  ]
}

/** Weight given to options a style's priors don't mention (priors sum to ~100). */
const FLOOR = 1

function withFloor<K extends string>(options: readonly K[], weights: Weights<K>): Record<K, number> {
  const filled = Object.fromEntries(options.map((k) => [k, weights[k] ?? FLOOR])) as Record<K, number>
  return normalize(filled)
}

const CONTOUR_BY_ROLE: Partial<Record<BarRoleId, Weights<ContourId>>> = {
  climax: { rise: 2.5, arch: 1.5, fall: 0.4, static: 0.3 },
  cadence: { fall: 3, static: 1.5, rise: 0.3 },
  half_cadence: { rise: 1.5, dip: 1.3, fall: 0.7 },
  contrast: { dip: 1.6, fall: 1.3 },
  development: { rise: 1.4, arch: 1.2, static: 0.5 },
}

export const isMinorKey = (key: string) => key.endsWith('_minor')

/** How often each option appears at `index` across a set of templates. */
function columnDistribution<K extends string>(templates: K[][], index: number, options: readonly K[]): Record<K, number> {
  const counts = Object.fromEntries(options.map((k) => [k, 0])) as Record<K, number>
  for (const template of templates) counts[template[index]] += 1
  return normalize(counts)
}

export class HeuristicPlanner implements Planner {
  readonly id = 'heuristic' as const
  readonly label = 'Heuristic stub (offline)'

  async plan(input: PlanInput, options?: PlanOptions): Promise<PlanResult> {
    const started = performance.now()
    const profile = STYLE_PROFILES[input.style]
    const random = rng(input.seed)
    const decisions: Decision[] = []
    const emit = (d: Decision) => {
      decisions.push(d)
      options?.onProgress?.([...decisions])
    }

    const globals = {} as Record<GlobalField, string>
    for (const field of GLOBAL_FIELD_IDS) {
      const ids = Object.keys(GLOBAL_FIELDS[field])
      const probabilities = withFloor(ids, profile.priors[field] as Weights<string>)
      globals[field] = pickFrom(probabilities, input.pick, random)
      emit(decision(field, globals[field], probabilities))
    }

    const countProbabilities = withFloor(BAR_COUNT_IDS, profile.priors.barCount)
    const barCount =
      input.bars === 'auto' ? (Number(pickFrom(countProbabilities, input.pick, random)) as 4 | 8 | 16 | 32) : input.bars
    emit(decision('barCount', String(barCount), countProbabilities, input.bars === 'auto' ? undefined : 1))

    // Harmony and form come from whole templates so the progression stays
    // coherent; per-bar distributions are reported for the trace only.
    const mode = isMinorKey(globals.key) ? 'minor' : 'major'
    const progressions = profile.progressions[mode][barCount]
    const forms = profile.forms[barCount]
    const progression = input.pick === 'argmax' ? progressions[0] : progressions[Math.floor(random() * progressions.length)]
    const form = input.pick === 'argmax' ? forms[0] : forms[Math.floor(random() * forms.length)]

    const bars: BarPlan[] = []
    for (let i = 0; i < barCount; i++) {
      const role = form[i]
      const chord = progression[i]
      const contourWeights = withFloor(CONTOUR_IDS, profile.priors.contour)
      const bias = CONTOUR_BY_ROLE[role] ?? {}
      for (const id of CONTOUR_IDS) contourWeights[id] *= bias[id] ?? 1
      const contourProbabilities = normalize(contourWeights)
      const contour = pickFrom(contourProbabilities, input.pick, random)
      bars.push({ chord, role, contour })
      emit(decision(`bars[${i}].role`, role, columnDistribution(forms, i, BAR_ROLE_IDS)))
      emit(decision(`bars[${i}].chord`, chord, columnDistribution(progressions, i, CHORD_IDS)))
      emit(decision(`bars[${i}].contour`, contour, contourProbabilities))
    }

    const plan: CompositionPlan = { version: 1, style: input.style, ...(globals as PlanGlobals), bars }
    return {
      plan,
      trace: {
        planner: this.id,
        requests: 0,
        latencyMs: performance.now() - started,
        decisions,
        exchanges: shadowExchanges(plan, input.brief),
      },
    }
  }

  /**
   * Stub style-match: how typical is each of the plan's choices under a style's
   * priors, plus how much of its chord vocabulary the style's templates share.
   * It can only ever agree with the priors it was built from — useful as a
   * sanity baseline next to Jev's judgment, not as ground truth.
   */
  async score(plan: CompositionPlan, styles: readonly StyleId[]): Promise<ScoreResult> {
    const scores: Partial<Record<StyleId, StyleMatchScore>> = {}
    for (const style of styles) scores[style] = heuristicMatch(plan, STYLE_PROFILES[style])
    return { scores, exchanges: [unsent('style match', { op: 'score', plan, styles: [...styles] })] }
  }
}

const FIELD_WEIGHT: Record<GlobalField, number> = {
  texture: 3,
  palette: 1.5,
  defaultInstrument: 1,
  tempo: 1,
  dynamics: 1,
  dynamicShape: 1,
  key: 0.75,
  meter: 0.5,
}

function heuristicMatch(plan: CompositionPlan, profile: StyleProfile): StyleMatchScore {
  let weighted = 0
  let totalWeight = 0
  for (const field of GLOBAL_FIELD_IDS) {
    const prior = profile.priors[field] as Weights<string>
    const peak = Math.max(...Object.values(prior).map((w) => w ?? 0))
    weighted += FIELD_WEIGHT[field] * Math.min(1, (prior[plan[field]] ?? 0) / peak)
    totalWeight += FIELD_WEIGHT[field]
  }
  const vocabulary = new Set<ChordId>(
    [profile.progressions.major, profile.progressions.minor].flatMap((byLength) => [...byLength[4], ...byLength[8], ...byLength[16], ...byLength[32], ...byLength[16], ...byLength[32]].flat()),
  )
  const chordFit = plan.bars.filter((bar) => vocabulary.has(bar.chord)).length / plan.bars.length
  const fit = 0.7 * (weighted / totalWeight) + 0.3 * chordFit

  const thresholds = [0.4, 0.68]
  const level = fit < thresholds[0] ? 0 : fit < thresholds[1] ? 1 : 2
  const margin = Math.min(...thresholds.map((t) => Math.abs(fit - t)))
  return {
    match: (['low', 'medium', 'high'] as const satisfies readonly MatchLevel[])[level],
    confidence: Math.min(1, margin / 0.2),
    raw: fit * 2,
  }
}
