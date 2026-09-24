// Fixed-window request counter per client, for /api/jev.
//
// BEST-EFFORT BY DESIGN: the counts live in this module's memory. On Vercel
// each warm function instance has its own copy and a cold start begins at
// zero, so a determined client spread across instances can exceed the limit.
// That is acceptable for what this protects — a demo's TypeSafe bill against
// casual abuse and runaway loops. A hard guarantee needs a shared store
// (Vercel KV / Upstash); none is configured for this project, and this repo
// deliberately does not add an unconfigured paid dependency.

export interface RateLimitResult {
  allowed: boolean
  limit: number
  remaining: number
  /** Whole seconds until the window resets (≥ 1 when blocked). */
  retryAfter: number
}

export interface RateLimiter {
  take(key: string, now?: number): RateLimitResult
}

/**
 * A live plan is one globals request plus one per four-bar phrase — five at 16
 * bars, seventeen at 64 — and one score. 90 a minute is fifteen 16-bar pieces
 * or five 64-bar ones.
 */
export const DEFAULT_LIMIT_PER_MINUTE = 90
const WINDOW_MS = 60_000
/** Cap on tracked clients, so the map itself can't be used to exhaust memory. */
const MAX_CLIENTS = 5_000

export function createRateLimiter(limit = DEFAULT_LIMIT_PER_MINUTE, windowMs = WINDOW_MS): RateLimiter {
  const windows = new Map<string, { start: number; count: number }>()
  return {
    take(key, now = Date.now()) {
      let entry = windows.get(key)
      if (!entry || now - entry.start >= windowMs) {
        if (windows.size >= MAX_CLIENTS) {
          for (const [client, seen] of windows) if (now - seen.start >= windowMs) windows.delete(client)
          if (windows.size >= MAX_CLIENTS) windows.clear()
        }
        entry = { start: now, count: 0 }
        windows.set(key, entry)
      }
      const retryAfter = Math.max(1, Math.ceil((entry.start + windowMs - now) / 1000))
      if (entry.count >= limit) return { allowed: false, limit, remaining: 0, retryAfter }
      entry.count += 1
      return { allowed: true, limit, remaining: limit - entry.count, retryAfter }
    },
  }
}

/**
 * The caller's address, from headers the platform sets.
 * `x-vercel-forwarded-for` and `x-real-ip` are written by Vercel's edge and
 * overwrite anything the client sent; the left-most `x-forwarded-for` entry is
 * only a fallback for local dev, where spoofing doesn't matter.
 */
export function clientKey(headers: Headers): string {
  const first = (value: string | null) => value?.split(',')[0]?.trim() || undefined
  return first(headers.get('x-vercel-forwarded-for')) ?? first(headers.get('x-real-ip')) ?? first(headers.get('x-forwarded-for')) ?? 'unknown'
}
