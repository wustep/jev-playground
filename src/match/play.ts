// Live match ranking when Jev is reachable, otherwise the client heuristic.
// Save commits the profile; drafting hobbies does not call this. A failed ask
// keeps the stub ranking and sets a notice — it does not invent a Jev fit.

import { rng } from '../planner/pick'
import type { Answer } from '../planner/jev/systemOne'
import { shuffleInPlace } from '../shared/jevMath'
import { JevRequestError, jevStatus, postJevOp, type JevStatus } from '../shared/jevStatus'
import { overlayLiveScores, rankPeople } from './match'
import { matchCache, matchCacheKey, shouldReuseMatch, type MatchCached } from './matchCache'
import { DEFAULT_YOU, PEOPLE } from './people'
import { buildMatchRequest, MATCH_SCORE_LEVELS, matchQuestionId, parseMatchOp, youToOp, type MatchOp } from './requests'
import type { MatchResult, Person, YouProfile } from './types'

export const MATCH_SHOW = 8
export const MATCH_SEED = 7

export function pickPeople(seed: number, pool: readonly Person[] = PEOPLE): Person[] {
  return shuffleInPlace([...pool], rng(seed)).slice(0, MATCH_SHOW)
}

function readNoul(answers: Record<string, Answer>, id: string): number {
  const answer = answers[id]
  if (!answer || answer.type !== 'noul' || typeof answer.noul !== 'number') throw new JevRequestError(`Jev response is missing “${id}”`)
  if (answer.noul < 0 || answer.noul > 1) throw new JevRequestError(`Jev response “${id}” is out of range`)
  return answer.noul
}

function readFit(answers: Record<string, Answer>, id: string): { fit: number; confidence: number } {
  const answer = answers[id]
  if (!answer || answer.type !== 'score' || typeof answer.score !== 'number' || !Number.isFinite(answer.score)) {
    throw new JevRequestError(`Jev response is missing fit “${id}”`)
  }
  const span = MATCH_SCORE_LEVELS.length - 1
  const fit = Math.min(span, Math.max(0, answer.score)) / span
  const confidence = typeof answer.confidence === 'number' && Number.isFinite(answer.confidence) ? answer.confidence : fit
  return { fit, confidence }
}

/** Turn a System One answer object into ranked cards. Throws if any candidate is incomplete. */
export function rankedFromAnswers(you: YouProfile, people: readonly Person[], answers: Record<string, Answer>): MatchResult[] {
  const ranked = people.map((person) => {
    const hobbies = readNoul(answers, matchQuestionId(person.id, 'hobbies'))
    const lookingFor = readNoul(answers, matchQuestionId(person.id, 'looking_for'))
    const complement = readNoul(answers, matchQuestionId(person.id, 'complement'))
    const fit = readFit(answers, matchQuestionId(person.id, 'fit'))
    return overlayLiveScores(you, person, { hobbies, lookingFor, complement, fit: fit.fit, confidence: fit.confidence })
  })
  return ranked.toSorted((a, b) => b.fit - a.fit || b.confidence - a.confidence)
}

export function peekMatch(you: YouProfile, people: readonly Person[], seed: number, status: JevStatus | null): MatchCached | null {
  const hit = matchCache.get(matchCacheKey(you, people.map((person) => person.id), seed))
  if (hit && shouldReuseMatch(hit, status)) return hit
  if (status && !status.available) return { source: 'stub', notice: null, ranked: rankPeople(you, people) }
  return null
}

export function rememberMatch(you: YouProfile, seed: number, run: MatchCached, ids: readonly string[]): void {
  matchCache.set(matchCacheKey(you, ids, seed), run)
  matchCache.setLatest({ you, seed })
}

async function rankLive(you: YouProfile, people: readonly Person[]): Promise<MatchCached> {
  const op: MatchOp = { op: 'match_rank', you: youToOp(you), ids: people.map((person) => person.id) }
  const parsed = parseMatchOp(op)
  const response = await postJevOp(parsed, (model) => buildMatchRequest(parsed, model))
  return { source: 'jev', notice: null, ranked: rankedFromAnswers(you, people, response.answers) }
}

/** One ranking for this committed profile and candidate set. The in-flight promise is registered synchronously so remounts share it. */
export function ensureMatch(you: YouProfile, people: readonly Person[], seed: number): Promise<MatchCached> {
  const ids = people.map((person) => person.id)
  const key = matchCacheKey(you, ids, seed)
  const existing = matchCache.get(key)
  if (existing?.source === 'jev' || existing?.notice) return Promise.resolve(existing)
  const pending = matchCache.getInflight(key)
  if (pending) return pending
  const promise = jevStatus().then((status) => {
    const again = matchCache.get(key)
    if (shouldReuseMatch(again, status)) return again as MatchCached
    const ranked = status.available ? rankLive(you, people) : Promise.resolve({ source: 'stub' as const, notice: null, ranked: rankPeople(you, people) })
    return ranked
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error)
        return {
          source: 'stub' as const,
          notice: `Jev request failed (${message}). Showing the offline stub’s ranking instead.`,
          ranked: rankPeople(you, people),
        }
      })
      .then((run) => {
        matchCache.set(key, run)
        return run
      })
  })
  matchCache.setInflight(key, promise)
  return promise
}

export function initialMatch(): { you: YouProfile; seed: number } {
  const saved = matchCache.getLatest()
  if (saved?.you && typeof saved.seed === 'number') return { you: saved.you, seed: saved.seed }
  return { you: DEFAULT_YOU, seed: MATCH_SEED }
}
