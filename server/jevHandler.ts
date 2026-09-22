// /api/jev — keeps TYPESAFE_API_KEY off the client.
//
// One implementation, two hosts: the Vercel function (api/jev.ts) and the Vite
// dev middleware (vite.config.ts) both call handleJev() with Web-standard
// Request/Response objects.
//
// It is deliberately NOT a generic passthrough: the body is a typed op from a
// fixed allowlist (music: concept / globals / bar / phrase / score / notes; trolley:
// cast / judge; inbox: triage; match: rank) that is re-validated against the enums, and the actual
// state/questions are rebuilt here. A stranger with the URL can only ask this
// app's questions — and only so many per minute (server/rateLimit.ts).
//
// What never leaves this function: the key, any env value other than the
// model name, and the upstream response body of a failed call.

import { InboxValidationError, buildInboxRequest, parseInboxOp } from '../src/inbox/requests.js'
import { MatchValidationError, buildMatchRequest, parseMatchOp } from '../src/match/requests.js'
import { PlanValidationError } from '../src/plan/schema.js'
import { buildRequest, parseOp } from '../src/planner/jev/requests.js'
import { callSystemOne, DEFAULT_MODEL, SystemOneError, type SystemOneRequest } from '../src/planner/jev/systemOne.js'
import { buildTrolleyRequest, isTrolleyOp, parseTrolleyOp } from '../src/trolley/requests.js'
import { TrolleyValidationError } from '../src/trolley/schema.js'
import { clientKey, createRateLimiter, DEFAULT_LIMIT_PER_MINUTE, type RateLimiter } from './rateLimit.js'

export interface JevEnv {
  TYPESAFE_API_KEY?: string
  TYPESAFE_BASE_URL?: string
  TYPESAFE_MODEL?: string
  /** POSTs per client IP per minute. Default 90. */
  JEV_RATE_LIMIT?: string
}

const MAX_BODY_BYTES = 16_000

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers },
  })

/** One limiter per configured limit, for the lifetime of this instance. */
const limiters = new Map<number, RateLimiter>()
function limiterFor(env: JevEnv): RateLimiter {
  const configured = Number(env.JEV_RATE_LIMIT)
  const limit = Number.isInteger(configured) && configured > 0 ? configured : DEFAULT_LIMIT_PER_MINUTE
  let limiter = limiters.get(limit)
  if (!limiter) limiters.set(limit, (limiter = createRateLimiter(limit)))
  return limiter
}

/** Allowlist: anything that is not one of this app's ops throws a validation error. */
function requestFor(raw: unknown, model: string): SystemOneRequest {
  const op = (raw as { op?: unknown } | null)?.op
  if (op === 'inbox_triage') return buildInboxRequest(parseInboxOp(raw), model)
  if (op === 'match_rank') return buildMatchRequest(parseMatchOp(raw), model)
  return isTrolleyOp(raw) ? buildTrolleyRequest(parseTrolleyOp(raw), model) : buildRequest(parseOp(raw), model)
}

/** What the browser is told when TypeSafe says no. Never the upstream body: it can echo request details. */
function upstreamFailure(error: SystemOneError): Response {
  if (error.status === 429 || error.status === 529) return json({ error: 'Jev is busy right now. Try again in a moment.' }, 429, { 'Retry-After': '5' })
  if (error.status === 401 || error.status === 403) return json({ error: 'The server could not authenticate with Jev.' }, 502)
  return json({ error: 'Jev could not answer that request.' }, 502)
}

export async function handleJev(request: Request, env: JevEnv, limiter: RateLimiter = limiterFor(env)): Promise<Response> {
  const apiKey = env.TYPESAFE_API_KEY?.trim()
  const model = env.TYPESAFE_MODEL?.trim() || DEFAULT_MODEL

  if (request.method === 'GET') return json({ available: Boolean(apiKey), model })
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405, { Allow: 'GET, POST' })

  // Count every POST, valid or not: malformed floods are still floods.
  const rate = limiter.take(clientKey(request.headers))
  const rateHeaders = { 'X-RateLimit-Limit': String(rate.limit), 'X-RateLimit-Remaining': String(rate.remaining) }
  if (!rate.allowed) {
    return json({ error: `Too many requests. Try again in ${rate.retryAfter} s.` }, 429, { ...rateHeaders, 'Retry-After': String(rate.retryAfter) })
  }

  if (!apiKey) return json({ error: 'Jev is not configured on this server.' }, 503, rateHeaders)

  const declared = Number(request.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return json({ error: 'Request body too large' }, 413, rateHeaders)
  const text = await request.text()
  if (text.length > MAX_BODY_BYTES) return json({ error: 'Request body too large' }, 413, rateHeaders)

  let systemOneRequest: SystemOneRequest
  try {
    systemOneRequest = requestFor(JSON.parse(text), model)
  } catch (error) {
    if (
      error instanceof PlanValidationError ||
      error instanceof TrolleyValidationError ||
      error instanceof InboxValidationError ||
      error instanceof MatchValidationError ||
      error instanceof SyntaxError
    ) {
      return json({ error: `Invalid request: ${error instanceof SyntaxError ? 'body is not valid JSON' : error.message}` }, 400, rateHeaders)
    }
    return json({ error: 'Invalid request' }, 400, rateHeaders)
  }

  try {
    const result = await callSystemOne(systemOneRequest, { apiKey, baseUrl: env.TYPESAFE_BASE_URL?.trim() || undefined, signal: request.signal })
    // Only the documented fields go back — not whatever else upstream may add.
    return json({ model: result.model, answers: result.answers, usage: result.usage }, 200, rateHeaders)
  } catch (error) {
    if (error instanceof SystemOneError) return upstreamFailure(error)
    return json({ error: 'Jev could not be reached.' }, 502, rateHeaders)
  }
}
