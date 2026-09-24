// Live planner: every field of the CompositionPlan is a Jev Choice answer.
//
//   request 1      the piece: register, motion, accompaniment, form, key,
//                  meter, palette, tempo, dynamics, shape       (one fan-out)
//   requests 2..   one per 4-bar form slot: a HarmonyBook phrase + four contours
//   score()        one request: one Score per style + song_quality (0–3)
//
// Bar roles are not asked: they are the chosen form, expanded by code
// (src/plan/phrase.ts). Nor is a `character`: it used to be request 1, and a
// sweep of all twelve of its values found one melody outcome per style.
//
// Jev is asked for labels only. It is never asked for notes — the two
// experimental paths that did (`notes=guide`, `notes=line`) are gone, with
// the user-facing modes they served.
//
// Jev returns a full probability distribution for every Choice; `pick.ts`
// decides (argmax or seeded sampling) — code owns the policy, Jev the judgment.

import {
  CONTOURS,
  CONTOUR_IDS,
  GLOBAL_FIELDS,
  GLOBAL_FIELD_IDS,
  MATCH_LEVELS,
  parseGlobals,
  parseOption,
  type BarCount,
  type BarPlan,
  type ChordId,
  type ContourId,
  type CompositionPlan,
  type GlobalField,
  type OptionTable,
  type StyleId,
  type StyleMatchScore,
} from '../plan/schema'
import { BARS_PER_PHRASE, barPositions, formSlots } from '../plan/phrase'
import { bookFor, expandPhrase, finishPhraseHarmony, phraseCriteria, slotCatalog, slotContourQuestionId, withPhraseNovelty } from '../plan/harmonyPhrases'
import type { Decision, Exchange, PlanInput, PlanOptions, PlanResult, Planner, ScoreResult } from './Planner'
import { normalize, pickFrom, rng } from './pick'
import { buildRequest, scoreQuestionId, SONG_SCORE_QUESTION_ID, type JevOp } from './jev/requests'
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
      /** Code-side policy applied to Jev's distribution before the draw (sampling only). */
      adjust?: (probabilities: Record<K, number>) => Record<K, number>,
      policy: PlanInput['pick'] = input.pick,
    ): K => {
      const answer = choiceAnswer(answers, id)
      const given = answer.probabilities as Record<K, number>
      const used = adjust && policy === 'sample' ? adjust(given) : given
      const picked = parseOption(table, pickFrom(used, policy, random), `jev.${id}`)
      // The trace always shows what Jev said, not what policy made of it.
      decisions.push({ field, choice: picked, confidence: answer.confidence, probabilities: answer.probabilities })
      options?.onProgress?.([...decisions])
      return picked
    }

    // 1 ─ the piece, in one fan-out. Register, motion and accompaniment are
    //     asked alongside the rest and lead the question set: they decide
    //     what the listener actually hears. The old first request asked for a
    //     `character` instead, and a sweep of all twelve of its values found
    //     one melody outcome per style — so it is not asked any more.
    const answers = await ask('globals', { op: 'globals', style: input.style, brief: input.brief })
    const picked = {} as Record<GlobalField, string>
    for (const field of GLOBAL_FIELD_IDS) {
      picked[field] = decide(answers, field, field, GLOBAL_FIELDS[field] as OptionTable<string>)
    }
    // Each answer was checked against its table as it was drawn; this hands
    // them back typed, so nothing below needs a cast.
    const globals = parseGlobals(picked, 'jev')
    const barCount: BarCount = input.bars
    // Roles are the form, expanded by code: coherent by construction, and no
    // longer a plan field a hand edit could set against the form it came from.
    const positions = barPositions(globals.form, barCount)

    // 2 ─ one HarmonyBook phrase per 4-bar slot. Cadence splits are applied in
    // code from the book's `splits` list (no extra approach Choice).
    const slots = formSlots(globals.form, barCount)
    const pickedChords: ChordId[] = []
    const contours: ContourId[] = []
    for (let slotIndex = 0; slotIndex < slots.length; slotIndex++) {
      const slotAnswers = await ask(`phrase ${slotIndex + 1}`, {
        op: 'phrase',
        style: input.style,
        brief: input.brief,
        globals,
        barCount,
        slotIndex,
        chords: [...pickedChords],
        contours: [...contours],
      })
      // The same catalog the server built this question's criteria from.
      const { options } = slotCatalog(input.style, globals, barCount, slotIndex)
      const isLast = slotIndex === slots.length - 1
      const phraseId = decide(
        slotAnswers,
        'phrase',
        `slots[${slotIndex}].phrase`,
        phraseCriteria(options),
        isLast ? undefined : (given) => withPhraseNovelty(given, pickedChords, options),
        isLast ? 'argmax' : input.pick,
      )
      pickedChords.push(...expandPhrase(phraseId, options))
      for (let k = 0; k < BARS_PER_PHRASE; k++) {
        const bar = slotIndex * BARS_PER_PHRASE + k
        const source = positions[bar]?.returnsFrom
        if (source === undefined || contours[source] === undefined) {
          contours.push(decide(slotAnswers, slotContourQuestionId(k), `bars[${bar}].contour`, CONTOURS))
          continue
        }
        // A returning bar IS the earlier bar's tune: its shape is the form's decision, not a fresh one.
        const contour = contours[source]
        contours.push(contour)
        decisions.push({ field: `bars[${bar}].contour`, choice: contour, confidence: 1, probabilities: normalize(Object.fromEntries(CONTOUR_IDS.map((id) => [id, id === contour ? 1 : 0]))) })
      }
    }
    const harmony = finishPhraseHarmony(pickedChords, slots, bookFor(input.style, globals.key))
    const bars: BarPlan[] = Array.from({ length: barCount }, (_, i) => {
      const chord = harmony.chords[i]
      const chord2 = harmony.seconds[i]
      const contour = contours[i]
      decisions.push({ field: `bars[${i}].chord`, choice: chord, confidence: 1, probabilities: normalize({ [chord]: 1 }) })
      if (chord2) {
        decisions.push({ field: `bars[${i}].chord2`, choice: chord2, confidence: 1, probabilities: normalize({ [chord2]: 1 }) })
      }
      return chord2 ? { chord, chord2, contour } : { chord, contour }
    })

    const plan: CompositionPlan = { version: 2, style: input.style, ...globals, bars }
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
    const fromScore = (answer: { score: number; confidence: number } | undefined): StyleMatchScore | undefined => {
      if (!answer) return undefined
      // `score` is a probability-weighted position on the 0..2 level scale;
      // round to the nearest level when code needs a single label.
      const level = Math.max(0, Math.min(MATCH_LEVELS.length - 1, Math.round(answer.score)))
      return { match: MATCH_LEVELS[level], confidence: answer.confidence, raw: answer.score }
    }
    for (const style of styles) {
      const answer = response.answers[scoreQuestionId(style)]
      if (!answer || answer.type !== 'score') continue
      result[style] = fromScore(answer)
    }
    const songAnswer = response.answers[SONG_SCORE_QUESTION_ID]
    const songQuality =
      songAnswer?.type === 'score' ? { raw: songAnswer.score, confidence: songAnswer.confidence } : undefined
    return { scores: result, songQuality, exchanges: [exchange] }
  }

}
