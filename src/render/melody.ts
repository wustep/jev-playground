// Contour-driven melody: the plan says *shape* (rise / fall / arch …), this
// turns a shape into pitches. Strong positions snap to chord tones, weak ones
// to the palette scale, so the line always agrees with the planned harmony.

import { Note } from 'tonal'
import type { ContourId } from '../plan/schema'
import type { BarContext, Slot } from './context'
import { clamp, ladder, midiOf, nearestIndex, nearestNote, tidyNote } from './pitch'

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

export const MIRRORED: Record<ContourId, ContourId> = { rise: 'fall', fall: 'rise', arch: 'dip', dip: 'arch', static: 'static' }

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
  }
}

/** One spelled pitch per slot. */
export function melodyPitches(bar: BarContext, slots: readonly Slot[], options: MelodyOptions): string[] {
  const { lo, hi } = options
  const line = options.line ?? 'melody'
  const strongEvery = options.strongEvery ?? bar.meter.beatTicks
  const role = bar.plan.role
  const contour = options.contour ?? bar.plan.contour

  const middle = (lo + hi) / 2 + (role === 'climax' ? 5 : role === 'contrast' ? -4 : 0)
  const last = bar.memory.lines[line]
  // Continue from where the line left off, but drift back toward the middle
  // of the register so eight rising bars don't climb off the staff.
  const reference = last == null ? middle : last * 0.55 + middle * 0.45
  const span = options.span ?? (contour === 'static' ? 2 : role === 'climax' ? 10 : 7)

  const chordRungs = ladder(bar.chord.core, lo, hi)
  const scaleRungs = ladder(bar.scale, lo, hi)
  const isStrong = (slot: Slot) => slot.start % strongEvery === 0 || slot.dur >= bar.meter.beatTicks

  const pitches: string[] = []
  let previousDesired = reference
  slots.forEach((slot, k) => {
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

  // Closing bars land where the ear expects: the tonic if the chord has it.
  if ((role === 'cadence' || bar.isLast) && pitches.length > 0) {
    const tonic = bar.chord.pcs.find((pc) => Note.chroma(pc) === Note.chroma(bar.key.tonic))
    const around = midiOf(pitches[pitches.length - 2] ?? pitches[pitches.length - 1])
    pitches[pitches.length - 1] = nearestNote([tonic ?? bar.chord.root], around, lo, hi)
  }

  if (bar.palette === 'chromatic_approach') {
    for (let k = 0; k < slots.length - 1; k++) {
      const approachable = !isStrong(slots[k]) && isStrong(slots[k + 1]) && slots[k].dur <= 2
      if (approachable && bar.rand() < 0.45) {
        pitches[k] = tidyNote(Note.transpose(pitches[k + 1], '-2m'))
      }
    }
  }

  if (pitches.length > 0) bar.memory.lines[line] = midiOf(pitches[pitches.length - 1])
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
