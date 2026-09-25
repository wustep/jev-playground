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
  bach: 'd22aee2d48ad4328',
  beethoven: '43ceabac84717e66',
  chopin: '646dd69c58ec618d',
  debussy: 'a571f16fed3599c5',
  glass: '7ee41c57a4e51ff8',
  hans_zimmer: '5c1a7c17c9cd4727',
  laufey: '80eb08aa82844fb6',
  elijah_fox: 'c2ef22b8465d0088',
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
