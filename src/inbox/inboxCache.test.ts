import { afterEach, describe, expect, it } from 'vitest'
import type { JevStatus } from '../shared/jevStatus'
import { inboxCache, inboxCacheKey, inboxJudgmentKey, resetInboxCacheForTests } from './inboxCache'
import { cloneInbox } from './messages'
import { peekInbox, stubJudgment } from './play'
import { cloneSettings, DEFAULT_REASON_SETTINGS, emptyActivations } from './triage'
import type { ReasonSettings } from './types'

const up: JevStatus = { available: true, direct: false, detail: 'test' }
const down: JevStatus = { available: false, direct: false, detail: 'test' }

afterEach(() => {
  resetInboxCacheForTests()
})

function weight(id: 'spam' | 'person', enabled: boolean): ReasonSettings {
  const next = cloneSettings(DEFAULT_REASON_SETTINGS)
  for (const key of Object.keys(next) as (keyof ReasonSettings)[]) {
    next[key] = { enabled: false, weight: 0 }
  }
  next[id] = { enabled, weight: enabled ? 2 : 0 }
  return next
}

describe('inbox cache keys', () => {
  it('changes with seed, order, activations, and weights — not with weights alone on the judgment key', () => {
    const items = cloneInbox()
    const base = inboxCacheKey(items, DEFAULT_REASON_SETTINGS, 1)
    const heavier = cloneSettings(DEFAULT_REASON_SETTINGS)
    heavier.spam = { enabled: true, weight: 2 }
    expect(inboxCacheKey(items, heavier, 1)).not.toBe(base)
    expect(inboxCacheKey(items, DEFAULT_REASON_SETTINGS, 2)).not.toBe(base)
    expect(inboxJudgmentKey(items, 1)).toBe(inboxJudgmentKey(items, 1))
    expect(inboxJudgmentKey(items, 1)).not.toBe(inboxJudgmentKey(items, 2))
    expect(inboxJudgmentKey(items, 1)).not.toBe(inboxJudgmentKey([...items].reverse(), 1))
    const jittered = items.map((item, index) => (index === 0 ? { ...item, reasons: { ...item.reasons, spam: item.reasons.spam + 0.05 } } : item))
    expect(inboxJudgmentKey(jittered, 1)).not.toBe(inboxJudgmentKey(items, 1))
    expect(inboxJudgmentKey(items, 1)).not.toContain('spam:')
  })

  it('shares one in-flight judgment and clears it when that promise settles', async () => {
    let resolve: (value: ReturnType<typeof stubJudgment>) => void = () => {}
    const promise = new Promise<ReturnType<typeof stubJudgment>>((done) => {
      resolve = done
    })
    inboxCache.setInflight('batch', promise)
    expect(inboxCache.getInflight('batch')).toBe(promise)
    resolve(stubJudgment(cloneInbox().slice(0, 1), null))
    await promise
    await Promise.resolve()
    expect(inboxCache.getInflight('batch')).toBeUndefined()
  })

  it('reuses a live judgment across weight edits and drops a quiet stub once Jev is up', () => {
    const items = cloneInbox().slice(0, 1)
    const item = items[0]
    expect(item).toBeTruthy()
    if (!item) return
    const activations = emptyActivations()
    activations.spam = 1
    activations.person = 1
    const judgment = stubJudgment(items, null)
    judgment.source = 'jev'
    judgment.activations = { [item.message.id]: activations }
    judgment.actionProbs = { [item.message.id]: { Delete: 1 / 3, Review: 1 / 3, Leave: 1 / 3 } }
    inboxCache.setJudgment(inboxJudgmentKey(items, 4), judgment)

    const spammy = peekInbox(items, weight('spam', true), 4, up)
    const personal = peekInbox(items, weight('person', true), 4, up)
    expect(spammy?.source).toBe('jev')
    expect(personal?.source).toBe('jev')
    expect(spammy?.results[item.message.id]?.recommended).toBe('Delete')
    expect(personal?.results[item.message.id]?.recommended).toBe('Leave')

    inboxCache.setJudgment(inboxJudgmentKey(items, 4), stubJudgment(items, null))
    expect(peekInbox(items, DEFAULT_REASON_SETTINGS, 4, up)).toBeNull()
    expect(peekInbox(items, DEFAULT_REASON_SETTINGS, 4, down)?.source).toBe('stub')
    expect(peekInbox(items, DEFAULT_REASON_SETTINGS, 4, null)?.source).toBe('stub')

    inboxCache.setJudgment(inboxJudgmentKey(items, 4), stubJudgment(items, 'Jev request failed (nope). Showing the offline stub’s triage instead.'))
    expect(peekInbox(items, DEFAULT_REASON_SETTINGS, 4, up)?.notice).toMatch(/failed/)
  })
})
