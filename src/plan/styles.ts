// Per-style knowledge that lives in CODE, not in Jev.
//
//  • `brief`   — optional prose handed to Jev as state (toggle in the UI). With
//                the brief off, Jev only sees the style's name: the purest test
//                of whether it can steer on its own.
//  • `priors`  — weights the offline HeuristicPlanner samples from, and the
//                yardstick for its stub style-match score.
//  • `progressions` / `forms` — hand-written harmonic and phrase templates the
//                HeuristicPlanner picks between. JevPlanner never reads these;
//                it chooses chords bar by bar from the full CHORDS table.

import type {
  BarCountId,
  BarRoleId,
  ChordId,
  ContourId,
  DynamicId,
  DynamicShapeId,
  InstrumentId,
  KeyId,
  MeterId,
  PaletteId,
  StyleId,
  TempoId,
  TextureId,
} from './schema.js'

export type Weights<K extends string> = Partial<Record<K, number>>

export interface StylePriors {
  key: Weights<KeyId>
  meter: Weights<MeterId>
  texture: Weights<TextureId>
  palette: Weights<PaletteId>
  tempo: Weights<TempoId>
  dynamics: Weights<DynamicId>
  dynamicShape: Weights<DynamicShapeId>
  defaultInstrument: Weights<InstrumentId>
  barCount: Weights<BarCountId>
  contour: Weights<ContourId>
}

type ByLength = { 4: ChordId[][]; 8: ChordId[][]; 16: ChordId[][]; 32: ChordId[][] }

export interface StyleProfile {
  brief: string
  priors: StylePriors
  progressions: { major: ByLength; minor: ByLength }
  forms: { 4: BarRoleId[][]; 8: BarRoleId[][]; 16: BarRoleId[][]; 32: BarRoleId[][] }
}

export const STYLE_PROFILES: Record<StyleId, StyleProfile> = {
  bach: {
    brief:
      'German Baroque keyboard music, c. 1720. Strict functional harmony driven by circle-of-fifths motion and clear dominant–tonic cadences. Textures are contrapuntal or chorale-like with continuous even motion. Dynamics change in blocks, not swells. Written for harpsichord and organ.',
    priors: {
      key: { C_major: 14, G_major: 9, D_major: 9, F_major: 7, Bb_major: 5, D_minor: 14, G_minor: 10, C_minor: 10, A_minor: 8, E_minor: 6, B_minor: 8 },
      meter: { four_four: 60, three_four: 25, six_eight: 15 },
      texture: { two_voice_counterpoint: 36, broken_chord_prelude: 34, chorale: 30 },
      palette: { diatonic: 60, chromatic_approach: 40 },
      tempo: { andante: 30, moderato: 40, allegro: 30 },
      dynamics: { mf: 50, mp: 20, f: 30 },
      dynamicShape: { terraced: 60, steady: 40 },
      defaultInstrument: { harpsichord: 45, church_organ: 30, grand_piano: 25 },
      barCount: { '8': 49, '4': 30, '16': 14, '32': 7 },
      contour: { rise: 30, fall: 30, arch: 25, dip: 10, static: 5 },
    },
    progressions: {
      major: {
        4: [
          ['I', 'ii7', 'V7', 'I'],
          ['I', 'IV', 'V7', 'I'],
          ['I', 'vi', 'V7', 'I'],
        ],
        8: [
          ['I', 'IV', 'vii_dim', 'I', 'vi', 'ii7', 'V7', 'I'],
          ['I', 'vi', 'ii7', 'V7', 'I', 'IV', 'V7', 'I'],
          ['I', 'ii7', 'V7', 'I', 'vi', 'IV', 'V7', 'I'],
          ['I', 'V', 'vi', 'iii', 'IV', 'ii7', 'V7', 'I'],
        ],

        16: [

          ['I', 'IV', 'vii_dim', 'I', 'vi', 'ii7', 'V7', 'I', 'I', 'vi', 'ii7', 'V7', 'I', 'IV', 'V7', 'I'],

          ['I', 'vi', 'ii7', 'V7', 'I', 'IV', 'V7', 'I', 'I', 'IV', 'vii_dim', 'I', 'vi', 'ii7', 'V7', 'I'],

        ],

        32: [

          ['I', 'IV', 'vii_dim', 'I', 'vi', 'ii7', 'V7', 'I', 'I', 'vi', 'ii7', 'V7', 'I', 'IV', 'V7', 'I', 'I', 'vi', 'ii7', 'V7', 'I', 'IV', 'V7', 'I', 'I', 'IV', 'vii_dim', 'I', 'vi', 'ii7', 'V7', 'I'],

          ['I', 'IV', 'vii_dim', 'I', 'vi', 'ii7', 'V7', 'I', 'I', 'IV', 'vii_dim', 'I', 'vi', 'ii7', 'V7', 'I', 'I', 'vi', 'ii7', 'V7', 'I', 'IV', 'V7', 'I', 'I', 'vi', 'ii7', 'V7', 'I', 'IV', 'V7', 'I'],

        ],
      },
      minor: {
        4: [
          ['i', 'iv', 'V7', 'i'],
          ['i', 'ii_half_dim7', 'V7', 'i'],
          ['i', 'iv', 'vii_dim7', 'i'],
        ],
        8: [
          ['i', 'iv', 'bVII', 'bIII', 'bVI', 'ii_half_dim7', 'V7', 'i'],
          ['i', 'iv', 'V7', 'i', 'bVI', 'ii_half_dim7', 'V7', 'i'],
          ['i', 'ii_half_dim7', 'V7', 'i', 'bIII', 'iv', 'V7', 'i'],
        ],

        16: [

          ['i', 'iv', 'bVII', 'bIII', 'bVI', 'ii_half_dim7', 'V7', 'i', 'i', 'iv', 'V7', 'i', 'bVI', 'ii_half_dim7', 'V7', 'i'],

          ['i', 'iv', 'V7', 'i', 'bVI', 'ii_half_dim7', 'V7', 'i', 'i', 'iv', 'bVII', 'bIII', 'bVI', 'ii_half_dim7', 'V7', 'i'],

        ],

        32: [

          ['i', 'iv', 'bVII', 'bIII', 'bVI', 'ii_half_dim7', 'V7', 'i', 'i', 'iv', 'V7', 'i', 'bVI', 'ii_half_dim7', 'V7', 'i', 'i', 'iv', 'V7', 'i', 'bVI', 'ii_half_dim7', 'V7', 'i', 'i', 'iv', 'bVII', 'bIII', 'bVI', 'ii_half_dim7', 'V7', 'i'],

          ['i', 'iv', 'bVII', 'bIII', 'bVI', 'ii_half_dim7', 'V7', 'i', 'i', 'iv', 'bVII', 'bIII', 'bVI', 'ii_half_dim7', 'V7', 'i', 'i', 'iv', 'V7', 'i', 'bVI', 'ii_half_dim7', 'V7', 'i', 'i', 'iv', 'V7', 'i', 'bVI', 'ii_half_dim7', 'V7', 'i'],

        ],
      },
    },
    forms: {
      4: [
        ['statement', 'development', 'climax', 'cadence'],
        ['statement', 'restatement', 'development', 'cadence'],
      ],
      8: [
        ['statement', 'restatement', 'development', 'half_cadence', 'statement', 'development', 'climax', 'cadence'],
        ['statement', 'development', 'development', 'half_cadence', 'restatement', 'development', 'climax', 'cadence'],
      ],

      16: [

        ['statement', 'restatement', 'development', 'half_cadence', 'statement', 'development', 'climax', 'cadence', 'restatement', 'development', 'contrast', 'half_cadence', 'development', 'climax', 'development', 'cadence'],

        ['statement', 'development', 'development', 'half_cadence', 'restatement', 'contrast', 'climax', 'cadence', 'statement', 'restatement', 'development', 'contrast', 'development', 'development', 'climax', 'cadence'],

      ],

      32: [

        ['statement', 'restatement', 'development', 'half_cadence', 'statement', 'development', 'climax', 'cadence', 'restatement', 'development', 'contrast', 'half_cadence', 'development', 'climax', 'development', 'cadence', 'statement', 'restatement', 'development', 'half_cadence', 'contrast', 'development', 'climax', 'cadence', 'restatement', 'development', 'contrast', 'half_cadence', 'development', 'climax', 'development', 'cadence'],

        ['statement', 'development', 'contrast', 'half_cadence', 'restatement', 'development', 'climax', 'cadence', 'statement', 'restatement', 'development', 'contrast', 'development', 'development', 'climax', 'cadence', 'restatement', 'contrast', 'development', 'half_cadence', 'statement', 'development', 'climax', 'cadence', 'development', 'restatement', 'contrast', 'development', 'development', 'climax', 'half_cadence', 'cadence'],

      ],
    },
  },

  beethoven: {
    brief:
      'Viennese Classical-to-Romantic piano music, c. 1800. Tonic–dominant harmony pushed to extremes: short rhythmic mottos, diminished-seventh shocks, long crescendos and sudden subito contrasts with sforzando accents. Either stormy block chords over octaves or a lyrical melody over a broken-chord bass. Written for the piano.',
    priors: {
      key: { C_minor: 25, F_minor: 10, D_minor: 10, G_minor: 4, Eb_major: 15, C_major: 10, Ab_major: 8, G_major: 5, A_major: 5, E_major: 4 },
      meter: { four_four: 55, three_four: 30, six_eight: 15 },
      texture: { dramatic_chords: 45, alberti_melody: 40, chorale: 8, broken_chord_prelude: 7 },
      palette: { diatonic: 50, chromatic_approach: 50 },
      tempo: { allegro: 40, presto: 15, adagio: 20, moderato: 15, andante: 10 },
      dynamics: { f: 35, ff: 20, p: 25, mf: 20 },
      dynamicShape: { sudden_contrast: 55, crescendo: 25, arch: 10, steady: 10 },
      defaultInstrument: { grand_piano: 85, strings: 15 },
      barCount: { '8': 53, '4': 25, '16': 15, '32': 7 },
      contour: { rise: 35, fall: 25, arch: 25, dip: 5, static: 10 },
    },
    progressions: {
      major: {
        4: [
          ['I', 'IV', 'V7', 'I'],
          ['I', 'V7', 'V7', 'I'],
        ],
        8: [
          ['I', 'V7', 'I', 'IV', 'I', 'ii', 'V7', 'I'],
          ['I', 'I', 'V7', 'V7', 'vi', 'IV', 'V7', 'I'],
          ['I', 'IV', 'I', 'V', 'vi', 'ii', 'V7', 'I'],
        ],

        16: [

          ['I', 'V7', 'I', 'IV', 'I', 'ii', 'V7', 'I', 'I', 'I', 'V7', 'V7', 'vi', 'IV', 'V7', 'I'],

          ['I', 'I', 'V7', 'V7', 'vi', 'IV', 'V7', 'I', 'I', 'V7', 'I', 'IV', 'I', 'ii', 'V7', 'I'],

        ],

        32: [

          ['I', 'V7', 'I', 'IV', 'I', 'ii', 'V7', 'I', 'I', 'I', 'V7', 'V7', 'vi', 'IV', 'V7', 'I', 'I', 'I', 'V7', 'V7', 'vi', 'IV', 'V7', 'I', 'I', 'V7', 'I', 'IV', 'I', 'ii', 'V7', 'I'],

          ['I', 'V7', 'I', 'IV', 'I', 'ii', 'V7', 'I', 'I', 'V7', 'I', 'IV', 'I', 'ii', 'V7', 'I', 'I', 'I', 'V7', 'V7', 'vi', 'IV', 'V7', 'I', 'I', 'I', 'V7', 'V7', 'vi', 'IV', 'V7', 'I'],

        ],
      },
      minor: {
        4: [
          ['i', 'vii_dim7', 'V7', 'i'],
          ['i', 'iv', 'V7', 'i'],
        ],
        8: [
          ['i', 'V7', 'i', 'vii_dim7', 'i', 'iv', 'V7', 'i'],
          ['i', 'i', 'V7', 'V7', 'bVI', 'iv', 'V7', 'i'],
          ['i', 'vii_dim7', 'i', 'bVI', 'iv', 'ii_half_dim7', 'V7', 'i'],
        ],

        16: [

          ['i', 'V7', 'i', 'vii_dim7', 'i', 'iv', 'V7', 'i', 'i', 'i', 'V7', 'V7', 'bVI', 'iv', 'V7', 'i'],

          ['i', 'i', 'V7', 'V7', 'bVI', 'iv', 'V7', 'i', 'i', 'V7', 'i', 'vii_dim7', 'i', 'iv', 'V7', 'i'],

        ],

        32: [

          ['i', 'V7', 'i', 'vii_dim7', 'i', 'iv', 'V7', 'i', 'i', 'i', 'V7', 'V7', 'bVI', 'iv', 'V7', 'i', 'i', 'i', 'V7', 'V7', 'bVI', 'iv', 'V7', 'i', 'i', 'V7', 'i', 'vii_dim7', 'i', 'iv', 'V7', 'i'],

          ['i', 'V7', 'i', 'vii_dim7', 'i', 'iv', 'V7', 'i', 'i', 'V7', 'i', 'vii_dim7', 'i', 'iv', 'V7', 'i', 'i', 'i', 'V7', 'V7', 'bVI', 'iv', 'V7', 'i', 'i', 'i', 'V7', 'V7', 'bVI', 'iv', 'V7', 'i'],

        ],
      },
    },
    forms: {
      4: [['statement', 'restatement', 'climax', 'cadence']],
      8: [
        ['statement', 'restatement', 'development', 'half_cadence', 'contrast', 'development', 'climax', 'cadence'],
        ['statement', 'restatement', 'contrast', 'half_cadence', 'development', 'development', 'climax', 'cadence'],
      ],

      16: [

        ['statement', 'restatement', 'development', 'half_cadence', 'statement', 'development', 'climax', 'cadence', 'restatement', 'development', 'contrast', 'half_cadence', 'development', 'climax', 'development', 'cadence'],

        ['statement', 'development', 'development', 'half_cadence', 'restatement', 'contrast', 'climax', 'cadence', 'statement', 'restatement', 'development', 'contrast', 'development', 'development', 'climax', 'cadence'],

      ],

      32: [

        ['statement', 'restatement', 'development', 'half_cadence', 'statement', 'development', 'climax', 'cadence', 'restatement', 'development', 'contrast', 'half_cadence', 'development', 'climax', 'development', 'cadence', 'statement', 'restatement', 'development', 'half_cadence', 'contrast', 'development', 'climax', 'cadence', 'restatement', 'development', 'contrast', 'half_cadence', 'development', 'climax', 'development', 'cadence'],

        ['statement', 'development', 'contrast', 'half_cadence', 'restatement', 'development', 'climax', 'cadence', 'statement', 'restatement', 'development', 'contrast', 'development', 'development', 'climax', 'cadence', 'restatement', 'contrast', 'development', 'half_cadence', 'statement', 'development', 'climax', 'cadence', 'development', 'restatement', 'contrast', 'development', 'development', 'climax', 'half_cadence', 'cadence'],

      ],
    },
  },

  debussy: {
    brief:
      'French Impressionist piano music, c. 1905. Harmony is colour, not function: chords glide in parallel, whole-tone and pentatonic scales blur the key, ninths and augmented triads hang unresolved. Soft, pedalled, slow, with gentle swells. Dominant–tonic cadences are avoided.',
    priors: {
      key: { Db_major: 20, E_major: 12, Ab_major: 10, F_major: 8, C_major: 8, G_major: 6, Eb_major: 6, Fs_minor: 10, A_minor: 8, B_minor: 6, E_minor: 6 },
      meter: { six_eight: 35, three_four: 35, four_four: 30 },
      texture: { parallel_planing: 45, wash_arpeggio: 45, lush_voicings: 5, minimal_cells: 5 },
      palette: { whole_tone: 35, pentatonic: 35, modal: 25, diatonic: 5 },
      tempo: { adagio: 40, andante: 35, largo: 20, moderato: 5 },
      dynamics: { pp: 45, p: 40, mp: 15 },
      dynamicShape: { arch: 55, decrescendo: 20, steady: 15, crescendo: 10 },
      defaultInstrument: { grand_piano: 80, strings: 10, choir: 10 },
      barCount: { '8': 42, '4': 40, '16': 12, '32': 6 },
      contour: { arch: 35, fall: 25, dip: 15, rise: 15, static: 10 },
    },
    progressions: {
      major: {
        4: [
          ['Imaj9', 'bVII', 'bVImaj7', 'Iadd9'],
          ['Iadd9', 'I_aug', 'IVmaj7s11', 'Imaj9'],
        ],
        8: [
          ['Imaj7', 'bVII', 'Imaj7', 'IVmaj7s11', 'I_aug', 'bVImaj7', 'bIImaj7', 'Iadd9'],
          ['Iadd9', 'bIIImaj7', 'IVmaj9', 'I_aug', 'vi9', 'bVII', 'V9', 'Imaj9'],
          ['Isus2', 'bVII', 'bVImaj7', 'bVII', 'Imaj9', 'V_aug', 'IVmaj7s11', 'Iadd9'],
        ],

        16: [

          ['Imaj7', 'bVII', 'Imaj7', 'IVmaj7s11', 'I_aug', 'bVImaj7', 'bIImaj7', 'Iadd9', 'Iadd9', 'bIIImaj7', 'IVmaj9', 'I_aug', 'vi9', 'bVII', 'V9', 'Imaj9'],

          ['Iadd9', 'bIIImaj7', 'IVmaj9', 'I_aug', 'vi9', 'bVII', 'V9', 'Imaj9', 'Imaj7', 'bVII', 'Imaj7', 'IVmaj7s11', 'I_aug', 'bVImaj7', 'bIImaj7', 'Iadd9'],

        ],

        32: [

          ['Imaj7', 'bVII', 'Imaj7', 'IVmaj7s11', 'I_aug', 'bVImaj7', 'bIImaj7', 'Iadd9', 'Iadd9', 'bIIImaj7', 'IVmaj9', 'I_aug', 'vi9', 'bVII', 'V9', 'Imaj9', 'Iadd9', 'bIIImaj7', 'IVmaj9', 'I_aug', 'vi9', 'bVII', 'V9', 'Imaj9', 'Imaj7', 'bVII', 'Imaj7', 'IVmaj7s11', 'I_aug', 'bVImaj7', 'bIImaj7', 'Iadd9'],

          ['Imaj7', 'bVII', 'Imaj7', 'IVmaj7s11', 'I_aug', 'bVImaj7', 'bIImaj7', 'Iadd9', 'Imaj7', 'bVII', 'Imaj7', 'IVmaj7s11', 'I_aug', 'bVImaj7', 'bIImaj7', 'Iadd9', 'Iadd9', 'bIIImaj7', 'IVmaj9', 'I_aug', 'vi9', 'bVII', 'V9', 'Imaj9', 'Iadd9', 'bIIImaj7', 'IVmaj9', 'I_aug', 'vi9', 'bVII', 'V9', 'Imaj9'],

        ],
      },
      minor: {
        4: [['i_add9', 'bVII', 'bVImaj7', 'i9']],
        8: [
          ['i_add9', 'bVII', 'bVImaj7', 'bVII', 'i9', 'iv7', 'bIImaj7', 'i_add9'],
          ['i_add9', 'bIIImaj7', 'bVImaj9', 'V_aug', 'i9', 'bVII', 'bVImaj7', 'i_add9'],
        ],

        16: [

          ['i_add9', 'bVII', 'bVImaj7', 'bVII', 'i9', 'iv7', 'bIImaj7', 'i_add9', 'i_add9', 'bIIImaj7', 'bVImaj9', 'V_aug', 'i9', 'bVII', 'bVImaj7', 'i_add9'],

          ['i_add9', 'bIIImaj7', 'bVImaj9', 'V_aug', 'i9', 'bVII', 'bVImaj7', 'i_add9', 'i_add9', 'bVII', 'bVImaj7', 'bVII', 'i9', 'iv7', 'bIImaj7', 'i_add9'],

        ],

        32: [

          ['i_add9', 'bVII', 'bVImaj7', 'bVII', 'i9', 'iv7', 'bIImaj7', 'i_add9', 'i_add9', 'bIIImaj7', 'bVImaj9', 'V_aug', 'i9', 'bVII', 'bVImaj7', 'i_add9', 'i_add9', 'bIIImaj7', 'bVImaj9', 'V_aug', 'i9', 'bVII', 'bVImaj7', 'i_add9', 'i_add9', 'bVII', 'bVImaj7', 'bVII', 'i9', 'iv7', 'bIImaj7', 'i_add9'],

          ['i_add9', 'bVII', 'bVImaj7', 'bVII', 'i9', 'iv7', 'bIImaj7', 'i_add9', 'i_add9', 'bVII', 'bVImaj7', 'bVII', 'i9', 'iv7', 'bIImaj7', 'i_add9', 'i_add9', 'bIIImaj7', 'bVImaj9', 'V_aug', 'i9', 'bVII', 'bVImaj7', 'i_add9', 'i_add9', 'bIIImaj7', 'bVImaj9', 'V_aug', 'i9', 'bVII', 'bVImaj7', 'i_add9'],

        ],
      },
    },
    forms: {
      4: [['statement', 'contrast', 'climax', 'cadence']],
      8: [
        ['statement', 'restatement', 'contrast', 'development', 'climax', 'contrast', 'half_cadence', 'cadence'],
        ['statement', 'contrast', 'restatement', 'development', 'climax', 'restatement', 'contrast', 'cadence'],
      ],

      16: [

        ['statement', 'restatement', 'development', 'half_cadence', 'statement', 'development', 'climax', 'cadence', 'restatement', 'development', 'contrast', 'half_cadence', 'development', 'climax', 'development', 'cadence'],

        ['statement', 'development', 'development', 'half_cadence', 'restatement', 'contrast', 'climax', 'cadence', 'statement', 'restatement', 'development', 'contrast', 'development', 'development', 'climax', 'cadence'],

      ],

      32: [

        ['statement', 'restatement', 'development', 'half_cadence', 'statement', 'development', 'climax', 'cadence', 'restatement', 'development', 'contrast', 'half_cadence', 'development', 'climax', 'development', 'cadence', 'statement', 'restatement', 'development', 'half_cadence', 'contrast', 'development', 'climax', 'cadence', 'restatement', 'development', 'contrast', 'half_cadence', 'development', 'climax', 'development', 'cadence'],

        ['statement', 'development', 'contrast', 'half_cadence', 'restatement', 'development', 'climax', 'cadence', 'statement', 'restatement', 'development', 'contrast', 'development', 'development', 'climax', 'cadence', 'restatement', 'contrast', 'development', 'half_cadence', 'statement', 'development', 'climax', 'cadence', 'development', 'restatement', 'contrast', 'development', 'development', 'climax', 'half_cadence', 'cadence'],

      ],
    },
  },

  glass: {
    brief:
      'American minimalism, c. 1980. A handful of plain triads cycling in a loop; arpeggio cells repeated many times with a motoric steady pulse, two-against-three cross-rhythms, and slow additive change instead of melody or development. Mostly minor keys, even dynamics. Piano, organ or strings.',
    priors: {
      key: { A_minor: 20, E_minor: 15, D_minor: 15, C_minor: 12, G_minor: 8, F_minor: 8, B_minor: 4, C_major: 8, F_major: 6, Eb_major: 4 },
      meter: { four_four: 40, six_eight: 35, three_four: 25 },
      texture: { minimal_cells: 80, broken_chord_prelude: 10, wash_arpeggio: 5, syncopated_ostinato: 5 },
      palette: { diatonic: 85, modal: 10, pentatonic: 5 },
      tempo: { allegro: 40, moderato: 35, andante: 20, presto: 5 },
      dynamics: { mp: 40, mf: 35, p: 25 },
      dynamicShape: { steady: 45, arch: 25, crescendo: 20, terraced: 10 },
      defaultInstrument: { grand_piano: 50, church_organ: 20, strings: 20, choir: 5, electric_piano: 5 },
      barCount: { '8': 60, '4': 15, '16': 17, '32': 8 },
      contour: { static: 55, arch: 20, rise: 15, fall: 10 },
    },
    progressions: {
      major: {
        4: [['I', 'vi', 'IV', 'V']],
        8: [
          ['I', 'vi', 'IV', 'V', 'I', 'vi', 'IV', 'I'],
          ['I', 'iii', 'vi', 'IV', 'I', 'iii', 'vi', 'I'],
        ],

        16: [

          ['I', 'vi', 'IV', 'V', 'I', 'vi', 'IV', 'I', 'I', 'iii', 'vi', 'IV', 'I', 'iii', 'vi', 'I'],

          ['I', 'iii', 'vi', 'IV', 'I', 'iii', 'vi', 'I', 'I', 'vi', 'IV', 'V', 'I', 'vi', 'IV', 'I'],

        ],

        32: [

          ['I', 'vi', 'IV', 'V', 'I', 'vi', 'IV', 'I', 'I', 'iii', 'vi', 'IV', 'I', 'iii', 'vi', 'I', 'I', 'iii', 'vi', 'IV', 'I', 'iii', 'vi', 'I', 'I', 'vi', 'IV', 'V', 'I', 'vi', 'IV', 'I'],

          ['I', 'vi', 'IV', 'V', 'I', 'vi', 'IV', 'I', 'I', 'vi', 'IV', 'V', 'I', 'vi', 'IV', 'I', 'I', 'iii', 'vi', 'IV', 'I', 'iii', 'vi', 'I', 'I', 'iii', 'vi', 'IV', 'I', 'iii', 'vi', 'I'],

        ],
      },
      minor: {
        4: [
          ['i', 'bVI', 'bIII', 'bVII'],
          ['i', 'bVII', 'bVI', 'V'],
        ],
        8: [
          ['i', 'bVI', 'bIII', 'bVII', 'i', 'bVI', 'bIII', 'i'],
          ['i', 'bVII', 'bVI', 'bVII', 'i', 'bVII', 'bVI', 'i'],
          ['i', 'i', 'bVI', 'bVI', 'iv', 'iv', 'V', 'i'],
          ['i', 'bIII', 'bVI', 'iv', 'i', 'bIII', 'bVI', 'i'],
        ],

        16: [

          ['i', 'bVI', 'bIII', 'bVII', 'i', 'bVI', 'bIII', 'i', 'i', 'bVII', 'bVI', 'bVII', 'i', 'bVII', 'bVI', 'i'],

          ['i', 'bVII', 'bVI', 'bVII', 'i', 'bVII', 'bVI', 'i', 'i', 'bVI', 'bIII', 'bVII', 'i', 'bVI', 'bIII', 'i'],

        ],

        32: [

          ['i', 'bVI', 'bIII', 'bVII', 'i', 'bVI', 'bIII', 'i', 'i', 'bVII', 'bVI', 'bVII', 'i', 'bVII', 'bVI', 'i', 'i', 'bVII', 'bVI', 'bVII', 'i', 'bVII', 'bVI', 'i', 'i', 'bVI', 'bIII', 'bVII', 'i', 'bVI', 'bIII', 'i'],

          ['i', 'bVI', 'bIII', 'bVII', 'i', 'bVI', 'bIII', 'i', 'i', 'bVI', 'bIII', 'bVII', 'i', 'bVI', 'bIII', 'i', 'i', 'bVII', 'bVI', 'bVII', 'i', 'bVII', 'bVI', 'i', 'i', 'bVII', 'bVI', 'bVII', 'i', 'bVII', 'bVI', 'i'],

        ],
      },
    },
    forms: {
      4: [['statement', 'restatement', 'development', 'cadence']],
      8: [
        ['statement', 'restatement', 'restatement', 'development', 'restatement', 'development', 'climax', 'cadence'],
        ['statement', 'restatement', 'development', 'restatement', 'restatement', 'development', 'climax', 'cadence'],
      ],

      16: [

        ['statement', 'restatement', 'development', 'half_cadence', 'statement', 'development', 'climax', 'cadence', 'restatement', 'development', 'contrast', 'half_cadence', 'development', 'climax', 'development', 'cadence'],

        ['statement', 'development', 'development', 'half_cadence', 'restatement', 'contrast', 'climax', 'cadence', 'statement', 'restatement', 'development', 'contrast', 'development', 'development', 'climax', 'cadence'],

      ],

      32: [

        ['statement', 'restatement', 'development', 'half_cadence', 'statement', 'development', 'climax', 'cadence', 'restatement', 'development', 'contrast', 'half_cadence', 'development', 'climax', 'development', 'cadence', 'statement', 'restatement', 'development', 'half_cadence', 'contrast', 'development', 'climax', 'cadence', 'restatement', 'development', 'contrast', 'half_cadence', 'development', 'climax', 'development', 'cadence'],

        ['statement', 'development', 'contrast', 'half_cadence', 'restatement', 'development', 'climax', 'cadence', 'statement', 'restatement', 'development', 'contrast', 'development', 'development', 'climax', 'cadence', 'restatement', 'contrast', 'development', 'half_cadence', 'statement', 'development', 'climax', 'cadence', 'development', 'restatement', 'contrast', 'development', 'development', 'climax', 'half_cadence', 'cadence'],

      ],
    },
  },

  nahre_sol: {
    brief:
      'Contemporary pianist-composer and YouTube educator, 2020s. Classical training fused with jazz and electronic-music grooves: left-hand ostinatos in 3+3+2 groupings, open quartal and add9 voicings, bright Lydian and Dorian modal colour, sparse syncopated motifs that build in layers. Rhythmic and playful rather than lush.',
    priors: {
      key: { E_minor: 12, D_major: 10, G_major: 10, A_minor: 10, F_major: 10, B_minor: 10, D_minor: 10, Bb_major: 8, Eb_major: 8, C_major: 6, Fs_minor: 6 },
      meter: { four_four: 55, six_eight: 25, three_four: 20 },
      texture: { syncopated_ostinato: 50, minimal_cells: 12, wash_arpeggio: 12, lush_voicings: 10, parallel_planing: 8, two_voice_counterpoint: 8 },
      palette: { modal: 50, pentatonic: 20, chromatic_approach: 15, diatonic: 15 },
      tempo: { moderato: 35, allegro: 30, andante: 25, adagio: 10 },
      dynamics: { mf: 40, mp: 35, p: 15, f: 10 },
      dynamicShape: { arch: 35, crescendo: 30, steady: 20, sudden_contrast: 15 },
      defaultInstrument: { grand_piano: 70, electric_piano: 20, strings: 10 },
      barCount: { '8': 49, '4': 30, '16': 14, '32': 7 },
      contour: { arch: 30, rise: 25, static: 20, dip: 15, fall: 10 },
    },
    progressions: {
      major: {
        4: [['Iadd9', 'IVmaj7s11', 'vi9', 'V7sus4']],
        8: [
          ['Iadd9', 'IVmaj7s11', 'vi9', 'V7sus4', 'Iadd9', 'bVII', 'IVmaj9', 'Isus2'],
          ['Isus2', 'vi11', 'IVmaj7s11', 'V7sus4', 'iii7', 'vi9', 'bVImaj7', 'Iadd9'],
          ['IVmaj7s11', 'Iadd9', 'vi9', 'V7sus4', 'IVmaj7s11', 'iii7', 'bVII', 'Isus2'],
        ],

        16: [

          ['Iadd9', 'IVmaj7s11', 'vi9', 'V7sus4', 'Iadd9', 'bVII', 'IVmaj9', 'Isus2', 'Isus2', 'vi11', 'IVmaj7s11', 'V7sus4', 'iii7', 'vi9', 'bVImaj7', 'Iadd9'],

          ['Isus2', 'vi11', 'IVmaj7s11', 'V7sus4', 'iii7', 'vi9', 'bVImaj7', 'Iadd9', 'Iadd9', 'IVmaj7s11', 'vi9', 'V7sus4', 'Iadd9', 'bVII', 'IVmaj9', 'Isus2'],

        ],

        32: [

          ['Iadd9', 'IVmaj7s11', 'vi9', 'V7sus4', 'Iadd9', 'bVII', 'IVmaj9', 'Isus2', 'Isus2', 'vi11', 'IVmaj7s11', 'V7sus4', 'iii7', 'vi9', 'bVImaj7', 'Iadd9', 'Isus2', 'vi11', 'IVmaj7s11', 'V7sus4', 'iii7', 'vi9', 'bVImaj7', 'Iadd9', 'Iadd9', 'IVmaj7s11', 'vi9', 'V7sus4', 'Iadd9', 'bVII', 'IVmaj9', 'Isus2'],

          ['Iadd9', 'IVmaj7s11', 'vi9', 'V7sus4', 'Iadd9', 'bVII', 'IVmaj9', 'Isus2', 'Iadd9', 'IVmaj7s11', 'vi9', 'V7sus4', 'Iadd9', 'bVII', 'IVmaj9', 'Isus2', 'Isus2', 'vi11', 'IVmaj7s11', 'V7sus4', 'iii7', 'vi9', 'bVImaj7', 'Iadd9', 'Isus2', 'vi11', 'IVmaj7s11', 'V7sus4', 'iii7', 'vi9', 'bVImaj7', 'Iadd9'],

        ],
      },
      minor: {
        4: [
          ['i_add9', 'bVImaj7', 'bIIImaj7', 'bVII'],
          ['i9', 'IV', 'bVImaj7', 'i_add9'],
        ],
        8: [
          ['i_add9', 'bVImaj7', 'bIIImaj7', 'bVII', 'i9', 'iv7', 'bVImaj9', 'i_add9'],
          ['i_add9', 'bVII', 'IV', 'bVImaj7', 'i9', 'bIIImaj7', 'V7sus4', 'i_add9'],
        ],

        16: [

          ['i_add9', 'bVImaj7', 'bIIImaj7', 'bVII', 'i9', 'iv7', 'bVImaj9', 'i_add9', 'i_add9', 'bVII', 'IV', 'bVImaj7', 'i9', 'bIIImaj7', 'V7sus4', 'i_add9'],

          ['i_add9', 'bVII', 'IV', 'bVImaj7', 'i9', 'bIIImaj7', 'V7sus4', 'i_add9', 'i_add9', 'bVImaj7', 'bIIImaj7', 'bVII', 'i9', 'iv7', 'bVImaj9', 'i_add9'],

        ],

        32: [

          ['i_add9', 'bVImaj7', 'bIIImaj7', 'bVII', 'i9', 'iv7', 'bVImaj9', 'i_add9', 'i_add9', 'bVII', 'IV', 'bVImaj7', 'i9', 'bIIImaj7', 'V7sus4', 'i_add9', 'i_add9', 'bVII', 'IV', 'bVImaj7', 'i9', 'bIIImaj7', 'V7sus4', 'i_add9', 'i_add9', 'bVImaj7', 'bIIImaj7', 'bVII', 'i9', 'iv7', 'bVImaj9', 'i_add9'],

          ['i_add9', 'bVImaj7', 'bIIImaj7', 'bVII', 'i9', 'iv7', 'bVImaj9', 'i_add9', 'i_add9', 'bVImaj7', 'bIIImaj7', 'bVII', 'i9', 'iv7', 'bVImaj9', 'i_add9', 'i_add9', 'bVII', 'IV', 'bVImaj7', 'i9', 'bIIImaj7', 'V7sus4', 'i_add9', 'i_add9', 'bVII', 'IV', 'bVImaj7', 'i9', 'bIIImaj7', 'V7sus4', 'i_add9'],

        ],
      },
    },
    forms: {
      4: [['statement', 'restatement', 'development', 'cadence']],
      8: [
        ['statement', 'restatement', 'development', 'contrast', 'restatement', 'development', 'climax', 'cadence'],
        ['statement', 'development', 'contrast', 'half_cadence', 'restatement', 'development', 'climax', 'cadence'],
      ],

      16: [

        ['statement', 'restatement', 'development', 'half_cadence', 'statement', 'development', 'climax', 'cadence', 'restatement', 'development', 'contrast', 'half_cadence', 'development', 'climax', 'development', 'cadence'],

        ['statement', 'development', 'development', 'half_cadence', 'restatement', 'contrast', 'climax', 'cadence', 'statement', 'restatement', 'development', 'contrast', 'development', 'development', 'climax', 'cadence'],

      ],

      32: [

        ['statement', 'restatement', 'development', 'half_cadence', 'statement', 'development', 'climax', 'cadence', 'restatement', 'development', 'contrast', 'half_cadence', 'development', 'climax', 'development', 'cadence', 'statement', 'restatement', 'development', 'half_cadence', 'contrast', 'development', 'climax', 'cadence', 'restatement', 'development', 'contrast', 'half_cadence', 'development', 'climax', 'development', 'cadence'],

        ['statement', 'development', 'contrast', 'half_cadence', 'restatement', 'development', 'climax', 'cadence', 'statement', 'restatement', 'development', 'contrast', 'development', 'development', 'climax', 'cadence', 'restatement', 'contrast', 'development', 'half_cadence', 'statement', 'development', 'climax', 'cadence', 'development', 'restatement', 'contrast', 'development', 'development', 'climax', 'half_cadence', 'cadence'],

      ],
    },
  },

  elijah_fox: {
    brief:
      'Contemporary neo-soul and jazz pianist-producer, 2020s. Slow, intimate, improvised-feeling keys: lush rolled major-ninth and minor-eleventh voicings, gospel turnarounds (ii–V with thirteenths and altered dominants, backdoor and tritone substitutions), pentatonic fills behind the beat. Soft felt piano or electric piano, flat keys.',
    priors: {
      key: { Db_major: 15, Ab_major: 15, Eb_major: 15, Bb_major: 10, F_major: 10, E_major: 8, G_major: 6, A_major: 5, C_minor: 8, F_minor: 8 },
      meter: { four_four: 60, six_eight: 25, three_four: 15 },
      texture: { lush_voicings: 70, wash_arpeggio: 12, syncopated_ostinato: 10, parallel_planing: 8 },
      palette: { pentatonic: 45, chromatic_approach: 25, modal: 20, diatonic: 10 },
      tempo: { adagio: 45, andante: 30, largo: 20, moderato: 5 },
      dynamics: { mp: 40, p: 35, mf: 15, pp: 10 },
      dynamicShape: { arch: 40, steady: 30, decrescendo: 15, crescendo: 15 },
      defaultInstrument: { electric_piano: 50, grand_piano: 40, choir: 5, strings: 5 },
      barCount: { '8': 42, '4': 40, '16': 12, '32': 6 },
      contour: { arch: 30, fall: 30, dip: 15, rise: 15, static: 10 },
    },
    progressions: {
      major: {
        4: [
          ['ii9', 'V13', 'Imaj9', 'I6_9'],
          ['IVmaj9', 'iii9', 'bIImaj7', 'Imaj9'],
        ],
        8: [
          ['IVmaj9', 'V13', 'iii9', 'vi9', 'ii9', 'V7alt', 'Imaj9', 'I6_9'],
          ['Imaj9', 'iii9', 'IVmaj9', 'V7sus4', 'vi9', 'ii9', 'bVII7', 'I6_9'],
          ['Imaj9', 'bVImaj9', 'IVmaj9', 'V13', 'iii9', 'vi11', 'bIImaj7', 'Imaj9'],
        ],

        16: [

          ['IVmaj9', 'V13', 'iii9', 'vi9', 'ii9', 'V7alt', 'Imaj9', 'I6_9', 'Imaj9', 'iii9', 'IVmaj9', 'V7sus4', 'vi9', 'ii9', 'bVII7', 'I6_9'],

          ['Imaj9', 'iii9', 'IVmaj9', 'V7sus4', 'vi9', 'ii9', 'bVII7', 'I6_9', 'IVmaj9', 'V13', 'iii9', 'vi9', 'ii9', 'V7alt', 'Imaj9', 'I6_9'],

        ],

        32: [

          ['IVmaj9', 'V13', 'iii9', 'vi9', 'ii9', 'V7alt', 'Imaj9', 'I6_9', 'Imaj9', 'iii9', 'IVmaj9', 'V7sus4', 'vi9', 'ii9', 'bVII7', 'I6_9', 'Imaj9', 'iii9', 'IVmaj9', 'V7sus4', 'vi9', 'ii9', 'bVII7', 'I6_9', 'IVmaj9', 'V13', 'iii9', 'vi9', 'ii9', 'V7alt', 'Imaj9', 'I6_9'],

          ['IVmaj9', 'V13', 'iii9', 'vi9', 'ii9', 'V7alt', 'Imaj9', 'I6_9', 'IVmaj9', 'V13', 'iii9', 'vi9', 'ii9', 'V7alt', 'Imaj9', 'I6_9', 'Imaj9', 'iii9', 'IVmaj9', 'V7sus4', 'vi9', 'ii9', 'bVII7', 'I6_9', 'Imaj9', 'iii9', 'IVmaj9', 'V7sus4', 'vi9', 'ii9', 'bVII7', 'I6_9'],

        ],
      },
      minor: {
        4: [['i9', 'bVImaj9', 'V7alt', 'i9']],
        8: [['i9', 'iv7', 'bVII7', 'bIIImaj7', 'bVImaj9', 'ii_half_dim7', 'V7alt', 'i9']],

        16: [

          ['i9', 'iv7', 'bVII7', 'bIIImaj7', 'bVImaj9', 'ii_half_dim7', 'V7alt', 'i9', 'i9', 'iv7', 'bVII7', 'bIIImaj7', 'bVImaj9', 'ii_half_dim7', 'V7alt', 'i9'],

          ['i9', 'iv7', 'bVII7', 'bIIImaj7', 'bVImaj9', 'ii_half_dim7', 'V7alt', 'i9', 'i9', 'iv7', 'bVII7', 'bIIImaj7', 'bVImaj9', 'ii_half_dim7', 'V7alt', 'i9'],

        ],

        32: [

          ['i9', 'iv7', 'bVII7', 'bIIImaj7', 'bVImaj9', 'ii_half_dim7', 'V7alt', 'i9', 'i9', 'iv7', 'bVII7', 'bIIImaj7', 'bVImaj9', 'ii_half_dim7', 'V7alt', 'i9', 'i9', 'iv7', 'bVII7', 'bIIImaj7', 'bVImaj9', 'ii_half_dim7', 'V7alt', 'i9', 'i9', 'iv7', 'bVII7', 'bIIImaj7', 'bVImaj9', 'ii_half_dim7', 'V7alt', 'i9'],

          ['i9', 'iv7', 'bVII7', 'bIIImaj7', 'bVImaj9', 'ii_half_dim7', 'V7alt', 'i9', 'i9', 'iv7', 'bVII7', 'bIIImaj7', 'bVImaj9', 'ii_half_dim7', 'V7alt', 'i9', 'i9', 'iv7', 'bVII7', 'bIIImaj7', 'bVImaj9', 'ii_half_dim7', 'V7alt', 'i9', 'i9', 'iv7', 'bVII7', 'bIIImaj7', 'bVImaj9', 'ii_half_dim7', 'V7alt', 'i9'],

        ],
      },
    },
    forms: {
      4: [['statement', 'restatement', 'contrast', 'cadence']],
      8: [
        ['statement', 'restatement', 'development', 'half_cadence', 'restatement', 'contrast', 'climax', 'cadence'],
        ['statement', 'development', 'restatement', 'contrast', 'restatement', 'development', 'half_cadence', 'cadence'],
      ],

      16: [

        ['statement', 'restatement', 'development', 'half_cadence', 'statement', 'development', 'climax', 'cadence', 'restatement', 'development', 'contrast', 'half_cadence', 'development', 'climax', 'development', 'cadence'],

        ['statement', 'development', 'development', 'half_cadence', 'restatement', 'contrast', 'climax', 'cadence', 'statement', 'restatement', 'development', 'contrast', 'development', 'development', 'climax', 'cadence'],

      ],

      32: [

        ['statement', 'restatement', 'development', 'half_cadence', 'statement', 'development', 'climax', 'cadence', 'restatement', 'development', 'contrast', 'half_cadence', 'development', 'climax', 'development', 'cadence', 'statement', 'restatement', 'development', 'half_cadence', 'contrast', 'development', 'climax', 'cadence', 'restatement', 'development', 'contrast', 'half_cadence', 'development', 'climax', 'development', 'cadence'],

        ['statement', 'development', 'contrast', 'half_cadence', 'restatement', 'development', 'climax', 'cadence', 'statement', 'restatement', 'development', 'contrast', 'development', 'development', 'climax', 'cadence', 'restatement', 'contrast', 'development', 'half_cadence', 'statement', 'development', 'climax', 'cadence', 'development', 'restatement', 'contrast', 'development', 'development', 'climax', 'half_cadence', 'cadence'],

      ],
    },
  },
}
