// Everything the inbox demo asks Jev, as pure functions:
// InboxOp → { state, questions }. The browser posts a small typed op (message
// ids from the fictional seed); the server re-validates and builds the request
// so /api/jev stays an allowlist.
//
// One fan-out per message, questions in parallel:
//   • a Noul for each closed reason tag (spam, person, security, …)
//   • a Choice over the Delete / Review / Leave triad
// Code owns the recommended action: reason Nouls are activations, the user's
// weights scale them, and the Choice is mixed in. Message text lives in state
// only — never copied into instructions.
//
// NOTE: imported by the /api/jev serverless chain → explicit `.js` extensions.

import type { ChoiceQuestion, Json, NoulQuestion, Question, SystemOneRequest } from '../planner/jev/systemOne.js'
import { INBOX_SEED } from './messages.js'
import { REASON_CATALOG } from './triage.js'
import { REASON_IDS, type ReasonId, type TriageAction } from './types.js'

export type InboxOp = { op: 'inbox_triage'; ids: string[] }

export class InboxValidationError extends Error {}

export const isInboxOp = (raw: unknown): boolean => (raw as { op?: unknown } | null)?.op === 'inbox_triage'

const choice = (instructions: string, criteria: Record<string, string>): ChoiceQuestion => ({ type: 'choice', instructions, criteria })

const noul = (instructions: string, criteria: { true: string; false: string }): NoulQuestion => ({ type: 'noul', instructions, criteria })

export const TRIAGE_CRITERIA: Record<TriageAction, string> = {
  Delete: 'Throw it away. No relationship and nothing to keep.',
  Review: 'A person should look, but it does not need to stay at the top of the inbox.',
  Leave: 'Keep it. A real person, a pledge, or something that should stay.',
}

const BY_ID = new Map(INBOX_SEED.map((item) => [item.message.id, item]))

export const inboxReasonQuestionId = (messageId: string, reason: ReasonId) => `${messageId}__${reason}`
export const inboxActionQuestionId = (messageId: string) => `${messageId}__action`

const BODY_CAP = 700

function describeMessage(id: string): Json {
  const item = BY_ID.get(id)
  if (!item) throw new InboxValidationError(`op.ids: unknown message ${id}`)
  const message = item.message
  const body = message.plaintextBody.length > BODY_CAP ? `${message.plaintextBody.slice(0, BODY_CAP)}…` : message.plaintextBody
  return {
    id: message.id,
    from: message.sender,
    subject: message.subject,
    labels: [...message.labelIds],
    body,
  }
}

export function buildInboxRequest(op: InboxOp, model: string): SystemOneRequest {
  const questions: Record<string, Question> = {}
  for (const id of op.ids) {
    for (const reason of REASON_IDS) {
      const meta = REASON_CATALOG[reason]
      questions[inboxReasonQuestionId(id, reason)] = noul(
        `Does the message with id \`${id}\` in \`messages\` fit the closed reason “${meta.label}”? ${meta.blurb}`,
        { true: `This message is a clear case of ${meta.label}.`, false: `This message is not ${meta.label}.` },
      )
    }
    questions[inboxActionQuestionId(id)] = choice(
      `For the message with id \`${id}\` in \`messages\`, what should the recipient do?`,
      TRIAGE_CRITERIA,
    )
  }
  return {
    model,
    state: {
      task: 'Triage a fictional inbox. Score each message on its own.',
      note: 'Every message is made up. Reason tags are a closed list. The action is Delete, Review, or Leave.',
      messages: op.ids.map(describeMessage),
    },
    questions,
  }
}

/** Validate an untrusted op (server side). Throws InboxValidationError. */
export function parseInboxOp(raw: unknown): InboxOp {
  if (!raw || typeof raw !== 'object') throw new InboxValidationError('op: expected an object')
  const obj = raw as Record<string, unknown>
  if (obj.op !== 'inbox_triage') throw new InboxValidationError('op.op: expected "inbox_triage"')
  if (!Array.isArray(obj.ids) || obj.ids.length === 0 || obj.ids.length > INBOX_SEED.length) {
    throw new InboxValidationError(`op.ids: expected 1–${INBOX_SEED.length} message ids`)
  }
  const ids: string[] = []
  const seen = new Set<string>()
  for (const id of obj.ids) {
    if (typeof id !== 'string' || !BY_ID.has(id)) throw new InboxValidationError('op.ids: unknown message id')
    if (seen.has(id)) throw new InboxValidationError('op.ids: duplicate message id')
    seen.add(id)
    ids.push(id)
  }
  return { op: 'inbox_triage', ids }
}
