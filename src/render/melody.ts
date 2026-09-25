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
import { BARS_PER_PHRASE } from '../plan/phrase'
import { REGISTER_RANGE, type CompositionPlan, type ContourId, type RegisterId } from '../plan/schema'
import { melodyRhythm } from './melodyRhythm'
import { clamp, ladder, midiOf, nearestIndex, tidyNote } from './pitch'
import type { Note } from './score'
import { STYLE_VOICES } from './styleVoice'
import { beatsPerBar, chordAt, note, type BarView, type Remembered, type Slot } from './voice'

/** One finished bar of the tune. */
export interface MelodyBar {
  notes: Note[]
  /** Lowest MIDI sounding in this bar, or undefined where the tune is silent. */
  floor?: number
}

/** Default semitone span of each contour. A climax bar stretches it. */
const CONTOUR_SPAN: Record<ContourId, number> = { rise: 7, fall: 7, arch: 7, dip: 7, wave: 6, leap_fall: 10 }

/**
 * A contour's span, fitted to the notes that have to carry it. Two half
 * notes asked to trace a fifth can only leap it: the sustained line used to
 * fall a sixth between its two notes on a `dip`.
 */
function contourSpan(bar: BarView, notes: number): number {
  const base = CONTOUR_SPAN[bar.contour] + (bar.position.role === 'climax' ? 3 : 0)
  return base * clamp((notes + 1) / 5, 0.5, 1)
}

/**
 * How far a fresh bar leans back toward the middle of the register: once
 * where it starts, and again across the bar.
 */
const PULL = 0.35

/**
 * Where the harmony has to be heard in the tune: the downbeat, the middle of
 * a duple or quadruple bar, the arrival of a bar's second chord, and any
 * note held two beats or more. Everywhere else the line may pass through.
 *
 * Every beat used to count. A walking line is one note a beat, so every note
 * of it snapped to a chord tone and the tune came out as a broken chord —
 * A D F D | D F D A — at 38% stepwise motion against 52–70% in the reference
 * tunes.
 *
 * A note held across the half-bar from an off-beat is the note heard there,
 * so it counts too: an anticipation is a chord tone struck early.
 */
export function stressed(bar: Pick<BarView, 'meter' | 'chord2'>, slot: Slot): boolean {
  const { meter } = bar
  if (slot.start === 0 || slot.dur >= 2 * meter.beatTicks) return true
  if (!bar.chord2 && beatsPerBar(meter) % 2 !== 0) return false
  return slot.start === meter.splitTick || (slot.start < meter.splitTick && slot.start + slot.dur > meter.splitTick)
}

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
  const steps = nearestIndex(rungs, reference + semitones) - nearestIndex(rungs, reference)
  const moved = (by: number) => pitches.map((pitch) => rungs[clamp(nearestIndex(rungs, midiOf(pitch)) + by, 0, rungs.length - 1)])
  let out = moved(steps)
  const top = Math.max(...out.map(midiOf))
  const bottom = Math.min(...out.map(midiOf))
  if (top > hi || bottom < lo) {
    // A figure that has left the register comes back by the octave, not by
    // being squashed — or stays where it was, on the new harmony, where the
    // octave would leap away from the note the line just sang. A figure one
    // semitone over the ceiling used to drop a ninth at the barline.
    const octave = top > hi ? steps - bar.scale.length : steps + bar.scale.length
    const fits = (figure: string[]) => figure.every((pitch) => midiOf(pitch) >= lo && midiOf(pitch) <= hi)
    const last = bar.memory.melodyLast ?? (lo + hi) / 2
    const candidates = [moved(octave), moved(0)].filter(fits)
    if (candidates.length) out = candidates.reduce((best, figure) => (Math.abs(midiOf(figure[0]) - last) < Math.abs(midiOf(best[0]) - last) ? figure : best))
  }
  return keepSteps(pitches, reconcile(bar, out, slots, isStrong, lo, hi), ladder(bar.scale, lo, hi), slots, isStrong)
}

/**
 * A moved figure keeps every step its source took. A chromatic note has no
 * rung of its own, so moving it lands on its neighbour's, and reconciling a
 * strong slot to the chord can do the same: the figure came back with a
 * pitch struck twice where the original moved. The weaker of the two steps
 * on again, the way the source went.
 */
function keepSteps(source: readonly string[], moved: string[], rungs: readonly string[], slots: readonly Slot[], isStrong: (slot: Slot) => boolean): string[] {
  for (let k = 1; k < moved.length; k++) {
    const went = Math.sign(midiOf(source[k]) - midiOf(source[k - 1]))
    if (!went || midiOf(moved[k]) !== midiOf(moved[k - 1])) continue
    const weak = slots[k] && !isStrong(slots[k]) ? k : k - 1
    const direction = weak === k ? went : -went
    const at = nearestIndex(rungs, midiOf(moved[weak]))
    const next = rungs[at + direction]
    if (next && (weak + 1 >= moved.length || midiOf(next) !== midiOf(moved[weak + 1]))) moved[weak] = next
  }
  return moved
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
 * `count` notes of figuration between two beats of a running line, as rung
 * indices: every move a step or a skip, never a pitch struck twice, and the
 * arrival on `to` one move after the last of them.
 *
 * Unlike `fioritura`, which must never land its last note on the next one's
 * neighbour's neighbour, this lets a run pass through or a skip absorb the
 * odd step. Filling G to D in three sixteenths, `fioritura` leaps to E and
 * wiggles — E D E | D — where a player runs G F♯ E | D.
 *
 * Fewest skips first, then fewest turns; `prefer` is the figure the beat
 * before used, so a bar tends to repeat one shape on every beat.
 */
export function figureBetween(size: number, from: number, to: number, count: number, prefer?: readonly number[]): number[] {
  const moves = count + 1
  if (count <= 0) return []
  if (moves > 7) return fioritura(size, from, to, count)
  let best: number[] | undefined
  let bestCost = Infinity
  const path: number[] = []
  const walk = (at: number, left: number) => {
    if (left === 0) {
      if (at !== to) return
      let cost = 0
      for (let i = 0; i < path.length; i++) {
        if (Math.abs(path[i]) === 2) cost += 1.5
        if (i > 0 && Math.sign(path[i]) !== Math.sign(path[i - 1])) cost += 1
        if (prefer && prefer[i] !== undefined && prefer[i] !== path[i]) cost += 0.25
      }
      if (cost < bestCost) {
        bestCost = cost
        best = [...path]
      }
      return
    }
    // More distance than two rungs a move can cover: this branch cannot arrive.
    if (Math.abs(to - at) > 2 * left) return
    for (const move of [1, -1, 2, -2]) {
      const next = at + move
      if (next < 0 || next >= size) continue
      path.push(move)
      walk(next, left - 1)
      path.pop()
    }
  }
  walk(from, moves)
  if (!best) return fioritura(size, from, to, count)
  const out: number[] = []
  let at = from
  for (const move of best.slice(0, count)) out.push((at += move))
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

/**
 * Chromatic lower neighbours on the weak slot before a strong one — where
 * the line can reach the neighbour without leaping to it. Replacing the
 * passing note of a run with the semitone under its goal broke the run with
 * a fourth: B♭ A G F became B♭ A E F.
 */
function applyChromaticApproach(bar: BarView, slots: readonly Slot[], pitches: string[], isStrong: (slot: Slot) => boolean): void {
  for (let k = 0; k < slots.length - 1; k++) {
    const approachable = !isStrong(slots[k]) && isStrong(slots[k + 1]) && slots[k].dur <= 2
    if (!approachable || bar.rand() >= 0.45) continue
    const neighbour = tidyNote(TonalNote.transpose(pitches[k + 1], '-2m'))
    const before = k > 0 ? midiOf(pitches[k - 1]) : bar.memory.melodyLast
    if (before === undefined || Math.abs(midiOf(neighbour) - before) <= 4) pitches[k] = neighbour
  }
}

/**
 * A bar of new tune along its contour.
 *
 * The contour starts where the line left off and leans back toward the
 * middle of the register as it goes. It used to be centred on a point
 * between the last note and the middle, so a `rise` after a `rise` dropped a
 * fifth at the barline to start climbing again.
 *
 * A bar that moves faster than the beat is written as a figure: a note on
 * every beat along the contour, and between them the runs and turns of
 * `figureBetween`. Sampling the contour at every note moved it less than a
 * scale step a note, and the line trilled — A♭ B♭ A♭ B♭ — instead of running.
 * A running bar, more than two notes a beat, puts a chord tone on every beat,
 * as figuration outlines its harmony; a flowing one only where it is stressed.
 */
function freshLine(bar: BarView, slots: readonly Slot[], isStrong: (slot: Slot) => boolean, lo: number, hi: number, centre: number): string[] {
  const { contour, meter } = bar
  const beat = meter.beatTicks
  const figured = slots.length >= 1.5 * beatsPerBar(meter)
  const running = slots.length > 2 * beatsPerBar(meter)
  const skeleton = figured ? slots.flatMap((slot, k) => (k === 0 || slot.start % beat === 0 ? [k] : [])) : slots.map((_, k) => k)
  const span = contourSpan(bar, skeleton.length)
  const opening = contourOffset(contour, 0, span, 0)
  const last = bar.memory.melodyLast
  const anchor = last == null ? centre + opening : last + (centre - last) * PULL
  const tOf = (slot: Slot) => (slots.length === 1 ? 0.5 : slot.start / meter.ticksPerBar)
  const desiredAt = (t: number, k: number) => clamp(anchor - opening + contourOffset(contour, t, span, k) + (centre - anchor) * PULL * t, lo, hi)

  const out: string[] = new Array(slots.length)
  let previous = last
  let previousDesired = last ?? desiredAt(0, 0)
  skeleton.forEach((k, j) => {
    const slot = slots[k]
    const chord = chordAt(bar, slot.start)
    const desired = desiredAt(tOf(slot), j)
    const rungs = running || isStrong(slot) ? ladder(chord.core, lo, hi) : ladder(bar.scale, lo, hi)
    if (!rungs.length) return
    let index = nearestIndex(rungs, desired)
    if (previous !== undefined && midiOf(rungs[index]) === previous) {
      // Don't stutter: step on in the direction the contour is heading — and
      // where the window's edge blocks that, turn around. A contour pressed
      // against the ceiling at a climax otherwise strikes one note six times.
      const heading = desired >= previousDesired ? 1 : -1
      const onward = index + heading
      index = onward >= 0 && onward < rungs.length ? onward : clamp(index - heading, 0, rungs.length - 1)
    }
    out[k] = rungs[index]
    previous = midiOf(rungs[index])
    previousDesired = desired
  })
  if (!figured) return out.filter(Boolean)

  const scale = ladder(bar.scale, lo, hi)
  let shape: number[] | undefined
  skeleton.forEach((k, j) => {
    const until = skeleton[j + 1] ?? slots.length
    const count = until - k - 1
    if (count <= 0 || !out[k] || !scale.length) return
    const goal = until < slots.length ? out[until] : undefined
    const from = nearestIndex(scale, midiOf(out[k]))
    const to = nearestIndex(scale, goal ? midiOf(goal) : desiredAt(1, skeleton.length))
    const figure = figureBetween(scale.length, from, to, count, shape)
    figure.forEach((rung, i) => (out[k + 1 + i] = scale[rung]))
    shape = [...figure, to].map((rung, i) => rung - (i ? figure[i - 1] : from))
  })
  return out.every(Boolean) ? out : out.filter(Boolean)
}

/**
 * How far a sequence moves its model: the root's move, or that move an
 * octave the other way, whichever keeps the figure nearer the middle of the
 * register. The nearest root move alone climbed a fourth a bar through a
 * circle of fifths and left the register by the third link.
 */
function sequenceShift(model: Remembered, bar: BarView, centre: number): number {
  const root = rootShift(model.root, bar.chord.root)
  const mean = model.pitches.reduce((sum, pitch) => sum + midiOf(pitch), 0) / model.pitches.length
  const cost = (shift: number) => Math.abs(shift) + 0.6 * Math.abs(mean + shift - centre)
  return [root, root - 12, root + 12].reduce((best, shift) => (cost(shift) < cost(best) ? shift : best))
}

/**
 * One spelled pitch per slot. `model` is the bar a sequence repeats: its
 * figure is carried onto this bar's harmony, the way a return carries its
 * source, but by the root's move and without decoration.
 */
function melodyPitches(bar: BarView, slots: readonly Slot[], register: RegisterId, model?: Remembered): string[] {
  if (!slots.length) return []
  const { lo, hi, centre } = windowFor(register, bar)
  const isStrong = (slot: Slot) => stressed(bar, slot)

  const source = bar.position.returnsFrom === undefined ? undefined : bar.memory.melody[bar.position.returnsFrom]
  let pitches: string[]

  if (!source && model && model.pitches.length === slots.length) {
    pitches = transposeFigure(bar, model.pitches, sequenceShift(model, bar, centre), model.slots, isStrong, lo, hi)
  } else if (source && source.pitches.length) {
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
    pitches = freshLine(bar, slots, isStrong, lo, hi, centre)
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
  // An upbeat into a downbeat the tune leaves to the accompaniment leads nowhere.
  if (enteringAfter(plan, next) > 0) return []
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
 * Whether the accompaniment strikes beat one in the tune's place: an
 * invention's second voice, a dance bass. Only there does the tune enter
 * late or hold over the barline.
 */
const ownsDownbeat = (plan: CompositionPlan) => plan.accompaniment === 'counterline' || (plan.accompaniment === 'stride' && plan.motion !== 'sustained')

/**
 * How long a statement waits after the downbeat — only where the
 * accompaniment owns it. An invention's second voice takes beat one and the
 * subject answers a sixteenth later; a dance bass takes beat one and the tune
 * comes in on the off-beat. Every generated tune used to attack every
 * downbeat; a mazurka's attacks 56% of them.
 *
 * A return enters where its statement entered. It recalls the statement's
 * rhythm as written, before the opening was silenced, so a return that did
 * not silence its own opening struck the downbeat its statement had left to
 * the accompaniment.
 */
export function enteringAfter(plan: CompositionPlan, bar: Pick<BarView, 'position' | 'meter'>): number {
  if (bar.position.role !== 'statement' || !ownsDownbeat(plan)) return 0
  return plan.accompaniment === 'counterline' ? 1 : Math.max(1, bar.meter.beatTicks / 2)
}

/**
 * Chance that the tune holds over a barline the accompaniment strikes. The
 * references hold their top voice over 7 of 15 barlines (BWV 772) and 6 of 15
 * (Op. 6/1); the nocturne, the Adagio, Clair de lune and "Wyoming" strike
 * every one, and there the accompaniment never owns beat one.
 */
const HOLD_OVER = 0.6

/**
 * Hold the tune across a barline the accompaniment strikes: the last note of
 * one bar rings on through the first slot of the next, instead of that slot
 * being struck. No pitch changes — the held note takes the struck note's
 * place — and only where it belongs there: a tone of the new chord, or a
 * suspension that steps into the note after it.
 *
 * Never over a breath (out of a phrase-final bar), into a landing (a
 * phrase-final bar) or into a statement, which enters on its own.
 */
function holdOver(plan: CompositionPlan, bars: readonly BarView[], written: Note[][], chance: () => number): void {
  if (!ownsDownbeat(plan)) return
  for (let i = 1; i < bars.length; i++) {
    const bar = bars[i]
    if (bars[i - 1].position.phraseFinal || bar.position.phraseFinal || bar.position.role === 'statement') continue
    const tail = written[i - 1][written[i - 1].length - 1]
    const [head, after] = written[i]
    if (!tail || !head || !after || tail.start + tail.dur !== bar.meter.ticksPerBar || head.start !== 0) continue
    const held = midiOf(tail.pitches[0])
    const chordTone = chordAt(bar, 0).core.some((pc) => TonalNote.chroma(pc) === held % 12)
    const step = Math.abs(held - midiOf(after.pitches[0]))
    const suspension = head.dur <= bar.meter.beatTicks && step > 0 && step <= 2
    if (!chordTone && !suspension) continue
    if (chance() >= HOLD_OVER) continue
    written[i][0] = { ...head, pitches: [...tail.pitches], tied: true }
  }
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

/** How a bar that does not return carries on the phrase's idea. */
interface Development {
  /** A rhythm repeated exactly: the bar a sequence repeats. */
  recall?: Slot[]
  /** That bar's figure, when the sequence has its shape as well. */
  model?: Remembered
  /** A rhythm developed: kept up to `keep`, fresh after it. */
  motif?: { slots: readonly Slot[]; keep: number }
}

/**
 * What a bar that does not return does with the phrase's idea.
 *
 * Every such bar used to draw its rhythm fresh, beat by beat, so a phrase
 * had no rhythmic identity, and a `sequence` — which the stub plans as the
 * bar before on a new harmony, with the same contour — came out as a
 * different figure altogether.
 *
 *   • A sequence repeats the bar before it: its rhythm always, and its
 *     figure too, moved by the root, where the plan gives it the same
 *     contour. A contour of its own is still heard, on the repeated rhythm.
 *   • A continuation or the climax develops the phrase's opening bar: its
 *     rhythm whole, or its first half with a fresh second half.
 *   • In a chain each phrase grows from the last, so its opening keeps the
 *     first half of the previous phrase's idea.
 */
function development(plan: CompositionPlan, bars: readonly BarView[], index: number): Development {
  const bar = bars[index]
  const { position, memory, meter } = bar
  if (position.returnsFrom !== undefined || position.phraseFinal) return {}
  const opening = position.phrase * BARS_PER_PHRASE
  if (position.role === 'sequence') {
    const model = memory.melody[index - 1]
    if (!model) return {}
    return { recall: model.slots, model: bars[index - 1].contour === bar.contour ? model : undefined }
  }
  if (position.role === 'continuation' || position.role === 'climax') {
    const idea = memory.melody[opening]
    if (!idea || opening === index) return {}
    const draw = bar.rand()
    const keep = draw < 0.4 ? meter.ticksPerBar : draw < 0.8 ? meter.splitTick : 0
    return keep ? { motif: { slots: idea.slots, keep } } : {}
  }
  if (plan.form === 'chain' && index === opening && position.phrase > 0) {
    const idea = memory.melody[opening - BARS_PER_PHRASE]
    return idea ? { motif: { slots: idea.slots, keep: meter.splitTick } } : {}
  }
  return {}
}

/**
 * Write the whole singing line, bar by bar, before anything accompanies it.
 * `hold` is a random stream of its own, so holding over a barline never
 * reshuffles the notes themselves.
 */
export function writeMelody(plan: CompositionPlan, bars: readonly BarView[], hold: () => number): MelodyBar[] {
  const { lilt } = STYLE_VOICES[plan.style]
  const written = bars.map((bar, index) => {
    const recalled = bar.position.returnsFrom === undefined ? undefined : bar.memory.melody[bar.position.returnsFrom]
    const developed = recalled ? {} : development(plan, bars, index)
    const slots = melodyRhythm({
      motion: plan.motion,
      meter: bar.meter,
      position: bar.position,
      isLast: bar.isLast,
      rand: bar.rand,
      recall: recalled?.slots ?? developed.recall,
      ornament: Boolean(recalled) && bar.ornament,
      motif: developed.motif,
      // An anticipated half-bar belongs to the chord it anticipates; where the
      // bar changes chord there, it would sound the old one early.
      lilt: bar.chord2 ? { ...lilt, anticipate: 0 } : lilt,
    })
    const pitches = melodyPitches(bar, slots, plan.register, developed.model)
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
    return notes
  })
  holdOver(plan, bars, written, hold)
  return written.map((notes) => ({ notes, floor: notes.length ? Math.min(...notes.flatMap((n) => n.pitches.map(midiOf))) : undefined }))
}
