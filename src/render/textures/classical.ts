import type { BaseRoleId, MeterId } from '../../plan/schema'
import { note, pieceChoice, rhythmFor, slotsFrom, type BarContext, type BarNotes, type RhythmBank } from '../context'
import { melodyPitches } from '../melody'
import { ladder, midiOf, nearestNote } from '../pitch'
import type { Voice } from '../score'
import { leadVoicing, sortAscending } from '../voiceLeading'

// ── melody over Alberti bass ────────────────────────────────────────────────

const CANTABILE: Record<MeterId, RhythmBank> = {
  four_four: {
    main: [[6, 2, 4, 4], [4, 4, 4, 2, 2], [4, 2, 2, 8]],
    busy: [[2, 2, 2, 2, 4, 4], [4, 2, 2, 2, 2, 2, 2], [2, 2, 4, 2, 2, 4]],
    sparse: [[8, 4, 4], [8, 8]],
    pause: [[4, 8, -4], [6, 2, 4, -4], [4, 4, 4, -4]],
    close: [[4, 8, -4], [8, 4, -4]],
  },
  three_four: {
    main: [[6, 2, 4], [4, 4, 4], [4, 2, 2, 4]],
    busy: [[2, 2, 2, 2, 4], [2, 2, 2, 2, 2, 2]],
    sparse: [[8, 4], [12]],
    pause: [[4, 4, -4], [8, -4]],
    close: [[8, -4], [4, 4, -4]],
  },
  six_eight: {
    main: [[4, 2, 4, 2], [6, 4, 2], [4, 2, 6]],
    busy: [[2, 2, 2, 4, 2], [2, 2, 2, 2, 2, 2]],
    sparse: [[6, 6]],
    pause: [[4, 2, -6], [6, -6]],
    close: [[6, -6]],
  },
  two_four: {
    main: [[4, 2, 2], [2, 2, 4], [6, 2]],
    busy: [[2, 2, 2, 2], [2, 2, 4]],
    sparse: [[8], [4, 4]],
    pause: [[4, -4]],
    close: [[4, -4]],
  },
  nine_eight: {
    main: [[4, 2, 4, 2, 6], [6, 4, 2, 6], [6, 6, 6]],
    busy: [[2, 2, 2, 4, 2, 6], [2, 2, 2, 2, 2, 2, 2, 2, 2]],
    sparse: [[6, 12], [12, 6]],
    pause: [[4, 2, 6, -6], [6, 6, -6]],
    close: [[12, -6]],
  },
  twelve_eight: {
    main: [[4, 2, 4, 2, 4, 2, 4, 2], [6, 6, 6, 6], [6, 4, 2, 6, 6]],
    busy: [[2, 2, 2, 4, 2, 2, 2, 2, 4, 2], [2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2]],
    sparse: [[12, 12], [6, 6, 12]],
    pause: [[4, 2, 12, -6], [12, 6, -6]],
    close: [[18, -6]],
  },
}

/**
 * Eighth-note accompaniment figures as indices into [low, middle, high].
 * One is chosen per piece: the textbook low–high–middle–high, a rising
 * broken chord, or a rocking bass-and-dyad murmur.
 */
const ALBERTI: Record<MeterId, number[][]> = {
  four_four: [
    [0, 2, 1, 2, 0, 2, 1, 2],
    [0, 1, 2, 1, 0, 1, 2, 1],
    [0, 2, 1, 2, 1, 2, 1, 2],
  ],
  three_four: [
    [0, 2, 1, 2, 1, 2],
    [0, 1, 2, 1, 2, 1],
    [0, 1, 2, 2, 1, 2],
  ],
  six_eight: [
    [0, 1, 2, 0, 1, 2],
    [0, 2, 1, 0, 2, 1],
    [0, 1, 2, 2, 1, 2],
  ],
  two_four: [
    [0, 2, 1, 2],
    [0, 1, 2, 1],
    [0, 2, 1, 2],
  ],
  nine_eight: [
    [0, 1, 2, 0, 1, 2, 0, 1, 2],
    [0, 2, 1, 0, 2, 1, 0, 2, 1],
    [0, 1, 2, 2, 1, 2, 0, 1, 2],
  ],
  twelve_eight: [
    [0, 1, 2, 0, 1, 2, 0, 1, 2, 0, 1, 2],
    [0, 2, 1, 0, 2, 1, 0, 2, 1, 0, 2, 1],
    [0, 1, 2, 2, 1, 2, 0, 1, 2, 2, 1, 2],
  ],
}

export function albertiMelody(bar: BarContext): BarNotes {
  const { meter, velocity } = bar
  const slots = slotsFrom(rhythmFor(bar, CANTABILE[meter.id], 'cantabile'))
  const pitches = melodyPitches(bar, slots, { lo: 64, hi: 86 })
  const melody: Voice = slots.map((slot, k) => note(slot.start, slot.dur, pitches[k], velocity + 8))

  const [bassPc, ...upperPcs] = threeForAlberti(bar)
  const bassNote = nearestNote([bassPc], bar.memory.bass ? midiOf(bar.memory.bass) : 48, 41, 55)
  bar.memory.bass = bassNote
  const uppers = sortAscending(leadVoicing(upperPcs, bar.memory.voicings.alberti, midiOf(bassNote) + 9)).map((pitch) =>
    midiOf(pitch) <= midiOf(bassNote) ? nearestNote([pitch.replace(/-?\d+$/, '')], midiOf(pitch) + 12) : pitch,
  )
  bar.memory.voicings.alberti = uppers
  const triad = sortAscending([bassNote, ...uppers])

  const figures = ALBERTI[meter.id]
  const figure = figures[pieceChoice(bar, 'alberti', figures.length)]
  const left: Voice = []
  // The final bar stops the motor on a beat and lets the chord stand.
  const motorLength = !bar.isLast ? figure.length : meter.id === 'three_four' ? 4 : Math.floor(figure.length / 2)
  for (let k = 0; k < motorLength; k++) left.push(note(k * 2, 2, triad[figure[k]], velocity - 12 + (figure[k] === 0 ? 4 : 0)))
  if (bar.isLast) left.push(note(motorLength * 2, meter.ticksPerBar - motorLength * 2, triad, velocity - 8))
  return { treble: [melody], bass: [left] }
}

/** Bass, third and the seventh if there is one (else the fifth) — never the bass note twice. */
function threeForAlberti(bar: BarContext): string[] {
  const [root, third, fifth, seventh] = bar.chord.core
  const tones = [bar.chord.bass, ...[third, seventh ?? fifth, fifth, root].filter((pc) => pc && pc !== bar.chord.bass)]
  return tones.slice(0, 3)
}

// ── dramatic chords ─────────────────────────────────────────────────────────

/** Durations in ticks; negative = rest. `!` accents are marked separately. */
interface Gesture {
  right: number[]
  left: number[]
  /** Indices (into the sounding right-hand notes) that get a sforzando. */
  accents: number[]
  /** Velocity ramp across the bar, in MIDI units. */
  swell?: number
  soft?: boolean
}

const eighths = (ticks: number) => Array<number>(ticks / 2).fill(2)

const GESTURES: Record<MeterId, Record<BaseRoleId, Gesture>> = {
  four_four: {
    statement: { right: [-2, 2, 2, 2, 8], left: [-2, 2, 2, 2, 8], accents: [3] },
    restatement: { right: [-2, 2, 2, 2, 8], left: [-2, 2, 2, 2, 8], accents: [3] },
    development: { right: eighths(16), left: [4, 4, 4, 4], accents: [], swell: 22 },
    contrast: { right: [8, 4, 4], left: [16], accents: [], soft: true },
    climax: { right: [4, 4, 4, 4], left: eighths(16), accents: [0, 2] },
    half_cadence: { right: [4, -4, 8], left: [4, -4, 8], accents: [1] },
    cadence: { right: [4, -4, 8], left: [4, -4, 8], accents: [0, 1] },
  },
  three_four: {
    statement: { right: [-2, 2, 2, 2, 4], left: [-2, 2, 2, 2, 4], accents: [3] },
    restatement: { right: [-2, 2, 2, 2, 4], left: [-2, 2, 2, 2, 4], accents: [3] },
    development: { right: eighths(12), left: [4, 4, 4], accents: [], swell: 20 },
    contrast: { right: [8, 4], left: [12], accents: [], soft: true },
    climax: { right: [4, 4, 4], left: eighths(12), accents: [0] },
    half_cadence: { right: [4, 8], left: [4, 8], accents: [1] },
    cadence: { right: [4, 8], left: [4, 8], accents: [0, 1] },
  },
  six_eight: {
    statement: { right: [-2, 2, 2, 6], left: [-2, 2, 2, 6], accents: [2] },
    restatement: { right: [-2, 2, 2, 6], left: [-2, 2, 2, 6], accents: [2] },
    development: { right: eighths(12), left: [6, 6], accents: [], swell: 20 },
    contrast: { right: [6, 4, 2], left: [12], accents: [], soft: true },
    climax: { right: [6, 6], left: eighths(12), accents: [0, 1] },
    half_cadence: { right: [4, -2, 6], left: [4, -2, 6], accents: [1] },
    cadence: { right: [4, -2, 6], left: [4, -2, 6], accents: [0, 1] },
  },
  two_four: {
    statement: { right: [-2, 2, 4], left: [-2, 2, 4], accents: [1] },
    restatement: { right: [-2, 2, 4], left: [-2, 2, 4], accents: [1] },
    development: { right: eighths(8), left: [4, 4], accents: [], swell: 16 },
    contrast: { right: [4, 4], left: [8], accents: [], soft: true },
    climax: { right: [4, 4], left: eighths(8), accents: [0] },
    half_cadence: { right: [4, 4], left: [4, 4], accents: [1] },
    cadence: { right: [4, 4], left: [4, 4], accents: [0, 1] },
  },
  nine_eight: {
    statement: { right: [-2, 2, 2, 12], left: [-2, 2, 2, 12], accents: [2] },
    restatement: { right: [-2, 2, 2, 12], left: [-2, 2, 2, 12], accents: [2] },
    development: { right: eighths(18), left: [6, 6, 6], accents: [], swell: 20 },
    contrast: { right: [6, 6, 6], left: [18], accents: [], soft: true },
    climax: { right: [6, 6, 6], left: eighths(18), accents: [0, 2] },
    half_cadence: { right: [4, -2, 12], left: [4, -2, 12], accents: [1] },
    cadence: { right: [4, -2, 12], left: [4, -2, 12], accents: [0, 1] },
  },
  twelve_eight: {
    statement: { right: [-2, 2, 2, 6, 12], left: [-2, 2, 2, 6, 12], accents: [2] },
    restatement: { right: [-2, 2, 2, 6, 12], left: [-2, 2, 2, 6, 12], accents: [2] },
    development: { right: eighths(24), left: [6, 6, 6, 6], accents: [], swell: 22 },
    contrast: { right: [12, 12], left: [24], accents: [], soft: true },
    climax: { right: [6, 6, 6, 6], left: eighths(24), accents: [0, 2] },
    half_cadence: { right: [4, -2, 6, 12], left: [4, -2, 6, 12], accents: [1] },
    cadence: { right: [4, -2, 18], left: [4, -2, 18], accents: [0, 1] },
  },
}

export function dramaticChords(bar: BarContext): BarNotes {
  const { meter, velocity } = bar
  const role: BaseRoleId = bar.isLast ? 'cadence' : bar.role
  const gesture = GESTURES[meter.id][role]
  const base = velocity - (gesture.soft ? 18 : 0)

  // Right hand: a full close-position chord whose top note follows the contour.
  const rightSlots = slotsFrom(gesture.right)
  const tops = melodyPitches(bar, rightSlots, { lo: 67, hi: 84, strongEvery: 1, line: 'top' })
  const right: Voice = rightSlots.map((slot, k) => {
    const top = midiOf(tops[k])
    const under = ladder(bar.chord.core, top - 12, top - 1).slice(gesture.soft ? -1 : -3)
    const swell = gesture.swell ? (gesture.swell * k) / Math.max(1, rightSlots.length - 1) - gesture.swell / 2 : 0
    const accent = gesture.accents.includes(k)
    return note(slot.start, slot.dur, [...under, tops[k]], base + swell + (accent ? 16 : 0), accent ? { accent: true } : {})
  })

  // Left hand: octaves on the bass; in the climax they break into a tremolo.
  const low = nearestNote([bar.chord.bass], bar.memory.bass ? midiOf(bar.memory.bass) : 40, 35, 46)
  bar.memory.bass = low
  const high = nearestNote([bar.chord.bass], midiOf(low) + 12)
  const leftSlots = slotsFrom(gesture.left)
  const tremolo = role === 'climax'
  const left: Voice = leftSlots.map((slot, k) => {
    const accent = gesture.accents.includes(k) && gesture.left.length === gesture.right.length
    const pitches = tremolo ? [k % 2 === 0 ? low : high] : gesture.soft ? [high] : [low, high]
    return note(slot.start, slot.dur, pitches, base - 4 + (accent ? 14 : 0), accent ? { accent: true } : {})
  })
  return { treble: [right], bass: [left] }
}
