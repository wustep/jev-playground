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
// `counterline` is the honest exception. A two-voice invention has no
// accompaniment; it has a second tune. It is exempt from the ceiling and says
// so, and the arranger gives it its own register instead.

import type { AccompanimentId, CompositionPlan } from '../plan/schema'
import { clamp, ladder, midiOf, nearestIndex } from './pitch'
import type { Voice } from './score'
import { bassFor, essentialTones, leadVoicing, lowBass, stackUp } from './voiceLeading'
import { beatsPerBar, chordAt, note, pieceChoice, type BarView } from './voice'
import type { MelodyBar } from './melody'

export interface AccompanimentBar {
  /** Voices that belong on the treble staff (inner chords, the counterline). */
  treble: Voice[]
  /** Voices that belong on the bass staff. */
  bass: Voice[]
}

/** How wide the left hand reaches under the bass, per style. */
export type SpacingId = 'close' | 'open' | 'tenths'
export const SPACING_INTERVAL: Record<SpacingId, number> = { close: 3, open: 7, tenths: 16 }

export interface AccompanimentOptions {
  /** Lowest MIDI the tune sounds this bar. Nothing below may reach it. */
  ceiling: number
  /** 0 bare … 3 full. Derived from the bar's role, not from a plan label. */
  density: 0 | 1 | 2 | 3
  spacing: SpacingId
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
    const low = lowBass(chord, bar.memory.bass, 45, 33, Math.min(52, top - 12))
    bar.memory.bass = low
    bassVoice.push(note(span.start, span.dur, low, bar.velocity - 6))
    if (options.density === 0) continue
    const size = options.density >= 3 ? 4 : options.density >= 2 ? 3 : 2
    const voicing = leadVoicing(essentialTones(chord, size), bar.memory.voicing, Math.min(top - 6, midiOf(low) + 16))
    const capped = voicing.filter((pitch) => midiOf(pitch) < top)
    if (capped.length) {
      bar.memory.voicing = capped
      chordVoice.push(note(span.start, span.dur, capped, bar.velocity - 12))
    }
  }
  return { treble: [], bass: chordVoice.length ? [bassVoice, chordVoice] : [bassVoice] }
}

// ── broken ──────────────────────────────────────────────────────────────────

/** Orders a broken chord can be spread in, low to high and back. */
const BREAK_SHAPES = [
  [0, 1, 2, 1],
  [0, 2, 1, 2],
  [0, 1, 2, 3],
  [0, 2, 3, 2],
]

function broken(bar: BarView, options: AccompanimentOptions): AccompanimentBar {
  const { meter } = bar
  const top = headroom(options.ceiling)
  // One note per half-beat in compound metres, per half-beat in simple ones:
  // continuous under the tune without ever being faster than it can breathe.
  const step = meter.beatTicks >= 6 ? 2 : 2
  const shape = BREAK_SHAPES[pieceChoice(bar.memory, bar.rand, 'break', BREAK_SHAPES.length)]
  const voice: Voice = []
  const bassVoice: Voice = []
  let previousBass: string | undefined = bar.memory.bass
  for (let tick = 0; tick < meter.ticksPerBar; tick += step) {
    const chord = chordAt(bar, tick)
    const k = Math.floor(tick / step)
    if (tick === 0 || (bar.chord2 && tick === meter.splitTick)) {
      // The deep bass note under the figuration, on each new harmony.
      const low = lowBass(chord, previousBass, 43, 31, Math.min(50, top - 14))
      previousBass = low
      bar.memory.bass = low
      const dur = bar.chord2 ? meter.splitTick : meter.ticksPerBar
      bassVoice.push(note(tick, tick === 0 ? dur : meter.ticksPerBar - tick, low, bar.velocity - 4))
    }
    if (options.density === 0 && tick % meter.beatTicks !== 0) continue
    const tones = essentialTones(chord, 4)
    const stack = stackUp(tones, Math.max(midiOf(previousBass ?? 'C3') + 7, top - 22))
    const pick = stack[shape[k % shape.length] % stack.length] ?? stack[0]
    if (!pick || midiOf(pick) >= top) continue
    voice.push(note(tick, step, pick, bar.velocity - 16 + (tick % meter.beatTicks === 0 ? 5 : 0)))
  }
  return { treble: [], bass: [bassVoice, voice].filter((v) => v.length) }
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
      const low = lowBass(chord, previousBass, 43, 31, Math.min(50, top - 14))
      previousBass = low
      bar.memory.bass = low
      bassVoice.push(note(tick, bar.chord2 ? meter.splitTick : meter.ticksPerBar, low, bar.velocity - 4))
    }
    const size = options.density >= 3 ? 3 : 2
    const voicing = leadVoicing(essentialTones(chord, size, { rootless: true }), bar.memory.voicing, top - 10).filter((pitch) => midiOf(pitch) < top)
    if (!voicing.length) continue
    bar.memory.voicing = voicing
    // The pulse leans on the downbeat and stays even after it — that evenness is the point.
    voice.push(note(tick, Math.max(1, step - (step > 2 ? 1 : 0)), voicing, bar.velocity - (tick === 0 ? 10 : 18)))
  }
  return { treble: [], bass: [bassVoice, voice].filter((v) => v.length) }
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
      const low = bassFor(chord, bar.memory.bass, { lo: 31, hi: Math.min(50, top - 16), allowInversion: !bar.isLast && bar.index > 0 })
      bar.memory.bass = low
      bassVoice.push(note(tick, meter.beatTicks, low, bar.velocity))
      if (beats <= 2) continue
      continue
    }
    if (options.density === 0 && beat % 2 === 0) continue
    const size = options.density >= 3 ? 4 : 3
    const voicing = leadVoicing(essentialTones(chord, size), bar.memory.voicing, top - 12).filter((pitch) => midiOf(pitch) < top)
    if (!voicing.length) continue
    bar.memory.voicing = voicing
    chordVoice.push(note(tick, Math.max(1, meter.beatTicks - 1), voicing, bar.velocity - 16))
  }
  return { treble: [], bass: [bassVoice, chordVoice].filter((v) => v.length) }
}

// ── counterline ─────────────────────────────────────────────────────────────

/**
 * Not an accompaniment: a second tune. It runs a register below the first,
 * mostly in contrary motion, on the beat subdivision the melody is not using
 * — so the two lines can be told apart by ear, which is the entire point of
 * two-voice counterpoint.
 */
function counterline(bar: BarView, options: AccompanimentOptions, melody: MelodyBar): AccompanimentBar {
  const { meter } = bar
  const hi = Math.min(options.ceiling - 2, 67)
  const lo = hi - 19
  // Move where the tune holds, hold where the tune moves.
  const melodyOnsets = new Set(melody.notes.map((n) => n.start))
  const step = melody.notes.length <= beatsPerBar(meter) ? Math.max(1, meter.beatTicks / 2) : meter.beatTicks
  const voice: Voice = []
  let previous = bar.memory.counterLast ?? (lo + hi) / 2
  for (let tick = 0; tick < meter.ticksPerBar; tick += step) {
    const chord = chordAt(bar, tick)
    const strong = tick % meter.beatTicks === 0
    const rungs = ladder(strong ? chord.core : bar.scale, lo, hi)
    if (!rungs.length) continue
    // Contrary motion against the tune's direction at this moment.
    const above = melody.notes.filter((n) => n.start <= tick)
    const heading = above.length >= 2 ? Math.sign(midiOf(above[above.length - 1].pitches[0]) - midiOf(above[above.length - 2].pitches[0])) : 0
    const target = clamp(previous - heading * 2, lo, hi)
    let index = nearestIndex(rungs, target)
    if (midiOf(rungs[index]) === previous && rungs.length > 1) index = clamp(index + (heading >= 0 ? -1 : 1), 0, rungs.length - 1)
    const pitch = rungs[index]
    previous = midiOf(pitch)
    // A held tune wants a moving line under it, and the reverse.
    const dur = melodyOnsets.has(tick) && step > 1 ? step : step
    voice.push(note(tick, dur, pitch, bar.velocity - 8))
  }
  bar.memory.counterLast = previous
  const bassVoice: Voice = []
  if (options.density >= 2) {
    const low = lowBass(bar.chord, bar.memory.bass, 40, 31, lo - 5)
    bar.memory.bass = low
    bassVoice.push(note(0, meter.ticksPerBar, low, bar.velocity - 14))
  }
  return { treble: [], bass: [voice, ...(bassVoice.length ? [bassVoice] : [])] }
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
export const PEDAL_FOR: Record<AccompanimentId, 'dry' | 'half' | 'full'> = {
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
}

export function writeAccompaniment(plan: CompositionPlan, bar: BarView, melody: MelodyBar, spacing: SpacingId): AccompanimentBar {
  // With no tune sounding this bar, the accompaniment keeps its own company
  // under where the tune last was, so a rest is a rest and not a hole.
  const ceiling = melody.floor ?? (bar.memory.melodyLast ?? 72) - 2
  return PATTERNS[plan.accompaniment](bar, { ceiling, density: densityFor(bar), spacing }, melody)
}
