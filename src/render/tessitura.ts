// Plan-controlled singing register.
//
// Texture `melodyPitches` windows all centre near MIDI 74–76, so a truthful
// Beethoven Adagio (melody ~62) cannot get there by picking labels alone.
// Tessitura is derived from labels the planner already asks — character, tempo,
// texture — and carried on `BarContext`. No new global, so Coder's allowlist
// does not change.
//
// `rolling_nocturne` keeps its baked window for every character except the
// forceful ones. That texture is the tune ringing on top of the roll; Chopin's
// measured melody (~76.4 vs MIDI 76.5) already sits there, including when the
// lyrical prior's argmax tempo is adagio. A slow singing character on a
// cantabile texture (Alberti, chorale, aria) drops into the low band instead.

import { TEMPO_BPM, type CharacterId, type TempoId, type TextureId } from '../plan/schema'

export type MelodyTessitura = 'low' | 'mid' | 'high'

/**
 * Semitones added to a texture's home melody window.
 * Mid is that window unchanged (centre ~74–76). Low moves an Alberti centre
 * of 75 onto 62. High sits a fifth above the baked centre.
 */
export const MELODY_WINDOW_SHIFT: Record<MelodyTessitura, number> = {
  low: -13,
  mid: 0,
  high: 7,
}

export interface SpellingWindow {
  lo: number
  hi: number
  /** MIDI the first sung note aims at when nothing has sounded yet. */
  aim: number
}

/**
 * Guide's spelling window for a tessitura.
 * Mid is the historical treble range (55–84, aim 67) so an already-right
 * nocturne line is not dragged. Low aims at MIDI 62 and stops short of C5,
 * so a stepwise figure stays in the Adagio octave instead of climbing out.
 */
export function guideSpelling(tessitura: MelodyTessitura): SpellingWindow {
  switch (tessitura) {
    case 'low':
      // Centred on the Adagio tessitura. The top stops short of C5 so a
      // stepwise figure cannot climb out of the low-60s; Ab3–G4 still fit.
      return { lo: 54, hi: 70, aim: 62 }
    case 'high':
      return { lo: 60, hi: 91, aim: 74 }
    case 'mid':
      return { lo: 55, hi: 84, aim: 67 }
  }
}

/** Union of the historical treble range and this tessitura, for note validation. */
export function singingAcceptRange(tessitura: MelodyTessitura): { lo: number; hi: number } {
  const spelling = guideSpelling(tessitura)
  return { lo: Math.min(55, spelling.lo), hi: Math.max(84, spelling.hi) }
}

const FORCEFUL: ReadonlySet<CharacterId> = new Set(['stormy_drama', 'heroic_bright', 'playful_wit'])

/** Slow songs and hymns — the characters whose tune should be able to sit low. */
const LOW_WHEN_SLOW: ReadonlySet<CharacterId> = new Set(['lyrical_song', 'solemn_hymn', 'meditative_stillness'])

/**
 * The melody is already specified as ringing above the accompaniment.
 * Shifting it with every slow lyrical plan would move Chopin off 76.5.
 */
const KEEPS_BAKED_WINDOW: ReadonlySet<TextureId> = new Set(['rolling_nocturne'])

export function melodyTessitura(plan: { character: CharacterId; tempo: TempoId; texture: TextureId }): MelodyTessitura {
  if (FORCEFUL.has(plan.character)) return 'high'
  const slow = TEMPO_BPM[plan.tempo] <= TEMPO_BPM.adagio
  if (slow && LOW_WHEN_SLOW.has(plan.character) && !KEEPS_BAKED_WINDOW.has(plan.texture)) return 'low'
  return 'mid'
}

/** Home melody window after the plan's tessitura. `anchored` windows are already in the sounding octave. */
export function melodyWindow(lo: number, hi: number, tessitura: MelodyTessitura, anchored = false): { lo: number; hi: number } {
  if (anchored) return { lo, hi }
  const shift = MELODY_WINDOW_SHIFT[tessitura]
  return { lo: lo + shift, hi: hi + shift }
}
