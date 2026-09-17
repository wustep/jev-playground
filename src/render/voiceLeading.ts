// Small voice-leading helpers: keep hands where they were, move each voice as
// little as possible, and let the bass take an inversion when that's smoother.

import type { ResolvedChord } from './harmony'
import { byPitch, ladder, midiOf, nearestNote } from './pitch'

/**
 * Close-position voicing of `pcs` that moves least from `previous`
 * (or sits nearest `center` when there is no previous voicing).
 * Tries every inversion in the octaves around the target.
 */
export function leadVoicing(pcs: readonly string[], previous: readonly string[] | undefined, center: number): string[] {
  const target = previous?.length ? previous.map(midiOf) : undefined
  const anchor = target ? target.reduce((a, b) => a + b, 0) / target.length : center
  let best: string[] = []
  let bestCost = Infinity
  for (let inversion = 0; inversion < pcs.length; inversion++) {
    const order = [...pcs.slice(inversion), ...pcs.slice(0, inversion)]
    for (const shift of [-12, 0, 12]) {
      const voicing = stackUp(order, anchor - 7 + shift)
      const mids = voicing.map(midiOf)
      const mean = mids.reduce((a, b) => a + b, 0) / mids.length
      let cost = Math.abs(mean - anchor) * 0.6 + Math.abs(mean - center) * 0.25
      if (target && target.length === mids.length) {
        cost += mids.reduce((sum, m, i) => sum + Math.abs(m - target[i]), 0)
      }
      if (cost < bestCost) {
        best = voicing
        bestCost = cost
      }
    }
  }
  return best
}

/** Stack pitch classes upward, each the first instance above the one before. */
export function stackUp(pcs: readonly string[], fromMidi: number): string[] {
  const out: string[] = []
  let floor = fromMidi
  for (const pc of pcs) {
    const rungs = ladder([pc], floor, floor + 12)
    const note = rungs[0] ?? nearestNote([pc], floor)
    out.push(note)
    floor = midiOf(note) + 1
  }
  return out
}

/**
 * Bass note for a chord: the root nearest the previous bass note — unless the
 * root would be a big leap and the third is close, in which case take the
 * first inversion (never on the first or last bar, which want root position).
 */
export function bassFor(
  chord: ResolvedChord,
  previous: string | undefined,
  options: { lo: number; hi: number; allowInversion: boolean },
): string {
  const center = (options.lo + options.hi) / 2
  const from = previous ? midiOf(previous) : center
  const root = nearestNote([chord.root], from, options.lo, options.hi)
  if (!options.allowInversion || !previous) return root
  const third = nearestNote([chord.pcs[1]], from, options.lo, options.hi)
  const rootLeap = Math.abs(midiOf(root) - from)
  const thirdLeap = Math.abs(midiOf(third) - from)
  return rootLeap > 5 && thirdLeap <= 2 ? third : root
}

/**
 * Pick the pitch classes for an n-note voicing: always the 3rd (or sus) and,
 * if present, the 7th; then colour tones; the 5th and root go first when
 * something has to give.
 */
export function essentialTones(chord: ResolvedChord, size: number, options: { rootless?: boolean } = {}): string[] {
  const [root, third, fifth, seventh] = chord.core
  const priority = [third, seventh, ...chord.extensions, options.rootless ? undefined : root, fifth, options.rootless ? root : undefined]
  const chosen = priority.filter((pc): pc is string => Boolean(pc)).slice(0, size)
  // Keep stacked-thirds order so inversions rotate sensibly.
  return chord.pcs.filter((pc) => chosen.includes(pc))
}

export const sortAscending = (notes: string[]) => [...notes].sort(byPitch)
