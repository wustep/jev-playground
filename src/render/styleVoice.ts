// Style, as the renderer sees it: one row per composer, four fields each.
//
// This replaces `dialect.ts` (four closed knob tables) and, more importantly,
// the reason those knobs existed — twenty-three texture functions with the
// composers' habits baked into them one at a time. A style does not get its
// own code path here. It gets a row.
//
// Nothing in this table chooses the tune. Which notes it has is the plan's
// job (register, motion, accompaniment, palette); this is how they are
// played: how hard the metre is leaned on, how long a short note is held, how
// even the touch is, whether the bar breathes, and whether a phrase that
// comes back is decorated the first time. That last one adds notes, and it
// is here rather than in the plan because dressing a reprise is a player's
// habit as much as a composer's — Chopin wrote extra fioriture for Op. 9/2
// into his pupils' copies. Style as constraint, not costume.
//
// A fifth column, `spacing` (how wide the left hand reaches), was declared
// here and never read by any accompaniment pattern. It is gone rather than
// left looking like it did something; wiring a left-hand reach back in is a
// sound change and belongs with the patterns, not with this table.

import type { StyleId } from '../plan/schema'

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
  /**
   * How the first return of a phrase is played — a period's answer, an
   * arch's restatement. `literal` restates it and saves the fioritura for the
   * form's late return; `dressed` decorates every return. Op. 9/2's answer
   * runs at 12.5 attacks a bar against its question's 7.25.
   */
  answers: 'literal' | 'dressed'
}

export const STYLE_VOICES: Record<StyleId, StyleVoice> = {
  bach: { accent: 0.8, articulation: 0.9, humanize: 2, rubato: 'even', answers: 'literal' },
  beethoven: { accent: 1.3, articulation: 0.95, humanize: 3, rubato: 'even', answers: 'literal' },
  chopin: { accent: 0.7, articulation: 1, humanize: 3, rubato: 'light', answers: 'dressed' },
  debussy: { accent: 0.4, articulation: 1, humanize: 4, rubato: 'light', answers: 'literal' },
  glass: { accent: 0.9, articulation: 0.92, humanize: 1, rubato: 'two_against_three', answers: 'literal' },
  hans_zimmer: { accent: 1, articulation: 1, humanize: 2, rubato: 'even', answers: 'literal' },
  laufey: { accent: 1.1, articulation: 0.9, humanize: 5, rubato: 'swung', answers: 'literal' },
  elijah_fox: { accent: 0.8, articulation: 1, humanize: 4, rubato: 'light', answers: 'literal' },
}
