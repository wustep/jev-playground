import { describe, expect, it } from 'vitest'
import {
  ACCOMPANIMENT_IDS,
  BAR_COUNT_VALUES,
  CHORD_IDS,
  CONTOUR_IDS,
  DYNAMIC_SHAPE_IDS,
  FORM_IDS,
  KEY_IDS,
  METER_IDS,
  MOTION_IDS,
  PALETTE_IDS,
  REGISTER_IDS,
  REGISTER_RANGE,
  STYLE_IDS,
  parsePlan,
  type AccompanimentId,
  type CompositionPlan,
} from '../plan/schema'
import { HeuristicPlanner } from '../planner/HeuristicPlanner'
import { rng } from '../planner/pick'
import { keyInfo, resolveChord, scaleFor } from './harmony'
import { midiOf } from './pitch'
import { renderPlan, timeline } from './renderPlan'
import type { Score } from './score'

const plan = (over: Partial<CompositionPlan> = {}): CompositionPlan => ({
  version: 2,
  style: 'chopin',
  register: 'mid',
  motion: 'flowing',
  accompaniment: 'broken',
  form: 'period',
  key: 'C_major',
  meter: 'four_four',
  palette: 'diatonic',
  tempo: 'adagio',
  dynamics: 'mf',
  dynamicShape: 'steady',
  bars: [
    { chord: 'I', contour: 'arch' },
    { chord: 'V7', contour: 'rise' },
    { chord: 'vi', contour: 'fall' },
    { chord: 'I', contour: 'fall' },
  ],
  ...over,
})

/** The melody: the first treble voice, which renderPlan writes first and alone. */
const melody = (score: Score, index: number) => score.bars[index].treble[0] ?? []
const under = (score: Score, index: number) => [...score.bars[index].treble.slice(1), ...score.bars[index].bass].flat()
const midisOf = (notes: { pitches: string[] }[]) => notes.flatMap((note) => note.pitches.map(midiOf))

function assertWellFormed(score: Score) {
  expect(score.bars.length).toBe(score.plan.bars.length)
  for (const bar of score.bars) {
    const voices = [...bar.treble, ...bar.bass]
    expect(voices.length, `bar ${bar.index} has notes`).toBeGreaterThan(0)
    expect(bar.treble.length).toBeLessThanOrEqual(2)
    expect(bar.bass.length).toBeLessThanOrEqual(2)
    for (const voice of voices) {
      let cursor = 0
      for (const n of voice) {
        expect(Number.isInteger(n.start) && Number.isInteger(n.dur)).toBe(true)
        expect(n.start, 'voices are sorted and never overlap').toBeGreaterThanOrEqual(cursor)
        expect(n.dur).toBeGreaterThan(0)
        expect(n.start + n.dur, 'notes stay inside the bar').toBeLessThanOrEqual(score.meter.ticksPerBar)
        expect(n.pitches.length).toBeGreaterThan(0)
        for (const pitch of n.pitches) {
          const midi = midiOf(pitch)
          expect(midi).toBeGreaterThanOrEqual(24)
          expect(midi).toBeLessThanOrEqual(103)
          expect(pitch, 'no double accidentals reach the sheet').not.toMatch(/##|bb/)
        }
        expect(n.velocity).toBeGreaterThanOrEqual(1)
        expect(n.velocity).toBeLessThanOrEqual(127)
        cursor = n.start + n.dur
      }
    }
  }
}

/**
 * The one invariant the whole rewrite turns on: nothing under the tune may
 * reach it. `counterline` is exempt and declares itself a peer, not support.
 */
function assertNothingCoversTheTune(score: Score) {
  if (score.plan.accompaniment === 'counterline') return
  score.bars.forEach((_, index) => {
    const tune = midisOf(melody(score, index))
    if (!tune.length) return
    const floor = Math.min(...tune)
    for (const midi of midisOf(under(score, index))) {
      expect(midi, `bar ${index + 1}: accompaniment reaches the tune's floor ${floor}`).toBeLessThan(floor)
    }
  })
}

describe('resolveChord', () => {
  it('resolves every chord label in every key', () => {
    for (const key of KEY_IDS) {
      for (const chord of CHORD_IDS) {
        const resolved = resolveChord(keyInfo(key), chord)
        expect(resolved.pcs.length, `${chord} in ${key}`).toBeGreaterThanOrEqual(3)
        expect(resolved.core.length).toBeGreaterThanOrEqual(3)
      }
    }
  })

  it('puts the bass the label asks for under inversions and pedal chords', () => {
    const key = keyInfo('C_major')
    expect(resolveChord(key, 'I6').bass).toBe('E')
    expect(resolveChord(key, 'I64').bass).toBe('G')
    expect(resolveChord(key, 'V7_over_I').bass).toBe('C')
    expect(resolveChord(key, 'I').fixedBass).toBe(false)
    expect(resolveChord(key, 'I6').fixedBass).toBe(true)
  })

  it('bends the melody scale toward chromatic chord tones', () => {
    const key = keyInfo('A_minor')
    const scale = scaleFor(key, 'diatonic', resolveChord(key, 'V7'))
    expect(scale, 'the leading tone of a dominant seventh reaches the line').toContain('G#')
  })

  it('spells chords relative to the key', () => {
    expect(resolveChord(keyInfo('Eb_major'), 'V7').symbol).toBe('Bb7')
    expect(resolveChord(keyInfo('Db_major'), 'IV').root).toBe('Gb')
  })
})

describe('the singing line', () => {
  it('sings where the plan says, and nowhere else', () => {
    for (const register of REGISTER_IDS) {
      const [lo, hi] = REGISTER_RANGE[register]
      const score = renderPlan(plan({ register }), 4)
      const midis = score.bars.flatMap((_, index) => midisOf(melody(score, index)))
      expect(midis.length).toBeGreaterThan(0)
      for (const midi of midis) {
        expect(midi, `${register} line left its window`).toBeGreaterThanOrEqual(lo)
        expect(midi).toBeLessThanOrEqual(hi)
      }
    }
  })

  it('gives each register a distinct line — the label reaches the notes', () => {
    const lines = REGISTER_IDS.map((register) => {
      const score = renderPlan(plan({ register }), 4)
      return score.bars.flatMap((_, index) => midisOf(melody(score, index))).join()
    })
    expect(new Set(lines).size).toBe(REGISTER_IDS.length)
  })

  it('moves at the motion the plan asks for, and they differ', () => {
    const rates = MOTION_IDS.map((motion) => {
      const score = renderPlan(plan({ motion }), 4)
      return score.bars.reduce((n, _, index) => n + melody(score, index).length, 0) / score.bars.length
    })
    // sustained < walking < flowing < florid, strictly.
    for (let k = 1; k < rates.length; k++) expect(rates[k], `${MOTION_IDS[k]} vs ${MOTION_IDS[k - 1]}`).toBeGreaterThan(rates[k - 1])
  })

  it('breathes at a phrase end, then leans into the return by step', () => {
    const score = renderPlan(
      plan({
        motion: 'walking',
        bars: Array.from({ length: 8 }, (_, i) => ({ chord: i % 2 === 1 ? ('V7' as const) : ('I' as const), contour: 'arch' as const })),
      }),
      4,
    )
    // Bar 4 closes the antecedent; bar 5 brings bar 1 back (a period).
    const end = melody(score, 3)
    const gaps = end.slice(1).map((n, k) => n.start - (end[k].start + end[k].dur))
    expect(Math.max(0, ...gaps), 'a real breath: at least half a beat of silence').toBeGreaterThanOrEqual(score.meter.beatTicks / 2)
    const pickup = end[end.length - 1]
    expect(pickup.start + pickup.dur, 'the pickup runs into the barline').toBe(score.meter.ticksPerBar)
    const into = midisOf([pickup])[0] - midisOf([melody(score, 4)[0]])[0]
    expect(Math.abs(into), 'and approaches the returning tune by step').toBeLessThanOrEqual(2)
    expect(into).not.toBe(0)
  })

  it('rings out at the very end rather than resting', () => {
    const score = renderPlan(plan({ motion: 'walking' }), 4)
    const last = melody(score, 3)
    const tail = last[last.length - 1]
    expect(tail.start + tail.dur).toBe(score.meter.ticksPerBar)
  })

  it('brings an earlier bar back when the form says the phrase returns', () => {
    // period at 8 bars: bars 4-6 answer bars 0-2; bar 7 cadences fresh.
    const score = renderPlan(
      plan({
        form: 'period',
        bars: [
          { chord: 'I', contour: 'arch' },
          { chord: 'IV', contour: 'rise' },
          { chord: 'V', contour: 'fall' },
          { chord: 'V', contour: 'fall' },
          { chord: 'I', contour: 'arch' },
          { chord: 'IV', contour: 'rise' },
          { chord: 'V', contour: 'fall' },
          { chord: 'I', contour: 'fall' },
        ],
      }),
      3,
    )
    const pitchesAt = (index: number) => midisOf(melody(score, index))
    expect(pitchesAt(4), 'the answer opens as the question did').toEqual(pitchesAt(0))
    expect(pitchesAt(7), 'but the cadence is written fresh, not quoted').not.toEqual(pitchesAt(3))
  })
})

describe('two-voice counterpoint', () => {
  const duet = () =>
    renderPlan(
      plan({
        style: 'bach',
        accompaniment: 'counterline',
        motion: 'flowing',
        form: 'chain',
        bars: Array.from({ length: 8 }, (_, i) => ({ chord: (['I', 'IV', 'V', 'I'] as const)[i % 4], contour: 'arch' as const })),
      }),
      3,
    )

  it('exposes the subject alone, entering just after the downbeat', () => {
    const score = duet()
    expect(melody(score, 0)[0].start, 'the subject enters a sixteenth late').toBe(1)
    const second = under(score, 0)
    expect(second.every((n) => n.start === 0 && n.dur === score.meter.ticksPerBar), 'under it, one held bass note and nothing moving').toBe(true)
  })

  it('answers the subject an octave below, in its own rhythm', () => {
    const score = duet()
    const subject = melody(score, 0)
    const answer = score.bars[1].bass[0]
    expect(answer.map((n) => n.start)).toEqual(subject.map((n) => n.start))
    expect(answer.map((n) => n.dur)).toEqual(subject.map((n) => n.dur))
    // Re-fitted to the new harmony on strong beats, so mostly — not always — the same notes, lower.
    const pcs = (notes: typeof subject) => notes.map((n) => midisOf([n])[0] % 12)
    const same = pcs(answer).filter((pc, k) => pc === pcs(subject)[k]).length
    expect(same / subject.length).toBeGreaterThan(0.5)
    expect(Math.max(...midisOf(answer))).toBeLessThan(Math.min(...midisOf(melody(score, 1))))
  })
})

describe('the accompaniment', () => {
  it('never reaches the tune, under any pattern', () => {
    for (const accompaniment of ACCOMPANIMENT_IDS) {
      for (const register of REGISTER_IDS) {
        assertNothingCoversTheTune(renderPlan(plan({ accompaniment, register }), 6))
      }
    }
  })

  it('changes the accompaniment without changing the tune', () => {
    const tuneOf = (score: Score) => score.bars.map((_, i) => melody(score, i).map((n) => `${n.start}:${n.dur}:${n.pitches}`).join()).join('/')
    const pitchesOf = (score: Score) => score.bars.flatMap((_, i) => midisOf(melody(score, i))).slice(-20)
    const tunes = new Set<string>()
    const lines = new Set<string>()
    const parts = new Set<string>()
    for (const accompaniment of ACCOMPANIMENT_IDS as readonly AccompanimentId[]) {
      const score = renderPlan(plan({ accompaniment }), 5)
      // Patterns that do not own the downbeat leave the tune exactly as written.
      if (accompaniment !== 'counterline' && accompaniment !== 'stride') tunes.add(tuneOf(score))
      lines.add(pitchesOf(score).join())
      parts.add(score.bars.map((_, i) => midisOf(under(score, i)).join()).join('/'))
    }
    expect(tunes.size, 'what holds the tune up must not change the tune').toBe(1)
    expect(lines.size, 'and no pattern changes what the tune sings once it is in').toBe(1)
    expect(parts.size, 'but each must change what holds it up').toBe(ACCOMPANIMENT_IDS.length)
  })

  it('lets a pattern that owns the downbeat move only where a fresh statement enters', () => {
    const entryOf = (accompaniment: AccompanimentId) => melody(renderPlan(plan({ accompaniment }), 5), 0)[0].start
    expect(entryOf('broken')).toBe(0)
    expect(entryOf('counterline'), 'an invention answers a sixteenth late').toBe(1)
    expect(entryOf('stride'), 'a dance tune comes in on the off-beat').toBe(2)
  })
})

describe('renderPlan', () => {
  it('renders every heuristic plan for every style into a well-formed score', async () => {
    const planner = new HeuristicPlanner()
    for (const style of STYLE_IDS) {
      for (let seed = 1; seed <= 25; seed++) {
        const { plan: made } = await planner.plan({ style, bars: BAR_COUNT_VALUES[seed % BAR_COUNT_VALUES.length], pick: 'sample', seed, brief: true })
        expect(parsePlan(JSON.parse(JSON.stringify(made)))).toEqual(made)
        const score = renderPlan(made, seed)
        assertWellFormed(score)
        assertNothingCoversTheTune(score)
      }
    }
  }, 30_000)

  it('survives any combination a planner could emit', () => {
    const random = rng(7)
    const any = <T>(items: readonly T[]) => items[Math.floor(random() * items.length)]
    for (const accompaniment of ACCOMPANIMENT_IDS) {
      for (const meter of METER_IDS) {
        for (let trial = 0; trial < 12; trial++) {
          const made: CompositionPlan = plan({
            style: any(STYLE_IDS),
            register: any(REGISTER_IDS),
            motion: any(MOTION_IDS),
            accompaniment,
            form: any(FORM_IDS),
            key: any(KEY_IDS),
            meter,
            palette: any(PALETTE_IDS),
            dynamicShape: any(DYNAMIC_SHAPE_IDS),
            bars: Array.from({ length: trial % 3 === 0 ? 16 : trial % 2 ? 4 : 8 }, () => ({
              chord: any(CHORD_IDS),
              contour: any(CONTOUR_IDS),
            })),
          })
          const score = renderPlan(made, trial)
          assertWellFormed(score)
          assertNothingCoversTheTune(score)
        }
      }
    }
  }, 30_000)

  it('plays the same plan differently under a different seed, and the same under the same', async () => {
    const { plan: made } = await new HeuristicPlanner().plan({ style: 'beethoven', bars: 8, pick: 'argmax', seed: 1, brief: true })
    const flat = (seed: number) => JSON.stringify(renderPlan(made, seed).bars.map((bar) => [bar.treble, bar.bass]))
    expect(flat(5)).toBe(flat(5))
    expect(new Set([1, 2, 3, 4, 5, 6].map(flat)).size).toBeGreaterThan(3)
  })

  it('is deterministic for a given plan and seed', async () => {
    const { plan: made } = await new HeuristicPlanner().plan({ style: 'debussy', bars: 8, pick: 'sample', seed: 3, brief: true })
    expect(renderPlan(made, 11)).toEqual(renderPlan(made, 11))
  })

  it('flattens to a timeline that fits the piece', async () => {
    const { plan: made } = await new HeuristicPlanner().plan({ style: 'bach', bars: 8, pick: 'argmax', seed: 1, brief: true })
    const notes = timeline(renderPlan(made, 1))
    expect(notes.length).toBeGreaterThan(20)
    expect(notes[0].time).toBeGreaterThanOrEqual(0)
    expect(notes.every((n, i) => i === 0 || n.time >= notes[i - 1].time)).toBe(true)
  })

  it('sustains by the accompaniment pattern, which chooses its own pedal', () => {
    // Compare each pattern against ITSELF played dry: mean duration across
    // patterns says more about how many notes they write than about pedal.
    const ring = (accompaniment: AccompanimentId) => {
      const score = renderPlan(plan({ accompaniment }), 2)
      const total = (notes: ReturnType<typeof timeline>) => notes.reduce((sum, n) => sum + n.duration, 0)
      return { pedal: score.pedal, lift: total(timeline(score)) / total(timeline(score, { sustain: false })) }
    }
    expect(ring('counterline').pedal, 'two voices in dialogue need to be heard apart').toBe('dry')
    expect(ring('counterline').lift).toBe(1)
    expect(ring('broken').pedal).toBe('full')
    expect(ring('broken').lift, 'a rolled chord rings through the bar').toBeGreaterThan(1.5)
    expect(ring('sustained').lift).toBeGreaterThan(1)
    expect(ring('sustained').lift).toBeLessThan(ring('broken').lift)
  })

  it('writes real CC64 instead of pre-lengthening when MIDI export asks for it', () => {
    const score = renderPlan(plan({ accompaniment: 'broken' }), 2)
    const rung = timeline(score)
    const dry = timeline(score, { sustain: false })
    expect(dry.every((n, i) => n.duration <= rung[i].duration)).toBe(true)
    expect(dry.reduce((sum, n) => sum + n.duration, 0)).toBeLessThan(rung.reduce((sum, n) => sum + n.duration, 0))
  })
})

describe('extended meters', () => {
  it('keeps every meter on a closed grid, with the tune intact', () => {
    for (const meter of METER_IDS) {
      for (const motion of MOTION_IDS) {
        const score = renderPlan(plan({ meter, motion }), 9)
        assertWellFormed(score)
        assertNothingCoversTheTune(score)
        expect(melody(score, 0).length, `${meter} / ${motion} has a tune`).toBeGreaterThan(0)
      }
    }
  })
})
