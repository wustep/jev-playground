import { afterEach, describe, expect, it } from 'vitest'
import type { Answer } from '../planner/jev/systemOne'
import type { JevStatus } from '../shared/jevStatus'
import { matchCache, matchCacheKey, resetMatchCacheForTests, shouldReuseMatch } from './matchCache'
import { DEFAULT_YOU } from './people'
import { ensureMatch, pickPeople, rankedFromAnswers } from './play'
import type { YouProfile } from './types'

const up: JevStatus = { available: true, direct: false, detail: 'test' }
const down: JevStatus = { available: false, direct: false, detail: 'test' }

afterEach(() => {
  resetMatchCacheForTests()
})

describe('match cache keys', () => {
  it('covers the committed profile, the candidate ids, and the seed', () => {
    const ids = pickPeople(7).map((person) => person.id)
    const base = matchCacheKey(DEFAULT_YOU, ids, 7)
    const jazz: YouProfile = { ...DEFAULT_YOU, hobbies: ['jazz'], lookingFor: ['a bandmate'] }
    expect(matchCacheKey(jazz, ids, 7)).not.toBe(base)
    expect(matchCacheKey(DEFAULT_YOU, ids, 8)).not.toBe(base)
    expect(matchCacheKey(DEFAULT_YOU, [...ids].reverse(), 7)).not.toBe(base)
    expect(matchCacheKey({ ...DEFAULT_YOU, name: 'Sam Rivers' }, ids, 7)).not.toBe(base)
    expect(matchCacheKey({ ...DEFAULT_YOU, hobbies: [...DEFAULT_YOU.hobbies].reverse() }, ids, 7)).toBe(base)
    expect(ids).toHaveLength(8)
    expect(pickPeople(7).map((person) => person.id)).toEqual(ids)
  })

  it('reuses a live ranking and a failed stub, and not a quiet stub once Jev is up', () => {
    const live = { source: 'jev' as const, notice: null, ranked: [] }
    const failed = { source: 'stub' as const, notice: 'Jev request failed (nope).', ranked: [] }
    const quiet = { source: 'stub' as const, notice: null, ranked: [] }
    expect(shouldReuseMatch(live, up)).toBe(true)
    expect(shouldReuseMatch(failed, up)).toBe(true)
    expect(shouldReuseMatch(quiet, up)).toBe(false)
    expect(shouldReuseMatch(quiet, down)).toBe(true)
    expect(shouldReuseMatch(quiet, null)).toBe(true)
  })

  it('joins an in-flight ranking so a second caller does not start another', async () => {
    const people = pickPeople(7)
    const key = matchCacheKey(DEFAULT_YOU, people.map((person) => person.id), 7)
    let release: (value: unknown) => void = () => {}
    const gate = new Promise((done) => {
      release = done
    })
    const first = ensureMatch(DEFAULT_YOU, people, 7)
    const second = ensureMatch(DEFAULT_YOU, people, 7)
    expect(matchCache.getInflight(key)).toBeDefined()
    expect(second).toBe(matchCache.getInflight(key))
    release(null)
    await gate
    await first
    await second
    expect(matchCache.get(key)?.source).toBe('stub')
  })
})

describe('rankedFromAnswers', () => {
  it('reads the structured questions and throws if one is missing', () => {
    const people = pickPeople(3).slice(0, 1)
    const person = people[0]
    expect(person).toBeTruthy()
    if (!person) return
    const answers: Record<string, Answer> = {
      [`${person.id}__hobbies`]: { type: 'noul', noul: 0.8 },
      [`${person.id}__looking_for`]: { type: 'noul', noul: 0.6 },
      [`${person.id}__complement`]: { type: 'noul', noul: 0.4 },
      [`${person.id}__fit`]: { type: 'score', score: 3, legend: {}, probabilities: {}, confidence: 0.7 },
    }
    const ranked = rankedFromAnswers(DEFAULT_YOU, people, answers)
    expect(ranked).toHaveLength(1)
    expect(ranked[0]?.fit).toBeCloseTo(1)
    expect(ranked[0]?.confidence).toBeCloseTo(0.7)
    expect(ranked[0]?.reasons.find((reason) => reason.id === 'hobbies')?.score).toBeCloseTo(0.8)
    delete answers[`${person.id}__fit`]
    expect(() => rankedFromAnswers(DEFAULT_YOU, people, answers)).toThrow(/fit/)
  })
})
