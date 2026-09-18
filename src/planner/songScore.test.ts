import { describe, expect, it } from 'vitest'
import { formRoles } from '../plan/forms'
import type { BarPlan, CompositionPlan, ContourId } from '../plan/schema'
import { HeuristicPlanner } from './HeuristicPlanner'
import { buildRequest, SONG_SCORE_QUESTION_ID } from './jev/requests'
import { heuristicSongQuality, longestReturnRun } from './songScore'

const barsOf = (form: CompositionPlan['form'], contour: ContourId = 'arch'): BarPlan[] =>
  formRoles(form, 16).map((role) => ({ chord: 'I', role, contour }))

function songPlan(overrides: Partial<CompositionPlan> = {}): CompositionPlan {
  const form = overrides.form ?? 'period'
  return {
    version: 1,
    style: 'chopin',
    character: 'lyrical_song',
    form,
    key: 'Db_major',
    meter: 'twelve_eight',
    texture: 'rolling_nocturne',
    palette: 'chromatic_approach',
    tempo: 'andante',
    dynamics: 'p',
    dynamicShape: 'arch',
    defaultInstrument: 'grand_piano',
    arrangement: 'lift_on_return',
    opening: 'pickup',
    bars: barsOf(form),
    ...overrides,
  }
}

function etudePlan(overrides: Partial<CompositionPlan> = {}): CompositionPlan {
  const form = overrides.form ?? 'free_fantasia'
  return {
    version: 1,
    style: 'bach',
    character: 'flowing_perpetual',
    form,
    key: 'C_major',
    meter: 'four_four',
    texture: 'toccata_perpetual',
    palette: 'diatonic',
    tempo: 'allegro',
    dynamics: 'mf',
    dynamicShape: 'steady',
    defaultInstrument: 'harpsichord',
    arrangement: 'constant',
    opening: 'straight_in',
    bars: barsOf(form),
    ...overrides,
  }
}

describe('heuristicSongQuality', () => {
  it('scores a song-shaped plan high and a perpetual étude low', () => {
    const song = heuristicSongQuality(songPlan())
    const etude = heuristicSongQuality(etudePlan())
    expect(longestReturnRun(songPlan())).toBeGreaterThanOrEqual(3)
    expect(longestReturnRun(etudePlan())).toBe(0)
    expect(song.match).toBe('high')
    expect(etude.match).toBe('low')
    expect(song.raw).toBeGreaterThan(etude.raw + 0.8)
  })

  it('is deterministic from plan features', () => {
    const a = heuristicSongQuality(songPlan())
    const b = heuristicSongQuality(songPlan())
    expect(a).toEqual(b)
  })
})

describe('HeuristicPlanner.score song', () => {
  it('returns a song Score on the same score op as the style matches', async () => {
    const planner = new HeuristicPlanner()
    const { plan } = await planner.plan({ style: 'chopin', bars: 16, pick: 'argmax', seed: 1, brief: true })
    const { scores, song, exchanges } = await planner.score(plan, ['chopin', 'bach'])
    expect(scores.chopin).toBeDefined()
    expect(song).toEqual(heuristicSongQuality(plan))
    expect(exchanges[0].op.op).toBe('score')
    expect(exchanges[0].request.questions).toHaveProperty(SONG_SCORE_QUESTION_ID)
  })
})

describe('song Score question', () => {
  it('lives on the score op and encodes the Fable song cues', () => {
    const request = buildRequest({ op: 'score', plan: songPlan(), styles: ['chopin'] }, 'jev-latest')
    const song = request.questions[SONG_SCORE_QUESTION_ID]
    expect(song.type).toBe('score')
    if (song.type !== 'score') return
    expect(song.criteria).toHaveLength(3)
    const text = JSON.stringify([song.instructions, song.criteria])
    expect(text).toMatch(/phrase-length|phrase layout|returns?/i)
    expect(text).toMatch(/vamp|pickup/i)
    expect(text).toMatch(/arrangement/i)
    expect(text).toMatch(/arch|late surge/i)
    expect(text).toMatch(/étude|etude/i)
    expect(Object.keys(request.questions)).toContain('match_chopin')
    for (const name of ['Bach', 'Beethoven', 'Debussy', 'Glass', 'Laufey', 'Fox', 'Chopin', 'Zimmer', 'Satie', 'Reich']) {
      expect(text).not.toContain(name)
    }
  })
})
