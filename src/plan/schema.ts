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
  chopin: 'Chopin',
  debussy: 'Debussy',
  glass: 'Philip Glass',
  hans_zimmer: 'Hans Zimmer',
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

// The piece's character is decided FIRST and then handed to every later
// decision as context. It is what lets one style produce a hymn on one
// generation and a toccata on the next while each plan stays coherent
// (slow tempo with soft dynamics with a singing texture …).
export const CHARACTERS = {
  lyrical_song: 'A slow, singing melody over a simple accompaniment; tender and intimate',
  stormy_drama: 'Turbulent and forceful: driving rhythm, sharp accents, minor-key tension',
  flowing_perpetual: 'Continuous even figuration that never stops; a smooth stream of fast notes',
  solemn_hymn: 'Grave, chordal and measured, like a hymn or a slow procession',
  dance_lilt: 'A light, lilting dance in a swinging triple or compound meter',
  playful_wit: 'Quick, witty and light on its feet: detached notes, surprises, off-beat accents',
  meditative_stillness: 'Very slow and spare: long tones, silence and resonance; time almost stops',
  hypnotic_pulse: 'A steady motoric pulse of small repeating patterns that change only gradually',
  dreamy_haze: 'Soft, blurred and floating; veiled colours and no hard edges',
  heroic_bright: 'Bright, confident and extroverted: major-key energy and strong rhythm',
  warm_groove: 'A relaxed, warm groove with laid-back syncopation; unhurried and soulful',
  restless_searching: 'Uneasy and searching: shifting harmonies, questions left unanswered',
} as const
export type CharacterId = keyof typeof CHARACTERS
export const CHARACTER_IDS = keysOf<CharacterId>(CHARACTERS)

// How the bars are laid out as phrases. Code expands a form into per-bar roles
// (src/plan/forms.ts); the renderer only ever reads the roles.
export const FORMS = {
  period: 'Question and answer: a phrase that pauses on an open half cadence, then the same opening again, this time closing firmly',
  sentence: 'A short idea, its immediate repetition, then fragments that accelerate into one single cadence',
  spinning_out: 'An opening gesture spun out through sequences — one figure stepping through new harmonies — into a closing cadence',
  binary_dance: 'Two balanced halves: the first travels away and pauses open, the second starts from the far point and works its way home',
  arch_return: 'Statement, a contrasting middle in a new colour or register, then a return of the opening, often as a quieter echo',
  additive_loop: 'A short chord loop repeated many times, each pass adding or changing one small thing; no real cadence until it simply stops',
  mosaic_pairs: 'Short two-bar ideas, each immediately repeated and then set beside a new one like tiles; little development, a fading close',
  layered_build: 'Starts bare and adds a layer every few bars, building to a peak near the end before a brief release',
  vamp_and_tag: 'A relaxed vamp that circles with small variations and fills, then a short tag ending on a held colour chord',
  call_and_response: 'A bold call answered each time by a softer or contrasting reply',
  free_fantasia: 'Improvisatory and through-composed: gestures follow one another freely with pauses and surprises, no literal repeats',
} as const
export type FormId = keyof typeof FORMS
export const FORM_IDS = keysOf<FormId>(FORMS)

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
  aria_walking_bass:
    'Ornamented singing right-hand line over a steadily walking left-hand bass in even eighth notes',
  toccata_perpetual:
    'Both hands in relentless sixteenths: a zig-zag figure pivoting around one chord tone and its lower neighbour, mirrored between the hands',
  stride_dance:
    'Dance accompaniment: a low bass note on the downbeat answered by mid-register chords on the other beats (waltz or stride), under a lilting tune',
  rolling_nocturne:
    'Slow rolling broken chords in the middle register over deep sustained bass octaves, with a sparse long-note melody ringing on top',
  tremolo_storm:
    'Left-hand broken-octave tremolo rumbling under rising detached right-hand chords and sudden scale rushes; agitated',
  pulsing_chords:
    'Repeated pulsing eighth-note chords, low and even, the harmony changing slowly, with short melodic fragments flickering above',
  melody_over_ostinato:
    'A small rocking left-hand figure repeated unchanged while a slow, sparse melody of long notes and rests floats above',
  interlocking_hands:
    'Hands overlapped in one register, alternating rapid notes in close seconds and clusters with shifting off-kilter accents',
  displaced_arpeggio:
    'Continuous sixteenth-note chord arpeggios whose accents fall in uneven groups (5+5+6, 7+5+4), a colour tone on top, over a plain bass',
  chordal_melody:
    'Melody carried as the top note of close mid-register chords while an inner voice slides by half-steps; sparse bass, intimate',
  bell_organum:
    'Hollow parallel fifths and octaves moving slowly in block chords, framed by bell-like octaves in the extreme registers, pedal held',
  scherzo_staccato:
    'Light detached chords and quick upbeat figures tossed between the hands, with rests, sudden accents and dynamic jokes',
} as const
export type TextureId = keyof typeof TEXTURES
export const TEXTURE_IDS = keysOf<TextureId>(TEXTURES)

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
  sequence: 'Repeats the previous bar\'s figure exactly, moved onto a new harmony a step or a fifth away',
  echo: 'Repeats the previous bar much more softly, like a distant reply',
  surprise: 'An unexpected harmonic turn: a chord from outside the key, lit up for a moment',
  dissolve: 'Thins out and fades: fewer notes, softer, the texture evaporating',
} as const
export type BarRoleId = keyof typeof BAR_ROLES
export const BAR_ROLE_IDS = keysOf<BarRoleId>(BAR_ROLES)

/**
 * The four newer roles are inflections of an older one. Renderer gesture
 * tables are keyed by the base role; the inflection (reuse the last bar's
 * figure, drop the dynamic, thin the texture …) is applied on top.
 */
export type BaseRoleId = Exclude<BarRoleId, 'sequence' | 'echo' | 'surprise' | 'dissolve'>
export const ROLE_BASE: Record<BarRoleId, BaseRoleId> = {
  statement: 'statement',
  restatement: 'restatement',
  development: 'development',
  contrast: 'contrast',
  climax: 'climax',
  half_cadence: 'half_cadence',
  cadence: 'cadence',
  sequence: 'development',
  echo: 'restatement',
  surprise: 'contrast',
  dissolve: 'contrast',
}

export const CONTOURS = {
  rise: 'Melodic line climbs through the bar',
  fall: 'Melodic line descends through the bar',
  arch: 'Line rises to a mid-bar peak and returns',
  dip: 'Line sinks mid-bar and returns',
  static: 'Line hovers around one pitch',
  wave: 'Line undulates: up, down and up again, like a turn figure written large',
  leap_fall: 'Line opens with a leap upward, then falls back by step to fill the gap',
  drop_rise: 'Line drops suddenly, then climbs back by step',
  pendulum: 'Line swings between a high and a low register, implying two voices in one',
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
  chord: ChordId
  role: BarRoleId
  contour: ContourId
}

export interface CompositionPlan {
  version: 1
  style: StyleId
  /** Decided first; every later decision is conditioned on it. */
  character: CharacterId
  /** Phrase layout. `bars[].role` is its expansion and is what the renderer reads. */
  form: FormId
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
  character: CHARACTERS,
  form: FORMS,
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
    character: parseOption(CHARACTERS, obj.character, `${path}.character`),
    form: parseOption(FORMS, obj.form, `${path}.form`),
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
