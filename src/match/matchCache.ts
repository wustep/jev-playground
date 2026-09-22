// Finished match rankings. The key is the committed “you” profile (name, city,
// bio, energy, hobbies, looking-for), the candidate ids in order, and the
// reshuffle seed. Edits in the You panel are not part of the key until
// Save & rank.
//
// Module memory survives MatchApp remounts; sessionStorage restores the last
// finished ranking on the next visit. In-flight promises are shared so a
// remount mid-request does not send a second one. Same shape as
// src/music/styleCache.ts.

import type { JevStatus } from '../shared/jevStatus'
import type { MatchResult, YouProfile } from './types'

export interface MatchCached {
  source: 'jev' | 'stub'
  notice: string | null
  ranked: MatchResult[]
}

export interface MatchLatest {
  you: YouProfile
  seed: number
}

const STORAGE_KEY = 'jev-playground:match-cache:v1'
const MAX_RUNS = 12

const runs = new Map<string, MatchCached>()
/** In-flight live/stub rankings — finish even if the UI unmounted mid-request. */
const inflight = new Map<string, Promise<MatchCached>>()
let latest: MatchLatest | null = null

/** Committed profile + candidate set + reshuffle seed. Draft edits are not included. */
export function matchCacheKey(you: YouProfile, ids: readonly string[], seed: number): string {
  const hobbies = [...you.hobbies].map(String).sort().join(',')
  const looking = [...you.lookingFor].map(String).sort().join(',')
  return [String(seed), ids.join(','), you.energy, you.name.trim(), you.city.trim(), you.bio.trim(), hobbies, looking].join('\u001f')
}

function readStorage(): void {
  if (typeof sessionStorage === 'undefined') return
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw) as { runs?: Record<string, MatchCached>; latest?: MatchLatest | null }
    for (const [key, value] of Object.entries(parsed.runs ?? {})) {
      if (!runs.has(key) && value && (value.source === 'jev' || value.source === 'stub') && Array.isArray(value.ranked)) runs.set(key, value)
    }
    const saved = parsed.latest
    if (saved && saved.you && typeof saved.seed === 'number' && Array.isArray(saved.you.hobbies) && Array.isArray(saved.you.lookingFor)) {
      latest = saved
    }
  } catch {
    /* ignore corrupt session data */
  }
}

function writeStorage(): void {
  if (typeof sessionStorage === 'undefined') return
  try {
    const payload = { runs: Object.fromEntries(runs), latest }
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  } catch {
    /* quota / private mode */
  }
}

readStorage()

/** Same honesty rule as the inbox cache: a quiet stub is offline-only; a notice stays. */
export function shouldReuseMatch(hit: MatchCached | undefined, status: JevStatus | null): boolean {
  if (!hit) return false
  if (hit.source === 'jev') return true
  if (hit.notice) return true
  return !status?.available
}

export const matchCache = {
  get(key: string): MatchCached | undefined {
    return runs.get(key)
  },
  set(key: string, value: MatchCached): void {
    if (runs.has(key)) runs.delete(key)
    runs.set(key, value)
    while (runs.size > MAX_RUNS) {
      const oldest = runs.keys().next().value
      if (oldest === undefined) break
      runs.delete(oldest)
    }
    writeStorage()
  },
  delete(key: string): void {
    if (!runs.delete(key)) return
    writeStorage()
  },
  getInflight(key: string): Promise<MatchCached> | undefined {
    return inflight.get(key)
  },
  setInflight(key: string, promise: Promise<MatchCached>): void {
    inflight.set(key, promise)
    void promise.finally(() => {
      if (inflight.get(key) === promise) inflight.delete(key)
    })
  },
  getLatest(): MatchLatest | null {
    return latest
  },
  setLatest(value: MatchLatest): void {
    latest = value
    writeStorage()
  },
}

export function resetMatchCacheForTests(): void {
  runs.clear()
  inflight.clear()
  latest = null
  if (typeof sessionStorage !== 'undefined') {
    try {
      sessionStorage.removeItem(STORAGE_KEY)
    } catch {
      /* ignore */
    }
  }
}
