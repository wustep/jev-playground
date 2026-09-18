// Six more twentieth-century-and-after textures (sources in docs/STYLE_NOTES.md):
//
//   pulsing_chords        repeated eighth-note chords, fragments above
//   melody_over_ostinato  an unchanging rocking figure under a sparse slow tune
//   interlocking_hands    hands overlapped, alternating sixteenths in close seconds
//   displaced_arpeggio    sixteenth arpeggios accented in uneven groups (5+5+6 …)
//   chordal_melody        tune on top of close chords, inner voice sliding by half-steps
//   bell_organum          hollow parallel fifths and octaves between bell tones

import { Note } from 'tonal'
import type { BaseRoleId, MeterId } from '../../plan/schema'
import { meterGrid, note, pieceChoice, rhythmFor, slotsFrom, type BarContext, type BarNotes, type RhythmBank } from '../context'
import { melodyPitches } from '../melody'
import { clamp, ladder, midiOf, nearestIndex, nearestNote, spellMidi } from '../pitch'
import type { Voice } from '../score'
import { bassPartner, essentialTones, leadVoicing, lowBass, sortAscending } from '../voiceLeading'

// ── pulsing chords ──────────────────────────────────────────────────────────

/** Right-hand fragments over the pulse. Negative = rest. */
const FRAGMENTS: Record<ReturnType<typeof meterGrid>, Record<BaseRoleId, number[][]>> = {
  sixteen: {
    statement: [[-10, 2, 2, 2], [-8, 1, 1, 2, 4], [-12, 1, 1, 2]],
    restatement: [[-10, 2, 2, 2], [-8, 1, 1, 2, 4]],
    development: [[-2, 2, 2, 2, -2, 2, 2, 2], [2, 2, 4, 2, 2, 4]],
    contrast: [[16], [-4, 12]],
    climax: [[2, 2, 2, 2, 2, 2, 2, 2]],
    half_cadence: [[4, 12], [-4, 4, 8]],
    cadence: [[16]],
  },
  twelve: {
    statement: [[-6, 2, 2, 2], [-8, 1, 1, 2]],
    restatement: [[-6, 2, 2, 2]],
    development: [[-2, 2, 2, -2, 2, 2], [2, 2, 2, 2, 4]],
    contrast: [[12], [-4, 8]],
    climax: [[2, 2, 2, 2, 2, 2]],
    half_cadence: [[4, 8]],
    cadence: [[12]],
  },
  eight: {
    statement: [[-4, 2, 2], [-2, 2, 4]],
    restatement: [[-4, 2, 2]],
    development: [[-2, 2, 2, 2], [2, 2, 4]],
    contrast: [[8], [-2, 6]],
    climax: [[2, 2, 2, 2]],
    half_cadence: [[4, 4], [-2, 2, 4]],
    cadence: [[8]],
  },
  eighteen: {
    statement: [[-6, 2, 2, 2, 6], [-8, 2, 2, 6]],
    restatement: [[-6, 2, 2, 8]],
    development: [[-2, 2, 2, -2, 2, 2, 6], [2, 2, 2, 2, 4, 6]],
    contrast: [[18], [-6, 12]],
    climax: [[2, 2, 2, 2, 2, 2, 6]],
    half_cadence: [[6, 12]],
    cadence: [[18]],
  },
  twentyfour: {
    statement: [[-10, 2, 2, 2, 8], [-8, 2, 2, 4, 8]],
    restatement: [[-10, 2, 2, 10]],
    development: [[-2, 2, 2, 2, -2, 2, 2, 2, 8], [2, 2, 4, 2, 2, 4, 8]],
    contrast: [[24], [-8, 16]],
    climax: [[2, 2, 2, 2, 2, 2, 2, 2, 8]],
    half_cadence: [[8, 16]],
    cadence: [[24]],
  },
}

export function pulsingChords(bar: BarContext): BarNotes {
  const { meter, velocity } = bar
  const role: BaseRoleId = bar.isLast ? 'cadence' : bar.role
  const low = lowBass(bar.chord, bar.memory.bass, 43, 36, 50)
  bar.memory.bass = low
  const upper = sortAscending(leadVoicing(essentialTones(bar.chord, 2, { rootless: true }), bar.memory.voicings.pulse, midiOf(low) + 10))
  bar.memory.voicings.pulse = upper
  const pulse = sortAscending([low, ...upper.filter((pitch) => midiOf(pitch) > midiOf(low))])

  if (role === 'cadence') {
    const top = nearestNote(bar.chord.core, bar.memory.lines.melody ?? 72, 64, 79)
    return { treble: [[note(0, meter.ticksPerBar, top, velocity)]], bass: [[note(0, meter.ticksPerBar, pulse, velocity - 4)]] }
  }

  // The motor: even eighths, the first of each beat leaned on. A swell through development bars.
  const left: Voice = []
  for (let tick = 0, k = 0; tick < meter.ticksPerBar; tick += 2, k++) {
    const swell = role === 'development' ? (k / (meter.ticksPerBar / 2)) * 12 - 4 : 0
    left.push(note(tick, 2, pulse, velocity - 10 + swell + (tick % meter.beatTicks === 0 ? 4 : 0)))
  }

  // Above it: either flickering fragments, or one note repeated like a bell (fixed per piece).
  const options = FRAGMENTS[meterGrid(meter)][role]
  const insistent = pieceChoice(bar, 'pulse-insistent', 3) === 0 && (role === 'statement' || role === 'restatement' || role === 'development')
  const rhythm = insistent ? Array<number>(meter.ticksPerBar / 2).fill(2) : options[Math.floor(bar.rand() * options.length)]
  const slots = slotsFrom(rhythm)
  const pitches = insistent
    ? Array<string>(slots.length).fill(melodyPitches(bar, [{ start: 0, dur: meter.ticksPerBar }], { lo: 67, hi: 81, line: 'insistent' })[0])
    : melodyPitches(bar, slots, { lo: 67, hi: 86, strongEvery: meter.beatTicks })
  const right: Voice = slots.map((slot, k) => {
    const octave = role === 'climax' ? [nearestNote([Note.pitchClass(pitches[k])], midiOf(pitches[k]) - 12), pitches[k]] : pitches[k]
    return note(slot.start, slot.dur, octave, velocity + (role === 'climax' ? 6 : 2))
  })
  return { treble: [right], bass: [left] }
}

// ── melody over an ostinato ─────────────────────────────────────────────────

const SPARSE_TUNE: Record<MeterId, RhythmBank> = {
  four_four: {
    main: [[-4, 8, 4], [-2, 6, 8], [8, -4, 4], [-8, 8]],
    busy: [[4, 4, 8], [-2, 2, 4, 8], [4, 2, 2, 8]],
    sparse: [[-8, 8], [16], [-16]],
    pause: [[8, -8], [-4, 8, -4]],
    close: [[12, -4], [8, -8]],
  },
  three_four: {
    main: [[-4, 8], [8, 4], [-2, 6, 4], [-4, 4, 4]],
    busy: [[4, 4, 4], [-2, 2, 4, 4]],
    sparse: [[12], [-12], [-8, 4]],
    pause: [[8, -4]],
    close: [[8, -4]],
  },
  six_eight: {
    main: [[-6, 6], [6, 6], [-2, 4, 6], [6, 4, 2]],
    busy: [[4, 2, 6], [-2, 2, 2, 6]],
    sparse: [[12], [-12], [-6, 6]],
    pause: [[6, -6]],
    close: [[6, -6]],
  },
  two_four: {
    main: [[-2, 4, 2], [4, -2, 2], [-4, 4]],
    busy: [[2, 2, 4], [-1, 1, 2, 4]],
    sparse: [[8], [-8]],
    pause: [[4, -4]],
    close: [[4, -4]],
  },
  nine_eight: {
    main: [[-6, 6, 6], [6, 6, 6], [-2, 4, 6, 6]],
    busy: [[4, 2, 6, 6], [-2, 2, 2, 6, 6]],
    sparse: [[18], [-18], [-6, 12]],
    pause: [[6, -12]],
    close: [[12, -6]],
  },
  twelve_eight: {
    main: [[-6, 6, 6, 6], [6, 6, 6, 6], [-2, 4, 6, 12]],
    busy: [[4, 2, 6, 6, 6], [-2, 2, 2, 6, 12]],
    sparse: [[24], [-24], [-12, 12]],
    pause: [[12, -12]],
    close: [[18, -6]],
  },
}

export function melodyOverOstinato(bar: BarContext): BarNotes {
  const { meter, velocity } = bar
  const low = lowBass(bar.chord, bar.memory.bass, 45, 36, 52)
  bar.memory.bass = low
  const partner = bassPartner(bar.chord, low, bar.dialect.bassSpacing)
  const third = nearestNote([bar.chord.core[1] === bar.chord.bass ? bar.chord.core[2] : bar.chord.core[1]], midiOf(low) + 15)
  const tenth = nearestNote([Note.pitchClass(third)], midiOf(low) + 16, midiOf(low) + 12, midiOf(low) + 24)

  // Three kinds of "small rocking figure"; a piece keeps one from first bar to last.
  const kind = pieceChoice(bar, 'ostinato-kind', 3)
  const bass: Voice[] = []
  if (kind === 0) {
    // Rocking dyad: bass note against the third above, even eighths.
    const rock = midiOf(partner) < midiOf(third) ? partner : third
    const voice: Voice = []
    for (let tick = 0, k = 0; tick < meter.ticksPerBar; tick += 2, k++) voice.push(note(tick, 2, k % 2 === 0 ? low : rock, velocity - 10 + (k === 0 ? 4 : 0)))
    bass.push(voice)
  } else if (kind === 1) {
    // A two-note cell over a held pedal: short–long, the footstep figure.
    const cell: Voice = []
    const step = ladder(bar.scale, midiOf(partner) + 1, midiOf(partner) + 4)[0] ?? partner
    for (let start = 0; start < meter.ticksPerBar; start += meter.beatTicks === 6 ? 6 : 8) {
      const span = Math.min(meter.beatTicks === 6 ? 6 : 8, meter.ticksPerBar - start)
      cell.push(note(start, 2, partner, velocity - 10), note(start + 2, span - 2, step, velocity - 8))
    }
    bass.push(cell, [note(0, meter.ticksPerBar, low, velocity - 12)])
  } else {
    // Broken chord up and back: root – fifth – octave – tenth – …
    const tones = [low, partner, nearestNote([bar.chord.bass], midiOf(low) + 12), tenth]
    const pattern = meter.beatTicks === 6 ? [0, 1, 2, 3, 2, 1] : [0, 1, 2, 3, 2, 3, 2, 1]
    const order = Array.from({ length: meter.ticksPerBar / 2 }, (_, k) => pattern[k % pattern.length])
    bass.push(order.map((index, k) => note(k * 2, 2, tones[index], velocity - 10 + (k === 0 ? 4 : 0))))
  }

  if (bar.isLast) {
    const top = nearestNote(bar.chord.core, bar.memory.lines.melody ?? 72, 62, 81)
    return { treble: [[note(0, meter.ticksPerBar, top, velocity)]], bass: [[note(0, meter.ticksPerBar, [low, partner], velocity - 8)]] }
  }
  // The ostinato plays alone first; the tune arrives later.
  if (bar.index === 0 && bar.count > 4) return { treble: [], bass }
  const slots = slotsFrom(rhythmFor(bar, SPARSE_TUNE[meter.id], 'sparse-tune'))
  if (slots.length === 0) return { treble: [], bass }
  const pitches = melodyPitches(bar, slots, { lo: 64, hi: 84, span: 5 })
  return { treble: [slots.map((slot, k) => note(slot.start, slot.dur, pitches[k], velocity + 10))], bass }
}

// ── interlocking hands ──────────────────────────────────────────────────────

/** Where the accents fall, as group lengths in sixteenths. */
const ACCENT_GROUPS: Record<ReturnType<typeof meterGrid>, number[][]> = {
  sixteen: [[3, 3, 2, 3, 3, 2], [5, 3, 5, 3], [3, 3, 3, 3, 4], [4, 4, 4, 4], [2, 3, 3, 2, 3, 3]],
  twelve: [[3, 3, 3, 3], [2, 2, 2, 2, 2, 2], [5, 4, 3], [4, 3, 5]],
  eight: [[3, 3, 2], [2, 2, 2, 2], [4, 4], [5, 3]],
  eighteen: [[3, 3, 3, 3, 3, 3], [6, 6, 6], [5, 5, 4, 4], [2, 2, 2, 2, 2, 2, 2, 2, 2]],
  twentyfour: [[3, 3, 2, 3, 3, 2, 3, 3, 2], [6, 6, 6, 6], [5, 5, 5, 5, 4], [4, 4, 4, 4, 4, 4]],
}

const groupStarts = (groups: number[]) => groups.reduce<number[]>((starts, length) => [...starts, starts[starts.length - 1] + length], [0]).slice(0, -1)

export function interlockingHands(bar: BarContext): BarNotes {
  const { meter, velocity } = bar
  const role: BaseRoleId = bar.isLast ? 'cadence' : bar.role
  // Both hands live around middle C so the left can stay on its own staff.
  const shift = role === 'climax' ? 5 : role === 'contrast' ? -3 : 0
  const [anchor] = melodyPitches(bar, [{ start: 0, dur: meter.ticksPerBar }], { lo: 58 + shift, hi: 67 + shift, line: 'interlock' })
  const scale = ladder(bar.scale, 40, 100)
  const at = nearestIndex(scale, midiOf(anchor))
  // Right hand: a chord tone and the second above it. Left hand: the tones a second and a fourth below — close, tense.
  const rightSet = [anchor, scale[clamp(at + 1, 0, scale.length - 1)], scale[clamp(at + 2, 0, scale.length - 1)]]
  const leftSet = [scale[clamp(at - 1, 0, scale.length - 1)], scale[clamp(at - 3, 0, scale.length - 1)], scale[clamp(at - 2, 0, scale.length - 1)]]

  if (role === 'cadence') {
    const low = lowBass(bar.chord, bar.memory.bass, 48, 40, 55)
    return {
      treble: [[note(0, meter.ticksPerBar, sortAscending([rightSet[0], rightSet[1]]), velocity)]],
      bass: [[note(0, meter.ticksPerBar, [low, bassPartner(bar.chord, low, bar.dialect.bassSpacing)], velocity - 6)]],
    }
  }

  const table = ACCENT_GROUPS[meterGrid(meter)]
  // Development bars pick a fresh grouping every bar (off-kilter); otherwise the piece keeps one groove.
  const groups = role === 'development' ? table[Math.floor(bar.rand() * table.length)] : table[pieceChoice(bar, 'interlock-groups', table.length)]
  const accents = new Set(groupStarts(groups))
  const sparse = role === 'contrast' || role === 'half_cadence'
  const right: Voice = []
  const left: Voice = []
  for (let tick = 0; tick < meter.ticksPerBar; tick++) {
    if (sparse && tick % 4 >= 2) continue
    const accented = accents.has(tick)
    const hand = tick % 2 === 0 ? right : left
    const set = tick % 2 === 0 ? rightSet : leftSet
    // Additive feel: the cell widens from two notes to three as the bar goes on.
    const width = tick < meter.ticksPerBar / 2 && role !== 'climax' ? 2 : 3
    const pitch = set[Math.floor(tick / 2) % width]
    hand.push(note(tick, 1, pitch, velocity + (accented ? 12 : -6), accented ? { accent: true } : {}))
  }
  return { treble: [right], bass: [left] }
}

// ── displaced arpeggio ──────────────────────────────────────────────────────

/** 4+4+4+4 regrouped, after the pianist's own lesson on displacement: 5+5+6, 7+5+4, 4+3+5+4. */
const DISPLACEMENTS: Record<ReturnType<typeof meterGrid>, number[][]> = {
  sixteen: [[5, 5, 6], [7, 5, 4], [4, 3, 5, 4], [4, 4, 4, 4], [6, 5, 5]],
  twelve: [[5, 4, 3], [4, 3, 5], [3, 3, 3, 3], [5, 7], [4, 4, 4]],
  eight: [[3, 5], [5, 3], [4, 4], [2, 3, 3]],
  eighteen: [[5, 5, 8], [6, 6, 6], [7, 5, 6], [4, 5, 4, 5]],
  twentyfour: [[5, 5, 6, 8], [7, 5, 6, 6], [6, 6, 6, 6], [5, 7, 5, 7]],
}

export function displacedArpeggio(bar: BarContext): BarNotes {
  const { meter, velocity } = bar
  const role: BaseRoleId = bar.isLast ? 'cadence' : bar.role
  const low = lowBass(bar.chord, bar.memory.bass, 40, 33, 48)
  bar.memory.bass = low
  const partner = bassPartner(bar.chord, low, bar.dialect.bassSpacing)
  const center = role === 'climax' ? 74 : role === 'contrast' ? 76 : 67
  // Every chord tone, colour tones included, stacked from the middle of the keyboard up.
  const tones = ladder(bar.chord.pcs, center - 9, center + 12)

  if (role === 'cadence') {
    const voicing = sortAscending(leadVoicing(essentialTones(bar.chord, 4, { rootless: bar.chord.pcs.length > 3 }), undefined, 66))
    return {
      treble: [[note(0, meter.ticksPerBar, voicing, velocity, { roll: true })]],
      bass: [[note(0, meter.ticksPerBar, [low, partner], velocity - 6, { roll: true })]],
    }
  }

  const table = DISPLACEMENTS[meterGrid(meter)]
  const groups = role === 'development' ? table[(pieceChoice(bar, 'displacement', table.length) + 1 + (bar.index % 2)) % table.length] : table[pieceChoice(bar, 'displacement', table.length)]
  const right: Voice = []
  let tick = 0
  for (const length of groups) {
    // Each group restarts from the bottom and climbs; the long groups spill back down.
    for (let k = 0; k < length; k++) {
      const climb = k < tones.length ? k : tones.length - 1 - ((k - tones.length + 1) % tones.length)
      const pitch = tones[clamp(climb, 0, tones.length - 1)]
      right.push(note(tick, 1, pitch, velocity - 6 + (k === 0 ? 12 : 0) + (k === length - 1 ? 3 : 0), k === 0 ? { accent: true } : {}))
      tick++
    }
  }
  const half = meter.ticksPerBar / 2
  const left: Voice =
    role === 'contrast' || role === 'half_cadence'
      ? [note(0, meter.ticksPerBar, [low, partner], velocity - 10)]
      : [note(0, half, low, velocity - 6), note(half, half, partner, velocity - 12)]
  return { treble: [right], bass: [left] }
}

// ── chordal melody ──────────────────────────────────────────────────────────

const CHORDAL: Record<MeterId, RhythmBank> = {
  four_four: {
    // Anticipations: the chord lands an eighth early and hangs over.
    main: [[6, 2, 8], [8, 6, 2], [4, 4, 8], [6, 6, 4]],
    busy: [[4, 2, 2, 4, 4], [6, 2, 4, 4], [3, 3, 2, 4, 4]],
    sparse: [[16], [12, 4]],
    pause: [[8, 4, -4], [4, 8, -4]],
    close: [[12, -4], [8, 4, -4]],
  },
  three_four: {
    main: [[8, 4], [4, 8], [6, 6], [4, 4, 4]],
    busy: [[4, 2, 2, 4], [6, 2, 4]],
    sparse: [[12]],
    pause: [[8, -4], [4, 4, -4]],
    close: [[8, -4]],
  },
  six_eight: {
    main: [[6, 6], [6, 4, 2], [4, 2, 6]],
    busy: [[4, 2, 4, 2], [6, 2, 2, 2]],
    sparse: [[12]],
    pause: [[6, -6]],
    close: [[6, -6]],
  },
  two_four: {
    main: [[6, 2], [4, 4], [3, 3, 2]],
    busy: [[2, 2, 4], [3, 1, 4]],
    sparse: [[8]],
    pause: [[4, -4]],
    close: [[4, -4]],
  },
  nine_eight: {
    main: [[6, 6, 6], [6, 4, 2, 6], [4, 2, 6, 6]],
    busy: [[4, 2, 4, 2, 6], [6, 2, 2, 2, 6]],
    sparse: [[18]],
    pause: [[6, 6, -6]],
    close: [[12, -6]],
  },
  twelve_eight: {
    main: [[6, 6, 6, 6], [8, 4, 6, 6], [6, 6, 4, 8]],
    busy: [[4, 2, 4, 2, 6, 6], [6, 2, 2, 2, 6, 6]],
    sparse: [[24]],
    pause: [[12, 6, -6]],
    close: [[18, -6]],
  },
}

export function chordalMelody(bar: BarContext): BarNotes {
  const { meter, velocity } = bar
  const slots = slotsFrom(rhythmFor(bar, CHORDAL[meter.id], 'chordal'))
  const tops = melodyPitches(bar, slots, { lo: 65, hi: 81 })
  const colours = essentialTones(bar.chord, 4, { rootless: bar.chord.pcs.length > 3 })
  const right: Voice = slots.map((slot, k) => {
    const top = midiOf(tops[k])
    const below = ladder(colours, top - 11, top - 2).slice(-2)
    return note(slot.start, slot.dur, [...below, tops[k]], velocity + 2, slot.dur >= meter.beatTicks * 2 ? { roll: true } : {})
  })

  const low = lowBass(bar.chord, bar.memory.bass, 41, 34, 48)
  bar.memory.bass = low
  if (bar.isLast) return { treble: [right], bass: [[note(0, meter.ticksPerBar, [low, bassPartner(bar.chord, low, bar.dialect.bassSpacing)], velocity - 6, { roll: true })]] }

  // Inner voice: slides by half-steps from one guide tone toward the next chord's.
  const guide = bar.chord.core[3] ?? bar.chord.core[1]
  const from = nearestNote([guide], bar.memory.lines.inner ?? 58, 52, 64)
  const goal = bar.next ? nearestNote([bar.next.core[1], bar.next.core[3] ?? bar.next.core[1]], midiOf(from), 52, 64) : from
  const beats = meter.ticksPerBar / meter.beatTicks
  const inner: Voice = []
  let current = midiOf(from)
  for (let beat = 0; beat < beats; beat++) {
    const name = beat === 0 ? from : spellMidi(current, bar.key.sharps)
    inner.push(note(beat * meter.beatTicks, meter.beatTicks, name, velocity - 12))
    const remaining = midiOf(goal) - current
    if (remaining !== 0 && beats - beat - 1 <= Math.abs(remaining)) current += Math.sign(remaining)
  }
  bar.memory.lines.inner = midiOf(goal)
  const bassVoice: Voice = [note(0, meter.ticksPerBar, low, velocity - 6)]
  return { treble: [right], bass: [inner, bassVoice] }
}

// ── bell organum ────────────────────────────────────────────────────────────

const TOLLING: Record<MeterId, RhythmBank> = {
  four_four: {
    main: [[4, 4, 4, 4], [8, 4, 4], [4, 4, 8]],
    busy: [[4, 4, 4, 4], [2, 2, 4, 4, 4]],
    sparse: [[8, 8], [16]],
    pause: [[8, 4, -4]],
    close: [[12, -4]],
  },
  three_four: {
    main: [[4, 4, 4], [8, 4], [4, 8]],
    busy: [[4, 4, 4], [2, 2, 4, 4]],
    sparse: [[12]],
    pause: [[8, -4]],
    close: [[8, -4]],
  },
  six_eight: {
    main: [[6, 6], [6, 4, 2], [4, 2, 6]],
    busy: [[4, 2, 4, 2], [2, 2, 2, 6]],
    sparse: [[12]],
    pause: [[6, -6]],
    close: [[6, -6]],
  },
  two_four: {
    main: [[4, 4], [2, 2, 4], [4, 2, 2]],
    busy: [[2, 2, 2, 2], [2, 2, 4]],
    sparse: [[8]],
    pause: [[4, -4]],
    close: [[4, -4]],
  },
  nine_eight: {
    main: [[6, 6, 6], [6, 4, 2, 6], [4, 2, 6, 6]],
    busy: [[4, 2, 4, 2, 6], [2, 2, 2, 6, 6]],
    sparse: [[12, 6]],
    pause: [[6, 6, -6]],
    close: [[12, -6]],
  },
  twelve_eight: {
    main: [[6, 6, 6, 6], [8, 4, 6, 6], [6, 6, 4, 8]],
    busy: [[4, 2, 4, 2, 6, 6], [2, 2, 2, 6, 6, 6]],
    sparse: [[12, 12]],
    pause: [[12, 6, -6]],
    close: [[18, -6]],
  },
}

export function bellOrganum(bar: BarContext): BarNotes {
  const { meter, velocity } = bar
  const slots = slotsFrom(rhythmFor(bar, TOLLING[meter.id], 'tolling'))
  const loud = bar.role === 'climax'
  const tops = melodyPitches(bar, slots, { lo: loud ? 67 : 62, hi: loud ? 84 : 79 })
  const rungs = ladder(bar.scale, 28, 100)
  const rungNear = (midi: number) => rungs[nearestIndex(rungs, midi)]
  const unique = (pitches: string[]) => sortAscending(pitches.filter((pitch, i) => pitches.findIndex((other) => midiOf(other) === midiOf(pitch)) === i))
  // Octave with the fifth inside it — no third anywhere. The climax fills in the third: full triads, doubled.
  const hollow = (top: string) => unique([nearestNote([Note.pitchClass(top)], midiOf(top) - 12), rungNear(midiOf(top) - 5), top])
  const full = (top: string) => unique([...hollow(top), rungNear(midiOf(top) - 8.5)])
  const right: Voice = slots.map((slot, k) => note(slot.start, slot.dur, loud ? full(tops[k]) : hollow(tops[k]), velocity + (loud ? 8 : 0)))
  // Left hand moves in parallel two octaves below: organum.
  const left: Voice = slots.map((slot, k) => {
    const top = nearestNote([Note.pitchClass(tops[k])], clamp(midiOf(tops[k]) - 24, 43, 60))
    return note(slot.start, slot.dur, hollow(top), velocity - 4)
  })
  // The bell: a deep octave re-struck where the phrase turns.
  const tolls = bar.index === 0 || bar.isLast || bar.role === 'climax' || bar.role === 'statement' || bar.role === 'half_cadence'
  if (!tolls) return { treble: [right], bass: [left] }
  const bell = lowBass(bar.chord, bar.memory.bass, 31, 26, 38)
  bar.memory.bass = bell
  const bellVoice: Voice = [note(0, meter.ticksPerBar, [bell, nearestNote([bar.chord.bass], midiOf(bell) + 12)], velocity + (loud ? 6 : -2))]
  return { treble: [right], bass: [left, bellVoice] }
}
