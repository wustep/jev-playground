// Minimal client for TypeSafe's System One endpoint.
// Contract: https://docs.typesafe.ai/api.md  (POST /v1/systemone)
//
// Plain fetch rather than @typesafe-ai/sdk so the exact same code runs in the
// browser (local direct mode) and in the /api/jev serverless proxy.

export type Json = string | number | boolean | null | Json[] | { [key: string]: Json }

export interface ChoiceQuestion {
  type: 'choice'
  instructions: Json
  /** option → rubric description (null when the name says it all) */
  criteria: Record<string, string | null>
}
export interface ScoreQuestion {
  type: 'score'
  instructions: Json
  /** ordered level descriptions; each must make sense on its own */
  criteria: string[]
}
export interface NoulQuestion {
  type: 'noul'
  instructions: Json
  criteria?: { true?: string; false?: string }
}
export type Question = ChoiceQuestion | ScoreQuestion | NoulQuestion

export interface SystemOneRequest {
  state: Json
  model: string
  questions: Record<string, Question>
}

export interface ChoiceAnswer {
  type: 'choice'
  choice: string
  probabilities: Record<string, number>
  confidence: number
}
export interface ScoreAnswer {
  type: 'score'
  score: number
  legend: Record<string, string>
  probabilities: Record<string, number>
  confidence: number
}
export interface NoulAnswer {
  type: 'noul'
  noul: number
}
export type Answer = ChoiceAnswer | ScoreAnswer | NoulAnswer

export interface SystemOneResponse {
  model: string
  answers: Record<string, Answer>
  usage: { input_tokens: number; output_tokens: number }
}

export class SystemOneError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

export const DEFAULT_BASE_URL = 'https://api.typesafe.ai'
export const DEFAULT_MODEL = 'jev-latest'

export interface CallOptions {
  apiKey: string
  baseUrl?: string
  signal?: AbortSignal
  maxAttempts?: number
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => {
      clearTimeout(timer)
      reject(signal.reason)
    })
  })

/** POST one evaluation. Retries 429/529 with backoff, as the API docs ask. */
export async function callSystemOne(request: SystemOneRequest, options: CallOptions): Promise<SystemOneResponse> {
  const url = `${(options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '')}/v1/systemone`
  const maxAttempts = options.maxAttempts ?? 4
  for (let attempt = 1; ; attempt++) {
    const response = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${options.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      signal: options.signal,
    })
    if (response.ok) return (await response.json()) as SystemOneResponse

    const retryable = response.status === 429 || response.status === 529
    if (retryable && attempt < maxAttempts) {
      const retryAfter = Number(response.headers.get('retry-after'))
      const backoff = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 400 * 2 ** (attempt - 1)
      await sleep(Math.min(backoff, 8000), options.signal)
      continue
    }
    const body = await response.text().catch(() => '')
    throw new SystemOneError(response.status, `TypeSafe API ${response.status}: ${body.slice(0, 400) || response.statusText}`)
  }
}
