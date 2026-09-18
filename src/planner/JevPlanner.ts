// Live planner: every field of the CompositionPlan is a Jev Choice answer.
//
//   request 1      the CHARACTER of the piece: most typical (Choice) + which ones
//                  this composer writes at all (one Noul each); code combines them
//   request 2      form + globals, given that character            (fan-out)
//   requests 3..   one per 4-bar form slot: a HarmonyBook phrase + four contours
//   score()        one request: one Score per style + song_quality (0–3)
//
// Bar roles are not asked: they are the chosen form, expanded by code
// (src/plan/forms.ts).
//
// Jev returns a full probability distribution for every Choice; `pick.ts`
// decides (argmax or seeded sampling) — code owns the policy, Jev the judgment.

import {
  BAR_ROLE_IDS,
  CHARACTERS,
  CHARACTER_IDS,
  CONTOURS,
  CONTOUR_IDS,
  GLOBAL_FIELDS,
  GLOBAL_FIELD_IDS,
  MATCH_LEVELS,
  parseOption,
  type BarCount,
  type BarPlan,
  type CharacterId,
  type ChordId,
  type ContourId,
  type FormId,
  type CompositionPlan,
  type GlobalField,
  type KeyId,
  type OptionTable,
  type PlanGlobals,
  type StyleId,
  type StyleMatchScore,
} from '../plan/schema'
import { MELODY_DEGREES, PHRASE_NOTE_COUNT, parseJevNoteChoices, pitchQuestionId, rhythmsFor } from '../plan/notes'
import { realizeJevNoteChoices, type NotePhrase } from '../render/jevNotes'
import { formRoles, formSlots, themeSources } from '../plan/forms'
import { bookFor, expandPhrase, finishPhraseHarmony, phraseOptions, slotContourQuestionId, withPhraseNovelty } from '../plan/harmonyPhrases'
import type { Decision, Exchange, PlanInput, PlanOptions, PlanResult, Planner, ScoreResult } from './Planner'
import { marginConfidence, normalize, pickFrom, rng } from './pick'
import { buildRequest, characterQuestionId, scoreQuestionId, SONG_SCORE_QUESTION_ID, type JevOp } from './jev/requests'
import { callSystemOne, DEFAULT_MODEL, type Answer, type ChoiceAnswer, type SystemOneResponse } from './jev/systemOne'

/** noul ** this: 0.95 → 0.81, 0.75 → 0.32, 0.5 → 0.06, 0.2 → 0.002. */
const PLAUSIBILITY_SHARPNESS = 4
/** Added to the Choice probability, so that characters Jev did not name "most typical" still get drawn. */
const TYPICALITY_FLOOR = 0.5

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

    // 1 ─ what kind of piece. Jev says which character is most typical (a Choice) and, separately,
    // which characters this composer writes at all (a Noul each). Policy, in code: a character's
    // weight is its plausibility, sharpened, times its typicality plus a constant — so the signature
    // character leads without monopolising, and a foreign one (noul ≈ 0.2) all but never comes up.
    const concept = await ask('character', { op: 'concept', style: input.style, brief: input.brief })
    const typical = choiceAnswer(concept, 'character').probabilities
    const plausibility = normalize(
      Object.fromEntries(
        CHARACTER_IDS.map((id) => {
          const answer = concept[characterQuestionId(id)]
          if (!answer || answer.type !== 'noul') throw new Error(`Jev response is missing noul answer "${characterQuestionId(id)}"`)
          return [id, answer.noul ** PLAUSIBILITY_SHARPNESS * ((typical[id] ?? 0) + TYPICALITY_FLOOR)]
        }),
      ) as Record<CharacterId, number>,
    )
    const character = parseOption(CHARACTERS, pickFrom(plausibility, input.pick, random), 'jev.character')
    decisions.push({ field: 'character', choice: character, confidence: marginConfidence(plausibility), probabilities: plausibility })
    options?.onProgress?.([...decisions])

    // 2 ─ form and globals in a single fan-out, all conditioned on that character
    const second = await ask('globals + form', { op: 'globals', style: input.style, brief: input.brief, character })
    const globals = { character } as Record<GlobalField, string>
    for (const field of GLOBAL_FIELD_IDS) {
      if (field === 'character') continue
      globals[field] = decide(second, field, field, GLOBAL_FIELDS[field] as OptionTable<string>)
    }
    const barCount: BarCount = input.bars
    // Roles are the form, expanded by code: coherent by construction.
    const roles = formRoles(globals.form as FormId, barCount)
    roles.forEach((role, i) => {
      decisions.push({ field: `bars[${i}].role`, choice: role, confidence: 1, probabilities: normalize(Object.fromEntries(BAR_ROLE_IDS.map((id) => [id, id === role ? 1 : 0]))) })
    })

    // 3 ─ one HarmonyBook phrase per 4-bar slot. Cadence splits are applied in
    // code from the book's `splits` list (no extra approach Choice).
    const slots = formSlots(globals.form as FormId, barCount)
    const returns = themeSources(globals.form as FormId, barCount)
    const book = bookFor(input.style, globals.key as KeyId)
    const pickedChords: ChordId[] = []
    const contours: ContourId[] = []
    for (let slotIndex = 0; slotIndex < slots.length; slotIndex++) {
      const slot = slots[slotIndex]
      const answers = await ask(`phrase ${slotIndex + 1}`, {
        op: 'phrase',
        style: input.style,
        brief: input.brief,
        globals: globals as PlanGlobals,
        barCount,
        slotIndex,
        chords: [...pickedChords],
        contours: [...contours],
      })
      const catalog = phraseOptions(book, slot)
      const table = Object.fromEntries(catalog.map((entry) => [entry.id, entry.label]))
      const isLast = slotIndex === slots.length - 1
      const phraseId = decide(
        answers,
        'phrase',
        `slots[${slotIndex}].phrase`,
        table,
        isLast ? undefined : (given) => withPhraseNovelty(given, pickedChords, catalog),
        isLast ? 'argmax' : input.pick,
      )
      pickedChords.push(...expandPhrase(phraseId, book, slot))
      for (let k = 0; k < 4; k++) {
        const bar = slotIndex * 4 + k
        const source = returns[bar]
        if (source === undefined) {
          contours.push(decide(answers, slotContourQuestionId(k), `bars[${bar}].contour`, CONTOURS))
          continue
        }
        // A returning bar IS the earlier bar's tune: its shape is the form's decision, not a fresh one.
        const contour = contours[source]
        contours.push(contour)
        decisions.push({ field: `bars[${bar}].contour`, choice: contour, confidence: 1, probabilities: normalize(Object.fromEntries(CONTOUR_IDS.map((id) => [id, id === contour ? 1 : 0]))) })
      }
    }
    const harmony = finishPhraseHarmony(pickedChords, slots, book)
    const bars: BarPlan[] = roles.map((role, i) => {
      const chord = harmony.chords[i]
      const chord2 = harmony.seconds[i]
      const contour = contours[i]
      decisions.push({ field: `bars[${i}].chord`, choice: chord, confidence: 1, probabilities: normalize({ [chord]: 1 }) })
      if (chord2) {
        decisions.push({ field: `bars[${i}].chord2`, choice: chord2, confidence: 1, probabilities: normalize({ [chord2]: 1 }) })
      }
      return chord2 ? { chord, chord2, role, contour } : { chord, role, contour }
    })

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

  /**
   * Debug experiment: repeated closed-schema picks after the plan. Jev writes
   * a 4-slot RH phrase for every plan bar that is new material; theme-return
   * bars reuse the source rhythm and degrees, re-spelled on the later chord.
   * Code validates the closed schema; the caller falls back to renderPlan on
   * failure. Bass / left hand stay with renderPlan.
   */
  async writeNotes(
    plan: CompositionPlan,
    input: Pick<PlanInput, 'pick' | 'seed' | 'brief'>,
    options?: Pick<PlanOptions, 'signal'>,
  ): Promise<{ phrases: NotePhrase[]; exchanges: Required<Exchange>[] }> {
    if (plan.bars.length === 0) throw new Error('Jev notes: plan has no bars')
    const returns = themeSources(plan.form, plan.bars.length as BarCount)
    const phrases: NotePhrase[] = []
    const exchanges: Required<Exchange>[] = []
    const random = rng(input.seed ^ 0x4e07e5)
    const rhythmTable = rhythmsFor(plan.meter)

    const pickChoices = (answers: Record<string, Answer>) => {
      const rhythm = parseOption(rhythmTable, pickFrom(choiceAnswer(answers, 'rhythm').probabilities, input.pick, random), 'jev.rhythm')
      const degrees = Array.from({ length: PHRASE_NOTE_COUNT }, (_, i) =>
        parseOption(MELODY_DEGREES, pickFrom(choiceAnswer(answers, pitchQuestionId(i)).probabilities, input.pick, random), `jev.${pitchQuestionId(i)}`),
      )
      return parseJevNoteChoices({ rhythm, degrees }, plan.meter)
    }

    for (let i = 0; i < plan.bars.length; i++) {
      const source = returns[i]
      const from = source !== undefined ? phrases[source] : undefined
      if (from) {
        phrases.push(realizeJevNoteChoices({ rhythm: from.rhythm, degrees: from.degrees }, plan, { barIndex: i }))
        continue
      }
      const bar = plan.bars[i]
      const op: JevOp = {
        op: 'notes',
        style: plan.style,
        brief: input.brief,
        character: plan.character,
        key: plan.key,
        meter: plan.meter,
        tempo: plan.tempo,
        texture: plan.texture,
        palette: plan.palette,
        bar,
        barIndex: i,
      }
      const exchange = await this.exchange(`melody bar ${i + 1}`, op, options?.signal)
      exchanges.push(exchange)
      phrases.push(realizeJevNoteChoices(pickChoices(exchange.response.answers), plan, { barIndex: i }))
    }
    return { phrases, exchanges }
  }
}
