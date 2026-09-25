// What holds the tune up. Five patterns, where there used to be 23 textures.
//
// The textures were not five times too many because of breadth — they were
// wrong in kind. Each one wrote a melody *and* an accompaniment together, so
// "does the left hand cover the tune" was a question 23 separate files had to
// get right independently, and several didn't. Here the melody is already
// written, and every pattern below is handed its `ceiling`: the lowest note
// the tune sounds. Nothing may cross it. That single argument is most of
// what "the texture supports the tune" means.
//
// `counterline` is the one pattern that is not support. A two-voice invention
// has no accompaniment; it has a second tune, of equal weight and its own
// rhythm. It still sings in a register of its own under the first voice's
// floor, so the ceiling holds for it too — and the test checks all five.

import type { AccompanimentId, CompositionPlan } from '../plan/schema'
import { Note as TonalNote } from 'tonal'
import { clamp, ladder, midiOf, nearestIndex } from './pitch'
import type { PedalId, Voice } from './score'
import { bassFor, essentialTones, leadVoicing, lowBass, stackUp } from './voiceLeading'
import { beatsPerBar, chordAt, note, pieceChoice, scaleAt, type BarView } from './voice'
import type { MelodyBar } from './melody'

/**
 * Everything under the tune goes on the bass staff. The treble staff is the
 * tune's alone, which is what makes `Bar.treble[0]` the melody by
 * construction rather than by luck.
 */
export interface AccompanimentBar {
  bass: Voice[]
}

export interface AccompanimentOptions {
  /** Lowest MIDI the tune sounds this bar. Nothing below may reach it. */
  ceiling: number
  /** 0 bare … 3 full. Derived from the bar's role, not from a plan label. */
  density: 0 | 1 | 2 | 3
}

/** A safe top for accompaniment voices: clear of the tune by a comfortable step. */
const headroom = (ceiling: number) => Math.max(40, ceiling - 3)

// ── sustained ───────────────────────────────────────────────────────────────

function sustained(bar: BarView, options: AccompanimentOptions): AccompanimentBar {
  const { meter } = bar
  const top = headroom(options.ceiling)
  const split = bar.chord2 ? meter.splitTick : meter.ticksPerBar
  const spans = bar.chord2 ? [{ start: 0, dur: split }, { start: split, dur: meter.ticksPerBar - split }] : [{ start: 0, dur: meter.ticksPerBar }]
  const bassVoice: Voice = []
  const chordVoice: Voice = []
  for (const span of spans) {
    const chord = chordAt(bar, span.start)
    const low = lowBass(chord, bar.memory.bass, 45, Math.min(33, top - 24), Math.min(52, top - 12))
    bar.memory.bass = low
    bassVoice.push(note(span.start, span.dur, withOctave(low, options.density), bar.velocity - 6))
    if (options.density === 0) continue
    const size = options.density >= 3 ? 4 : options.density >= 2 ? 3 : 2
    const voicing = leadVoicing(essentialTones(chord, size), bar.memory.voicing, Math.min(top - 6, midiOf(low) + 16))
    const capped = voicing.filter((pitch) => midiOf(pitch) < top)
    if (capped.length) {
      bar.memory.voicing = capped
      chordVoice.push(note(span.start, span.dur, capped, bar.velocity - 12))
    }
  }
  return { bass: chordVoice.length ? [bassVoice, chordVoice] : [bassVoice] }
}

// ── broken ──────────────────────────────────────────────────────────────────

/** Orders a broken chord can be spread in, low to high and back. */
const BREAK_SHAPES = [
  [0, 1, 2, 1],
  [0, 2, 1, 2],
  [0, 1, 2, 3],
  [0, 2, 3, 2],
]

/**
 * The chord stacked from `from` in whichever inversion fits under `top` —
 * dropping its highest tone only if none does. Stacked root-first, a
 * figure's top note crossed the tune's floor in a fifth of broken bars under
 * a low tune, and was skipped: the arpeggio stumbled, a hole every bar.
 */
function stackUnder(tones: readonly string[], from: number, top: number): string[] {
  for (let size = tones.length; size >= 1; size--) {
    for (let inversion = 0; inversion < tones.length; inversion++) {
      const order = [...tones.slice(inversion), ...tones.slice(0, inversion)].slice(0, size)
      const stack = stackUp(order, from)
      if (midiOf(stack[stack.length - 1]) < top) return stack
    }
  }
  return []
}

function broken(bar: BarView, options: AccompanimentOptions): AccompanimentBar {
  const { meter } = bar
  const top = headroom(options.ceiling)
  // An eighth-note stream in every metre — half a simple beat, a third of a
  // compound one: continuous under the tune without outrunning it.
  const step = 2
  const shape = BREAK_SHAPES[pieceChoice(bar.memory, bar.rand, 'break', BREAK_SHAPES.length)]
  const voice: Voice = []
  const bassVoice: Voice = []
  let previousBass: string | undefined = bar.memory.bass
  for (let tick = 0; tick < meter.ticksPerBar; tick += step) {
    const chord = chordAt(bar, tick)
    const k = Math.floor(tick / step)
    if (tick === 0 || (bar.chord2 && tick === meter.splitTick)) {
      // The deep bass note under the figuration, on each new harmony.
      const low = lowBass(chord, previousBass, 43, Math.min(31, top - 26), Math.min(50, top - 14))
      previousBass = low
      bar.memory.bass = low
      const dur = bar.chord2 ? meter.splitTick : meter.ticksPerBar
      bassVoice.push(note(tick, tick === 0 ? dur : meter.ticksPerBar - tick, low, bar.velocity - 4))
    }
    if (options.density === 0 && tick % meter.beatTicks !== 0) continue
    const tones = essentialTones(chord, 4)
    const stack = stackUnder(tones, Math.max(midiOf(previousBass ?? 'C3') + 7, top - 22), top)
    const pick = stack[shape[k % shape.length] % stack.length] ?? stack[0]
    if (!pick || midiOf(pick) >= top) continue
    voice.push(note(tick, step, pick, bar.velocity - 16 + (tick % meter.beatTicks === 0 ? 5 : 0)))
  }
  return { bass: [bassVoice, voice].filter((v) => v.length) }
}

// ── pulse ───────────────────────────────────────────────────────────────────

function pulse(bar: BarView, options: AccompanimentOptions): AccompanimentBar {
  const { meter } = bar
  const top = headroom(options.ceiling)
  const step = options.density >= 2 ? Math.max(2, meter.beatTicks / 2) : meter.beatTicks
  const voice: Voice = []
  const bassVoice: Voice = []
  let previousBass: string | undefined = bar.memory.bass
  for (let tick = 0; tick < meter.ticksPerBar; tick += step) {
    const chord = chordAt(bar, tick)
    if (tick === 0 || (bar.chord2 && tick === meter.splitTick)) {
      const low = lowBass(chord, previousBass, 43, Math.min(31, top - 26), Math.min(50, top - 14))
      previousBass = low
      bar.memory.bass = low
      bassVoice.push(note(tick, bar.chord2 ? meter.splitTick : meter.ticksPerBar, withOctave(low, options.density), bar.velocity - 4))
    }
    const size = options.density >= 3 ? 3 : 2
    const voicing = leadVoicing(essentialTones(chord, size, { rootless: true }), bar.memory.voicing, top - 10).filter((pitch) => midiOf(pitch) < top)
    if (!voicing.length) continue
    bar.memory.voicing = voicing
    // The pulse leans on the downbeat and stays even after it — that evenness is the point.
    voice.push(note(tick, Math.max(1, step - (step > 2 ? 1 : 0)), voicing, bar.velocity - (tick === 0 ? 10 : 18)))
  }
  return { bass: [bassVoice, voice].filter((v) => v.length) }
}

// ── stride ──────────────────────────────────────────────────────────────────

function stride(bar: BarView, options: AccompanimentOptions): AccompanimentBar {
  const { meter } = bar
  const top = headroom(options.ceiling)
  const beats = beatsPerBar(meter)
  const bassVoice: Voice = []
  const chordVoice: Voice = []
  for (let beat = 0; beat < beats; beat++) {
    const tick = beat * meter.beatTicks
    const chord = chordAt(bar, tick)
    if (beat === 0 || (bar.chord2 && tick === meter.splitTick)) {
      const low = bassFor(chord, bar.memory.bass, { lo: Math.min(31, top - 28), hi: Math.min(50, top - 16), allowInversion: !bar.isLast && bar.index > 0 })
      bar.memory.bass = low
      bassVoice.push(note(tick, meter.beatTicks, withOctave(low, options.density), bar.velocity))
      continue
    }
    if (options.density === 0 && beat % 2 === 0) continue
    const size = options.density >= 3 ? 4 : 3
    const voicing = leadVoicing(essentialTones(chord, size), bar.memory.voicing, top - 12).filter((pitch) => midiOf(pitch) < top)
    if (!voicing.length) continue
    bar.memory.voicing = voicing
    chordVoice.push(note(tick, Math.max(1, meter.beatTicks - 1), voicing, bar.velocity - 16))
  }
  return { bass: [bassVoice, chordVoice].filter((v) => v.length) }
}

// ── counterline ─────────────────────────────────────────────────────────────

/**
 * Not an accompaniment: a second tune, a register below the first.
 *
 * Two-voice counterpoint is clear when the ear can hear that the second voice
 * is *answering* the first, so this does what an invention does:
 *
 *   • The piece's first bar exposes the subject alone. The second voice
 *     waits; a lone low tonic is all that sounds under it.
 *   • The bar after a fresh statement answers it: the same figure, the same
 *     rhythm, an octave lower, re-fitted to this bar's harmony — while the
 *     tune moves on to something new above it.
 *   • Elsewhere it runs free, mostly in contrary motion, moving where the
 *     tune holds and holding where it moves.
 *
 * An earlier version only ever ran free, so an invention came out as two
 * unrelated lines rather than a subject and its answer.
 */
function counterline(bar: BarView, options: AccompanimentOptions, melody: MelodyBar): AccompanimentBar {
  const { meter } = bar
  const hi = Math.min(options.ceiling - 2, 67)
  const lo = hi - 19
  const bassUnder = (): Voice => {
    const top = Math.max(40, lo - 5)
    const low = lowBass(bar.chord, bar.memory.bass, top - 6, top - 12, top)
    bar.memory.bass = low
    return [note(0, meter.ticksPerBar, low, bar.velocity - 14)]
  }

  // The subject, alone.
  if (bar.index === 0) return { bass: [bassUnder()] }

  // The answer, if the bar before stated something new.
  const previous = bar.memory.melody[bar.index - 1]
  const statedFreshly = bar.index === 1 || (bar.position.phrase > 0 && bar.index % 4 === 1)
  if (previous && statedFreshly && previous.pitches.length > 1) {
    const rungs = ladder(bar.scale, lo - 12, hi)
    if (rungs.length) {
      const answer: Voice = []
      previous.slots.forEach((slot, k) => {
        const chord = chordAt(bar, slot.start)
        const strong = slot.start % meter.beatTicks === 0
        let midi = midiOf(previous.pitches[k]) - 12
        while (midi > hi) midi -= 12
        while (midi < lo) midi += 12
        const pool = strong ? ladder(chord.core, lo, hi) : ladder(scaleAt(bar, slot.start), lo, hi)
        if (!pool.length) return
        answer.push(note(slot.start, slot.dur, pool[nearestIndex(pool, midi)], bar.velocity - 6))
      })
      if (answer.length) {
        bar.memory.counterLast = midiOf(answer[answer.length - 1].pitches[0])
        return { bass: options.density >= 2 ? [answer, bassUnder()] : [answer] }
      }
    }
  }

  // Free counterpoint.
  const step = melody.notes.length <= beatsPerBar(meter) ? Math.max(1, meter.beatTicks / 2) : meter.beatTicks
  const voice: Voice = []
  let last = bar.memory.counterLast ?? (lo + hi) / 2
  for (let tick = 0; tick < meter.ticksPerBar; tick += step) {
    const chord = chordAt(bar, tick)
    const strong = tick % meter.beatTicks === 0
    const rungs = ladder(strong ? chord.core : scaleAt(bar, tick), lo, hi)
    if (!rungs.length) continue
    // Contrary motion against the tune's direction at this moment.
    const heard = melody.notes.filter((n) => n.start <= tick)
    const heading = heard.length >= 2 ? Math.sign(midiOf(heard[heard.length - 1].pitches[0]) - midiOf(heard[heard.length - 2].pitches[0])) : 0
    let index = nearestIndex(rungs, clamp(last - heading * 2, lo, hi))
    if (midiOf(rungs[index]) === last && rungs.length > 1) index = clamp(index + (heading >= 0 ? -1 : 1), 0, rungs.length - 1)
    last = midiOf(rungs[index])
    voice.push(note(tick, step, rungs[index], bar.velocity - 8))
  }
  bar.memory.counterLast = last
  return { bass: options.density >= 2 ? [voice, bassUnder()] : [voice] }
}

// ── the dispatcher ──────────────────────────────────────────────────────────

const PATTERNS: Record<AccompanimentId, (bar: BarView, options: AccompanimentOptions, melody: MelodyBar) => AccompanimentBar> = {
  sustained,
  broken,
  pulse,
  stride,
  counterline,
}

/** Sustain that suits each pattern. Not a plan field: the pattern decides. */
export const PEDAL_FOR: Record<AccompanimentId, PedalId> = {
  sustained: 'half',
  broken: 'full',
  pulse: 'half',
  stride: 'half',
  counterline: 'dry',
}

/**
 * Accompaniment density from the bar's role. The old schema asked a planner
 * for an `arrangement` label and then measured that it changed no melody
 * outcome and, on one texture, no left-hand outcome either. The shape it was
 * reaching for is this: thin under a first statement, full at the peak.
 */
export function densityFor(bar: BarView): 0 | 1 | 2 | 3 {
  const byRole = ((): number => {
    switch (bar.position.role) {
      case 'climax':
        return 3
      case 'cadence':
        return bar.isLast ? 3 : 2
      case 'half_cadence':
        return 1
      case 'statement':
        return bar.position.returnsFrom === undefined ? 1 : 2
      case 'contrast':
        return 1
      default:
        return 2
    }
  })()
  // Loudness fills the texture out, softness thins it. `velocity` already
  // carries the plan's dynamic level and shape, so a crescendo builds a
  // fuller accompaniment as well as a louder one — which is most of what a
  // build is — without a separate label to ask for it.
  const byLevel = bar.velocity >= 88 ? 1 : bar.velocity <= 48 ? -1 : 0
  return Math.max(0, Math.min(3, byRole + byLevel)) as 0 | 1 | 2 | 3
}

/**
 * The bass doubled an octave down, at full density — the weight a climax or
 * the top of a build puts under the harmony. Skipped where the octave would
 * fall off the bottom of the piano's useful range.
 */
function withOctave(bass: string, density: number): string[] {
  if (density < 3 || midiOf(bass) - 12 < 28) return [bass]
  return [TonalNote.transpose(bass, '-8P'), bass]
}

/**
 * `lastSung` is the tune's last sounding MIDI before this bar. It is passed in
 * rather than read from `bar.memory.melodyLast`, because by the time anything
 * is accompanied the melody pass has finished, and that field holds the
 * piece's final note, not this bar's neighbour.
 */
export function writeAccompaniment(plan: CompositionPlan, bar: BarView, melody: MelodyBar, lastSung: number | undefined): AccompanimentBar {
  // With no tune sounding this bar, the accompaniment keeps its own company
  // under where the tune last was, so a rest is a rest and not a hole.
  const ceiling = melody.floor ?? (lastSung ?? 72) - 2
  return PATTERNS[plan.accompaniment](bar, { ceiling, density: densityFor(bar) }, melody)
}
