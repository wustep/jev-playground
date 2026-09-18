// Grid durations → engravable note values.
//
// The renderer thinks in ticks (a note can be 5 or 13 sixteenths long); the
// page can only show w/h/q/8/16 and their dotted forms. This splits each note
// (and each silent gap) into tied pieces that respect the beat, e.g. the
// 3+3+2 ostinato becomes dotted-eighth, sixteenth-tied-to-eighth, eighth.

import type { MeterInfo, Note, Voice } from '../render/score'

/** Note values VexFlow can draw, in ticks, largest first. */
const VALUES = [16, 12, 8, 6, 4, 3, 2, 1] as const

export const VEX_DURATION: Record<number, { duration: string; dots: number }> = {
  16: { duration: 'w', dots: 0 },
  12: { duration: 'h', dots: 1 },
  8: { duration: 'h', dots: 0 },
  6: { duration: 'q', dots: 1 },
  4: { duration: 'q', dots: 0 },
  3: { duration: '8', dots: 1 },
  2: { duration: '8', dots: 0 },
  1: { duration: '16', dots: 0 },
}

/** Longest value that may start at `pos` without hiding a beat. */
function limitAt(pos: number, remaining: number, meter: MeterInfo): number {
  const compound = meter.beatTicks === 6
  if (pos % 2 === 1) {
    // On a sixteenth off-beat. Simple meters: run to the next beat (16th + dotted
    // 8th). Compound: only a mid-beat dotted eighth (2-against-3) may start here.
    if (!compound) return 4 - (pos % 4)
    return pos % 6 === 3 ? 3 : 1
  }
  if (pos % meter.beatTicks !== 0) return meter.beatTicks - (pos % meter.beatTicks)
  // On a beat. Compound meters may take a dotted half only on a 12-tick
  // boundary (a full 6/8 bar, or half a 12/8 bar) so 9/8 still shows 12+6.
  if (compound) return remaining >= 12 && pos % 12 === 0 ? 12 : 6
  return meter.ticksPerBar - pos
}

export function splitDuration(start: number, dur: number, meter: MeterInfo): { start: number; dur: number }[] {
  const pieces: { start: number; dur: number }[] = []
  let pos = start
  let remaining = dur
  while (remaining > 0) {
    const limit = Math.min(remaining, limitAt(pos, remaining, meter))
    const value = VALUES.find((v) => v <= limit) ?? 1
    pieces.push({ start: pos, dur: value })
    pos += value
    remaining -= value
  }
  return pieces
}

export interface Engraved {
  start: number
  dur: number
  /** undefined = rest */
  note?: Note
  /** Tie this piece to the next one (same note, split across values). */
  tieToNext: boolean
  /** First piece of its note: carries the accent / roll marks. */
  head: boolean
}

/** A voice as a gapless run of notes and rests that sums to exactly one bar. */
export function engraveVoice(voice: Voice, meter: MeterInfo): Engraved[] {
  const out: Engraved[] = []
  let cursor = 0
  const rest = (from: number, to: number) => {
    for (const piece of splitDuration(from, to - from, meter)) out.push({ ...piece, tieToNext: false, head: false })
  }
  for (const n of voice) {
    if (n.start > cursor) rest(cursor, n.start)
    const pieces = splitDuration(n.start, n.dur, meter)
    pieces.forEach((piece, i) => out.push({ ...piece, note: n, tieToNext: i < pieces.length - 1, head: i === 0 }))
    cursor = n.start + n.dur
  }
  if (cursor < meter.ticksPerBar) rest(cursor, meter.ticksPerBar)
  return out
}
