// Shared "distribution → decision" policy. Both planners hand code a
// probability map; code (not the model) decides how adventurous to be.

import type { Decision, PlanInput } from './Planner'

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

/**
 * Turn a distribution into one option.
 * Sampling squares the probabilities first (temperature 0.5): a calibrated
 * 60/30/10 split becomes roughly 78/19/2, which keeps variety without letting
 * long-tail options the model barely believes in hijack the piece.
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
  const sharpened = entries.map(([k, p]) => [k, p * p] as const)
  const total = sharpened.reduce((sum, [, p]) => sum + p, 0)
  if (total <= 0) return entries[0][0]
  let roll = random() * total
  for (const [k, p] of sharpened) {
    roll -= p
    if (roll <= 0) return k
  }
  return sharpened[sharpened.length - 1][0]
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
