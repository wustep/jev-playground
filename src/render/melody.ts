// The singing line. One writer, for every style.
//
// This file exists because the previous renderer had no melody: it had 23
// texture functions, each of which invented a tune as a side effect of
// drawing its own figuration, each with its own hardcoded pitch window. All
// 23 windows centred on MIDI 74–76, so a plan could ask for a low cantabile
// Adagio and get the same mid-treble line as everything else.
//
// Here the melody is written first and alone, over the whole piece, before
// anything accompanies it. It owns:
//   • register    — from `plan.register`, a real range, not a texture's habit
//   • subdivision — from `plan.motion` (see melodyRhythm.ts)
//   • the return  — a returning bar brings back the bar it returns from
//   • the breath  — phrase-final bars land, hold and rest
// The accompaniment is then told where the line's floor is, and must stay
// under it (src/render/accompaniment.ts).

import { Note as TonalNote } from 'tonal'
import { REGISTER_RANGE, type CompositionPlan, type ContourId, type RegisterId } from '../plan/schema'
import { melodyRhythm } from './melodyRhythm'
import { clamp, ladder, midiOf, nearestIndex, tidyNote } from './pitch'
import type { Note } from './score'
import { chordAt, note, type BarView, type Remembered, type Slot } from './voice'

/** One finished bar of the tune. */
export interface MelodyBar {
  notes: Note[]
  /** Lowest MIDI sounding in this bar, or undefined where the tune is silent. */
  floor?: number
}

/** Default semitone span of each contour. A climax bar stretches it. */
const CONTOUR_SPAN: Record<ContourId, number> = { rise: 7, fall: 7, arch: 7, dip: 7, wave: 6, leap_fall: 10 }

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
    case 'wave':
      return Math.sin(2 * Math.PI * t) * span * 0.5
    case 'leap_fall':
      // Gap-fill: open with a leap, then walk back down through the gap.
      return k === 0 ? -0.3 * span : (0.6 - t * 0.85) * span
  }
}

/**
 * The window the tune lives in. `register` sets it; the role nudges it —
 * a climax reaches up, a contrast sits lower — but never past the edges, so
 * a low line stays a low line even at its peak.
 */
function windowFor(register: RegisterId, bar: BarView): { lo: number; hi: number; centre: number } {
  const [lo, hi] = REGISTER_RANGE[register]
  const lift = bar.position.role === 'climax' ? 4 : bar.position.role === 'contrast' ? -3 : 0
  return { lo, hi, centre: clamp((lo + hi) / 2 + lift, lo, hi) }
}

/** Semitones from `from` to `to` as the smallest move: a fifth up becomes a fourth down. */
export function rootShift(from: string, to: string): number {
  const delta = ((TonalNote.chroma(to) ?? 0) - (TonalNote.chroma(from) ?? 0) + 12) % 12
  return delta > 6 ? delta - 12 : delta
}

/** `pitches` stretched or squeezed to `count` entries, keeping the shape. */
export function fitTo(pitches: readonly string[], count: number): string[] {
  if (pitches.length === count || pitches.length === 0) return [...pitches]
  if (count === 1) return [pitches[0]]
  return Array.from({ length: count }, (_, k) => pitches[Math.round((k * (pitches.length - 1)) / (count - 1))])
}

/** Pitch classes two chords share — I and vi share two, I and bVI share one. */
function commonTones(a: readonly string[], b: readonly string[]): number {
  const chromas = new Set(a.map((pc) => TonalNote.chroma(pc)))
  return b.filter((pc) => chromas.has(TonalNote.chroma(pc))).length
}

/** Strong slots must sit on a chord tone; weak slots keep the line's colour. */
function reconcile(bar: BarView, pitches: readonly string[], slots: readonly Slot[], isStrong: (slot: Slot) => boolean, lo: number, hi: number): string[] {
  return pitches.map((pitch, k) => {
    const slot = slots[k]
    if (!slot || !isStrong(slot)) return pitch
    const chord = chordAt(bar, slot.start)
    const chromas = new Set(chord.core.map((pc) => TonalNote.chroma(pc)))
    if (chromas.has(TonalNote.chroma(pitch))) return pitch
    const rungs = ladder(chord.core, lo, hi)
    return rungs.length ? rungs[nearestIndex(rungs, midiOf(pitch))] : pitch
  })
}

/** Move a figure diagonally along this bar's scale, then reconcile its strong slots. */
function transposeFigure(bar: BarView, pitches: readonly string[], semitones: number, slots: readonly Slot[], isStrong: (slot: Slot) => boolean, lo: number, hi: number): string[] {
  const rungs = ladder(bar.scale, Math.max(0, lo - 14), Math.min(127, hi + 14))
  if (rungs.length === 0 || pitches.length === 0) return [...pitches]
  const reference = midiOf(pitches[0])
  let steps = nearestIndex(rungs, reference + semitones) - nearestIndex(rungs, reference)
  const moved = () => pitches.map((pitch) => rungs[clamp(nearestIndex(rungs, midiOf(pitch)) + steps, 0, rungs.length - 1)])
  let out = moved()
  const top = Math.max(...out.map(midiOf))
  const bottom = Math.min(...out.map(midiOf))
  // A figure that has left the register comes back by the octave, not by being squashed.
  if (top > hi && bottom - 12 >= lo) {
    steps -= bar.scale.length
    out = moved()
  } else if (bottom < lo && top + 12 <= hi) {
    steps += bar.scale.length
    out = moved()
  }
  return reconcile(bar, out, slots, isStrong, lo, hi)
}

/**
 * The ornamented return: the recalled bar's arrivals land where they landed
 * before, and the slots between them are filled by step. The tune is
 * recognisable and yet has more to say — which is what a varied return is.
 */
function decorate(bar: BarView, source: Remembered, slots: readonly Slot[], isStrong: (slot: Slot) => boolean, lo: number, hi: number): string[] {
  const rungs = ladder(bar.scale, lo, hi)
  if (!rungs.length) return fitTo(source.pitches, slots.length)
  // Where did the source bar arrive, and when?
  const arrivals = source.slots
    .map((slot, k) => ({ tick: slot.start, pitch: source.pitches[k] }))
    .filter((entry, k) => entry.pitch && (k === 0 || isStrong(source.slots[k])))
  if (!arrivals.length) return fitTo(source.pitches, slots.length)
  const out: string[] = []
  for (const slot of slots) {
    // The arrival at or before this slot, and the next one, to step between.
    let at = 0
    while (at + 1 < arrivals.length && arrivals[at + 1].tick <= slot.start) at++
    const here = arrivals[at]
    const next = arrivals[at + 1]
    if (slot.start === here.tick || !next) {
      out.push(here.pitch)
      continue
    }
    const from = nearestIndex(rungs, midiOf(here.pitch))
    const to = nearestIndex(rungs, midiOf(next.pitch))
    const span = Math.max(1, next.tick - here.tick)
    const t = (slot.start - here.tick) / span
    // Between two arrivals, walk; where they are the same note, turn around it.
    const step = from === to ? (t < 0.5 ? 1 : -1) : Math.round((to - from) * t)
    out.push(rungs[clamp(from + step, 0, rungs.length - 1)])
  }
  return reconcile(bar, out, slots, isStrong, lo, hi)
}

/**
 * A line may strike a pitch twice; three in a row is a line that is stuck.
 *
 * Recall stretches a short figure over a longer rhythm, decoration rounds a
 * small step to no step, and a clamped contour presses on its ceiling — each
 * of which repeated one pitch five or six times in the sample audit. Rather
 * than patch each source, the third strike moves to the nearest neighbour,
 * toward wherever the line goes next; on a strong slot it moves to the
 * nearest chord tone instead, so the harmony still lands.
 */
function breakRepeats(bar: BarView, pitches: string[], slots: readonly Slot[], isStrong: (slot: Slot) => boolean, lo: number, hi: number): void {
  // The run is heard across the barline, so the previous bar's tail counts.
  const tail = (bar.memory.melody[bar.index - 1]?.pitches ?? []).slice(-2).map(midiOf)
  const heard = (k: number) => (k >= 0 ? midiOf(pitches[k]) : tail[tail.length + k])
  for (let k = 0; k < pitches.length; k++) {
    const here = midiOf(pitches[k])
    if (here !== heard(k - 1) || here !== heard(k - 2)) continue
    const later = pitches.slice(k + 1).map(midiOf).find((midi) => midi !== here)
    const heading = later === undefined ? (k % 2 === 0 ? 1 : -1) : Math.sign(later - here)
    const strong = isStrong(slots[k])
    const rungs = strong ? ladder(chordAt(bar, slots[k].start).core, lo, hi) : ladder(bar.scale, lo, hi)
    const at = rungs.findIndex((pitch) => midiOf(pitch) === here)
    const around = at >= 0 ? at : nearestIndex(rungs, here)
    const candidates = [around + heading, around - heading].filter((i) => i >= 0 && i < rungs.length && midiOf(rungs[i]) !== here)
    if (candidates.length) pitches[k] = rungs[candidates[0]]
  }
}

/** Chromatic lower neighbours on the weak slot before a strong one. */
function applyChromaticApproach(bar: BarView, slots: readonly Slot[], pitches: string[], isStrong: (slot: Slot) => boolean): void {
  for (let k = 0; k < slots.length - 1; k++) {
    const approachable = !isStrong(slots[k]) && isStrong(slots[k + 1]) && slots[k].dur <= 2
    if (approachable && bar.rand() < 0.45) pitches[k] = tidyNote(TonalNote.transpose(pitches[k + 1], '-2m'))
  }
}

/** One spelled pitch per slot. */
function melodyPitches(bar: BarView, slots: readonly Slot[], register: RegisterId): string[] {
  if (!slots.length) return []
  const { lo, hi, centre } = windowFor(register, bar)
  const contour = bar.contour
  const isStrong = (slot: Slot) => slot.start % bar.meter.beatTicks === 0 || slot.dur >= bar.meter.beatTicks

  const source = bar.position.returnsFrom === undefined ? undefined : bar.memory.melody[bar.position.returnsFrom]
  let pitches: string[]

  if (source && source.pitches.length) {
    const related = source.chord === bar.chord.id || commonTones(source.core, bar.chord.core) >= 2
    if (bar.position.ornamentReturn) {
      pitches = decorate(bar, source, slots, isStrong, lo, hi)
    } else {
      const fitted = fitTo(source.pitches, slots.length)
      pitches = related ? reconcile(bar, fitted, slots, isStrong, lo, hi) : transposeFigure(bar, fitted, rootShift(source.root, bar.chord.root), slots, isStrong, lo, hi)
    }
    if (bar.position.role === 'climax') {
      // The same figure reaching a third higher — if there is room above it.
      const lifted = transposeFigure(bar, fitTo(source.pitches, slots.length), rootShift(source.root, bar.chord.root) + 4, slots, isStrong, lo, hi)
      const top = (p: readonly string[]) => Math.max(...p.map(midiOf))
      if (lifted.length && top(lifted) > top(pitches)) pitches = lifted
    }
  } else {
    // A fresh bar: continue from where the line left off, drifting back toward
    // the middle of the register so eight rising bars do not climb off the staff.
    const last = bar.memory.melodyLast
    const reference = last == null ? centre : last * 0.55 + centre * 0.45
    const span = CONTOUR_SPAN[contour] + (bar.position.role === 'climax' ? 3 : 0)
    pitches = []
    let previousDesired = reference
    slots.forEach((slot, k) => {
      const chord = chordAt(bar, slot.start)
      const t = slots.length === 1 ? 0.5 : slot.start / bar.meter.ticksPerBar
      const desired = clamp(reference + contourOffset(contour, t, span, k), lo, hi)
      const rungs = isStrong(slot) ? ladder(chord.core, lo, hi) : ladder(bar.scale, lo, hi)
      if (!rungs.length) return
      let index = nearestIndex(rungs, desired)
      const previous = pitches[k - 1]
      if (previous && midiOf(rungs[index]) === midiOf(previous)) {
        // Don't stutter: step on in the direction the contour is heading — and
        // where the window's edge blocks that, turn around. A contour pressed
        // against the ceiling at a climax otherwise strikes one note six times.
        const heading = desired >= previousDesired ? 1 : -1
        const onward = index + heading
        index = onward >= 0 && onward < rungs.length ? onward : clamp(index - heading, 0, rungs.length - 1)
      }
      pitches.push(rungs[index])
      previousDesired = desired
    })
    if (bar.palette === 'chromatic_approach') applyChromaticApproach(bar, slots, pitches, isStrong)
  }

  breakRepeats(bar, pitches, slots, isStrong, lo, hi)

  // Closing bars land where the ear expects: the tonic, if the chord has it.
  if ((bar.position.role === 'cadence' || bar.isLast) && pitches.length) {
    const chord = chordAt(bar, slots[slots.length - 1].start)
    const tonic = chord.pcs.find((pc) => TonalNote.chroma(pc) === TonalNote.chroma(bar.key.tonic))
    const landing = ladder([tonic ?? chord.root], lo, hi)
    if (landing.length) {
      const around = midiOf(pitches[pitches.length - 2] ?? pitches[pitches.length - 1])
      pitches[pitches.length - 1] = landing[nearestIndex(landing, around)]
    }
  }
  return pitches
}

/** Write the whole singing line, bar by bar, before anything accompanies it. */
export function writeMelody(plan: CompositionPlan, bars: readonly BarView[]): MelodyBar[] {
  return bars.map((bar) => {
    const recalled = bar.position.returnsFrom === undefined ? undefined : bar.memory.melody[bar.position.returnsFrom]
    const slots = melodyRhythm({
      motion: plan.motion,
      meter: bar.meter,
      position: bar.position,
      isLast: bar.isLast,
      rand: bar.rand,
      recall: recalled?.slots,
      ornament: bar.position.ornamentReturn,
    })
    const pitches = melodyPitches(bar, slots, plan.register)
    const notes = slots.slice(0, pitches.length).map((slot, k) => note(slot.start, slot.dur, pitches[k], bar.velocity))
    if (pitches.length) {
      bar.memory.melodyLast = midiOf(pitches[pitches.length - 1])
      bar.memory.melody[bar.index] = {
        chord: bar.chord.id,
        root: bar.chord.root,
        core: [...bar.chord.core],
        pitches: [...pitches],
        slots: slots.slice(0, pitches.length).map((slot) => ({ ...slot })),
      }
    }
    return { notes, floor: notes.length ? Math.min(...notes.flatMap((n) => n.pitches.map(midiOf))) : undefined }
  })
}
