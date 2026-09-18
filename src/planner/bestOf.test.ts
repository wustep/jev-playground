import { describe, expect, it } from 'vitest'
import { STYLE_IDS, type StyleId, type StyleMatchScore } from '../plan/schema'
import { HeuristicPlanner } from './HeuristicPlanner'
import {
  BEST_OF_N,
  SONG_QUALITY_MID,
  SONG_QUALITY_WEIGHT,
  contrastiveScore,
  dualObjective,
  pickBestIndex,
  selectBestOfN,
  styleMatchValue,
} from './bestOf'
import type { Planner, ScoreResult } from './Planner'

function match(raw: number, level: StyleMatchScore['match'] = 'medium'): StyleMatchScore {
  return { match: level, confidence: 0.7, raw }
}

function scores(partial: Partial<Record<StyleId, number>>): Partial<Record<StyleId, StyleMatchScore>> {
  return Object.fromEntries(Object.entries(partial).map(([id, raw]) => [id, match(raw as number)])) as Partial<
    Record<StyleId, StyleMatchScore>
  >
}

describe('styleMatchValue', () => {
  it('reads StyleMatchScore.raw and rejects missing or NaN', () => {
    expect(styleMatchValue(match(1.4))).toBe(1.4)
    expect(styleMatchValue(undefined)).toBeNull()
    expect(styleMatchValue(match(Number.NaN))).toBeNull()
  })
})

describe('contrastiveScore', () => {
  it('is target raw minus the strongest other style', () => {
    expect(contrastiveScore(scores({ bach: 1.8, beethoven: 1.1, chopin: 0.4 }), 'bach')).toBeCloseTo(0.7)
    expect(contrastiveScore(scores({ bach: 1.2, beethoven: 1.9, chopin: 0.3 }), 'bach')).toBeCloseTo(-0.7)
  })

  it('treats a missing field of others as absent, not zero, and missing target as null', () => {
    expect(contrastiveScore(scores({ bach: 1.5 }), 'bach')).toBeCloseTo(1.5)
    expect(contrastiveScore(scores({ beethoven: 2 }), 'bach')).toBeNull()
  })

  it('uses raw, not the coarse match label', () => {
    const highVsHigher = {
      bach: { match: 'high' as const, confidence: 0.9, raw: 1.6 },
      glass: { match: 'high' as const, confidence: 0.9, raw: 1.95 },
    }
    expect(contrastiveScore(highVsHigher, 'bach')).toBeCloseTo(-0.35)
  })
})

describe('dualObjective', () => {
  it('matches the Appendix B.4 worked examples', () => {
    expect(SONG_QUALITY_WEIGHT).toBe(0.45)
    expect(SONG_QUALITY_MID).toBe(1.5)
    expect(dualObjective(0.9, 0)).toBeCloseTo(0.225)
    expect(dualObjective(0.4, 3)).toBeCloseTo(1.075)
    expect(dualObjective(-1, 3)).toBeCloseTo(-0.325)
    expect(dualObjective(0.5, 3)).toBeCloseTo(1.175)
    expect(dualObjective(0.5, 1)).toBeCloseTo(0.275)
  })

  it('fails open to style contrast when song_quality is missing', () => {
    expect(dualObjective(0.7, null)).toBeCloseTo(0.7)
    expect(dualObjective(0.7, Number.NaN)).toBeCloseTo(0.7)
    expect(dualObjective(null, 3)).toBeNull()
    expect(dualObjective(Number.NaN, 3)).toBeNull()
  })

  it('lets a milder song beat an on-style étude, not a wrong-style song', () => {
    const etude = dualObjective(0.9, 0)!
    const milderSong = dualObjective(0.4, 3)!
    const wrongStyleSong = dualObjective(-1, 3)!
    expect(milderSong).toBeGreaterThan(etude)
    expect(etude).toBeGreaterThan(wrongStyleSong)
  })
})

describe('pickBestIndex', () => {
  it('keeps the first of a tie and skips nulls', () => {
    expect(pickBestIndex([0.2, 0.9, 0.4])).toBe(1)
    expect(pickBestIndex([0.5, 0.5, 0.1])).toBe(0)
    expect(pickBestIndex([null, 0.1, 0.8, null])).toBe(2)
    expect(pickBestIndex([null, Number.NaN])).toBe(-1)
  })

  it('picks the highest dualObjective, not the highest style contrast alone', () => {
    const totals = [dualObjective(0.9, 0), dualObjective(0.4, 3), dualObjective(-1, 3)]
    expect(pickBestIndex(totals)).toBe(1)
  })
})

function scriptedScorer(
  rawByCall: Array<Partial<Record<StyleId, number>>>,
  songs: Array<number | undefined> = [],
): Planner {
  let call = 0
  return {
    id: 'jev',
    label: 'scripted',
    plan: async () => {
      throw new Error('plan() must not run on the critic scorer')
    },
    score: async (): Promise<ScoreResult> => {
      const raws = rawByCall[call] ?? rawByCall[rawByCall.length - 1]
      const songRaw = songs[call]
      call += 1
      return {
        scores: scores(raws),
        songQuality: songRaw != null ? { raw: songRaw, confidence: 0.7 } : undefined,
        exchanges: [],
      }
    },
  }
}

describe('selectBestOfN', () => {
  const planner = new HeuristicPlanner()
  const base = { style: 'bach' as const, bars: 8 as const, pick: 'sample' as const, brief: true }

  it('samples N heuristic plans and keeps the max contrastive score', async () => {
    const picked = await selectBestOfN({
      input: base,
      n: 3,
      seeds: [1, 2, 3],
      planner,
      fallback: planner,
      scorer: scriptedScorer([
        { bach: 1.1, beethoven: 1.0 },
        { bach: 1.8, beethoven: 0.2 },
        { bach: 1.4, beethoven: 0.9 },
      ]),
    })
    expect(picked.n).toBe(3)
    expect(picked.index).toBe(1)
    expect(picked.winner.seed).toBe(2)
    expect(picked.winner.contrast).toBeCloseTo(1.6)
    expect(picked.winner.total).toBeCloseTo(1.6)
    expect(picked.scoredWith).toBe('jev')
    expect(picked.winner.result.plan.style).toBe('bach')
    expect(picked.winner.result.trace.planner).toBe('heuristic')
  })

  it('falls back to the heuristic score when Jev score throws', async () => {
    const failing: Planner = {
      id: 'jev',
      label: 'down',
      plan: async () => {
        throw new Error('unused')
      },
      score: async () => {
        throw new Error('429')
      },
    }
    const picked = await selectBestOfN({
      input: base,
      n: 2,
      seeds: [4, 5],
      planner,
      scorer: failing,
      fallback: planner,
    })
    expect(picked.scoredWith).toBe('heuristic')
    expect(picked.winner.contrast).not.toBeNull()
    expect(STYLE_IDS.every((id) => picked.winner.scores.scores[id])).toBe(true)
    expect(picked.winner.scores.songQuality).toBeDefined()
  })

  it('defaults to BEST_OF_N distinct sampled seeds', async () => {
    const seen = new Set<number>()
    const recording: Planner = {
      id: 'heuristic',
      label: 'record',
      plan: async (input) => {
        seen.add(input.seed)
        expect(input.pick).toBe('sample')
        return planner.plan(input)
      },
      score: (plan, styles) => planner.score(plan, styles),
    }
    const picked = await selectBestOfN({ input: base, planner: recording, fallback: planner })
    expect(picked.n).toBe(BEST_OF_N)
    expect(seen.size).toBe(BEST_OF_N)
    expect(BEST_OF_N).toBe(5)
  })

  it('picks a milder song over an on-style étude, and keeps the étude over a wrong-style song', async () => {
    const songVsEtude = await selectBestOfN({
      input: base,
      n: 2,
      seeds: [1, 2],
      planner,
      fallback: planner,
      scorer: scriptedScorer(
        [
          { bach: 1.9, beethoven: 1.0 },
          { bach: 1.4, beethoven: 1.0 },
        ],
        [0, 3],
      ),
    })
    expect(songVsEtude.index).toBe(1)
    expect(songVsEtude.winner.contrast).toBeCloseTo(0.4)
    expect(songVsEtude.winner.song).toBe(3)
    expect(songVsEtude.winner.total).toBeCloseTo(1.075)

    const etudeVsWrong = await selectBestOfN({
      input: base,
      n: 2,
      seeds: [1, 2],
      planner,
      fallback: planner,
      scorer: scriptedScorer(
        [
          { bach: 1.9, beethoven: 1.0 },
          { bach: 0.2, beethoven: 1.2 },
        ],
        [0, 3],
      ),
    })
    expect(etudeVsWrong.index).toBe(0)
    expect(etudeVsWrong.winner.contrast).toBeCloseTo(0.9)
    expect(etudeVsWrong.winner.total).toBeCloseTo(0.225)
  })
})
