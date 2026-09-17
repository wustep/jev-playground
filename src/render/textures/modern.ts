import { Note } from 'tonal'
import type { BaseRoleId, MeterId } from '../../plan/schema'
import { note, pieceChoice, type BarContext, type BarNotes, type Slot } from '../context'
import { melodyPitches } from '../melody'
import { clamp, ladder, midiOf, nearestIndex, nearestNote } from '../pitch'
import type { Voice } from '../score'
import { bassPartner, essentialTones, leadVoicing, lowBass, sortAscending } from '../voiceLeading'

// ── minimal cells ───────────────────────────────────────────────────────────

/**
 * Cell shapes as indices into the voicing (3 = the bottom note an octave up).
 * A piece picks one family: the plain rocking cell, alternating broken thirds
 * (each second group inverts the first), or a ternary organ-style arpeggio.
 */
const CELL_FAMILIES: Record<'plain' | 'additive' | 'inverted', number[]>[] = [
  { plain: [0, 1, 2, 1], additive: [0, 1, 2, 3, 2, 1], inverted: [2, 1, 0, 1] },
  { plain: [0, 2, 1, 2, 0, 1], additive: [0, 2, 1, 3, 2, 3, 1, 2], inverted: [2, 0, 1, 0, 2, 1] },
  { plain: [0, 1, 2, 3, 2, 1], additive: [0, 1, 2, 3, 2, 1, 2, 3], inverted: [3, 2, 1, 0, 1, 2] },
]

export function minimalCells(bar: BarContext): BarNotes {
  const { meter, velocity } = bar
  const role = bar.role
  const CELLS = CELL_FAMILIES[pieceChoice(bar, 'cell-family', CELL_FAMILIES.length)]
  const lift = role === 'climax' ? 12 : 0
  const voicing = sortAscending(leadVoicing(bar.chord.core.slice(0, 3), bar.memory.voicings.cell, 66))
  bar.memory.voicings.cell = voicing
  const low = lowBass(bar.chord, bar.memory.bass, 43, 36, 50)
  bar.memory.bass = low
  const fifth = bassPartner(bar.chord, low)

  if (bar.isLast) {
    // The machine simply stops: one held sonority.
    return {
      treble: [[note(0, meter.ticksPerBar, voicing, velocity)]],
      bass: [[note(0, meter.ticksPerBar, [low, fifth], velocity - 4)]],
    }
  }

  const octaveUp = (pitch: string, semitones: number) => nearestNote([Note.pitchClass(pitch)], midiOf(pitch) + semitones)
  const tones = [...voicing, octaveUp(voicing[0], 12)].map((pitch) => (lift ? octaveUp(pitch, lift) : pitch))

  // The process: statements loop a plain cell in eighths; development adds a
  // note to the cell and doubles the speed; contrast turns the cell upside down.
  const fast = role === 'development' || role === 'climax'
  const cell = role === 'contrast' ? CELLS.inverted : fast ? CELLS.additive : meter.ticksPerBar === 12 ? [0, 1, 2] : CELLS.plain
  const step = fast ? 1 : 2
  // A rising/falling contour nudges the second half of the bar up/down an inversion.
  const shift = bar.plan.contour === 'rise' ? 1 : bar.plan.contour === 'fall' ? -1 : 0
  const right: Voice = []
  for (let tick = 0, k = 0; tick < meter.ticksPerBar; tick += step, k++) {
    const inSecondHalf = tick >= meter.ticksPerBar / 2
    const index = clamp(cell[k % cell.length] + (inSecondHalf ? shift : 0), 0, tones.length - 1)
    right.push(note(tick, step, tones[index], velocity + (k % cell.length === 0 ? 4 : -4)))
  }

  // Left hand. In 12-tick meters it plays four dotted eighths against the
  // right hand's six eighths — a true 2-against-3. In 4/4 it rocks in eighths.
  const left: Voice = []
  const leftStep = meter.ticksPerBar === 12 ? 3 : 2
  for (let tick = 0, k = 0; tick < meter.ticksPerBar; tick += leftStep, k++) {
    const pitch = role === 'climax' ? [k % 2 === 0 ? low : fifth, octaveUp(k % 2 === 0 ? low : fifth, 12)] : [k % 2 === 0 ? low : fifth]
    left.push(note(tick, leftStep, pitch, velocity - 10))
  }
  return { treble: [right], bass: [left] }
}

// ── syncopated ostinato ─────────────────────────────────────────────────────

type Hit = Slot & { kind: 'stab' | 'line' }
const stab = (start: number, dur: number): Hit => ({ start, dur, kind: 'stab' })
const line = (start: number, dur: number): Hit => ({ start, dur, kind: 'line' })

const RIGHT_HAND: Record<'sixteen' | 'twelve', Record<BaseRoleId, Hit[]>> = {
  sixteen: {
    statement: [stab(3, 3), stab(6, 2), line(10, 2), line(12, 2), line(14, 2)],
    restatement: [stab(3, 3), stab(6, 2), line(10, 2), line(12, 2), line(14, 2)],
    development: [line(0, 2), line(2, 1), line(3, 3), line(6, 2), stab(8, 3), stab(11, 3), line(14, 2)],
    contrast: [stab(0, 6), line(8, 3), line(11, 3), line(14, 2)],
    climax: [stab(0, 3), stab(3, 3), stab(6, 2), stab(8, 3), stab(11, 3), stab(14, 2)],
    half_cadence: [stab(0, 3), stab(3, 5), line(8, 8)],
    cadence: [stab(0, 3), stab(3, 13)],
  },
  twelve: {
    statement: [stab(2, 4), line(6, 2), line(8, 2), line(10, 2)],
    restatement: [stab(2, 4), line(6, 2), line(8, 2), line(10, 2)],
    development: [line(0, 2), line(2, 2), line(4, 2), stab(6, 4), line(10, 2)],
    contrast: [stab(0, 6), line(6, 4), line(10, 2)],
    climax: [stab(0, 4), stab(4, 2), stab(6, 4), stab(10, 2)],
    half_cadence: [stab(0, 6), line(6, 6)],
    cadence: [stab(0, 2), stab(2, 10)],
  },
}

/** Left-hand groupings: 3+3+2 and its rotations in 4/4; 3+3 vs 2+2+2 hemiola in 12-tick bars. */
const OSTINATO: Record<MeterId, number[][]> = {
  four_four: [[3, 3, 2, 3, 3, 2], [3, 3, 2, 3, 3, 2], [3, 2, 3, 3, 3, 2], [2, 3, 3, 2, 3, 3]],
  three_four: [[2, 2, 2, 2, 2, 2], [3, 3, 2, 2, 2]],
  six_eight: [[2, 2, 2, 2, 2, 2], [3, 3, 3, 3]],
}

export function syncopatedOstinato(bar: BarContext): BarNotes {
  const { meter, velocity } = bar
  const role: BaseRoleId = bar.isLast ? 'cadence' : bar.role
  const hits = RIGHT_HAND[meter.ticksPerBar === 16 ? 'sixteen' : 'twelve'][role]

  // One contour-driven top line through every hit; stabs hang an open stack of
  // two scale fourths beneath it (quartal voicing).
  const tops = melodyPitches(bar, hits, { lo: 65, hi: 86, strongEvery: 1 })
  const rungs = ladder(bar.scale, 40, 96)
  const right: Voice = hits.map((hit, k) => {
    if (hit.kind === 'line') return note(hit.start, hit.dur, tops[k], velocity + 6)
    const at = nearestIndex(rungs, midiOf(tops[k]))
    const stack = [rungs[clamp(at - 6, 0, at)], rungs[clamp(at - 3, 0, at)], tops[k]]
    const unique = stack.filter((pitch, i) => stack.findIndex((other) => midiOf(other) === midiOf(pitch)) === i)
    return note(hit.start, hit.dur, unique, velocity + 2, hit.start % meter.beatTicks === 0 ? {} : { accent: true })
  })

  const root = lowBass(bar.chord, bar.memory.bass, 41, 34, 48)
  bar.memory.bass = root
  const fifth = bassPartner(bar.chord, root)
  const colour = nearestNote([bar.chord.extensions[0] ?? bar.chord.core[3] ?? bar.chord.root], midiOf(root) + 13)
  const cycle = [root, fifth, colour]

  if (bar.isLast) {
    const close: Voice = [note(0, 3, root, velocity), note(3, 3, fifth, velocity - 4), note(6, meter.ticksPerBar - 6, colour, velocity - 4)]
    return { treble: [right], bass: [close] }
  }
  const groupings = OSTINATO[meter.id]
  // 4/4 keeps one grouping for the whole piece (a groove); triple metres alternate bar by bar (hemiola).
  const grouping = meter.id === 'four_four' ? groupings[pieceChoice(bar, 'ostinato', groupings.length)] : groupings[bar.index % groupings.length]
  const left: Voice = []
  let tick = 0
  grouping.forEach((dur, k) => {
    left.push(note(tick, dur, cycle[k % cycle.length], velocity - 6 + (k % 3 === 0 ? 6 : 0)))
    tick += dur
  })
  return { treble: [right], bass: [left] }
}

// ── lush voicings ───────────────────────────────────────────────────────────

interface LushShape {
  /** Rolled right-hand chords; each later one moves up an inversion. */
  chords: Slot[]
  fills: Slot[]
}
const s = (start: number, dur: number): Slot => ({ start, dur })

const LUSH: Record<'sixteen' | 'twelve', Record<BaseRoleId, LushShape>> = {
  sixteen: {
    statement: { chords: [s(0, 8)], fills: [s(10, 2), s(12, 2), s(14, 2)] },
    restatement: { chords: [s(0, 8)], fills: [s(10, 2), s(12, 2), s(14, 2)] },
    development: { chords: [s(0, 6), s(6, 4)], fills: [s(10, 1), s(11, 1), s(12, 2), s(14, 2)] },
    contrast: { chords: [s(0, 12)], fills: [s(12, 2), s(14, 2)] },
    climax: { chords: [s(0, 4), s(4, 4), s(8, 4)], fills: [s(12, 1), s(13, 1), s(14, 1), s(15, 1)] },
    half_cadence: { chords: [s(0, 8), s(8, 8)], fills: [] },
    cadence: { chords: [s(0, 16)], fills: [] },
  },
  twelve: {
    statement: { chords: [s(0, 6)], fills: [s(6, 2), s(8, 2), s(10, 2)] },
    restatement: { chords: [s(0, 6)], fills: [s(6, 2), s(8, 2), s(10, 2)] },
    development: { chords: [s(0, 4), s(4, 2)], fills: [s(6, 2), s(8, 1), s(9, 1), s(10, 2)] },
    contrast: { chords: [s(0, 8)], fills: [s(8, 2), s(10, 2)] },
    climax: { chords: [s(0, 4), s(4, 4)], fills: [s(8, 1), s(9, 1), s(10, 1), s(11, 1)] },
    half_cadence: { chords: [s(0, 6), s(6, 6)], fills: [] },
    cadence: { chords: [s(0, 12)], fills: [] },
  },
}

export function lushVoicings(bar: BarContext): BarNotes {
  const { meter, velocity } = bar
  const role: BaseRoleId = bar.isLast ? 'cadence' : bar.role
  const shape = LUSH[meter.ticksPerBar === 16 ? 'sixteen' : 'twelve'][role]

  // Rootless four-note voicing: 3rd and 7th first, then the colour tones. The
  // left hand owns the root.
  const center = role === 'contrast' ? 70 : 63
  const pcs = essentialTones(bar.chord, 4, { rootless: bar.chord.pcs.length > 3 })
  let voicing = sortAscending(leadVoicing(pcs, bar.memory.voicings.lush, center))
  bar.memory.voicings.lush = voicing

  const right: Voice = []
  shape.chords.forEach((slot, k) => {
    if (k > 0) {
      // Next inversion up: lift the bottom note over the top.
      const [bottom, ...rest] = voicing
      voicing = [...rest, nearestNote([Note.pitchClass(bottom)], midiOf(bottom) + 12)]
    }
    right.push(note(slot.start, slot.dur, voicing, velocity - 2 + k * 3, { roll: true }))
  })
  if (shape.fills.length > 0) {
    const top = midiOf(voicing[voicing.length - 1])
    const fills = melodyPitches(bar, shape.fills, { lo: top + 1, hi: top + 15, strongEvery: 4 })
    shape.fills.forEach((slot, k) => right.push(note(slot.start, slot.dur, fills[k], velocity + 4)))
  }

  // Left hand: root on the downbeat, then an anticipated push on the fifth
  // (or a shell with the seventh) that rings to the barline.
  const root = lowBass(bar.chord, bar.memory.bass, 41, 34, 48)
  bar.memory.bass = root
  const fifth = bassPartner(bar.chord, root)
  const seventh = bar.chord.core[3] && bar.chord.core[3] !== bar.chord.bass ? nearestNote([bar.chord.core[3]], midiOf(root) + 10) : undefined
  const push = 6
  const left: Voice =
    role === 'cadence'
      ? [note(0, meter.ticksPerBar, [root, fifth], velocity - 6, { roll: true })]
      : [note(0, push, root, velocity - 4), note(push, meter.ticksPerBar - push, seventh ? [fifth, seventh] : [fifth], velocity - 12)]
  return { treble: [right], bass: [left] }
}
