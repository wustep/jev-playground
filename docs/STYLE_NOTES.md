# Style notes: what we learned → what changed

Research for the six dial styles, and how each finding landed in code. The
point was breadth: outputs felt mechanical because every style had 2–4 fixed
eight-bar progressions, 1–2 phrase layouts, one texture that dominated, and no
inverted chords at all (so every bass leapt root to root, like a pop song).

**Evidence labels.** *Score* = read in a public-domain score encoding (Mutopia
LilyPond sources). *Corpus* = counted over expert annotations (DCML Beethoven
sonatas). *Analysis* = a freely readable published analysis or liner note.
*Own words* = the musician's own teaching or site. *Inferred* = a stylistic
suggestion, not a transcription. Nothing here claims that commercial sheet
music exists unless a page showing it was actually fetched (two cases, both
the artists' own shops, noted below).

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

## Nahre Sol

The verifiable record is thin, and several of the old assumptions had no
source. She sells her own PDF scores (nahresol.com/shop — page fetched; contents
not seen), so ground truth exists; we did not use it.

**Learned**
- *Own words* (nahresol.com/bio, /about): "an eclectic mixture … improvisation,
  the avant-garde, traditional Western forms and harmony, jazz, and minimalism";
  the album draws on "minimalism, jazz, and French music from the 20th century";
  Steve Reich is "one of my greatest musical heroes" (she builds by layering from
  one rhythmic motive); Bach, Pärt, Satie, Ravel, Piazzolla.
- *Analysis* (third-party): "both hands overlapping over the keyboard, allowing
  her harmonies to be close and tense"; "crystalline, Bach-like contrapuntal
  lines"; "a few incredibly beautiful harmonic surprises". Titles: *Coucou
  Waltz*, *First Tango*, *Sideways*, exercises on major sevenths, suspensions,
  ii–V–I cycles, bitonal arpeggios, broken sixths and stride.
- **Not supported by any source**: 3+3+2 ostinatos as a hallmark, quartal/add9
  voicings, Lydian/Dorian colour, odd meters.

**Changed**
- Brief rewritten from her own words. Archetypes: layered pulse, playful wit,
  warm song, waltz/tango, toccata flow, stillness.
- `syncopated_ostinato` demoted from 50 % to one texture among eleven;
  `interlocking_hands` (close seconds, shifting accents), `two_voice_counterpoint`,
  `chordal_melody`, `stride_dance` promoted. Forms `layered_build`, `arch_return`.
- Harmony (all *inferred*): maj7 and sus colour, circle-of-fifths and ii–V–I
  units, `II_over_I` bitonal shimmer, chromatic-mediant `surprises` late in the
  phrase. One inferred phrase (i–bVI–bIII–bVII) was dropped: it *is* the pop loop.

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

---

## Left out, on purpose

- **New meters.** Every report asked for them (2/4 and cut time for Beethoven,
  9/8 for Debussy, 3/8 and 12/8 for Bach). Each texture carries per-meter tables
  and the engraver has per-meter beaming rules, so this is its own change.
- **Two chords in a bar.** Cadential 6/4–V7 and ii–V want it; the renderer is
  one-harmony-per-bar throughout.
- **Tuplets.** Moonlight's triplets and Glass's 2-against-3 in 4/4 are
  approximated on the sixteenth grid.
