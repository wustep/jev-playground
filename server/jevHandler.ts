// /api/jev — keeps TYPESAFE_API_KEY off the client.
//
// One implementation, two hosts: the Vercel function (api/jev.ts) and the Vite
// dev middleware (vite.config.ts) both call handleJev() with Web-standard
// Request/Response objects.
//
// It is deliberately NOT a generic passthrough: the body is a typed JevOp that
// is re-validated against the plan enums, and the actual state/questions are
// rebuilt here. A stranger with the URL can only ask this app's questions.

import { PlanValidationError } from '../src/plan/schema.js'
import { buildRequest, parseOp } from '../src/planner/jev/requests.js'
import { callSystemOne, DEFAULT_MODEL, SystemOneError } from '../src/planner/jev/systemOne.js'

export interface JevEnv {
  TYPESAFE_API_KEY?: string
  TYPESAFE_BASE_URL?: string
  TYPESAFE_MODEL?: string
}

const MAX_BODY_BYTES = 16_000

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })

export async function handleJev(request: Request, env: JevEnv): Promise<Response> {
  const apiKey = env.TYPESAFE_API_KEY?.trim()
  const model = env.TYPESAFE_MODEL?.trim() || DEFAULT_MODEL

  if (request.method === 'GET') return json({ available: Boolean(apiKey), model })
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  if (!apiKey) return json({ error: 'TYPESAFE_API_KEY is not configured on the server' }, 503)

  const text = await request.text()
  if (text.length > MAX_BODY_BYTES) return json({ error: 'Request body too large' }, 413)

  try {
    const op = parseOp(JSON.parse(text))
    const result = await callSystemOne(buildRequest(op, model), {
      apiKey,
      baseUrl: env.TYPESAFE_BASE_URL?.trim() || undefined,
      signal: request.signal,
    })
    return json(result)
  } catch (error) {
    if (error instanceof PlanValidationError || error instanceof SyntaxError) {
      return json({ error: `Invalid request: ${error.message}` }, 400)
    }
    if (error instanceof SystemOneError) {
      // Surface upstream status (401 bad key, 429 rate limit, …) without the key.
      return json({ error: error.message }, error.status >= 400 && error.status < 600 ? error.status : 502)
    }
    return json({ error: 'Upstream request failed' }, 502)
  }
}
