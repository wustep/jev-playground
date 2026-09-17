// Live planner: every field of the CompositionPlan is a Jev Choice answer.
//
//   request 1      globals + bar count + speculative bar roles   (one fan-out)
//   requests 2..N  one per bar: chord + contour, with the progression so far
//                  in state, because chords must see each other
//   score()        one request, one Score question per style
//
// Jev returns a full probability distribution for every Choice; `pick.ts`
// decides (argmax or seeded sampling) — code owns the policy, Jev the judgment.

import {
  BAR_COUNTS,
  BAR_ROLES,
  CHORDS,
  CONTOURS,
  GLOBAL_FIELDS,
  GLOBAL_FIELD_IDS,
  MATCH_LEVELS,
  parseOption,
  type BarPlan,
  type BarRoleId,
  type ChordId,
  type CompositionPlan,
  type GlobalField,
  type OptionTable,
  type PlanGlobals,
  type StyleId,
  type StyleMatchScore,
} from '../plan/schema'
import type { Decision, Exchange, PlanInput, PlanOptions, PlanResult, Planner, ScoreResult } from './Planner'
import { pickFrom, rng } from './pick'
import { buildRequest, roleQuestionId, scoreQuestionId, type JevOp } from './jev/requests'
import { callSystemOne, DEFAULT_MODEL, type Answer, type ChoiceAnswer, type SystemOneResponse } from './jev/systemOne'

/** Sends one op to Jev, however it gets there. */
export type JevTransport = (op: JevOp, signal?: AbortSignal) => Promise<SystemOneResponse>

/** Browser → TypeSafe directly. The key ships in the bundle: local use only. */
export function directTransport(apiKey: string, baseUrl?: string, model = DEFAULT_MODEL): JevTransport {
  return (op, signal) => callSystemOne(buildRequest(op, model), { apiKey, baseUrl, signal })
}

/** Browser → /api/jev → TypeSafe. The key stays on the server. */
export function proxyTransport(url = '/api/jev'): JevTransport {
  return async (op, signal) => {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(op),
      signal,
    })
    const body = (await response.json().catch(() => null)) as (SystemOneResponse & { error?: string }) | null
    if (!response.ok || !body || body.error) {
      throw new Error(body?.error ?? `Jev proxy responded ${response.status}`)
    }
    return body
  }
}

function choiceAnswer(answers: Record<string, Answer>, id: string): ChoiceAnswer {
  const answer = answers[id]
  if (!answer || answer.type !== 'choice') throw new Error(`Jev response is missing choice answer "${id}"`)
  return answer
}

export class JevPlanner implements Planner {
  readonly id = 'jev' as const
  readonly label = 'Jev (live)'

  /**
   * @param model only used to show the request body in the debug panel; the
   *   proxy fills in its own TYPESAFE_MODEL server-side.
   */
  constructor(
    private readonly transport: JevTransport,
    private readonly model: string = DEFAULT_MODEL,
  ) {}

  /** Send one op and keep the full round-trip for the debug panel. */
  private async exchange(label: string, op: JevOp, signal?: AbortSignal): Promise<Required<Exchange>> {
    const started = performance.now()
    const response = await this.transport(op, signal)
    return { label, op, request: buildRequest(op, this.model), response, latencyMs: performance.now() - started, sent: true }
  }

  async plan(input: PlanInput, options?: PlanOptions): Promise<PlanResult> {
    const started = performance.now()
    const random = rng(input.seed)
    const decisions: Decision[] = []
    const exchanges: Exchange[] = []
    let inputTokens = 0
    let model: string | undefined

    const ask = async (label: string, op: JevOp) => {
      const exchange = await this.exchange(label, op, options?.signal)
      exchanges.push(exchange)
      inputTokens += exchange.response.usage?.input_tokens ?? 0
      model = exchange.response.model
      return exchange.response.answers
    }
    const decide = <K extends string>(
      answers: Record<string, Answer>,
      id: string,
      field: string,
      table: OptionTable<K>,
    ): K => {
      const answer = choiceAnswer(answers, id)
      const picked = parseOption(table, pickFrom(answer.probabilities, input.pick, random), `jev.${id}`)
      decisions.push({ field, choice: picked, confidence: answer.confidence, probabilities: answer.probabilities })
      options?.onProgress?.([...decisions])
      return picked
    }

    // 1 ─ globals, length and roles in a single fan-out
    const first = await ask('globals + roles', { op: 'globals', style: input.style, brief: input.brief })
    const globals = {} as Record<GlobalField, string>
    for (const field of GLOBAL_FIELD_IDS) {
      globals[field] = decide(first, field, field, GLOBAL_FIELDS[field] as OptionTable<string>)
    }
    const barCount = input.bars === 'auto' ? (Number(decide(first, 'barCount', 'barCount', BAR_COUNTS)) as 4 | 8) : input.bars
    const roles: BarRoleId[] = []
    for (let i = 0; i < barCount; i++) {
      roles.push(decide(first, roleQuestionId(barCount, i), `bars[${i}].role`, BAR_ROLES))
    }

    // 2 ─ chords, sequentially: each bar sees the ones before it
    const chords: ChordId[] = []
    const bars: BarPlan[] = []
    for (let index = 0; index < barCount; index++) {
      const answers = await ask(`bar ${index + 1} chord`, {
        op: 'bar',
        style: input.style,
        brief: input.brief,
        globals: globals as PlanGlobals,
        roles,
        chords: [...chords],
        index,
      })
      const chord = decide(answers, 'chord', `bars[${index}].chord`, CHORDS)
      const contour = decide(answers, 'contour', `bars[${index}].contour`, CONTOURS)
      chords.push(chord)
      bars.push({ chord, role: roles[index], contour })
    }

    const plan: CompositionPlan = { version: 1, style: input.style, ...(globals as PlanGlobals), bars }
    return {
      plan,
      trace: {
        planner: this.id,
        model,
        requests: exchanges.length,
        latencyMs: performance.now() - started,
        inputTokens,
        decisions,
        exchanges,
      },
    }
  }

  async score(plan: CompositionPlan, styles: readonly StyleId[], options?: Pick<PlanOptions, 'signal'>): Promise<ScoreResult> {
    const exchange = await this.exchange('style match', { op: 'score', plan, styles: [...styles] }, options?.signal)
    const response = exchange.response
    const result: Partial<Record<StyleId, StyleMatchScore>> = {}
    for (const style of styles) {
      const answer = response.answers[scoreQuestionId(style)]
      if (!answer || answer.type !== 'score') continue
      // `score` is a probability-weighted position on the 0..2 level scale;
      // round to the nearest level when code needs a single label.
      const level = Math.max(0, Math.min(MATCH_LEVELS.length - 1, Math.round(answer.score)))
      result[style] = { match: MATCH_LEVELS[level], confidence: answer.confidence, raw: answer.score }
    }
    return { scores: result, exchanges: [exchange] }
  }
}
