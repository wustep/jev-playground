import { describe, expect, it } from 'vitest'
import { INBOX_SEED } from './messages'
import { InboxValidationError, buildInboxRequest, inboxActionQuestionId, inboxReasonQuestionId, parseInboxOp } from './requests'
import { REASON_IDS } from './types'

const first = INBOX_SEED[0]
const spam = INBOX_SEED.find((item) => item.message.plaintextBody.includes('SSN'))

describe('inbox Jev request', () => {
  it('asks a Noul per closed reason and a Delete / Review / Leave choice', () => {
    expect(first).toBeTruthy()
    if (!first) return
    const op = parseInboxOp({ op: 'inbox_triage', ids: [first.message.id] })
    const request = buildInboxRequest(op, 'jev-latest')
    expect(Object.keys(request.questions)).toHaveLength(REASON_IDS.length + 1)
    const action = request.questions[inboxActionQuestionId(first.message.id)]
    expect(action?.type).toBe('choice')
    if (action?.type === 'choice') expect(Object.keys(action.criteria)).toEqual(['Delete', 'Review', 'Leave'])
    for (const reason of REASON_IDS) {
      expect(request.questions[inboxReasonQuestionId(first.message.id, reason)]?.type).toBe('noul')
    }
  })

  it('puts the message body in state, not in the question text', () => {
    expect(spam).toBeTruthy()
    if (!spam) return
    const request = buildInboxRequest(parseInboxOp({ op: 'inbox_triage', ids: [spam.message.id] }), 'jev-latest')
    expect(JSON.stringify(request.questions)).not.toContain('SSN')
    expect(JSON.stringify(request.state)).toContain('SSN')
  })

  it('rejects ids that are not in the fictional seed', () => {
    expect(() => parseInboxOp({ op: 'inbox_triage', ids: ['not-real'] })).toThrow(InboxValidationError)
    expect(() => parseInboxOp({ op: 'inbox_triage', ids: [] })).toThrow(InboxValidationError)
    expect(first).toBeTruthy()
    if (!first) return
    expect(() => parseInboxOp({ op: 'inbox_triage', ids: [first.message.id, first.message.id] })).toThrow(InboxValidationError)
  })
})
