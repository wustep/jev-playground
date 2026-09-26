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
// even the touch is, whether the bar breathes, whether a phrase that comes
// back is decorated the first time, how a beat is divided, whether held
// harmony rings or moves in parts, whether a pulse keeps one speed, and how
// far a broken chord spreads. The last five add or move notes, and they are
// here rather than in the plan because dressing a reprise, dotting a rhythm
// and realizing a chord are a player's habits as much as a composer's —
// Chopin wrote extra fioriture for Op. 9/2 into his pupils' copies. Style as
// constraint, not costume.
//
// A change to one row moves that style's notes and no other's;
// `styleFingerprint.test.ts` holds every style to what it rendered before.

import type { StyleId } from '../plan/schema'

export interface StyleVoice {
  /** Scales the metric accent (downbeat up, off-beats down). */
  accent: number
  /** Fraction of a short note's written length that sounds when the pedal is up. */
  articulation: number
  /** Peak random velocity deviation, in MIDI units. */
  humanize: number
  /**
   * How the bar's inner time bends. A cross-rhythm is not one of these: bent
   * in both hands at once, a triplet lean on every eighth pair is a swing.
   * Glass's two against three is written into the notes (`lilt.duplets`).
   */
  rubato: 'even' | 'light' | 'swung'
  /**
   * How the first return of a phrase is played — a period's answer, an
   * arch's restatement. `literal` restates it and saves the fioritura for the
   * form's late return; `dressed` decorates every return. Op. 9/2's answer
   * runs at 12.5 attacks a bar against its question's 7.25.
   */
  answers: 'literal' | 'dressed'
  /**
   * How the line divides the beats it moves within. `dotted` is the share of
   * two-note beats played long–short rather than even; `anticipate` the
   * chance an ordinary bar strikes its half-bar half a beat early and holds
   * it across, the pop-vocal syncopation. Like `answers`, this adds and
   * moves attacks but chooses no pitch.
   *
   * Measured on the reference top voices: two-note beats are even in 93% of
   * BWV 772's, all of Op. 13 II's and all of Préludes I/4's, and dotted in
   * 45% of the mazurka's, and none of them ever snaps (sixteenth, dotted
   * eighth). Laufey has no reference; her anticipations are the one row
   * value here that rests on the style notes, not a measurement.
   *
   * `run`, where set, is the attacks a florid line aims at per quarter note,
   * in place of the shared 3.5 a beat: a style whose running line never lets
   * up, in any metre — a dotted-quarter beat runs six. Such a line runs on
   * through an inner cadence too, instead of holding its arrival a beat.
   * Fox's displacement lesson is sixteen sixteenths to the bar, and
   * "Wyoming" plays 16.4.
   *
   * `duplets`, where set, is the share of two-note compound beats split
   * evenly (two dotted eighths) instead of leaning long–short, as a
   * barcarolle's do: over a left hand in eighths, two against three.
   */
  lilt: { dotted: number; anticipate: number; run?: number; duplets?: number }
  /**
   * Accents that regroup a running bar of sixteenths against the metre, one
   * grouping per bar in turn: Fox's 5+5+6 and 7+5+4. Absent: the metre
   * accents it.
   */
  grouping?: readonly (readonly number[])[]
  /**
   * How a `sustained` accompaniment keeps its harmony alive. Absent, each
   * chord sounds once and rings, as a pad does. `parts`: bass, tenor and alto
   * strike again with the tune on the beat, as four-part harmony, and a
   * passing note in the tune gets a passing chord under it. A harpsichord
   * chord dies at once; across Bach's 330 four-part chorales in 4/4 the lower
   * voices strike on 92% of beats, 6.1 times a bar. Like `answers`, it adds
   * notes and changes none of the tune's.
   */
  held?: 'parts'
  /**
   * A `pulse` that never changes speed. Absent, the repeated chords thin to
   * the beat under a statement or a soft bar and fill back to eighths after
   * it. Set, they run in the metre's eighths all piece long, and the form
   * and the dynamic change only their weight: voices, and the octave under
   * the bass. Zimmer's build and Glass's process both keep the figure while
   * the layers change; switching rate, their ostinato changed speed at a
   * third of their barlines.
   */
  ostinato?: true
  /**
   * How far a `broken` figure spreads. Absent, it is the chord in close
   * position an octave over the held bass, rocking inside a sixth — the
   * shapes an Alberti bass makes. `wide` opens it over the bass, as a
   * nocturne's left hand does: the fifth, the tenth, the fifteenth.
   */
  reach?: 'wide'
}

export const STYLE_VOICES: Record<StyleId, StyleVoice> = {
  bach: { accent: 0.8, articulation: 0.9, humanize: 2, rubato: 'even', answers: 'literal', lilt: { dotted: 0.07, anticipate: 0 }, held: 'parts' },
  beethoven: { accent: 1.3, articulation: 0.95, humanize: 3, rubato: 'even', answers: 'literal', lilt: { dotted: 0.3, anticipate: 0 } },
  chopin: { accent: 0.7, articulation: 1, humanize: 3, rubato: 'light', answers: 'dressed', lilt: { dotted: 0.35, anticipate: 0 }, reach: 'wide' },
  debussy: { accent: 0.4, articulation: 1, humanize: 4, rubato: 'light', answers: 'literal', lilt: { dotted: 0.05, anticipate: 0.15 } },
  glass: { accent: 0.9, articulation: 0.92, humanize: 1, rubato: 'even', answers: 'literal', lilt: { dotted: 0, anticipate: 0, duplets: 1 }, ostinato: true },
  hans_zimmer: { accent: 1, articulation: 1, humanize: 2, rubato: 'even', answers: 'literal', lilt: { dotted: 0.1, anticipate: 0.1 }, ostinato: true },
  laufey: { accent: 1.1, articulation: 0.9, humanize: 5, rubato: 'swung', answers: 'literal', lilt: { dotted: 0.15, anticipate: 0.35 } },
  elijah_fox: { accent: 0.8, articulation: 1, humanize: 4, rubato: 'light', answers: 'literal', lilt: { dotted: 0.05, anticipate: 0.15, run: 4 }, grouping: [[5, 5, 6], [7, 5, 4]] },
}
