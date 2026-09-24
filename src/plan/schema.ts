// The contract between the planner (Jev or a stub) and the renderer.
//
// Every field here is a closed enum that measurably changes sounding notes.
// That is the whole editorial rule: a label that cannot be heard does not
// belong in the plan. Each option carries a short musical description — the UI
// shows it, and JevPlanner sends it as the Choice `criteria` for that option.
// Descriptions deliberately never name a composer: connecting "Debussy" to
// `parallel_planing` was the judgment under test, and still is.
//
// The three fields that matter most are new, and they exist because the old
// schema had no way to say them: `register` (where the tune sings),
// `motion` (how fast it moves) and `accompaniment` (what holds it up).
//
// NOTE: this file is also imported by the /api/jev serverless function, so
// relative imports in this chain use explicit `.js` extensions (Node ESM).

export type OptionTable<K extends string> = Readonly<Record<K, string>>

const keysOf = <K extends string>(table: OptionTable<K>) => Object.keys(table) as K[]

// ── Styles (the dial) ───────────────────────────────────────────────────────
//
// Five, not eight. A style earns a face by diverging on the axes below —
// register, motion, accompaniment, palette, rubato — not by having a name.
// The four with committed public-domain reference MIDI can be measured;
// Zimmer holds the drama pole.

export const STYLE_LABELS = {
  bach: 'Johann Sebastian Bach',
  beethoven: 'Ludwig van Beethoven',
  chopin: 'Frédéric Chopin',
  debussy: 'Claude Debussy',
  glass: 'Philip Glass',
  hans_zimmer: 'Hans Zimmer',
  laufey: 'Laufey',
  elijah_fox: 'Elijah Fox',
} as const
export type StyleId = keyof typeof STYLE_LABELS
export const STYLE_IDS = keysOf<StyleId>(STYLE_LABELS)

// ── The singing line ────────────────────────────────────────────────────────

/**
 * Where the tune lives. This is the field whose absence made every style
 * sound alike: the old renderer hardcoded a melody window in each of its 23
 * textures, all of them centred on MIDI 74–76, so a low cantabile Adagio was
 * unreachable however the plan was labelled.
 */
export const REGISTERS = {
  low: 'The tune sings low, in the tenor-to-alto range around and just above middle C — a cantabile inner voice, warm and covered',
  mid: 'The tune sings in the comfortable soprano range just above middle C — plain, speaking, neither strained nor dark',
  high: 'The tune sings high and bright, well above the accompaniment — a clear vocal line with air underneath it',
} as const
export type RegisterId = keyof typeof REGISTERS
export const REGISTER_IDS = keysOf<RegisterId>(REGISTERS)

/**
 * The sounding window of each register, as MIDI numbers: [floor, ceiling].
 *
 * Calibrated against the TOP VOICE of the committed reference MIDI: Op. 13's
 * Adagio sings at 66, Bach's C major prelude figure at 69, Op. 9/2's nocturne
 * at 76.5. An earlier calibration read Op. 13 at 62 — but that count included
 * the inner sixteenths the right hand plays under the tune, and `low` was set
 * a fourth too deep on the strength of it.
 */
export const REGISTER_RANGE: Record<RegisterId, readonly [number, number]> = {
  low: [57, 73],
  mid: [61, 78],
  high: [68, 85],
}

/**
 * How fast the tune moves — its subdivision, in attacks per felt beat. The
 * old schema had no word for this either, which is why a nocturne came out at
 * 3.25 melody onsets per bar against the reference's 7.25.
 */
export const MOTIONS = {
  sustained: 'Long held notes, one or two to a bar, ringing over a moving accompaniment; the line is nearly still',
  walking: 'About one note to a beat — a plain singing pace, the tune stepping evenly with the pulse',
  flowing: 'About two notes to a beat, the line moving continuously with occasional longer arrivals',
  florid: 'Three or four notes to a beat: running figuration, turns and scale fragments decorating a slower skeleton',
} as const
export type MotionId = keyof typeof MOTIONS
export const MOTION_IDS = keysOf<MotionId>(MOTIONS)

/** Attacks per felt beat for each motion — the target the rhythm writer aims at. */
export const MOTION_RATE: Record<MotionId, number> = { sustained: 0.4, walking: 1, flowing: 2, florid: 3.5 }

// ── What holds the tune up ──────────────────────────────────────────────────

/**
 * Five patterns, replacing twenty-three textures. Each is a *shape*, not a
 * composer: it is told the melody's floor and must stay under it, so the
 * accompaniment can never steal the ear or double the tune by accident.
 * `counterline` is the exception, and says so: there the second line is a
 * peer, and the piece is a duet rather than a tune with a backing.
 */
export const ACCOMPANIMENTS = {
  sustained: 'Held chords underneath: the harmony sounds once and rings, the left hand barely moving — hymn, pad, chorale',
  broken: 'The chord spread out in time and rolled low to high, continuously, under the tune — nocturne, Alberti, arpeggio figuration',
  pulse: 'The same chord struck again and again on a steady subdivision, the harmony changing only at the barline — ostinato, driving repetition',
  stride: 'A low bass note on the downbeat answered by mid-register chords on the remaining beats — waltz, march, stride',
  counterline: 'A second independent melodic line of equal weight, in dialogue with the first — two-voice counterpoint, not an accompaniment at all',
} as const
export type AccompanimentId = keyof typeof ACCOMPANIMENTS
export const ACCOMPANIMENT_IDS = keysOf<AccompanimentId>(ACCOMPANIMENTS)

// ── Form ────────────────────────────────────────────────────────────────────
//
// Four, not eleven. Form's whole job is to say which bars bring an earlier bar
// back, and where the breath falls. Eleven names could not say more than four.

export const FORMS = {
  period: 'A phrase and its answer: the second phrase begins as the first did and closes where the first only paused',
  sentence: 'A short idea, the same idea again a step or a chord away, then a longer continuation that drives to the cadence',
  arch: 'A first section, a departure to new material, then the first section again — the return is the point',
  chain: 'One idea spun out continuously without literal return; each phrase grows from the last, no repeat',
} as const
export type FormId = keyof typeof FORMS
export const FORM_IDS = keysOf<FormId>(FORMS)

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
  Gb_major: 'G-flat major — six flats; all black keys, soft and pentatonic-friendly',
  B_major: 'B major — five sharps; bright but veiled, black-key colour on the sharp side',
  A_minor: 'A minor — no sharps or flats; plain, melancholy',
  E_minor: 'E minor — one sharp; restless, plaintive',
  B_minor: 'B minor — two sharps; solemn, devotional',
  Fs_minor: 'F-sharp minor — three sharps; dark, introspective',
  Cs_minor: 'C-sharp minor — four sharps; nocturnal, veiled, quietly tragic',
  D_minor: 'D minor — one flat; grave, serious',
  G_minor: 'G minor — two flats; agitated, tragic',
  C_minor: 'C minor — three flats; stormy, fateful, heroic struggle',
  F_minor: 'F minor — four flats; brooding, passionate',
} as const
export type KeyId = keyof typeof KEYS
export const KEY_IDS = keysOf<KeyId>(KEYS)

export const METERS = {
  four_four: '4/4 — four quarter-note beats; the default, even and square',
  three_four: '3/4 — three quarter-note beats; waltz, minuet or sarabande lilt',
  two_four: '2/4 — two quarter-note beats; compact march or allegro pulse',
  six_eight: '6/8 — two dotted-quarter beats; rolling, barcarolle or gigue feel',
  nine_eight: '9/8 — three dotted-quarter beats; compound triple, a rocking 3+3+3',
  twelve_eight: '12/8 — four dotted-quarter beats; compound common time, a broad gigue or siciliano',
} as const
export type MeterId = keyof typeof METERS
export const METER_IDS = keysOf<MeterId>(METERS)

export const PALETTES = {
  diatonic: 'Plain major or natural-minor scale tones; stepwise passing notes stay inside the key',
  chromatic_approach: 'Scale tones decorated with chromatic neighbour and leading tones a semitone below their targets',
  pentatonic: 'Five-note scale with no semitones; open, folk-like or soulful, never tense',
  whole_tone: 'Six-note scale of equal whole steps; floating, rootless, augmented colour',
  modal: 'Bright raised-fourth (Lydian) colour in major keys, raised-sixth (Dorian) colour in minor keys',
  modal_dark: 'Lowered-seventh (Mixolydian) colour in major keys, lowered-second (Phrygian) colour in minor keys; archaic, shadowed',
  blues: 'Pentatonic with added blue notes (flattened third and fifth) leaned on and released; vocal, bittersweet',
} as const
export type PaletteId = keyof typeof PALETTES
export const PALETTE_IDS = keysOf<PaletteId>(PALETTES)


export const TEMPOS = {
  larghissimo: 'Extremely slow, almost still, about 16 quarter notes per minute',
  grave: 'Slow, solemn and heavy, about 30 quarter notes per minute',
  largo: 'Very slow and broad, about 50 quarter notes per minute',
  larghetto: 'Broad but a little less slow than largo, about 63 quarter notes per minute',
  adagio: 'Slow and expressive, about 66 quarter notes per minute',
  andante: 'Walking pace, about 84 quarter notes per minute',
  moderato: 'Moderate, about 104 quarter notes per minute',
  allegro: 'Fast and lively, about 132 quarter notes per minute',
  vivace: 'Lively and brisk, about 160 quarter notes per minute',
  presto: 'Very fast and driving, about 168 quarter notes per minute',
  prestissimo: 'As fast as possible, about 208 quarter notes per minute',
} as const
export type TempoId = keyof typeof TEMPOS
export const TEMPO_IDS = keysOf<TempoId>(TEMPOS)
export const TEMPO_BPM: Record<TempoId, number> = {
  larghissimo: 16,
  grave: 30,
  largo: 50,
  larghetto: 63,
  adagio: 66,
  andante: 84,
  moderato: 104,
  allegro: 132,
  vivace: 160,
  presto: 168,
  prestissimo: 208,
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
  waves: 'Rises and falls again and again in short two-bar swells, like breathing',
  late_surge: 'Stays hushed for most of the piece, then surges in the final third',
  build_then_drop: 'A long crescendo that is suddenly cut off to soft at its peak',
} as const
export type DynamicShapeId = keyof typeof DYNAMIC_SHAPES
export const DYNAMIC_SHAPE_IDS = keysOf<DynamicShapeId>(DYNAMIC_SHAPES)

export const INSTRUMENTS = {
  grand_piano: 'Acoustic concert grand piano',
  electric_piano: 'Vintage electric piano',
  harpsichord: 'Harpsichord — plucked, bright, no touch dynamics',
  church_organ: 'Pipe organ — sustained, no decay',
  strings: 'Bowed string ensemble — sustained, swelling',
  choir: 'Wordless choir',
} as const
export type InstrumentId = keyof typeof INSTRUMENTS
export const INSTRUMENT_IDS = keysOf<InstrumentId>(INSTRUMENTS)

export const BAR_COUNTS = {
  '4': 'Four bars — one short phrase, a single gesture',
  '8': 'Eight bars — a full period: a phrase and its answer',
  '16': 'Sixteen bars — a double period: two phrases with a midpoint breath',
  '32': 'Thirty-two bars — a short binary form: exposition and return',
  '64': 'Sixty-four bars — a long binary or loop: exposition, a second departure, and a full return',
} as const
export type BarCountId = keyof typeof BAR_COUNTS
export const BAR_COUNT_IDS = keysOf<BarCountId>(BAR_COUNTS)
export const BAR_COUNT_VALUES = [4, 8, 16, 32, 64] as const
export type BarCount = (typeof BAR_COUNT_VALUES)[number]

// ── Per-bar decisions ───────────────────────────────────────────────────────
//
// A bar carries its harmony and the shape of the tune over it. It does NOT
// carry a role: the role is what the form says about that bar's position, and
// a plan that could disagree with its own form was a plan the renderer had to
// defend against. `src/plan/phrase.ts` derives roles from form + bar count.

export const CONTOURS = {
  rise: 'The line climbs through the bar',
  fall: 'The line descends through the bar',
  arch: 'The line rises to a mid-bar peak and comes back down',
  dip: 'The line sinks mid-bar and comes back up',
  wave: 'The line undulates — up, down and up again, a turn figure written large',
  leap_fall: 'The line opens with a leap upward, then falls back by step to fill the gap',
} as const
export type ContourId = keyof typeof CONTOURS
export const CONTOUR_IDS = keysOf<ContourId>(CONTOURS)

// Chord labels are key-relative roman numerals. Upper-case = major quality,
// lower-case = minor; a `b` prefix lowers the root relative to the MAJOR scale
// in both modes (so the "VI" of a minor key is written bVI here). The renderer
// resolves them to spelled pitches in src/render/harmony.ts.
//
// Inversions use classical figures (I6 = third in the bass, I64 = fifth,
// V65 / V43 / V42 = the three inversions of V7). `X_of_Y` is a secondary
// dominant; `X_over_I` sits on a held tonic bass. Without these the bass can
// only leap from root to root, which is most of what made the Baroque and
// Classical styles sound like pop songs.
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

  // ── inversions: the bass moves by step instead of leaping between roots ──
  I6: 'Tonic major triad in first inversion (third in the bass); lighter than root position, keeps the bass moving',
  i6: 'Tonic minor triad in first inversion (third in the bass)',
  I64: 'Tonic major triad over the dominant in the bass (cadential six-four); leans into V',
  i64: 'Tonic minor triad over the dominant in the bass (six-four); unsettled, rocking or cadential',
  Imaj42: 'Tonic major seventh with the seventh in the bass; a passing step as the bass walks down from the tonic',
  i42: 'Tonic minor seventh with the seventh in the bass; first step of a descending lament bass',
  ii6: 'Supertonic minor triad in first inversion; the classic pre-dominant',
  ii65: 'Supertonic seventh in first inversion; the standard approach chord to a cadence',
  ii42: 'Supertonic seventh over a held tonic bass (third inversion); gentle tension above a pedal',
  ii_dim6: 'Diminished supertonic triad in first inversion (minor-key pre-dominant)',
  ii_half_dim65: 'Half-diminished supertonic seventh in first inversion (minor-key cadence approach)',
  iii6: 'Mediant minor triad in first inversion; a link in a chain of parallel sixth chords',
  iii64: 'Mediant minor triad over its fifth (the leading tone in the bass); rocks a semitone under the tonic',
  IV6: 'Subdominant major triad in first inversion',
  iv6: 'Minor subdominant in first inversion: bass a semitone above the dominant (Phrygian approach)',
  IV64: 'Subdominant major triad over a held tonic bass (pedal six-four); plagal, settling',
  iv64: 'Minor subdominant over a held tonic bass (pedal six-four)',
  V6: 'Dominant triad in first inversion (leading tone in the bass)',
  V65: 'Dominant seventh in first inversion (leading tone in the bass); pulls up to the tonic',
  V43: 'Dominant seventh in second inversion (second degree in the bass); smooth passing dominant',
  V42: 'Dominant seventh in third inversion (seventh in the bass); must fall to a first-inversion tonic',
  v6: 'Minor dominant in first inversion; a step in a descending lament bass',
  vi6: 'Submediant in first inversion: the tonic stays in the bass while the harmony slips away',
  vii_dim6: 'Leading-tone diminished triad in first inversion; a light passing dominant',
  bIII6: 'Lowered mediant major triad in first inversion; soft chromatic-mediant colour',
  bII6: 'Major triad on the lowered second degree in first inversion (Neapolitan sixth) before the dominant',

  // ── secondary dominants and chromatic passing chords ─────────────────────
  V7_of_V: 'Dominant seventh of the dominant (major chord on the second degree with a seventh); brightens toward a half cadence',
  V65_of_V: 'Dominant seventh of the dominant in first inversion: raised fourth degree in the bass, rising by semitone to V',
  V7_of_IV: 'The tonic turned into a dominant seventh, pushing toward the subdominant',
  V7_of_ii: 'Dominant seventh on the sixth degree, pulling to the supertonic (turnaround colour)',
  V7_of_vi: 'Dominant seventh on the third degree, pulling to the relative minor',
  vii_dim7_of_V: 'Diminished seventh on the raised fourth degree; sharp tension leaning into the dominant',
  bVI7: 'Dominant-seventh sonority on the lowered sixth degree (augmented-sixth chord) sliding outward to the dominant',
  sharp_i_dim7: 'Passing diminished seventh on the raised tonic, between I and ii',
  sharp_iv_half_dim7: 'Half-diminished seventh on the raised fourth degree; start of a chromatic walk-down',
  biii7: 'Minor seventh on the lowered third degree; chromatic passing step between iii and ii',
  bII7: 'Dominant seventh with raised eleventh on the lowered second degree (tritone substitute) falling to the tonic',
  V7b9: 'Dominant seventh with a lowered ninth; dark, urgent (minor-key and tango cadences)',
  V9sus4: 'Dominant ninth with suspended fourth — the subdominant triad over the dominant bass; soft, open dominant',

  // ── modal, mediant and mixture colours ───────────────────────────────────
  II: 'Major triad on the second degree (raised fourth of the key); Lydian brightness left unresolved',
  II_over_I: 'Major triad on the second degree over a tonic bass; luminous, almost bitonal Lydian shimmer',
  III: 'Major triad on the third degree: a chromatic mediant, a sudden sharp-side glow',
  VI: 'Major triad on the sixth degree: chromatic mediant, or the relative minor brightened',
  IV7: 'Dominant seventh on the fourth degree; Dorian or bluesy colour that does not resolve',
  bVII9: 'Dominant ninth on the lowered seventh degree; backdoor dominant, or a floating parallel ninth chord',
  bVIImaj7: 'Major seventh chord on the lowered seventh degree; cool modal step below the tonic',
  bVII_over_I: 'Subtonic major triad over a held tonic bass; modal, suspended',
  V7_over_I: 'Dominant seventh over a held tonic bass; tension above a tonic pedal, typical of a coda',
  iv_add6: 'Minor subdominant with added sixth; bittersweet borrowed colour in a major key',
  Iadd6: 'Tonic major triad with added sixth; pentatonic glow, a restful non-cadence',
  IVadd6: 'Subdominant major triad with added sixth; gentle, rocking away from the tonic',
  Imaj7s5: 'Tonic major seventh with raised fifth; hovering, dreamlike, unresolved',
  Imaj7s11: 'Tonic major seventh with raised eleventh; Lydian tonic, a held final colour',
  i_maj7: 'Tonic minor triad with a major seventh; the second step of a chromatic inner-line descent',
  i_add6: 'Tonic minor triad with added major sixth; Dorian warmth, a resting minor tonic',
  i11: 'Tonic minor eleventh; stacked and open, a vamp chord',
  iv9: 'Minor ninth chord on the fourth degree; pairs with a minor-ninth tonic a fifth away',
} as const
export type ChordId = keyof typeof CHORDS
export const CHORD_IDS = keysOf<ChordId>(CHORDS)

// ── The plan ────────────────────────────────────────────────────────────────

export interface BarPlan {
  /** The harmony on the downbeat — the whole bar's, unless `chord2` is set. */
  chord: ChordId
  /**
   * A second harmony for the second half of the bar (from the middle of the
   * bar; in 3/4, from the third beat): a cadential six-four moving to the
   * dominant, ii–V in one bar, a pre-dominant leaning into a cadence. Absent
   * for the one-harmony-per-bar norm.
   */
  chord2?: ChordId
  /** The shape of the singing line over this bar. */
  contour: ContourId
}

/**
 * Eleven fields. Every one of them changes sounding notes — that is the test
 * a field has to pass to be here at all. Version 2 dropped `character` (12
 * values, zero measured effect on the melody), `texture` (23 values, each an
 * independent re-implementation of the whole renderer), `arrangement`,
 * `opening`, `pedal`, `phrasing`, `hookBars` and the per-bar `role`.
 */
export interface CompositionPlan {
  version: 2
  style: StyleId
  /** Where the tune sings. */
  register: RegisterId
  /** How fast the tune moves. */
  motion: MotionId
  /** What holds it up. */
  accompaniment: AccompanimentId
  /** Which bars bring an earlier bar back, and where the breath falls. */
  form: FormId
  key: KeyId
  meter: MeterId
  palette: PaletteId
  tempo: TempoId
  dynamics: DynamicId
  dynamicShape: DynamicShapeId
  /** 4, 8, 16, 32 or 64 bars, one harmony each — two where a bar carries a `chord2`. */
  bars: BarPlan[]
}

/** The global (non-bar) fields, in the order planners decide them. */
export const GLOBAL_FIELDS = {
  register: REGISTERS,
  motion: MOTIONS,
  accompaniment: ACCOMPANIMENTS,
  form: FORMS,
  key: KEYS,
  meter: METERS,
  palette: PALETTES,
  tempo: TEMPOS,
  dynamics: DYNAMICS,
  dynamicShape: DYNAMIC_SHAPES,
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
  const parsed: BarPlan = {
    chord: parseOption(CHORDS, bar.chord, `${path}.chord`),
    contour: parseOption(CONTOURS, bar.contour, `${path}.contour`),
  }
  // Optional; `null` is what a hand-edited JSON plan uses to say "no second chord".
  if (bar.chord2 != null) parsed.chord2 = parseOption(CHORDS, bar.chord2, `${path}.chord2`)
  return parsed
}

export function parseGlobals(raw: unknown, path = 'plan'): PlanGlobals {
  if (!raw || typeof raw !== 'object') throw new PlanValidationError(`${path}: expected an object`)
  const obj = raw as Record<string, unknown>
  return {
    register: parseOption(REGISTERS, obj.register, `${path}.register`),
    motion: parseOption(MOTIONS, obj.motion, `${path}.motion`),
    accompaniment: parseOption(ACCOMPANIMENTS, obj.accompaniment, `${path}.accompaniment`),
    form: parseOption(FORMS, obj.form, `${path}.form`),
    key: parseOption(KEYS, obj.key, `${path}.key`),
    meter: parseOption(METERS, obj.meter, `${path}.meter`),
    palette: parseOption(PALETTES, obj.palette, `${path}.palette`),
    tempo: parseOption(TEMPOS, obj.tempo, `${path}.tempo`),
    dynamics: parseOption(DYNAMICS, obj.dynamics, `${path}.dynamics`),
    dynamicShape: parseOption(DYNAMIC_SHAPES, obj.dynamicShape, `${path}.dynamicShape`),
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
    throw new PlanValidationError(`plan.bars: expected an array of ${BAR_COUNT_VALUES.join(', ')} bars`)
  }
  return {
    version: 2,
    style: parseStyle(obj.style, 'plan.style'),
    ...parseGlobals(obj),
    bars: obj.bars.map((bar, i) => parseBarPlan(bar, `plan.bars[${i}]`)),
  }
}
