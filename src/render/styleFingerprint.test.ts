import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { STYLE_IDS, type BarCount, type StyleId } from '../plan/schema'
import { HeuristicPlanner } from '../planner/HeuristicPlanner'
import { renderPlan, timeline } from './renderPlan'

/**
 * What every style renders to, hashed: the Score's notes and the timing they
 * are played with, over the heuristic stub's sampled plans.
 *
 * A change aimed at one style updates that style's line and no other; the
 * other seven are the proof it stayed in its lane. A change to a rule every
 * style shares updates every line it moves, and its commit says why.
 */
const FINGERPRINTS: Record<StyleId, string> = {
  bach: '30c2ba88a8180f68',
  beethoven: '82af9ee24368d3e6',
  chopin: 'ab4d8677e0daf38c',
  debussy: '9ebef731ae5690bf',
  glass: '657108fd6b60a732',
  hans_zimmer: 'cce7eebc8b67d26d',
  laufey: '51285ebd033376b8',
  elijah_fox: '9173ef6c40b9cf5d',
}

const SEEDS = 12
const LENGTHS: readonly BarCount[] = [8, 16]

async function fingerprint(style: StyleId): Promise<string> {
  const planner = new HeuristicPlanner()
  const hash = createHash('sha256')
  for (const bars of LENGTHS) {
    for (let seed = 1; seed <= SEEDS; seed++) {
      const { plan } = await planner.plan({ style, bars, pick: 'sample', seed, brief: true })
      const score = renderPlan(plan, seed)
      hash.update(JSON.stringify(score.bars.map((bar) => [bar.treble, bar.bass, bar.dynamic])))
      hash.update(`${score.pedal}|${score.articulation}`)
      hash.update(timeline(score).map((n) => `${n.midi}@${n.time.toFixed(4)}+${n.duration.toFixed(4)}v${n.velocity}`).join(','))
    }
  }
  return hash.digest('hex').slice(0, 16)
}

describe('style fingerprints', () => {
  it.each(STYLE_IDS)('%s renders as recorded', async (style) => {
    expect(await fingerprint(style)).toBe(FINGERPRINTS[style])
  })
})
