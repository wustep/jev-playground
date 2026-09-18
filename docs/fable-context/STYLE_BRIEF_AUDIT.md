# Style brief audit

Fable, 2026-09-18. Read of `wustep/jev-playground` on `main` (`f70c206`, PRs #32 and #34 merged). Rewrites `STYLE_PROFILES[style].brief` in `src/plan/styles.ts` — the prose handed to Jev when *Style brief* is on.

**Goal.** Choices and (when the brief is on) later globals/phrases steer toward each composer’s actual keyboard language, not generic “singing melody / functional harmony / ostinato build” mush. Stephen called out weak Chopin and Zimmer; Laufey is newer and needed the same teeth.

**Rule of a good brief.** One to three tight sentences: LH / texture / rhythmic feel; harmonic habits; what 8–16 bars actually do; negative space against neighbouring dial styles — without naming those composers (existing STYLE_NOTES constraint). Short enough for System One state. No sheet-music claims beyond `docs/STYLE_NOTES.md` (public-domain scores, published analyses, living artists’ own teaching).

**Also checked, left unchanged.**

- README has no per-style blurbs — only the dial name list.
- Score criteria in `src/planner/jev/requests.ts` name the composer but are generic level rubrics (`texture, chord vocabulary, tempo, dynamics and instrument`). They do **not** copy the old briefs, and the `score` op does not receive `brief` at all. Restating `match_*` to judge form / arrangement / opening is already specified as A5 in `JEV_REQUEST_STRUCTURE_REVIEW.md`; not this PR.
- UI taglines in `src/ui/styleTheme.ts` never reach a planner.

---

## Bach

**Before.** German Baroque keyboard music, c. 1720. Functional harmony whose bass moves by step through inverted chords, circle-of-fifths sequences, pedal points and clear dominant–tonic cadences. Pieces are preludes of unbroken figuration, two-part inventions, chorales, or binary dances (sarabande, minuet, gigue). Dynamics change in blocks, not swells. Written for harpsichord, clavichord and organ.

**After.** German Baroque keyboard, c. 1720: the bass walks by step through inversions (I–ii4/2–V6/5), circle-of-fifths sequences and pedal points — not a singing tune over wide arpeggios, not root-to-root leaps. Eight to sixteen bars are a spun-out head–sequence–cadence or a binary-dance strain that cadences in V (major) or III (minor) at the midpoint; textures are unbroken prelude figuration, two-part invention, four-part chorale, or sarabande/gigue. Terraced dynamics on harpsichord or organ — dry, no swells, no rubato.

**Why.** The old brief listed piece types and “functional harmony” without saying what an 8–16 bar stretch *does*, and without fencing off Chopin’s cantabile or a pop bass. The inversions and V/III midpoint cadence are the WTC / Goldberg / chorale facts already in STYLE_NOTES.

## Beethoven

**Before.** Viennese Classical-to-Romantic piano music, c. 1800. Tonic and dominant in every inversion, cadential six-fours, diminished-seventh shocks, Neapolitan and minor-subdominant colour; one harmony may be held for bars before the pace quickens into a cadence. Themes are sentences and periods built from a short motto. Dynamics avoid the middle: pianissimo against fortissimo, long crescendos cut off by a sudden piano, sforzando accents. Stormy tremolo-and-chords allegros, singing adagios, staccato scherzos, solemn marches. Written for the piano.

**After.** Viennese piano, c. 1800. A short motto becomes a sentence or period; one harmony often sits two to four bars, then the pace snaps into a cadential 6/4–V–I, a diminished-seventh jolt or a Neapolitan. Left hand is Alberti, repeated chords, octaves or storm tremolo — not a rolling wide-span nocturne, not a rotating cell — and dynamics skip the middle: pianissimo against fortissimo, crescendo cut by sudden piano, sforzando; stormy allegros, singing adagios, staccato scherzos, solemn marches.

**Why.** Harmony and dynamics were already good (DCML corpus). What was missing was the left-hand dialect versus Chopin’s nocturne roll and Glass’s cell, and a concrete hold length (2–4 bars) so “one harmony may be held” is a planning habit, not atmosphere.

## Chopin

**Before.** Mid-nineteenth-century Polish and French piano music, c. 1840. A singing right-hand cantabile over left-hand arpeggio, waltz or nocturne figuration; rubato-friendly slow pieces; mazurka and waltz dance lilt in triple meter; stormy ballade and scherzo drama. Harmony is functional Romantic: chromatic approach over a diatonic base, secondary dominants, Neapolitan colour, and clear dominant–tonic and half cadences. Pedalled piano, written for the grand piano.

**After.** Polish–French piano, c. 1840. An ornamented vocal right hand (fioritura, delayed resolutions) over a wide-span left-hand arpeggio, a waltz bass-chord-chord, or a mazurka that accents beat two or three — not Alberti, not jazz stride, not block-chord shocks. Harmony stays tonal: chromatic inner voices, cadential 6/4 sharing the bar with V7, Neapolitan in minor, mazurka mixture; eight bars are a 4+4 period whose return is ornamented, often after a pickup. Pedalled grand piano, rubato-friendly; no parallel planing, no ii–V jazz turnaround.

**Why.** This was the mush Stephen called out. “Cantabile over arpeggio + functional Romantic” also describes a Beethoven adagio and a generic salon piece. Discriminators from public-domain repertoire (Op. 9/2 return, mazurka accent, waltz bass-chord-chord, 6/4+V7 in one bar — STYLE_NOTES / fidelity MIDI): ornament, which left-hand figure, 4+4 ornamented return, and explicit not-Alberti / not-jazz / not-planing.

## Debussy

**Before.** French piano music, c. 1905. Harmony is colour, not function: triads, ninths and hollow fifths glide in parallel; pentatonic, whole-tone and old church modes blur the key; added sixths and ninths hang unresolved over pedal notes. Phrases are short ideas said twice and set side by side like tiles. Dominant–tonic cadences are avoided — pieces settle by a plagal or modal step, or simply fade. Very soft, pedalled, with one gentle swell.

**After.** French piano, c. 1905. Harmony is colour: parallel triads, ninths and hollow fifths; pentatonic, whole-tone and church modes; added sixths and ninths left hanging over a pedal — closes are plagal, modal or a fade, never V7–I. Phrases are two-bar tiles said twice and set beside the next (mosaic), or an arch whose return is an echo. Very soft, fully pedalled; not a singing 4+4 tonal period, not stacked jazz ninths, not an additive cell process.

**Why.** Colour-not-function was already the right idea (Arabesque / Clair / *Cathédrale*). Tightened the close to “never V7–I”, named mosaic vs arch-echo at 8–16 bars, and fenced Chopin’s period, Fox’s jazz ninths, and Glass process without naming them.

## Philip Glass

**Before.** American minimalism, c. 1980. Process music: a small cell is stated and then changed a little at a time — a note added, the figure rotated so it starts one note later, a layer doubled in speed — so that nothing is repeated unchanged for long. The harmony is a cycle of two to eight plain chords related by thirds and common tones rather than by function; each pass takes a new inversion and so a new bass, and every eight bars or so a different cycle takes over. Rocking thirds, arpeggio cells and two-against-three cross-rhythms over a slow bass, often under a bare slow melody. Dynamics move in blocks, with sudden terraces instead of a climax. Mostly minor, no leading-tone cadences — pieces stop rather than close. Piano, electric organ, strings, voices.

**After.** American minimalism, c. 1980. A small cell changes a little each pass — a note added, the figure rotated to start one note later — over a two-to-eight-chord cycle related by thirds and common tones; the next pass takes a new inversion (new bass), and about every eight bars a different cycle takes over. Rocking thirds and two-against-three over a slow bass; pieces stop on a low tonic or tonic 6/4 rather than cadence. Terraced blocks, mostly minor: a process of rotation and addition, not the same ostinato getting louder, not colour-planing haze.

**Why.** The process description was already the second-pass fix in STYLE_NOTES. It was long for System One state (five sentences) and still did not say the negative against Zimmer’s same-loop crescendo or Debussy haze. Cut the instrument laundry list; kept “minimalism” (brief-off tests use that word).

## Hans Zimmer

**Before.** Film-score piano and hybrid texture, c. 2000s–2020s. Slow-building layered ostinatos, simple diatonic or modal loops that escalate, pedal drones, sparse then heroic surges, minor-key gravity, and occasional warm major anthems. Pulse and crescendo drama with a melody riding over the ostinato — cells may thicken, but the piece is a build, not a process of additive rotation. Written for grand piano, strings, and occasionally electric piano.

**After.** Film-score piano and hybrid, 2000s–2020s. A slow long-note chant rides a left-hand ostinato that keeps the same figure while layers thicken and the dynamic climbs — loops of i–bVI–bVII–V or i–iv–bVI–V, or a tonic drone held across the barline; harmony never moves faster than the bar. Eight to sixteen bars vamp, add weight, surge late, then often drop to bare. Four-four pulse, piano and strings: a layered build, not cell rotation, not a 4+4 song period.

**Why.** The other mush Stephen called out. “Layered ostinatos that escalate” is atmosphere; the only discriminator was a Glass negative. What the book actually encodes: same figure (not rotated), legal film loops (not i–bVI–bIII–bVII), held drones, no intra-bar cadence, vamp → weight → late surge → peak-then-bare. Analyses / inferred — no cue transcription.

## Laufey

**Before.** Icelandic-Chinese jazz-pop singer-songwriter pianist, 2020s. Warm major-key song forms: a clear singing melody over swinging or lightly syncopated piano — close mid-register chords, gentle broken-chord accompaniment, or a soft stride. Harmony is functional and jazz-tinged — ii–V colour, major sevenths, the occasional chromatic approach — without dense stacked extensions. Intimate, unhurried and romantic; soft dynamics. Acoustic grand piano, sometimes a light electric piano.

**After.** Jazz-pop singer-songwriter piano, 2020s. A vocal-range hook in even four-bar phrases (period, returning A, or vamp-and-tag) over mid-register close voicings, a soft stride, or light broken chords — swing or gentle bossa syncopation, not a wide nocturne arpeggio and not sixteenths grouped 5+5+6. Harmony is song-form jazz: I–vi–ii–V and inverted ii–V–I, major sevenths, borrowed iv; no stacked ninths or thirteenths, no planing, no drone-loop build. Intimate, unhurried, mostly major; acoustic piano first.

**Why.** Newest dial style, and the brief was biography plus “jazz-tinged.” That also fits a soft Chopin and a tame Fox. Teeth from the book and STYLE_NOTES (not a transcription): vocal-range hook, even 4+4 song forms, I–vi–ii–V / ii–V–I, borrowed iv, swing/bossa feel; explicit not-nocturne, not-5+5+6, not-planing, not-drone-loop. Dropped the nationality lede — Jev already has the name.

## Elijah Fox

**Before.** Contemporary jazz-trained pianist-producer, 2020s, whose solo piano miniatures blend jazz, impressionism and psychedelic soul. Flowing arpeggio patterns whose accents are displaced into uneven groups, modal mixture (chords borrowed from the parallel minor set against the major), melodies carried on top of close chords with moving inner voices, short loops that are varied rather than developed, colour-chord endings left hanging. Soft and unhurried. Acoustic piano, Wurlitzer electric piano, ambient pads.

**After.** Jazz-trained pianist-producer, 2020s: solo-piano miniatures, not sung song forms. Continuous sixteenths whose accents fall in uneven groups (5+5+6, 7+5+4); modal mixture as the hook — bVImaj7 set against IVmaj7, maj7(#5) against add6 — with sliding inner voices and endings left hanging on colour chords (maj7#11, 6/9). Short vamps are varied, not spun into an additive process and not a clear vocal hook over stride; no parallel planing or whole-tone veils; soft, unhurried, piano or Wurlitzer.

**Why.** The old brief already had the right ingredients (displacement, mixture, hanging colour) but named the genre blend and left the numbers and the verified *City in the Sky* pair in comments. Putting 5+5+6 / 7+5+4 and bVImaj7-against-IVmaj7 in the prose (his own lessons, not shop scores) is what separates him from Debussy planing and Laufey song-form. Dropped unverified “ambient pads.”
