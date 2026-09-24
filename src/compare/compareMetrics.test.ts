import { describe, expect, it } from 'vitest'
import type { ChordId, CompositionPlan, ContourId } from '../plan/schema'
import { renderPlan } from '../render/renderPlan'
import type { Bar, Voice } from '../render/score'
import {
  classifyMutopiaHand,
  firstThematicBarIndex,
  isPickupOnlyBar,
  midiMetrics,
  midiPickupAlignTicks,
  midiThematicStartOverride,
  accompanimentOfBar,
  ceilingBreaches,
  melodyOfBar,
  scoreMetrics,
  skyline,
  splitMidiHands,
} from './compareMetrics'

const CONTOURS: ContourId[] = ['arch', 'leap_fall', 'wave', 'rise']

function songPlan(overrides: Partial<CompositionPlan> = {}): CompositionPlan {
  const chords: ChordId[] = ['I', 'vi', 'ii6', 'V', 'I', 'vi', 'ii6', 'I', 'IV', 'ii', 'V7_of_V', 'V', 'I', 'vi', 'V7', 'I']
  return {
    version: 2,
    style: 'chopin',
    register: 'high',
    motion: 'flowing',
    accompaniment: 'broken',
    form: 'period',
    key: 'Eb_major',
    meter: 'twelve_eight',
    palette: 'chromatic_approach',
    tempo: 'andante',
    dynamics: 'p',
    dynamicShape: 'steady',
    bars: chords.map((chord, i) => ({ chord, contour: CONTOURS[i % 4] })),
    ...overrides,
  }
}

function voice(notes: [number, number, string[]][]): Voice {
  return notes.map(([start, dur, pitches]) => ({ start, dur, pitches, velocity: 70 }))
}

function barOf(treble: Voice[], bass: Voice[] = []): Bar {
  return {
    index: 0,
    plan: { chord: 'I', contour: 'arch' },
    role: 'statement',
    chordSymbol: 'Eb',
    treble,
    bass,
    dynamic: 'p',
  }
}

describe('Mutopia hand split', () => {
  it('classifies Mutopia staff names, not track index or channel', () => {
    expect(classifyMutopiaHand('upper')).toBe('melody')
    expect(classifyMutopiaHand('up:VA')).toBe('melody')
    expect(classifyMutopiaHand('rh:')).toBe('melody')
    expect(classifyMutopiaHand('one')).toBe('melody')
    expect(classifyMutopiaHand('lower:2')).toBe('accompaniment')
    expect(classifyMutopiaHand('down:')).toBe('accompaniment')
    expect(classifyMutopiaHand('lh:')).toBe('accompaniment')
    expect(classifyMutopiaHand('two')).toBe('accompaniment')
    expect(classifyMutopiaHand('')).toBe('unknown')
    expect(classifyMutopiaHand('piano')).toBe('unknown')
  })

  it('puts BWV 846 upper on the melody side even though it is track 1', () => {
    const hands = splitMidiHands([
      { name: 'lower:2', notes: [{ ticks: 0, durationTicks: 100, midi: 52 }] },
      { name: 'upper:', notes: [{ ticks: 192, durationTicks: 100, midi: 69 }] },
    ])
    expect(hands.melodyIndex).toBe(1)
    expect(hands.accompanimentIndex).toBe(0)
    expect(hands.rule).toMatch(/mutopia-staff-name/)
  })

  it('falls back to the higher-mean track when names are missing', () => {
    const hands = splitMidiHands([
      { name: '', notes: [{ ticks: 0, durationTicks: 10, midi: 40 }, { ticks: 10, durationTicks: 10, midi: 42 }] },
      { name: '', notes: [{ ticks: 0, durationTicks: 10, midi: 76 }, { ticks: 10, durationTicks: 10, midi: 79 }] },
    ])
    expect(hands.melodyIndex).toBe(1)
    expect(hands.accompanimentIndex).toBe(0)
    expect(hands.rule).toMatch(/fallback-higher-mean/)
  })
})

describe('thematic start', () => {
  it('skips a silent prelude and a pickup-only bar', () => {
    expect(isPickupOnlyBar([{ start: 20 }], 24, 6)).toBe(true)
    expect(isPickupOnlyBar([{ start: 0 }, { start: 20 }], 24, 6)).toBe(false)
    expect(
      firstThematicBarIndex(
        [{ events: [] }, { events: [{ start: 20 }] }, { events: [{ start: 0 }, { start: 12 }] }],
        24,
        6,
      ),
    ).toBe(2)
  })

  it('aligns Chopin-style anacrusis to the accompaniment downbeat', () => {
    const aligned = midiPickupAlignTicks({
      melodyFirstTick: 0,
      accompanimentFirstTick: 192,
      ticksPerBar: 2304,
      beatTicks: 576,
    })
    expect(aligned.start).toBe(192)
    expect(aligned.reason).toMatch(/pickup-anacrusis/)
  })

  it('does not treat Bach’s off-beat figure as a pickup (LH starts first)', () => {
    const aligned = midiPickupAlignTicks({
      melodyFirstTick: 192,
      accompanimentFirstTick: 0,
      ticksPerBar: 1536,
      beatTicks: 384,
    })
    expect(aligned.start).toBe(0)
    expect(aligned.reason).toBe('first-onset')
  })

  it('overrides Debussy Arabesque to bar 2 (s1 | s1 then the tune)', () => {
    expect(midiThematicStartOverride('docs/ref-midi/public/debussy-l66-arabesque-1.mid')).toBe(2)
    expect(midiThematicStartOverride('docs/ref-midi/public/chopin-op9-2-nocturne.mid')).toBeUndefined()
    expect(midiThematicStartOverride('docs/ref-midi/public/beethoven-op13-pathetique-2.mid')).toBeUndefined()
  })
})

describe('the melody voice', () => {
  it('is treble[0], with no heuristic in between', () => {
    const melody = voice([[0, 12, ['Db5']], [12, 6, ['Ab5']]])
    const inner = voice([[0, 2, ['Ab3']], [2, 2, ['Db4']], [4, 2, ['F4']]])
    expect(melodyOfBar(barOf([melody, inner]))).toEqual([melody])
    expect(accompanimentOfBar(barOf([melody, inner]))).toEqual([inner])
    // The old metric read a skyline over both voices, which is how a
    // left-hand roll came to be reported as a melody.
    expect(skyline([melody, inner]).some((event) => event.midi < 70)).toBe(true)
    expect(skyline(melodyOfBar(barOf([melody, inner]))).map((event) => event.midi)).toEqual([73, 80])
  })

  it('is empty where the tune rests, rather than falling through to what is under it', () => {
    const inner = voice([[0, 2, ['Ab3']], [2, 2, ['Db4']]])
    const resting = barOf([], [inner])
    expect(melodyOfBar(resting)).toEqual([])
    expect(accompanimentOfBar(resting)).toEqual([inner])
  })

  it('counts a ceiling breach when something under the tune reaches it', () => {
    const score = renderPlan(songPlan(), 1)
    expect(ceilingBreaches(score), 'the renderer must never let this happen').toBe(0)
    const broken = { ...score, bars: score.bars.map((bar, i) => (i === 0 ? { ...bar, bass: [voice([[0, 4, ['C7']]])] } : bar)) }
    expect(ceilingBreaches(broken), 'but the metric must be able to see it').toBe(1)
  })

  it('measures the Chopin-shaped plan on its melody, high and moving', () => {
    const metrics = scoreMetrics(renderPlan(songPlan(), 1))
    expect(metrics.voice).toBe('melody-voice')
    expect(metrics.thematicStartBar).toBe(0)
    expect(metrics.registerMean).toBeGreaterThan(72)
    expect(metrics.ceilingBreaches).toBe(0)
    expect(metrics.onsetDensityEarly).toBeGreaterThan(4)
  })
})

describe('committed Mutopia files', () => {
  it('scores Chopin Op. 9/2 RH melody near 76.5, not the both-hands 72.4', () => {
    const midi = midiMetrics('docs/ref-midi/public/chopin-op9-2-nocturne.mid')
    if ('error' in midi) throw new Error(midi.error)
    expect(midi.handSplit.melodyName).toMatch(/upper/i)
    expect(midi.handSplit.alignStartTick).toBe(192)
    expect(midi.thematicStartBar).toBe(0)
    expect(midi.combinedSkyline.registerMean).toBe(72.4)
    expect(midi.registerMean).toBeGreaterThan(75)
    expect(midi.registerMean).toBeLessThan(78)
    expect(midi.registerMean - midi.combinedSkyline.registerMean).toBeGreaterThan(3)
  })

  it('scores Beethoven Pathétique II RH at 62 and starts the theme at bar 0', () => {
    const midi = midiMetrics('docs/ref-midi/public/beethoven-op13-pathetique-2.mid')
    if ('error' in midi) throw new Error(midi.error)
    expect(midi.handSplit.melodyName).toMatch(/up/i)
    expect(midi.thematicStartBar).toBe(0)
    expect(midi.registerMean).toBe(62)
    expect(midi.combinedSkyline.registerMean).toBe(62)
    expect(midi.ret8).toBeGreaterThan(0.9)
  })

  it('scores Debussy Arabesque from thematic bar 2 and the upper staff', () => {
    const midi = midiMetrics('docs/ref-midi/public/debussy-l66-arabesque-1.mid')
    if ('error' in midi) throw new Error(midi.error)
    expect(midi.handSplit.melodyName).toMatch(/upper/i)
    expect(midi.thematicStartBar).toBe(2)
    expect(midi.thematicStartReason).toMatch(/mutopia-override/)
    expect(midi.combinedSkyline.registerMean).toBe(65.1)
    expect(midi.registerMean).toBeGreaterThan(midi.combinedSkyline.registerMean)
  })

  it('scores BWV 846 from the upper figure track (track 1), not the lower staff', () => {
    const midi = midiMetrics('docs/ref-midi/public/bach-bwv846-wtk1-prelude1.mid')
    if ('error' in midi) throw new Error(midi.error)
    expect(midi.handSplit.melodyIndex).toBe(1)
    expect(midi.handSplit.accompanimentIndex).toBe(0)
    expect(midi.registerMean).toBe(69.1)
    expect(midi.combinedSkyline.registerMean).toBe(66.4)
    expect(midi.thematicStartBar).toBe(0)
  })
})
