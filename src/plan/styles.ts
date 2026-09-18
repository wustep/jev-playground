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
  CharacterId,
  ChordId,
  ContourId,
  DynamicId,
  DynamicShapeId,
  FormId,
  InstrumentId,
  KeyId,
  MeterId,
  PaletteId,
  StyleId,
  TempoId,
  TextureId,
} from './schema.js'
import type { PhraseEnd } from './forms.js'

export type Weights<K extends string> = Partial<Record<K, number>>

export interface StylePriors {
  form: Weights<FormId>
  key: Weights<KeyId>
  meter: Weights<MeterId>
  texture: Weights<TextureId>
  palette: Weights<PaletteId>
  tempo: Weights<TempoId>
  dynamics: Weights<DynamicId>
  dynamicShape: Weights<DynamicShapeId>
  defaultInstrument: Weights<InstrumentId>
  contour: Weights<ContourId>
}

export interface Archetype {
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
  archetypes: Partial<Record<CharacterId, Archetype>>
  harmony: { major: HarmonyBook; minor: HarmonyBook }
  /** True where holding one chord across a barline is idiomatic (long harmonic rhythm). */
  holds: boolean
}

export const STYLE_PROFILES: Record<StyleId, StyleProfile> = {
  // ────────────────────────────────────────────────────────────────────────────
  bach: {
    brief:
      'German Baroque keyboard music, c. 1720. Functional harmony whose bass moves by step through inverted chords, circle-of-fifths sequences, pedal points and clear dominant–tonic cadences. Pieces are preludes of unbroken figuration, two-part inventions, chorales, or binary dances (sarabande, minuet, gigue). Dynamics change in blocks, not swells. Written for harpsichord, clavichord and organ.',
    priors: {
      form: { spinning_out: 35, binary_dance: 30, period: 20, sentence: 10, call_and_response: 5 },
      key: { C_major: 12, G_major: 10, D_major: 9, F_major: 8, Bb_major: 6, A_major: 5, Eb_major: 4, E_major: 3, D_minor: 12, G_minor: 9, C_minor: 9, A_minor: 8, E_minor: 6, B_minor: 6, F_minor: 3 },
      meter: { four_four: 42, three_four: 24, six_eight: 14, twelve_eight: 12, nine_eight: 8 },
      texture: { two_voice_counterpoint: 25, broken_chord_prelude: 20, chorale: 15, aria_walking_bass: 15, toccata_perpetual: 15, stride_dance: 10 },
      palette: { diatonic: 60, chromatic_approach: 40 },
      tempo: { andante: 30, moderato: 40, allegro: 30 },
      dynamics: { mf: 50, mp: 25, f: 25 },
      dynamicShape: { terraced: 50, steady: 30, waves: 10, late_surge: 10 },
      defaultInstrument: { harpsichord: 50, church_organ: 25, grand_piano: 25 },
      contour: { rise: 18, fall: 20, arch: 16, pendulum: 14, wave: 12, leap_fall: 10, dip: 6, drop_rise: 2, static: 2 },
    },
    archetypes: {
      // Preludes in unbroken figuration (WTC I/1, I/2).
      flowing_perpetual: {
        weight: 24,
        priors: {
          form: { spinning_out: 60, binary_dance: 20, sentence: 10, period: 10 },
          texture: { broken_chord_prelude: 55, toccata_perpetual: 30, two_voice_counterpoint: 15 },
          meter: { four_four: 58, three_four: 12, six_eight: 12, twelve_eight: 12, nine_eight: 6 },
          tempo: { andante: 35, moderato: 40, allegro: 25 },
          dynamics: { mp: 45, mf: 45, p: 10 },
          dynamicShape: { steady: 35, terraced: 25, late_surge: 25, waves: 15 },
          contour: { static: 30, arch: 25, rise: 15, fall: 15, wave: 15 },
        },
      },
      // Two-part inventions.
      playful_wit: {
        weight: 20,
        priors: {
          form: { spinning_out: 45, binary_dance: 25, sentence: 15, call_and_response: 15 },
          texture: { two_voice_counterpoint: 80, toccata_perpetual: 20 },
          tempo: { allegro: 55, moderato: 35, presto: 10 },
          dynamics: { mf: 60, f: 25, mp: 15 },
          contour: { pendulum: 22, leap_fall: 18, rise: 18, fall: 18, wave: 14, arch: 10 },
        },
      },
      // Four-part chorales.
      solemn_hymn: {
        weight: 16,
        priors: {
          form: { period: 60, binary_dance: 20, call_and_response: 10, sentence: 10 },
          texture: { chorale: 90, aria_walking_bass: 10 },
          meter: { four_four: 80, three_four: 20 },
          tempo: { andante: 45, adagio: 35, moderato: 20 },
          dynamicShape: { steady: 60, terraced: 40 },
          defaultInstrument: { church_organ: 50, choir: 20, harpsichord: 15, grand_piano: 15 },
          contour: { arch: 30, fall: 30, rise: 20, dip: 10, static: 10 },
        },
      },
      // Sarabandes and arias: slow triple time, ornamented line over a walking bass.
      lyrical_song: {
        weight: 16,
        priors: {
          form: { binary_dance: 50, period: 35, arch_return: 15 },
          texture: { aria_walking_bass: 70, chorale: 15, stride_dance: 15 },
          meter: { three_four: 55, four_four: 30, six_eight: 15 },
          tempo: { adagio: 45, andante: 40, largo: 15 },
          dynamics: { mp: 50, p: 30, mf: 20 },
          dynamicShape: { terraced: 40, waves: 30, steady: 30 },
          contour: { arch: 28, fall: 22, leap_fall: 18, wave: 16, rise: 10, dip: 6 },
        },
      },
      // Gigues, minuets, correntes.
      dance_lilt: {
        weight: 16,
        priors: {
          form: { binary_dance: 70, period: 20, spinning_out: 10 },
          texture: { two_voice_counterpoint: 40, stride_dance: 35, aria_walking_bass: 25 },
          meter: { six_eight: 36, three_four: 32, twelve_eight: 20, nine_eight: 12 },
          tempo: { allegro: 50, moderato: 35, presto: 15 },
          contour: { leap_fall: 25, pendulum: 20, rise: 18, fall: 17, wave: 12, arch: 8 },
        },
      },
      // Minor-key toccatas.
      stormy_drama: {
        weight: 8,
        priors: {
          form: { spinning_out: 60, free_fantasia: 25, sentence: 15 },
          key: { C_minor: 25, D_minor: 25, G_minor: 18, A_minor: 12, E_minor: 10, F_minor: 10 },
          texture: { toccata_perpetual: 70, two_voice_counterpoint: 20, dramatic_chords: 10 },
          tempo: { allegro: 60, presto: 30, moderato: 10 },
          dynamics: { f: 55, mf: 45 },
          dynamicShape: { terraced: 45, late_surge: 35, steady: 20 },
        },
      },
    },
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
      'Viennese Classical-to-Romantic piano music, c. 1800. Tonic and dominant in every inversion, cadential six-fours, diminished-seventh shocks, Neapolitan and minor-subdominant colour; one harmony may be held for bars before the pace quickens into a cadence. Themes are sentences and periods built from a short motto. Dynamics avoid the middle: pianissimo against fortissimo, long crescendos cut off by a sudden piano, sforzando accents. Stormy tremolo-and-chords allegros, singing adagios, staccato scherzos, solemn marches. Written for the piano.',
    priors: {
      form: { sentence: 35, period: 35, call_and_response: 10, arch_return: 10, free_fantasia: 5, layered_build: 5 },
      key: { C_minor: 16, F_minor: 10, D_minor: 8, Cs_minor: 5, A_minor: 6, E_minor: 4, G_minor: 4, Eb_major: 12, C_major: 10, G_major: 7, Ab_major: 7, E_major: 5, F_major: 5, D_major: 4, A_major: 4, Db_major: 2 },
      meter: { four_four: 32, three_four: 26, two_four: 24, six_eight: 18 },
      texture: { dramatic_chords: 18, alberti_melody: 18, tremolo_storm: 14, rolling_nocturne: 12, pulsing_chords: 12, scherzo_staccato: 12, chorale: 8, aria_walking_bass: 6 },
      palette: { diatonic: 50, chromatic_approach: 50 },
      tempo: { allegro: 35, presto: 15, adagio: 20, andante: 15, moderato: 10, largo: 5 },
      dynamics: { f: 30, ff: 15, p: 35, pp: 20 },
      dynamicShape: { sudden_contrast: 35, build_then_drop: 20, crescendo: 20, arch: 10, late_surge: 10, waves: 5 },
      defaultInstrument: { grand_piano: 90, strings: 10 },
      contour: { rise: 24, fall: 16, arch: 14, leap_fall: 12, static: 12, drop_rise: 8, wave: 8, dip: 4, pendulum: 2 },
    },
    archetypes: {
      // Pathétique / Tempest / Appassionata allegros.
      stormy_drama: {
        weight: 26,
        priors: {
          form: { sentence: 45, period: 20, call_and_response: 20, free_fantasia: 15 },
          key: { C_minor: 30, F_minor: 18, D_minor: 16, Cs_minor: 8, G_minor: 8, A_minor: 8, E_minor: 6, Eb_major: 6 },
          texture: { tremolo_storm: 40, dramatic_chords: 35, pulsing_chords: 15, toccata_perpetual: 10 },
          meter: { four_four: 36, two_four: 32, three_four: 18, six_eight: 14 },
          tempo: { allegro: 55, presto: 35, moderato: 10 },
          dynamics: { f: 40, ff: 25, p: 25, pp: 10 },
          dynamicShape: { sudden_contrast: 45, build_then_drop: 25, crescendo: 20, late_surge: 10 },
          contour: { rise: 35, leap_fall: 15, fall: 15, drop_rise: 12, arch: 13, static: 10 },
        },
      },
      // Adagio cantabile: a hymn-like tune over a murmuring accompaniment.
      lyrical_song: {
        weight: 22,
        priors: {
          form: { period: 55, arch_return: 25, sentence: 20 },
          key: { Ab_major: 25, Eb_major: 20, Db_major: 10, E_major: 10, F_major: 10, C_major: 10, A_major: 8, G_major: 7 },
          texture: { alberti_melody: 40, rolling_nocturne: 20, chorale: 20, aria_walking_bass: 20 },
          tempo: { adagio: 55, andante: 35, largo: 10 },
          dynamics: { p: 50, pp: 25, f: 25 },
          dynamicShape: { arch: 35, waves: 25, build_then_drop: 25, crescendo: 15 },
          contour: { arch: 30, fall: 20, wave: 18, rise: 16, leap_fall: 10, dip: 6 },
        },
      },
      // Op. 27/2, first movement.
      meditative_stillness: {
        weight: 12,
        priors: {
          form: { period: 30, spinning_out: 25, arch_return: 25, free_fantasia: 20 },
          key: { Cs_minor: 35, C_minor: 15, F_minor: 15, A_minor: 10, D_minor: 10, E_minor: 10, B_minor: 5 },
          meter: { four_four: 50, six_eight: 35, three_four: 15 },
          texture: { rolling_nocturne: 80, chorale: 20 },
          tempo: { adagio: 60, largo: 30, andante: 10 },
          dynamics: { pp: 55, p: 45 },
          dynamicShape: { steady: 40, arch: 30, waves: 30 },
          contour: { static: 45, fall: 20, arch: 20, dip: 10, rise: 5 },
        },
      },
      // Waldstein, Eroica, Emperor.
      heroic_bright: {
        weight: 16,
        priors: {
          form: { sentence: 45, period: 35, call_and_response: 20 },
          key: { Eb_major: 30, C_major: 25, D_major: 15, G_major: 10, A_major: 10, F_major: 10 },
          texture: { pulsing_chords: 35, dramatic_chords: 30, alberti_melody: 20, scherzo_staccato: 15 },
          meter: { four_four: 40, two_four: 30, three_four: 16, six_eight: 14 },
          tempo: { allegro: 70, presto: 15, moderato: 15 },
          dynamics: { f: 45, ff: 20, p: 25, pp: 10 },
          dynamicShape: { crescendo: 30, sudden_contrast: 35, build_then_drop: 20, terraced: 15 },
          contour: { rise: 35, leap_fall: 20, arch: 15, fall: 15, drop_rise: 15 },
        },
      },
      // Scherzos and bagatelles.
      playful_wit: {
        weight: 14,
        priors: {
          form: { period: 40, sentence: 30, call_and_response: 30 },
          meter: { three_four: 60, six_eight: 20, four_four: 20 },
          texture: { scherzo_staccato: 60, alberti_melody: 25, stride_dance: 15 },
          tempo: { presto: 40, allegro: 50, moderato: 10 },
          dynamics: { p: 50, f: 30, pp: 20 },
          dynamicShape: { sudden_contrast: 60, terraced: 20, build_then_drop: 20 },
        },
      },
      // Funeral marches; the Seventh Symphony's Allegretto ostinato.
      solemn_hymn: {
        weight: 10,
        priors: {
          form: { period: 45, layered_build: 30, arch_return: 25 },
          key: { A_minor: 25, C_minor: 25, D_minor: 20, F_minor: 15, Ab_major: 15 },
          texture: { pulsing_chords: 40, chorale: 35, dramatic_chords: 25 },
          tempo: { andante: 50, adagio: 35, moderato: 15 },
          dynamics: { p: 45, pp: 35, f: 20 },
          dynamicShape: { late_surge: 35, crescendo: 30, sudden_contrast: 20, steady: 15 },
          contour: { static: 45, arch: 20, rise: 15, fall: 15, dip: 5 },
        },
      },
    },
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
      'Mid-nineteenth-century Polish and French piano music, c. 1840. A singing right-hand cantabile over left-hand arpeggio, waltz or nocturne figuration; rubato-friendly slow pieces; mazurka and waltz dance lilt in triple meter; stormy ballade and scherzo drama. Harmony is functional Romantic: chromatic approach over a diatonic base, secondary dominants, Neapolitan colour, and clear dominant–tonic and half cadences. Pedalled piano, written for the grand piano.',
    priors: {
      form: { period: 30, sentence: 20, arch_return: 20, binary_dance: 15, spinning_out: 10, free_fantasia: 5 },
      key: { Db_major: 14, Ab_major: 12, Bb_major: 8, Eb_major: 8, Gb_major: 6, F_major: 5, C_major: 4, Cs_minor: 10, B_minor: 8, Fs_minor: 6, C_minor: 5, E_minor: 5, F_minor: 5, G_minor: 4 },
      meter: { three_four: 45, four_four: 35, six_eight: 20 },
      texture: { rolling_nocturne: 22, alberti_melody: 18, chordal_melody: 14, stride_dance: 14, dramatic_chords: 12, broken_chord_prelude: 12, wash_arpeggio: 8 },
      palette: { chromatic_approach: 55, diatonic: 45 },
      tempo: { adagio: 28, andante: 24, moderato: 18, allegro: 16, largo: 8, presto: 6 },
      dynamics: { p: 35, mp: 20, pp: 15, f: 15, mf: 10, ff: 5 },
      dynamicShape: { arch: 30, waves: 20, sudden_contrast: 15, crescendo: 15, late_surge: 10, terraced: 10 },
      defaultInstrument: { grand_piano: 95, strings: 5 },
      contour: { arch: 24, fall: 18, wave: 16, leap_fall: 12, rise: 12, dip: 8, drop_rise: 6, static: 4 },
    },
    archetypes: {
      // Nocturnes: singing cantabile over rolling left-hand figuration.
      lyrical_song: {
        weight: 28,
        priors: {
          form: { period: 45, arch_return: 30, sentence: 25 },
          key: { Db_major: 22, Ab_major: 18, Eb_major: 12, Gb_major: 10, F_major: 8, C_major: 6, Cs_minor: 12, B_minor: 6, E_minor: 6 },
          meter: { four_four: 45, six_eight: 30, three_four: 25 },
          texture: { rolling_nocturne: 50, alberti_melody: 25, chordal_melody: 15, wash_arpeggio: 10 },
          tempo: { adagio: 50, andante: 30, largo: 15, moderato: 5 },
          dynamics: { p: 45, pp: 25, mp: 20, f: 10 },
          dynamicShape: { arch: 40, waves: 30, crescendo: 15, late_surge: 15 },
          contour: { arch: 32, fall: 20, wave: 20, leap_fall: 12, rise: 10, dip: 6 },
        },
      },
      // Mazurkas and waltzes.
      dance_lilt: {
        weight: 26,
        priors: {
          form: { binary_dance: 45, period: 35, arch_return: 20 },
          key: { Bb_major: 18, Ab_major: 14, Db_major: 12, Eb_major: 10, F_major: 8, C_major: 6, Cs_minor: 10, B_minor: 8, Fs_minor: 8, G_minor: 6 },
          meter: { three_four: 85, six_eight: 10, four_four: 5 },
          texture: { stride_dance: 50, alberti_melody: 25, chordal_melody: 15, rolling_nocturne: 10 },
          tempo: { moderato: 40, andante: 30, allegro: 25, adagio: 5 },
          dynamics: { p: 35, mp: 30, mf: 20, f: 15 },
          dynamicShape: { waves: 35, arch: 25, sudden_contrast: 20, terraced: 20 },
          contour: { leap_fall: 22, wave: 20, arch: 18, rise: 16, fall: 14, dip: 10 },
        },
      },
      // Ballades and scherzos.
      stormy_drama: {
        weight: 16,
        priors: {
          form: { sentence: 35, spinning_out: 25, free_fantasia: 25, arch_return: 15 },
          key: { G_minor: 18, C_minor: 16, F_minor: 14, B_minor: 12, Cs_minor: 12, Fs_minor: 10, E_minor: 8, Ab_major: 10 },
          meter: { four_four: 45, six_eight: 30, three_four: 25 },
          texture: { dramatic_chords: 40, broken_chord_prelude: 20, tremolo_storm: 15, rolling_nocturne: 15, wash_arpeggio: 10 },
          tempo: { allegro: 50, presto: 25, moderato: 15, andante: 10 },
          dynamics: { f: 35, ff: 20, p: 25, pp: 10, mf: 10 },
          dynamicShape: { sudden_contrast: 40, crescendo: 25, late_surge: 20, arch: 15 },
          contour: { rise: 28, leap_fall: 20, drop_rise: 16, fall: 14, arch: 12, wave: 10 },
        },
      },
      // Études: unbroken figuration.
      flowing_perpetual: {
        weight: 14,
        priors: {
          form: { spinning_out: 45, sentence: 25, arch_return: 20, period: 10 },
          texture: { broken_chord_prelude: 45, wash_arpeggio: 25, toccata_perpetual: 15, alberti_melody: 15 },
          meter: { four_four: 55, six_eight: 25, three_four: 20 },
          tempo: { allegro: 45, moderato: 30, andante: 15, presto: 10 },
          dynamics: { mf: 35, mp: 25, f: 20, p: 20 },
          dynamicShape: { crescendo: 30, arch: 30, waves: 20, late_surge: 20 },
          contour: { wave: 28, rise: 22, fall: 18, arch: 16, static: 16 },
        },
      },
      // Slow preludes and spare late nocturnes.
      meditative_stillness: {
        weight: 10,
        priors: {
          form: { period: 35, arch_return: 35, spinning_out: 20, free_fantasia: 10 },
          key: { E_minor: 22, Cs_minor: 18, B_minor: 14, F_minor: 12, C_minor: 10, Db_major: 12, Ab_major: 12 },
          meter: { four_four: 50, six_eight: 30, three_four: 20 },
          texture: { rolling_nocturne: 45, chordal_melody: 30, chorale: 15, melody_over_ostinato: 10 },
          tempo: { largo: 40, adagio: 45, andante: 15 },
          dynamics: { pp: 50, p: 40, mp: 10 },
          dynamicShape: { steady: 35, arch: 30, waves: 20, decrescendo: 15 },
          contour: { static: 30, fall: 25, arch: 20, dip: 15, rise: 10 },
        },
      },
      // Light waltzes and mazurka jokes.
      playful_wit: {
        weight: 6,
        priors: {
          form: { binary_dance: 40, period: 30, call_and_response: 30 },
          meter: { three_four: 70, six_eight: 15, four_four: 15 },
          texture: { stride_dance: 40, scherzo_staccato: 35, alberti_melody: 25 },
          tempo: { allegro: 50, moderato: 35, presto: 15 },
          dynamics: { p: 40, mf: 25, f: 20, mp: 15 },
          dynamicShape: { sudden_contrast: 45, terraced: 30, waves: 25 },
          contour: { leap_fall: 25, wave: 20, rise: 18, fall: 17, pendulum: 12, arch: 8 },
        },
      },
    },
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
      'French piano music, c. 1905. Harmony is colour, not function: triads, ninths and hollow fifths glide in parallel; pentatonic, whole-tone and old church modes blur the key; added sixths and ninths hang unresolved over pedal notes. Phrases are short ideas said twice and set side by side like tiles. Dominant–tonic cadences are avoided — pieces settle by a plagal or modal step, or simply fade. Very soft, pedalled, with one gentle swell.',
    priors: {
      form: { mosaic_pairs: 40, arch_return: 40, free_fantasia: 10, layered_build: 5, period: 5 },
      key: { Db_major: 14, Gb_major: 8, E_major: 10, B_major: 6, F_major: 8, Bb_major: 5, A_major: 5, G_major: 5, C_major: 6, D_minor: 8, Fs_minor: 8, E_minor: 6, A_minor: 5, Cs_minor: 6 },
      meter: { six_eight: 28, four_four: 28, three_four: 22, nine_eight: 22 },
      texture: { parallel_planing: 20, wash_arpeggio: 20, melody_over_ostinato: 15, chordal_melody: 15, bell_organum: 10, displaced_arpeggio: 5, toccata_perpetual: 5, broken_chord_prelude: 5, stride_dance: 5 },
      palette: { pentatonic: 35, whole_tone: 15, modal: 20, modal_dark: 15, diatonic: 15 },
      tempo: { adagio: 35, andante: 40, largo: 15, moderato: 10 },
      dynamics: { pp: 50, p: 40, mp: 10 },
      dynamicShape: { arch: 40, waves: 20, steady: 15, decrescendo: 15, late_surge: 10 },
      defaultInstrument: { grand_piano: 85, strings: 8, choir: 7 },
      contour: { fall: 22, arch: 22, wave: 16, static: 14, dip: 10, rise: 8, drop_rise: 5, leap_fall: 3 },
    },
    archetypes: {
      dreamy_haze: {
        weight: 30,
        priors: {
          form: { mosaic_pairs: 50, arch_return: 35, free_fantasia: 15 },
          meter: { nine_eight: 32, six_eight: 28, four_four: 22, three_four: 18 },
          texture: { parallel_planing: 35, wash_arpeggio: 25, chordal_melody: 20, melody_over_ostinato: 20 },
          palette: { pentatonic: 35, whole_tone: 25, modal: 20, modal_dark: 10, diatonic: 10 },
          tempo: { adagio: 40, andante: 45, largo: 15 },
          dynamics: { pp: 50, p: 45, mp: 5 },
          dynamicShape: { arch: 45, waves: 25, steady: 15, decrescendo: 15 },
        },
      },
      // Arabesque, Jardins sous la pluie, Doctor Gradus.
      flowing_perpetual: {
        weight: 20,
        priors: {
          form: { arch_return: 45, mosaic_pairs: 35, spinning_out: 20 },
          meter: { nine_eight: 30, six_eight: 28, four_four: 24, three_four: 18 },
          texture: { wash_arpeggio: 40, broken_chord_prelude: 25, toccata_perpetual: 20, displaced_arpeggio: 15 },
          palette: { pentatonic: 45, modal: 30, diatonic: 25 },
          tempo: { andante: 35, moderato: 45, allegro: 20 },
          dynamics: { p: 55, pp: 25, mp: 20 },
          contour: { fall: 30, wave: 25, arch: 25, rise: 12, dip: 8 },
        },
      },
      // Des pas sur la neige, La cathédrale engloutie.
      meditative_stillness: {
        weight: 20,
        priors: {
          form: { arch_return: 45, mosaic_pairs: 30, layered_build: 25 },
          texture: { melody_over_ostinato: 40, bell_organum: 40, parallel_planing: 20 },
          palette: { modal_dark: 30, modal: 25, pentatonic: 25, diatonic: 20 },
          tempo: { largo: 50, adagio: 45, andante: 5 },
          dynamics: { pp: 65, p: 35 },
          dynamicShape: { arch: 35, steady: 30, late_surge: 20, decrescendo: 15 },
          contour: { static: 30, arch: 25, fall: 20, rise: 15, dip: 10 },
        },
      },
      // La fille aux cheveux de lin, Rêverie.
      lyrical_song: {
        weight: 16,
        priors: {
          form: { arch_return: 40, mosaic_pairs: 35, period: 25 },
          texture: { chordal_melody: 35, melody_over_ostinato: 35, wash_arpeggio: 20, lush_voicings: 10 },
          palette: { pentatonic: 60, diatonic: 20, modal: 20 },
          tempo: { adagio: 50, andante: 50 },
          contour: { arch: 35, fall: 25, wave: 20, rise: 12, dip: 8 },
        },
      },
      // Golliwogg's Cakewalk, Minstrels.
      playful_wit: {
        weight: 8,
        priors: {
          form: { call_and_response: 40, arch_return: 40, period: 20 },
          key: { Eb_major: 30, Gb_major: 20, G_major: 20, F_major: 15, C_major: 15 },
          meter: { four_four: 80, three_four: 10, six_eight: 10 },
          texture: { stride_dance: 50, scherzo_staccato: 50 },
          palette: { pentatonic: 40, chromatic_approach: 40, blues: 20 },
          tempo: { moderato: 50, allegro: 50 },
          dynamics: { p: 40, mf: 30, f: 30 },
          dynamicShape: { sudden_contrast: 60, terraced: 40 },
          contour: { leap_fall: 25, rise: 20, fall: 20, wave: 20, arch: 15 },
        },
      },
      // Voiles: whole-tone veils over a pedal.
      restless_searching: {
        weight: 6,
        priors: {
          form: { arch_return: 60, mosaic_pairs: 40 },
          texture: { parallel_planing: 60, melody_over_ostinato: 40 },
          palette: { whole_tone: 80, pentatonic: 20 },
          tempo: { andante: 60, adagio: 40 },
          dynamics: { pp: 55, p: 45 },
        },
      },
    },
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
      'American minimalism, c. 1980. Process music: a small cell is stated and then changed a little at a time — a note added, the figure rotated so it starts one note later, a layer doubled in speed — so that nothing is repeated unchanged for long. The harmony is a cycle of two to eight plain chords related by thirds and common tones rather than by function; each pass takes a new inversion and so a new bass, and every eight bars or so a different cycle takes over. Rocking thirds, arpeggio cells and two-against-three cross-rhythms over a slow bass, often under a bare slow melody. Dynamics move in blocks, with sudden terraces instead of a climax. Mostly minor, no leading-tone cadences — pieces stop rather than close. Piano, electric organ, strings, voices.',
    priors: {
      form: { additive_loop: 40, layered_build: 30, arch_return: 18, call_and_response: 12 },
      key: { F_minor: 16, A_minor: 14, D_minor: 12, G_minor: 12, C_minor: 10, E_minor: 10, C_major: 8, F_major: 8, A_major: 4, Eb_major: 3, Ab_major: 3 },
      meter: { four_four: 45, six_eight: 30, three_four: 25 },
      texture: { melody_over_ostinato: 22, minimal_cells: 20, displaced_arpeggio: 14, pulsing_chords: 12, interlocking_hands: 10, wash_arpeggio: 8, toccata_perpetual: 8, broken_chord_prelude: 6 },
      palette: { diatonic: 70, modal: 20, modal_dark: 10 },
      tempo: { moderato: 40, allegro: 25, andante: 25, adagio: 10 },
      dynamics: { mp: 40, mf: 30, p: 25, f: 5 },
      dynamicShape: { terraced: 35, steady: 30, waves: 15, build_then_drop: 20 },
      defaultInstrument: { grand_piano: 55, church_organ: 20, strings: 15, choir: 5, electric_piano: 5 },
      contour: { static: 28, rise: 22, wave: 18, arch: 16, fall: 16 },
    },
    archetypes: {
      hypnotic_pulse: {
        weight: 34,
        priors: {
          form: { additive_loop: 65, layered_build: 35 },
          texture: { minimal_cells: 28, displaced_arpeggio: 22, interlocking_hands: 20, pulsing_chords: 18, broken_chord_prelude: 12 },
          tempo: { moderato: 45, allegro: 40, andante: 15 },
          dynamicShape: { terraced: 35, steady: 35, waves: 15, build_then_drop: 15 },
        },
      },
      // Metamorphosis: a rocking accompaniment under a slow bare melody.
      meditative_stillness: {
        weight: 26,
        priors: {
          form: { additive_loop: 55, arch_return: 30, layered_build: 15 },
          texture: { melody_over_ostinato: 55, minimal_cells: 25, pulsing_chords: 20 },
          tempo: { andante: 50, adagio: 35, largo: 15 },
          dynamics: { p: 50, mp: 35, pp: 15 },
          contour: { static: 35, fall: 30, rise: 20, arch: 15 },
        },
      },
      // Mad Rush's fast sections.
      flowing_perpetual: {
        weight: 16,
        priors: {
          form: { additive_loop: 50, call_and_response: 25, layered_build: 25 },
          texture: { minimal_cells: 30, wash_arpeggio: 25, toccata_perpetual: 25, displaced_arpeggio: 20 },
          tempo: { allegro: 55, presto: 25, moderato: 20 },
          dynamics: { mf: 45, f: 35, mp: 20 },
        },
      },
      solemn_hymn: {
        weight: 14,
        priors: {
          form: { additive_loop: 60, layered_build: 40 },
          texture: { minimal_cells: 30, chorale: 25, pulsing_chords: 25, bell_organum: 20 },
          tempo: { adagio: 50, largo: 30, andante: 20 },
          defaultInstrument: { church_organ: 55, strings: 25, choir: 20 },
        },
      },
      restless_searching: {
        weight: 10,
        priors: {
          form: { layered_build: 50, additive_loop: 50 },
          texture: { pulsing_chords: 45, minimal_cells: 35, tremolo_storm: 20 },
          tempo: { allegro: 60, presto: 40 },
          dynamics: { f: 50, mf: 50 },
        },
      },
    },
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
      'Film-score piano and hybrid texture, c. 2000s–2020s. Slow-building layered ostinatos, simple diatonic or modal loops that escalate, pedal drones, sparse then heroic surges, minor-key gravity, and occasional warm major anthems. Pulse and crescendo drama with a melody riding over the ostinato — cells may thicken, but the piece is a build, not a process of additive rotation. Written for grand piano, strings, and occasionally electric piano.',
    priors: {
      form: { layered_build: 32, additive_loop: 22, vamp_and_tag: 18, arch_return: 16, period: 8, sentence: 4 },
      key: { D_minor: 14, A_minor: 12, C_minor: 12, G_minor: 10, F_minor: 8, E_minor: 6, C_major: 8, Eb_major: 8, F_major: 6, G_major: 6, D_major: 5, Ab_major: 5 },
      meter: { four_four: 70, three_four: 18, six_eight: 12 },
      texture: { melody_over_ostinato: 28, pulsing_chords: 22, dramatic_chords: 16, wash_arpeggio: 12, minimal_cells: 10, chorale: 8, rolling_nocturne: 4 },
      palette: { diatonic: 55, modal: 20, modal_dark: 15, chromatic_approach: 10 },
      tempo: { andante: 30, adagio: 22, moderato: 22, largo: 12, allegro: 10, presto: 4 },
      dynamics: { p: 30, mp: 25, mf: 20, pp: 15, f: 8, ff: 2 },
      dynamicShape: { crescendo: 30, late_surge: 25, build_then_drop: 15, arch: 15, waves: 10, steady: 5 },
      defaultInstrument: { grand_piano: 55, strings: 30, electric_piano: 10, choir: 5 },
      contour: { static: 26, rise: 22, arch: 16, fall: 14, wave: 10, leap_fall: 6, dip: 6 },
    },
    archetypes: {
      // Layered ostinato that thickens without becoming a cell-process étude.
      hypnotic_pulse: {
        weight: 24,
        priors: {
          form: { layered_build: 45, additive_loop: 35, vamp_and_tag: 20 },
          texture: { pulsing_chords: 35, melody_over_ostinato: 30, minimal_cells: 20, wash_arpeggio: 15 },
          tempo: { andante: 40, moderato: 35, adagio: 15, allegro: 10 },
          dynamics: { p: 35, mp: 35, mf: 20, f: 10 },
          dynamicShape: { crescendo: 40, late_surge: 30, waves: 15, build_then_drop: 15 },
          contour: { static: 40, rise: 25, wave: 15, arch: 12, fall: 8 },
        },
      },
      // Warm major anthems.
      heroic_bright: {
        weight: 16,
        priors: {
          form: { layered_build: 40, arch_return: 30, period: 20, sentence: 10 },
          key: { C_major: 22, Eb_major: 18, D_major: 16, G_major: 14, F_major: 12, Ab_major: 10, A_minor: 8 },
          texture: { dramatic_chords: 35, pulsing_chords: 25, chorale: 20, wash_arpeggio: 20 },
          tempo: { moderato: 40, andante: 25, allegro: 25, adagio: 10 },
          dynamics: { mf: 35, f: 25, mp: 20, p: 12, ff: 8 },
          dynamicShape: { crescendo: 35, late_surge: 30, arch: 20, build_then_drop: 15 },
          defaultInstrument: { strings: 40, grand_piano: 40, choir: 15, electric_piano: 5 },
          contour: { rise: 35, arch: 25, leap_fall: 15, fall: 15, static: 10 },
        },
      },
      // Processional cues and hymn-like cues.
      solemn_hymn: {
        weight: 16,
        priors: {
          form: { layered_build: 40, arch_return: 30, vamp_and_tag: 20, period: 10 },
          key: { D_minor: 20, A_minor: 16, C_minor: 14, G_minor: 12, F_minor: 10, Ab_major: 14, Eb_major: 14 },
          texture: { chorale: 35, pulsing_chords: 25, melody_over_ostinato: 25, bell_organum: 15 },
          tempo: { adagio: 40, andante: 35, largo: 20, moderato: 5 },
          dynamics: { p: 40, pp: 25, mp: 25, mf: 10 },
          dynamicShape: { crescendo: 30, late_surge: 25, arch: 25, steady: 20 },
          defaultInstrument: { strings: 35, choir: 25, grand_piano: 30, church_organ: 10 },
          contour: { static: 35, arch: 25, rise: 20, fall: 15, dip: 5 },
        },
      },
      // Sparse drones and held colour.
      meditative_stillness: {
        weight: 16,
        priors: {
          form: { vamp_and_tag: 40, additive_loop: 25, arch_return: 25, layered_build: 10 },
          texture: { melody_over_ostinato: 50, rolling_nocturne: 20, wash_arpeggio: 15, pulsing_chords: 15 },
          tempo: { largo: 40, adagio: 40, andante: 20 },
          dynamics: { pp: 50, p: 40, mp: 10 },
          dynamicShape: { late_surge: 30, steady: 25, crescendo: 25, arch: 20 },
          defaultInstrument: { grand_piano: 45, strings: 35, electric_piano: 15, choir: 5 },
          contour: { static: 45, fall: 20, arch: 15, rise: 12, dip: 8 },
        },
      },
      // Crescendo drama, action cues.
      stormy_drama: {
        weight: 16,
        priors: {
          form: { layered_build: 50, additive_loop: 25, free_fantasia: 15, sentence: 10 },
          key: { D_minor: 22, C_minor: 20, G_minor: 16, F_minor: 14, A_minor: 12, E_minor: 10, Eb_major: 6 },
          texture: { dramatic_chords: 35, pulsing_chords: 25, tremolo_storm: 20, wash_arpeggio: 20 },
          tempo: { allegro: 40, moderato: 30, andante: 15, presto: 15 },
          dynamics: { f: 30, mf: 25, p: 20, ff: 15, mp: 10 },
          dynamicShape: { crescendo: 35, late_surge: 25, build_then_drop: 25, sudden_contrast: 15 },
          contour: { rise: 35, leap_fall: 18, drop_rise: 15, arch: 15, fall: 12, static: 5 },
        },
      },
      // Uneasy cues that keep adding weight.
      restless_searching: {
        weight: 12,
        priors: {
          form: { layered_build: 45, additive_loop: 30, vamp_and_tag: 25 },
          texture: { pulsing_chords: 35, melody_over_ostinato: 30, minimal_cells: 20, dramatic_chords: 15 },
          tempo: { andante: 40, moderato: 30, adagio: 20, allegro: 10 },
          dynamics: { p: 35, mp: 30, mf: 20, pp: 15 },
          dynamicShape: { crescendo: 40, late_surge: 30, waves: 15, build_then_drop: 15 },
          palette: { modal_dark: 35, diatonic: 35, modal: 20, chromatic_approach: 10 },
          contour: { static: 30, rise: 25, wave: 20, fall: 15, arch: 10 },
        },
      },
    },
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
      'Icelandic-Chinese jazz-pop singer-songwriter pianist, 2020s. Warm major-key song forms: a clear singing melody over swinging or lightly syncopated piano — close mid-register chords, gentle broken-chord accompaniment, or a soft stride. Harmony is functional and jazz-tinged — ii–V colour, major sevenths, the occasional chromatic approach — without dense stacked extensions. Intimate, unhurried and romantic; soft dynamics. Acoustic grand piano, sometimes a light electric piano.',
    priors: {
      form: { period: 32, arch_return: 26, vamp_and_tag: 26, call_and_response: 16 },
      key: { F_major: 12, Bb_major: 11, Eb_major: 10, C_major: 10, Ab_major: 8, G_major: 7, A_major: 6, D_major: 5, D_minor: 8, A_minor: 7, C_minor: 6, F_minor: 5, G_minor: 5 },
      meter: { four_four: 62, three_four: 26, six_eight: 12 },
      texture: { chordal_melody: 22, alberti_melody: 18, stride_dance: 16, lush_voicings: 14, rolling_nocturne: 12, aria_walking_bass: 8, syncopated_ostinato: 6, melody_over_ostinato: 4 },
      palette: { diatonic: 50, chromatic_approach: 32, modal: 10, blues: 8 },
      tempo: { andante: 38, adagio: 28, moderato: 22, largo: 8, allegro: 4 },
      dynamics: { p: 42, mp: 32, pp: 16, mf: 10 },
      dynamicShape: { arch: 35, waves: 25, steady: 20, decrescendo: 12, terraced: 8 },
      defaultInstrument: { grand_piano: 82, electric_piano: 18 },
      contour: { arch: 26, fall: 20, wave: 16, rise: 14, dip: 10, leap_fall: 8, static: 6 },
    },
    archetypes: {
      // Standards-shaped songs: a sung tune over piano accompaniment.
      lyrical_song: {
        weight: 32,
        priors: {
          form: { period: 50, arch_return: 35, vamp_and_tag: 15 },
          texture: { chordal_melody: 40, alberti_melody: 30, rolling_nocturne: 20, lush_voicings: 10 },
          meter: { four_four: 60, three_four: 30, six_eight: 10 },
          tempo: { adagio: 40, andante: 45, largo: 15 },
          dynamics: { p: 50, mp: 35, pp: 15 },
          dynamicShape: { arch: 45, waves: 30, steady: 25 },
          contour: { arch: 35, fall: 25, wave: 20, rise: 12, dip: 8 },
        },
      },
      // Light swing and bossa-adjacent groove; still a song, not a vamp miniature.
      warm_groove: {
        weight: 28,
        priors: {
          form: { vamp_and_tag: 45, call_and_response: 30, period: 25 },
          meter: { four_four: 80, six_eight: 20 },
          texture: { stride_dance: 35, lush_voicings: 25, alberti_melody: 20, syncopated_ostinato: 20 },
          palette: { diatonic: 40, chromatic_approach: 35, blues: 15, modal: 10 },
          tempo: { andante: 45, moderato: 40, adagio: 15 },
          dynamics: { mp: 50, p: 30, mf: 20 },
          defaultInstrument: { grand_piano: 70, electric_piano: 30 },
          contour: { wave: 24, arch: 22, leap_fall: 18, rise: 16, fall: 14, dip: 6 },
        },
      },
      dreamy_haze: {
        weight: 18,
        priors: {
          form: { arch_return: 45, vamp_and_tag: 35, period: 20 },
          texture: { rolling_nocturne: 35, chordal_melody: 30, lush_voicings: 20, melody_over_ostinato: 15 },
          tempo: { adagio: 50, andante: 35, largo: 15 },
          dynamics: { p: 45, pp: 35, mp: 20 },
          palette: { diatonic: 40, chromatic_approach: 30, modal: 30 },
          contour: { arch: 28, fall: 24, wave: 20, static: 16, dip: 12 },
        },
      },
      playful_wit: {
        weight: 14,
        priors: {
          form: { call_and_response: 40, period: 30, vamp_and_tag: 30 },
          meter: { four_four: 55, three_four: 35, six_eight: 10 },
          texture: { stride_dance: 40, scherzo_staccato: 25, alberti_melody: 20, aria_walking_bass: 15 },
          tempo: { moderato: 50, allegro: 35, andante: 15 },
          dynamics: { mp: 45, mf: 35, p: 20 },
          dynamicShape: { terraced: 40, waves: 30, sudden_contrast: 30 },
          contour: { leap_fall: 24, wave: 22, rise: 18, fall: 18, arch: 18 },
        },
      },
      meditative_stillness: {
        weight: 8,
        priors: {
          form: { arch_return: 40, vamp_and_tag: 35, period: 25 },
          texture: { rolling_nocturne: 40, melody_over_ostinato: 35, chordal_melody: 25 },
          tempo: { largo: 50, adagio: 50 },
          dynamics: { pp: 55, p: 45 },
          dynamicShape: { steady: 40, arch: 35, decrescendo: 25 },
          contour: { static: 35, arch: 30, fall: 25, rise: 10 },
        },
      },
    },
    holds: true,
    harmony: {
      major: {
        // Song-form jazz-pop: I–vi–ii–V and inverted ii–V–I. No I–V–vi–IV.
        heads: [['Imaj7', 'vi7'], ['I', 'I6'], ['Imaj7', 'ii7'], ['I', 'vi'], ['I6', 'ii65'], ['Imaj7', 'iii7'], ['I', 'V65'], ['Imaj7', 'IVmaj7'], ['vi7', 'ii7']],
        seqs: [['ii7', 'V7'], ['vi7', 'ii7'], ['iii7', 'vi7'], ['V7_of_ii', 'ii7'], ['V7_of_vi', 'vi7'], ['IVmaj7', 'iii7'], ['ii65', 'V7'], ['V43', 'I6'], ['V7_of_V', 'V7'], ['iii7', 'V7_of_ii']],
        tails: {
          closed: [['V7', 'I'], ['V65', 'I'], ['V7', 'Imaj7'], ['V43', 'I'], ['IVmaj7', 'I']],
          half: [['ii7', 'V7'], ['ii65', 'V'], ['IVmaj7', 'V7'], ['vi7', 'V'], ['V7_of_V', 'V']],
          open: [['V7', 'vi'], ['V42', 'I6'], ['IVmaj7', 'iii7'], ['vi7', 'ii7'], ['V7_of_IV', 'IV']],
        },
        phrases: {
          closed: [['ii7', 'V7', 'Imaj7', 'I'], ['I6', 'ii65', 'V7', 'I'], ['V43', 'I6', 'V7', 'I'], ['ii65', 'I64', 'V7', 'I'], ['vi7', 'ii7', 'V7', 'Imaj7']],
          half: [['Imaj7', 'vi7', 'ii7', 'V7'], ['I', 'I6', 'ii65', 'V'], ['Imaj7', 'iii7', 'ii7', 'V7'], ['I', 'V7_of_vi', 'vi7', 'V7_of_ii']],
          open: [['Imaj7', 'vi7', 'IVmaj7', 'iii7'], ['I', 'V65', 'I6', 'IV'], ['Imaj7', 'iii7', 'vi7', 'ii7'], ['vi7', 'ii7', 'V7', 'vi7']],
        },
        loops: [['Imaj7', 'vi7', 'ii7', 'V7'], ['I', 'I6', 'ii65', 'V7'], ['ii7', 'V7'], ['Imaj7', 'iii7'], ['I6', 'ii65', 'V43', 'I'], ['Imaj7', 'vi7']],
        pedals: [['I', 'IV64', 'I', 'IV64'], ['V7sus4', 'V7', 'V7sus4', 'V7']],
        codas: [['ii7', 'V7', 'Imaj7', 'I6_9'], ['IVmaj7', 'I64', 'V7', 'I'], ['vi7', 'ii7', 'V7', 'Imaj7']],
        finals: ['I', 'Imaj7', 'I6_9', 'Iadd9'],
        splits: [['ii7', 'V7'], ['ii65', 'V'], ['ii7', 'V65'], ['IVmaj7', 'V7'], ['vi7', 'V7']], // ii–V in one bar, the standards' turnaround pace,
        surprises: ['bII7', 'iv', 'V7_of_vi', 'sharp_i_dim7', 'bVIImaj7'],
        subs: { Imaj7: ['I', 'I6', 'Iadd9'], I: ['I6', 'Imaj7'], vi7: ['vi', 'vi6'], ii7: ['ii65', 'ii9'], V7: ['V65', 'V43', 'V7sus4'], IVmaj7: ['IV', 'IV6'] },
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
      'Contemporary jazz-trained pianist-producer, 2020s, whose solo piano miniatures blend jazz, impressionism and psychedelic soul. Flowing arpeggio patterns whose accents are displaced into uneven groups, modal mixture (chords borrowed from the parallel minor set against the major), melodies carried on top of close chords with moving inner voices, short loops that are varied rather than developed, colour-chord endings left hanging. Soft and unhurried. Acoustic piano, Wurlitzer electric piano, ambient pads.',
    priors: {
      form: { vamp_and_tag: 40, arch_return: 25, mosaic_pairs: 12, additive_loop: 10, free_fantasia: 8, period: 5 },
      key: { C_major: 12, Db_major: 10, D_major: 10, E_major: 10, B_major: 8, Ab_major: 8, Eb_major: 8, F_major: 6, G_major: 5, Fs_minor: 10, C_minor: 6, F_minor: 4, Cs_minor: 3 },
      meter: { three_four: 35, four_four: 45, six_eight: 20 },
      texture: { displaced_arpeggio: 25, chordal_melody: 22, lush_voicings: 18, melody_over_ostinato: 12, wash_arpeggio: 10, rolling_nocturne: 5, stride_dance: 4, syncopated_ostinato: 4 },
      palette: { pentatonic: 35, diatonic: 20, blues: 15, chromatic_approach: 15, modal: 15 },
      tempo: { andante: 40, adagio: 30, moderato: 25, largo: 5 },
      dynamics: { p: 45, mp: 35, pp: 15, mf: 5 },
      dynamicShape: { arch: 35, waves: 25, steady: 20, decrescendo: 20 },
      defaultInstrument: { grand_piano: 55, electric_piano: 35, strings: 5, choir: 5 },
      contour: { arch: 22, fall: 20, wave: 18, rise: 14, static: 10, leap_fall: 8, dip: 8 },
    },
    archetypes: {
      dreamy_haze: {
        weight: 28,
        priors: {
          form: { vamp_and_tag: 45, arch_return: 25, mosaic_pairs: 15, free_fantasia: 15 },
          meter: { three_four: 40, four_four: 40, six_eight: 20 },
          texture: { displaced_arpeggio: 40, wash_arpeggio: 25, chordal_melody: 20, lush_voicings: 15 },
          tempo: { andante: 50, moderato: 30, adagio: 20 },
          dynamics: { p: 50, mp: 35, pp: 15 },
        },
      },
      lyrical_song: {
        weight: 24,
        priors: {
          form: { arch_return: 45, vamp_and_tag: 35, period: 20 },
          texture: { chordal_melody: 45, lush_voicings: 30, melody_over_ostinato: 25 },
          tempo: { adagio: 45, andante: 45, largo: 10 },
          contour: { arch: 32, fall: 25, wave: 20, rise: 13, dip: 10 },
        },
      },
      // The neo-soul side: a secondary flavour in his bios, mostly in production work.
      warm_groove: {
        weight: 20,
        priors: {
          form: { vamp_and_tag: 70, call_and_response: 30 },
          meter: { four_four: 75, six_eight: 25 },
          texture: { lush_voicings: 45, syncopated_ostinato: 20, stride_dance: 20, pulsing_chords: 15 },
          palette: { pentatonic: 40, blues: 35, chromatic_approach: 25 },
          tempo: { andante: 50, moderato: 40, adagio: 10 },
          defaultInstrument: { electric_piano: 65, grand_piano: 35 },
          dynamics: { mp: 50, p: 30, mf: 20 },
        },
      },
      flowing_perpetual: {
        weight: 16,
        priors: {
          form: { vamp_and_tag: 40, additive_loop: 30, arch_return: 30 },
          texture: { displaced_arpeggio: 60, rolling_nocturne: 20, minimal_cells: 20 },
          tempo: { moderato: 55, andante: 30, allegro: 15 },
          contour: { wave: 30, arch: 25, rise: 20, fall: 15, static: 10 },
        },
      },
      // The ambient keyboard records.
      meditative_stillness: {
        weight: 12,
        priors: {
          form: { vamp_and_tag: 40, additive_loop: 30, mosaic_pairs: 30 },
          texture: { melody_over_ostinato: 40, lush_voicings: 30, wash_arpeggio: 30 },
          tempo: { largo: 45, adagio: 55 },
          dynamics: { pp: 55, p: 45 },
          dynamicShape: { steady: 35, arch: 35, decrescendo: 30 },
          defaultInstrument: { electric_piano: 40, grand_piano: 30, strings: 15, choir: 15 },
        },
      },
    },
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
