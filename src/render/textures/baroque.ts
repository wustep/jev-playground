import { Note } from 'tonal'
import type { MeterId } from '../../plan/schema'
import { note, pieceChoice, rhythmFor, slotsFrom, type BarContext, type BarNotes, type RhythmBank, type Slot } from '../context'
import { MIRRORED, melodyPitches, stepwiseRun } from '../melody'
import { clamp, ladder, midiOf, nearestIndex, nearestNote } from '../pitch'
import type { Voice } from '../score'
import { bassFor, essentialTones, leadVoicing, sortAscending } from '../voiceLeading'

// ── chorale ─────────────────────────────────────────────────────────────────

const SOPRANO: Record<MeterId, RhythmBank> = {
  four_four: {
    main: [[4, 4, 4, 4], [4, 2, 2, 4, 4], [4, 4, 2, 2, 4], [6, 2, 4, 4], [4, 4, 6, 2]],
    busy: [[2, 2, 2, 2, 4, 4], [4, 2, 2, 2, 2, 4], [2, 2, 4, 2, 2, 4], [6, 2, 2, 2, 4]],
    sparse: [[8, 4, 4], [4, 4, 8], [8, 8]],
    pause: [[4, 8, -4], [6, 2, 4, -4]],
    close: [[12, -4], [8, 4, -4]],
  },
  three_four: {
    main: [[4, 4, 4], [4, 2, 2, 4]],
    busy: [[2, 2, 2, 2, 4], [2, 2, 4, 4]],
    sparse: [[8, 4]],
    pause: [[4, 4, -4], [8, -4]],
    close: [[8, -4]],
  },
  six_eight: {
    main: [[4, 2, 4, 2], [6, 4, 2]],
    busy: [[2, 2, 2, 4, 2], [2, 2, 2, 2, 2, 2]],
    sparse: [[6, 6]],
    pause: [[6, -6]],
    close: [[6, -6]],
  },
  two_four: {
    main: [[4, 4], [2, 2, 4], [4, 2, 2], [6, 2]],
    busy: [[2, 2, 2, 2], [2, 2, 4]],
    sparse: [[8], [4, 4]],
    pause: [[4, -4], [2, 2, -4]],
    close: [[4, -4]],
  },
  nine_eight: {
    main: [[6, 6, 6], [4, 2, 4, 2, 6], [6, 4, 2, 6]],
    busy: [[2, 2, 2, 2, 2, 2, 6], [4, 2, 4, 2, 4, 2]],
    sparse: [[6, 12], [12, 6]],
    pause: [[6, 6, -6], [12, -6]],
    close: [[12, -6]],
  },
  twelve_eight: {
    main: [[6, 6, 6, 6], [4, 2, 4, 2, 4, 2, 4, 2], [6, 6, 4, 2, 6]],
    busy: [[2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2], [4, 2, 4, 2, 4, 2, 6]],
    sparse: [[12, 12], [8, 8, 8]],
    pause: [[12, 6, -6], [6, 12, -6]],
    close: [[18, -6]],
  },
}

const INNER_SPANS: Record<MeterId, number[]> = {
  four_four: [8, 8],
  three_four: [12],
  two_four: [4, 4],
  six_eight: [6, 6],
  nine_eight: [6, 6, 6],
  twelve_eight: [6, 6, 6, 6],
}

/** Nearest chord tone to `near`, nudged toward pitch classes nobody sings yet. */
function fillVoice(bar: BarContext, covered: Set<number>, near: number, lo: number, hi: number): string {
  const rungs = ladder(bar.chord.core, lo, Math.max(lo, hi))
  if (rungs.length === 0) return nearestNote(bar.chord.core, near, lo - 12, hi + 12)
  let best = rungs[0]
  let bestCost = Infinity
  for (const rung of rungs) {
    const cost = Math.abs(midiOf(rung) - near) + (covered.has(Note.chroma(rung) ?? -1) ? 5 : 0)
    if (cost < bestCost) {
      best = rung
      bestCost = cost
    }
  }
  return best
}

/** Quarter-note bass: root, a chord-tone leap, then a step into the next root. */
function walkingBass(bar: BarContext, slots: readonly Slot[], lo: number, hi: number): string[] {
  const first = bassFor(bar.chord, bar.memory.bass, { lo, hi, allowInversion: bar.index > 0 && !bar.isLast })
  const chordRungs = ladder(bar.chord.core, lo, hi)
  const scaleRungs = ladder(bar.scale, lo - 2, hi + 2)
  const out = [first]
  for (let k = 1; k < slots.length; k++) {
    const current = midiOf(out[k - 1])
    if (k === slots.length - 1 && bar.next) {
      // Approach the next bar's root by step from whichever side we're on.
      const target = midiOf(nearestNote([bar.next.root], current, lo, hi))
      const at = nearestIndex(scaleRungs, target)
      const side = current > target ? 1 : -1
      const approach = scaleRungs[clamp(at + side, 0, scaleRungs.length - 1)]
      out.push(midiOf(approach) === target ? scaleRungs[clamp(at - side, 0, scaleRungs.length - 1)] : approach)
    } else {
      const others = chordRungs.filter((rung) => midiOf(rung) !== current && Math.abs(midiOf(rung) - current) <= 9)
      out.push(others.length ? others[Math.floor(bar.rand() * others.length)] : first)
    }
  }
  bar.memory.bass = first
  return out
}

export function chorale(bar: BarContext): BarNotes {
  const { meter, velocity } = bar
  const sopranoSlots = slotsFrom(rhythmFor(bar, SOPRANO[meter.id], 'chorale'))
  const sopranoPitches = melodyPitches(bar, sopranoSlots, { lo: 62, hi: 79, line: 'soprano' })
  const soprano: Voice = sopranoSlots.map((slot, k) => note(slot.start, slot.dur, sopranoPitches[k], velocity + 6))

  const bassSlots = bar.isLast
    ? [{ start: 0, dur: meter.ticksPerBar }]
    : slotsFrom(Array(meter.ticksPerBar / meter.beatTicks).fill(meter.beatTicks))
  const bassPitches = walkingBass(bar, bassSlots, 40, 58)
  const bass: Voice = bassSlots.map((slot, k) => note(slot.start, slot.dur, bassPitches[k], velocity))

  const spans = bar.isLast ? [meter.ticksPerBar] : INNER_SPANS[meter.id]
  const alto: Voice = []
  const tenor: Voice = []
  let start = 0
  for (const dur of spans) {
    const end = start + dur
    const sounding = (voice: Voice) => voice.filter((n) => n.start < end && n.start + n.dur > start).map((n) => midiOf(n.pitches[0]))
    const ceiling = Math.min(...sounding(soprano)) - 1
    const floor = Math.max(...sounding(bass)) + 1
    const covered = new Set([Note.chroma(sopranoPitches[0]) ?? -1, Note.chroma(bassPitches[0]) ?? -1])

    const altoPitch = fillVoice(bar, covered, bar.memory.lines.alto ?? 65, Math.max(55, floor + 3), Math.min(74, ceiling))
    covered.add(Note.chroma(altoPitch) ?? -1)
    const tenorPitch = fillVoice(bar, covered, bar.memory.lines.tenor ?? 57, Math.max(48, floor), Math.min(65, midiOf(altoPitch) - 1))
    bar.memory.lines.alto = midiOf(altoPitch)
    bar.memory.lines.tenor = midiOf(tenorPitch)
    alto.push(note(start, dur, altoPitch, velocity - 6))
    tenor.push(note(start, dur, tenorPitch, velocity - 6))
    start = end
  }
  return { treble: [soprano, alto], bass: [tenor, bass] }
}

// ── two-voice counterpoint ──────────────────────────────────────────────────

/** Continuous sixteenths: a chord-tone anchor on every beat, stepwise between. */
function runningLine(bar: BarContext, lo: number, hi: number, line: string, mirrored: boolean): string[] {
  const { meter } = bar
  const beats = meter.ticksPerBar / meter.beatTicks
  const anchorSlots = Array.from({ length: beats }, (_, b) => ({ start: b * meter.beatTicks, dur: meter.beatTicks }))
  const anchors = melodyPitches(bar, anchorSlots, { lo: lo + 3, hi: hi - 3, line, contour: mirrored ? MIRRORED[bar.plan.contour] : undefined })
  const rungs = ladder(bar.scale, lo, hi)
  const arrival = nearestNote(bar.next?.core ?? bar.chord.core, midiOf(anchors[anchors.length - 1]), lo, hi)

  const out: string[] = []
  anchors.forEach((anchor, b) => {
    const from = nearestIndex(rungs, midiOf(anchor))
    const to = nearestIndex(rungs, midiOf(anchors[b + 1] ?? arrival))
    const path = stepwiseRun(from, to, meter.beatTicks, rungs.length)
    path.forEach((rung, k) => out.push(k === 0 ? anchor : rungs[rung]))
  })
  return out
}

function walkingEighths(bar: BarContext, lo: number, hi: number, line: string, mirrored: boolean): Voice {
  const slots = Array.from({ length: bar.meter.ticksPerBar / 2 }, (_, k) => ({ start: k * 2, dur: 2 }))
  const pitches = melodyPitches(bar, slots, {
    lo,
    hi,
    line,
    span: 9,
    contour: mirrored ? MIRRORED[bar.plan.contour] : undefined,
  })
  return slots.map((slot, k) => note(slot.start, slot.dur, pitches[k], bar.velocity - 6))
}

/** Shift a line down by `steps` scale degrees (parallel tenths = 9 steps). */
function parallelBelow(bar: BarContext, pitches: string[], steps: number): string[] {
  const rungs = ladder(bar.scale, 24, 100)
  return pitches.map((pitch) => rungs[clamp(nearestIndex(rungs, midiOf(pitch)) - steps, 0, rungs.length - 1)])
}

export function twoVoiceCounterpoint(bar: BarContext): BarNotes {
  const { meter, velocity } = bar
  const RH = { lo: 60, hi: 84 }
  const LH = { lo: 38, hi: 60 }

  if (bar.isLast) {
    // A last flourish into a held tonic over the root.
    const flourish = slotsFrom([...Array(meter.beatTicks).fill(1), meter.ticksPerBar - meter.beatTicks])
    const pitches = melodyPitches(bar, flourish, { ...RH, line: 'upper', contour: 'fall' })
    const root = bassFor(bar.chord, bar.memory.bass, { ...LH, lo: 36, hi: 50, allowInversion: false })
    return {
      treble: [flourish.map((slot, k) => note(slot.start, slot.dur, pitches[k], velocity + 2))],
      bass: [[note(0, meter.ticksPerBar, root, velocity)]],
    }
  }

  const asVoice = (pitches: string[], v: number): Voice => pitches.map((pitch, k) => note(k, 1, pitch, v))
  if (bar.role === 'climax') {
    const upper = runningLine(bar, RH.lo, RH.hi, 'upper', false)
    return { treble: [asVoice(upper, velocity + 4)], bass: [asVoice(parallelBelow(bar, upper, 9), velocity)] }
  }
  // Hands trade the running figure like an invention's subject and answer:
  // every bar, or every two bars, starting in either hand (fixed per piece).
  const every = pieceChoice(bar, 'invention-span', 2) + 1
  const leftStarts = pieceChoice(bar, 'invention-start', 3) === 0
  const rightRuns = (Math.floor(bar.index / every) % 2 === 0) !== leftStarts
  return rightRuns
    ? { treble: [asVoice(runningLine(bar, RH.lo, RH.hi, 'upper', false), velocity + 2)], bass: [walkingEighths(bar, LH.lo, LH.hi, 'lower', true)] }
    : { treble: [walkingEighths(bar, RH.lo + 4, RH.hi - 4, 'upper', false)], bass: [asVoice(runningLine(bar, LH.lo, LH.hi + 2, 'lower', true), velocity + 2)] }
}

// ── broken-chord prelude ────────────────────────────────────────────────────

/**
 * indices: 0 bass · 1 tenor · 2–4 upper voices. The first 4/4 pattern is the
 * C-major prelude's own (1-2-3-4-5-3-4-5, checked against the Mutopia
 * encoding of BWV 846); the others are sibling figures so not every prelude
 * is that prelude.
 */
const PRELUDE_GROUPS: Record<MeterId, { length: number; patterns: number[][] }> = {
  four_four: { length: 8, patterns: [[0, 1, 2, 3, 4, 2, 3, 4], [0, 1, 2, 3, 4, 3, 2, 3], [0, 2, 1, 3, 2, 4, 3, 2], [0, 1, 4, 3, 2, 3, 4, 3]] },
  three_four: { length: 12, patterns: [[0, 1, 2, 3, 4, 3, 2, 3, 4, 3, 2, 3], [0, 1, 2, 3, 4, 2, 3, 4, 2, 3, 4, 3]] },
  six_eight: { length: 6, patterns: [[0, 1, 2, 3, 4, 3], [0, 2, 3, 4, 3, 2], [0, 1, 3, 2, 4, 3]] },
  two_four: { length: 8, patterns: [[0, 1, 2, 3, 4, 2, 3, 4], [0, 1, 2, 3, 4, 3, 2, 3]] },
  nine_eight: { length: 6, patterns: [[0, 1, 2, 3, 4, 3], [0, 2, 3, 4, 3, 2], [0, 1, 3, 2, 4, 3]] },
  twelve_eight: { length: 6, patterns: [[0, 1, 2, 3, 4, 3], [0, 2, 3, 4, 3, 2], [0, 1, 3, 2, 4, 3]] },
}

export function brokenChordPrelude(bar: BarContext): BarNotes {
  const { meter, velocity } = bar
  const center = bar.role === 'climax' ? 72 : bar.role === 'contrast' ? 62 : 67
  const upper = sortAscending(leadVoicing(essentialTones(bar.chord, 3), bar.memory.voicings.upper, center))
  bar.memory.voicings.upper = upper
  const low = bassFor(bar.chord, bar.memory.bass, { lo: 36, hi: 52, allowInversion: bar.index > 0 && !bar.isLast })
  bar.memory.bass = low
  const tenorRungs = ladder(bar.chord.core, midiOf(low) + 3, Math.max(midiOf(low) + 4, midiOf(upper[0]) - 1))
  const tenor = tenorRungs.find((rung) => Note.chroma(rung) !== Note.chroma(low)) ?? tenorRungs[0] ?? nearestNote(bar.chord.core, midiOf(low) + 7)

  if (bar.isLast) {
    return {
      treble: [[note(0, meter.ticksPerBar, upper, velocity, { roll: true })]],
      bass: [[note(0, meter.ticksPerBar, sortAscending([low, tenor]), velocity)]],
    }
  }

  const tones = [low, tenor, ...upper]
  const { length, patterns } = PRELUDE_GROUPS[meter.id]
  // The bar before the end breaks the figure into one free sweep, as the model does.
  const sweep = bar.index === bar.count - 2 && bar.count > 4
  const pattern = sweep ? Array.from({ length }, (_, k) => [0, 1, 2, 3, 4, 3, 2, 1][k % 8]) : patterns[pieceChoice(bar, 'prelude', patterns.length)]
  const treble: Voice = []
  const held: Voice = []
  const bassLine: Voice = []
  for (let start = 0; start < meter.ticksPerBar; start += length) {
    // Notated like the C-major prelude: the bass and tenor are held under the
    // right hand's figure rather than written as detached sixteenths.
    bassLine.push(note(start, length, low, velocity))
    held.push(note(start + 1, length - 1, tenor, velocity - 8))
    pattern.forEach((tone, k) => {
      if (tone >= 2) treble.push(note(start + k, 1, tones[tone], velocity - 4 + (k % 3 === 2 ? 4 : 0)))
    })
  }
  return { treble: [treble], bass: [held, bassLine] }
}
