// Contour-driven melody: the plan says *shape* (rise / fall / arch …), this
// turns a shape into pitches. Strong positions snap to chord tones, weak ones
// to the palette scale, so the line always agrees with the planned harmony.

import { Note } from 'tonal'
import type { ContourId } from '../plan/schema'
import type { BarContext, Slot } from './context'
import { clamp, ladder, midiOf, nearestIndex, tidyNote } from './pitch'

// ── motif memory: the same figure on a new chord ────────────────────────────
//
// A line remembers its first statement (the motif) and its previous bar (the
// figure). Later bars reuse them instead of drawing a fresh contour:
//   restatement   the motif comes back — over a related chord its pitches are
//                 kept and strong beats reconciled with the new harmony; over a
//                 distant chord the whole figure is transposed onto it
//   sequence/echo the previous bar's figure, moved by the interval between the
//                 two chords' roots (a step, a third, a fourth …)
//   development   the head of the motif, transposed onto this chord, then the
//                 fragment once more a step higher or lower — fragmentation
// Transposition is diatonic: pitches move by scale steps of this bar's scale,
// so a sequence changes quality with the harmony the way a real one does.

/** Semitones from `from` to `to` as the smallest move: a fifth up becomes a fourth down. */
export function rootShift(from: string, to: string): number {
  const delta = ((Note.chroma(to) ?? 0) - (Note.chroma(from) ?? 0) + 12) % 12
  return delta > 6 ? delta - 12 : delta
}

/** `pitches` stretched or squeezed to `count` entries, keeping the shape (identity when the counts match). */
export function fitTo(pitches: readonly string[], count: number): string[] {
  if (pitches.length === count || pitches.length === 0) return [...pitches]
  if (count === 1) return [pitches[0]]
  return Array.from({ length: count }, (_, k) => pitches[Math.round((k * (pitches.length - 1)) / (count - 1))])
}

/**
 * Move a figure by `semitones`, diatonically: every pitch steps the same number
 * of rungs along this bar's scale. A figure that would leave [lo, hi] is
 * brought back by an octave. Then strong slots are reconciled with the chord.
 */
function transposeFigure(bar: BarContext, pitches: readonly string[], semitones: number, slots: readonly Slot[], isStrong: (slot: Slot) => boolean, lo: number, hi: number): string[] {
  const rungs = ladder(bar.scale, Math.max(0, lo - 14), Math.min(127, hi + 14))
  const perOctave = bar.scale.length
  if (rungs.length === 0 || pitches.length === 0) return [...pitches]
  const reference = midiOf(pitches[0])
  let steps = nearestIndex(rungs, reference + semitones) - nearestIndex(rungs, reference)
  const moved = () => pitches.map((pitch) => rungs[clamp(nearestIndex(rungs, midiOf(pitch)) + steps, 0, rungs.length - 1)])
  let out = moved()
  const top = Math.max(...out.map(midiOf))
  const bottom = Math.min(...out.map(midiOf))
  if (top > hi && bottom - 12 >= lo) {
    steps -= perOctave
    out = moved()
  } else if (bottom < lo && top + 12 <= hi) {
    steps += perOctave
    out = moved()
  }
  return reconcile(bar, out, slots, isStrong, lo, hi)
}

/** Strong slots must sit on a chord tone: pull any that don't to the nearest one. Weak slots keep the figure's colour. */
function reconcile(bar: BarContext, pitches: readonly string[], slots: readonly Slot[], isStrong: (slot: Slot) => boolean, lo: number, hi: number): string[] {
  const chordRungs = ladder(bar.chord.core, lo, hi)
  const chromas = new Set(bar.chord.core.map((pc) => Note.chroma(pc)))
  return pitches.map((pitch, k) => {
    const slot = slots[k]
    if (!slot || !isStrong(slot) || chromas.has(Note.chroma(pitch)) || chordRungs.length === 0) return pitch
    return chordRungs[nearestIndex(chordRungs, midiOf(pitch))]
  })
}

/** Pitch classes two chords share — I and vi share two; I and bVI share one. */
function commonTones(a: readonly string[], b: readonly string[]): number {
  const chromas = new Set(a.map((pc) => Note.chroma(pc)))
  return b.filter((pc) => chromas.has(Note.chroma(pc))).length
}

/** Which way a development bar's second fragment steps. */
const FRAGMENT_STEP: Record<ContourId, number> = { rise: 1, arch: 1, wave: 1, leap_fall: 1, fall: -1, dip: -1, drop_rise: -1, pendulum: -1, static: 0 }

export interface MelodyOptions {
  lo: number
  hi: number
  /** Which remembered line to continue from (default "melody"). */
  line?: string
  /** A slot is "strong" when it starts on a multiple of this (default: the beat). */
  strongEvery?: number
  /** Override the semitone span of the contour. */
  span?: number
  /** Override the planned contour (e.g. mirrored, for contrary motion). */
  contour?: ContourId
}

export const MIRRORED: Record<ContourId, ContourId> = {
  rise: 'fall',
  fall: 'rise',
  arch: 'dip',
  dip: 'arch',
  static: 'static',
  wave: 'wave',
  leap_fall: 'drop_rise',
  drop_rise: 'leap_fall',
  pendulum: 'pendulum',
}

/** Default semitone span of each contour (a climax bar stretches it). */
const CONTOUR_SPAN: Record<ContourId, number> = { rise: 7, fall: 7, arch: 7, dip: 7, static: 2, wave: 6, leap_fall: 10, drop_rise: 10, pendulum: 10 }

function contourOffset(contour: ContourId, t: number, span: number, k: number): number {
  switch (contour) {
    case 'rise':
      return (t - 0.5) * span
    case 'fall':
      return (0.5 - t) * span
    case 'arch':
      return (Math.sin(Math.PI * t) - 0.35) * span
    case 'dip':
      return (0.35 - Math.sin(Math.PI * t)) * span
    case 'static':
      return k % 2 === 0 ? 0 : 2
    case 'wave':
      return Math.sin(2 * Math.PI * t) * span * 0.5
    case 'leap_fall':
      // Gap-fill: start low, leap, then walk back down through the gap.
      return k === 0 ? -0.3 * span : (0.6 - t * 0.85) * span
    case 'drop_rise':
      return k === 0 ? 0.3 * span : (t * 0.85 - 0.6) * span
    case 'pendulum':
      // Compound melody: an upper and a lower voice taken turns, both drifting down a little.
      return (k % 2 === 0 ? 0.45 : -0.45) * span - t * 2
  }
}

/** One spelled pitch per slot. */
export function melodyPitches(bar: BarContext, slots: readonly Slot[], options: MelodyOptions): string[] {
  const { lo, hi } = options
  const line = options.line ?? 'melody'
  const strongEvery = options.strongEvery ?? bar.meter.beatTicks
  const role = bar.role
  const contour = options.contour ?? bar.plan.contour

  const middle = (lo + hi) / 2 + (role === 'climax' ? 5 : role === 'contrast' ? -4 : 0)
  const last = bar.memory.lines[line]
  // Continue from where the line left off, but drift back toward the middle
  // of the register so eight rising bars don't climb off the staff.
  const reference = last == null ? middle : last * 0.55 + middle * 0.45
  const span = options.span ?? CONTOUR_SPAN[contour] + (role === 'climax' && contour !== 'static' ? 3 : 0)

  const chordRungs = ladder(bar.chord.core, lo, hi)
  const scaleRungs = ladder(bar.scale, lo, hi)
  const isStrong = (slot: Slot) => slot.start % strongEvery === 0 || slot.dur >= bar.meter.beatTicks

  // Thematic memory (see the notes at the top of this file). The rhythm
  // already matches where it should — rhythmFor remembers it the same way.
  const motif = bar.memory.motifs[line]
  const previousFigure = bar.memory.lastFigures[line]
  const isMain = options.contour == null
  let recalled: string[] | undefined
  if ((bar.plan.role === 'sequence' || bar.plan.role === 'echo') && previousFigure && previousFigure.pitches.length > 0 && slots.length > 0) {
    recalled = transposeFigure(bar, fitTo(previousFigure.pitches, slots.length), rootShift(previousFigure.root, bar.chord.root), slots, isStrong, lo, hi)
  } else if (bar.plan.role === 'restatement' && isMain && motif && motif.pitches.length > 0 && slots.length > 0) {
    const fitted = fitTo(motif.pitches, slots.length)
    const related = motif.chord === bar.chord.id || commonTones(motif.core, bar.chord.core) >= 2
    recalled = related ? reconcile(bar, fitted, slots, isStrong, lo, hi) : transposeFigure(bar, fitted, rootShift(motif.root, bar.chord.root), slots, isStrong, lo, hi)
  } else if (bar.plan.role === 'development' && isMain && motif && motif.pitches.length > 1 && slots.length > 1) {
    // Fragmentation: the head of the motif on this chord, then the same fragment a step on.
    const onChord = transposeFigure(bar, motif.pitches, rootShift(motif.root, bar.chord.root), [], () => false, lo, hi)
    const head = Math.ceil(slots.length / 2)
    const cell = fitTo(onChord.slice(0, Math.max(2, Math.min(onChord.length, head))), head)
    const rungs = ladder(bar.scale, Math.max(0, lo - 14), Math.min(127, hi + 14))
    const step = FRAGMENT_STEP[contour]
    const again = cell.map((pitch) => rungs[clamp(nearestIndex(rungs, midiOf(pitch)) + step, 0, rungs.length - 1)]).slice(0, slots.length - head)
    recalled = reconcile(bar, [...cell, ...again], slots, isStrong, lo, hi)
  }

  const pitches: string[] = recalled ? [...recalled] : []
  let previousDesired = reference
  if (!recalled) slots.forEach((slot, k) => {
    const t = slots.length === 1 ? 0.5 : slot.start / bar.meter.ticksPerBar
    const desired = clamp(reference + contourOffset(contour, t, span, k), lo, hi)
    const rungs = isStrong(slot) ? chordRungs : scaleRungs
    let index = nearestIndex(rungs, desired)
    const previous = pitches[k - 1]
    if (previous && contour !== 'static' && midiOf(rungs[index]) === midiOf(previous)) {
      // Don't stutter: step on in the direction the contour is heading.
      const direction = desired >= previousDesired ? 1 : -1
      index = clamp(index + direction, 0, rungs.length - 1)
    }
    pitches.push(rungs[index])
    previousDesired = desired
  })
  if (bar.plan.role === 'statement' && !motif && isMain && pitches.length > 0) {
    bar.memory.motifs[line] = { chord: bar.chord.id, root: bar.chord.root, core: [...bar.chord.core], pitches: [...pitches] }
  }

  // Closing bars land where the ear expects: the tonic if the chord has it.
  if ((role === 'cadence' || bar.isLast) && pitches.length > 0) {
    const tonic = bar.chord.pcs.find((pc) => Note.chroma(pc) === Note.chroma(bar.key.tonic))
    const around = midiOf(pitches[pitches.length - 2] ?? pitches[pitches.length - 1])
    // A register narrower than an octave may not contain the tonic at all; then the line stays where it is.
    const landing = ladder([tonic ?? bar.chord.root], lo, hi)
    if (landing.length > 0) pitches[pitches.length - 1] = landing[nearestIndex(landing, around)]
  }

  if (bar.palette === 'chromatic_approach') {
    for (let k = 0; k < slots.length - 1; k++) {
      const approachable = !isStrong(slots[k]) && isStrong(slots[k + 1]) && slots[k].dur <= 2
      if (approachable && bar.rand() < 0.45) {
        pitches[k] = tidyNote(Note.transpose(pitches[k + 1], '-2m'))
      }
    }
  }

  if (pitches.length > 0) {
    bar.memory.lines[line] = midiOf(pitches[pitches.length - 1])
    bar.memory.lastFigures[line] = { root: bar.chord.root, pitches: [...pitches] }
  }
  return pitches
}

/**
 * Stepwise run through `rungs` from index `from`, `count` notes long, arriving
 * one step away from index `to` so the next beat's anchor is approached by
 * step. Overshoots by neighbour-note turns when the target is too close.
 */
export function stepwiseRun(from: number, to: number, count: number, rungCount: number): number[] {
  const out = [from]
  let current = from
  for (let k = 1; k < count; k++) {
    const movesLeft = count - k + 1 // including the final move onto `to`
    const distance = to - current
    const toward = Math.sign(distance)
    const slack = movesLeft - Math.abs(distance)
    let step: number
    if (slack <= 0) step = toward
    // Even slack: spend two moves on a turn (step away, come back).
    else if (slack % 2 === 0) step = distance === 0 ? (k % 2 === 0 ? -1 : 1) : -toward
    // Odd slack can't be walked off by steps alone: leap a third to fix the
    // parity, or back off so the anchor is approached by a third instead of
    // being hit a sixteenth early and repeated.
    else if (Math.abs(distance) >= 2) step = 2 * toward
    else step = distance === 0 ? 1 : -toward
    current = clamp(current + step, 0, rungCount - 1)
    out.push(current)
  }
  return out
}
