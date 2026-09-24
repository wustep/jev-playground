// Shared "distribution → decision" policy. Both planners hand code a
// probability map; code (not the model) decides how adventurous to be.

import type { Decision, PlanInput } from './Planner.js'

/** Small, fast, seedable PRNG (mulberry32). Returns floats in [0, 1). */
export function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function normalize<K extends string>(weights: Partial<Record<K, number>>): Record<K, number> {
  const entries = Object.entries(weights) as [K, number][]
  const total = entries.reduce((sum, [, w]) => sum + Math.max(0, w), 0) || 1
  return Object.fromEntries(entries.map(([k, w]) => [k, Math.max(0, w) / total])) as Record<K, number>
}

/** Cumulative probability kept when sampling; the rest is the long tail. */
export const TOP_P = 0.9

/**
 * Turn a distribution into one option.
 *
 * `sample` is nucleus sampling at face value: keep the most probable options
 * until they cover TOP_P of the mass, drop the tail, and draw from what is
 * left in proportion to the probabilities as given. (It used to square the
 * probabilities first. Live Jev turned out to be confident already — 90 %
 * "C minor" for Beethoven — and squaring that left no variety at all, while
 * on a genuinely open question like the next chord it threw away options the
 * model rated at 15–20 %.) The tail cut is what keeps a 1 % option from
 * hijacking the piece.
 */
export function pickFrom<K extends string>(
  probabilities: Record<K, number>,
  mode: PlanInput['pick'],
  random: () => number,
  allowed?: readonly K[],
): K {
  let entries = Object.entries(probabilities) as [K, number][]
  if (allowed) entries = entries.filter(([k]) => allowed.includes(k))
  if (entries.length === 0) throw new Error('pickFrom: empty distribution')
  if (mode === 'argmax') {
    return entries.reduce((best, entry) => (entry[1] > best[1] ? entry : best))[0]
  }
  const ranked = [...entries].sort((a, b) => b[1] - a[1])
  const mass = ranked.reduce((sum, [, p]) => sum + Math.max(0, p), 0)
  if (mass <= 0) return entries[0][0]
  const nucleus: [K, number][] = []
  let covered = 0
  for (const entry of ranked) {
    nucleus.push(entry)
    covered += Math.max(0, entry[1]) / mass
    if (covered >= TOP_P) break
  }
  const total = nucleus.reduce((sum, [, p]) => sum + Math.max(0, p), 0)
  let roll = random() * total
  for (const [k, p] of nucleus) {
    roll -= Math.max(0, p)
    if (roll <= 0) return k
  }
  return nucleus[nucleus.length - 1][0]
}

/**
 * Policy, not judgment: damp options the piece has already leaned on, so a
 * sampled progression keeps moving. `history` is what was chosen so far, most
 * recent last. The option just used is damped hardest; anything used more than
 * once a little. Returns a fresh, renormalised distribution.
 */
export function withNovelty<K extends string>(probabilities: Record<K, number>, history: readonly K[], options: { repeat?: number; overuse?: number } = {}): Record<K, number> {
  const repeat = options.repeat ?? 0.3
  const overuse = options.overuse ?? 0.75
  const last = history[history.length - 1]
  const counts = new Map<K, number>()
  for (const item of history) counts.set(item, (counts.get(item) ?? 0) + 1)
  const adjusted = Object.fromEntries(
    (Object.entries(probabilities) as [K, number][]).map(([k, p]) => {
      const used = counts.get(k) ?? 0
      return [k, p * (k === last ? repeat : 1) * (used > 1 ? overuse ** (used - 1) : 1)]
    }),
  ) as Record<K, number>
  return normalize(adjusted)
}

/** Confidence for distributions that don't come with one: top-two margin. */
export function marginConfidence(probabilities: Record<string, number>): number {
  const sorted = Object.values(probabilities).sort((a, b) => b - a)
  if (sorted.length < 2) return 1
  return Math.max(0, Math.min(1, sorted[0] - sorted[1]))
}

export function decision(
  field: string,
  choice: string,
  probabilities: Record<string, number>,
  confidence = marginConfidence(probabilities),
): Decision {
  return { field, choice, confidence, probabilities }
}
