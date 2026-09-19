// Light code-side priors for Debug notes when pick=sample.
//
// Jev still owns the judgment. We only tilt the draw toward degrees near the
// previous sounding one, and — for lyrical / song characters — toward a
// rhythm with a long tone. Mix is small so a confident Jev answer still wins.

import { degreeDistance, rhythmHasLongTone, rhythmIsEven, type MelodyDegreeId, type PhraseRhythmId } from '../../plan/notes.js'
import type { CharacterId } from '../../plan/schema.js'
import { normalize } from '../pick.js'

/** Blend weight: 0 = Jev only. Keep this small so a peaked Jev answer still wins. */
export const NOTES_PRIOR_MIX = 0.32

/** Characters whose tune should breathe: long tones and rests, not four even attacks. */
export function prefersLongAndRest(character: CharacterId): boolean {
  switch (character) {
    case 'lyrical_song':
    case 'solemn_hymn':
    case 'meditative_stillness':
    case 'dreamy_haze':
    case 'warm_groove':
    case 'restless_searching':
      return true
    default:
      return false
  }
}

export function degreeProximityBonus(degree: MelodyDegreeId, previous: MelodyDegreeId | null, lyrical: boolean): number {
  if (degree === 'rest') return lyrical ? 0.55 : 0.1
  if (!previous || previous === 'rest') return degree === 'tonic' ? 0.2 : 0
  const distance = degreeDistance(previous, degree)
  if (distance === 0) return 1
  if (distance === 1) return 0.8
  if (distance === 2) return 0.45
  if (distance === 3) return 0.15
  return 0
}

export function blendJevPrior(jev: Record<string, number>, prior: Record<string, number>, mix = NOTES_PRIOR_MIX): Record<string, number> {
  const keys = Object.keys(jev)
  return normalize(
    Object.fromEntries(
      keys.map((id) => {
        const left = Math.max(0, jev[id] ?? 0)
        const right = Math.max(0, prior[id] ?? 0)
        return [id, left * (1 - mix) + right * mix]
      }),
    ) as Record<string, number>,
  )
}

export function withDegreeProximity(
  probabilities: Record<string, number>,
  previous: MelodyDegreeId | null,
  options: { lyrical?: boolean; mix?: number } = {},
): Record<string, number> {
  const lyrical = options.lyrical === true
  const prior = normalize(
    Object.fromEntries(
      Object.keys(probabilities).map((id) => [id, degreeProximityBonus(id as MelodyDegreeId, previous, lyrical)]),
    ) as Record<string, number>,
  )
  return blendJevPrior(probabilities, prior, options.mix)
}

export function lyricalRhythmBonus(rhythm: PhraseRhythmId): number {
  if (rhythmHasLongTone(rhythm)) return 1
  if (rhythmIsEven(rhythm)) return 0
  return 0.35
}

export function withLyricalRhythmBias(probabilities: Record<string, number>, options: { mix?: number } = {}): Record<string, number> {
  const prior = normalize(
    Object.fromEntries(Object.keys(probabilities).map((id) => [id, lyricalRhythmBonus(id as PhraseRhythmId)])) as Record<string, number>,
  )
  return blendJevPrior(probabilities, prior, options.mix)
}

/** Same shape, ignoring rest-vs-tone mismatches: three or more shared sounding degrees. */
export function degreesNearlyIdentical(a: readonly MelodyDegreeId[], b: readonly MelodyDegreeId[]): boolean {
  if (a.length !== b.length || a.length === 0) return false
  let same = 0
  let compared = 0
  for (let i = 0; i < a.length; i++) {
    if (a[i] === 'rest' && b[i] === 'rest') {
      same += 1
      continue
    }
    if (a[i] === 'rest' || b[i] === 'rest') continue
    compared += 1
    if (a[i] === b[i]) same += 1
  }
  return compared >= 2 && same >= 3
}

const DEGREE_LADDER: MelodyDegreeId[] = [
  'dominant_low',
  'tonic',
  'supertonic',
  'mediant',
  'subdominant',
  'dominant',
  'submediant',
  'leading',
  'tonic_high',
  'mediant_high',
]

/** Move the last sounding degree one scale step so a stamped bar is not a clone. */
export function nudgeMelodyDegrees(degrees: readonly MelodyDegreeId[]): MelodyDegreeId[] {
  const out = [...degrees]
  for (let i = out.length - 1; i >= 0; i--) {
    if (out[i] === 'rest') continue
    const index = DEGREE_LADDER.indexOf(out[i])
    if (index < 0) return out
    out[i] = DEGREE_LADDER[index >= DEGREE_LADDER.length - 1 ? index - 1 : index + 1]
    return out
  }
  return out
}
