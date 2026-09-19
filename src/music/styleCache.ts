import type { StyleId } from '../plan/schema'
import type { Exchange, PlanInput, PlanResult, ScoreResult } from '../planner'
import type { NotesMode } from './notesMode'
import type { NotePhrase } from '../render/jevNotes'

export interface Generated extends PlanResult {
  input: PlanInput
  /** Set when the requested planner failed and the stub stepped in. */
  notice: string | null
  /** Precomputed style-match (best-of-N already scored the winner). */
  matches?: ScoreResult
  /**
   * Debug-only: Jev's validated RH phrases, one per plan bar, applied on top
   * of renderPlan. `undefined` = not tried; `[]` = tried and failed.
   */
  notePhrases?: NotePhrase[]
  noteExchanges?: Exchange[]
  /** Which Debug notes path produced `notePhrases`. Legacy cache without this is `line`. */
  noteMode?: Extract<NotesMode, 'guide' | 'line'>
}

const STORAGE_KEY = 'jev-playground:music-style-cache:v1'

/** Survives MusicApp remounts (route/tab away and back). */
const memory = new Map<StyleId, Generated>()
/** In-flight live/stub plans — finish even if the UI unmounted mid-request. */
const inflight = new Map<StyleId, Promise<Generated>>()

function readStorage(): void {
  if (typeof sessionStorage === 'undefined') return
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw) as Record<string, Generated>
    for (const [id, value] of Object.entries(parsed)) {
      if (!memory.has(id as StyleId)) memory.set(id as StyleId, value)
    }
  } catch {
    /* ignore corrupt session data */
  }
}

function writeStorage(): void {
  if (typeof sessionStorage === 'undefined') return
  try {
    const payload: Record<string, Generated> = {}
    for (const [id, value] of memory) payload[id] = value
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  } catch {
    /* quota / private mode */
  }
}

readStorage()

export const styleCache = {
  get(id: StyleId): Generated | undefined {
    return memory.get(id)
  },
  has(id: StyleId): boolean {
    return memory.has(id)
  },
  set(id: StyleId, value: Generated): void {
    memory.set(id, value)
    writeStorage()
  },
  getInflight(id: StyleId): Promise<Generated> | undefined {
    return inflight.get(id)
  },
  setInflight(id: StyleId, promise: Promise<Generated>): void {
    inflight.set(id, promise)
    void promise.finally(() => {
      if (inflight.get(id) === promise) inflight.delete(id)
    })
  },
}
