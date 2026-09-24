// Per-style knowledge that lives in CODE, not in Jev.
//
//  • `brief`      — optional prose handed to Jev as state (toggle in the UI).
//                   With the brief off, Jev only sees the style's name.
//  • `priors`     — base weights the offline HeuristicPlanner samples from.
//  • `archetypes` — the kinds of piece this composer actually wrote, one per
//                   character: each overrides the priors it cares about, so a
//                   plan is coherent (a sarabande is slow AND in 3/4 AND sung)
//                   and two generations can be genuinely different pieces.
//  • `harmony`    — a small grammar instead of whole-progression templates:
//                   two-bar heads, travelling units and tails, verified
//                   four-bar phrases, chord cycles, pedals and codas. Forms
//                   (src/plan/forms.ts) say how to combine them, so eight bars
//                   come out of hundreds of combinations, not three.
//
// JevPlanner never reads priors, archetypes or harmony: it asks Jev.
//
// Where each entry comes from — score, corpus or analysis — is recorded in
// docs/STYLE_NOTES.md. Entries for living musicians are marked there as
// verified (from their own teaching material) or inferred.

import type {
  AccompanimentId,
  ChordId,
  ContourId,
  DynamicId,
  DynamicShapeId,
  FormId,
  KeyId,
  MeterId,
  MotionId,
  PaletteId,
  RegisterId,
  StyleId,
  TempoId,
} from './schema.js'
import type { PhraseEnd } from './phrase.js'

export type Weights<K extends string> = Partial<Record<K, number>>

export interface StylePriors {
  /** Where this style's tune tends to sing. */
  register: Weights<RegisterId>
  /** How fast it tends to move. */
  motion: Weights<MotionId>
  /** What tends to hold it up. */
  accompaniment: Weights<AccompanimentId>
  form: Weights<FormId>
  key: Weights<KeyId>
  meter: Weights<MeterId>
  palette: Weights<PaletteId>
  tempo: Weights<TempoId>
  dynamics: Weights<DynamicId>
  dynamicShape: Weights<DynamicShapeId>
  contour: Weights<ContourId>
}

export interface Variant {
  /**
   * The kind of piece this is, for the debug panel and for reading this file.
   * It is NOT a plan field and Jev never sees it: `character` used to be one,
   * and a post-50 sweep found all twelve of its values produced the same
   * melody. A label that cannot be heard does not belong in the plan.
   */
  name: string
  /** Relative frequency of this kind of piece within the style. */
  weight: number
  /** Replaces the base prior of every field it names. */
  priors: Partial<StylePriors>
}

type Pair = readonly [ChordId, ChordId]
type Phrase = readonly [ChordId, ChordId, ChordId, ChordId]

export interface HarmonyBook {
  /** Two-bar openings, on or around the tonic. */
  heads: readonly Pair[]
  /** Two-bar travelling units: sequence links, turnarounds, planing steps. */
  seqs: readonly Pair[]
  /** Two-bar phrase endings. */
  tails: Record<PhraseEnd, readonly Pair[]>
  /** Whole four-bar phrases taken from (or modelled closely on) real pieces. */
  phrases: Record<PhraseEnd, readonly Phrase[]>
  /** Chord cycles of 2–8 bars for loop-built forms. */
  loops: readonly (readonly ChordId[])[]
  /** Four bars of standing on the dominant (or a drone). */
  pedals: readonly Phrase[]
  /** Four-bar closing phrases and tags. */
  codas: readonly Phrase[]
  /** Chords a piece may end on. */
  finals: readonly ChordId[]
  /**
   * Two harmonies in one bar, [first half, second half]: the approach and the
   * arrival of a cadence — cadential six-four to V, ii–V, a pre-dominant leaning
   * into the dominant. Applied where a phrase closes or pauses, when the bar's
   * chord matches an arrival. Empty for styles that keep one harmony per bar.
   */
  splits: readonly Pair[]
  /** What a `surprise` bar reaches for. */
  surprises: readonly ChordId[]
  /** Light reharmonisation for varied returns (and, for loops, a new bass each pass). */
  subs: Partial<Record<ChordId, readonly ChordId[]>>
}

export interface StyleProfile {
  brief: string
  priors: StylePriors
  variants: Variant[]
  harmony: { major: HarmonyBook; minor: HarmonyBook }
  /** True where holding one chord across a barline is idiomatic (long harmonic rhythm). */
  holds: boolean
}

export const STYLE_PROFILES: Record<StyleId, StyleProfile> = {
  // ────────────────────────────────────────────────────────────────────────────
  bach: {
    brief:
      'German Baroque keyboard, c. 1720: the bass walks by step through inversions (I–ii4/2–V6/5), circle-of-fifths sequences and pedal points — not a singing tune over wide arpeggios, not root-to-root leaps. Eight to sixteen bars are a spun-out head–sequence–cadence or a binary-dance strain that cadences in V (major) or III (minor) at the midpoint; textures are unbroken prelude figuration, two-part invention, four-part chorale, or sarabande/gigue. Terraced dynamics on harpsichord or organ — dry, no swells, no rubato.',
    priors: {
      form: { period: 25, sentence: 10, arch: 30, chain: 35 },
      key: { C_major: 12, G_major: 10, D_major: 9, F_major: 8, Bb_major: 6, A_major: 5, Eb_major: 4, E_major: 3, D_minor: 12, G_minor: 9, C_minor: 9, A_minor: 8, E_minor: 6, B_minor: 6, F_minor: 3 },
      meter: { four_four: 42, three_four: 24, six_eight: 14, twelve_eight: 12, nine_eight: 8 },
      register: { mid: 82, high: 18 },
      motion: { walking: 20, flowing: 25, florid: 55 },
      accompaniment: { sustained: 10, broken: 20, stride: 10, counterline: 60 },
      palette: { diatonic: 60, chromatic_approach: 40 },
      tempo: { andante: 28, moderato: 36, allegro: 26, vivace: 6, larghetto: 2, grave: 2 },
      dynamics: { mf: 50, mp: 25, f: 25 },
      dynamicShape: { terraced: 50, steady: 30, waves: 10, late_surge: 10 },
      contour: { rise: 18, fall: 20, arch: 16, dip: 8, wave: 14, leap_fall: 24 },
    },
    variants: [
      // Preludes in unbroken figuration (WTC I/1, I/2).
      {
        name: 'perpetual',
        weight: 24,
        priors: {
          form: { period: 10, sentence: 10, arch: 20, chain: 60 },
          register: { mid: 100 },
          motion: { florid: 100 },
          accompaniment: { broken: 60, counterline: 40 },
          meter: { four_four: 58, three_four: 12, six_eight: 12, twelve_eight: 12, nine_eight: 6 },
          tempo: { andante: 35, moderato: 40, allegro: 25 },
          dynamics: { mp: 45, mf: 45, p: 10 },
          dynamicShape: { steady: 35, terraced: 25, late_surge: 25, waves: 15 },
          contour: { rise: 15, fall: 15, arch: 25, wave: 45 },
        },
      },
      // Two-part inventions.
      {
        name: 'witty',
        weight: 20,
        priors: {
          form: { period: 15, sentence: 15, arch: 25, chain: 45 },
          register: { mid: 100 },
          motion: { florid: 85, flowing: 15 },
          accompaniment: { counterline: 100 },
          tempo: { allegro: 50, moderato: 32, presto: 10, vivace: 8 },
          dynamics: { mf: 60, f: 25, mp: 15 },
          contour: { rise: 18, fall: 18, arch: 10, wave: 14, leap_fall: 40 },
        },
      },
      // Four-part chorales.
      {
        name: 'hymn',
        weight: 16,
        priors: {
          form: { period: 70, sentence: 10, arch: 20 },
          register: { mid: 100 },
          motion: { walking: 90, flowing: 10 },
          accompaniment: { sustained: 90, counterline: 10 },
          meter: { four_four: 80, three_four: 20 },
          tempo: { andante: 40, adagio: 30, moderato: 18, grave: 12 },
          dynamicShape: { steady: 60, terraced: 40 },
          contour: { rise: 20, fall: 30, arch: 30, dip: 10, wave: 10 },
        },
      },
      // Sarabandes and arias: slow triple time, ornamented line over a walking bass.
      {
        name: 'singing',
        weight: 16,
        priors: {
          form: { period: 35, arch: 65 },
          register: { mid: 70, low: 20, high: 10 },
          motion: { flowing: 65, walking: 20, florid: 15 },
          accompaniment: { counterline: 70, stride: 20, sustained: 10 },
          meter: { three_four: 55, four_four: 30, six_eight: 15 },
          tempo: { adagio: 40, andante: 36, largo: 12, larghetto: 12 },
          dynamics: { mp: 50, p: 30, mf: 20 },
          dynamicShape: { terraced: 40, waves: 30, steady: 30 },
          contour: { rise: 10, fall: 22, arch: 28, dip: 6, wave: 16, leap_fall: 18 },
        },
      },
      // Gigues, minuets, correntes.
      {
        name: 'dance',
        weight: 16,
        priors: {
          form: { period: 20, arch: 70, chain: 10 },
          register: { mid: 60, high: 40 },
          motion: { flowing: 40, florid: 35, walking: 25 },
          accompaniment: { stride: 35, counterline: 65 },
          meter: { six_eight: 36, three_four: 32, twelve_eight: 20, nine_eight: 12 },
          tempo: { allegro: 42, moderato: 30, presto: 12, vivace: 16 },
          contour: { rise: 18, fall: 17, arch: 8, wave: 12, leap_fall: 45 },
        },
      },
      // Minor-key toccatas.
      {
        name: 'stormy',
        weight: 8,
        priors: {
          form: { sentence: 15, chain: 85 },
          key: { C_minor: 25, D_minor: 25, G_minor: 18, A_minor: 12, E_minor: 10, F_minor: 10 },
          register: { mid: 100 },
          motion: { florid: 90, flowing: 10 },
          accompaniment: { counterline: 85, pulse: 15 },
          tempo: { allegro: 50, presto: 24, vivace: 16, prestissimo: 6, moderato: 4 },
          dynamics: { f: 55, mf: 45 },
          dynamicShape: { terraced: 45, late_surge: 35, steady: 20 },
        },
      },
    ],
    holds: false,
    harmony: {
      major: {
        heads: [['I', 'ii42'], ['I', 'V6'], ['I', 'vi'], ['I', 'Imaj42'], ['I', 'vi6'], ['I', 'V65'], ['I6', 'IV'], ['I', 'IV64']],
        seqs: [['vi7', 'ii7'], ['iii7', 'vi7'], ['ii7', 'V7'], ['IVmaj7', 'vii_dim'], ['V7_of_ii', 'ii'], ['V7_of_vi', 'vi'], ['V7_of_IV', 'IV'], ['vi6', 'V7_of_V'], ['V6', 'Imaj42'], ['vi7', 'V7_of_V'], ['ii6', 'vii_dim6'], ['I6', 'IVmaj7']],
        tails: {
          closed: [['V7', 'I'], ['V65', 'I'], ['vii_dim6', 'I'], ['V43', 'I']],
          half: [['ii65', 'V'], ['IV', 'V'], ['vi', 'V'], ['V7_of_V', 'V'], ['I64', 'V'], ['V65_of_V', 'V'], ['ii6', 'V']],
          open: [['V7', 'vi'], ['V42', 'I6'], ['IV', 'I6'], ['V7_of_IV', 'IV'], ['vi', 'ii65']],
        },
        phrases: {
          // BWV 846 bars 1–4, 16–19, 32–35; Goldberg aria bars 5–8; chorale formulas; descending fifths.
          closed: [['I', 'ii42', 'V65', 'I'], ['IVmaj7', 'ii7', 'V7', 'I'], ['I6', 'IV', 'V', 'I'], ['ii6', 'I64', 'V7', 'I'], ['vi7', 'ii7', 'V7', 'I'], ['V7_of_IV', 'IV64', 'V7_over_I', 'I']],
          // Goldberg aria bars 1–4; chorale formula; BWV 846 bars 8–11 (cadence in V).
          half: [['I', 'V6', 'vi', 'V'], ['I', 'vi', 'ii65', 'V'], ['Imaj42', 'vi7', 'V7_of_V', 'V']],
          // BWV 846 bars 5–8 and 20–23; deceptive chorale formula; descending-fifths opening.
          open: [['vi6', 'V7_of_V', 'V6', 'Imaj42'], ['I6', 'ii65', 'V7', 'vi'], ['V7_of_IV', 'IVmaj7', 'vii_dim7_of_V', 'vii_dim7'], ['I', 'IVmaj7', 'vii_dim', 'iii7']],
        },
        loops: [['I', 'V6', 'vi', 'iii6', 'IV', 'I6', 'ii65', 'V7']],
        pedals: [['V7', 'I64', 'V7sus4', 'V7']], // BWV 846 bars 24–27
        codas: [['V7_of_IV', 'IV64', 'V7_over_I', 'I']], // BWV 846 bars 32–35
        finals: ['I'],
        splits: [['ii65', 'V7'], ['I64', 'V7'], ['IV', 'V7'], ['vi', 'V7'], ['ii6', 'V'], ['I64', 'V'], ['IV', 'V']], // chorale cadence in one bar: ii6/5–V7 | I, I6/4–V,
        surprises: ['V7_of_IV', 'vii_dim7_of_V', 'V7_of_vi', 'vii_dim7', 'bVI'],
        subs: { I: ['I6'], IV: ['ii6', 'IV6'], ii7: ['ii65', 'IV'], V7: ['V65', 'V43', 'vii_dim6'], vi: ['vi7', 'IV6'], V: ['V6', 'V7'], ii65: ['ii7', 'IV'] },
      },
      minor: {
        heads: [['i', 'iv64'], ['i', 'V65'], ['i', 'v6'], ['i', 'i42'], ['i', 'ii_half_dim65'], ['i', 'bVI'], ['i6', 'iv'], ['i', 'V6']],
        seqs: [['iv7', 'bVII7'], ['bIIImaj7', 'bVImaj7'], ['ii_half_dim7', 'V7'], ['bVI', 'ii_dim6'], ['v6', 'iv6'], ['bVII', 'bIII'], ['V7_of_IV', 'iv'], ['i42', 'bVImaj7'], ['bIII', 'bVI']],
        tails: {
          closed: [['V7', 'i'], ['V65', 'i'], ['vii_dim7', 'i'], ['V7', 'I']],
          half: [['iv6', 'V'], ['ii_half_dim65', 'V'], ['i64', 'V'], ['bVI', 'V'], ['vii_dim7_of_V', 'V'], ['iv', 'V']],
          open: [['V7', 'bVI'], ['V42', 'i6'], ['iv', 'i6'], ['V7_of_IV', 'iv'], ['bVII', 'bIII']],
        },
        phrases: {
          // BWV 847 bars 1–4 (over a tonic pedal); descending fifths; Picardy coda.
          closed: [['i', 'iv64', 'vii_dim7', 'i'], ['bVImaj7', 'ii_half_dim65', 'V7', 'i'], ['i6', 'ii_half_dim65', 'V7', 'i'], ['iv6', 'i64', 'V7', 'i'], ['V7_of_IV', 'iv64', 'vii_dim7', 'I']],
          // Diatonic and chromatic lament basses.
          half: [['i', 'v6', 'iv6', 'V'], ['V7_of_IV', 'IV6', 'iv6', 'V'], ['i', 'bVI', 'ii_half_dim65', 'V']],
          open: [['i', 'V6', 'V7_of_IV', 'IV6'], ['i', 'iv7', 'bVII7', 'bIIImaj7'], ['i6', 'iv6', 'V7', 'bVI']],
        },
        loops: [['i', 'v6', 'iv6', 'V'], ['i', 'V6', 'V7_of_IV', 'IV6', 'iv6', 'i64', 'V7', 'i']],
        pedals: [['i64', 'vii_dim7_of_V', 'V7sus4', 'V7']],
        codas: [['V7_of_IV', 'iv64', 'vii_dim7', 'I'], ['i', 'iv64', 'V7_over_I', 'i']],
        finals: ['i', 'I'], // "almost certainly a chorale in a minor key will end with a major chord"
        splits: [['ii_half_dim65', 'V7'], ['i64', 'V7'], ['iv6', 'V7'], ['iv', 'V7'], ['i64', 'V'], ['iv6', 'V'], ['ii_dim6', 'V']],
        surprises: ['V7_of_IV', 'vii_dim7_of_V', 'bII6', 'vii_dim7', 'I'],
        subs: { i: ['i6'], iv: ['iv6', 'ii_dim6'], V7: ['V65', 'vii_dim7'], V: ['V6', 'V7'], bVI: ['bVImaj7', 'iv6'], ii_half_dim7: ['ii_half_dim65'] },
      },
    },
  },

  // ────────────────────────────────────────────────────────────────────────────
  beethoven: {
    brief:
      'Viennese piano, c. 1800. A short motto becomes a sentence or period; one harmony often sits two to four bars, then the pace snaps into a cadential 6/4–V–I, a diminished-seventh jolt or a Neapolitan. Left hand is Alberti, repeated chords, octaves or storm tremolo — not a rolling wide-span nocturne, not a rotating cell — and dynamics skip the middle: pianissimo against fortissimo, crescendo cut by sudden piano, sforzando; stormy allegros, singing adagios, staccato scherzos, solemn marches.',
    priors: {
      form: { period: 45, sentence: 35, arch: 10, chain: 10 },
      key: { C_minor: 16, F_minor: 10, D_minor: 8, Cs_minor: 5, A_minor: 6, E_minor: 4, G_minor: 4, Eb_major: 12, C_major: 10, G_major: 7, Ab_major: 7, E_major: 5, F_major: 5, D_major: 4, A_major: 4, Db_major: 2 },
      meter: { four_four: 32, three_four: 26, two_four: 24, six_eight: 18 },
      register: { low: 34, mid: 46, high: 20 },
      motion: { sustained: 8, walking: 30, flowing: 46, florid: 16 },
      accompaniment: { sustained: 8, broken: 42, pulse: 34, stride: 12, counterline: 4 },
      palette: { diatonic: 50, chromatic_approach: 50 },
      tempo: { allegro: 30, presto: 12, adagio: 18, andante: 14, moderato: 10, largo: 4, vivace: 6, grave: 3, larghetto: 2, prestissimo: 1 },
      dynamics: { f: 30, ff: 15, p: 35, pp: 20 },
      dynamicShape: { sudden_contrast: 35, build_then_drop: 20, crescendo: 20, arch: 10, late_surge: 10, waves: 5 },
      contour: { rise: 24, fall: 16, arch: 14, dip: 12, wave: 20, leap_fall: 14 },
    },
    variants: [
      // Pathétique / Tempest / Appassionata allegros.
      {
        name: 'stormy',
        weight: 26,
        priors: {
          form: { period: 40, sentence: 45, chain: 15 },
          key: { C_minor: 30, F_minor: 18, D_minor: 16, Cs_minor: 8, G_minor: 8, A_minor: 8, E_minor: 6, Eb_major: 6 },
          register: { low: 20, mid: 52, high: 28 },
          motion: { walking: 25, flowing: 45, florid: 30 },
          accompaniment: { pulse: 78, broken: 12, counterline: 10 },
          meter: { four_four: 36, two_four: 32, three_four: 18, six_eight: 14 },
          tempo: { allegro: 48, presto: 28, vivace: 12, prestissimo: 6, moderato: 6 },
          dynamics: { f: 40, ff: 25, p: 25, pp: 10 },
          dynamicShape: { sudden_contrast: 45, build_then_drop: 25, crescendo: 20, late_surge: 10 },
          contour: { rise: 35, fall: 15, arch: 13, dip: 12, wave: 10, leap_fall: 15 },
        },
      },
      // Adagio cantabile: a hymn-like tune over a murmuring accompaniment.
      {
        name: 'singing',
        weight: 22,
        priors: {
          form: { period: 55, sentence: 20, arch: 25 },
          key: { Ab_major: 25, Eb_major: 20, Db_major: 10, E_major: 10, F_major: 10, C_major: 10, A_major: 8, G_major: 7 },
          // Op. 13 II: top voice at MIDI 66, ~3.2 attacks a 2/4 bar — sung, not run.
          register: { low: 80, mid: 20 },
          motion: { flowing: 60, walking: 30, florid: 10 },
          accompaniment: { broken: 80, sustained: 20 },
          tempo: { adagio: 48, andante: 30, largo: 10, larghetto: 12 },
          dynamics: { p: 50, pp: 25, f: 25 },
          dynamicShape: { arch: 35, waves: 25, build_then_drop: 25, crescendo: 15 },
          contour: { rise: 16, fall: 20, arch: 30, dip: 6, wave: 18, leap_fall: 10 },
        },
      },
      // Op. 27/2, first movement.
      {
        name: 'still',
        weight: 12,
        priors: {
          form: { period: 30, arch: 25, chain: 45 },
          key: { Cs_minor: 35, C_minor: 15, F_minor: 15, A_minor: 10, D_minor: 10, E_minor: 10, B_minor: 5 },
          meter: { four_four: 50, six_eight: 35, three_four: 15 },
          register: { mid: 45, high: 55 },
          motion: { sustained: 55, walking: 45 },
          accompaniment: { broken: 100 },
          tempo: { adagio: 50, largo: 24, andante: 8, grave: 10, larghissimo: 8 },
          dynamics: { pp: 55, p: 45 },
          dynamicShape: { steady: 40, arch: 30, waves: 30 },
          contour: { rise: 5, fall: 20, arch: 20, dip: 10, wave: 45 },
        },
      },
      // Waldstein, Eroica, Emperor.
      {
        name: 'heroic',
        weight: 16,
        priors: {
          form: { period: 55, sentence: 45 },
          key: { Eb_major: 30, C_major: 25, D_major: 15, G_major: 10, A_major: 10, F_major: 10 },
          register: { mid: 70, high: 30 },
          motion: { sustained: 25, walking: 50, flowing: 25 },
          accompaniment: { pulse: 60, broken: 20, stride: 20 },
          meter: { four_four: 40, two_four: 30, three_four: 16, six_eight: 14 },
          tempo: { allegro: 70, presto: 15, moderato: 15 },
          dynamics: { f: 45, ff: 20, p: 25, pp: 10 },
          dynamicShape: { crescendo: 30, sudden_contrast: 35, build_then_drop: 20, terraced: 15 },
          contour: { rise: 35, fall: 15, arch: 15, dip: 15, leap_fall: 20 },
        },
      },
      // Scherzos and bagatelles.
      {
        name: 'witty',
        weight: 14,
        priors: {
          form: { period: 70, sentence: 30 },
          meter: { three_four: 60, six_eight: 20, four_four: 20 },
          register: { mid: 55, high: 45 },
          motion: { walking: 45, flowing: 40, florid: 15 },
          accompaniment: { stride: 60, pulse: 25, broken: 15 },
          tempo: { presto: 40, allegro: 50, moderato: 10 },
          dynamics: { p: 50, f: 30, pp: 20 },
          dynamicShape: { sudden_contrast: 60, terraced: 20, build_then_drop: 20 },
        },
      },
      // Funeral marches; the Seventh Symphony's Allegretto ostinato.
      {
        name: 'hymn',
        weight: 10,
        priors: {
          form: { period: 45, arch: 25, chain: 30 },
          key: { A_minor: 25, C_minor: 25, D_minor: 20, F_minor: 15, Ab_major: 15 },
          register: { low: 45, mid: 55 },
          motion: { walking: 70, sustained: 30 },
          accompaniment: { sustained: 85, broken: 15 },
          tempo: { andante: 50, adagio: 35, moderato: 15 },
          dynamics: { p: 45, pp: 35, f: 20 },
          dynamicShape: { late_surge: 35, crescendo: 30, sudden_contrast: 20, steady: 15 },
          contour: { rise: 15, fall: 15, arch: 20, dip: 5, wave: 45 },
        },
      },
    ],
    holds: true,
    harmony: {
      major: {
        heads: [['I', 'I'], ['I', 'V65'], ['I', 'V6'], ['I', 'ii42'], ['I', 'IV64'], ['I', 'bVII'], ['I', 'vi'], ['V43', 'I']],
        seqs: [['V7_of_ii', 'ii'], ['V7_of_V', 'V7'], ['vi', 'V65_of_V'], ['IV', 'I6'], ['ii6', 'V7'], ['V7_of_IV', 'IV6'], ['vi', 'iii6'], ['bVI', 'V7'], ['V7_of_vi', 'vi']],
        tails: {
          closed: [['V7', 'I'], ['V65', 'I'], ['V43', 'I']],
          half: [['I64', 'V'], ['ii6', 'V'], ['V65_of_V', 'V'], ['IV', 'V'], ['iv6', 'V'], ['vii_dim7_of_V', 'V']],
          open: [['V42', 'I6'], ['IV6', 'iv6'], ['V7_of_ii', 'ii'], ['V7_of_IV', 'IV'], ['V7', 'vi']],
        },
        phrases: {
          // Op. 49/2 menuet; Op. 14/1; Op. 109 theme; Op. 110; Op. 109 first movement (second half).
          closed: [['V43', 'I', 'V7', 'I'], ['I', 'IV', 'vii_dim6', 'I'], ['ii6', 'I64', 'V7', 'I'], ['V7_of_IV', 'IV6', 'V7', 'I'], ['IV', 'I6', 'V7', 'I']],
          // Pathétique Adagio; Op. 109 theme; Op. 110 (fermata on V7).
          half: [['I', 'vi', 'V7_of_V', 'V'], ['I', 'V65', 'I', 'V'], ['I', 'V43', 'I6', 'V7'], ['I', 'V42', 'I6', 'V65']],
          // Waldstein bars 1–4 and 5–8; Op. 109 first movement (descending bass).
          open: [['I', 'V7_of_V', 'V6', 'V6'], ['bVII', 'V7_of_IV', 'IV6', 'iv6'], ['I', 'V6', 'vi', 'iii6']],
        },
        loops: [['I', 'I', 'V7', 'V7'], ['I', 'V43', 'I6', 'V7']],
        pedals: [['V7', 'I64', 'V7', 'V'], ['V', 'vii_dim7_of_V', 'V7', 'V']],
        codas: [['I', 'IV64', 'V7_over_I', 'I'], ['I', 'V7', 'I', 'I']],
        finals: ['I'],
        splits: [['I64', 'V7'], ['ii6', 'V7'], ['IV', 'V7'], ['I64', 'V'], ['ii6', 'V'], ['V65_of_V', 'V']], // the cadential 6/4 resolving within the bar,
        surprises: ['bVI', 'vii_dim7_of_V', 'iv6', 'bII6', 'V7_of_vi', 'vii_dim7'],
        subs: { I: ['I6'], V7: ['V65', 'V43'], IV: ['ii6', 'IV6'], ii: ['ii6'], V: ['V6', 'V7'], vi: ['IV6'] },
      },
      minor: {
        heads: [['i', 'i'], ['i', 'V65'], ['i', 'i42'], ['i', 'V6'], ['i', 'iv64'], ['i', 'vii_dim7'], ['i6', 'ii_dim6']],
        seqs: [['V7_of_IV', 'iv'], ['bVI', 'bII6'], ['iv', 'bII'], ['bIII', 'bVII'], ['vii_dim7', 'i6'], ['bVI', 'iv6'], ['ii_half_dim65', 'V7']],
        tails: {
          closed: [['V7', 'i'], ['V65', 'i'], ['vii_dim7', 'i'], ['V7b9', 'i']],
          half: [['i64', 'V'], ['ii_dim6', 'V'], ['iv6', 'V'], ['bVI7', 'V'], ['vii_dim7_of_V', 'V'], ['bII6', 'V7'], ['iv', 'V']],
          open: [['V7', 'bVI'], ['bVI', 'bII6'], ['V7_of_IV', 'iv'], ['bVII', 'bIII']],
        },
        phrases: {
          // Tempest finale; Op. 10/1 close; Allegretto of the Seventh; WoO 80 (second half).
          closed: [['i', 'i64', 'V7', 'i'], ['ii_dim6', 'i64', 'V7', 'i'], ['i', 'V6', 'V', 'i'], ['iv6', 'i64', 'V', 'i']],
          // Moonlight bars 1–4 (bII6, not ii°6); Op. 2/1 continuation; Für Elise, both strains.
          half: [['i', 'i42', 'bII6', 'V7'], ['i', 'vii_dim6', 'ii_dim6', 'V'], ['i', 'V', 'i', 'V'], ['bIII', 'bVII', 'i', 'V']],
          // Op. 2/1 presentation; Tempest finale; Allegretto (closes in III); WoO 80 (first half).
          open: [['i', 'i', 'V65', 'V65'], ['i', 'iv', 'bII', 'V6'], ['i', 'i', 'bVII', 'bIII'], ['i', 'V6', 'V7_of_IV', 'IV6']],
        },
        loops: [['i', 'i', 'V7', 'V7'], ['i', 'V', 'i', 'V']],
        pedals: [['i64', 'vii_dim7_of_V', 'V7', 'V'], ['V7', 'i64', 'V7', 'V']],
        codas: [['i', 'iv64', 'V7_over_I', 'i'], ['i', 'V7', 'i', 'i'], ['i', 'iv64', 'V7', 'I']],
        finals: ['i', 'i', 'I'],
        splits: [['i64', 'V7'], ['ii_dim6', 'V7'], ['iv6', 'V7'], ['i64', 'V'], ['iv6', 'V'], ['bVI7', 'V'], ['bII6', 'V7'], ['i64', 'V7b9']],
        surprises: ['bII6', 'vii_dim7_of_V', 'bVI7', 'bVI', 'vii_dim7', 'bII'],
        subs: { i: ['i6'], V7: ['V65', 'vii_dim7'], iv: ['iv6', 'ii_dim6'], V: ['V6', 'V7'], bVI: ['iv6'] },
      },
    },
  },

  // ────────────────────────────────────────────────────────────────────────────
  chopin: {
    brief:
      'Polish–French piano, c. 1840. An ornamented vocal right hand (fioritura, delayed resolutions) over a wide-span left-hand arpeggio, a waltz bass-chord-chord, or a mazurka that accents beat two or three — not Alberti, not jazz stride, not block-chord shocks. Nocturnes often sit in 12/8. Harmony stays tonal: chromatic inner voices, cadential 6/4 sharing the bar with V7, Neapolitan in minor, mazurka mixture; eight bars are a 4+4 period whose return is ornamented, often after a pickup. Pedalled grand piano, rubato-friendly; no parallel planing, no ii–V jazz turnaround.',
    priors: {
      form: { period: 30, sentence: 20, arch: 35, chain: 15 },
      key: { Db_major: 14, Ab_major: 12, Bb_major: 8, Eb_major: 8, Gb_major: 6, F_major: 5, C_major: 4, Cs_minor: 10, B_minor: 8, Fs_minor: 6, C_minor: 5, E_minor: 5, F_minor: 5, G_minor: 4 },
      meter: { three_four: 38, four_four: 26, twelve_eight: 20, six_eight: 16 },
      register: { mid: 30, high: 70 },
      motion: { walking: 18, flowing: 50, florid: 32 },
      accompaniment: { broken: 62, stride: 18, sustained: 12, pulse: 8 },
      palette: { chromatic_approach: 55, diatonic: 45 },
      tempo: { adagio: 24, andante: 22, moderato: 16, allegro: 14, largo: 6, larghetto: 8, presto: 5, vivace: 3, grave: 2 },
      dynamics: { p: 35, mp: 20, pp: 15, f: 15, mf: 10, ff: 5 },
      dynamicShape: { arch: 30, waves: 20, sudden_contrast: 15, crescendo: 15, late_surge: 10, terraced: 10 },
      contour: { rise: 12, fall: 18, arch: 24, dip: 14, wave: 20, leap_fall: 12 },
    },
    variants: [
      // Nocturnes: singing cantabile over rolling left-hand figuration.
      {
        name: 'singing',
        weight: 28,
        priors: {
          form: { period: 45, sentence: 25, arch: 30 },
          key: { Db_major: 22, Ab_major: 18, Eb_major: 12, Gb_major: 10, F_major: 8, C_major: 6, Cs_minor: 12, B_minor: 6, E_minor: 6 },
          meter: { twelve_eight: 48, six_eight: 22, four_four: 18, three_four: 12 },
          register: { high: 85, mid: 15 },
          motion: { flowing: 55, florid: 40, walking: 5 },
          accompaniment: { broken: 90, sustained: 10 },
          tempo: { adagio: 50, andante: 30, largo: 15, moderato: 5 },
          dynamics: { p: 45, pp: 25, mp: 20, f: 10 },
          dynamicShape: { arch: 40, waves: 30, crescendo: 15, late_surge: 15 },
          contour: { rise: 10, fall: 20, arch: 32, dip: 6, wave: 20, leap_fall: 12 },
        },
      },
      // Mazurkas and waltzes.
      {
        name: 'dance',
        weight: 26,
        priors: {
          form: { period: 35, arch: 65 },
          key: { Bb_major: 18, Ab_major: 14, Db_major: 12, Eb_major: 10, F_major: 8, C_major: 6, Cs_minor: 10, B_minor: 8, Fs_minor: 8, G_minor: 6 },
          meter: { three_four: 85, six_eight: 10, four_four: 5 },
          register: { mid: 35, high: 65 },
          motion: { walking: 40, flowing: 45, florid: 15 },
          accompaniment: { stride: 75, broken: 25 },
          tempo: { moderato: 40, andante: 30, allegro: 25, adagio: 5 },
          dynamics: { p: 35, mp: 30, mf: 20, f: 15 },
          dynamicShape: { waves: 35, arch: 25, sudden_contrast: 20, terraced: 20 },
          contour: { rise: 16, fall: 14, arch: 18, dip: 10, wave: 20, leap_fall: 22 },
        },
      },
      // Ballades and scherzos.
      {
        name: 'stormy',
        weight: 16,
        priors: {
          form: { sentence: 35, arch: 15, chain: 50 },
          key: { G_minor: 18, C_minor: 16, F_minor: 14, B_minor: 12, Cs_minor: 12, Fs_minor: 10, E_minor: 8, Ab_major: 10 },
          meter: { four_four: 45, six_eight: 30, three_four: 25 },
          register: { mid: 45, high: 55 },
          motion: { flowing: 45, florid: 45, walking: 10 },
          accompaniment: { broken: 45, pulse: 45, stride: 10 },
          tempo: { allegro: 50, presto: 25, moderato: 15, andante: 10 },
          dynamics: { f: 35, ff: 20, p: 25, pp: 10, mf: 10 },
          dynamicShape: { sudden_contrast: 40, crescendo: 25, late_surge: 20, arch: 15 },
          contour: { rise: 28, fall: 14, arch: 12, dip: 16, wave: 10, leap_fall: 20 },
        },
      },
      // Études: unbroken figuration.
      {
        name: 'perpetual',
        weight: 14,
        priors: {
          form: { period: 10, sentence: 25, arch: 20, chain: 45 },
          register: { mid: 40, high: 60 },
          motion: { florid: 90, flowing: 10 },
          accompaniment: { broken: 85, counterline: 15 },
          meter: { four_four: 55, six_eight: 25, three_four: 20 },
          tempo: { allegro: 45, moderato: 30, andante: 15, presto: 10 },
          dynamics: { mf: 35, mp: 25, f: 20, p: 20 },
          dynamicShape: { crescendo: 30, arch: 30, waves: 20, late_surge: 20 },
          contour: { rise: 22, fall: 18, arch: 16, wave: 44 },
        },
      },
      // Slow preludes and spare late nocturnes.
      {
        name: 'still',
        weight: 10,
        priors: {
          form: { period: 35, arch: 35, chain: 30 },
          key: { E_minor: 22, Cs_minor: 18, B_minor: 14, F_minor: 12, C_minor: 10, Db_major: 12, Ab_major: 12 },
          meter: { four_four: 50, six_eight: 30, three_four: 20 },
          register: { high: 75, mid: 25 },
          motion: { sustained: 45, walking: 40, flowing: 15 },
          accompaniment: { pulse: 60, sustained: 25, broken: 15 },
          tempo: { largo: 40, adagio: 45, andante: 15 },
          dynamics: { pp: 50, p: 40, mp: 10 },
          dynamicShape: { steady: 35, arch: 30, waves: 20, decrescendo: 15 },
          contour: { rise: 10, fall: 25, arch: 20, dip: 15, wave: 30 },
        },
      },
      // Light waltzes and mazurka jokes.
      {
        name: 'witty',
        weight: 6,
        priors: {
          form: { period: 60, arch: 40 },
          meter: { three_four: 70, six_eight: 15, four_four: 15 },
          register: { high: 70, mid: 30 },
          motion: { florid: 55, flowing: 35, walking: 10 },
          accompaniment: { stride: 55, broken: 45 },
          tempo: { allegro: 50, moderato: 35, presto: 15 },
          dynamics: { p: 40, mf: 25, f: 20, mp: 15 },
          dynamicShape: { sudden_contrast: 45, terraced: 30, waves: 25 },
          contour: { rise: 18, fall: 17, arch: 8, wave: 20, leap_fall: 37 },
        },
      },
    ],
    holds: true,
    harmony: {
      major: {
        heads: [['I', 'V65'], ['I', 'I6'], ['I', 'vi'], ['I6', 'IV'], ['I', 'V7_of_IV'], ['I', 'ii42'], ['V43', 'I6'], ['I', 'IV64']],
        seqs: [['V7_of_ii', 'ii'], ['V7_of_V', 'V7'], ['V7_of_vi', 'vi'], ['ii6', 'V7'], ['IV', 'I6'], ['vi', 'iii6'], ['V7_of_IV', 'IV6'], ['ii65', 'V65'], ['V65_of_V', 'V']],
        tails: {
          closed: [['V7', 'I'], ['V65', 'I'], ['V43', 'I'], ['vii_dim6', 'I']],
          half: [['I64', 'V'], ['ii65', 'V'], ['V7_of_V', 'V'], ['IV', 'V'], ['V65_of_V', 'V'], ['ii6', 'V']],
          open: [['V42', 'I6'], ['V7', 'vi'], ['V7_of_IV', 'IV'], ['IV', 'I6'], ['vi', 'ii65']],
        },
        phrases: {
          // Nocturne cadence (ii6–I64–V7–I); waltz close; tonic-turned-dominant into IV; inverted-dominant close.
          closed: [['ii6', 'I64', 'V7', 'I'], ['V43', 'I6', 'V7', 'I'], ['V7_of_IV', 'IV', 'V7', 'I'], ['ii65', 'I64', 'V65', 'I']],
          // Nocturne and mazurka pauses on V; secondary dominant into a half cadence.
          half: [['I', 'V65', 'I6', 'V'], ['I', 'vi', 'V7_of_V', 'V'], ['I6', 'IV', 'ii65', 'V'], ['I', 'V43', 'I6', 'V7']],
          // Waltz first strain; nocturne opening that leans to IV; deceptive turn through vi.
          open: [['I', 'V65', 'I', 'IV'], ['I', 'V7_of_vi', 'vi', 'IV6'], ['I6', 'ii65', 'V7', 'vi'], ['I', 'V6', 'vi', 'iii6']],
        },
        loops: [['I', 'V65', 'I', 'V7'], ['I', 'I6', 'IV', 'V7'], ['I', 'vi', 'ii65', 'V']],
        pedals: [['I', 'IV64', 'I', 'IV64'], ['V7', 'I64', 'V7', 'V']],
        codas: [['I', 'IV64', 'V7_over_I', 'I'], ['V7_of_IV', 'IV6', 'V7', 'I']],
        finals: ['I'],
        splits: [['I64', 'V7'], ['ii65', 'V7'], ['vi', 'V7'], ['ii6', 'V7'], ['I64', 'V'], ['V7_of_V', 'V']], // nocturne cadence: ii6–I6/4–V7 | I, the 6/4 and V7 sharing a bar,
        surprises: ['bII6', 'vii_dim7_of_V', 'V7_of_vi', 'iv6', 'bVI', 'vii_dim7'],
        subs: { I: ['I6'], V7: ['V65', 'V43'], IV: ['ii6', 'IV6'], ii: ['ii6', 'ii65'], V: ['V6', 'V7'], vi: ['vi6', 'IV6'] },
      },
      minor: {
        heads: [['i', 'V65'], ['i', 'i42'], ['i', 'iv64'], ['i', 'vii_dim7'], ['i6', 'iv'], ['i', 'bVI'], ['i', 'V6'], ['i', 'ii_half_dim65']],
        seqs: [['V7_of_IV', 'iv'], ['bVI', 'bII6'], ['iv', 'bII'], ['vii_dim7', 'i6'], ['bVI', 'iv6'], ['ii_half_dim65', 'V7'], ['iv6', 'V'], ['V7_of_vi', 'vi']],
        tails: {
          closed: [['V7', 'i'], ['V65', 'i'], ['vii_dim7', 'i'], ['V7b9', 'i']],
          half: [['i64', 'V'], ['ii_dim6', 'V'], ['iv6', 'V'], ['bII6', 'V7'], ['vii_dim7_of_V', 'V'], ['bVI7', 'V']],
          open: [['V7', 'bVI'], ['V42', 'i6'], ['V7_of_IV', 'iv'], ['bVI', 'bII6']],
        },
        phrases: {
          // Prelude-like authentic close; Phrygian iv6 into a cadence; darkened V7b9.
          closed: [['ii_dim6', 'i64', 'V7', 'i'], ['iv6', 'i64', 'V7', 'i'], ['ii_half_dim65', 'i64', 'V7b9', 'i'], ['i', 'V6', 'V7', 'i']],
          // Neapolitan sixth before V (nocturne and prelude idiom); i–V rocking; iv6 approach.
          half: [['i', 'i42', 'bII6', 'V7'], ['i', 'V65', 'i', 'V'], ['iv6', 'ii_half_dim65', 'bVI7', 'V'], ['i', 'vii_dim6', 'ii_dim6', 'V']],
          // Ballade colour: iv and Neapolitan without closing; deceptive V7–bVI.
          open: [['i', 'V65', 'iv', 'bII6'], ['i', 'bVI', 'iv6', 'V'], ['i6', 'iv', 'V7', 'bVI'], ['i', 'V6', 'V7_of_IV', 'IV6']],
        },
        loops: [['i', 'V65', 'i', 'V7'], ['i', 'i', 'V7', 'V7'], ['i', 'iv64', 'V7', 'i']],
        pedals: [['i64', 'vii_dim7_of_V', 'V7', 'V'], ['i', 'iv64', 'i', 'iv64']],
        codas: [['i', 'iv64', 'V7_over_I', 'i'], ['i', 'V7', 'i', 'i'], ['iv6', 'i64', 'V7', 'I']],
        finals: ['i', 'i', 'I'],
        splits: [['i64', 'V7'], ['bII6', 'V7'], ['iv6', 'V7'], ['ii_dim6', 'V7'], ['i64', 'V'], ['i64', 'V7b9']],
        surprises: ['bII6', 'vii_dim7_of_V', 'bVI7', 'vii_dim7', 'bVI', 'I'],
        subs: { i: ['i6'], V7: ['V65', 'vii_dim7'], iv: ['iv6', 'ii_dim6'], V: ['V6', 'V7'], bVI: ['iv6', 'bVImaj7'], ii_half_dim7: ['ii_half_dim65'] },
      },
    },
  },

  // ────────────────────────────────────────────────────────────────────────────
  debussy: {
    brief:
      'French piano, c. 1905. Harmony is colour: parallel triads, ninths and hollow fifths; pentatonic, whole-tone and church modes; added sixths and ninths left hanging over a pedal — closes are plagal, modal or a fade, never V7–I. Phrases are two-bar tiles said twice and set beside the next (mosaic), or an arch whose return is an echo. Very soft, fully pedalled; not a singing 4+4 tonal period, not stacked jazz ninths, not an additive cell process.',
    priors: {
      form: { period: 5, sentence: 40, arch: 40, chain: 15 },
      key: { Db_major: 14, Gb_major: 8, E_major: 10, B_major: 6, F_major: 8, Bb_major: 5, A_major: 5, G_major: 5, C_major: 6, D_minor: 8, Fs_minor: 8, E_minor: 6, A_minor: 5, Cs_minor: 6 },
      meter: { six_eight: 28, four_four: 28, three_four: 22, nine_eight: 22 },
      register: { mid: 40, high: 60 },
      motion: { sustained: 18, walking: 30, flowing: 36, florid: 16 },
      accompaniment: { sustained: 38, broken: 42, pulse: 12, stride: 8 },
      palette: { pentatonic: 35, whole_tone: 15, modal: 20, modal_dark: 15, diatonic: 15 },
      tempo: { adagio: 30, andante: 34, largo: 12, larghetto: 10, moderato: 8, larghissimo: 4, grave: 2 },
      dynamics: { pp: 50, p: 40, mp: 10 },
      dynamicShape: { arch: 40, waves: 20, steady: 15, decrescendo: 15, late_surge: 10 },
      contour: { rise: 8, fall: 22, arch: 22, dip: 15, wave: 30, leap_fall: 3 },
    },
    variants: [
      {
        name: 'hazy',
        weight: 30,
        priors: {
          form: { sentence: 50, arch: 35, chain: 15 },
          meter: { nine_eight: 32, six_eight: 28, four_four: 22, three_four: 18 },
          register: { mid: 35, high: 65 },
          motion: { sustained: 30, walking: 45, flowing: 25 },
          accompaniment: { sustained: 60, broken: 40 },
          palette: { pentatonic: 35, whole_tone: 25, modal: 20, modal_dark: 10, diatonic: 10 },
          tempo: { adagio: 40, andante: 45, largo: 15 },
          dynamics: { pp: 50, p: 45, mp: 5 },
          dynamicShape: { arch: 45, waves: 25, steady: 15, decrescendo: 15 },
        },
      },
      // Arabesque, Jardins sous la pluie, Doctor Gradus.
      {
        name: 'perpetual',
        weight: 20,
        priors: {
          form: { sentence: 35, arch: 45, chain: 20 },
          meter: { nine_eight: 30, six_eight: 28, four_four: 24, three_four: 18 },
          register: { mid: 45, high: 55 },
          motion: { florid: 70, flowing: 30 },
          accompaniment: { broken: 90, pulse: 10 },
          palette: { pentatonic: 45, modal: 30, diatonic: 25 },
          tempo: { andante: 35, moderato: 45, allegro: 20 },
          dynamics: { p: 55, pp: 25, mp: 20 },
          contour: { rise: 12, fall: 30, arch: 25, dip: 8, wave: 25 },
        },
      },
      // Des pas sur la neige, La cathédrale engloutie.
      {
        name: 'still',
        weight: 20,
        priors: {
          form: { sentence: 30, arch: 45, chain: 25 },
          register: { low: 20, mid: 35, high: 45 },
          motion: { sustained: 55, walking: 45 },
          accompaniment: { sustained: 75, broken: 25 },
          palette: { modal_dark: 30, modal: 25, pentatonic: 25, diatonic: 20 },
          tempo: { largo: 50, adagio: 45, andante: 5 },
          dynamics: { pp: 65, p: 35 },
          dynamicShape: { arch: 35, steady: 30, late_surge: 20, decrescendo: 15 },
          contour: { rise: 15, fall: 20, arch: 25, dip: 10, wave: 30 },
        },
      },
      // La fille aux cheveux de lin, Rêverie.
      {
        name: 'singing',
        weight: 16,
        priors: {
          form: { period: 25, sentence: 35, arch: 40 },
          register: { high: 70, mid: 30 },
          motion: { walking: 35, flowing: 45, sustained: 20 },
          accompaniment: { broken: 70, sustained: 30 },
          palette: { pentatonic: 60, diatonic: 20, modal: 20 },
          tempo: { adagio: 50, andante: 50 },
          contour: { rise: 12, fall: 25, arch: 35, dip: 8, wave: 20 },
        },
      },
      // Golliwogg's Cakewalk, Minstrels.
      {
        name: 'witty',
        weight: 8,
        priors: {
          form: { period: 60, arch: 40 },
          key: { Eb_major: 30, Gb_major: 20, G_major: 20, F_major: 15, C_major: 15 },
          meter: { four_four: 80, three_four: 10, six_eight: 10 },
          register: { mid: 40, high: 60 },
          motion: { florid: 60, flowing: 40 },
          accompaniment: { stride: 45, broken: 40, pulse: 15 },
          palette: { pentatonic: 40, chromatic_approach: 40, blues: 20 },
          tempo: { moderato: 50, allegro: 50 },
          dynamics: { p: 40, mf: 30, f: 30 },
          dynamicShape: { sudden_contrast: 60, terraced: 40 },
          contour: { rise: 20, fall: 20, arch: 15, wave: 20, leap_fall: 25 },
        },
      },
      // Voiles: whole-tone veils over a pedal.
      {
        name: 'restless',
        weight: 6,
        priors: {
          form: { sentence: 40, arch: 60 },
          register: { mid: 55, high: 45 },
          motion: { flowing: 50, florid: 30, walking: 20 },
          accompaniment: { broken: 50, pulse: 30, sustained: 20 },
          palette: { whole_tone: 80, pentatonic: 20 },
          tempo: { andante: 60, adagio: 40 },
          dynamics: { pp: 55, p: 45 },
        },
      },
    ],
    holds: true,
    harmony: {
      major: {
        heads: [['I', 'Iadd6'], ['Imaj9', 'bVII'], ['I6', 'vi'], ['Iadd9', 'I_aug'], ['Imaj7', 'IVmaj7s11'], ['I', 'iii'], ['Isus2', 'bVII_over_I'], ['I', 'ii42'], ['IV6', 'iii6'], ['Iadd6', 'Iadd6']],
        seqs: [['IV6', 'iii6'], ['ii6', 'I6'], ['ii', 'iii'], ['IV', 'V'], ['bVII', 'vi'], ['V9', 'IV'], ['iii', 'bIII6'], ['I_aug', 'V_aug'], ['bVImaj7', 'bVII'], ['IVmaj9', 'bIIImaj7'], ['II', 'Imaj7s11']],
        tails: {
          // Closes without a leading tone: plagal, chromatic-mediant, subtonic, minor-dominant, sus-dominant.
          closed: [['IV', 'I'], ['bIII6', 'I'], ['bVII', 'I'], ['v', 'I'], ['ii7', 'Iadd6'], ['V9sus4', 'Iadd6'], ['bVImaj7', 'Iadd9'], ['bIImaj7', 'Imaj9']],
          half: [['ii7', 'V9'], ['IV6', 'V9'], ['vi', 'V9sus4'], ['iii', 'V9'], ['II', 'V9']],
          open: [['ii6', 'I6'], ['IVadd6', 'II'], ['V9', 'IV'], ['vi', 'V43'], ['I_aug', 'IVmaj7s11'], ['bVII', 'vi']],
        },
        phrases: {
          // La fille aux cheveux de lin bars 1–3 and 28–36; Clair de lune bars 66–72; La cathédrale engloutie.
          closed: [['Iadd6', 'Iadd6', 'IV', 'I'], ['I', 'iii', 'bIII6', 'I'], ['IV', 'vi', 'ii7', 'I'], ['I', 'v', 'bVII', 'I']],
          // La fille bars 17–18; Clair de lune bars 31–32 (the ninth never resolves).
          half: [['ii7', 'V9', 'ii7', 'V9sus4'], ['V9', 'IV', 'iii', 'V9']],
          // Arabesque No. 1 bars 1–2 and 3–5; Clair de lune bars 1–4; Cathédrale planing over a tonic pedal.
          open: [['IV6', 'iii6', 'ii6', 'I6'], ['ii7', 'vii_dim', 'IV6', 'V9'], ['I6', 'V7_of_vi', 'vi', 'V43'], ['I', 'ii42', 'IV64', 'I']],
        },
        loops: [['I', 'Iadd6'], ['Imaj9', 'bVII'], ['Isus2', 'bVII_over_I'], ['IVmaj7s11', 'Iadd9'], ['I', 'ii42', 'IV64', 'ii42']],
        // Clair de lune bars 15–18: four bars of ii9 over its own pedal.
        pedals: [['ii9', 'ii9', 'ii9', 'ii9'], ['Isus2', 'bVII_over_I', 'Isus2', 'bVII_over_I'], ['V9sus4', 'V9', 'V9sus4', 'V9']],
        codas: [['I', 'iii', 'bIII6', 'I'], ['Iadd6', 'IV64', 'Iadd6', 'Iadd6'], ['bVII_over_I', 'IV64', 'Iadd9', 'Iadd6']],
        finals: ['Iadd6', 'I', 'Iadd9', 'Imaj9', 'I6_9'],
        splits: [['ii7', 'V9sus4'], ['ii7', 'V9'], ['IV6', 'V9']], // rare: the pace is one colour a bar or slower,
        surprises: ['bIII6', 'II', 'I_aug', 'bVImaj7', 'III', 'bIImaj7', 'V_aug'],
        subs: { I: ['Iadd6', 'Iadd9', 'Imaj7'], IV: ['IVadd6', 'IVmaj7s11', 'IVmaj9'], V9: ['V9sus4'], ii7: ['ii9'], vi: ['vi9'], bVII: ['bVII_over_I'] },
      },
      minor: {
        heads: [['i', 'i'], ['i_add9', 'bVII'], ['i', 'IV'], ['i', 'iv'], ['i9', 'bVImaj7'], ['i', 'bIII'], ['i_add6', 'bVII'], ['i11', 'bVII_over_I']],
        seqs: [['bIII', 'bII'], ['bVI', 'bVII'], ['iv7', 'bIIImaj7'], ['bVII', 'bVImaj7'], ['IV', 'i'], ['bIImaj7', 'i9'], ['V_aug', 'I_aug']],
        tails: {
          closed: [['iv', 'i'], ['bII', 'i'], ['bVII', 'i'], ['bVII', 'I'], ['bVImaj7', 'i_add9'], ['v', 'i']],
          half: [['bVImaj7', 'bVII'], ['iv', 'v'], ['IV', 'V_aug'], ['iv7', 'V7sus4']],
          open: [['bIII', 'bII'], ['bVI', 'bVII'], ['IV', 'bVII'], ['bIIImaj7', 'bVImaj9']],
        },
        phrases: {
          // Parallel triads into a Phrygian cadence; Des pas sur la neige; minor pieces that end in the major.
          closed: [['i', 'bIII', 'bII', 'i'], ['i', 'iv', 'iv', 'i'], ['i', 'bVI', 'bVII', 'I']],
          half: [['i', 'IV', 'bVImaj7', 'bVII']],
          // Des pas sur la neige (Aeolian, then the Dorian sixth, over a tonic pedal); a Dorian vamp.
          open: [['i', 'i', 'IV64', 'i'], ['i', 'IV', 'i', 'IV']],
        },
        loops: [['i', 'IV'], ['i_add9', 'bVII'], ['i', 'IV64'], ['i', 'bVII_over_I']],
        pedals: [['i', 'IV64', 'i', 'IV64'], ['V', 'V7sus4', 'V', 'V7sus4']],
        codas: [['i', 'iv64', 'i_add9', 'i'], ['bVI', 'bVII', 'I', 'Iadd6']],
        finals: ['i', 'i_add9', 'I', 'i_add6'],
        splits: [['iv7', 'V7sus4'], ['bVImaj7', 'bVII']],
        surprises: ['bII', 'I', 'IV', 'bIImaj7', 'V_aug', 'III'],
        subs: { i: ['i_add9', 'i_add6', 'i9'], iv: ['iv7', 'iv64'], bVI: ['bVImaj7', 'bVImaj9'], bVII: ['bVII_over_I'], IV: ['IV64'] },
      },
    },
  },

  // ────────────────────────────────────────────────────────────────────────────
  glass: {
    brief:
      'American minimalism, c. 1980. A small cell changes a little each pass — a note added, the figure rotated to start one note later — over a two-to-eight-chord cycle related by thirds and common tones; the next pass takes a new inversion (new bass), and about every eight bars a different cycle takes over. Rocking thirds and two-against-three over a slow bass; pieces stop on a low tonic or tonic 6/4 rather than cadence. Terraced blocks, mostly minor: a process of rotation and addition, not the same ostinato getting louder, not colour-planing haze.',
    priors: {
      form: { period: 25, sentence: 45, arch: 20, chain: 10 },
      key: { F_minor: 16, A_minor: 14, D_minor: 12, G_minor: 12, C_minor: 10, E_minor: 10, C_major: 8, F_major: 8, A_major: 4, Eb_major: 3, Ab_major: 3 },
      meter: { four_four: 45, six_eight: 30, three_four: 25 },
      register: { low: 40, mid: 50, high: 10 },
      motion: { sustained: 30, flowing: 60, florid: 10 },
      accompaniment: { broken: 50, pulse: 45, counterline: 5 },
      palette: { diatonic: 70, modal: 20, modal_dark: 10 },
      tempo: { moderato: 36, allegro: 22, andante: 24, adagio: 10, vivace: 6, larghetto: 2 },
      dynamics: { mp: 40, mf: 30, p: 25, f: 5 },
      dynamicShape: { terraced: 35, steady: 30, waves: 15, build_then_drop: 20 },
      contour: { rise: 22, fall: 16, arch: 16, wave: 46 },
    },
    variants: [
      {
        name: 'hypnotic',
        weight: 34,
        priors: {
          form: { sentence: 60, period: 30, chain: 10 },
          register: { low: 45, mid: 45, high: 10 },
          motion: { sustained: 18, flowing: 70, florid: 12 },
          accompaniment: { broken: 55, pulse: 45 },
          tempo: { moderato: 45, allegro: 40, andante: 15 },
          dynamicShape: { terraced: 35, steady: 35, waves: 15, build_then_drop: 15 },
        },
      },
      // Metamorphosis: a rocking accompaniment under a slow bare melody.
      {
        name: 'still',
        weight: 26,
        priors: {
          form: { arch: 50, sentence: 30, chain: 20 },
          register: { low: 55, mid: 45 },
          motion: { sustained: 75, flowing: 25 },
          accompaniment: { pulse: 100 },
          tempo: { andante: 50, adagio: 35, largo: 15 },
          dynamics: { p: 50, mp: 35, pp: 15 },
          contour: { rise: 20, fall: 30, arch: 15, wave: 35 },
        },
      },
      // Mad Rush's fast sections.
      {
        name: 'perpetual',
        weight: 16,
        priors: {
          form: { sentence: 50, period: 30, chain: 20 },
          register: { low: 30, mid: 55, high: 15 },
          motion: { flowing: 75, florid: 25 },
          accompaniment: { broken: 45, pulse: 30, counterline: 25 },
          tempo: { allegro: 55, presto: 25, moderato: 20 },
          dynamics: { mf: 45, f: 35, mp: 20 },
        },
      },
      {
        name: 'hymn',
        weight: 14,
        priors: {
          form: { period: 50, arch: 30, sentence: 20 },
          register: { low: 20, mid: 80 },
          motion: { sustained: 45, walking: 25, flowing: 30 },
          accompaniment: { sustained: 45, pulse: 55 },
          tempo: { adagio: 50, largo: 30, andante: 20 },
        },
      },
      {
        name: 'restless',
        weight: 10,
        priors: {
          form: { sentence: 60, chain: 40 },
          register: { low: 30, mid: 70 },
          motion: { sustained: 45, flowing: 55 },
          accompaniment: { pulse: 100 },
          tempo: { allegro: 60, presto: 40 },
          dynamics: { f: 50, mf: 50 },
        },
      },
    ],
    holds: true,
    harmony: {
      minor: {
        heads: [['i', 'bVI'], ['i', 'i'], ['i', 'bIII'], ['i64', 'IV7'], ['bVI', 'i64']],
        seqs: [['bVI', 'bIII'], ['bVII', 'bIII'], ['bVI', 'bVII'], ['v6', 'bVI'], ['bIII', 'V']],
        tails: {
          // "Lands on tonic six-four chords"; the tonic left to resonate.
          closed: [['V', 'i'], ['bVII', 'i'], ['bVI', 'i64'], ['V7', 'i64']],
          half: [['bIII', 'V'], ['bVII', 'V7'], ['bVI', 'V']],
          open: [['bVI', 'bVII'], ['bIII', 'v6'], ['IV7', 'bVII']],
        },
        phrases: {
          closed: [],
          // Étude No. 17 and the Tirol Concerto chaconne: every phrase runs from i to V.
          half: [['i', 'bVI', 'bIII', 'V'], ['i', 'bVI', 'bVII', 'V7'], ['i', 'bIII', 'V', 'V7']],
          // "Opening", first loop.
          open: [['i', 'i', 'bVII', 'bVImaj7']],
        },
        loops: [
          ['i', 'bVI', 'bIII', 'V'],
          ['bVI', 'i64', 'i64', 'bVI', 'bVII', 'bVI', 'i64', 'i64'], // Mad Rush, the bass chant
          ['bVI', 'i64'], // Mad Rush: the bass rocks a semitone while two notes hold
          ['i', 'bVI', 'bVII', 'V7'],
          ['i', 'bIII', 'V', 'V7'],
          ['i', 'i', 'bVII', 'bVImaj7'],
          ['i64', 'IV7', 'bVII', 'v6', 'i64', 'IV7', 'bVII', 'bVII'], // "Opening", second loop (Dorian IV)
          ['IV64', 'IV64', 'bIII', 'bIII6'], // "Opening", third loop
          ['i', 'bVII', 'bIII'], // Einstein on the Beach: three chords
          ['Imaj7', 'i7'], // The Hours: the third flips, two notes hold
        ],
        pedals: [['i', 'bVII_over_I', 'i', 'bVII_over_I']],
        codas: [['i', 'bVI', 'i64', 'i'], ['bVI', 'i64', 'bVI', 'i']],
        finals: ['i', 'i', 'i64', 'IV64'],
        splits: [], // one chord a bar (or two bars) — no pre-dominants, no intra-bar cadence,
        surprises: ['v6', 'I', 'III', 'IV7', 'bVII'], // the "loop breaker" bar
        subs: { i: ['i64', 'i6'], bVI: ['bVImaj7'], bIII: ['bIII6'], V: ['V6', 'V7'], bVII: ['bVII_over_I'], IV7: ['IV64'] },
      },
      major: {
        heads: [['I', 'iii64'], ['I', 'vi'], ['I', 'I'], ['Imaj7', 'i7']],
        seqs: [['vi', 'V'], ['iii64', 'vi'], ['bIII', 'IV'], ['vi', 'iii']],
        tails: {
          closed: [['V', 'I'], ['IV64', 'I'], ['vi', 'I6']],
          half: [['vi', 'V'], ['IV', 'V']],
          open: [['iii', 'vi'], ['bVII', 'IV']],
        },
        phrases: { closed: [], half: [], open: [] },
        loops: [
          ['I', 'iii64'], // Mad Rush in F: F major against A minor over E
          ['vi', 'V', 'I'],
          ['ii', 'V7', 'I64', 'vi', 'ii', 'V7', 'I64', 'I6'], // "Opening" read in the major: deceptive first ending
          ['V7_of_IV', 'bII7'], // Modern Love Waltz: two sevenths a semitone apart
          ['Imaj7', 'i7'],
          ['bIII', 'IV', 'V'], // Étude No. 16: rising parallel majors
          ['I', 'IV64', 'I', 'V7_over_I'],
        ],
        pedals: [['I', 'IV64', 'I', 'bVII_over_I']],
        codas: [['I', 'iii64', 'I', 'I'], ['vi', 'V', 'I64', 'I']],
        finals: ['I', 'I', 'I64', 'I6'],
        splits: [],
        surprises: ['i', 'bVI', 'bVII', 'III', 'iii64'],
        subs: { I: ['I64', 'I6'], vi: ['vi6'], V: ['V6'], IV: ['IV64'], iii: ['iii64'] },
      },
    },
  },

  // ────────────────────────────────────────────────────────────────────────────
  hans_zimmer: {
    brief:
      'Film-score piano and hybrid, 2000s–2020s. A slow long-note chant rides a left-hand ostinato that keeps the same figure while layers thicken and the dynamic climbs — loops of i–bVI–bVII–V or i–iv–bVI–V, or a tonic drone held across the barline; harmony never moves faster than the bar. Eight to sixteen bars vamp, add weight, surge late, then often drop to bare. Four-four pulse, piano and strings: a layered build, not cell rotation, not a 4+4 song period.',
    priors: {
      form: { period: 15, sentence: 35, arch: 30, chain: 20 },
      key: { D_minor: 14, A_minor: 12, C_minor: 12, G_minor: 10, F_minor: 8, E_minor: 6, C_major: 8, Eb_major: 8, F_major: 6, G_major: 6, D_major: 5, Ab_major: 5 },
      meter: { four_four: 70, three_four: 18, six_eight: 12 },
      register: { low: 30, mid: 48, high: 22 },
      motion: { sustained: 44, walking: 34, flowing: 22 },
      accompaniment: { pulse: 52, sustained: 24, broken: 20, stride: 4 },
      palette: { diatonic: 55, modal: 20, modal_dark: 15, chromatic_approach: 10 },
      tempo: { andante: 26, adagio: 18, moderato: 20, largo: 10, grave: 6, larghissimo: 4, allegro: 8, presto: 3, vivace: 3, larghetto: 2 },
      dynamics: { p: 30, mp: 25, mf: 20, pp: 15, f: 8, ff: 2 },
      dynamicShape: { crescendo: 30, late_surge: 25, build_then_drop: 15, arch: 15, waves: 10, steady: 5 },
      contour: { rise: 22, fall: 14, arch: 16, dip: 6, wave: 36, leap_fall: 6 },
    },
    variants: [
      // Layered ostinato that thickens without becoming a cell-process étude.
      {
        name: 'hypnotic',
        weight: 24,
        priors: {
          form: { sentence: 50, arch: 30, chain: 20 },
          register: { low: 25, mid: 55, high: 20 },
          motion: { sustained: 50, walking: 35, flowing: 15 },
          accompaniment: { pulse: 80, broken: 20 },
          tempo: { andante: 40, moderato: 35, adagio: 15, allegro: 10 },
          dynamics: { p: 35, mp: 35, mf: 20, f: 10 },
          dynamicShape: { crescendo: 40, late_surge: 30, waves: 15, build_then_drop: 15 },
          contour: { rise: 25, fall: 8, arch: 12, wave: 55 },
        },
      },
      // Warm major anthems.
      {
        name: 'heroic',
        weight: 16,
        priors: {
          form: { period: 30, sentence: 25, arch: 45 },
          key: { C_major: 22, Eb_major: 18, D_major: 16, G_major: 14, F_major: 12, Ab_major: 10, A_minor: 8 },
          register: { mid: 55, high: 45 },
          motion: { sustained: 40, walking: 45, flowing: 15 },
          accompaniment: { pulse: 70, sustained: 15, broken: 15 },
          tempo: { moderato: 40, andante: 25, allegro: 25, adagio: 10 },
          dynamics: { mf: 35, f: 25, mp: 20, p: 12, ff: 8 },
          dynamicShape: { crescendo: 35, late_surge: 30, arch: 20, build_then_drop: 15 },
          contour: { rise: 35, fall: 15, arch: 25, wave: 10, leap_fall: 15 },
        },
      },
      // Processional cues and hymn-like cues.
      {
        name: 'hymn',
        weight: 16,
        priors: {
          form: { period: 40, arch: 40, chain: 20 },
          key: { D_minor: 20, A_minor: 16, C_minor: 14, G_minor: 12, F_minor: 10, Ab_major: 14, Eb_major: 14 },
          register: { low: 40, mid: 60 },
          motion: { sustained: 55, walking: 45 },
          accompaniment: { sustained: 80, pulse: 20 },
          tempo: { adagio: 40, andante: 35, largo: 20, moderato: 5 },
          dynamics: { p: 40, pp: 25, mp: 25, mf: 10 },
          dynamicShape: { crescendo: 30, late_surge: 25, arch: 25, steady: 20 },
          contour: { rise: 20, fall: 15, arch: 25, dip: 5, wave: 35 },
        },
      },
      // Sparse drones and held colour.
      {
        name: 'still',
        weight: 16,
        priors: {
          form: { sentence: 30, arch: 50, chain: 20 },
          register: { low: 45, mid: 45, high: 10 },
          motion: { sustained: 75, walking: 25 },
          accompaniment: { sustained: 55, pulse: 25, broken: 20 },
          tempo: { largo: 40, adagio: 40, andante: 20 },
          dynamics: { pp: 50, p: 40, mp: 10 },
          dynamicShape: { late_surge: 30, steady: 25, crescendo: 25, arch: 20 },
          contour: { rise: 12, fall: 20, arch: 15, dip: 8, wave: 45 },
        },
      },
      // Crescendo drama, action cues.
      {
        name: 'stormy',
        weight: 16,
        priors: {
          form: { sentence: 55, chain: 45 },
          key: { D_minor: 22, C_minor: 20, G_minor: 16, F_minor: 14, A_minor: 12, E_minor: 10, Eb_major: 6 },
          register: { low: 20, mid: 55, high: 25 },
          motion: { walking: 40, flowing: 45, florid: 15 },
          accompaniment: { pulse: 85, broken: 15 },
          tempo: { allegro: 40, moderato: 30, andante: 15, presto: 15 },
          dynamics: { f: 30, mf: 25, p: 20, ff: 15, mp: 10 },
          dynamicShape: { crescendo: 35, late_surge: 25, build_then_drop: 25, sudden_contrast: 15 },
          contour: { rise: 35, fall: 12, arch: 15, dip: 15, wave: 5, leap_fall: 18 },
        },
      },
      // Uneasy cues that keep adding weight.
      {
        name: 'restless',
        weight: 12,
        priors: {
          form: { sentence: 40, chain: 60 },
          register: { mid: 50, high: 50 },
          motion: { flowing: 55, walking: 30, florid: 15 },
          accompaniment: { broken: 45, pulse: 45, sustained: 10 },
          tempo: { andante: 40, moderato: 30, adagio: 20, allegro: 10 },
          dynamics: { p: 35, mp: 30, mf: 20, pp: 15 },
          dynamicShape: { crescendo: 40, late_surge: 30, waves: 15, build_then_drop: 15 },
          palette: { modal_dark: 35, diatonic: 35, modal: 20, chromatic_approach: 10 },
          contour: { rise: 25, fall: 15, arch: 10, wave: 50 },
        },
      },
    ],
    holds: true,
    harmony: {
      minor: {
        // Simple film loops: i–bVI–bVII–V and i–iv–V families. No i–bVI–bIII–bVII
        // (the pop-loop spelling); bIII is reserved for a surprise colour.
        heads: [['i', 'i'], ['i', 'bVI'], ['i', 'iv'], ['i', 'v'], ['i64', 'i64'], ['i', 'bVII']],
        seqs: [['bVI', 'bVII'], ['iv', 'V'], ['bVI', 'iv'], ['bVII', 'V'], ['v', 'bVI'], ['iv', 'bVI'], ['bVI', 'V'], ['i64', 'iv64']],
        tails: {
          closed: [['V', 'i'], ['bVII', 'i'], ['iv', 'i'], ['V7', 'i'], ['bVI', 'i']],
          half: [['bVI', 'V'], ['iv', 'V'], ['bVII', 'V'], ['bVI', 'bVII'], ['iv', 'v']],
          open: [['bVI', 'bVII'], ['iv', 'bVI'], ['v', 'bVI'], ['bVII', 'iv']],
        },
        phrases: {
          closed: [['i', 'bVI', 'bVII', 'i'], ['i', 'iv', 'V', 'i'], ['i', 'bVI', 'V', 'i'], ['iv', 'i', 'V7', 'i']],
          half: [['i', 'bVI', 'bVII', 'V'], ['i', 'iv', 'bVI', 'V'], ['i', 'i', 'bVI', 'V']],
          open: [['i', 'i', 'bVI', 'bVI'], ['i', 'iv', 'i', 'iv'], ['i', 'bVI', 'iv', 'V']],
        },
        loops: [
          ['i', 'bVI', 'bVII', 'V'],
          ['i', 'iv', 'bVI', 'V'],
          ['i', 'bVI', 'iv', 'V'],
          ['i', 'i', 'bVI', 'bVI'],
          ['i', 'v', 'bVII', 'i'],
          ['i', 'iv'],
          ['i', 'bVI'],
        ],
        pedals: [['i', 'iv64', 'i', 'iv64'], ['i', 'bVII_over_I', 'i', 'bVII_over_I'], ['V7sus4', 'V7', 'V7sus4', 'V7']],
        codas: [['iv', 'i', 'iv64', 'i'], ['bVII', 'i', 'bVII', 'i'], ['bVI', 'V', 'i', 'i']],
        finals: ['i', 'i', 'i64', 'i_add9'],
        splits: [], // drones: the harmony moves slower than the bar, never faster,
        surprises: ['I', 'IV7', 'bVImaj7', 'V7sus4', 'III'],
        subs: { i: ['i64', 'i6', 'i_add9'], bVI: ['bVImaj7'], V: ['V7', 'V7sus4'], iv: ['iv64', 'iv6'], bVII: ['bVII_over_I'] },
      },
      major: {
        heads: [['I', 'I'], ['I', 'IV'], ['I', 'V'], ['I', 'IV64'], ['I', 'vi'], ['I', 'V7_over_I']],
        seqs: [['IV', 'V'], ['vi', 'V'], ['IV', 'I6'], ['V', 'IV'], ['I6', 'IV'], ['IV64', 'V7_over_I'], ['vi', 'I6']],
        tails: {
          closed: [['V', 'I'], ['IV', 'I'], ['IV64', 'I'], ['V7', 'I']],
          half: [['IV', 'V'], ['vi', 'V'], ['I', 'V'], ['IV64', 'V']],
          open: [['I', 'IV'], ['V', 'IV'], ['I6', 'vi'], ['IV', 'vi']],
        },
        phrases: {
          closed: [['I', 'IV', 'V', 'I'], ['I', 'V', 'IV', 'I'], ['I', 'IV64', 'V7', 'I']],
          half: [['I', 'IV', 'vi', 'V'], ['I', 'I', 'IV', 'V']],
          open: [['I', 'I', 'IV', 'IV'], ['I', 'IV64', 'I', 'IV64'], ['I', 'vi', 'IV', 'V']],
        },
        loops: [
          ['I', 'V', 'I', 'IV'],
          ['I', 'IV', 'I', 'V'],
          ['I', 'IV64', 'I', 'V7_over_I'],
          ['I', 'vi', 'IV', 'V'],
          ['I', 'IV'],
          ['I', 'I', 'IV', 'IV'],
        ],
        pedals: [['I', 'IV64', 'I', 'IV64'], ['I', 'V7_over_I', 'I', 'bVII_over_I']],
        codas: [['IV', 'I', 'IV64', 'I'], ['I', 'V', 'I', 'I'], ['vi', 'V', 'I64', 'I']],
        finals: ['I', 'I', 'Iadd9', 'I64'],
        splits: [],
        surprises: ['bVI', 'bVII', 'iv', 'bIII'],
        subs: { I: ['I64', 'I6', 'Iadd9'], IV: ['IV64', 'IV6'], V: ['V7', 'V7sus4'], vi: ['vi6'] },
      },
    },
  },

  // ────────────────────────────────────────────────────────────────────────────
  laufey: {
    brief:
      'Jazz-pop singer-songwriter piano, 2020s. A vocal-range hook in even four-bar phrases (period, returning A, or vamp-and-tag) over a bossa-nova comp (bass on 1 and the and of 2, shells on partido-alto), mid-register close voicings, or a soft stride — not a wide nocturne arpeggio and not sixteenths grouped 5+5+6. Harmony is song-form jazz: I–vi–ii–V, inverted ii–V–I, a ii9–V13 hook, major sevenths, and borrowed-iv phrases (I–V7/IV–vi7–iv6); no dense modern-jazz stacks, no planing, no drone-loop build. Intimate, unhurried, mostly major; acoustic piano first.',
    priors: {
      form: { period: 48, arch: 26, chain: 26 },
      key: { F_major: 12, Bb_major: 11, Eb_major: 10, C_major: 10, Ab_major: 8, G_major: 7, A_major: 6, D_major: 5, D_minor: 8, A_minor: 7, C_minor: 6, F_minor: 5, G_minor: 5 },
      meter: { four_four: 62, three_four: 26, six_eight: 12 },
      register: { low: 18, mid: 60, high: 22 },
      motion: { sustained: 12, walking: 74, flowing: 14 },
      accompaniment: { sustained: 30, broken: 22, pulse: 4, stride: 38, counterline: 6 },
      palette: { diatonic: 50, chromatic_approach: 32, modal: 10, blues: 8 },
      tempo: { andante: 34, adagio: 24, moderato: 20, largo: 6, larghetto: 8, allegro: 4, grave: 2, vivace: 2 },
      dynamics: { p: 42, mp: 32, pp: 16, mf: 10 },
      dynamicShape: { arch: 35, waves: 25, steady: 20, decrescendo: 12, terraced: 8 },
      contour: { rise: 14, fall: 20, arch: 26, dip: 10, wave: 22, leap_fall: 8 },
    },
    variants: [
      // Standards-shaped songs: a sung tune over piano accompaniment.
      {
        name: 'singing',
        weight: 32,
        priors: {
          form: { period: 50, arch: 35, chain: 15 },
          register: { low: 28, mid: 72 },
          motion: { sustained: 14, walking: 86 },
          accompaniment: { sustained: 42, broken: 20, stride: 38 },
          meter: { four_four: 60, three_four: 30, six_eight: 10 },
          tempo: { adagio: 40, andante: 45, largo: 15 },
          dynamics: { p: 50, mp: 35, pp: 15 },
          dynamicShape: { arch: 45, waves: 30, steady: 25 },
          contour: { rise: 12, fall: 25, arch: 35, dip: 8, wave: 20 },
        },
      },
      // Light swing and bossa-adjacent groove; still a song, not a vamp miniature.
      {
        name: 'groove',
        weight: 28,
        priors: {
          form: { period: 55, chain: 45 },
          meter: { four_four: 80, six_eight: 20 },
          register: { mid: 78, high: 22 },
          motion: { sustained: 18, walking: 82 },
          accompaniment: { sustained: 18, broken: 15, stride: 67 },
          palette: { diatonic: 40, chromatic_approach: 35, blues: 15, modal: 10 },
          tempo: { andante: 45, moderato: 40, adagio: 15 },
          dynamics: { mp: 50, p: 30, mf: 20 },
          contour: { rise: 16, fall: 14, arch: 22, dip: 6, wave: 24, leap_fall: 18 },
        },
      },
      {
        name: 'hazy',
        weight: 18,
        priors: {
          form: { period: 20, arch: 45, chain: 35 },
          register: { low: 35, mid: 55, high: 10 },
          motion: { sustained: 35, walking: 30, flowing: 35 },
          accompaniment: { sustained: 50, broken: 35, pulse: 15 },
          tempo: { adagio: 50, andante: 35, largo: 15 },
          dynamics: { p: 45, pp: 35, mp: 20 },
          palette: { diatonic: 40, chromatic_approach: 30, modal: 30 },
          contour: { fall: 24, arch: 28, dip: 12, wave: 36 },
        },
      },
      {
        name: 'witty',
        weight: 14,
        priors: {
          form: { period: 70, chain: 30 },
          meter: { four_four: 55, three_four: 35, six_eight: 10 },
          register: { mid: 35, high: 65 },
          motion: { walking: 60, flowing: 40 },
          accompaniment: { broken: 20, stride: 65, counterline: 15 },
          tempo: { moderato: 50, allegro: 35, andante: 15 },
          dynamics: { mp: 45, mf: 35, p: 20 },
          dynamicShape: { terraced: 40, waves: 30, sudden_contrast: 30 },
          contour: { rise: 18, fall: 18, arch: 18, wave: 22, leap_fall: 24 },
        },
      },
      {
        name: 'still',
        weight: 8,
        priors: {
          form: { period: 25, arch: 40, chain: 35 },
          register: { low: 45, mid: 55 },
          motion: { sustained: 35, walking: 25, flowing: 40 },
          accompaniment: { sustained: 25, broken: 40, pulse: 35 },
          tempo: { largo: 50, adagio: 50 },
          dynamics: { pp: 55, p: 45 },
          dynamicShape: { steady: 40, arch: 35, decrescendo: 25 },
          contour: { rise: 10, fall: 25, arch: 30, wave: 35 },
        },
      },
    ],
    holds: true,
    harmony: {
      major: {
        // Song-form jazz-pop: I–vi–ii–V, inverted ii–V–I, borrowed-iv language, ii9–V13 hook. No I–V–vi–IV.
        heads: [['ii9', 'V13'], ['I', 'V7_of_IV'], ['vi7', 'iv6'], ['Imaj7', 'vi7'], ['I', 'I6'], ['Imaj7', 'ii7'], ['I', 'vi'], ['I6', 'ii65'], ['Imaj7', 'iii7'], ['I', 'V65'], ['Imaj7', 'IVmaj7'], ['vi7', 'ii7']],
        seqs: [['ii9', 'V13'], ['V7_of_IV', 'iv6'], ['ii7', 'V7'], ['vi7', 'ii7'], ['iii7', 'vi7'], ['V7_of_ii', 'ii7'], ['V7_of_vi', 'vi7'], ['IVmaj7', 'iii7'], ['ii65', 'V7'], ['V43', 'I6'], ['V7_of_V', 'V7'], ['iii7', 'V7_of_ii']],
        tails: {
          closed: [['V13', 'Imaj7'], ['V7', 'I'], ['V65', 'I'], ['V7', 'Imaj7'], ['V43', 'I'], ['IVmaj7', 'I']],
          half: [['ii9', 'V13'], ['ii7', 'V7'], ['ii65', 'V'], ['IVmaj7', 'V7'], ['vi7', 'V'], ['V7_of_V', 'V']],
          open: [['vi7', 'iv6'], ['V7', 'vi'], ['V42', 'I6'], ['IVmaj7', 'iii7'], ['vi7', 'ii7'], ['V7_of_IV', 'IV']],
        },
        phrases: {
          // Borrowed-iv language (katiekeyboard family) and the ii9–V13–I hook first so argmax/sample actually emit them.
          closed: [['I', 'V7_of_IV', 'vi7', 'iv6'], ['ii9', 'V13', 'Imaj7', 'I'], ['I', 'Imaj7', 'IVmaj7', 'iv'], ['ii7', 'V7', 'Imaj7', 'I'], ['I6', 'ii65', 'V7', 'I'], ['V43', 'I6', 'V7', 'I'], ['ii65', 'I64', 'V7', 'I'], ['vi7', 'ii7', 'V7', 'Imaj7']],
          half: [['Imaj7', 'vi7', 'ii9', 'V13'], ['I', 'V7_of_IV', 'vi7', 'iv6'], ['Imaj7', 'vi7', 'ii7', 'V7'], ['I', 'I6', 'ii65', 'V'], ['Imaj7', 'iii7', 'ii7', 'V7'], ['I', 'V7_of_vi', 'vi7', 'V7_of_ii']],
          open: [['I', 'Imaj7', 'IVmaj7', 'iv'], ['Imaj7', 'vi7', 'IVmaj7', 'iii7'], ['I', 'V65', 'I6', 'IV'], ['Imaj7', 'iii7', 'vi7', 'ii7'], ['vi7', 'ii7', 'V7', 'vi7']],
        },
        loops: [['ii9', 'V13', 'Imaj7', 'I'], ['I', 'V7_of_IV', 'vi7', 'iv6'], ['Imaj7', 'vi7', 'ii7', 'V7'], ['I', 'I6', 'ii65', 'V7'], ['ii7', 'V7'], ['Imaj7', 'iii7'], ['I6', 'ii65', 'V43', 'I'], ['Imaj7', 'vi7']],
        pedals: [['I', 'IV64', 'I', 'IV64'], ['V7sus4', 'V7', 'V7sus4', 'V7']],
        codas: [['ii9', 'V13', 'Imaj7', 'I6_9'], ['ii7', 'V7', 'Imaj7', 'I6_9'], ['IVmaj7', 'I64', 'V7', 'I'], ['vi7', 'ii7', 'V7', 'Imaj7']],
        finals: ['I', 'Imaj7', 'I6_9', 'Iadd9'],
        splits: [['ii9', 'V13'], ['ii7', 'V7'], ['ii65', 'V'], ['ii7', 'V65'], ['IVmaj7', 'V7'], ['vi7', 'V7']], // ii–V (and ii9–V13) in one bar,
        surprises: ['bII7', 'iv', 'V7_of_vi', 'sharp_i_dim7', 'bVIImaj7'],
        subs: { Imaj7: ['I', 'I6', 'Iadd9'], I: ['I6', 'Imaj7'], vi7: ['vi', 'vi6'], ii7: ['ii65', 'ii9'], V7: ['V65', 'V43', 'V7sus4', 'V13'], IVmaj7: ['IV', 'IV6'], iv: ['iv6', 'iv_add6'] },
      },
      minor: {
        heads: [['i', 'iv7'], ['i7', 'ii_half_dim7'], ['i', 'V65'], ['i', 'i42'], ['i6', 'iv'], ['i7', 'iv7']],
        seqs: [['ii_half_dim7', 'V7'], ['iv7', 'V7'], ['i7', 'iv7'], ['V7_of_IV', 'iv'], ['ii_half_dim65', 'V7b9'], ['iv6', 'V']],
        tails: {
          closed: [['V7', 'i'], ['V65', 'i'], ['V7b9', 'i'], ['iv7', 'i']],
          half: [['ii_half_dim7', 'V7'], ['iv7', 'V'], ['i64', 'V'], ['ii_half_dim65', 'V7b9']],
          open: [['V7', 'bVI'], ['V42', 'i6'], ['iv7', 'ii_half_dim7'], ['i7', 'iv7']],
        },
        phrases: {
          closed: [['i7', 'ii_half_dim7', 'V7', 'i'], ['i', 'iv7', 'V7', 'i'], ['ii_half_dim65', 'i64', 'V7b9', 'i']],
          half: [['i', 'i42', 'ii_half_dim7', 'V7'], ['i7', 'iv7', 'ii_half_dim7', 'V7']],
          open: [['i7', 'iv7', 'i7', 'iv7'], ['i', 'V65', 'iv', 'bVI']],
        },
        loops: [['i7', 'iv7'], ['i', 'V65', 'i', 'V7'], ['ii_half_dim7', 'V7'], ['i7', 'ii_half_dim7', 'V7', 'i']],
        pedals: [['i', 'iv64', 'i', 'iv64'], ['V7sus4', 'V7', 'V7sus4', 'V7b9']],
        codas: [['iv7', 'V7', 'i', 'i'], ['ii_half_dim7', 'V7b9', 'i', 'i7']],
        finals: ['i', 'i7', 'i_add9', 'I'],
        splits: [['ii_half_dim7', 'V7'], ['iv7', 'V7'], ['i64', 'V7'], ['ii_half_dim65', 'V7b9'], ['ii_half_dim7', 'V65']],
        surprises: ['bII6', 'I', 'bVImaj7', 'iv_add6'],
        subs: { i: ['i7', 'i6'], i7: ['i9', 'i'], iv7: ['iv', 'iv6'], V7: ['V65', 'V7b9'], ii_half_dim7: ['ii_half_dim65'] },
      },
    },
  },

  // ────────────────────────────────────────────────────────────────────────────
  elijah_fox: {
    brief:
      'Jazz-trained pianist-producer, 2020s: solo-piano miniatures, not sung song forms. Continuous sixteenths whose accents fall in uneven groups (5+5+6, 7+5+4); modal mixture as the hook — bVImaj7 set against IVmaj7, maj7(#5) against add6 — with sliding inner voices and endings left hanging on colour chords (maj7#11, 6/9). Short vamps are varied, not spun into an additive process and not a clear vocal hook over stride; no parallel planing or whole-tone veils; soft, unhurried, piano or Wurlitzer.',
    priors: {
      form: { period: 10, sentence: 30, arch: 30, chain: 30 },
      key: { C_major: 12, Db_major: 10, D_major: 10, E_major: 10, B_major: 8, Ab_major: 8, Eb_major: 8, F_major: 6, G_major: 5, Fs_minor: 10, C_minor: 6, F_minor: 4, Cs_minor: 3 },
      meter: { three_four: 35, four_four: 45, six_eight: 20 },
      register: { low: 10, mid: 50, high: 40 },
      motion: { sustained: 15, walking: 20, flowing: 35, florid: 30 },
      accompaniment: { sustained: 40, broken: 40, pulse: 16, stride: 4 },
      palette: { pentatonic: 35, diatonic: 20, blues: 15, chromatic_approach: 15, modal: 15 },
      tempo: { andante: 36, adagio: 26, moderato: 22, largo: 4, larghetto: 8, grave: 2, vivace: 2 },
      dynamics: { p: 45, mp: 35, pp: 15, mf: 5 },
      dynamicShape: { arch: 35, waves: 25, steady: 20, decrescendo: 20 },
      contour: { rise: 14, fall: 20, arch: 22, dip: 8, wave: 28, leap_fall: 8 },
    },
    variants: [
      {
        name: 'hazy',
        weight: 28,
        priors: {
          form: { sentence: 15, arch: 25, chain: 60 },
          meter: { three_four: 40, four_four: 40, six_eight: 20 },
          register: { low: 20, mid: 15, high: 65 },
          motion: { walking: 15, flowing: 35, florid: 50 },
          accompaniment: { sustained: 35, broken: 65 },
          tempo: { andante: 50, moderato: 30, adagio: 20 },
          dynamics: { p: 50, mp: 35, pp: 15 },
        },
      },
      {
        name: 'singing',
        weight: 24,
        priors: {
          form: { period: 20, arch: 45, chain: 35 },
          register: { low: 30, mid: 70 },
          motion: { walking: 50, flowing: 35, sustained: 15 },
          accompaniment: { sustained: 75, pulse: 25 },
          tempo: { adagio: 45, andante: 45, largo: 10 },
          contour: { rise: 13, fall: 25, arch: 32, dip: 10, wave: 20 },
        },
      },
      // The neo-soul side: a secondary flavour in his bios, mostly in production work.
      {
        name: 'groove',
        weight: 20,
        priors: {
          form: { period: 30, chain: 70 },
          meter: { four_four: 75, six_eight: 25 },
          register: { mid: 80, high: 20 },
          motion: { walking: 45, flowing: 35, florid: 20 },
          accompaniment: { sustained: 35, pulse: 20, stride: 45 },
          palette: { pentatonic: 40, blues: 35, chromatic_approach: 25 },
          tempo: { andante: 50, moderato: 40, adagio: 10 },
          dynamics: { mp: 50, p: 30, mf: 20 },
        },
      },
      {
        name: 'perpetual',
        weight: 16,
        priors: {
          form: { arch: 30, chain: 70 },
          register: { mid: 20, high: 80 },
          motion: { flowing: 25, florid: 75 },
          accompaniment: { broken: 80, pulse: 20 },
          tempo: { moderato: 55, andante: 30, allegro: 15 },
          contour: { rise: 20, fall: 15, arch: 25, wave: 40 },
        },
      },
      // The ambient keyboard records.
      {
        name: 'still',
        weight: 12,
        priors: {
          form: { sentence: 30, chain: 70 },
          register: { low: 40, mid: 30, high: 30 },
          motion: { sustained: 70, flowing: 30 },
          accompaniment: { sustained: 30, broken: 30, pulse: 40 },
          tempo: { largo: 45, adagio: 55 },
          dynamics: { pp: 55, p: 45 },
          dynamicShape: { steady: 35, arch: 35, decrescendo: 30 },
        },
      },
    ],
    holds: true,
    harmony: {
      major: {
        heads: [['bVImaj7', 'IVmaj7'], ['Imaj7s5', 'IVadd6'], ['Imaj9', 'vi9'], ['Imaj9', 'IVmaj9'], ['iii7', 'V7_of_ii'], ['Imaj9', 'bVImaj7'], ['Imaj7', 'sharp_i_dim7'], ['IVmaj9', 'iv_add6'], ['I', 'V7_of_IV']],
        seqs: [['iii7', 'V7_of_ii'], ['ii9', 'V13'], ['iv7', 'iii7'], ['biii7', 'ii7'], ['sharp_i_dim7', 'ii9'], ['V7_of_vi', 'vi11'], ['sharp_iv_half_dim7', 'IV7'], ['bVII7', 'ii7']],
        tails: {
          closed: [['V13', 'Imaj9'], ['bVII9', 'Imaj9'], ['bII7', 'Imaj9'], ['iv_add6', 'Imaj9'], ['V9sus4', 'I6_9'], ['bVII9', 'Iadd9']],
          half: [['ii9', 'V13'], ['vi9', 'V9sus4'], ['ii9', 'V7alt'], ['ii9', 'bII7'], ['vi11', 'V9sus4'], ['iv_add6', 'bVII9']],
          open: [['iii9', 'vi9'], ['IVmaj9', 'iii9'], ['sharp_iv_half_dim7', 'biii7'], ['bVImaj7', 'IVmaj7']],
        },
        phrases: {
          closed: [['ii9', 'V13', 'Imaj9', 'I6_9'], ['IVmaj9', 'iv_add6', 'bVII9', 'Imaj9'], ['Imaj9', 'bVImaj7', 'bVII9', 'Iadd9']],
          half: [['Imaj9', 'vi9', 'ii9', 'V13'], ['iii7', 'V7_of_ii', 'ii9', 'V9sus4'], ['Imaj9', 'IVmaj9', 'iv_add6', 'bVII9'], ['Imaj7', 'sharp_i_dim7', 'ii9', 'V13']],
          // From his own lesson on "City in the Sky": bVImaj7 against IVmaj7 (C Aeolian against C Ionian),
          // Cmaj7(#5) with F6, and the closing vi – V – #ivø7 – biii walk. The last two are generic idiom.
          open: [['bVImaj7', 'IVmaj7', 'bVImaj7', 'IVmaj7'], ['Imaj7s5', 'IVadd6', 'Imaj7s5', 'IVadd6'], ['vi7', 'V', 'sharp_iv_half_dim7', 'biii7'], ['sharp_iv_half_dim7', 'IV7', 'bVII7', 'ii7'], ['iv7', 'iii7', 'biii7', 'ii7']],
        },
        loops: [['bVImaj7', 'IVmaj7'], ['Imaj7s5', 'IVadd6'], ['Imaj7s11', 'bVIImaj7'], ['Imaj9', 'IVmaj9'], ['Imaj9', 'vi9', 'ii9', 'V13']],
        pedals: [['V9sus4', 'V13', 'V9sus4', 'V7alt']],
        codas: [['ii9', 'bII7', 'Imaj9', 'Imaj7s11'], ['IVmaj9', 'iv_add6', 'Imaj9', 'I6_9'], ['bVImaj7', 'bVII9', 'Imaj9', 'Imaj7s11']],
        finals: ['Imaj7s11', 'I6_9', 'Imaj9', 'Iadd9', 'V9sus4'],
        splits: [['ii9', 'V13'], ['ii9', 'V7alt'], ['vi9', 'V9sus4'], ['ii9', 'bII7'], ['iv_add6', 'bVII9']], // ii–V colour squeezed into one bar before a held tonic,
        surprises: ['bVImaj7', 'Imaj7s5', 'bII7', 'iv_add6', 'bVImaj9', 'III'],
        subs: { Imaj9: ['Imaj7', 'I6_9', 'Iadd9'], IVmaj9: ['IVmaj7', 'IVadd6'], V13: ['V9sus4', 'V7alt', 'bII7'], ii9: ['ii7', 'IVmaj9'], vi9: ['vi11', 'vi7'], bVImaj7: ['bVImaj9'] },
      },
      minor: {
        heads: [['i9', 'bVImaj9'], ['i', 'i_maj7'], ['i9', 'i42'], ['ii_half_dim7', 'V7b9'], ['iv9', 'i9'], ['i11', 'iv9']],
        seqs: [['i7', 'i_add6'], ['iv9', 'bVII9'], ['bIIImaj7', 'bVImaj7'], ['ii_half_dim7', 'V7alt'], ['bVImaj7', 'bVII']],
        tails: {
          closed: [['V7alt', 'i9'], ['bII7', 'i9'], ['bVII9', 'i11'], ['V7b9', 'i_add6']],
          half: [['ii_half_dim7', 'V7alt'], ['bVImaj7', 'V7sus4'], ['bVImaj9', 'V7alt']],
          open: [['bIIImaj7', 'bVImaj7'], ['iv9', 'bVII9'], ['bVImaj7', 'bVII']],
        },
        phrases: {
          closed: [['ii_half_dim7', 'V7b9', 'i9', 'i_add6'], ['bVImaj7', 'bVII', 'i11', 'i11']],
          half: [['i9', 'bVImaj9', 'ii_half_dim7', 'V7alt'], ['i9', 'i42', 'bVImaj7', 'V7sus4']],
          // A line cliché; minor-ninth chords a fifth apart (after his displacement lesson over F–9 and C–9).
          open: [['i', 'i_maj7', 'i7', 'i_add6'], ['iv9', 'i9', 'iv9', 'i9'], ['iv9', 'bVII9', 'bIIImaj7', 'bVImaj7']],
        },
        loops: [['iv9', 'i9'], ['i11', 'iv9'], ['i9', 'IV7'], ['i9', 'bVImaj9']],
        pedals: [['V7sus4', 'V7alt', 'V7sus4', 'V7b9']],
        codas: [['bVImaj7', 'bVII', 'i11', 'i_add6'], ['ii_half_dim7', 'bII7', 'i9', 'i9']],
        finals: ['i9', 'i11', 'i_add6', 'i_add9'],
        splits: [['ii_half_dim7', 'V7alt'], ['bVImaj7', 'V7sus4'], ['bVImaj9', 'V7alt'], ['ii_half_dim7', 'bII7']],
        surprises: ['bIImaj7', 'IV7', 'I', 'bVImaj9', 'bII7'],
        subs: { i9: ['i11', 'i_add9', 'i7'], iv9: ['iv7'], bVImaj9: ['bVImaj7'], V7alt: ['V7b9', 'bII7'] },
      },
    },
  },
}

/** Every chord a style's harmony book can produce — its vocabulary, for the stub style-match. */
export function styleVocabulary(profile: StyleProfile): Set<ChordId> {
  const out = new Set<ChordId>()
  for (const book of [profile.harmony.major, profile.harmony.minor]) {
    const groups: readonly (readonly ChordId[])[] = [
      ...book.heads,
      ...book.seqs,
      ...Object.values(book.tails).flat(),
      ...Object.values(book.phrases).flat(),
      ...book.loops,
      ...book.pedals,
      ...book.codas,
      book.finals,
      book.surprises,
      ...Object.values(book.subs).map((alternatives) => alternatives ?? []),
    ]
    for (const group of groups) for (const chord of group) out.add(chord)
  }
  return out
}
