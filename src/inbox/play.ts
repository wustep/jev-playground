// Live inbox triage when Jev is reachable, otherwise the same client stub the
// page used before. A failed ask never pretends to be Jev: the notice is set
// and the stub’s activations are scored instead.

import type { Answer } from '../planner/jev/systemOne'
import { JevRequestError, jevStatus, postJevOp, type JevStatus } from '../shared/jevStatus'
import { cloneInbox } from './messages.js'
import { clamp01, cloneSettings, DEFAULT_REASON_SETTINGS, emptyActivations, scoreActionsWithChoice } from './triage.js'
import {
  inboxCache,
  inboxCacheKey,
  inboxFromLayout,
  inboxJudgmentKey,
  inboxLayout,
  shouldReuseJudgment,
  type InboxCached,
  type InboxJudgment,
  type InboxLatest,
} from './inboxCache.js'
import { buildInboxRequest, inboxActionQuestionId, inboxReasonQuestionId, parseInboxOp, type InboxOp } from './requests.js'
import { REASON_IDS, TRIAGE_ACTIONS, type ActionScores, type InboxItem, type ReasonActivations, type ReasonSettings } from './types.js'

export function stubJudgment(items: readonly InboxItem[], notice: string | null): InboxJudgment {
  const activations: Record<string, ReasonActivations> = {}
  for (const item of items) activations[item.message.id] = { ...item.reasons }
  return { source: 'stub', notice, activations, actionProbs: null }
}

function normalizeChoice(probs: ActionScores): ActionScores {
  const sum = TRIAGE_ACTIONS.reduce((total, action) => total + Math.max(0, probs[action] ?? 0), 0)
  if (sum <= 1e-8) return { Delete: 1 / 3, Review: 1 / 3, Leave: 1 / 3 }
  return {
    Delete: Math.max(0, probs.Delete) / sum,
    Review: Math.max(0, probs.Review) / sum,
    Leave: Math.max(0, probs.Leave) / sum,
  }
}

/** Map a System One answer object onto reason tags + the triad. Throws if Jev skipped a question. */
export function judgmentFromInboxAnswers(items: readonly InboxItem[], answers: Record<string, Answer>): InboxJudgment {
  const activations: Record<string, ReasonActivations> = {}
  const actionProbs: Record<string, ActionScores> = {}
  for (const item of items) {
    const id = item.message.id
    const tags = emptyActivations()
    for (const reason of REASON_IDS) {
      const answer = answers[inboxReasonQuestionId(id, reason)]
      if (!answer || answer.type !== 'noul' || typeof answer.noul !== 'number') {
        throw new JevRequestError(`Jev response is missing “${reason}” for ${id}`)
      }
      tags[reason] = clamp01(answer.noul)
    }
    const choice = answers[inboxActionQuestionId(id)]
    if (!choice || choice.type !== 'choice') throw new JevRequestError(`Jev response is missing the triad for ${id}`)
    const probs = { Delete: 0, Review: 0, Leave: 0 }
    for (const action of TRIAGE_ACTIONS) probs[action] = choice.probabilities?.[action] ?? 0
    activations[id] = tags
    actionProbs[id] = normalizeChoice(probs)
  }
  return { source: 'jev', notice: null, activations, actionProbs }
}

export function materializeInbox(items: readonly InboxItem[], settings: ReasonSettings, judgment: InboxJudgment): InboxCached {
  const results: InboxCached['results'] = {}
  for (const item of items) {
    const activations = judgment.activations[item.message.id] ?? item.reasons
    const choice = judgment.source === 'jev' ? (judgment.actionProbs?.[item.message.id] ?? null) : null
    results[item.message.id] = scoreActionsWithChoice(activations, settings, choice)
  }
  return { source: judgment.source, notice: judgment.notice, results }
}

export function peekInbox(items: readonly InboxItem[], settings: ReasonSettings, seed: number, status: JevStatus | null): InboxCached | null {
  const judgment = inboxCache.getJudgment(inboxJudgmentKey(items, seed))
  if (judgment && shouldReuseJudgment(judgment, status)) return materializeInbox(items, settings, judgment)
  const stored = inboxCache.getRun(inboxCacheKey(items, settings, seed))
  if (stored?.source === 'jev' || stored?.notice) return stored
  if (stored && !status?.available) return stored
  if (status && !status.available) return materializeInbox(items, settings, stubJudgment(items, null))
  return null
}

export function rememberInbox(items: readonly InboxItem[], settings: ReasonSettings, seed: number, run: InboxCached): void {
  const key = inboxCacheKey(items, settings, seed)
  inboxCache.setRun(key, run)
  const jKey = inboxJudgmentKey(items, seed)
  if (!inboxCache.getJudgment(jKey) && run.source === 'stub') {
    inboxCache.setJudgment(jKey, stubJudgment(items, run.notice))
  }
  inboxCache.setLatest({ seed, settings, layout: inboxLayout(items) })
}

async function judgeLive(items: readonly InboxItem[]): Promise<InboxJudgment> {
  const op: InboxOp = { op: 'inbox_triage', ids: items.map((item) => item.message.id) }
  const parsed = parseInboxOp(op)
  const response = await postJevOp(parsed, (model) => buildInboxRequest(parsed, model))
  return judgmentFromInboxAnswers(items, response.answers)
}

/** One judgment for this message set. The in-flight promise is registered synchronously so remounts share it. */
export function ensureInboxJudgment(items: readonly InboxItem[], seed: number): Promise<InboxJudgment> {
  const jKey = inboxJudgmentKey(items, seed)
  const existing = inboxCache.getJudgment(jKey)
  if (existing?.source === 'jev' || existing?.notice) return Promise.resolve(existing)
  const pending = inboxCache.getInflight(jKey)
  if (pending) return pending
  const promise = jevStatus().then((status) => {
    const again = inboxCache.getJudgment(jKey)
    if (shouldReuseJudgment(again, status)) return again as InboxJudgment
    const judged = status.available ? judgeLive(items) : Promise.resolve(stubJudgment(items, null))
    return judged
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error)
        return stubJudgment(items, `Jev request failed (${message}). Showing the offline stub’s triage instead.`)
      })
      .then((judgment) => {
        inboxCache.setJudgment(jKey, judgment)
        return judgment
      })
  })
  inboxCache.setInflight(jKey, promise)
  return promise
}

export function initialInbox(): { items: InboxItem[]; settings: ReasonSettings; seed: number } {
  const saved: InboxLatest | null = inboxCache.getLatest()
  if (saved) {
    const items = inboxFromLayout(saved.layout)
    if (items) return { items, settings: saved.settings, seed: saved.seed }
  }
  return { items: cloneInbox(), settings: cloneSettings(DEFAULT_REASON_SETTINGS), seed: 1 }
}
