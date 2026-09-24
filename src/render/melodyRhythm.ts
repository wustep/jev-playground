// When the tune attacks — and, just as much, when it does not.
//
// The old renderer picked a rhythm from a per-texture bank keyed only by bar
// role, which is why every lyrical style landed on the same 3ish attacks per
// bar whatever it was labelled: Chopin's nocturne came out at 3.25 melody
// onsets against the reference's 7.25, and Beethoven's Adagio at 2.5 against
// 10.5. Here the subdivision comes from `motion`, which is a plan field, so a
// plan can actually ask for a florid line and get one.
//
// Rests are built in the same place, because a rest is a rhythmic decision
// and not a post-pass: a phrase-final bar lands early and holds, and the
// silence after it is what makes the next phrase an answer.

import { MOTION_RATE, type MotionId } from '../plan/schema'
import type { BarPosition } from '../plan/phrase'
import { choose, slotsFrom, type Slot } from './voice'
import type { MeterInfo } from './score'

/**
 * Ways one felt beat can be divided, by how many attacks they contain.
 * Simple beats (a quarter, 4 ticks) and compound beats (a dotted quarter,
 * 6 ticks) get their own tables; everything else falls back to filling evenly.
 */
const SIMPLE_CELLS: Record<number, number[][]> = {
  1: [[4]],
  2: [[2, 2], [3, 1], [1, 3]],
  3: [[2, 1, 1], [1, 1, 2], [1, 2, 1]],
  4: [[1, 1, 1, 1]],
}
const COMPOUND_CELLS: Record<number, number[][]> = {
  1: [[6]],
  2: [[4, 2], [2, 4], [3, 3]],
  3: [[2, 2, 2]],
  4: [[2, 2, 1, 1], [1, 1, 2, 2], [2, 1, 1, 2]],
  6: [[1, 1, 1, 1, 1, 1]],
}

function cellsFor(beatTicks: number): Record<number, number[][]> {
  if (beatTicks === 6) return COMPOUND_CELLS
  if (beatTicks === 4) return SIMPLE_CELLS
  return { 1: [[beatTicks]], 2: [[Math.ceil(beatTicks / 2), Math.floor(beatTicks / 2)]] }
}

/** How many attacks this beat gets, given the motion's target rate and where we are in the bar. */
function attacksForBeat(motion: MotionId, beat: number, beats: number, rand: () => number): number {
  const rate = MOTION_RATE[motion]
  if (motion === 'sustained') {
    // Fewer than one attack a beat: spread them evenly, but always sound the
    // downbeat. A long-note tune is two or three held notes in a wide bar, not
    // one whole note in every bar whatever the metre — which is what a flat
    // "attack on beat 0 only" produced, and it was monotonous by the fourth bar.
    if (beat === 0) return 1
    return Math.floor((beat + 1) * rate) - Math.floor(beat * rate)
  }
  // Spread the fractional part rather than rounding every beat the same way,
  // so a `flowing` line is not four identical beats in a row.
  const jitter = rand() - 0.5
  // The line leans forward: the middle of the bar is busier than its edges.
  const arc = beats > 1 ? 1 + 0.25 * Math.sin((Math.PI * beat) / (beats - 1 || 1)) : 1
  return Math.max(1, Math.round(rate * arc + jitter * 0.8))
}

/** Longest available cell for a beat: used where the line should hold rather than move. */
const holdCell = (beatTicks: number) => [beatTicks]

export interface RhythmOptions {
  motion: MotionId
  meter: MeterInfo
  position: BarPosition
  isLast: boolean
  rand: () => number
  /** The rhythm this bar is bringing back, if any — a return keeps its own feet. */
  recall?: Slot[]
  /** Decorate the recalled rhythm instead of repeating it literally. */
  ornament?: boolean
  /**
   * Begin a sixteenth after the downbeat, as an invention's subject does.
   * Only fresh statements over a second voice ask for this: there the other
   * voice's downbeat is what the ear hears first, and the entry is the answer.
   */
  enterLate?: boolean
}

/**
 * The slots the tune sounds on in one bar.
 *
 * A phrase-final bar is written backwards from its landing: the arrival note
 * is long, and the remainder of the bar is rest. That is the breath the
 * previous renderer could only approximate with a post-pass that sometimes
 * left the accompaniment sounding through a supposed silence.
 */
export function melodyRhythm(options: RhythmOptions): Slot[] {
  const { motion, meter, position, isLast, rand } = options
  const beats = Math.round(meter.ticksPerBar / meter.beatTicks)
  const cells = cellsFor(meter.beatTicks)

  if (options.recall) return options.ornament ? ornamentRhythm(options.recall, meter, motion, rand) : options.recall

  // ── the landing ──────────────────────────────────────────────────────────
  // Only a cadence breathes. An `open` phrase end is the form saying the
  // thought runs on, so the line runs on with it: a spun-out prelude, a Glass
  // cycle or a displaced-sixteenth vamp has no business stopping every four
  // bars. The last bar always lands, whatever its phrase says.
  if (position.phraseFinal && (position.phraseEnd !== 'open' || isLast)) {
    // Closed phrases land on the downbeat and hold; half cadences get a beat
    // of approach first, so the pause sounds like a question and not a stop.
    const approach = position.phraseEnd === 'half' && beats > 2 && motion !== 'sustained'
    const holdFrom = approach ? meter.beatTicks : 0
    const holdFor = isLast ? meter.ticksPerBar - holdFrom : Math.max(meter.beatTicks, Math.round((meter.ticksPerBar - holdFrom) * (position.phraseEnd === 'closed' ? 0.62 : 0.5)))
    const rhythm: number[] = []
    if (approach) rhythm.push(...(cells[Math.min(2, Math.max(1, Math.round(MOTION_RATE[motion])))] ?? [holdCell(meter.beatTicks)])[0])
    rhythm.push(holdFor)
    const rest = meter.ticksPerBar - holdFrom - holdFor
    if (rest > 0) rhythm.push(-rest)
    return slotsFrom(rhythm)
  }

  // ── ordinary bars ────────────────────────────────────────────────────────
  const entry = options.enterLate ? 1 : 0
  const rhythm: number[] = []
  for (let beat = 0; beat < beats; beat++) {
    const wanted = attacksForBeat(motion, beat, beats, rand)
    if (wanted === 0) {
      // A sustained line ties through: extend the note already sounding.
      const lastIndex = rhythm.length - 1
      if (lastIndex >= 0 && rhythm[lastIndex] > 0) rhythm[lastIndex] += meter.beatTicks
      else rhythm.push(meter.beatTicks)
      continue
    }
    const available = Object.keys(cells).map(Number).sort((a, b) => a - b)
    const nearest = available.reduce((best, n) => (Math.abs(n - wanted) < Math.abs(best - wanted) ? n : best), available[0])
    rhythm.push(...choose(cells[nearest], rand))
  }
  // A statement bar breathes a little at its end even mid-phrase, so the head
  // of the idea is a shape and not a wall of notes.
  if (position.role === 'statement' && motion !== 'sustained' && rhythm.length > 2 && rand() < 0.35) {
    const lastIndex = rhythm.length - 1
    const trim = Math.min(rhythm[lastIndex], meter.beatTicks / 2)
    if (trim >= 1 && rhythm[lastIndex] - trim >= 1) {
      rhythm[lastIndex] -= trim
      rhythm.push(-trim)
    }
  }
  const slots = slotsFrom(rhythm)
  if (!entry || !slots.length || slots[0].start !== 0) return slots
  // Shave the entry off the first note; a sixteenth-long first note goes altogether.
  return slots[0].dur > entry ? [{ start: entry, dur: slots[0].dur - entry }, ...slots.slice(1)] : slots.slice(1)
}

/**
 * The ornamented return: keep the recalled skeleton's onsets, and fill a
 * share of its notes with faster ones. The arrivals survive — so the ear still
 * hears the same tune — while the line has visibly more to say the second
 * time. This is the difference between a repeat and a variation.
 *
 * An earlier version split only notes a full beat long, which a flowing line
 * almost never has: across 72 returning Chopin bars, the ornamented ones came
 * back at exactly the density they left (8.75 attacks a bar, both ways). The
 * nocturne reference goes from 7.25 attacks a bar in its opening to 10.6
 * across the whole, most of the rise in the return. So anything an eighth or
 * longer is eligible now, split into sixteenths behind its own arrival.
 */
function ornamentRhythm(recall: readonly Slot[], meter: MeterInfo, motion: MotionId, rand: () => number): Slot[] {
  // A slow line has more room to decorate; a running one already runs.
  const share = motion === 'sustained' || motion === 'walking' ? 0.75 : motion === 'flowing' ? 0.55 : 0.3
  const out: Slot[] = []
  recall.forEach((slot, k) => {
    const landing = k === recall.length - 1
    if (landing || slot.dur < 2 || rand() >= share) {
      out.push(slot)
      return
    }
    // The arrival keeps its place and a little of its length; the rest turns.
    const head = slot.dur >= meter.beatTicks ? Math.max(1, Math.floor(slot.dur / 2)) : 1
    out.push({ start: slot.start, dur: head })
    for (let t = slot.start + head; t < slot.start + slot.dur; t++) out.push({ start: t, dur: 1 })
  })
  return out
}
