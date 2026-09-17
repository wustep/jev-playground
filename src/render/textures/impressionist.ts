import type { MeterId } from '../../plan/schema'
import { note, pieceChoice, rhythmFor, slotsFrom, type BarContext, type BarNotes, type RhythmBank } from '../context'
import { melodyPitches } from '../melody'
import { clamp, ladder, midiOf, nearestIndex, nearestNote } from '../pitch'
import type { Voice } from '../score'
import { bassPartner, lowBass } from '../voiceLeading'

// ── parallel planing ────────────────────────────────────────────────────────

const FLOATING: Record<MeterId, RhythmBank> = {
  four_four: {
    main: [[8, 4, 4], [6, 2, 8], [4, 4, 8], [-2, 6, 4, 4], [-2, 2, 4, 8]],
    busy: [[4, 4, 4, 4], [4, 2, 2, 4, 4], [-2, 2, 2, 2, 4, 4]],
    sparse: [[8, 8], [12, 4], [-4, 12]],
    pause: [[4, 12], [-2, 14]],
    close: [[4, 12]],
  },
  three_four: {
    main: [[8, 4], [4, 4, 4], [6, 2, 4], [-2, 6, 4], [-2, 2, 4, 4]],
    busy: [[4, 2, 2, 4], [2, 2, 4, 4], [-2, 2, 2, 2, 4]],
    sparse: [[12], [8, 4], [-4, 8]],
    pause: [[4, 8]],
    close: [[4, 8]],
  },
  six_eight: {
    main: [[6, 6], [4, 2, 6], [6, 4, 2], [-2, 4, 6], [-2, 2, 2, 6]],
    busy: [[4, 2, 4, 2], [2, 2, 2, 6], [-2, 2, 2, 4, 2]],
    sparse: [[12], [6, 6], [-6, 6]],
    pause: [[6, 6]],
    close: [[6, 6]],
  },
}

export function parallelPlaning(bar: BarContext): BarNotes {
  const { meter, velocity } = bar
  const slots = slotsFrom(rhythmFor(bar, FLOATING[meter.id], 'floating'))
  const tops = melodyPitches(bar, slots, { lo: 65, hi: 84 })

  // Every melody note carries the same chord SHAPE beneath it — two scale
  // thirds stacked down through the palette scale — so the harmony slides in
  // parallel instead of resolving. On a whole-tone palette this yields
  // augmented triads for free; on a pentatonic one, open fourth-ish stacks.
  // Which shape glides is a per-piece choice: stacked thirds (triads), a third
  // with the octave (hollow "enriched unison"), or fourths (quartal).
  const SHAPES = [[4, 2], [7, 2], [6, 3]]
  const [lower, upper] = SHAPES[pieceChoice(bar, 'planing-shape', SHAPES.length)]
  const rungs = ladder(bar.scale, 40, 96)
  const right: Voice = slots.map((slot, k) => {
    const at = nearestIndex(rungs, midiOf(tops[k]))
    const shape = [rungs[clamp(at - lower, 0, at)], rungs[clamp(at - upper, 0, at)], tops[k]]
    const unique = shape.filter((pitch, i) => shape.findIndex((other) => midiOf(other) === midiOf(pitch)) === i)
    return note(slot.start, slot.dur, unique, velocity + 2)
  })

  // Left hand: a deep open fifth that rings under the whole bar.
  const register = bar.role === 'contrast' ? 48 : 38
  const root = lowBass(bar.chord, bar.memory.bass, register, register - 6, register + 8)
  bar.memory.bass = root
  const fifth = bassPartner(bar.chord, root)
  const pedalTone = bar.role === 'climax' ? [root, fifth, nearestNote([bar.chord.bass], midiOf(root) + 12)] : [root, fifth]
  const left: Voice = [note(0, meter.ticksPerBar, pedalTone, velocity - 8, { roll: true })]
  return { treble: [right], bass: [left] }
}

// ── wash arpeggio ───────────────────────────────────────────────────────────

export function washArpeggio(bar: BarContext): BarNotes {
  const { meter, velocity } = bar
  const half = meter.ticksPerBar / 2
  const leftCount = half / 2

  // Left hand opens the sweep with the classic wide spacing: root, fifth,
  // (octave,) tenth.
  const root = lowBass(bar.chord, bar.memory.bass, 40, 34, 46)
  bar.memory.bass = root
  const [, third, fifth] = bar.chord.core
  const above = (pc: string, floor: number) => ladder([pc], floor + 1, floor + 13)[0] ?? nearestNote([pc], floor + 7)
  const second = bar.chord.bass === fifth ? bar.chord.root : fifth
  const leftPitches = [root, above(second, midiOf(root))]
  if (leftCount === 4) leftPitches.push(above(bar.chord.bass, midiOf(leftPitches[1])))
  leftPitches.push(above(third === bar.chord.bass ? fifth : third, midiOf(leftPitches[leftPitches.length - 1])))

  // Right hand carries on upward through every chord tone, colour tones included.
  const climb = ladder(bar.chord.pcs, midiOf(leftPitches[leftPitches.length - 1]) + 1, 100)
  const busy = bar.role === 'development' || bar.role === 'climax'
  const rightCount = half - leftCount
  const rising = climb.slice(0, rightCount)

  const swell = (k: number, of: number) => velocity - 10 + (12 * k) / Math.max(1, of - 1)
  const left: Voice = leftPitches.map((pitch, k) => note(k, 1, pitch, swell(k, half)))
  const right: Voice = rising.map((pitch, k) => note(leftCount + k, 1, pitch, swell(leftCount + k, half)))

  // …and lands on a long singing note chosen by the bar's contour.
  const peak = midiOf(rising[rising.length - 1] ?? leftPitches[leftPitches.length - 1])
  const [landing] = melodyPitches(bar, [{ start: half, dur: half }], { lo: Math.max(64, peak - 4), hi: Math.max(76, peak + 9) })
  if (busy && !bar.isLast) {
    // Busy bars spill back down instead of resting on the landing note.
    const fall = [...ladder(bar.chord.pcs, 60, midiOf(landing) - 1)].reverse().slice(0, half - 2)
    right.push(note(half, 2, landing, velocity + 8))
    fall.forEach((pitch, k) => right.push(note(half + 2 + k, 1, pitch, velocity - 2 - k)))
    left.push(note(half, half, root, velocity - 6))
  } else {
    right.push(note(half, half, landing, velocity + 8))
  }
  return { treble: [right], bass: [left] }
}
