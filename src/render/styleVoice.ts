// Style, as the renderer sees it: one row per composer, six numbers each.
//
// This replaces `dialect.ts` (four closed knob tables) and, more importantly,
// the reason those knobs existed — twenty-three texture functions with the
// composers' habits baked into them one at a time. A style does not get its
// own code path here. It gets a row.
//
// Nothing in this table chooses notes. Which notes to play is the plan's job
// (register, motion, accompaniment, palette); this is only how they are
// played: how hard the metre is leaned on, how long a short note is held, how
// even the touch is, whether the bar breathes, and how wide the left hand
// reaches. Style as constraint, not costume.

import type { StyleId } from '../plan/schema'
import type { SpacingId } from './accompaniment'

export interface StyleVoice {
  /** Scales the metric accent (downbeat up, off-beats down). */
  accent: number
  /** Fraction of a short note's written length that sounds when the pedal is up. */
  articulation: number
  /** Peak random velocity deviation, in MIDI units. */
  humanize: number
  /**
   * How the bar's inner time bends. `two_against_three` leans each eighth
   * pair toward a triplet in simple metres — the cross-rhythm a pulse piece
   * lives on — and leaves compound metres even.
   */
  rubato: 'even' | 'light' | 'swung' | 'two_against_three'
  /** How wide the left hand reaches under its bass. */
  spacing: SpacingId
}

export const STYLE_VOICES: Record<StyleId, StyleVoice> = {
  bach: { accent: 0.8, articulation: 0.9, humanize: 2, rubato: 'even', spacing: 'close' },
  beethoven: { accent: 1.3, articulation: 0.95, humanize: 3, rubato: 'even', spacing: 'open' },
  chopin: { accent: 0.7, articulation: 1, humanize: 3, rubato: 'light', spacing: 'tenths' },
  debussy: { accent: 0.4, articulation: 1, humanize: 4, rubato: 'light', spacing: 'tenths' },
  glass: { accent: 0.9, articulation: 0.92, humanize: 1, rubato: 'two_against_three', spacing: 'open' },
  hans_zimmer: { accent: 1, articulation: 1, humanize: 2, rubato: 'even', spacing: 'open' },
  laufey: { accent: 1.1, articulation: 0.9, humanize: 5, rubato: 'swung', spacing: 'open' },
  elijah_fox: { accent: 0.8, articulation: 1, humanize: 4, rubato: 'light', spacing: 'tenths' },
}
