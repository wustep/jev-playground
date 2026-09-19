import { describe, expect, it } from 'vitest'
import { formRoles } from '../plan/forms'
import { ARRANGEMENTS, OPENINGS, PHRASINGS, defaultPhrasing, type BarPlan, type CompositionPlan, type ContourId } from '../plan/schema'
import { HeuristicPlanner } from './HeuristicPlanner'
import { buildRequest, describePlan, SONG_SCORE_QUESTION_ID } from './jev/requests'
import {
  arrangementCueHigh,
  breathCueHigh,
  heuristicSongQuality,
  returnCueHigh,
  songQualityCues,
  summitCueHigh,
} from './songScore'

const barsOf = (form: CompositionPlan['form'], contour: ContourId = 'arch'): BarPlan[] =>
  formRoles(form, 16).map((role) => ({ chord: 'I', role, contour }))

function plan(overrides: Partial<CompositionPlan> = {}): CompositionPlan {
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

/** Étude: motor character, unbroken figuration, straight-in, constant, no return, no late peak. */
function etudePlan(): CompositionPlan {
  return plan({
    style: 'bach',
    character: 'flowing_perpetual',
    form: 'free_fantasia',
    texture: 'toccata_perpetual',
    dynamicShape: 'steady',
    arrangement: 'constant',
    opening: 'straight_in',
    bars: barsOf('free_fantasia').map((bar) => ({ ...bar, role: bar.role === 'climax' ? 'development' : bar.role })),
  })
}

/** A piece, not a song: returning form, but cues fight (perpetual + constant + straight-in). */
function piecePlan(): CompositionPlan {
  return plan({
    style: 'bach',
    character: 'flowing_perpetual',
    form: 'period',
    texture: 'toccata_perpetual',
    dynamicShape: 'steady',
    arrangement: 'constant',
    opening: 'straight_in',
    bars: barsOf('period').map((bar) => ({ ...bar, role: bar.role === 'climax' ? 'development' : bar.role })),
  })
}

/** Song-shaped: phrase return + singing line + pickup; arrangement still constant. */
function songShapedPlan(): CompositionPlan {
  return plan({
    arrangement: 'constant',
    dynamicShape: 'steady',
    form: 'period',
    bars: formRoles('period', 8).map((role) => ({
      chord: 'I',
      role: role === 'climax' ? 'development' : role,
      contour: 'arch' as const,
    })),
  })
}

/** Song in new clothes: song-shaped + lift + late summit. */
function dressedSongPlan(): CompositionPlan {
  return plan({
    arrangement: 'lift_on_return',
    opening: 'pickup',
    dynamicShape: 'arch',
    form: 'period',
    bars: formRoles('period', 8).map((role) => ({ chord: 'I', role, contour: 'arch' as const })),
  })
}

describe('heuristicSongQuality (Appendix B.2 cues)', () => {
  it('maps 0 / 1 / 2 / 3–4 high cues onto raw 0–3', () => {
    expect(songQualityCues(etudePlan())).toBe(0)
    expect(heuristicSongQuality(etudePlan()).raw).toBe(0)
    expect(breathCueHigh(etudePlan())).toBe(false)
    expect(returnCueHigh(etudePlan())).toBe(false)
    expect(arrangementCueHigh(etudePlan())).toBe(false)
    expect(summitCueHigh(etudePlan())).toBe(false)

    expect(songQualityCues(piecePlan())).toBe(1)
    expect(heuristicSongQuality(piecePlan()).raw).toBe(1)
    expect(returnCueHigh(piecePlan())).toBe(true)

    expect(songQualityCues(songShapedPlan())).toBe(2)
    expect(heuristicSongQuality(songShapedPlan()).raw).toBe(2)
    expect(breathCueHigh(songShapedPlan())).toBe(true)
    expect(returnCueHigh(songShapedPlan())).toBe(true)
    expect(arrangementCueHigh(songShapedPlan())).toBe(false)

    expect(songQualityCues(dressedSongPlan())).toBeGreaterThanOrEqual(3)
    expect(heuristicSongQuality(dressedSongPlan()).raw).toBe(3)
    expect(arrangementCueHigh(dressedSongPlan())).toBe(true)
    expect(summitCueHigh(dressedSongPlan())).toBe(true)
  })

  it('treats a loop with a tune on top as a return cue, not an automatic étude', () => {
    const loopSong = plan({
      style: 'hans_zimmer',
      character: 'hypnotic_pulse',
      form: 'additive_loop',
      texture: 'melody_over_ostinato',
      arrangement: 'peak_then_bare',
      opening: 'vamp_intro',
      dynamicShape: 'late_surge',
    })
    expect(returnCueHigh(loopSong)).toBe(true)
    expect(breathCueHigh(loopSong)).toBe(true)
    expect(heuristicSongQuality(loopSong).raw).toBe(3)
  })

  it('is deterministic from plan features', () => {
    expect(heuristicSongQuality(dressedSongPlan())).toEqual(heuristicSongQuality(dressedSongPlan()))
  })
})

describe('HeuristicPlanner.score song_quality', () => {
  it('returns song_quality on the same score op as the style matches', async () => {
    const planner = new HeuristicPlanner()
    const { plan: made } = await planner.plan({ style: 'chopin', bars: 16, pick: 'argmax', seed: 1, brief: true })
    const { scores, songQuality, exchanges } = await planner.score(made, ['chopin', 'bach'])
    expect(scores.chopin).toBeDefined()
    expect(songQuality).toEqual(heuristicSongQuality(made))
    expect(exchanges[0].op.op).toBe('score')
    expect(exchanges[0].request.questions).toHaveProperty(SONG_SCORE_QUESTION_ID)
  })
})

describe('song_quality Score question', () => {
  it('is the locked Appendix B.3 wording, four levels, no composer names', () => {
    const request = buildRequest({ op: 'score', plan: dressedSongPlan(), styles: ['chopin'] }, 'jev-latest')
    const song = request.questions[SONG_SCORE_QUESTION_ID]
    expect(song.type).toBe('score')
    if (song.type !== 'score') return
    expect(song.criteria).toHaveLength(4)
    expect(String(song.instructions)).toContain('Do not imagine notes, rests, MIDI')
    expect(song.criteria[0]).toMatch(/^Étude \/ perpetual study/)
    expect(song.criteria[1]).toMatch(/^A finished piece, not yet a song/)
    expect(song.criteria[2]).toMatch(/^Song-shaped/)
    expect(song.criteria[3]).toMatch(/^A song that returns in new clothes/)
    const text = JSON.stringify([song.instructions, song.criteria])
    for (const name of ['Bach', 'Beethoven', 'Debussy', 'Glass', 'Laufey', 'Fox', 'Chopin', 'Zimmer', 'Satie', 'Reich']) {
      expect(text).not.toContain(name)
    }
  })
})

describe('describePlan arrangement and opening', () => {
  it('always emits arrangement and opening, defaulting like parseGlobals', () => {
    const bare = plan()
    delete bare.arrangement
    delete bare.opening
    const described = describePlan(bare) as { arrangement: string; opening: string; phrasing: string }
    expect(described.arrangement).toBe(ARRANGEMENTS.lift_on_return)
    expect(described.opening).toBe(OPENINGS.straight_in)
    expect(described.phrasing).toBe(PHRASINGS[defaultPhrasing(bare.character)])
  })
})
