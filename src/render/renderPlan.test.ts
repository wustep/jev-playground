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
import { enteringAfter, figureBetween, fioritura, silenceUntil, stressed } from './melody'
import { barPositions } from '../plan/phrase'
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
 * reach it. That includes `counterline`: a peer in weight and rhythm, but it
 * sings in its own register under the first voice's floor.
 */
function assertNothingCoversTheTune(score: Score) {
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

  it('leaves no augmented second for a line to step across, unless the chord owns it', () => {
    const chromas = (pcs: string[]) => pcs.map((pc) => midiOf(`${pc}4`) % 12)
    // C minor over V7: the melodic minor, A natural under the leading tone.
    expect(scaleFor(keyInfo('C_minor'), 'diatonic', resolveChord(keyInfo('C_minor'), 'V7'))).toEqual(['C', 'D', 'Eb', 'F', 'G', 'A', 'B'])
    // C major over a borrowed iv: B♭ over its A♭, not B.
    expect(chromas(scaleFor(keyInfo('C_major'), 'diatonic', resolveChord(keyInfo('C_major'), 'iv')))).toContain(10)
    // A diminished seventh's augmented second is its own.
    expect(scaleFor(keyInfo('C_minor'), 'diatonic', resolveChord(keyInfo('C_minor'), 'vii_dim7'))).toContain('Ab')
    let stray = 0
    for (const key of KEY_IDS) {
      for (const chord of CHORD_IDS) {
        const resolved = resolveChord(keyInfo(key), chord)
        const owned = new Set(chromas(resolved.pcs))
        const scale = [...chromas(scaleFor(keyInfo(key), 'diatonic', resolved))].sort((a, b) => a - b)
        if (scale.length < 7) continue
        if (scale.some((c, i) => (scale[(i + 1) % scale.length] - c + 12) % 12 === 3 && !(owned.has(c) && owned.has(scale[(i + 1) % scale.length])))) stray++
      }
    }
    expect(stray, 'of every diatonic scale bent to every chord in every key').toBeLessThanOrEqual(3)
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

  /** Every note-to-note move of the tune, in semitones, over many drawn plans at one motion. */
  const movesAt = async (motion: CompositionPlan['motion']) => {
    const planner = new HeuristicPlanner()
    const moves: number[] = []
    for (const style of STYLE_IDS) {
      for (let seed = 1; seed <= 6; seed++) {
        const { plan: drawn } = await planner.plan({ style, bars: 16, pick: 'sample', seed, brief: true })
        const score = renderPlan({ ...drawn, motion }, seed)
        const line = score.bars.flatMap((_, i) => midisOf(melody(score, i).filter((n) => !n.tied)))
        for (let k = 1; k < line.length; k++) moves.push(line[k] - line[k - 1])
      }
    }
    return moves
  }

  it('walks by step, not by the notes of the chord', async () => {
    // Every beat used to be a chord tone, so a walking tune was an arpeggio:
    // 38% of its moves by step, against 52–70% in the reference tunes.
    const moving = (await movesAt('walking')).filter((move) => move !== 0)
    const steps = moving.filter((move) => Math.abs(move) <= 2).length
    expect(steps / moving.length).toBeGreaterThan(0.5)
  })

  it('walks through the second beat of a two-four bar', async () => {
    // Stressed like four-four's third beat, beat two made a walking 2/4 tune
    // two chord tones a bar: A D | A D, 40% of its moves by step. Beethoven
    // is the style that writes in 2/4.
    const planner = new HeuristicPlanner()
    let moves = 0
    let steps = 0
    let downbeats = 0
    let onChord = 0
    for (let seed = 1; seed <= 24; seed++) {
      const { plan: drawn } = await planner.plan({ style: 'beethoven', bars: 16, pick: 'sample', seed, brief: true })
      const score = renderPlan({ ...drawn, meter: 'two_four', motion: 'walking' }, seed)
      const key = keyInfo(drawn.key)
      const line = score.bars.flatMap((_, i) => midisOf(melody(score, i).filter((n) => !n.tied)))
      for (let k = 1; k < line.length; k++) {
        if (line[k] === line[k - 1]) continue
        moves++
        if (Math.abs(line[k] - line[k - 1]) <= 2) steps++
      }
      for (const bar of score.bars) {
        const first = bar.treble[0]?.[0]
        if (!first || first.start !== 0 || first.tied) continue
        downbeats++
        if (resolveChord(key, bar.plan.chord).pcs.some((pc) => midiOf(`${pc}4`) % 12 === midisOf([first])[0] % 12)) onChord++
      }
    }
    expect(steps / moves).toBeGreaterThan(0.5)
    expect(onChord / downbeats, 'the downbeat still sounds the harmony').toBeGreaterThan(0.97)
  })

  it('runs through a florid bar instead of trilling on two notes', async () => {
    const planner = new HeuristicPlanner()
    let trills = 0
    let bars = 0
    for (const style of STYLE_IDS) {
      for (let seed = 1; seed <= 6; seed++) {
        const { plan: drawn } = await planner.plan({ style, bars: 16, pick: 'sample', seed, brief: true })
        const score = renderPlan({ ...drawn, motion: 'florid', form: 'chain' }, seed)
        for (const bar of score.bars) {
          const line = midisOf(bar.treble[0] ?? [])
          bars++
          const alternates = line.some((_, k) => k >= 5 && new Set(line.slice(k - 5, k + 1)).size === 2 && line.slice(k - 4, k + 1).every((m, i) => m !== line[k - 5 + i]))
          if (alternates) trills++
        }
      }
    }
    expect(trills / bars, 'six notes rocking between two pitches').toBeLessThan(0.02)
  })

  it('runs a florid line on through an inner cadence, arriving on the tonic first', () => {
    const score = renderPlan(
      plan({
        motion: 'florid',
        form: 'period',
        bars: Array.from({ length: 16 }, (_, i) => ({ chord: (['I', 'IV', 'V7', 'I'] as const)[i % 4], contour: 'wave' as const })),
      }),
      5,
    )
    const positions = barPositions('period', 16)
    const inner = positions.flatMap((position, i) => (position.phraseFinal && i < 15 && position.phraseEnd !== 'open' ? [i] : []))
    expect(inner.length).toBeGreaterThan(0)
    for (const i of inner) {
      const bar = melody(score, i)
      expect(bar[0].start).toBe(0)
      expect(bar[0].dur, `bar ${i + 1} holds its arrival a beat`).toBe(score.meter.beatTicks)
      expect(bar.length, `bar ${i + 1} runs on`).toBeGreaterThan(2 * 3)
      if (positions[i].role === 'cadence') expect(bar[0].pitches[0].replace(/\d/, ''), `bar ${i + 1} arrives on the tonic`).toBe('C')
    }
    const last = melody(score, 15)
    expect(last, 'the end still lands and rings').toHaveLength(1)
  })

  it('passes over a second chord through its own scale', () => {
    // i6/4 then V7 in one bar, C minor: the second half is heard over B, D, F.
    const score = renderPlan(
      plan({
        key: 'C_minor',
        motion: 'florid',
        form: 'chain',
        bars: Array.from({ length: 8 }, (_, i) => (i % 2 === 1 ? { chord: 'i64' as const, chord2: 'V7' as const, contour: 'wave' as const } : { chord: 'i' as const, contour: 'arch' as const })),
      }),
      3,
    )
    for (let i = 1; i < 8; i += 2) {
      const second = melody(score, i).filter((n) => n.start >= score.meter.splitTick)
      for (const n of second) expect(n.pitches[0], `bar ${i + 1} runs B♭ against the V7's B`).not.toMatch(/^Bb/)
    }
  })

  it('steps into its closes', async () => {
    const planner = new HeuristicPlanner()
    let closes = 0
    let stepped = 0
    let struckAgain = 0
    for (const style of ['bach', 'beethoven', 'chopin', 'laufey'] as const) {
      for (let seed = 1; seed <= 12; seed++) {
        const { plan: drawn } = await planner.plan({ style, bars: 16, pick: 'sample', seed, brief: true })
        const score = renderPlan(drawn, seed)
        barPositions(drawn.form, 16).forEach((position, i) => {
          if (position.role !== 'cadence' && i !== 15) return
          const bar = melody(score, i)
          const k = bar.reduce((best, n, j) => (n.dur > bar[best].dur ? j : best), 0)
          const before = k > 0 ? bar[k - 1] : melody(score, i - 1).slice(-1)[0]
          if (!before || !bar[k]) return
          const move = Math.abs(midisOf([bar[k]])[0] - midisOf([before])[0])
          closes++
          if (move > 0 && move <= 2) stepped++
          if (move === 0) struckAgain++
        })
      }
    }
    // A quarter used to arrive by step, and one in six by the tonic struck again.
    expect(stepped / closes).toBeGreaterThan(0.7)
    expect(struckAgain / closes).toBeLessThan(0.08)
  })

  it("runs Fox's florid line nearly unbroken, as his displacement lesson does", async () => {
    const planner = new HeuristicPlanner()
    const rate = async (style: CompositionPlan['style']) => {
      let attacks = 0
      let bars = 0
      for (let seed = 1; seed <= 8; seed++) {
        const { plan: drawn } = await planner.plan({ style, bars: 16, pick: 'sample', seed, brief: true })
        const score = renderPlan({ ...drawn, motion: 'florid', meter: 'four_four' }, seed)
        attacks += score.bars.reduce((n, _, i) => n + melody(score, i).filter((note) => !note.tied).length, 0)
        bars += score.bars.length
      }
      return attacks / bars
    }
    // "Wyoming" plays 16.4 attacks a bar; the shared florid rate alone gave him about 12.
    expect(await rate('elijah_fox')).toBeGreaterThan(14)
    expect(await rate('chopin')).toBeLessThan(await rate('elijah_fox'))
  })

  it("keeps Fox's sixteenths running through an inner cadence, arriving on the tonic", () => {
    const bars = Array.from({ length: 16 }, (_, i) => ({ chord: (['I', 'IV', 'V7', 'I'] as const)[i % 4], contour: 'wave' as const }))
    const positions = barPositions('period', 16)
    const inner = positions.flatMap((position, i) => (position.phraseFinal && i < 15 && position.phraseEnd !== 'open' ? [i] : []))
    expect(inner.length).toBeGreaterThan(0)
    for (const seed of [1, 2, 3, 4]) {
      const score = renderPlan(plan({ style: 'elijah_fox', motion: 'florid', form: 'period', bars }), seed)
      for (const i of inner) {
        const bar = melody(score, i)
        expect(bar, `bar ${i + 1} does not stop for its cadence`).toHaveLength(16)
        if (positions[i].role === 'cadence') expect(bar[0].pitches[0].replace(/\d/, ''), `bar ${i + 1} arrives on the tonic`).toBe('C')
      }
      expect(melody(score, 15), 'the end still lands and rings').toHaveLength(1)
    }
  })

  it("runs Fox's sixteenths in compound time too, where the shared florid rate lilts", () => {
    const bars = Array.from({ length: 8 }, (_, i) => ({ chord: (['I', 'vi', 'IV', 'V'] as const)[i % 4], contour: 'wave' as const }))
    const running = (style: CompositionPlan['style']) => {
      const score = renderPlan(plan({ style, meter: 'six_eight', motion: 'florid', form: 'chain', bars }), 3)
      const inner = score.bars.slice(0, -1)
      return inner.filter((_, i) => melody(score, i).filter((n) => !n.tied).length === score.meter.ticksPerBar).length / inner.length
    }
    expect(running('elijah_fox'), 'a dotted-quarter beat runs six sixteenths').toBe(1)
    expect(running('chopin')).toBeLessThan(0.5)
  })

  it('rings out at the very end rather than resting', () => {
    const score = renderPlan(plan({ motion: 'walking' }), 4)
    const last = melody(score, 3)
    const tail = last[last.length - 1]
    expect(tail.start + tail.dur).toBe(score.meter.ticksPerBar)
  })

  // period at 8 bars: bars 4-6 answer bars 0-2; bar 7 cadences fresh.
  const period = (style: CompositionPlan['style']) =>
    renderPlan(
      plan({
        style,
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
  const onsets = (notes: { start: number; pitches: string[] }[]) => notes.map((n) => `${n.start}:${midisOf([n])[0]}`)

  it('brings an earlier bar back when the form says the phrase returns', () => {
    const score = period('beethoven')
    const pitchesAt = (index: number) => midisOf(melody(score, index))
    expect(pitchesAt(4), 'the answer opens as the question did').toEqual(pitchesAt(0))
    expect(pitchesAt(7), 'but the cadence is written fresh, not quoted').not.toEqual(pitchesAt(3))
  })

  // period at 16 bars: bars 8–10 are a departure — a contrast bar and two sequences of it.
  const departure = (contours: CompositionPlan['bars'][number]['contour'][]) =>
    renderPlan(
      plan({
        motion: 'flowing',
        form: 'period',
        bars: Array.from({ length: 16 }, (_, i) => ({
          chord: (['I', 'IV', 'V', 'I', 'I', 'IV', 'V', 'I', 'vi', 'ii', 'V', 'V', 'I', 'IV', 'V', 'I'] as const)[i],
          contour: i >= 8 && i <= 10 ? contours[i - 8] : ('arch' as const),
        })),
      }),
      7,
    )
  const rhythmOf = (notes: { start: number; dur: number }[]) => notes.map((n) => `${n.start}:${n.dur}`).join()
  const turnsOf = (notes: { pitches: string[] }[]) => {
    const line = midisOf(notes)
    return line.slice(1).map((midi, k) => Math.sign(midi - line[k]))
  }

  it('repeats a figure on the next harmony where the form says sequence', () => {
    const score = departure(['arch', 'arch', 'arch'])
    expect(barPositions('period', 16).slice(8, 11).map((p) => p.role)).toEqual(['contrast', 'sequence', 'sequence'])
    for (const bar of [9, 10]) {
      expect(rhythmOf(melody(score, bar)), `bar ${bar + 1} keeps the model's rhythm`).toBe(rhythmOf(melody(score, bar - 1)))
      const same = turnsOf(melody(score, bar)).filter((turn, k) => turn === turnsOf(melody(score, bar - 1))[k]).length
      expect(same / turnsOf(melody(score, bar)).length, `bar ${bar + 1} keeps the model's shape`).toBeGreaterThanOrEqual(0.75)
      expect(midisOf(melody(score, bar)), 'on its own harmony, not a copy').not.toEqual(midisOf(melody(score, bar - 1)))
    }
  })

  /** Mean pitch of the notes a bar strikes; a note held over the barline is the bar before's. */
  const meanOf = (notes: { pitches: string[]; tied?: boolean }[]) => {
    const struck = midisOf(notes.filter((n) => !n.tied))
    return struck.reduce((a, b) => a + b, 0) / struck.length
  }

  it('moves a sequence off its model’s pitch, even where the harmony stands still', () => {
    // A contrast bar and two sequences of it, all on ii: the model's own
    // root, so the root's move is none, and each sequence used to sing the
    // bar before it again — three identical bars.
    const chords = ['I', 'IV', 'V', 'I', 'I', 'IV', 'V', 'I', 'ii', 'ii', 'ii', 'V', 'I', 'IV', 'V', 'I'] as const
    for (const seed of [1, 4, 7]) {
      const score = renderPlan(plan({ motion: 'flowing', form: 'period', bars: chords.map((chord) => ({ chord, contour: 'wave' as const })) }), seed)
      for (const bar of [9, 10]) {
        expect(rhythmOf(melody(score, bar)), `bar ${bar + 1} keeps the model's rhythm`).toBe(rhythmOf(melody(score, bar - 1)))
        expect(Math.abs(meanOf(melody(score, bar)) - meanOf(melody(score, bar - 1))), `seed ${seed}, bar ${bar + 1} sings its model again`).toBeGreaterThanOrEqual(1)
        const same = turnsOf(melody(score, bar)).filter((turn, k) => turn === turnsOf(melody(score, bar - 1))[k]).length
        expect(same / turnsOf(melody(score, bar)).length, `bar ${bar + 1} keeps the model's shape`).toBeGreaterThanOrEqual(0.75)
      }
    }
  })

  it('never lets a sequence sing its model again at the same pitch', async () => {
    // A figure that would leave the register by the root's move, with the
    // octave back leaping away from the line, used to stay where it was.
    const planner = new HeuristicPlanner()
    let sequences = 0
    let stayed = 0
    for (const style of STYLE_IDS) {
      for (let seed = 1; seed <= 12; seed++) {
        const { plan: drawn } = await planner.plan({ style, bars: 16, pick: 'sample', seed, brief: true })
        const score = renderPlan(drawn, seed)
        barPositions(drawn.form, 16).forEach((position, i) => {
          if (position.role !== 'sequence' || position.returnsFrom !== undefined || drawn.bars[i].contour !== drawn.bars[i - 1].contour) return
          if (melody(score, i).filter((n) => !n.tied).length < 2) return
          sequences++
          if (Math.abs(meanOf(melody(score, i)) - meanOf(melody(score, i - 1))) < 1) stayed++
        })
      }
    }
    expect(sequences).toBeGreaterThan(100)
    expect(stayed / sequences).toBeLessThan(0.02)
  })

  it('moves a figure onto new harmony without restriking a note its source left, or leaving the chord where it must sound', async () => {
    const planner = new HeuristicPlanner()
    let moves = 0
    let restruck = 0
    let stresses = 0
    let astray = 0
    for (const style of STYLE_IDS) {
      for (let seed = 1; seed <= 12; seed++) {
        const { plan: drawn } = await planner.plan({ style, bars: 16, pick: 'sample', seed, brief: true })
        const score = renderPlan(drawn, seed)
        const key = keyInfo(drawn.key)
        barPositions(drawn.form, 16).forEach((position, i) => {
          const sequence = position.role === 'sequence' && drawn.bars[i].contour === drawn.bars[i - 1].contour
          const from = position.returnsFrom ?? (sequence ? i - 1 : undefined)
          if (from === undefined) return
          const bar = melody(score, i)
          const source = melody(score, from)
          // Dressed returns add notes; only a figure moved note for note is compared.
          if (bar.length !== source.length || bar.some((n, k) => k > 0 && n.start !== source[k].start)) return
          const chord = resolveChord(key, drawn.bars[i].chord)
          const chord2 = drawn.bars[i].chord2 ? resolveChord(key, drawn.bars[i].chord2!) : undefined
          bar.forEach((n, k) => {
            if (n.tied) return
            if (stressed({ meter: score.meter, chord2 }, n)) {
              stresses++
              const under = chord2 && n.start >= score.meter.splitTick ? chord2 : chord
              if (!under.pcs.some((pc) => midiOf(`${pc}4`) % 12 === midisOf([n])[0] % 12)) astray++
            }
            if (k === 0) return
            moves++
            if (midisOf([n])[0] === midisOf([bar[k - 1]])[0] && midisOf([source[k]])[0] !== midisOf([source[k - 1]])[0]) restruck++
          })
        })
      }
    }
    expect(moves).toBeGreaterThan(1000)
    expect(restruck / moves, 'a move the source made, struck twice instead').toBeLessThan(0.005)
    expect(astray / stresses, 'a stressed note moved off its chord to make room').toBeLessThan(0.002)
  })

  it('keeps the rhythm of a sequence whose contour is its own, and sings that contour', () => {
    const score = departure(['arch', 'fall', 'rise'])
    for (const bar of [9, 10]) expect(rhythmOf(melody(score, bar))).toBe(rhythmOf(melody(score, bar - 1)))
    const line = midisOf(melody(score, 10))
    expect(line[line.length - 1], 'bar 11 rises').toBeGreaterThan(line[0])
  })

  it('develops the rhythm of the bar that opened the phrase', async () => {
    const planner = new HeuristicPlanner()
    let developed = 0
    let continuations = 0
    for (const style of STYLE_IDS) {
      for (let seed = 1; seed <= 8; seed++) {
        const { plan: drawn } = await planner.plan({ style, bars: 16, pick: 'sample', seed, brief: true })
        const made = { ...drawn, motion: 'flowing' as const }
        const score = renderPlan(made, seed)
        barPositions(made.form, 16).forEach((position, i) => {
          if (position.role !== 'continuation' || position.phraseFinal || position.returnsFrom !== undefined) return
          const opening = score.bars[position.phrase * 4].treble[0] ?? []
          if (!opening.length || i === position.phrase * 4) return
          const head = (notes: { start: number; dur: number }[]) => rhythmOf(notes.filter((n) => n.start < score.meter.splitTick).slice(0, -1))
          continuations++
          if (head(melody(score, i)) === head(opening)) developed++
        })
      }
    }
    // Drawn fresh beat by beat, two flowing bars share their first half's rhythm about one time in four.
    expect(developed / continuations).toBeGreaterThan(0.6)
  })

  it('dresses the first answer where the style does, keeping every note of the tune', () => {
    // Op. 9/2 answers its question at 12.5 attacks a bar against 7.25.
    const score = period('chopin')
    // Bar 7 is the climax, where the form lifts the tune a third on purpose.
    for (const bar of [4, 5]) {
      const question = melody(score, bar - 4)
      const answer = melody(score, bar)
      expect(answer.length, `bar ${bar + 1} is decorated, not cloned`).toBeGreaterThan(question.length)
      // Every note of the question sounds again, on its own onset.
      for (const heard of onsets(question)) expect(onsets(answer)).toContain(heard)
    }
  })
})

describe('fioritura', () => {
  it('turns or runs into the next note, never striking a pitch twice', () => {
    for (let count = 1; count <= 7; count++) {
      for (const [from, to] of [[7, 7], [7, 8], [7, 9], [7, 4], [7, 12], [1, 0], [13, 14]]) {
        const figure = fioritura(15, from, to, count)
        expect(figure).toHaveLength(count)
        const line = [from, ...figure, to]
        for (let k = 1; k < line.length; k++) expect(line[k], `${from}→${to} in ${count}: ${line.join(' ')}`).not.toBe(line[k - 1])
        // Away from the ends of the ladder, the last note steps into the next.
        const edge = to === 0 || to === 14
        if (!edge) expect(Math.abs(figure[count - 1] - to), `${from}→${to} in ${count}: ${line.join(' ')}`).toBe(1)
        for (const rung of figure) expect(rung >= 0 && rung < 15).toBe(true)
      }
    }
    // Three notes around one pitch is the textbook turn: above, on, below.
    expect(fioritura(15, 7, 7, 3)).toEqual([8, 7, 6])
  })
})

describe('figureBetween', () => {
  it('arrives on the next beat by step or skip, never striking a pitch twice', () => {
    for (let count = 1; count <= 6; count++) {
      for (let from = 0; from < 12; from++) {
        for (let to = 0; to < 12; to++) {
          const figure = figureBetween(12, from, to, count)
          expect(figure).toHaveLength(count)
          const line = [from, ...figure, to]
          for (let k = 1; k < line.length; k++) expect(line[k], `${from}→${to} in ${count}: ${line.join(' ')}`).not.toBe(line[k - 1])
          for (const rung of figure) expect(rung >= 0 && rung < 12).toBe(true)
          if (Math.abs(to - from) <= 2 * (count + 1)) {
            for (let k = 1; k < line.length; k++) expect(Math.abs(line[k] - line[k - 1]), `${from}→${to} in ${count}: ${line.join(' ')}`).toBeLessThanOrEqual(2)
          }
        }
      }
    }
  })

  it('runs where a run fits, and repeats the figure it is offered', () => {
    // G to D in three sixteenths is a scale: G F♯ E | D.
    expect(figureBetween(12, 7, 3, 3)).toEqual([6, 5, 4])
    const turn = figureBetween(12, 5, 5, 3)
    expect(figureBetween(12, 8, 8, 3, [turn[0] - 5, turn[1] - turn[0], turn[2] - turn[1], 5 - turn[2]])).toEqual(turn.map((rung) => rung + 3))
  })
})

describe('how a style divides the beat', () => {
  /** Every beat of the tune in simple metres, as its attack offsets within the beat. */
  const beatsOf = async (style: CompositionPlan['style'], over: Partial<CompositionPlan> = {}) => {
    const planner = new HeuristicPlanner()
    const beats: { onsets: string; bar: number; score: Score }[] = []
    for (let seed = 1; seed <= 16; seed++) {
      const { plan: drawn } = await planner.plan({ style, bars: 16, pick: 'sample', seed, brief: true })
      const score = renderPlan({ ...drawn, meter: 'four_four', ...over }, seed)
      score.bars.forEach((bar, index) => {
        const tune = (bar.treble[0] ?? []).filter((n) => !n.tied)
        for (let beat = 0; beat < 4; beat++) {
          const onsets = tune.filter((n) => n.start >= beat * 4 && n.start < beat * 4 + 4).map((n) => n.start - beat * 4)
          if (onsets.length) beats.push({ onsets: onsets.join(), bar: index, score })
        }
      })
    }
    return beats
  }
  const share = (beats: { onsets: string }[], onsets: string) => beats.filter((b) => b.onsets === onsets).length / beats.length

  it('never snaps a beat, which no reference tune does', async () => {
    for (const style of STYLE_IDS) expect(share(await beatsOf(style, { motion: 'flowing' }), '0,1'), style).toBe(0)
  })

  it('dots where the style does, and Glass never', async () => {
    const dotted = async (style: CompositionPlan['style']) => share(await beatsOf(style, { motion: 'flowing' }), '0,3')
    expect(await dotted('glass')).toBe(0)
    expect(await dotted('chopin')).toBeGreaterThan(2 * (await dotted('bach')))
    expect(await dotted('beethoven')).toBeGreaterThan(2 * (await dotted('bach')))
  })

  it('anticipates the half-bar in a song, and not in an invention', async () => {
    const anticipated = async (style: CompositionPlan['style']) => {
      const planner = new HeuristicPlanner()
      let bars = 0
      for (let seed = 1; seed <= 16; seed++) {
        const { plan: drawn } = await planner.plan({ style, bars: 16, pick: 'sample', seed, brief: true })
        const score = renderPlan({ ...drawn, meter: 'four_four', motion: 'walking' }, seed)
        bars += score.bars.filter((bar) => (bar.treble[0] ?? []).some((n) => n.start === 6 && n.start + n.dur > 8)).length
      }
      return bars
    }
    expect(await anticipated('laufey')).toBeGreaterThan(10)
    expect(await anticipated('bach')).toBe(0)
  })

  it('splits a compound beat evenly for Glass, two against the left hand’s three', async () => {
    // Every two-note compound beat used to lean long–short, a barcarolle's
    // lilt, in 91% of Glass's: the one style whose row says it never dots.
    const planner = new HeuristicPlanner()
    const pairs = { glass: [0, 0], chopin: [0, 0] }
    for (const style of ['glass', 'chopin'] as const) {
      for (let seed = 1; seed <= 16; seed++) {
        const { plan: drawn } = await planner.plan({ style, bars: 16, pick: 'sample', seed, brief: true })
        const score = renderPlan({ ...drawn, meter: 'six_eight', motion: 'flowing' }, seed)
        for (const bar of score.bars) {
          const tune = (bar.treble[0] ?? []).filter((n) => !n.tied)
          for (const beat of [0, 6]) {
            const onsets = tune.filter((n) => n.start >= beat && n.start < beat + 6).map((n) => n.start - beat)
            if (onsets.length !== 2 || onsets[0] !== 0) continue
            pairs[style][1]++
            if (onsets[1] === 3) pairs[style][0]++
          }
        }
      }
    }
    expect(pairs.glass[1]).toBeGreaterThan(100)
    expect(pairs.glass[0] / pairs.glass[1], 'Glass: two dotted eighths').toBeGreaterThan(0.95)
    expect(pairs.chopin[0] / pairs.chopin[1], 'Chopin keeps his lilt').toBeLessThan(0.3)
  })

  it('plays Glass dead even, both hands on the grid', async () => {
    const { plan: drawn } = await new HeuristicPlanner().plan({ style: 'glass', bars: 16, pick: 'sample', seed: 4, brief: true })
    const score = renderPlan({ ...drawn, meter: 'four_four', motion: 'flowing' }, 4)
    const tick = 60 / score.bpm / 4
    const last = score.bars.length - 1
    const off = timeline(score).filter((n) => n.bar < last && Math.abs(n.time - (n.bar * score.meter.ticksPerBar * tick + Math.round((n.time - n.bar * score.meter.ticksPerBar * tick) / tick) * tick)) > 1e-9)
    expect(off, 'notes pulled off the sixteenth grid').toHaveLength(0)
  })

  it("accents Fox's running sixteenths in his groupings, not on the beat", async () => {
    const planner = new HeuristicPlanner()
    const at = { group: [] as number[], beat: [] as number[] }
    for (let seed = 1; seed <= 12; seed++) {
      const { plan: drawn } = await planner.plan({ style: 'elijah_fox', bars: 16, pick: 'sample', seed, brief: true })
      const score = renderPlan({ ...drawn, meter: 'four_four', motion: 'florid', form: 'chain' }, seed)
      score.bars.forEach((bar, index) => {
        const tune = bar.treble[0] ?? []
        if (tune.length < 12) return
        // 5+5+6 then 7+5+4, bar by bar: tick 5 or 7 starts a group; tick 4 or 8 is a beat inside one.
        const [group, beat] = index % 2 === 0 ? [5, 4] : [7, 8]
        const velocityAt = (tick: number) => tune.find((n) => n.start === tick)?.velocity
        const g = velocityAt(group)
        const b = velocityAt(beat)
        if (g !== undefined && b !== undefined) {
          at.group.push(g)
          at.beat.push(b)
        }
      })
    }
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
    expect(at.group.length).toBeGreaterThan(20)
    expect(mean(at.group)).toBeGreaterThan(mean(at.beat) + 1.5)
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
    // The answer imitates the subject as written; what is heard of it in bar 1
    // lacks its first sixteenth, which the second voice's downbeat covers.
    const written = renderPlan(plan({ style: 'bach', accompaniment: 'broken', motion: 'flowing', form: 'chain', bars: score.plan.bars }), 3)
    const subject = melody(written, 0)
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
    for (const style of ['chopin', 'bach'] as const) {
      for (const accompaniment of ACCOMPANIMENT_IDS) {
        for (const register of REGISTER_IDS) {
          assertNothingCoversTheTune(renderPlan(plan({ style, accompaniment, register }), 6))
        }
      }
    }
  })

  describe('held harmony in parts, where the style has no pad', () => {
    const hymns = async () => {
      const planner = new HeuristicPlanner()
      const out: Score[] = []
      for (let seed = 1; seed <= 16; seed++) {
        const { plan: drawn } = await planner.plan({ style: 'bach', bars: 16, pick: 'sample', seed, brief: true })
        out.push(renderPlan({ ...drawn, accompaniment: 'sustained', motion: 'walking', meter: 'four_four' }, seed))
      }
      return out
    }
    /** Beats on which anything under the tune strikes, over all beats. */
    const struckBeats = (score: Score) => {
      let struck = 0
      let beats = 0
      for (const bar of score.bars) {
        const onsets = new Set(bar.bass.flat().map((n) => n.start))
        for (let tick = 0; tick < score.meter.ticksPerBar; tick += score.meter.beatTicks, beats++) if (onsets.has(tick)) struck++
      }
      return struck / beats
    }

    it('moves bass, tenor and alto with the tune on the beat, where a pad holds them', async () => {
      // Bach's four-part chorales strike 92% of beats under the soprano.
      const bach = await hymns()
      const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
      expect(mean(bach.map(struckBeats))).toBeGreaterThan(0.75)
      const pad = bach.map((score) => renderPlan({ ...score.plan, style: 'debussy' }, score.seed))
      expect(mean(pad.map(struckBeats)), 'a pad sounds each chord once').toBeLessThan(0.4)
      for (const score of bach) {
        const tones = score.bars.flatMap((bar) => bar.bass.flat().filter((n) => n.pitches.length >= 2))
        expect(tones.length, 'there are inner voices, not a bass line alone').toBeGreaterThan(score.bars.length)
      }
    })

    it('carries the note the tune sings on each strike, and never moves in octaves or fifths with it', async () => {
      const shapes = [[0, 4, 7], [0, 3, 7], [0, 3, 6], [0, 4, 8], [0, 4, 7, 10], [0, 4, 7, 11], [0, 3, 7, 10], [0, 3, 6, 10], [0, 3, 6, 9], [0, 5, 7], [0, 5, 7, 10]]
      const spellsChord = (midis: number[]) => {
        const pcs = [...new Set(midis.map((m) => m % 12))]
        return Array.from({ length: 12 }, (_, root) => root).some((root) => shapes.some((shape) => pcs.every((pc) => shape.includes((pc - root + 12) % 12))))
      }
      let strikes = 0
      let chords = 0
      let moves = 0
      let parallels = 0
      for (const score of await hymns()) {
        let before: { s: number; b: number } | undefined
        for (const bar of score.bars) {
          const bassLine = bar.bass[bar.bass.length - 1]
          for (let tick = 0; tick < score.meter.ticksPerBar; tick += score.meter.beatTicks) {
            const low = bassLine.find((n) => n.start === tick)
            const sung = melody(score, bar.index).find((n) => n.start <= tick && n.start + n.dur > tick)
            if (!low || !sung) continue
            const s = midisOf([sung])[0]
            const b = midisOf([low])[0]
            strikes++
            if (spellsChord([s, ...midisOf(bar.bass.flat().filter((n) => n.start <= tick && n.start + n.dur > tick))])) chords++
            if (before && s !== before.s && b !== before.b) {
              moves++
              const interval = (s - b) % 12
              if ((interval === 0 || interval === 7) && interval === (before.s - before.b) % 12 && Math.sign(s - before.s) === Math.sign(b - before.b)) parallels++
            }
            before = { s, b }
          }
        }
      }
      expect(strikes).toBeGreaterThan(500)
      expect(chords / strikes, 'a passing note gets a passing chord, not a clash').toBeGreaterThan(0.97)
      // Not zero: a downbeat takes the bass its label names, whatever the tune does.
      expect(parallels / moves).toBeLessThan(0.04)
    })

    it('changes nothing the tune sings, and plays the parts dry', async () => {
      const notes = (score: Score) => score.bars.map((_, i) => melody(score, i).map((n) => `${n.start}:${n.dur}:${n.pitches}`).join()).join('/')
      for (const score of (await hymns()).slice(0, 4)) {
        expect(notes(score)).toBe(notes(renderPlan({ ...score.plan, accompaniment: 'broken' }, score.seed)))
        expect(score.pedal, 'four moving parts under a pedal blur into one another').toBe('dry')
      }
      expect(renderPlan(plan({ style: 'debussy', accompaniment: 'sustained' }), 1).pedal).toBe('half')
    })
  })

  it('spreads a Chopin left hand open over its bass, not Alberti in close position', async () => {
    // His brief: a wide-span left-hand arpeggio, not Alberti. The broken
    // figure was a close triad an octave over a held bass, rocking inside a
    // fifth — E3 B3 E3 B3.
    const planner = new HeuristicPlanner()
    const reach = async (style: CompositionPlan['style']) => {
      const spans: { from: number; to: number }[] = []
      for (let seed = 1; seed <= 16; seed++) {
        const { plan: drawn } = await planner.plan({ style, bars: 16, pick: 'sample', seed, brief: true })
        const score = renderPlan({ ...drawn, accompaniment: 'broken' }, seed)
        const key = keyInfo(drawn.key)
        for (const bar of score.bars) {
          const [bass, figure] = bar.bass
          if (!figure || bar.split || resolveChord(key, bar.plan.chord).fixedBass || !figure.some((n) => n.start % score.meter.beatTicks !== 0)) continue
          const low = midisOf(bass)[0]
          spans.push({ from: Math.min(...midisOf(figure)) - low, to: Math.max(...midisOf(figure)) - low })
        }
      }
      return spans
    }
    // Open: from the fifth over the bass to at least the tenth.
    const open = (spans: { from: number; to: number }[]) => spans.filter((span) => span.from <= 8 && span.to >= 15).length / spans.length
    const chopin = await reach('chopin')
    expect(chopin.length).toBeGreaterThan(100)
    expect(open(chopin), 'from the fifth over the bass to the tenth').toBeGreaterThan(0.8)
    expect(open(await reach('beethoven')), 'Beethoven keeps his close figures').toBeLessThan(0.2)
  })

  it('breaks a chord without holes, even under a low tune', async () => {
    const planner = new HeuristicPlanner()
    let moving = 0
    let stumbling = 0
    for (const style of STYLE_IDS) {
      for (let seed = 1; seed <= 6; seed++) {
        const { plan: drawn } = await planner.plan({ style, bars: 16, pick: 'sample', seed, brief: true })
        const score = renderPlan({ ...drawn, accompaniment: 'broken', register: 'low' }, seed)
        for (const bar of score.bars) {
          const figure = bar.bass[bar.bass.length - 1] ?? []
          if (!figure.some((n) => n.start % score.meter.beatTicks !== 0)) continue
          moving++
          const struck = new Set(figure.map((n) => n.start))
          for (let tick = 0; tick < score.meter.ticksPerBar; tick += 2) {
            if (!struck.has(tick)) {
              stumbling++
              break
            }
          }
        }
      }
    }
    expect(moving).toBeGreaterThan(100)
    expect(stumbling, 'bars whose eighth-note figure drops a note').toBe(0)
  })

  it('sounds the seventh of a seventh chord in a broken figure', async () => {
    // Half the figures play three of four stacked tones. Stacked from the
    // root, the one left out was the seventh: a ii7 or a V7 broken as a triad.
    const planner = new HeuristicPlanner()
    let sevenths = 0
    let missing = 0
    for (const style of STYLE_IDS) {
      for (let seed = 1; seed <= 12; seed++) {
        const { plan: drawn } = await planner.plan({ style, bars: 16, pick: 'sample', seed, brief: true })
        const score = renderPlan({ ...drawn, accompaniment: 'broken' }, seed)
        const key = keyInfo(drawn.key)
        score.bars.forEach((bar) => {
          const chord = resolveChord(key, bar.plan.chord)
          if (bar.plan.chord2 || chord.core.length !== 4) return
          const seventh = midiOf(`${chord.core[3]}4`) % 12
          sevenths++
          if (!bar.bass.flat().some((n) => n.pitches.some((p) => midiOf(p) % 12 === seventh))) missing++
        })
      }
    }
    expect(sevenths).toBeGreaterThan(300)
    // Not zero: the barest bars play only the figure's beats, and there two
    // of the four shapes land on the root and the third.
    expect(missing / sevenths).toBeLessThan(0.05)
  })

  it('keeps an ostinato at one rate while it builds, where the style lives on one', async () => {
    // Zimmer's and Glass's pulse used to thin to quarters under every
    // statement and fill back to eighths after it: the figure changed speed
    // at a third of their barlines. The build is in the weight, not the rate.
    const planner = new HeuristicPlanner()
    const rates = async (style: CompositionPlan['style'], meter: CompositionPlan['meter']) => {
      const seen: number[][] = []
      for (let seed = 1; seed <= 8; seed++) {
        const { plan: drawn } = await planner.plan({ style, bars: 16, pick: 'sample', seed, brief: true })
        const score = renderPlan({ ...drawn, accompaniment: 'pulse', meter }, seed)
        seen.push(score.bars.slice(0, -1).flatMap((bar) => {
          const chords = bar.bass[bar.bass.length - 1] ?? []
          return !bar.split && chords.length >= 2 ? [chords[1].start - chords[0].start] : []
        }))
      }
      return seen
    }
    for (const style of ['hans_zimmer', 'glass'] as const) {
      for (const pieces of [await rates(style, 'four_four'), await rates(style, 'six_eight')]) {
        for (const steps of pieces) expect(new Set(steps), `${style}: one rate a piece`).toEqual(new Set([2]))
      }
    }
    // Where the style has no ostinato, the pulse still follows the form.
    expect((await rates('beethoven', 'four_four')).some((steps) => new Set(steps).size > 1)).toBe(true)
  })

  it('strides in four as a stride does, bass and chord in turn', () => {
    // A stride, a march or a two-feel ballad alternates: bass on one and
    // three, chords on two and four. Four-four used to go bass, chord, chord,
    // chord, the waltz's pattern with a beat added.
    const bars = (['I', 'IV', 'V7', 'I', 'vi', 'ii', 'V7', 'I'] as const).map((chord) => ({ chord, contour: 'arch' as const }))
    for (const meter of ['four_four', 'twelve_eight'] as const) {
      const score = renderPlan(plan({ style: 'laufey', accompaniment: 'stride', motion: 'walking', meter, dynamics: 'mf', bars }), 2)
      const beat = score.meter.beatTicks
      for (const bar of score.bars) {
        const [basses, chords] = bar.bass
        expect(basses.map((n) => n.start), `${meter} bar ${bar.index + 1}: bass on one and three`).toEqual([0, 2 * beat])
        expect(chords.map((n) => n.start), `${meter} bar ${bar.index + 1}: chords on two and four`).toEqual([beat, 3 * beat])
        const chord = resolveChord(keyInfo('C_major'), bar.plan.chord)
        const [one, three] = basses.map((n) => midisOf([n])[0] % 12)
        expect(three, `${meter} bar ${bar.index + 1}: the bass alternates to the fifth`).toBe(midiOf(`${chord.core[2]}4`) % 12)
        expect(one).not.toBe(three)
      }
    }
    // A waltz is still bass, chord, chord.
    const waltz = renderPlan(plan({ accompaniment: 'stride', meter: 'three_four', dynamics: 'mf', bars }), 2)
    for (const bar of waltz.bars) expect(bar.bass.map((voice) => voice.map((n) => n.start))).toEqual([[0], [4, 8]])
  })

  it('changes the accompaniment without changing the tune', () => {
    const tuneOf = (score: Score) => score.bars.map((_, i) => melody(score, i).map((n) => `${n.start}:${n.dur}:${n.pitches}`).join()).join('/')
    const reference = renderPlan(plan({ accompaniment: 'broken' }), 5)
    const parts = new Set<string>()
    for (const accompaniment of ACCOMPANIMENT_IDS as readonly AccompanimentId[]) {
      const made = plan({ accompaniment })
      const score = renderPlan(made, 5)
      parts.add(score.bars.map((_, i) => midisOf(under(score, i)).join()).join('/'))
      // The tune a pattern gets is the reference tune, with at most its
      // statements' openings silenced, and notes held over a barline in
      // place of the ones struck there, where that pattern owns the downbeat —
      // notes taken away or held on, none changed. Checked bar by bar.
      const expected = reference.bars.map((bar, i) => {
        const heldAt = new Set(melody(score, i).filter((n) => n.tied).map((n) => n.start))
        const entry = enteringAfter(made, { position: barPositions(made.form, 4)[i], meter: reference.meter })
        return { ...bar, treble: [silenceUntil(melody(reference, i), entry).filter((n) => !heldAt.has(n.start))] }
      })
      const struck = { ...score, bars: score.bars.map((bar, i) => ({ ...bar, treble: [melody(score, i).filter((n) => !n.tied)] })) }
      expect(tuneOf(struck), `${accompaniment} changed what the tune sings`).toBe(tuneOf({ ...reference, bars: expected }))
    }
    expect(parts.size, 'but each must change what holds it up').toBe(ACCOMPANIMENT_IDS.length)
  })

  it('holds the tune over a barline only where the accompaniment strikes it', async () => {
    const planner = new HeuristicPlanner()
    let held = 0
    for (const accompaniment of ACCOMPANIMENT_IDS) {
      for (let seed = 1; seed <= 12; seed++) {
        const { plan: drawn } = await planner.plan({ style: 'bach', bars: 16, pick: 'sample', seed, brief: false })
        const made = { ...drawn, accompaniment, motion: 'flowing' as const }
        const score = renderPlan(made, seed)
        const positions = barPositions(made.form, 16)
        score.bars.forEach((_, i) => {
          const first = melody(score, i)[0]
          if (!first?.tied) return
          held++
          expect(['stride', 'counterline'], `${accompaniment} owns no downbeat`).toContain(accompaniment)
          expect(first.start).toBe(0)
          expect(positions[i].phraseFinal || positions[i - 1].phraseFinal || positions[i].role === 'statement').toBe(false)
          const before = melody(score, i - 1)
          const tail = before[before.length - 1]
          expect(tail.start + tail.dur, 'the held note rings up to the barline').toBe(score.meter.ticksPerBar)
          expect(first.pitches, 'and it is the same note, not a new one').toEqual(tail.pitches)
        })
      }
    }
    expect(held, 'an invention and a dance do hold over barlines').toBeGreaterThan(10)
  })

  it('holds a note over the barline only where the line need not leap away from it', async () => {
    // The held note takes the place of the one the bar would have struck, so
    // the move into the bar's next note is the held note's to make. A D4 held
    // in place of a D5 made a Laufey line leap a tenth to F5.
    const planner = new HeuristicPlanner()
    let held = 0
    for (const style of ['bach', 'laufey', 'elijah_fox', 'chopin'] as const) {
      for (let seed = 1; seed <= 24; seed++) {
        const { plan: drawn } = await planner.plan({ style, bars: 16, pick: 'sample', seed, brief: true })
        if (drawn.accompaniment !== 'stride' && drawn.accompaniment !== 'counterline') continue
        const score = renderPlan(drawn, seed)
        const struck = renderPlan({ ...drawn, accompaniment: 'broken' }, seed)
        score.bars.forEach((_, i) => {
          const [head, after] = melody(score, i)
          if (!head?.tied || !after) return
          held++
          const replaced = midisOf([melody(struck, i)[0]])[0]
          const next = midisOf([after])[0]
          const leap = Math.abs(midisOf([head])[0] - next)
          expect(leap, `${style} seed ${seed} bar ${i + 1}`).toBeLessThanOrEqual(Math.max(5, Math.abs(replaced - next)))
        })
      }
    }
    expect(held, 'and it still holds where it can').toBeGreaterThan(40)
  })

  it('plays a held note once, for its whole length', () => {
    const score = renderPlan(plan({ accompaniment: 'counterline', bars: Array.from({ length: 16 }, (_, i) => ({ chord: (['I', 'IV', 'V', 'I'] as const)[i % 4], contour: 'wave' as const })) }), 3)
    const ties = score.bars.flatMap((_, i) => (melody(score, i)[0]?.tied ? [i] : []))
    expect(ties.length).toBeGreaterThan(0)
    const tune = timeline(score, { sustain: false }).filter((n) => n.hand === 'right')
    const struck = score.bars.reduce((n, _, i) => n + melody(score, i).filter((note) => !note.tied).length, 0)
    expect(tune, 'one sounding note per struck note').toHaveLength(struck)
    for (const i of ties) {
      const before = melody(score, i - 1)
      const tail = before[before.length - 1]
      const sounding = tune.filter((n) => n.bar === i - 1 && n.midi === midisOf([tail])[0]).sort((a, b) => b.time - a.time)[0]
      expect(sounding, `bar ${i}'s held note`).toBeDefined()
      expect(sounding!.time + sounding!.duration, 'it sounds on past the barline').toBeGreaterThan(i * score.meter.ticksPerBar * (60 / score.bpm / 4))
    }
  })

  it('brings a return in where its statement came in', () => {
    // An invention's subject enters a sixteenth late. Its return used to
    // replay the rhythm from before that silence, and struck the downbeat.
    const bars = Array.from({ length: 8 }, (_, i) => ({ chord: (['I', 'IV', 'V', 'V'] as const)[i % 4], contour: 'arch' as const }))
    for (const accompaniment of ['counterline', 'stride'] as const) {
      const score = renderPlan(plan({ accompaniment, bars }), 3)
      expect(melody(score, 4)[0].start, `${accompaniment}: the answer enters with the question`).toBe(melody(score, 0)[0].start)
      expect(melody(score, 4)[0].start).toBeGreaterThan(0)
      const end = melody(score, 3)
      expect(end[end.length - 1].start + end[end.length - 1].dur, 'no upbeat into a downbeat the tune does not play').toBeLessThan(score.meter.ticksPerBar)
    }
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
