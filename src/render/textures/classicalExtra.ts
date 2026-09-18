// Six more Baroque / Classical textures. Each is modelled on a figure checked
// against a public-domain score or a published analysis (see docs/STYLE_NOTES.md):
//
//   aria_walking_bass   ornamented line over walking eighths (Goldberg aria type)
//   toccata_perpetual   pivot-and-lower-neighbour zig-zag, mirrored (BWV 847)
//   stride_dance        bass note + after-beat chords (minuet, waltz, stride)
//   rolling_nocturne    rolling broken chords over held octaves (Op. 27/2 type)
//   tremolo_storm       broken-octave tremolo under rising chords (Op. 13 Allegro type)
//   scherzo_staccato    detached chords tossed between the hands

import { Note } from 'tonal'
import type { BaseRoleId, MeterId } from '../../plan/schema'
import { note, pieceChoice, rhythmFor, slotsFrom, type BarContext, type BarNotes, type RhythmBank } from '../context'
import { melodyPitches, stepwiseRun } from '../melody'
import { clamp, ladder, midiOf, nearestIndex, nearestNote } from '../pitch'
import type { Voice } from '../score'
import { bassFor, bassPartner, essentialTones, leadVoicing, lowBass, sortAscending } from '../voiceLeading'

/** Up to `count` chord tones directly beneath `top`, low to high. */
function under(bar: BarContext, top: string, count: number): string[] {
  return ladder(bar.chord.core, midiOf(top) - 12, midiOf(top) - 1).slice(-count)
}

/** The scale step directly below (or above) a pitch. */
function neighbour(bar: BarContext, pitch: string, direction: -1 | 1): string {
  const rungs = ladder(bar.scale, 20, 108)
  return rungs[clamp(nearestIndex(rungs, midiOf(pitch)) + direction, 0, rungs.length - 1)]
}

// ── aria over a walking bass ────────────────────────────────────────────────

const ARIA: Record<MeterId, RhythmBank> = {
  four_four: {
    main: [[6, 2, 4, 4], [4, 3, 1, 8], [8, 3, 1, 4], [4, 4, 6, 2]],
    busy: [[2, 1, 1, 4, 2, 2, 4], [3, 1, 2, 2, 4, 4], [4, 1, 1, 1, 1, 4, 4]],
    sparse: [[12, 4], [8, 8]],
    pause: [[6, 2, 8], [4, 12]],
    close: [[4, 12]],
  },
  three_four: {
    // The sarabande leans on beat two.
    main: [[4, 6, 2], [4, 7, 1], [4, 4, 4], [6, 2, 4]],
    busy: [[2, 2, 3, 1, 4], [3, 1, 2, 2, 2, 2], [4, 1, 1, 1, 1, 4]],
    sparse: [[4, 8], [12]],
    pause: [[4, 8]],
    close: [[12]],
  },
  six_eight: {
    // Siciliano lilt: dotted eighth, sixteenth, eighth.
    main: [[3, 1, 2, 3, 1, 2], [3, 1, 2, 6], [6, 3, 1, 2]],
    busy: [[3, 1, 2, 2, 2, 2], [2, 2, 2, 3, 1, 2]],
    sparse: [[6, 6], [12]],
    pause: [[6, 6]],
    close: [[12]],
  },
}

/** Even eighths: bass note first, then a stepwise walk that arrives next to the next bar's bass. */
function walkingEighths(bar: BarContext, lo: number, hi: number): Voice {
  const first = bassFor(bar.chord, bar.memory.bass, { lo, hi, allowInversion: bar.index > 0 && !bar.isLast })
  bar.memory.bass = first
  const count = bar.meter.ticksPerBar / 2
  const rungs = ladder(bar.scale, lo - 3, hi + 3)
  const from = nearestIndex(rungs, midiOf(first))
  const target = bar.next ? nearestNote([bar.next.bass], midiOf(first), lo, hi) : first
  const path = stepwiseRun(from, nearestIndex(rungs, midiOf(target)), count, rungs.length)
  return path.map((rung, k) => note(k * 2, 2, k === 0 ? first : rungs[rung], bar.velocity - 8 + (k % 2 === 0 ? 3 : 0)))
}

export function ariaWalkingBass(bar: BarContext): BarNotes {
  const { meter, velocity } = bar
  const slots = slotsFrom(rhythmFor(bar, ARIA[meter.id], 'aria'))
  const pitches = melodyPitches(bar, slots, { lo: 64, hi: 86 })
  const melody: Voice = []
  slots.forEach((slot, k) => {
    // A mordent on a long note that falls on a beat: main – lower neighbour – main.
    const ornamented = slot.dur >= 4 && slot.start % meter.beatTicks === 0 && !bar.isLast && bar.rand() < 0.35
    if (ornamented) {
      melody.push(note(slot.start, 1, pitches[k], velocity + 8), note(slot.start + 1, 1, neighbour(bar, pitches[k], -1), velocity + 2))
      melody.push(note(slot.start + 2, slot.dur - 2, pitches[k], velocity + 6))
    } else {
      melody.push(note(slot.start, slot.dur, pitches[k], velocity + 8))
    }
  })
  if (bar.isLast) {
    const low = bassFor(bar.chord, bar.memory.bass, { lo: 36, hi: 50, allowInversion: false })
    return { treble: [melody], bass: [[note(0, meter.ticksPerBar, [low, bassPartner(bar.chord, low, bar.dialect.bassSpacing)], velocity - 4)]] }
  }
  return { treble: [melody], bass: [walkingEighths(bar, 38, 58)] }
}

// ── perpetual-motion toccata ────────────────────────────────────────────────

/**
 * The half-bar figure of the C-minor prelude, BWV 847 (checked against the
 * Mutopia encoding): outer tone, pivot, lower neighbour, pivot, inner tone,
 * pivot, lower neighbour, pivot — C5 Eb4 D4 Eb4 C4 Eb4 D4 Eb4 — with the left
 * hand mirroring it from the bottom up.
 */
function zigzag(bar: BarContext, pivot: string, outerAbove: boolean, direction: -1 | 1, groups: number, groupLength: number): string[] {
  const chordRungs = ladder(bar.chord.core, 24, 103)
  const at = nearestIndex(chordRungs, midiOf(pivot))
  const far = chordRungs[clamp(at + (outerAbove ? 2 : -2), 0, chordRungs.length - 1)]
  const near = chordRungs[clamp(at + (outerAbove ? -1 : 1), 0, chordRungs.length - 1)]
  const turn = neighbour(bar, pivot, direction)
  const out: string[] = []
  for (let g = 0; g < groups; g++) {
    const lead = g % 2 === 0 ? far : near
    const cell = [lead, pivot, turn, pivot, turn, pivot]
    out.push(...cell.slice(0, groupLength))
  }
  return out
}

export function toccataPerpetual(bar: BarContext): BarNotes {
  const { meter, velocity } = bar
  const groupLength = meter.beatTicks === 6 ? 6 : 4
  const groups = meter.ticksPerBar / groupLength
  const lift = bar.role === 'climax' ? 5 : bar.role === 'contrast' ? -5 : 0
  // The pivot is where the contour wants the line to sit; one anchor per bar.
  const [anchor] = melodyPitches(bar, [{ start: 0, dur: meter.ticksPerBar }], { lo: 62 + lift, hi: 76 + lift, line: 'pivot' })
  const lowAnchor = nearestNote(bar.chord.core, (bar.memory.lines.lowPivot ?? 50) + lift / 2, 45, 60)
  bar.memory.lines.lowPivot = midiOf(lowAnchor)
  const direction = pieceChoice(bar, 'toccata-turn', 3) === 0 ? 1 : -1

  if (bar.isLast) {
    // One last figure, then the machine lands on a held chord.
    const figure = zigzag(bar, anchor, true, direction, 1, groupLength)
    const voicing = sortAscending(leadVoicing(essentialTones(bar.chord, 3), undefined, 66))
    const low = bassFor(bar.chord, bar.memory.bass, { lo: 36, hi: 48, allowInversion: false })
    return {
      treble: [[...figure.map((pitch, k) => note(k, 1, pitch, velocity + 2)), note(groupLength, meter.ticksPerBar - groupLength, voicing, velocity + 4)]],
      bass: [[note(0, meter.ticksPerBar, [low, nearestNote([bar.chord.bass], midiOf(low) + 12)], velocity)]],
    }
  }

  const right = zigzag(bar, anchor, true, direction, groups, groupLength)
  const left = zigzag(bar, lowAnchor, false, direction, groups, groupLength)
  // The left hand's first note is the real bass of the chord.
  left[0] = lowBass(bar.chord, bar.memory.bass, 43, 36, 52)
  bar.memory.bass = left[0]
  const accent = (k: number) => (k % groupLength === 0 ? 6 : 0)
  return {
    treble: [right.map((pitch, k) => note(k, 1, pitch, velocity + accent(k)))],
    bass: [left.map((pitch, k) => note(k, 1, pitch, velocity - 6 + accent(k)))],
  }
}

// ── stride / dance accompaniment ────────────────────────────────────────────

const LILT: Record<MeterId, RhythmBank> = {
  four_four: {
    main: [[6, 2, 4, 4], [4, 2, 2, 6, 2], [3, 1, 4, 4, 4], [4, 4, 3, 1, 4]],
    busy: [[2, 2, 2, 2, 3, 1, 4], [3, 1, 2, 2, 2, 2, 4], [2, 2, 4, 2, 2, 4]],
    sparse: [[8, 8], [12, 4]],
    pause: [[4, 4, 8], [6, 2, 8]],
    close: [[4, 12]],
  },
  three_four: {
    main: [[4, 2, 2, 4], [6, 2, 4], [4, 4, 2, 2], [8, 2, 2]],
    busy: [[2, 2, 2, 2, 2, 2], [4, 2, 2, 2, 2], [3, 1, 2, 2, 4]],
    sparse: [[8, 4], [12]],
    pause: [[8, 4], [4, 8]],
    close: [[12]],
  },
  six_eight: {
    main: [[4, 2, 4, 2], [6, 4, 2], [4, 2, 6], [3, 1, 2, 4, 2]],
    busy: [[2, 2, 2, 2, 2, 2], [4, 2, 2, 2, 2]],
    sparse: [[6, 6], [12]],
    pause: [[6, 6]],
    close: [[12]],
  },
}

export function strideDance(bar: BarContext): BarNotes {
  const { meter, velocity } = bar
  const slots = slotsFrom(rhythmFor(bar, LILT[meter.id], 'lilt'))
  const pitches = melodyPitches(bar, slots, { lo: 67, hi: 88 })
  // Some pieces sing the tune in sixths on the long notes (broken-sixth colour).
  const inSixths = pieceChoice(bar, 'stride-sixths', 3) === 0
  const rungs = ladder(bar.scale, 40, 100)
  const melody: Voice = slots.map((slot, k) => {
    const doubled = inSixths && slot.dur >= 4 && !bar.isLast
    const below = rungs[clamp(nearestIndex(rungs, midiOf(pitches[k])) - 5, 0, rungs.length - 1)]
    return note(slot.start, slot.dur, doubled ? [below, pitches[k]] : pitches[k], velocity + 8)
  })

  const low = lowBass(bar.chord, bar.memory.bass, 40, 33, 47)
  bar.memory.bass = low
  const chord = sortAscending(leadVoicing(essentialTones(bar.chord, 3, { rootless: bar.chord.pcs.length > 3 }), bar.memory.voicings.stride, 59))
  bar.memory.voicings.stride = chord
  if (bar.isLast) {
    return { treble: [melody], bass: [[note(0, meter.beatTicks, low, velocity), note(meter.beatTicks, meter.ticksPerBar - meter.beatTicks, chord, velocity - 8)]] }
  }

  const left: Voice = []
  const alternate = nearestNote([bassPartner(bar.chord, low, bar.dialect.bassSpacing).replace(/-?\d+$/, '')], midiOf(low) + 5, 33, 52)
  if (meter.id === 'six_eight') {
    // Two swung groups: bass – chord – chord, the second bass on the partner tone.
    for (let group = 0; group < 2; group++) {
      const start = group * 6
      left.push(note(start, 2, group === 0 ? low : alternate, velocity - 2), note(start + 2, 2, chord, velocity - 14), note(start + 4, 2, chord, velocity - 14))
    }
  } else {
    const beats = meter.ticksPerBar / meter.beatTicks
    for (let beat = 0; beat < beats; beat++) {
      const isBass = meter.id === 'three_four' ? beat === 0 : beat % 2 === 0
      const pitch = isBass ? (beat === 0 ? low : alternate) : chord
      // A waltz lifts its after-beats; a quiet bar lets them ring.
      const dur = isBass || bar.role === 'contrast' ? meter.beatTicks : 2
      left.push(note(beat * meter.beatTicks, dur, pitch, isBass ? velocity - 2 : velocity - 14))
    }
  }
  return { treble: [melody], bass: [left] }
}

// ── rolling nocturne ────────────────────────────────────────────────────────

/** The top line: mostly one long note, reached by a dotted upbeat. Negative = rest. */
const NOCTURNE_TOP: Record<MeterId, Record<'tacet' | 'plain' | 'upbeat' | 'moving', number[]>> = {
  four_four: { tacet: [-16], plain: [12, -4], upbeat: [12, 3, 1], moving: [8, 4, 3, 1] },
  three_four: { tacet: [-12], plain: [8, -4], upbeat: [8, 3, 1], moving: [4, 4, 3, 1] },
  six_eight: { tacet: [-12], plain: [6, -6], upbeat: [6, 3, 3], moving: [6, 2, 2, 2] },
}

export function rollingNocturne(bar: BarContext): BarNotes {
  const { meter, velocity } = bar
  const low = lowBass(bar.chord, bar.memory.bass, 36, 28, 43)
  bar.memory.bass = low
  const octave = nearestNote([bar.chord.bass], midiOf(low) + 12)
  const triad = sortAscending(leadVoicing(essentialTones(bar.chord, 3), bar.memory.voicings.rolling, bar.role === 'climax' ? 66 : 61))
  bar.memory.voicings.rolling = triad

  if (bar.isLast) {
    return {
      treble: [[note(0, meter.ticksPerBar, triad, velocity - 2, { roll: true })]],
      bass: [[note(0, meter.ticksPerBar, [low, octave], velocity - 4)]],
    }
  }

  // Rolling figure in even eighths: low–mid–high in triple groupings, low–mid–high–mid in duple.
  const figure = meter.ticksPerBar === 12 ? [0, 1, 2] : [[0, 1, 2, 1], [0, 1, 2, 0]][pieceChoice(bar, 'rolling', 2)]
  const rolling: Voice = []
  for (let tick = 0, k = 0; tick < meter.ticksPerBar; tick += 2, k++) rolling.push(note(tick, 2, triad[figure[k % figure.length]], velocity - 10))

  // The tune waits: the opening bar is the accompaniment alone.
  const kind = bar.index === 0 ? 'tacet' : bar.role === 'development' || bar.role === 'climax' ? 'moving' : bar.role === 'contrast' ? 'plain' : 'upbeat'
  const slots = slotsFrom(NOCTURNE_TOP[meter.id][kind])
  const pitches = melodyPitches(bar, slots, { lo: 68, hi: 84, span: 5 })
  const top: Voice = slots.map((slot, k) => note(slot.start, slot.dur, pitches[k], velocity + 10))

  const leftOctaves: Voice =
    bar.role === 'development' || bar.role === 'climax'
      ? [note(0, meter.ticksPerBar / 2, [low, octave], velocity - 2), note(meter.ticksPerBar / 2, meter.ticksPerBar / 2, [low, octave], velocity - 6)]
      : [note(0, meter.ticksPerBar, [low, octave], velocity - 4)]
  return { treble: top.length ? [top, rolling] : [rolling], bass: [leftOctaves] }
}

// ── tremolo storm ───────────────────────────────────────────────────────────

export function tremoloStorm(bar: BarContext): BarNotes {
  const { meter, velocity } = bar
  const role: BaseRoleId = bar.isLast ? 'cadence' : bar.role
  const low = lowBass(bar.chord, bar.memory.bass, 38, 31, 45)
  bar.memory.bass = low
  const high = nearestNote([bar.chord.bass], midiOf(low) + 12)

  if (role === 'cadence' || role === 'half_cadence') {
    // Two hammered chords and silence.
    const top = nearestNote(bar.chord.core, bar.memory.lines.storm ?? 74, 67, 84)
    const chord = [...under(bar, top, 3), top]
    const gap = meter.beatTicks
    const second = meter.ticksPerBar > gap * 2 ? gap * 2 : gap
    return {
      treble: [[note(0, gap, chord, velocity + 10, { accent: true }), note(second, meter.ticksPerBar - second, chord, velocity + 4)]],
      bass: [[note(0, gap, [low, high], velocity + 6, { accent: true }), note(second, meter.ticksPerBar - second, [low, high], velocity)]],
    }
  }

  // Left hand: the murky bass. Eighths normally, sixteenths at the peak.
  const step = role === 'climax' ? 1 : 2
  const left: Voice = []
  for (let tick = 0, k = 0; tick < meter.ticksPerBar; tick += step, k++) left.push(note(tick, step, k % 2 === 0 ? low : high, velocity - 8 + (k === 0 ? 8 : 0)))

  // Right hand: detached chords climbing beat by beat (the "rocket") …
  const beats = meter.ticksPerBar / meter.beatTicks
  const chordBeats = role === 'development' ? Math.max(1, beats - (meter.beatTicks === 6 ? 1 : 2)) : beats
  const chordSlots = Array.from({ length: chordBeats }, (_, b) => ({ start: b * meter.beatTicks, dur: meter.beatTicks === 6 ? 4 : 2 }))
  const tops = melodyPitches(bar, chordSlots, { lo: 64, hi: 88, line: 'storm', span: 14, strongEvery: 1 })
  const soft = role === 'contrast'
  const right: Voice = chordSlots.map((slot, k) =>
    note(slot.start, soft ? meter.beatTicks : slot.dur, [...under(bar, tops[k], soft ? 1 : 2), tops[k]], velocity - (soft ? 14 : 0) + k * 3, k === chordSlots.length - 1 && !soft ? { accent: true } : {}),
  )
  // … and in development bars the rest of the bar is a scale rush into the next downbeat.
  if (role === 'development') {
    const from = chordBeats * meter.beatTicks
    const count = meter.ticksPerBar - from
    const rungs = ladder(bar.scale, 60, 96)
    const start = nearestIndex(rungs, midiOf(tops[tops.length - 1]))
    const goal = nearestIndex(rungs, midiOf(nearestNote(bar.next?.core ?? bar.chord.core, midiOf(tops[tops.length - 1]) + (bar.plan.contour === 'fall' ? -9 : 9), 60, 96)))
    stepwiseRun(start, goal, count, rungs.length).forEach((rung, k) => right.push(note(from + k, 1, rungs[rung], velocity + k)))
    bar.memory.lines.storm = midiOf(right[right.length - 1].pitches[0])
  }
  return { treble: [right], bass: [left] }
}

// ── scherzo staccato ────────────────────────────────────────────────────────

interface Toss {
  /** [start, dur] pairs in ticks */
  right: [number, number][]
  left: [number, number][]
  /** right-hand hits that are single notes of a quick figure rather than chords */
  figure?: boolean
  accents?: number[]
}

const TOSSES: Record<'sixteen' | 'twelve', Record<BaseRoleId, Toss[]>> = {
  sixteen: {
    statement: [
      { left: [[0, 2]], right: [[2, 2], [6, 2], [8, 2], [12, 2]] },
      { left: [[0, 2], [8, 2]], right: [[4, 2], [6, 2], [12, 2], [14, 2]] },
    ],
    restatement: [{ left: [[0, 2]], right: [[2, 2], [6, 2], [8, 2], [12, 2]] }],
    development: [{ left: [[2, 2], [6, 2], [10, 2], [14, 2]], right: [[0, 2], [2, 2], [4, 2], [6, 2], [8, 2], [10, 2], [12, 2], [14, 2]], figure: true }],
    contrast: [{ left: [[0, 8]], right: [[4, 4], [8, 8]] }],
    climax: [{ left: [[0, 2], [6, 2], [12, 2]], right: [[2, 2], [6, 2], [10, 2], [14, 2]], accents: [0, 1, 2, 3] }],
    half_cadence: [{ left: [[0, 2]], right: [[0, 2], [12, 2]], accents: [1] }],
    cadence: [{ left: [[0, 2], [4, 12]], right: [[0, 2], [4, 12]] }],
  },
  twelve: {
    statement: [
      { left: [[0, 2]], right: [[4, 2], [8, 2]] },
      { left: [[0, 2]], right: [[2, 2], [4, 2], [8, 2]] },
    ],
    restatement: [{ left: [[0, 2]], right: [[4, 2], [8, 2]] }],
    development: [{ left: [[4, 2], [8, 2]], right: [[0, 2], [2, 2], [4, 2], [6, 2], [8, 2], [10, 2]], figure: true }],
    contrast: [{ left: [[0, 12]], right: [[4, 8]] }],
    climax: [{ left: [[0, 2], [6, 2]], right: [[2, 2], [4, 2], [8, 2], [10, 2]], accents: [0, 2] }],
    half_cadence: [{ left: [[0, 2]], right: [[0, 2], [10, 2]], accents: [1] }],
    cadence: [{ left: [[0, 2], [4, 8]], right: [[0, 2], [4, 8]] }],
  },
}

export function scherzoStaccato(bar: BarContext): BarNotes {
  const { meter, velocity } = bar
  const role: BaseRoleId = bar.isLast ? 'cadence' : bar.role
  const options = TOSSES[meter.ticksPerBar === 16 ? 'sixteen' : 'twelve'][role]
  const toss = options[pieceChoice(bar, `toss-${role}`, options.length)]

  const rightSlots = toss.right.map(([start, dur]) => ({ start, dur }))
  const tops = melodyPitches(bar, rightSlots, { lo: 67, hi: 88, strongEvery: toss.figure ? meter.beatTicks : 1 })
  const right: Voice = rightSlots.map((slot, k) => {
    const accent = toss.accents?.includes(k) ?? false
    const pitches = toss.figure ? [tops[k]] : [...under(bar, tops[k], 2), tops[k]]
    return note(slot.start, slot.dur, pitches, velocity + (accent ? 16 : 2), accent ? { accent: true } : {})
  })

  const low = lowBass(bar.chord, bar.memory.bass, 43, 36, 50)
  bar.memory.bass = low
  const chord = sortAscending(leadVoicing(essentialTones(bar.chord, 3), bar.memory.voicings.scherzo, 57))
  bar.memory.voicings.scherzo = chord
  const left: Voice = toss.left.map(([start, dur], k) => {
    // First hit is the bass note; later ones are light off-beat chords.
    const pitches = k === 0 ? [low, nearestNote([Note.pitchClass(low)], midiOf(low) + 12)] : chord
    return note(start, dur, pitches, velocity - (k === 0 ? 2 : 12))
  })
  return { treble: [right], bass: [left] }
}
