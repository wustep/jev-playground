// Finished inbox triages, keyed by everything that changes the triad:
// reshuffle seed, message order, per-message reason activations, and the
// reason-weight policy. A second map stores Jev’s raw tags (the judgment)
// without weights, so moving a slider recomputes in code and does not ask
// Jev again.
//
// Module memory survives InboxApp remounts; sessionStorage restores the last
// finished run on the next visit. In-flight judgments are shared so a remount
// mid-request does not send a second one. Same shape as src/music/styleCache.ts.

import type { JevStatus } from '../shared/jevStatus'
import { INBOX_SEED } from './messages.js'
import { cloneSettings, DEFAULT_REASON_SETTINGS, emptyActivations } from './triage.js'
import { REASON_IDS, type ActionScores, type InboxItem, type ReasonActivations, type ReasonSettings, type TriageResult } from './types.js'

export interface InboxJudgment {
  source: 'jev' | 'stub'
  notice: string | null
  /** Message id → reason-tag activations (Jev Nouls, or the seed’s own). */
  activations: Record<string, ReasonActivations>
  /** Message id → Delete / Review / Leave probabilities. Null on the stub. */
  actionProbs: Record<string, ActionScores> | null
}

export interface InboxCached {
  source: 'jev' | 'stub'
  notice: string | null
  results: Record<string, TriageResult>
}

export interface InboxLayoutEntry {
  id: string
  reasons: ReasonActivations
}

export interface InboxLatest {
  seed: number
  settings: ReasonSettings
  layout: InboxLayoutEntry[]
}

const STORAGE_KEY = 'jev-playground:inbox-cache:v1'
const MAX_RUNS = 12
const MAX_JUDGMENTS = 8

const runs = new Map<string, InboxCached>()
const judgments = new Map<string, InboxJudgment>()
/** In-flight live/stub judgments — finish even if the UI unmounted mid-request. */
const inflight = new Map<string, Promise<InboxJudgment>>()
let latest: InboxLatest | null = null

function layoutToken(items: readonly InboxItem[]): string {
  return items
    .map((item) => {
      const reasons = REASON_IDS.map((id) => Number(item.reasons[id] ?? 0).toFixed(3)).join(',')
      return `${item.message.id}:${reasons}`
    })
    .join('|')
}

function weightsToken(settings: ReasonSettings): string {
  return REASON_IDS.map((id) => {
    const policy = settings[id]
    const weight = Number.isFinite(policy?.weight) ? policy.weight : 0
    return `${id}:${policy?.enabled ? 1 : 0}:${weight.toFixed(2)}`
  }).join(',')
}

/** What Jev (or the stub activations) were asked. Weights are not part of this. */
export function inboxJudgmentKey(items: readonly InboxItem[], seed: number): string {
  return `${seed}\u001f${layoutToken(items)}`
}

/** Finished triad. Includes weights, so a slider move is a different entry. */
export function inboxCacheKey(items: readonly InboxItem[], settings: ReasonSettings, seed: number): string {
  return `${inboxJudgmentKey(items, seed)}\u001f${weightsToken(settings)}`
}

export function inboxLayout(items: readonly InboxItem[]): InboxLayoutEntry[] {
  return items.map((item) => ({ id: item.message.id, reasons: { ...item.reasons } }))
}

function reasonsFrom(raw: unknown): ReasonActivations | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>
  const next = emptyActivations()
  for (const id of REASON_IDS) {
    const value = obj[id]
    if (typeof value !== 'number' || !Number.isFinite(value)) return null
    next[id] = Math.min(1, Math.max(0, value))
  }
  return next
}

export function inboxFromLayout(layout: readonly InboxLayoutEntry[]): InboxItem[] | null {
  const byId = new Map(INBOX_SEED.map((item) => [item.message.id, item]))
  const items: InboxItem[] = []
  const seen = new Set<string>()
  for (const entry of layout) {
    if (!entry || typeof entry.id !== 'string' || seen.has(entry.id)) return null
    const seed = byId.get(entry.id)
    const reasons = reasonsFrom(entry.reasons)
    if (!seed || !reasons) return null
    seen.add(entry.id)
    items.push({ message: seed.message, reasons })
  }
  return items.length > 0 ? items : null
}

function settingsFrom(raw: unknown): ReasonSettings | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>
  const next = cloneSettings(DEFAULT_REASON_SETTINGS)
  for (const id of REASON_IDS) {
    const policy = obj[id]
    if (!policy || typeof policy !== 'object') return null
    const row = policy as Record<string, unknown>
    if (typeof row.enabled !== 'boolean' || typeof row.weight !== 'number' || !Number.isFinite(row.weight)) return null
    next[id] = { enabled: row.enabled, weight: row.weight }
  }
  return next
}

function rememberMap<K, V>(map: Map<K, V>, key: K, value: V, max: number): void {
  if (map.has(key)) map.delete(key)
  map.set(key, value)
  while (map.size > max) {
    const oldest = map.keys().next().value
    if (oldest === undefined) break
    map.delete(oldest)
  }
}

function readStorage(): void {
  if (typeof sessionStorage === 'undefined') return
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw) as {
      runs?: Record<string, InboxCached>
      judgments?: Record<string, InboxJudgment>
      latest?: InboxLatest | null
    }
    for (const [key, value] of Object.entries(parsed.runs ?? {})) {
      if (!runs.has(key) && value && typeof value === 'object' && value.results) runs.set(key, value)
    }
    for (const [key, value] of Object.entries(parsed.judgments ?? {})) {
      if (!judgments.has(key) && value && (value.source === 'jev' || value.source === 'stub') && value.activations) judgments.set(key, value)
    }
    const saved = parsed.latest
    if (saved && typeof saved.seed === 'number' && Array.isArray(saved.layout) && settingsFrom(saved.settings)) {
      latest = { seed: saved.seed, settings: settingsFrom(saved.settings) as ReasonSettings, layout: saved.layout }
    }
  } catch {
    /* ignore corrupt session data */
  }
}

function writeStorage(): void {
  if (typeof sessionStorage === 'undefined') return
  try {
    const payload = {
      runs: Object.fromEntries(runs),
      judgments: Object.fromEntries(judgments),
      latest,
    }
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  } catch {
    /* quota / private mode */
  }
}

readStorage()

/**
 * A stub with no failure notice is only the offline stand-in. Once we know
 * Jev is up, drop it and ask. A failure notice stays — retry is a new key
 * (reshuffle), not a loop.
 */
export function shouldReuseJudgment(judgment: InboxJudgment | undefined, status: JevStatus | null): boolean {
  if (!judgment) return false
  if (judgment.source === 'jev') return true
  if (judgment.notice) return true
  return !status?.available
}

export const inboxCache = {
  getRun(key: string): InboxCached | undefined {
    return runs.get(key)
  },
  setRun(key: string, value: InboxCached): void {
    rememberMap(runs, key, value, MAX_RUNS)
    writeStorage()
  },
  getJudgment(key: string): InboxJudgment | undefined {
    return judgments.get(key)
  },
  setJudgment(key: string, value: InboxJudgment): void {
    rememberMap(judgments, key, value, MAX_JUDGMENTS)
    writeStorage()
  },
  getInflight(key: string): Promise<InboxJudgment> | undefined {
    return inflight.get(key)
  },
  setInflight(key: string, promise: Promise<InboxJudgment>): void {
    inflight.set(key, promise)
    void promise.finally(() => {
      if (inflight.get(key) === promise) inflight.delete(key)
    })
  },
  getLatest(): InboxLatest | null {
    return latest
  },
  setLatest(value: InboxLatest): void {
    latest = value
    writeStorage()
  },
}

export function resetInboxCacheForTests(): void {
  runs.clear()
  judgments.clear()
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
