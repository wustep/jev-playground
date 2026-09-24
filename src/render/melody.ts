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
import { chordAt, note, type BarView, type Slot } from './voice'

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
 * `count` scale steps leading from rung `from` into rung `to`: a turn when
 * there is time to spare, a run when there is not, and never a pitch struck
 * twice. The last step sits a step from `to`, so the next note arrives rather
 * than repeats. Returned as rung indices in [0, size).
 */
export function fioritura(size: number, from: number, to: number, count: number): number[] {
  const inRange = (i: number) => i >= 0 && i < size
  const finishes = [to + 1, to - 1].filter(inRange)
  if (!finishes.length) return Array.from({ length: count }, () => from)
  const distance = (i: number) => Math.min(...finishes.map((f) => Math.abs(i - f)))
  const reachable = (i: number, left: number) => distance(i) <= left && (left - distance(i)) % 2 === 0
  const out: number[] = []
  let at = from
  for (let k = 0; k < count; k++) {
    const left = count - k - 1
    const steps = [at + 1, at - 1].filter((i) => inRange(i) && reachable(i, left))
    let next: number
    if (steps.length) {
      // With time to spare a figure opens away from its goal, upper
      // neighbour first, as a turn does; without, it heads in, closing a
      // turn on the side it has not yet touched.
      const spare = steps.filter((i) => left > distance(i))
      const opened = out.length ? Math.sign(out[0] - from) : 0
      next = spare.length
        ? spare.sort((a, b) => Math.abs(b - to) - Math.abs(a - to) || b - a)[0]
        : steps.sort((a, b) => distance(a) - distance(b) || Math.abs(a - to) - Math.abs(b - to) || (opened > 0 ? a - b : b - a))[0]
    } else {
      // No step works: leap to the nearest note from which one does.
      let best = -1
      for (let i = 0; i < size; i++) {
        if (i === at || !reachable(i, left)) continue
        if (best < 0 || Math.abs(i - at) < Math.abs(best - at) || (Math.abs(i - at) === Math.abs(best - at) && i > best)) best = i
      }
      // At the edge of the ladder even that can fail; then any neighbour
      // that is neither this note nor, on the last step, the next one.
      if (best < 0) best = [at + 1, at - 1, at + 2, at - 2].find((i) => inRange(i) && (left > 0 || i !== to)) ?? at
      next = best
    }
    out.push(next)
    at = next
  }
  return out
}

/**
 * The dressed return. Every note of the tune sounds where it sounded before;
 * the quick notes the rhythm split off behind them (see `ornamentRhythm`)
 * turn around each note or run into the next. The tune is heard whole, and
 * the decoration is only ever between its notes.
 *
 * An earlier version re-derived the weak notes by interpolating between the
 * strong ones. That lost half the tune, and rounding small steps to no step
 * dressed a return in pitches struck twice (E♭ E♭ F F G G).
 */
function dress(bar: BarView, tune: readonly string[], tuneSlots: readonly Slot[], slots: readonly Slot[], lo: number, hi: number): string[] {
  const rungs = ladder(bar.scale, lo, hi)
  if (!rungs.length || !tune.length) return fitTo(tune, slots.length)
  const own = new Map(tuneSlots.map((slot, k) => [slot.start, k]))
  const out: string[] = []
  let k = 0
  for (let i = 0; i < slots.length; ) {
    const mine = own.get(slots[i].start)
    if (mine !== undefined) {
      k = mine
      out.push(tune[k])
      i++
      continue
    }
    let end = i
    while (end < slots.length && !own.has(slots[end].start)) end++
    const from = nearestIndex(rungs, midiOf(tune[k]))
    const to = nearestIndex(rungs, midiOf(tune[k + 1] ?? tune[k]))
    out.push(...fioritura(rungs.length, from, to, end - i).map((rung) => rungs[rung]))
    i = end
  }
  return out
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
  // The run is heard across barlines, so the last two notes before this bar
  // count — reaching back past a one-note cadence bar if need be.
  const tail: number[] = []
  for (let b = bar.index - 1; b >= 0 && tail.length < 2; b--) tail.unshift(...(bar.memory.melody[b]?.pitches ?? []).map(midiOf).slice(-(2 - tail.length)))
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
    // The tune as it comes back: the source's notes on the source's onsets,
    // moved onto this bar's harmony — and, where the return is dressed,
    // decorated between them.
    const related = source.chord === bar.chord.id || commonTones(source.core, bar.chord.core) >= 2
    const shift = rootShift(source.root, bar.chord.root)
    let tune = related ? reconcile(bar, source.pitches, source.slots, isStrong, lo, hi) : transposeFigure(bar, source.pitches, shift, source.slots, isStrong, lo, hi)
    if (bar.position.role === 'climax') {
      // The same figure reaching a third higher — if there is room above it.
      const lifted = transposeFigure(bar, source.pitches, shift + 4, source.slots, isStrong, lo, hi)
      const top = (p: readonly string[]) => Math.max(...p.map(midiOf))
      if (lifted.length && top(lifted) > top(tune)) tune = lifted
    }
    pitches = bar.ornament ? dress(bar, tune, source.slots, slots, lo, hi) : fitTo(tune, slots.length)
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

/**
 * An anacrusis into a returning phrase: one to three notes at the end of the
 * phrase-final bar's rest, stepping up into the pitch the return begins on.
 *
 * Only into returns, because only there is the target already known — the
 * source bar was written earlier in this same pass. The breath survives: at
 * least half a beat of silence stays between the landing and the pickup, so
 * the phrase still ends before the next one leans in.
 */
function pickupInto(bar: BarView, next: BarView | undefined, notes: Note[], plan: CompositionPlan): Note[] {
  if (!next || !bar.position.phraseFinal || bar.isLast || plan.motion === 'sustained') return []
  const source = next.position.returnsFrom === undefined ? undefined : bar.memory.melody[next.position.returnsFrom]
  const target = source?.pitches[0]
  if (!target || !notes.length) return []
  const last = notes[notes.length - 1]
  const restStart = last.start + last.dur
  const count = plan.motion === 'walking' ? 1 : plan.motion === 'flowing' ? 2 : 3
  const unit = plan.motion === 'walking' ? 2 : 1
  const length = count * unit
  const breath = Math.max(1, bar.meter.beatTicks / 2)
  if (bar.meter.ticksPerBar - restStart < length + breath) return []
  const [lo, hi] = REGISTER_RANGE[plan.register]
  const rungs = ladder(bar.scale, lo - 5, hi)
  const goal = nearestIndex(rungs, midiOf(target))
  // Approach from below, as an upbeat does — from above only if there is no room under it.
  const direction = goal - count >= 0 ? -1 : 1
  const out: Note[] = []
  for (let k = 0; k < count; k++) {
    const rung = rungs[clamp(goal + direction * (count - k), 0, rungs.length - 1)]
    out.push(note(bar.meter.ticksPerBar - length + k * unit, unit, rung, bar.velocity - 6))
  }
  return out
}

/**
 * How long a fresh statement waits after the downbeat — only where the
 * accompaniment owns it. An invention's second voice takes beat one and the
 * subject answers a sixteenth later; a dance bass takes beat one and the tune
 * comes in on the off-beat. Every generated tune used to attack every
 * downbeat; a mazurka's attacks 56% of them. Returns keep their source's
 * entry, so they are never shifted here.
 */
export function enteringAfter(plan: CompositionPlan, bar: Pick<BarView, 'position' | 'meter'>): number {
  if (bar.position.role !== 'statement' || bar.position.returnsFrom !== undefined) return 0
  if (plan.accompaniment === 'counterline') return 1
  if (plan.accompaniment === 'stride' && plan.motion !== 'sustained') return Math.max(1, bar.meter.beatTicks / 2)
  return 0
}

/**
 * Silence a bar's opening until `entry`: notes that end before it go, the one
 * sounding across it is shaved to start there, and nothing else changes.
 *
 * Applied AFTER the tune is written and remembered, never before. Shifting
 * the rhythm first moved the contour, which moved every later bar that
 * recalled this one — so a late entry quietly rewrote the whole tune. Done
 * last, it only takes notes away.
 */
export function silenceUntil(notes: readonly Note[], entry: number): Note[] {
  if (!entry) return [...notes]
  return notes.flatMap((n) => (n.start >= entry ? [n] : n.start + n.dur > entry ? [{ ...n, start: entry, dur: n.start + n.dur - entry }] : []))
}

/** Write the whole singing line, bar by bar, before anything accompanies it. */
export function writeMelody(plan: CompositionPlan, bars: readonly BarView[]): MelodyBar[] {
  return bars.map((bar, index) => {
    const recalled = bar.position.returnsFrom === undefined ? undefined : bar.memory.melody[bar.position.returnsFrom]
    const slots = melodyRhythm({
      motion: plan.motion,
      meter: bar.meter,
      position: bar.position,
      isLast: bar.isLast,
      rand: bar.rand,
      recall: recalled?.slots,
      ornament: bar.ornament,
    })
    const pitches = melodyPitches(bar, slots, plan.register)
    const sung = slots.slice(0, pitches.length).map((slot, k) => note(slot.start, slot.dur, pitches[k], bar.velocity))
    const notes = silenceUntil([...sung, ...pickupInto(bar, bars[index + 1], sung, plan)], enteringAfter(plan, bar))
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
