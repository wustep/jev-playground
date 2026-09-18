import { describe, expect, it } from 'vitest'
import { STYLE_IDS } from '../plan/schema'
import { HeuristicPlanner } from './HeuristicPlanner'

/** Thin #5: 8×8 confusion of heuristic score over a handful of seeds. */
describe('style confusion (heuristic)', () => {
  it('usually scores a plan as its own style across seeds', async () => {
    const seeds = 8
    const planner = new HeuristicPlanner()
    const counts = Object.fromEntries(STYLE_IDS.map((style) => [style, Object.fromEntries(STYLE_IDS.map((other) => [other, 0]))])) as Record<
      string,
      Record<string, number>
    >

    for (const style of STYLE_IDS) {
      for (let seed = 1; seed <= seeds; seed++) {
        const { plan } = await planner.plan({ style, bars: 8, pick: 'sample', seed, brief: true })
        const { scores } = await planner.score(plan, STYLE_IDS)
        const best = STYLE_IDS.reduce((lead, other) => ((scores[other]?.raw ?? 0) > (scores[lead]?.raw ?? 0) ? other : lead))
        counts[style][best] += 1
      }
    }

    const header = ['from\\as', ...STYLE_IDS].join('\t')
    const rows = STYLE_IDS.map((style) => [style, ...STYLE_IDS.map((other) => counts[style][other])].join('\t'))
    // Visible in vitest output when this file is run alone.
    console.log(['', header, ...rows].join('\n'))

    for (const style of STYLE_IDS) {
      const own = counts[style][style]
      const bestOther = Math.max(...STYLE_IDS.filter((other) => other !== style).map((other) => counts[style][other]))
      expect(own, `${style} diagonal`).toBeGreaterThanOrEqual(bestOther)
      expect(own, `${style} own-style hits`).toBeGreaterThanOrEqual(Math.ceil(seeds / 2))
    }
  })
})
