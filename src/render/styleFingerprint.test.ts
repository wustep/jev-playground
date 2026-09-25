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
  bach: '218c901f8c462d66',
  beethoven: '43a7e836bee05b63',
  chopin: '42f6dedc7cd4828e',
  debussy: 'b737a4d23680c377',
  glass: 'fc398c9408929973',
  hans_zimmer: '93b1b3168344737a',
  laufey: '99ad5c4ddaae97d4',
  elijah_fox: '7e2dddfbd2a79f9d',
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
