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
import { slotsFrom, type Slot } from './voice'
import type { MeterInfo } from './score'
import type { StyleVoice } from './styleVoice'

/** A way to divide one beat, and how often it is chosen among its size. */
interface Cell {
  durations: number[]
  weight: (lilt: Lilt) => number
}

export type Lilt = StyleVoice['lilt']

const always = () => 1
const cell = (durations: number[], weight: (lilt: Lilt) => number = always): Cell => ({ durations, weight })

/**
 * Ways one felt beat can be divided, by how many attacks they contain.
 * Simple beats (a quarter, 4 ticks) and compound beats (a dotted quarter,
 * 6 ticks) get their own tables; everything else falls back to filling evenly.
 *
 * The cells used to be drawn uniformly, which made a third of all two-note
 * beats a snap (sixteenth, dotted eighth) that no reference tune plays, and
 * dotted a third more whatever the style. A two-note beat is now even or
 * dotted by the style's `lilt`; three-note beats lead with the longer note.
 */
const SIMPLE_CELLS: Record<number, Cell[]> = {
  1: [cell([4])],
  2: [cell([2, 2], (lilt) => 1 - lilt.dotted), cell([3, 1], (lilt) => lilt.dotted)],
  3: [cell([2, 1, 1], () => 0.5), cell([1, 1, 2], () => 0.35), cell([1, 2, 1], () => 0.15)],
  4: [cell([1, 1, 1, 1])],
}
const COMPOUND_CELLS: Record<number, Cell[]> = {
  1: [cell([6])],
  2: [cell([4, 2], () => 0.6), cell([2, 4], () => 0.25), cell([3, 3], () => 0.15)],
  3: [cell([2, 2, 2])],
  4: [cell([2, 2, 1, 1], () => 0.45), cell([1, 1, 2, 2], () => 0.3), cell([2, 1, 1, 2], () => 0.25)],
  6: [cell([1, 1, 1, 1, 1, 1])],
}

function cellsFor(beatTicks: number): Record<number, Cell[]> {
  if (beatTicks === 6) return COMPOUND_CELLS
  if (beatTicks === 4) return SIMPLE_CELLS
  return { 1: [cell([beatTicks])], 2: [cell([Math.ceil(beatTicks / 2), Math.floor(beatTicks / 2)])] }
}

/** Neutral: the lilt of a style with no habit either way. */
const PLAIN: Lilt = { dotted: 0.2, anticipate: 0 }

function drawCell(cells: readonly Cell[], lilt: Lilt, rand: () => number): number[] {
  const weights = cells.map((c) => Math.max(0, c.weight(lilt)))
  const total = weights.reduce((a, b) => a + b, 0)
  if (total <= 0) return cells[0].durations
  let at = rand() * total
  for (let i = 0; i < cells.length; i++) if ((at -= weights[i]) < 0) return cells[i].durations
  return cells[cells.length - 1].durations
}

/**
 * Strike the half-bar half a beat early and hold it across: the note before
 * gives up its second half, or, where it is already an off-beat note, is
 * held on over the half-bar instead of the half-bar being struck. Only in a
 * duple or quadruple bar of simple beats, where the half-bar is the one the
 * ear leans on.
 */
function anticipate(rhythm: number[], meter: MeterInfo): number[] {
  const slots = slotsFrom(rhythm)
  const target = meter.splitTick
  const half = meter.beatTicks / 2
  const at = slots.findIndex((slot) => slot.start === target)
  if (at < 1 || rhythm.some((value) => value < 0)) return rhythm
  const before = slots[at - 1]
  const out = slots.map((slot) => ({ ...slot }))
  if (before.start >= target - half) {
    out[at - 1].dur += out[at].dur
    out.splice(at, 1)
  } else {
    out[at - 1].dur -= half
    out[at].start -= half
    out[at].dur += half
  }
  return out.map((slot) => slot.dur)
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
   * The phrase's rhythmic idea, for a bar that develops it rather than
   * returning: its slots before `keep` (in ticks) are kept, the rest of the
   * bar is written fresh.
   */
  motif?: { slots: readonly Slot[]; keep: number }
  /** How the style divides a beat (`StyleVoice.lilt`). */
  lilt?: Lilt
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
  const lilt = options.lilt ?? PLAIN
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
    if (approach) rhythm.push(...(cells[Math.min(2, Math.max(1, Math.round(MOTION_RATE[motion])))]?.[0].durations ?? holdCell(meter.beatTicks)))
    rhythm.push(holdFor)
    const rest = meter.ticksPerBar - holdFrom - holdFor
    if (rest > 0) rhythm.push(-rest)
    return slotsFrom(rhythm)
  }

  // ── ordinary bars ────────────────────────────────────────────────────────
  // A bar that develops the phrase's idea keeps its opening feet. A kept
  // rhythm that ended in a breath runs on instead: only the statement stops
  // to shape its head.
  const kept = options.motif ? options.motif.slots.filter((slot) => slot.start < options.motif!.keep) : []
  const from = kept.length ? Math.ceil(Math.max(options.motif!.keep, kept[kept.length - 1].start + 1) / meter.beatTicks) : 0
  if (kept.length && from >= beats) {
    const whole = kept.map((slot) => ({ ...slot }))
    const tail = whole[whole.length - 1]
    tail.dur = meter.ticksPerBar - tail.start
    return whole
  }
  const rhythm: number[] = []
  if (kept.length) {
    const edge = from * meter.beatTicks
    if (kept[0].start > 0) rhythm.push(-kept[0].start)
    kept.forEach((slot, k) => rhythm.push(Math.min(kept[k + 1]?.start ?? edge, edge) - slot.start))
  }
  for (let beat = from; beat < beats; beat++) {
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
    rhythm.push(...drawCell(cells[nearest], lilt, rand))
  }
  const syncopates = !kept.length && motion !== 'florid' && meter.beatTicks === 4 && beats % 2 === 0
  if (syncopates && lilt.anticipate > 0 && rand() < lilt.anticipate) rhythm.splice(0, rhythm.length, ...anticipate(rhythm, meter))
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
  return slotsFrom(rhythm)
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
  const eligible = (slot: Slot, k: number) => k < recall.length - 1 && slot.dur >= 2
  const chosen = recall.map((slot, k) => eligible(slot, k) && rand() < share)
  // A dressed return that happens to decorate nothing is a clone. Where the
  // draw left every note plain, the longest one that can turn does.
  if (!chosen.some(Boolean)) {
    let longest = -1
    recall.forEach((slot, k) => {
      if (eligible(slot, k) && (longest < 0 || slot.dur > recall[longest].dur)) longest = k
    })
    if (longest >= 0) chosen[longest] = true
  }
  const out: Slot[] = []
  recall.forEach((slot, k) => {
    if (!chosen[k]) {
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
