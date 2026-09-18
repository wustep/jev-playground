# Fidelity findings: why 16 bars still sound like an étude, and what to ship next

Fable, 2026-09-18, branch `fable/fidelity-research`. Answers
`FIDELITY_RESEARCH_BRIEF.md`. One item was shipped on this branch (§4); the
rest is a ranked plan (§5).

**Short version.** The harmony, the textures and the bar-level motif work are
no longer the problem. What separates our output from a song is *above the
bar*: in the repertoire the unit that returns is a **phrase** (3–8 bars), the
tune **breathes** and **leans across barlines**, and the **arrangement changes
when the tune comes back**. Ours returned one bar, sang on 100 % of downbeats
with no rests, and played all sixteen bars in one arrangement. The first of
those is fixed here; the next two are ranked 1 and 2 below.

---

## 1. Source material

### What was analysed

All MIDI stayed local (`docs/ref-midi/`, `docs/ref-midi/local/`, both
gitignored for `*.mid`); nothing was committed or uploaded. New files fetched
this pass are all public-domain works in Mutopia's own encodings
(`https://www.mutopiaproject.org/ftp/<Composer>/<Opus>/<name>/<name>.mid`):

| Piece | Why it is here |
| --- | --- |
| Chopin, Nocturne Op. 9/2 | the model "song without words": A A′ B A″, ornamented returns |
| Schumann, *Träumerei* and *Kinderszenen* 1 | 32-bar song form; one gesture returning higher each time |
| Mendelssohn, *Lieder ohne Worte* Op. 19/6, Op. 30/6 | intro vamp, tune + figuration + bass, breathing melody |
| Beethoven, *Pathétique* II | theme restated an octave higher in a fuller arrangement |
| Schubert, *Heidenröslein*; Foster, *Slumber My Darling* | actual songs: a vocal line over piano |
| Joplin, *The Entertainer* | strain form, groove (not a dial style; a control) |
| Debussy, Arabesque 1 | flow texture with returning bars |
| already on disk | Für Elise, Clair de lune, Gymnopédie 1, Chopin Op. 28/4 and 28/6, BWV 772, BWV 846 |

Two housekeeping facts for whoever analyses next: `docs/ref-midi/bach_invention_01.mid`
and `docs/ref-midi/chopin_nocturne.mid` are **not** what their names say (a
2/4 rock-band arrangement with drums, and a sax/clarinet band arrangement) —
like the already-known `bach_wtc_prelude_c.mid`. Use the Mutopia files in
`local/`. And `zimmer_time.mid` is a 24-note sketch: useless for statistics.

Living artists: no usable MIDI was reachable without a login (bitmidi has no
Laufey, Glass or Fox piano files), so Glass / Zimmer / Laufey / Fox rest on
published analyses (§1.3), not on transcriptions.

### 1.1 Method

A throwaway analyser (`@tonejs/midi`, rebuilt in the session scratchpad, not
committed) reduces a piece to a note list, takes the melody as the right
hand's skyline (or the vocal track), and measures the first 16 bars. Barline
offsets for pickups were set by hand from each file's first onsets: an
automatic aligner (barline = where the left hand's lowest note falls) was half
a bar off on three files whose bass moves twice a bar. The
same code ran over 192 generated pieces: 8 styles × 24 seeds, heuristic
planner, 16 bars. Two families of measure:

- **Return.** A bar "comes back" when ≥ 75 % of its beats carry the same
  melody pitch class as another bar, or it has the same rhythm and the same
  up/down shape. `run` = the longest stretch of consecutive bars that comes
  back later; `ret4` / `ret8` = how much bars 5–8 / 9–12 resemble bars 1–4.
- **Breath.** Per beat: is the melody attacked, held over, or silent? Per
  barline: attacked on the downbeat, tied over it, or silent?

These are blunt (a skyline mistakes Satie's chords for tune, an ornamented
return scores lower than a plain one), so read them as orders of magnitude.

### 1.2 What the repertoire does (first 16 bars)

| Piece | pickup | longest returning run | ret4 | ret8 | downbeats attacked / tied / silent | melody silent | times the top note is hit |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Chopin Op. 9/2 | ♪ | **4 bars** | 0.81 | 0.13 | 100 / 0 / 0 % | 1 % | 3 |
| Träumerei | ♩ | 3 | 0.31 | 0.63 | 100 / 0 / 0 | 3 % | 2 |
| Kinderszenen 1 | – | 3 | 0.75 | 0.63 | 100 / 0 / 0 | 0 % | 4 |
| Mendelssohn Op. 19/6 | – (2-bar intro) | 2 | 0 | 0.13 | 69 / 6 / **25** | **26 %** | 1 |
| Mendelssohn Op. 30/6 | – (2-bar intro) | 3 | 0 | 0 | 69 / 6 / **25** | **24 %** | 1 |
| Pathétique II | – | **8 bars** | 0.25 | **1.00** | 100 / 0 / 0 | 1 % | 1 |
| Heidenröslein | – | 2 | 0.50 | 0.25 | 88 / 0 / 13 | 14 % | 4 |
| Foster, Slumber | – (8-bar intro) | 2 | 0 | 0 | 50 / 0 / 50 | 51 % | 3 |
| The Entertainer | – | 4 | 0 | 0 | 75 / **19** / 6 | 7 % | 6 |
| Gymnopédie 1 | – (4-bar intro) | 4 | 0.25 | 0.67 | 44 / **19** / **38** | 13 % | 2 |
| Für Elise | ♪♪ | 3 | 0.75 | 0.25 | 63 / 19 / 19 | 13 % | 1 |
| Clair de lune | – | 2 | 0.08 | 0.67 | 13 / **69** / 19 | 4 % | 1 |
| Chopin Op. 28/4 | ♩ | 3 | 0.75 | 0.25 | 94 / 6 / 0 | 0 % | 1 |
| *Bach, Invention 1 (control)* | – | 1 | 0.13 | 0 | 81 / 13 / 6 | 11 % | 1 |

And the arrangement: *Pathétique* II's left hand goes from **2.5 to 8 onsets a
bar** when the theme returns at bar 9 and the tune moves **up an octave**
(mean melody pitch 62 → 73); Clair de lune's goes 1 → 4.8. In the true
song-without-words textures (Op. 9/2, both Mendelssohns, Gymnopédie) the
accompaniment is *one* unchanging pattern for all 16 bars — more uniform than
ours — while the melody is freer than ours (up to 12 different bar rhythms in
Op. 9/2, against our 5). **A constant
accompaniment is not what makes an étude; a bar-quantised melody is.**

### 1.3 Published analysis (web; URL per claim)

[fetched] = the page or PDF was read; [snippet] = search summary only.

- **Chopin Op. 9/2**: 34 bars of 12/8, A A′ B A″ B′ A‴ + coda in 4-bar
  units; "the A and B sections become increasingly ornamented with each
  recurrence"; enters on an upbeat; the left-hand pattern never breaks until
  the cadenza; the highest note of the piece is in bar 30 of 34. [fetched]
  <https://en.wikipedia.org/wiki/Nocturnes,_Op._9_(Chopin)>,
  <https://paperlesspianoteacher.com/blog/chopin-nocturne-op-9-no-2-analysis>
- **Träumerei**: A(8) A(8) B(8) A(8); one upbeat, a rising arpeggio to F in
  bars 1–2, the same gesture reaching A in bar 6, E♭ in bar 10, higher again
  in 13–16. [fetched] <https://www.maramarietta.com/schumann-kinderszenen-analysis-1-traumerei/>
- **Pathétique II**: an 8-bar theme closing fully; bars 9–16 repeat it an
  octave higher; three voices then four. [fetched]
  <https://tonic-chord.com/beethoven-piano-sonata-no-8-in-c-minor-pathetique-analysis/>,
  [snippet] <https://enc.piano.or.jp/en/musics/26095>
- **Mendelssohn**: three layers — tune, a bass that moves with the harmony, a
  fixed quicker pattern between; Op. 19/1 opens with two bars of left hand
  alone, and the pattern "almost never changes". [snippet]
  <https://interlude.hk/the-lyrical-piano-mendelssohn-lieder-ohne-worte-songs-without-words/>,
  [fetched] <https://practisingthepiano.com/mendelssohn-song-without-words-op-19b-no-1/>
- **Gymnopédie 1**: four bars of Gmaj7 / Dmaj7 before the melody; "sparse,
  unhurried, with long rests between phrases". [fetched]
  <https://en.wikipedia.org/wiki/Gymnop%C3%A9dies>, <https://www.cmuse.org/gymnopedie-no-1-erik-satie/>
- **Melody corpus work**: phrase-final notes are ~1.7× longer than the others;
  a sung phrase averages 9.5 notes; arch and descending contours dominate
  (Tierney, Russo & Patel, PNAS 2011 — 9,467 songs; figures read from a noisy
  fetch, check before quoting). [fetched] <https://pmc.ncbi.nlm.nih.gov/articles/PMC3174665/>.
  Convex arch ≈ 40 % of 6,364 folk phrases (Huron 1996). [snippet]
  <https://www.researchgate.net/publication/239063783_The_Melodic_Arch_in_Western_Folksongs>.
  Step inertia: a step continues in the same direction 67 % of the time in
  classical themes but only 43–48 % in pop corpora (Chiu & Temperley 2024).
  [fetched] <https://journals.sagepub.com/doi/full/10.1177/20592043231225731>
- **32-bar AABA**: A is 24 of 32 bars — 75 % of the melody is a return, with
  variation "particularly for the last A"; the title line sits at the start or
  the end of each A. [fetched] <https://en.wikipedia.org/wiki/Thirty-two-bar_form>.
  "Almost every strong hook features a simple melodic phrase that's repeated
  at least twice." [fetched] <https://www.hooktheory.com/blog/what-is-a-hook-in-a-song/>
- **Laufey** (analyses, not scores): *From the Start* — D♭, 82 bpm, bossa
  pattern, ii9–V13–I, 2-bar intro and 4-bar ending, 95 % diatonic melody.
  [fetched] <https://www.hooktheory.com/theorytab/view/laufey/from-the-start>,
  <https://so06.tci-thaijo.org/index.php/rmj/article/view/271812>. Her
  signature is the **borrowed minor iv**: I–I7–vi7–iv6, I–Imaj7–IVmaj7–iv,
  Imaj7–I7–I6–iv6 over a chromatic inner line, the melody on ♭6. [fetched]
  <https://katiekeyboard.substack.com/p/laufey-and-lieder-harmonic-structure>.
  (Our Laufey major book has `iv` only as a *surprise*.)
- **Glass**: *Opening* is "three groups of four-measure phrases … repeated
  four times each, ABC:||ABC"; triplet eighths against duple eighths against
  whole notes. [fetched] <https://en.wikipedia.org/wiki/Glassworks_(composition)>.
  *Metamorphosis Two*: quiet oscillation – fast four-note arpeggios – quiet.
  [fetched] <https://www.parlancechamberconcerts.org/individual-program-notes/phillip-glass-(born-1937)/metamorphosis-ii>
- **Zimmer, "Time"**: an 8-bar theme over a 4-chord block "repeated thirteen
  times, on each repetition accumulating new instruments … never once varying
  its underlying tonal organization"; peak at iterations 9–10 (≈ 70–77 %),
  then "yanked abruptly back to an exposed piano texture" for the last three
  (Lehman 2016). [fetched PDF]
  <https://franklehman.com/wp-content/uploads/2021/01/2016-Manufacturing-the-Epic-Score-Music-Epic-Film-Routledge-1.pdf>.
  *Cornfield Chase*: a 4-bar F–G–Am–G loop; the "melody" is one repeated
  interval against the changing chords; theme → pulse added → theme with more
  drive → B ×3 → theme with a high layer on top → fast fade. [fetched PDF]
  <https://remix.berklee.edu/cgi/viewcontent.cgi?filename=2&article=1073&context=graduate-studies-scoring&type=additional>
- **Arranging a song for solo piano**: verse low and simple, chorus the
  fullest texture with the melody doubled in octaves; fill the long notes at
  phrase ends by echoing a fragment of the tune an octave up; intro = the last
  four bars, or a bell note; ending = ritardando and a rolled chord. [fetched]
  <https://pianomode.com/explore/piano-learning-tutorials/practice-guides/how-to-create-your-own-piano-cover-of-any-song/>,
  <https://www.learnjazzpianoonline.com/blog/intros-and-outros/>
- **Elijah Fox**: nothing published on the form of his miniatures beyond what
  `STYLE_NOTES.md` already has. Unverified.

---

## 2. What made the output an étude (before this branch)

Means over 192 generated pieces, against the table above:

| Tell | Ours (before) | Repertoire | Verdict |
| --- | --- | --- | --- |
| Longest run of bars that returns | **1.8 bars** (pitch-class match); 2.8 (shape match) | 3–4 typical, 8 in *Pathétique* II | **The theme was one bar long.** A `restatement` recalled bar 1's motif; bars 2–4 of every phrase were redrawn. A `period` read a b c d / a e f g. |
| Melody silent on a beat, in the tune-over-accompaniment textures (`alberti_melody`, `stride_dance`, `rolling_nocturne`, `chordal_melody`, `aria_walking_bass`, `lush_voicings`) | **0 %** | 13–26 % in the songs | **The tune never breathes.** |
| Downbeats with a fresh attack (same textures) | **100 %** | 44–69 % where the tune breathes (Mendelssohn, Satie, Für Elise, Foster); Clair de lune 13 % | **Every bar starts again.** |
| Notes tied over a barline | **0 %, structurally** (`Note.dur` never crosses the barline) | 6–19 %, Clair 69 % | The score model forbids it. |
| Pieces whose tune begins with a pickup | **none** | 4 of 13 (Op. 9/2, *Träumerei*, Für Elise, Op. 28/4) | No anacrusis anywhere. |
| Accompaniment-only intro | 0 bars (1 in `melody_over_ostinato`) | 2 (both Mendelssohns), 4 (Satie), 8 (Foster), 2 (*From the Start*) | Straight in, every time. |
| Arrangement on the return | identical: mean 2.3 accompaniment patterns per piece, one of them the last bar | *Pathétique*: ×3 left-hand density and +1 octave; "Time": a layer per 4 bars | Nothing marks a section. |
| Times the highest note is hit, and where | **2.8×, at 48 %** of the piece | once in most; late (67–97 %) in the lyrical ones | No single summit. |
| Phrase-end thinning (onsets in bars 4/8/12/16 ÷ the rest) | 0.72 | 0.5–0.9 | **Fine already.** |
| Rhythmic vocabulary of the tune | 5.1 bar rhythms per piece | 4–12 | A little small for the nocturne idiom; not the priority. |

So, against the brief's list: **form** and **hook** were the largest hole
(phrase-level return — shipped); **lyrics-shaped melody** is the next (breath,
pickup, long phrase-final note followed by air); then **arrangement**; then
**groove**, which matters mostly for Laufey and Fox. Chorus/verse as *labels*
can wait: an A A′ B A″ that audibly returns and lifts on the last A is already
most of what "a song" means at sixteen bars.

---

## 3. Thesis check

Everything below keeps System One on closed labels. The shipped item added
**no label at all** — it reads more out of one Jev already picks (`form`).
That is the pattern to prefer: a label's expansion by code can carry far more
structure than we were using (the form table has had `material: 'a'|'b'|'c'`
and `varied` since the form work; the renderer never saw them).

---

## 4. Shipped on this branch: the phrase returns, not just its first bar

`themeSources(form, bars)` (`src/plan/forms.ts`) expands the form label into
"bar *n* brings back bar *m*":

- a phrase returns the first earlier phrase of the **same material that opened
  the same way** (an idea, a travelling sequence, a chord cycle, a standing
  pedal), bar for bar, **up to its cadence** — cadences, half cadences,
  surprises, dissolves and the final bar are always written fresh, so a
  consequent closes where its antecedent paused;
- a **loop** form keeps a two-bar hook and lets bars 3–4 of each pass go their
  own way; a **duplicate** phrase says its two-bar idea twice (Debussy's
  doubled bars, the sentence's presentation); a **fantasia** never repeats; a
  coda only returns if it is written as a return.

```
period        16 |  .  .  .  . |  1  2  3  . |  .  .  .  . |  1  2  3  .
sentence      16 |  .  .  1  2 |  .  .  .  . |  1  2  1  2 |  5  6  7  .
arch_return   16 |  .  .  .  . |  .  .  .  . |  5  6  7  . |  1  2  .  .
additive_loop 16 |  .  .  .  . |  1  2  .  . |  1  2  .  . |  1  2  .  .
vamp_and_tag  32 |  .  .  .  . |  .  .  .  . |  1  2  .  . |  5  6  7  . | … AABA
```

The renderer keeps every bar's figure and rhythm per line
(`RenderMemory.figures`, `.barRhythms`); a returning bar (`BarContext.returns`)
is recalled exactly the way a `restatement` already was — kept over a related
chord with its strong beats settled on the new harmony, transposed diatonically
onto a distant one — and, when it comes back as the phrase's `climax`, a third
higher if the register has room. A hand-edited plan whose roles disagree with
its form is respected: a bar whose role is punctuation never returns. Both
planners give a returning bar its source's contour, so the plan the UI shows is
the plan that sounds (Jev is still *asked* for those contours; the answer is
unused — see item 8).

Measured, same 192 plans before and after:

| | longest returning run (shape) | ret4 | ret8 | bars literally repeating an earlier bar |
| --- | --- | --- | --- | --- |
| All styles | 2.78 → **3.30** | 0.40 → 0.47 | 0.41 → 0.44 | 18 → 23 % |
| `period` (32 pieces) | 2.53 → **3.56** | 0.50 → **0.70** | 0.28 → 0.31 | |
| `sentence` (19) | 3.89 → **5.53** | | 0.87 → 0.94 | |
| `call_and_response` (6) | 2.50 → 2.67 | 0.50 → 0.69 | | |
| Chopin | 2.46 → **4.00** | | | 16 → 26 % |
| Bach | 2.96 → 3.83 | | | |
| Beethoven | 3.46 → 4.25 | | | 24 → 32 % |
| Laufey | 2.46 → 2.63 | 0.46 → 0.55 | | 15 → 22 % |

For scale: Chopin Op. 9/2 is run 4 / ret4 0.81; *Pathétique* II is run 8 /
ret8 1.00. Zimmer, Fox and Laufey move least because their forms are loop-built
and a loop only keeps a two-bar hook — deliberately: the earlier "too locked"
note on Glass still stands, and the honest fix for those styles is item 2
(the return should *sound different*), not more literal repetition.

Tests: `src/render/theme.test.ts` (10). `npm test` 150 passed, `tsc --noEmit`
clean. One pre-existing flake found on the way: `harmonyPhrases.test.ts`'s
catalog sweep runs ~4.5 s against vitest's 5 s default on this box and failed
once under load; it has a 30 s timeout now.

Not verified by ear or in a browser in this session — the evidence is the
metrics and the tests.

---

## 5. Ranked next improvements

Payoff = how audible it is to a non-musician on a first listen. Cost is
engineering, including both planners, the sheet and tests.

| # | Ship | Payoff | Cost | Labels |
| --- | --- | --- | --- | --- |
| 1 | Breath and pickup | ★★★★★ | M | none, or one closed `phrasing` global |
| 2 | Arrangement follows the form | ★★★★★ | M | one closed `arrangement` global |
| 3 | Intro and ending bars | ★★★★ | M | one closed `opening` global |
| 4 | One summit | ★★★ | S | none |
| 5 | Laufey's groove and borrowed iv | ★★★★ for one style | S + M | none (book) + one texture |
| 6 | Varied return (ornament ladder) | ★★★ (★★★★ at 32 bars) | M | none |
| 7 | The hook as 1 + 1 + 2 | ★★★ | S–M | none |
| 8 | Stop asking Jev for contours it cannot change | housekeeping | S | fewer questions |

### 1. Breath and pickup — the lyric-shaped line

*Evidence.* 0 % silent beats and 100 % attacked downbeats in every
tune-over-accompaniment texture, against 13–26 % and 44–69 %; 4 of 13
reference tunes start with an upbeat; phrase-final notes ~1.7× longer than the
rest, then air. This is the single most "sung" property and we have none of it.

*Ship.* (a) Phrase ends: in the last bar of a phrase the tune lands early, holds,
and **rests** for the last beat or two — a change to the `pause` / `close`
rhythm banks plus a rule that a phrase's fourth bar takes them even when its
role is `development`. (b) **Anacrusis**: the rest at the end of bar 4 is
where the pickup into bar 5 goes — one to three short notes stepping into the
next bar's first pitch. That pitch is now *known in advance* for every returning
phrase, because the theme memory holds it: this is the piece theme return
unlocks. A pickup into bar 1 needs item 3's extra bar. (c) Later, separately:
ties across barlines need `Note.dur` to be allowed over the bar and the sheet to
draw ties — a score-model change, M–L on its own; leave it out of the first cut.

*Labels.* Can be driven from `character` alone (a `lyrical_song` breathes, a
`flowing_perpetual` does not). If Jev should own it: one closed global,
`phrasing: on_the_beat | upbeat | breathing | long_breathed`, in the existing
globals request — no extra round trip.

### 2. Arrangement follows the form

*Evidence.* *Pathétique* II (left hand ×3, tune +8va, three voices → four on the
return); "Time" (same four bars thirteen times, one layer added per pass, peak
at 70–77 %, bare piano to finish); *Cornfield Chase*; every arranging guide
(chorus = octave-doubled tune over the fullest left hand). Ours: one arrangement
for sixteen bars, so a return — now that there is one — sounds like a copy.

*Ship.* A per-phrase **level** (0 bare … 3 full) computed by code from the form's
slots, the roles (`climax`, `dissolve`, `echo`) and the dynamic shape, applied
in two places: a generic post-pass in `renderPlan` (level 3: tune doubled at the
octave, bass doubled an octave down; level 0: inner voice dropped, left hand
thinned to beats) — works for all 22 textures at once, the way split bars did —
and a density hook in the five textures that carry the song styles
(`melody_over_ostinato`, `pulsing_chords`, `alberti_melody`, `rolling_nocturne`,
`stride_dance`): half-speed figure at level 0, the written one at 1–2, doubled
at 3. One closed global, `arrangement: constant | build | lift_on_return |
peak_then_bare | terraced_blocks`; priors are obvious per style (Zimmer →
`peak_then_bare`, `build`; Beethoven/Chopin/Laufey → `lift_on_return`; Glass →
`terraced_blocks`; Bach → `constant`).

This and item 1 are close; item 1 first because it changes every lyrical piece,
and because a lifted return of a tune that still never breathes is a louder étude.

### 3. Intro and ending bars

*Evidence.* Two bars of accompaniment alone before the tune in Mendelssohn, four
in Satie, two in *From the Start*; "the pattern starts, then somebody sings" is
the most recognisable song gesture there is. `melody_over_ostinato` already does
a one-bar version, which is why Glass/Zimmer feel a little more like pieces.

*Ship.* `opening: straight_in | vamp_intro | pickup` and the renderer prepends
0–2 bars (the first chord's accompaniment, tune silent) and lets the last bar
ring with a rolled chord and a ritardando. The cost is not musical: bar counts
are validated as 4/8/16/32 and the sheet, seek-by-bar, MIDI export and the
prewarmed cache all index bars — the intro has to be extra `Score.bars` that are
not `plan.bars`. Budget a day for the plumbing.

### 4. One summit

*Evidence.* The top note is hit 2.8× at the 48 % mark on average (theme return
made it 3.1× — the tune's own peak now comes back with it); most references
reach theirs once, late. Huron's arch, and the 70–85 % placement in Op. 9/2,
*Träumerei*, "Time".

*Ship.* Renderer only: a per-bar ceiling for the main line — the form's last
`climax` bar gets the full register, every other bar stops a third short — and
a returning bar that would touch the ceiling is reconciled down. ~40 lines in
`melody.ts` plus a test. Cheap enough to ride along with item 1.

### 5. Laufey: groove and the borrowed iv

*Evidence.* Bossa / swing-ballad comping and I–I7–vi7–iv6 are what the
published analyses agree on; our Laufey major book has `iv` only under
`surprises`, and her leading textures are `chordal_melody`, `alberti_melody`
and `stride_dance` — none of them a groove.

*Ship.* Small: add the three verified progressions to `laufey.harmony.major`
(`V7_of_IV`, `iv6`, `iv_add6` already exist as chords). Medium: one texture,
`bossa_comp` — bass on 1 and the "and" of 2, shell voicings (3rd + 7th) on the
partido-alto off-beats, tune on top — also useful to Fox's `warm_groove`.
Biggest style-specific win available; nothing for the other six.

### 6. Varied return — the ornament ladder

*Evidence.* "Increasingly ornamented with each recurrence" (Op. 9/2); AABA
varies "particularly the last A"; *Träumerei*'s gesture reaches higher each
time. After this branch a second return is a literal one. Fine at 16 bars,
wearing at 32.

*Ship.* The slot's existing `varied` flag and the count of earlier returns pick
a rung: plain → passing notes in the leaps (split a slot in two) → a turn before
the long note → the octave lift (shared with item 2). Needs the recalled rhythm
to be editable, which is why it is M.

### 7. The hook as 1 + 1 + 2

*Evidence.* Sentence structure; "short-short-long"; hooks are a short phrase
said at least twice. Our opening phrase's bars 2–4 are still independent draws,
so the thing that now returns is not always worth returning.

*Ship.* In a theme phrase, bar 2 is bar 1 again a step away (the machinery
exists: `sequence`), bars 3–4 are one continuous gesture ending on the long
note. Mostly role-table edits in `forms.ts` (`antecedent`, `vamp`, `call`) plus
a rhythm rule that bar 3 must not reuse bar 1's rhythm.

### 8. Housekeeping from this branch

JevPlanner still sends the contour Choice for returning bars and discards the
answer. Dropping those questions from the `phrase` op saves ~6 of 16 contour
questions per piece, but touches the request builder, the `/api/jev` validator
and their tests, so it was left out of a renderer-only PR.

### Considered and not ranked

- **Verse / chorus as a new form family.** Wait for items 1–3: with breath, a
  lifted return and an intro, `period`, `arch_return` and the 32-bar
  `vamp_and_tag` (already AABA) *are* song forms. A `verse_chorus` layout is
  then one more row in `LAYOUTS`, not a project.
- **Jev writes the notes.** Still no. Every gap above is structure that a
  closed label plus code expresses exactly, and none of them is a judgment
  about which notes.
- **More chords, more textures, 3/8, tuplets.** None of the measured tells is
  about vocabulary.
- **A "songness" question for the Best-of-N critic.** Cheap, but the critic
  scores the *plan*, and none of these properties is visible in the plan yet.
  Revisit after item 2 adds its label.
