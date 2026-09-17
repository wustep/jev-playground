// The contract between the planner (Jev or a stub) and the renderer.
//
// Everything a planner may decide is a closed enum. Each option carries a short
// musical description: the UI shows it, and JevPlanner sends it as the Choice
// `criteria` for that option. Descriptions deliberately never name a composer —
// connecting "Debussy" to `parallel_planing` is the judgment under test.
//
// NOTE: this file is also imported by the /api/jev serverless function, so
// relative imports in this chain use explicit `.js` extensions (Node ESM).

export type OptionTable<K extends string> = Readonly<Record<K, string>>

const keysOf = <K extends string>(table: OptionTable<K>) => Object.keys(table) as K[]

// ── Styles (the dial) ───────────────────────────────────────────────────────

export const STYLE_LABELS = {
  bach: 'Bach',
  beethoven: 'Beethoven',
  debussy: 'Debussy',
  glass: 'Philip Glass',
  nahre_sol: 'Nahre Sol',
  elijah_fox: 'Elijah Fox',
} as const
export type StyleId = keyof typeof STYLE_LABELS
export const STYLE_IDS = keysOf<StyleId>(STYLE_LABELS)

// ── Global decisions ────────────────────────────────────────────────────────

export const KEYS = {
  C_major: 'C major — no sharps or flats; plain, open, bright',
  G_major: 'G major — one sharp; pastoral, cheerful',
  D_major: 'D major — two sharps; brilliant, festive',
  A_major: 'A major — three sharps; warm and radiant',
  E_major: 'E major — four sharps; luminous, shimmering',
  F_major: 'F major — one flat; gentle, pastoral',
  Bb_major: 'B-flat major — two flats; rounded, noble',
  Eb_major: 'E-flat major — three flats; heroic, broad',
  Ab_major: 'A-flat major — four flats; mellow, velvety',
  Db_major: 'D-flat major — five flats; hazy, dreamlike, black-key colour',
  A_minor: 'A minor — no sharps or flats; plain, melancholy',
  E_minor: 'E minor — one sharp; restless, plaintive',
  B_minor: 'B minor — two sharps; solemn, devotional',
  Fs_minor: 'F-sharp minor — three sharps; dark, introspective',
  D_minor: 'D minor — one flat; grave, serious',
  G_minor: 'G minor — two flats; agitated, tragic',
  C_minor: 'C minor — three flats; stormy, fateful, heroic struggle',
  F_minor: 'F minor — four flats; brooding, passionate',
} as const
export type KeyId = keyof typeof KEYS
export const KEY_IDS = keysOf<KeyId>(KEYS)

export const METERS = {
  four_four: '4/4 — four quarter-note beats; square, march- or song-like',
  three_four: '3/4 — three quarter-note beats; waltz or minuet lilt',
  six_eight: '6/8 — two dotted-quarter beats; rolling, barcarolle or gigue feel',
} as const
export type MeterId = keyof typeof METERS
export const METER_IDS = keysOf<MeterId>(METERS)

export const TEXTURES = {
  chorale:
    'Four-voice hymn texture: soprano, alto, tenor and bass moving together mostly in quarter notes with passing tones',
  two_voice_counterpoint:
    'Two independent lines: running sixteenth notes in one hand against walking eighth notes in the other, trading hands',
  broken_chord_prelude:
    'Continuous even sixteenth-note broken chords passed from left hand to right, one harmony per bar, no separate melody',
  alberti_melody:
    'Singing right-hand melody over a left-hand low–high–middle–high broken-chord accompaniment',
  dramatic_chords:
    'Thick block chords over left-hand octaves; short rhythmic motto, rests, sudden accents, repeated hammered chords',
  parallel_planing:
    'Chords gliding in parallel motion under a floating melody, over long low bass pedal tones; blurred and non-functional',
  wash_arpeggio:
    'Wide harp-like arpeggio sweeps rising across both hands into a long ringing melody note, sustain pedal held',
  minimal_cells:
    'Short arpeggio cells repeated hypnotically with steady pulse, little melody, two-against-three cross-rhythms, gradual additive change',
  syncopated_ostinato:
    'Left-hand ostinato in 3+3+2 groupings under sparse syncopated right-hand stabs in open fourths and short motifs',
  lush_voicings:
    'Rolled rich extended chords (ninths, elevenths) held under gentle pentatonic melodic fills; laid-back, soulful',
} as const
export type TextureId = keyof typeof TEXTURES
export const TEXTURE_IDS = keysOf<TextureId>(TEXTURES)

export const PALETTES = {
  diatonic: 'Plain major or natural-minor scale tones; stepwise passing notes stay inside the key',
  chromatic_approach: 'Scale tones decorated with chromatic neighbour and leading tones a semitone below their targets',
  pentatonic: 'Five-note scale with no semitones; open, folk-like or soulful, never tense',
  whole_tone: 'Six-note scale of equal whole steps; floating, rootless, augmented colour',
  modal: 'Bright raised-fourth (Lydian) colour in major keys, raised-sixth (Dorian) colour in minor keys',
} as const
export type PaletteId = keyof typeof PALETTES
export const PALETTE_IDS = keysOf<PaletteId>(PALETTES)

export const TEMPOS = {
  largo: 'Very slow and broad, about 50 quarter notes per minute',
  adagio: 'Slow and expressive, about 66 quarter notes per minute',
  andante: 'Walking pace, about 84 quarter notes per minute',
  moderato: 'Moderate, about 104 quarter notes per minute',
  allegro: 'Fast and lively, about 132 quarter notes per minute',
  presto: 'Very fast and driving, about 168 quarter notes per minute',
} as const
export type TempoId = keyof typeof TEMPOS
export const TEMPO_IDS = keysOf<TempoId>(TEMPOS)
export const TEMPO_BPM: Record<TempoId, number> = {
  largo: 50,
  adagio: 66,
  andante: 84,
  moderato: 104,
  allegro: 132,
  presto: 168,
}

export const DYNAMICS = {
  pp: 'pianissimo — very soft, barely touched',
  p: 'piano — soft',
  mp: 'mezzo-piano — moderately soft',
  mf: 'mezzo-forte — moderately loud',
  f: 'forte — loud and strong',
  ff: 'fortissimo — very loud, full force',
} as const
export type DynamicId = keyof typeof DYNAMICS
export const DYNAMIC_IDS = keysOf<DynamicId>(DYNAMICS)

export const DYNAMIC_SHAPES = {
  steady: 'One unchanging dynamic level throughout',
  terraced: 'Abrupt block changes between two fixed levels, like a loud phrase answered by a soft echo',
  crescendo: 'Grows steadily louder from start to end',
  decrescendo: 'Fades steadily from start to end',
  arch: 'Swells gradually to a peak past the midpoint, then recedes',
  sudden_contrast: 'Violent unprepared jumps between soft and loud with sharp accents',
} as const
export type DynamicShapeId = keyof typeof DYNAMIC_SHAPES
export const DYNAMIC_SHAPE_IDS = keysOf<DynamicShapeId>(DYNAMIC_SHAPES)

export const INSTRUMENTS = {
  grand_piano: 'Acoustic concert grand piano',
  electric_piano: 'Vintage electric piano with a soft bell-like bark',
  harpsichord: 'Harpsichord — plucked, bright, no touch dynamics',
  church_organ: 'Pipe organ — sustained, no decay',
  strings: 'Bowed string ensemble — sustained, swelling',
  choir: 'Wordless choir singing "aah"',
} as const
export type InstrumentId = keyof typeof INSTRUMENTS
export const INSTRUMENT_IDS = keysOf<InstrumentId>(INSTRUMENTS)

export const BAR_COUNTS = {
  '4': 'Four bars — one short phrase, a single gesture',
  '8': 'Eight bars — a full period: a phrase and its answer',
  '16': 'Sixteen bars — a double period: two phrases with a midpoint breath',
  '32': 'Thirty-two bars — a short binary form: exposition and return',
} as const
export type BarCountId = keyof typeof BAR_COUNTS
export const BAR_COUNT_IDS = keysOf<BarCountId>(BAR_COUNTS)
export const BAR_COUNT_VALUES = [4, 8, 16, 32] as const
export type BarCount = (typeof BAR_COUNT_VALUES)[number]

// ── Per-bar decisions ───────────────────────────────────────────────────────

export const BAR_ROLES = {
  statement: 'Presents the main idea for the first time',
  restatement: 'Repeats the main idea, literally or lightly varied',
  development: 'Fragments or sequences the idea; more motion, pushing forward',
  contrast: 'Departs to a new register, figure or colour',
  climax: 'The peak: highest register, densest and loudest moment',
  half_cadence: 'Pauses, unresolved, breathing before the answer',
  cadence: 'Closes: comes to rest on a final long sonority',
} as const
export type BarRoleId = keyof typeof BAR_ROLES
export const BAR_ROLE_IDS = keysOf<BarRoleId>(BAR_ROLES)

export const CONTOURS = {
  rise: 'Melodic line climbs through the bar',
  fall: 'Melodic line descends through the bar',
  arch: 'Line rises to a mid-bar peak and returns',
  dip: 'Line sinks mid-bar and returns',
  static: 'Line hovers around one pitch',
} as const
export type ContourId = keyof typeof CONTOURS
export const CONTOUR_IDS = keysOf<ContourId>(CONTOURS)

// Chord labels are key-relative roman numerals. Upper-case = major quality,
// lower-case = minor; a `b` prefix lowers the root relative to the MAJOR scale
// in both modes (so the "VI" of a minor key is written bVI here). The renderer
// resolves them to spelled pitches in src/render/harmony.ts.
export const CHORDS = {
  I: 'Major triad on the tonic',
  i: 'Minor triad on the tonic',
  ii: 'Minor triad on the second degree',
  ii_dim: 'Diminished triad on the second degree (minor-key supertonic)',
  iii: 'Minor triad on the third degree',
  IV: 'Major triad on the fourth degree (subdominant)',
  iv: 'Minor triad on the fourth degree (minor subdominant)',
  V: 'Major triad on the fifth degree (dominant)',
  v: 'Minor triad on the fifth degree (modal, no leading tone)',
  vi: 'Minor triad on the sixth degree (relative minor)',
  vii_dim: 'Diminished triad on the leading tone',
  bII: 'Major triad on the lowered second degree (Phrygian colour)',
  bIII: 'Major triad on the lowered third degree (relative major of a minor key)',
  bVI: 'Major triad on the lowered sixth degree (submediant of a minor key)',
  bVII: 'Major triad on the lowered seventh degree (subtonic)',
  I_aug: 'Augmented triad on the tonic; whole-tone, unmoored',
  V_aug: 'Augmented triad on the dominant; whole-tone tension',
  Isus2: 'Tonic with the second instead of the third; open, unresolved',
  IVsus2: 'Subdominant with the second instead of the third; open, airy',
  Vsus4: 'Dominant triad with a suspended fourth',
  V7: 'Dominant seventh; strongest pull back to the tonic',
  vii_dim7: 'Fully diminished seventh on the leading tone; dramatic tension',
  ii_half_dim7: 'Half-diminished seventh on the second degree (minor-key ii before V)',
  Imaj7: 'Major seventh chord on the tonic; soft, glowing',
  i7: 'Minor seventh chord on the tonic',
  ii7: 'Minor seventh chord on the second degree',
  iii7: 'Minor seventh chord on the third degree',
  IVmaj7: 'Major seventh chord on the fourth degree',
  iv7: 'Minor seventh chord on the fourth degree',
  vi7: 'Minor seventh chord on the sixth degree',
  bIIImaj7: 'Major seventh chord on the lowered third degree',
  bVImaj7: 'Major seventh chord on the lowered sixth degree',
  bVII7: 'Dominant seventh on the lowered seventh degree (backdoor dominant)',
  bIImaj7: 'Major seventh chord on the lowered second degree (tritone-substitute colour)',
  Iadd9: 'Tonic major triad with an added ninth; open, modern',
  i_add9: 'Tonic minor triad with an added ninth; wistful, modern',
  I6_9: 'Tonic major with added sixth and ninth; settled, jazzy final chord',
  Imaj9: 'Tonic major ninth; lush',
  i9: 'Tonic minor ninth; smoky',
  ii9: 'Minor ninth chord on the second degree',
  iii9: 'Minor ninth chord on the third degree',
  IVmaj9: 'Major ninth chord on the fourth degree; lush',
  IVmaj7s11: 'Subdominant major seventh with raised eleventh; Lydian shimmer',
  vi9: 'Minor ninth chord on the sixth degree',
  vi11: 'Minor eleventh chord on the sixth degree; stacked, suspended',
  V9: 'Dominant ninth',
  V13: 'Dominant thirteenth; rich, gospel-jazz turnaround',
  V7sus4: 'Dominant seventh with suspended fourth; soft unresolved dominant',
  V7alt: 'Altered dominant (raised ninth, lowered thirteenth); bluesy bite',
  bVImaj9: 'Major ninth chord on the lowered sixth degree; cinematic borrowed colour',
} as const
export type ChordId = keyof typeof CHORDS
export const CHORD_IDS = keysOf<ChordId>(CHORDS)

// ── The plan ────────────────────────────────────────────────────────────────

export interface BarPlan {
  chord: ChordId
  role: BarRoleId
  contour: ContourId
}

export interface CompositionPlan {
  version: 1
  style: StyleId
  key: KeyId
  meter: MeterId
  texture: TextureId
  palette: PaletteId
  tempo: TempoId
  dynamics: DynamicId
  dynamicShape: DynamicShapeId
  defaultInstrument: InstrumentId
  /** 4, 8, 16 or 32 bars, one harmony each. */
  bars: BarPlan[]
}

/** The global (non-bar) fields, in the order planners decide them. */
export const GLOBAL_FIELDS = {
  key: KEYS,
  meter: METERS,
  texture: TEXTURES,
  palette: PALETTES,
  tempo: TEMPOS,
  dynamics: DYNAMICS,
  dynamicShape: DYNAMIC_SHAPES,
  defaultInstrument: INSTRUMENTS,
} as const
export type GlobalField = keyof typeof GLOBAL_FIELDS
export const GLOBAL_FIELD_IDS = Object.keys(GLOBAL_FIELDS) as GlobalField[]
export type PlanGlobals = Pick<CompositionPlan, GlobalField>

export const MATCH_LEVELS = ['low', 'medium', 'high'] as const
export type MatchLevel = (typeof MATCH_LEVELS)[number]

export interface StyleMatchScore {
  match: MatchLevel
  /** 0–1. For Jev: concentration of the Score distribution. */
  confidence: number
  /** Probability-weighted position on the low→high scale, 0–2. */
  raw: number
}

// ── Validation ──────────────────────────────────────────────────────────────

export class PlanValidationError extends Error {}

export function parseOption<K extends string>(table: OptionTable<K>, value: unknown, path: string): K {
  if (typeof value === 'string' && Object.hasOwn(table, value)) return value as K
  const shown = typeof value === 'string' ? `"${value}"` : String(value)
  throw new PlanValidationError(`${path}: ${shown} is not one of ${Object.keys(table).join(', ')}`)
}

export function parseBarPlan(raw: unknown, path: string): BarPlan {
  if (!raw || typeof raw !== 'object') throw new PlanValidationError(`${path}: expected an object`)
  const bar = raw as Record<string, unknown>
  return {
    chord: parseOption(CHORDS, bar.chord, `${path}.chord`),
    role: parseOption(BAR_ROLES, bar.role, `${path}.role`),
    contour: parseOption(CONTOURS, bar.contour, `${path}.contour`),
  }
}

export function parseGlobals(raw: unknown, path = 'plan'): PlanGlobals {
  if (!raw || typeof raw !== 'object') throw new PlanValidationError(`${path}: expected an object`)
  const obj = raw as Record<string, unknown>
  return {
    key: parseOption(KEYS, obj.key, `${path}.key`),
    meter: parseOption(METERS, obj.meter, `${path}.meter`),
    texture: parseOption(TEXTURES, obj.texture, `${path}.texture`),
    palette: parseOption(PALETTES, obj.palette, `${path}.palette`),
    tempo: parseOption(TEMPOS, obj.tempo, `${path}.tempo`),
    dynamics: parseOption(DYNAMICS, obj.dynamics, `${path}.dynamics`),
    dynamicShape: parseOption(DYNAMIC_SHAPES, obj.dynamicShape, `${path}.dynamicShape`),
    defaultInstrument: parseOption(INSTRUMENTS, obj.defaultInstrument, `${path}.defaultInstrument`),
  }
}

export function parseStyle(raw: unknown, path = 'style'): StyleId {
  return parseOption(STYLE_LABELS, raw, path)
}

/** Validate untrusted JSON (hand-edited, or from a planner) into a CompositionPlan. */
export function parsePlan(raw: unknown): CompositionPlan {
  if (!raw || typeof raw !== 'object') throw new PlanValidationError('plan: expected an object')
  const obj = raw as Record<string, unknown>
  if (!Array.isArray(obj.bars) || !(BAR_COUNT_VALUES as readonly number[]).includes(obj.bars.length)) {
    throw new PlanValidationError('plan.bars: expected an array of 4, 8, 16 or 32 bars')
  }
  return {
    version: 1,
    style: parseStyle(obj.style, 'plan.style'),
    ...parseGlobals(obj),
    bars: obj.bars.map((bar, i) => parseBarPlan(bar, `plan.bars[${i}]`)),
  }
}
