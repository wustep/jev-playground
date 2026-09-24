// Small pitch utilities on top of tonal. Pitches stay as spelled note names
// ("Eb4") all the way to the sheet so accidentals come out right; MIDI numbers
// are only used for distance and range arithmetic.

import { Note } from 'tonal'

const MIDI = new Map<string, number>()

export function midiOf(note: string): number {
  const known = MIDI.get(note)
  if (known !== undefined) return known
  const midi = Note.midi(note)
  if (midi == null) throw new Error(`Not a pitch: ${note}`)
  MIDI.set(note, midi)
  return midi
}

/** Replace double sharps/flats with their plain enharmonic (C## → D). */
export function tidy(pc: string): string {
  return pc.includes('##') || pc.includes('bb') ? Note.simplify(pc) : pc
}

/** Same, for a full note name — octave-safe (Cbb4 → Bb3). */
export function tidyNote(note: string): string {
  return note.includes('##') || note.includes('bb') ? Note.simplify(note) : note
}

// Textures ask for the same few ladders thousands of times per piece; tonal's
// name → MIDI parsing dominates the render otherwise.
const LADDERS = new Map<string, readonly string[]>()

/** Every note with one of `pcs` as pitch class within [lo, hi], ascending. */
export function ladder(pcs: readonly string[], lo: number, hi: number): string[] {
  const cacheKey = `${pcs.join(',')}|${lo}|${hi}`
  const cached = LADDERS.get(cacheKey)
  if (cached) return [...cached]
  const notes: { name: string; midi: number }[] = []
  for (const pc of pcs) {
    for (let octave = 0; octave <= 8; octave++) {
      const name = `${pc}${octave}`
      const midi = Note.midi(name)
      if (midi != null && midi >= lo && midi <= hi) notes.push({ name, midi })
    }
  }
  notes.sort((a, b) => a.midi - b.midi)
  // Enharmonic duplicates (B# / C) would stall stepwise motion; keep the first.
  const rungs = notes.filter((n, i) => i === 0 || n.midi !== notes[i - 1].midi).map((n) => n.name)
  if (LADDERS.size > 4000) LADDERS.clear()
  LADDERS.set(cacheKey, rungs)
  return [...rungs]
}

/** Index of the ladder rung closest to `target` (ties resolve downward). */
export function nearestIndex(rungs: readonly string[], target: number): number {
  let best = 0
  let bestDistance = Infinity
  rungs.forEach((name, i) => {
    const distance = Math.abs(midiOf(name) - target)
    if (distance < bestDistance) {
      best = i
      bestDistance = distance
    }
  })
  return best
}

export function nearestNote(pcs: readonly string[], target: number, lo = 0, hi = 127): string {
  const rungs = ladder(pcs, lo, hi)
  if (rungs.length === 0) throw new Error(`No ${pcs.join('/')} between ${lo} and ${hi}`)
  return rungs[nearestIndex(rungs, target)]
}

export const clamp = (value: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, value))

export const byPitch = (a: string, b: string) => midiOf(a) - midiOf(b)
