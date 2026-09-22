// How inbox and match reach Jev. Same two doors as detectJev() in the music
// planner: a browser key talks to TypeSafe directly, otherwise the typed op
// goes to /api/jev and the server rebuilds the questions. Never throws; a
// missing key means the offline stub.

import { callSystemOne, DEFAULT_MODEL, type SystemOneRequest, type SystemOneResponse } from '../planner/jev/systemOne'

export class JevRequestError extends Error {}

export interface JevStatus {
  available: boolean
  /** Set when the proxy or the direct key names a model. */
  model?: string
  direct: boolean
  /** Masthead tooltip: where the key lives, or why Jev is off. */
  detail: string
}

export type JevChipPhase = 'checking' | 'loading' | 'live' | 'offline' | 'error'

/**
 * Masthead chip for a demo that prefers live Jev and falls back to a stub.
 * `busy` is an in-flight ask. `notice` is set only when a live ask failed and
 * the stub is on screen — that must not look like a successful Jev answer.
 */
export function jevChipPhase(input: {
  status: JevStatus | null
  busy: boolean
  source: 'jev' | 'stub' | null
  notice: string | null
}): JevChipPhase {
  if (input.busy) return 'loading'
  if (input.notice && input.source !== 'jev') return 'error'
  if (input.source === 'jev') return 'live'
  if (input.status === null) return 'checking'
  if (!input.status.available || input.source === 'stub' || input.source === null) return 'offline'
  return 'live'
}

let pending: Promise<JevStatus> | null = null

async function loadJevStatus(): Promise<JevStatus> {
  const env = import.meta.env
  if (env.VITE_JEV_API_KEY) {
    return {
      available: true,
      direct: true,
      model: env.VITE_JEV_MODEL || DEFAULT_MODEL,
      detail: 'direct from browser (VITE_JEV_API_KEY — local use only)',
    }
  }
  try {
    const response = await fetch('/api/jev')
    const body = (await response.json()) as { available?: boolean; model?: string }
    if (response.ok && body.available) {
      return { available: true, direct: false, model: body.model, detail: `via /api/jev proxy · ${body.model ?? 'jev-latest'}` }
    }
    return { available: false, direct: false, detail: 'no TYPESAFE_API_KEY on the server — using the offline stub' }
  } catch {
    return { available: false, direct: false, detail: 'no /api/jev endpoint here — using the offline stub' }
  }
}

/** One check per page load. Inbox and match share it. */
export function jevStatus(): Promise<JevStatus> {
  if (!pending) pending = loadJevStatus()
  return pending
}

export function resetJevStatusForTests(): void {
  pending = null
}

/** POST a typed op. Direct mode builds the System One body here; the proxy rebuilds it. */
export async function postJevOp(op: unknown, build: (model: string) => SystemOneRequest, signal?: AbortSignal): Promise<SystemOneResponse> {
  const env = import.meta.env
  if (env.VITE_JEV_API_KEY) {
    const model = env.VITE_JEV_MODEL || DEFAULT_MODEL
    return callSystemOne(build(model), { apiKey: env.VITE_JEV_API_KEY, baseUrl: env.VITE_JEV_BASE_URL, signal })
  }
  const response = await fetch('/api/jev', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(op),
    signal,
  })
  const body = (await response.json().catch(() => null)) as (SystemOneResponse & { error?: string }) | null
  if (!response.ok || !body || body.error) {
    const wait = response.headers.get('Retry-After')
    throw new JevRequestError(body?.error ?? `Jev proxy responded ${response.status}${wait ? ` (retry in ${wait} s)` : ''}`)
  }
  return body
}
