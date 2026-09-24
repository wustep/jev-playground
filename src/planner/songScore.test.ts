import { describe, expect, it } from 'vitest'
import { barPositions } from '../plan/phrase'
import type { BarPlan, CompositionPlan, ContourId } from '../plan/schema'
import { HeuristicPlanner } from './HeuristicPlanner'
import { buildRequest, describePlan, SONG_SCORE_QUESTION_ID } from './jev/requests'
import { arrangementCueHigh, breathCueHigh, heuristicSongQuality, returnCueHigh, songQualityCues, summitCueHigh } from './songScore'

const barsOf = (count = 16, contour: ContourId = 'arch'): BarPlan[] => Array.from({ length: count }, () => ({ chord: 'I', contour }))

function plan(overrides: Partial<CompositionPlan> = {}): CompositionPlan {
  return {
    version: 2,
    style: 'chopin',
    register: 'high',
    motion: 'flowing',
    accompaniment: 'broken',
    form: 'period',
    key: 'Db_major',
    meter: 'twelve_eight',
    palette: 'chromatic_approach',
    tempo: 'andante',
    dynamics: 'p',
    dynamicShape: 'arch',
    bars: barsOf(),
    ...overrides,
  }
}

/** No tune at all: a second line of equal weight, running as fast as the first. */
const etudePlan = () => plan({ style: 'bach', motion: 'florid', accompaniment: 'counterline', form: 'chain', dynamicShape: 'steady' })

/** A returning layout, but a line too busy to breathe over a peer voice. */
const piecePlan = () => plan({ style: 'bach', motion: 'florid', accompaniment: 'counterline', form: 'period', dynamicShape: 'steady' })

/** Song-shaped: a singing line over support, and a form that brings it back once, literally. */
const songShapedPlan = () => plan({ form: 'period', motion: 'walking', accompaniment: 'broken', dynamicShape: 'steady', bars: barsOf(8) })

/** A song in new clothes: song-shaped, an ornamented return and a late summit. */
const dressedSongPlan = () => plan({ form: 'arch', motion: 'walking', accompaniment: 'broken', dynamicShape: 'arch' })

describe('heuristicSongQuality cues', () => {
  it('reads the fields that decide the sound', () => {
    expect(breathCueHigh(etudePlan()), 'a florid peer line is not a tune that breathes').toBe(false)
    expect(breathCueHigh(songShapedPlan())).toBe(true)
    expect(returnCueHigh(etudePlan()), 'a chain brings nothing back').toBe(false)
    expect(returnCueHigh(piecePlan()), 'a period does').toBe(true)
    expect(arrangementCueHigh(songShapedPlan()), 'an eight-bar period answers itself literally').toBe(false)
    expect(arrangementCueHigh(dressedSongPlan())).toBe(true)
  })

  it('climbs from étude to dressed song', () => {
    const cues = [etudePlan, piecePlan, songShapedPlan, dressedSongPlan].map((make) => songQualityCues(make()))
    expect(cues[0]).toBeLessThan(cues[1])
    expect(cues[1]).toBeLessThan(cues[2])
    expect(cues[2]).toBeLessThanOrEqual(cues[3])
    expect(heuristicSongQuality(etudePlan()).raw).toBe(0)
    expect(heuristicSongQuality(dressedSongPlan()).raw).toBe(3)
  })

  it('puts the summit late, and only once', () => {
    const dressed = dressedSongPlan()
    expect(summitCueHigh(dressed)).toBe(true)
    const climaxes = barPositions(dressed.form, 16).filter((position) => position.role === 'climax')
    expect(climaxes).toHaveLength(1)
    expect(summitCueHigh(plan({ dynamicShape: 'steady', form: 'chain' }))).toBe(false)
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
  it('is four standalone levels, written in the fields that reach the notes', () => {
    const request = buildRequest({ op: 'score', plan: dressedSongPlan(), styles: ['chopin'] }, 'jev-latest')
    const song = request.questions[SONG_SCORE_QUESTION_ID]
    expect(song.type).toBe('score')
    if (song.type !== 'score') return
    expect(song.criteria).toHaveLength(4)
    expect(String(song.instructions)).toContain('Do not imagine notes, rests, MIDI')
    const text = JSON.stringify([song.instructions, song.criteria])
    // The criteria must not describe vocabulary the schema no longer has.
    for (const dead of ['texture', 'arrangement', 'opening', 'character', 'hook']) expect(text.toLowerCase()).not.toContain(dead)
    for (const name of ['Bach', 'Beethoven', 'Debussy', 'Chopin', 'Zimmer', 'Satie', 'Reich']) expect(text).not.toContain(name)
  })
})

describe('describePlan', () => {
  it('describes the piece by what a listener would hear, never by enum id', () => {
    const described = describePlan(plan()) as Record<string, unknown>
    expect(described).toHaveProperty('melody_register')
    expect(described).toHaveProperty('melody_motion')
    expect(described).toHaveProperty('accompaniment')
    expect(String(described.melody_register)).toContain('high')
    // Ids mean nothing to the model; state carries the descriptions.
    expect(Object.values(described).some((value) => value === 'high')).toBe(false)
  })

  it('carries a role per bar, derived from the form, which the plan no longer stores', () => {
    const described = describePlan(plan({ form: 'period' })) as { bars: { bar: number; role: string }[] }
    expect(described.bars).toHaveLength(16)
    expect(described.bars[3].role).toMatch(/pause|close/)
    expect(described.bars.every((bar) => typeof bar.role === 'string' && bar.role.length > 0)).toBe(true)
  })
})
