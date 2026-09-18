import { describe, expect, it } from 'vitest'
import { formRoles } from '../plan/forms'
import type { ChordId, CompositionPlan, ContourId } from '../plan/schema'
import { introBarCount, openingOf } from './framing'
import { renderPlan, scoreDuration, timeline } from './renderPlan'

const CONTOURS: ContourId[] = ['arch', 'leap_fall', 'wave', 'rise']
function songPlan(overrides: Partial<CompositionPlan> = {}): CompositionPlan {
  const chords: ChordId[] = ['I', 'vi', 'ii6', 'V', 'I', 'vi', 'ii6', 'I', 'IV', 'ii', 'V7_of_V', 'V', 'I', 'vi', 'V7', 'I']
  const roles = formRoles('period', 16)
  return {
    version: 1,
    style: 'chopin',
    character: 'lyrical_song',
    form: 'period',
    key: 'C_major',
    meter: 'four_four',
    texture: 'alberti_melody',
    palette: 'diatonic',
    tempo: 'adagio',
    dynamics: 'p',
    dynamicShape: 'steady',
    defaultInstrument: 'grand_piano',
    bars: chords.map((chord, i) => ({ chord, role: roles[i], contour: CONTOURS[i % 4] })),
    ...overrides,
  }
}

describe('opening bar-count contract', () => {
  it('leaves a 16-bar plan at 16 score bars when the opening is straight_in or omitted', () => {
    expect(openingOf(songPlan())).toBe('straight_in')
    expect(introBarCount('straight_in', 16)).toBe(0)
    expect(renderPlan(songPlan(), 2).bars).toHaveLength(16)
    expect(renderPlan(songPlan(), 2).introBars).toBe(0)
  })

  it('prepends extra Score.bars for a vamp or pickup without rewriting the plan', () => {
    const vamp = renderPlan(songPlan({ opening: 'vamp_intro' }), 2)
    const pickup = renderPlan(songPlan({ opening: 'pickup' }), 2)
    expect(vamp.plan.bars).toHaveLength(16)
    expect(vamp.introBars).toBe(2)
    expect(vamp.bars).toHaveLength(18)
    expect(pickup.introBars).toBe(1)
    expect(pickup.bars).toHaveLength(17)
    // Vamp: accompaniment, no sung line on the extra bars.
    expect(vamp.bars[0].treble.length).toBeLessThanOrEqual(1)
    expect(vamp.bars[0].bass.length).toBeGreaterThan(0)
    // Pickup: short notes late in the bar, stepping toward the first downbeat.
    const pickupVoice = pickup.bars[0].treble[0]
    expect(pickupVoice?.length).toBeGreaterThan(0)
    expect(pickupVoice.every((n) => n.start >= pickup.meter.ticksPerBar - 6)).toBe(true)
    const firstBody = pickup.bars[1].treble[0][0]
    expect(firstBody).toBeTruthy()
  })
})

describe('ending air', () => {
  it('rolls the last sonority, rests the last beat, and stretches the cadence', () => {
    const score = renderPlan(songPlan({ opening: 'straight_in' }), 3)
    const last = score.bars[score.bars.length - 1]
    expect(score.ritardando).toBe(true)
    const lastNotes = [...last.treble, ...last.bass].flat()
    expect(lastNotes.some((n) => n.roll)).toBe(true)
    const melody = last.treble[0]
    expect(melody.every((n) => n.start + n.dur <= score.meter.ticksPerBar - score.meter.beatTicks + 0.01)).toBe(true)
    const notes = timeline(score)
    const lastBar = notes.filter((n) => n.bar === last.index)
    const earlier = notes.filter((n) => n.bar === last.index - 1)
    const lastSpan = Math.max(...lastBar.map((n) => n.time + n.duration)) - Math.min(...lastBar.map((n) => n.time))
    const earlierSpan = Math.max(...earlier.map((n) => n.time + n.duration)) - Math.min(...earlier.map((n) => n.time))
    expect(lastSpan).toBeGreaterThan(earlierSpan)
    expect(scoreDuration(score)).toBeGreaterThan(16 * score.meter.ticksPerBar * (60 / score.bpm / 4))
  })
})
