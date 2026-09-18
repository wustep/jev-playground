# Style notes: what we learned → what changed

Research for the eight dial styles, and how each finding landed in code. The
point was breadth: outputs felt mechanical because every style had 2–4 fixed
eight-bar progressions, 1–2 phrase layouts, one texture that dominated, and no
inverted chords at all (so every bass leapt root to root, like a pop song).

**Evidence labels.** *Score* = read in a public-domain score encoding (Mutopia
LilyPond sources). *Corpus* = counted over expert annotations (DCML Beethoven
sonatas). *Analysis* = a freely readable published analysis or liner note.
*Own words* = the musician's own teaching or site. *Inferred* = a stylistic
suggestion, not a transcription. Nothing here claims that commercial sheet
music exists unless a page showing it was actually fetched (Elijah Fox's
shop, noted below).

Where things live: enums in `src/plan/schema.ts`; per-style archetypes and
harmony books in `src/plan/styles.ts`; phrase layouts in `src/plan/forms.ts`;
textures in `src/render/textures/*`.

## What changed for every style

| Before | After |
| --- | --- |
| 2–4 whole 8-bar progressions per style and mode; 16/32 bars = the same ones concatenated | A harmony *grammar*: 2-bar heads, travelling units and tails, verified 4-bar phrases, chord cycles, pedals, codas, finals, substitutions. A unit test asserts ≥ 40 distinct 8-bar progressions per style in 60 seeds |
| 1–2 role layouts per length, copy-pasted across styles | 11 forms × 4 lengths (`period`, `sentence`, `spinning_out`, `binary_dance`, `arch_return`, `additive_loop`, `mosaic_pairs`, `layered_build`, `vamp_and_tag`, `call_and_response`, `free_fantasia`) |
| Independent priors → "presto chorale" | A **character** is decided first (12 of them); each style has 5–6 archetypes that override priors jointly, so a sarabande is slow *and* in 3/4 *and* sung |
| 50 chords, root position only | 107: inversions (`I6`, `I64`, `V65`, `V43`, `V42`, `ii65`, `iv6` …), secondary dominants, pedal chords (`IV64`, `V7_over_I`), Neapolitan, chromatic mediants, mixture and jazz colours. The renderer puts the label's bass note at the bottom |
| 10 textures | 22 (+ per-piece figure variants inside the old ones) |
| 5 contours, 7 roles | 9 contours (`wave`, `leap_fall`, `drop_rise`, `pendulum`), 11 roles (`sequence`, `echo`, `surprise`, `dissolve`) |
| Flat velocities per bar | Within-bar hairpins, metric accent and touch that depend on the character; restatements replay the opening tune |
| I–V–vi–IV loops (Glass major had *only* that) | Removed from every book; a guard re-rolls any progression whose roots spell the loop in any rotation (unit-tested over 480 plans) |

Live Jev got the same treatment (`src/planner/jev/requests.ts`,
`src/planner/JevPlanner.ts`), driven by what its real distributions looked
like once a key existed:

- Asked "what is most characteristic of Beethoven?", Jev answered C minor /
  block chords / allegro at 90–100 % — every time. Now request 1 asks only
  about **character**: one Choice (most typical) plus one Noul per character
  ("is this a real part of their output?"). Code combines them, draws one, and
  conditions every later question on it. Measured: Beethoven *lyrical song* →
  A♭ major, adagio, *p*, period; *playful wit* → D major, 3/4, scherzo.
- Per-bar role questions (60 of them, asked in parallel) came back as
  "statement, development, half cadence ×4, cadence". Replaced by one **form**
  Choice that code expands. The fan-out request fell from ~16k to ~3.7k tokens.
- Sampling squared the probabilities, which erased what variety there was.
  Now nucleus sampling (top 90 %) at face value, a novelty policy that keeps
  sampled progressions from squatting on the tonic, and an argmax final bar.

---

## Bach

**Learned**
- *Score* (BWV 846, Mutopia): the C-major prelude is almost entirely inverted
  chords — I, ii4/2, V6/5, I, vi6, V4/2 of V, V6, I4/2 … then a dominant pedal
  (bars 24–31) and a tonic pedal (32–35). Figure order 1-2-3-4-5-3-4-5, twice a
  bar; the last bars break into a free sweep and a block chord.
- *Score* (BWV 847): bars 1–4 are i – iv6/4 – vii°7 – i over a tonic pedal; the
  figure is outer tone, pivot, lower neighbour, pivot, inner tone, pivot, lower
  neighbour, pivot, mirrored in the left hand.
- *Analysis* (Bruhn; Open Music Theory; Oxford chorale notes; de Clercq 2015):
  Fortspinnung = opening, sequence, cadence; binary dances cadence in V (major)
  or III (minor) at the double bar; chorale cadences are 73 % authentic, 21 %
  half; minor chorales almost always end major; lament basses.
- *Score*: the Inventions' meters are 4/4 ×8, 3/8 ×3, 3/4 ×2, 9/8, 12/8; the
  Goldberg aria cadences in I, V, vi, I at bars 8/16/24/32.

**Changed**
- Archetypes: prelude (`flowing_perpetual`), invention (`playful_wit`), chorale
  (`solemn_hymn`), sarabande/aria (`lyrical_song`), gigue/minuet (`dance_lilt`),
  minor toccata (`stormy_drama`).
- Harmony book seeded with the verified phrases above (BWV 846 bars 1–4, 5–8,
  8–11, 16–19, 20–23, 24–27, 32–35; BWV 847 bars 1–4; Goldberg bars 1–8; chorale
  formulas; diatonic and chromatic laments); Picardy third among the minor finals.
- Forms: `spinning_out` (its 32-bar layout *is* the prelude's plan) and
  `binary_dance` (its 32-bar layout puts cadences where the Goldberg aria does).
- Textures: `toccata_perpetual` (the 847 figure), `aria_walking_bass` (with
  on-the-beat mordents, sarabande and siciliano rhythms), `stride_dance` for
  minuets; the prelude figure gained sibling patterns and the penultimate-bar sweep.
- Contours: `pendulum` (compound melody) and `leap_fall` (gap-fill).

## Beethoven

**Learned**
- *Corpus* (DCML annotations of 64 sonata movements): the commonest labels in
  major are I, V, **I6**, V7, **V6, V4/3, V4/2, cadential 6/4**, IV, ii6, V6/5;
  in minor i, V, V7, i6, cadential 6/4, iv, V6 … iii is rare. Secondary
  dominants: V/V ≫ V/IV > V/ii > V/vi. Mixture: iv, iv6, bVI. Cadences:
  PAC 621, HC 415, IAC 284, deceptive 15. One chord is often held 2–4 bars.
- *Corpus / score*: Moonlight bars 1–5 are i – i4/2 – VI→**bII6** – V7 – i (the
  third chord is the Neapolitan sixth, not ii°6); Op. 2/1 is Schoenberg's model
  sentence (i, i, V6/5, V6/5 | i, vii°6, ii°6, V + fermata); Waldstein opens
  I → V/V → V6 and restarts a tone lower on bVII; Für Elise is i–V–i–V then
  III–VII–i–V; Tempest finale i–iv–bII–V6.
- *Analysis*: dynamics avoid the middle — *pp* against *ff*, crescendo cut off
  by a sudden *piano*, chains of *sf*. Opening meters of 91 movements: 3/4 25,
  2/4 24, 4/4 16, 6/8 10.

**Changed**
- Archetypes: storm, adagio cantabile, Moonlight stillness (C♯ minor added as a
  key), heroic, scherzo, solemn march. *mf* and *mp* removed from the priors.
- Harmony book rebuilt on the verified phrases; `holds: true` lets a chord sit
  across a barline; Neapolitan, augmented-sixth (`bVI7`) and vii°7/V added.
- Forms weighted to `sentence` and `period`; new dynamic shape `build_then_drop`.
- Textures: `tremolo_storm` (Pathétique Allegro), `rolling_nocturne` (the tune
  waits one bar, then a dotted upbeat into a long note), `pulsing_chords`
  (Waldstein; the Allegretto ostinato), `scherzo_staccato`. Alberti got three figures.
- Not done: 2/4 is the biggest gap in the meter enum (see "Left out").

## Debussy

**Learned**
- *Score* (Arabesque 1, Clair de lune, Danseuses de Delphes, Voiles — Mutopia):
  bars are routinely duplicated (Clair 27 = 28, 31 = 32; Arabesque 6–7 = 8–9;
  Danseuses 1 ≈ 2); Arabesque opens with parallel first-inversion triads
  IV6–iii6–ii6–I6 and reaches an unresolved V9; Clair opens I6 with no root in
  the bass, sits four bars on ii9, and ends I – iii – bIII6 – I, *ppp morendo* —
  no dominant. 85–90 % of dynamic markings are *p* or softer.
- *Analysis* (DeVoto; Varela on *La fille*; Pearson guide on *Estampes*;
  Wikipedia): closes are plagal, ii–I, bVII–I, v–I, Phrygian bII–i, or a minor
  piece brightening to major; planing of triads, ninths and hollow fifths;
  pedal points; pentatonic on the black keys (D♭, G♭, B, E, F♯ dominate);
  *Cathédrale* is an arch with the return as an echo.

**Changed**
- Archetypes: haze, arabesque flow, stillness (*Des pas*, *Cathédrale*), song
  (*La fille*, *Rêverie*), cakewalk wit, whole-tone veils. G♭ and B major added.
- Closed tails contain **no V7–I**; verified phrases seeded; finals are added-sixth
  and added-ninth tonics; the ii9 pedal is in `pedals`.
- Forms: `mosaic_pairs` (2-bar ideas said twice) and `arch_return` (echo return,
  `dissolve` ending). Palette `modal_dark` (Mixolydian / Phrygian).
- Textures: `bell_organum`, `melody_over_ostinato`, `chordal_melody`; planing
  picks one of three shapes per piece; floating rhythms may enter off the beat.
- The melody scale now bends to chromatic chord tones, so a line over bVI or II
  doesn't rub against it.

## Philip Glass

Scores are in copyright; nothing here relies on sheet music. Sources are liner
notes (Karis, philipglass.com), theses (Wu on *Opening*; Carroll on the Études;
Delport on the Tirol Concerto), the IRCAM survey, and Wikipedia.

**Learned**
- *Analysis*: "a series of chords, often mere triads, repeated as in a theme
  and variations", related by thirds and common tones; pre-dominants avoided;
  six-four chords used freely; **the same cycle returns with a new bass** —
  inversion as variation. Verified cycles: Mad Rush (F major ↔ A minor over E,
  i.e. bVI ↔ i6/4), Étude 17 / Tirol (i–bVI–bIII–V, i–bVI–bVII–V7, i–bIII–V–V7),
  *Opening*'s three loops with a "loop breaker" bar, Einstein's three-chord
  i–bVII–bIII, *The Hours*' Imaj7 ↔ i7. Cycles are 2, 3, 5 or 8 chords long as
  often as 4. *Opening* is F minor (the old guess, C minor, was wrong).
- Dynamics are per-block terraces and subito changes, not an arch; pieces stop
  on a low tonic or a tonic six-four rather than cadence.
- Not verifiable without the scores, so not encoded: the exact chords of
  Metamorphosis One/Two, the Satyagraha aria cycle.

**Changed**
- The old book's I–vi–IV–V and i–bVI–bIII–bVII loops are gone; `loops` holds the
  verified cycles, `subs` re-voices them on later passes, `surprises` is the
  breaker bar, finals include `i64` and `IV64`.
- Forms: `additive_loop`, `layered_build`. Key priors moved to F/G/A/D minor.
- Textures: `melody_over_ostinato` (Metamorphosis), `pulsing_chords` (with the
  Étude 6 single repeated note), `displaced_arpeggio`, `interlocking_hands`;
  `minimal_cells` picks one of three cell families per piece.
- **Second pass, after listening: it was still too locked.** The first version
  hammered one figure for sixteen bars, which is the caricature, not the music —
  the sources above all describe *process* (Two Pages adds a note per repeat;
  *Opening* swaps a "loop breaker" bar; Tirol gives each section a new bass;
  Mad Rush alternates blocks). So:
  `minimal_cells` now moves one *stage* every two bars — bare cell → one note
  added → rotated to start a note later (phase) → both, with a colour tone on
  top — then repeats the cycle an inversion higher, thinning the left hand to a
  slow bass in one stage of four; loop-built harmony switches to a **second
  cycle for the middle of the piece** and returns to the first to close; the
  additive forms trade plain `restatement` bars for `development` / `sequence` /
  `echo`; `minimal_cells` fell from 45 % to 28 % of the pulse archetype (20 %
  overall) in favour of `displaced_arpeggio`, `interlocking_hands` and
  `melody_over_ostinato`; static contours fell from 45 % to 28 %. The brief
  handed to Jev now describes the process rather than the ostinato.

## Laufey

Scores are in copyright; nothing here is a transcription. Sources are public
bios, interviews and album notes (*Typical of Me*, *Everything I Know About Love*,
*Bewitched*). She replaced Nahre Sol on the dial: Nahre’s eclectic mix was hard
to replicate and sat too close to Glass / Fox / Zimmer; Laufey is a
contemporary woman with a clearer, song-shaped jazz-pop idiom.

**Learned**
- *Own words / bios*: Icelandic-Chinese singer-songwriter pianist; jazz
  standards and mid-century pop as the home language; writes at the piano for
  voice. Intimate, romantic, unhurried. Major-key song forms more than
  through-composed miniatures.
- *Analysis / inferred*: swinging or lightly syncopated accompaniment under a
  clear singing melody (chordal melody, alberti-ish broken chords, soft stride);
  ii–V colour, major sevenths, occasional chromatic approach; not the dense
  ninth/thirteenth stacks of modern jazz piano. Soft dynamics. Distinct from
  Elijah Fox on the same dial: Fox is impressionist/psychedelic jazz
  miniatures with displaced arpeggios and ambient haze; Laufey is
  song-shaped jazz-pop / standards energy — clearer melody and groove.

**Changed**
- Archetypes: lyrical song (high), warm groove (high), dreamy haze (medium),
  playful wit (low-medium), meditative stillness (low).
- Forms: `period`, `arch_return`, `vamp_and_tag`, `call_and_response`.
  `holds: true`.
- Textures: `chordal_melody`, `alberti_melody` and `stride_dance` lead;
  `displaced_arpeggio` and interlocking-hand process music stay off the book.
- Harmony: major-key ii–V–I and I–vi–ii–V families, inversions for a walking
  bass, light maj7 colour; no I–V–vi–IV. Minor book is standard jazz-ballad
  (i–iiø–V–i), not stacked ninths.
- Instruments: grand piano first, electric piano as a light colour.
- Brief names no other dial composer.

## Elijah Fox

His own store sells official scores (elijahfoxofficial.com/collections/sheet-music —
page fetched; contents not seen). The harmonic evidence below is from his own
lessons, not from those scores.

**Learned**
- Bios (Wikipedia, agency, Nord, venue pages) describe "jazz, Impressionism, and
  psychedelic soul"; Oberlin-trained (Sullivan Fortner, Billy Hart). Neo-soul
  appears only as a secondary flavour; **no source calls him a gospel player,
  and "felt piano" is unverified** — both were in the old brief.
- *Own words* (Flypaper / Soundfly lessons): *City in the Sky* is modal mixture —
  A♭maj7 (bVI, from C minor) against Fmaj7 (IV, from C major), then Cmaj7(♯5)
  with F6, closing on a vi – V – ♯ivø7 – biii – ii walk. His displacement lesson
  regroups continuous sixteenths over F–9 and C–9 as 5+5+6, 7+5+4, 4+3+5+4.
  Syllabus: repeated-note runs, inner-voice movement, chordal melodies, loops, AABA.
- Low-reliability metadata suggests triple meter and sharp keys are common.

**Changed**
- Brief rewritten. Archetypes: haze, song, groove (the neo-soul side, 20 %),
  pattern flow, ambient stillness. Keys no longer flat-only; 3/4 is first-class.
- Harmony: the three verified progressions lead the book; ii–V, backdoor and
  tritone material kept as a labelled generic minority; open endings and vamps
  outweigh closed cadences; finals are held colour chords (`Imaj7s11`, `I6_9`).
- Textures: `displaced_arpeggio` (his accent groupings, verbatim), `chordal_melody`
  (inner voice sliding by half-steps). Form `vamp_and_tag`; its 32-bar layout is AABA.
- New chords for him: `Imaj7s5`, `IVadd6`, `sharp_iv_half_dim7`, `biii7`,
  `iv_add6`, `bII7`, `V9sus4`, `bVII9`.

## Chopin

Scores are public domain; the book is modelled on well-known nocturne, waltz,
mazurka, prelude and ballade cadences rather than a bar-by-bar corpus count.

**Learned**
- *Score / analysis* (Op. 9/2, Op. 27, Op. 28 preludes, mazurkas, ballades): a
  singing right-hand cantabile over rolling left-hand figuration; mazurka and
  waltz lilt in triple meter; études as unbroken figuration; ballades and
  scherzos as storm. Favourite keys sit on the flat side and on C♯ / B / F♯
  minor. Harmony stays functional: secondary dominants, Neapolitan sixths,
  cadential 6/4, clear V–I and half cadences, with chromatic approach over a
  diatonic frame. Pedal is assumed.
- *Inferred* from the same repertoire: character mix weights nocturne and dance
  above étude, ballade, stillness and wit.

**Changed**
- Archetypes: nocturne (`lyrical_song`), mazurka/waltz (`dance_lilt`),
  ballade/scherzo (`stormy_drama`), étude (`flowing_perpetual`), slow prelude
  (`meditative_stillness`), light waltz joke (`playful_wit`).
- Harmony book seeded with nocturne and waltz cadences (`ii6–I64–V7–I`,
  `V43–I6–V7–I`, Neapolitan `i–i42–bII6–V7`); `holds: true`.
- Textures: `rolling_nocturne`, `alberti_melody`, `chordal_melody`,
  `stride_dance`, `dramatic_chords`, `broken_chord_prelude`. Grand piano.
- Brief names no other dial composer.

## Hans Zimmer

Scores are in copyright; nothing here is a transcription. Sources are liner
notes, published film-music analyses, and the well-known piano/hybrid cues of
the 2000s–2020s (ostinato builds, pedal drones, minor-key gravity, late surges).

**Learned**
- *Analysis / inferred*: slow-building layered ostinatos; simple diatonic or
  modal loops that escalate rather than rotate additively; melody over a
  repeating left-hand figure; pedal drones; sparse openings that surge late;
  occasional warm major anthems. Pulse + crescendo drama, not cell-process
  minimalism as the only mode.
- The four-chord pop loop (i–bVI–bIII–bVII and I–V–vi–IV) is still banned.
  Closest film-score loops that stay legal: i–bVI–bVII–V, i–iv–bVI–V, held
  i–bVI drones, plagal and modal closes.

**Changed**
- Archetypes: ostinato pulse, heroic anthem, hymn/processional, drone
  stillness, storm/action, restless layered search.
- Forms: `layered_build`, `additive_loop`, `vamp_and_tag`, `arch_return`.
- Textures: `melody_over_ostinato` and `pulsing_chords` lead; `minimal_cells`
  is a minority colour. Dynamics prefer `crescendo` and `late_surge`.
  `holds: true`. Instruments: grand piano, strings, electric piano.
- Brief describes the build-and-melody idiom without naming another dial style.

---

## Harmonic rhythm and motif (second pass, 2026-09-18)

A repertoire-vs-output gap pass found two structural holes that no amount of
harmony-book breadth fixes: every bar carried exactly one chord, and a
`sequence` or `restatement` bar reused the previous bar's *rhythm* but drew a
fresh, unrelated line for its pitches. Evidence, from public-domain MIDI
analysed locally (Mutopia encodings; nothing under `docs/ref-midi/` ships):

| Piece | Bars with two harmonies | Bars on the previous bar's harmony | Longest hold |
| --- | --- | --- | --- |
| Bach, WTC I prelude in C (BWV 846) | 0 % | 9 % | 2 |
| Bach, Invention 1 (BWV 772) | 41 % | 10 % | 3 |
| Chopin, Prelude Op. 28/4 | 27 % | 16 % | 3 |
| Chopin, Prelude Op. 28/6 | 31 % | 36 % | 4 |

In the prelude 33 of 34 bar pairs share the top line's rhythm exactly: the
whole piece is one figure carried onto each new chord. In the invention 15 of
21 pairs do, mostly as sequences. (The DCML Beethoven corpus notes above
already said "one chord is often held 2–4 bars"; the living-artist styles are
inferred from the traits in their sections, not from transcriptions.)

**Changed**
- `BarPlan.chord2` (optional): a second harmony from the half bar (the third
  beat in 3/4). Each harmony book has `splits` — [approach, arrival] pairs such
  as ii6/5–V7, I6/4–V, ii7–V7 — and the heuristic planner applies one to the
  bar that arrives on a matching chord where a phrase closes, pauses or runs
  on. Glass and Zimmer have none: their harmony never moves faster than the
  bar. Jev gets an extra Choice on those bars only (in the same request, so
  no extra round trip): keep one harmony, or name the approach chord.
- `holds: true` now does something: a piece decides once whether its opening
  idea sits on one chord for two bars, whether its chord cycle moves at half
  speed (each chord two bars — the drone, the held block), and whether a
  phrase may open on the chord the last one closed on.
- The renderer plays a split bar by rendering it on both chords with the same
  random draws and memory, then splicing at the split tick; a crossing note
  holds through only when every pitch is a common tone. No texture had to learn
  about mid-bar harmony.
- Motif memory: a line remembers its statement (with its chord) and its
  previous bar's figure. `sequence` / `echo` move the previous figure onto the
  new chord by the interval between the roots, diatonically, so a tonal
  sequence changes quality with the harmony. A `restatement` over a related
  chord (two common tones) keeps the tune and settles strong beats on the new
  harmony; over a distant chord it is transposed. `development` states the
  head of the motif on the new chord and repeats the fragment a step on.

Measured over 40 sampled 16-bar plans per style (heuristic planner):

| Style | Held bars before → after | Split bars | Sequence/echo with the previous bar's shape | Restatement with the statement's shape |
| --- | --- | --- | --- | --- |
| Bach | 0 → 0 % | 8 % | 10 → 22 % | 42 → 57 % |
| Beethoven | 5 → 8 % | 9 % | 28 → 62 % | 56 → 82 % |
| Chopin | 1 → 9 % | 8 % | 19 → 57 % | 36 → 60 % |
| Debussy | 3 → 20 % | 3 % | 29 → 61 % | 46 → 48 % |
| Glass | 9 → 30 % | 0 % | 56 → 81 % | 41 → 45 % |
| Zimmer | 6 → 25 % | 0 % | 33 → 80 % | 23 → 41 % |
| Laufey | 2 → 12 % | 7 % | 18 → 65 % | 25 → 73 % |
| Fox | 2 → 20 % | 2 % | 19 → 40 % | 28 → 44 % |

Bach's low sequence figure is the measure, not the music: its running lines
are stepwise fills between transposed anchors, and the prelude figure has no
melody line at all (it is transposed by construction).

## Left out, on purpose

- **New meters.** Every report asked for them (2/4 and cut time for Beethoven,
  9/8 for Debussy, 3/8 and 12/8 for Bach). Each texture carries per-meter tables
  and the engraver has per-meter beaming rules, so this is its own change.
- **Two chords in a bar beyond cadences.** Cadence bars can now split (see
  above); the invention's 41 % two-chord bars are sequence-driven, and a
  travelling unit at two chords a bar is still to do.
- **Tuplets.** Moonlight's triplets and Glass's 2-against-3 in 4/4 are
  approximated on the sixteenth grid.
