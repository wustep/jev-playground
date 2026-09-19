# Reference → plan gap study

Fable, 2026-09-19, branch `cursor/reference-plan-gap-8be8`, on `main` after #43. Reverse-labels one or two keyboard/piano pieces per dial style into the closed `CompositionPlan` vocabulary, then compares HeuristicPlanner samples (and a fake Notes:guide sketch) against what those pieces needed.

**Thesis.** Closed labels; code writes notes. Propose enums and renderer rules, not free MIDI. Living-artist sections are published analysis or the musician’s own teaching — never a transcription, and no copyrighted MIDI in the repo.

**Artifacts (why they are here).** Reverse-labelled plans are committed as JSON so the sketches can be loaded, not only read. Public-domain MIDI for the four older dials is committed so the named Mutopia encodings are in-repo. Living artists stay JSON-only.

| Kind | Path | Who |
| --- | --- | --- |
| Plan JSON (all eight styles) | [`docs/fable-context/reference-plans/`](reference-plans/) | every reference below |
| Mutopia / PD MIDI | [`docs/ref-midi/public/`](../ref-midi/public/) | Bach, Beethoven, Chopin, Debussy only |
| MIDI licence + source URLs | [`docs/ref-midi/public/README.md`](../ref-midi/public/README.md) | same four dials |

Validate: `npx tsx scripts/validate-reference-plans.ts` (`parsePlan` on every `plan`).

**Short version.** The stub already *aims* at the right piece-type for six of eight dials (Bach prelude, Chopin nocturne, Debussy haze, Glass loop, Zimmer build, Fox mixture). What still blocks “sounds like a real song / that composer” is mostly **above the bar** (phrase contour, breath that is not tied to character, ornamented return, same-figure layering) and a handful of **audible dialects the enums cannot name** (12/8 nocturne lilt, 3:2, bossa/partido-alto, mazurka accent, inversion-as-variation). Harmony books are no longer the hole — except Laufey’s borrowed iv, which is still a `surprise` rather than a progression.

This note updates, not copies, `FIDELITY_FINDINGS.md`, `QA_PASS_AND_IMPROVEMENTS.md`, and the Notes:jev diagnosis (`NOTES_JEV_QUALITY.md` — there is no `NOTES_JEV_DIAGNOSIS.md` on `main`).

---

## 0. Method

**Evidence grades** (same as `STYLE_NOTES.md`):

| Grade | Means |
| --- | --- |
| *Score* | Public-domain Mutopia LilyPond / MIDI. The eight named encodings live in [`docs/ref-midi/public/`](../ref-midi/public/) (not gitignored). `docs/ref-midi/local/` and any other `docs/ref-midi/**/*.mid` stay ignored. |
| *Analysis* | Freely readable published analysis, liner note, or the musician’s own lesson. URL per claim. |
| *Inferred* | Stylistic suggestion, not a transcription. Used only when a living-artist score is in copyright. |

**What was labelled.** For each reference: character, form, key, meter, texture, palette, tempo, dynamics, dynamicShape, arrangement, opening, pedal, and a 4–8 bar sketch of roles / chords / contours. Where a proposed `phrasing` global would help, it is written as a *proposed* label (not on the schema today). Notes:guide sketches use the closed figure+goal set in `src/plan/notes.ts`.

**What was generated.** `scripts/dump-heuristic-plans.ts` (offline; no MIDI):

- **argmax** seed 1, 16 bars, brief on — the stub’s mode, one plan per style.
- **sample** seeds 1 / 7 / 19, 16 bars — three draws, to see whether the archetype wanders off the reference.

No live Jev in this environment (`GET /api/jev` is not required for this note). Guide sketches are fake: `sketchGuideBar(role, contour)` in the dump script.

**Housekeeping from `FIDELITY_FINDINGS`.** Do not trust leftover `docs/ref-midi/bach_invention_01.mid` or `chopin_nocturne.mid` if they appear locally (wrong pieces). Use the Mutopia files in [`docs/ref-midi/public/`](../ref-midi/public/). `zimmer_time.mid` is a 24-note sketch and was not used — Zimmer stays JSON-only.

---

## 1. What the vocabulary can already say

Closed globals and bar fields as of `main` (`src/plan/schema.ts`, `src/plan/notes.ts`):

| Field | Closed set (count) | Renderer already consumes? |
| --- | --- | --- |
| character | 12 | priors + `phrasingOf(character)` |
| form | 11, layouts through 64 | roles + `themeSources` |
| key / meter | 21 keys; 6 meters including 2/4, 9/8, 12/8 | yes |
| texture | 22 | yes |
| palette / tempo / dynamics / dynamicShape | 7 / 11 / 6 / 9 | yes |
| arrangement | 5 | per-bar level 0–3 |
| opening | 3 | extra Score bars |
| pedal | 3 | texture default + plan |
| bar role / chord / contour | 11 / 107 / 9; optional `chord2` | yes |
| Notes:guide figure / goal | 7 / 4 | Debug only |

So a reverse-label that stays inside this table is a **planner miss** if the stub does not pick it, and a **renderer miss** if the label is right but the sound is still wrong. Anything that cannot be said is **MISSING / stretch**.

---

## 2. Per-style reverse labels

Each style: reference → proposed plan → stub comparison → MISSING, ranked (how much it blocks “that composer” on a first listen).

### 2.1 Bach

**References**

| Piece | Why this dial | Evidence | MIDI | Plan JSON |
| --- | --- | --- | --- | --- |
| WTC I Prelude in C, BWV 846 | The prelude archetype: one broken-chord figure, inversions, then pedals | *Score* (Mutopia). `STYLE_NOTES`: I – ii4/2 – V6/5 – I … dominant pedal 24–31, tonic pedal 32–35. Figure 1-2-3-4-5-3-4-5 twice a bar. | [`bach-bwv846-wtk1-prelude1.mid`](../ref-midi/public/bach-bwv846-wtk1-prelude1.mid) | [`bach-bwv846-prelude.json`](reference-plans/bach-bwv846-prelude.json) |
| Invention 1, BWV 772 | The two-voice invention archetype | *Score* (Mutopia). 4/4; 41 % of bars carry two harmonies (`STYLE_NOTES` table). Subject + sequence + cadence. | [`bach-bwv772-invention-01.mid`](../ref-midi/public/bach-bwv772-invention-01.mid) | [`bach-bwv772-invention-01.json`](reference-plans/bach-bwv772-invention-01.json) |

**Proposed plan — BWV 846 (first 8 sounding bars).** Canonical file: [`reference-plans/bach-bwv846-prelude.json`](reference-plans/bach-bwv846-prelude.json). Excerpt:

```json
{
  "style": "bach",
  "character": "flowing_perpetual",
  "form": "spinning_out",
  "key": "C_major",
  "meter": "four_four",
  "texture": "broken_chord_prelude",
  "palette": "diatonic",
  "tempo": "moderato",
  "dynamics": "mp",
  "dynamicShape": "steady",
  "arrangement": "constant",
  "opening": "straight_in",
  "pedal": "dry",
  "defaultInstrument": "harpsichord",
  "phrasing": "on_the_beat",
  "bars": [
    { "chord": "I", "role": "statement", "contour": "static" },
    { "chord": "ii42", "role": "development", "contour": "static" },
    { "chord": "V65", "role": "sequence", "contour": "static" },
    { "chord": "I", "role": "restatement", "contour": "static" },
    { "chord": "vi6", "role": "sequence", "contour": "static" },
    { "chord": "V7_of_V", "role": "sequence", "contour": "static" },
    { "chord": "V6", "role": "development", "contour": "static" },
    { "chord": "Imaj42", "role": "development", "contour": "static" }
  ]
}
```

`phrasing` is proposed (not on the schema). The prelude has no singing line; contour `static` is the honest label for “the figure does not climb.”

**Invention 1 sketch.** Canonical file: [`reference-plans/bach-bwv772-invention-01.json`](reference-plans/bach-bwv772-invention-01.json). `playful_wit` / `spinning_out` / `C_major` / `four_four` / `two_voice_counterpoint` / `chromatic_approach` / `allegro` / `terraced` / `constant` / `straight_in` / `dry`. Bars want `chord2` on sequence steps (~2 in 5). Contours `pendulum` / `leap_fall`. Proposed phrasing: `on_the_beat`.

**Heuristic vs reference**

| | BWV 846 needed | Stub argmax (seed 1) | Sample (3 seeds) |
| --- | --- | --- | --- |
| character / form / key / meter / texture | flowing_perpetual, spinning_out, C major, 4/4, broken_chord_prelude | **exact match** | 2/3 flowing_perpetual + spinning_out; seed 1 wandered to lyrical_song / binary_dance / C minor / stride_dance |
| opening / arrangement / pedal / instrument | straight_in, constant, dry, harpsichord | **exact match** | opening and arrangement stayed; texture wandered |
| first chords | I, ii42, V65, I | I, ii42, then a fifths sequence (vi7–ii7…) | book has the verified phrase; argmax used head + seq, not the 4-bar phrase |
| two-harmony bars (Invention) | ~41 % | splits exist (argmax bar 8 is ii6→V) | still cadence-only, not sequence-driven |

**Renderer even if the plan is right.** `broken_chord_prelude` already knows sibling figures and a penultimate sweep (`STYLE_NOTES`). It cannot (a) hold a *dominant pedal for eight bars* as a first-class plan event (we have `pedals` in the harmony book, not a bar role), (b) write a true 3/8 invention (meter missing), (c) keep two fully independent voices that invert — `two_voice_counterpoint` is “running sixteenths against walking eighths,” not invertible counterpoint.

**MISSING / stretch (Bach)**

1. **3/8** — three Inventions; we have 2/4, 9/8, 12/8, not 3/8. Stretch: map onto 3/4 and accept a wrong pulse.
2. **Pedal-point as a role or build** — BWV 846 bars 24–31 are one harmony’s bass, not a new progression. `pedal` today means sustain, not a standing bass.
3. **Invertible counterpoint / compound melody as more than `pendulum`.** Stretch: `pendulum` + `two_voice_counterpoint`.
4. **Two-harmony travelling units** — left out on purpose in `STYLE_NOTES`; still the Invention gap.

Bach is the **least blocked** dial. Argmax already sounds like “a prelude.” The sample path is the risk: seed 1 is a C-minor siciliano in stride.

---

### 2.2 Beethoven

**References**

| Piece | Why this dial | Evidence | MIDI | Plan JSON |
| --- | --- | --- | --- | --- |
| Sonata Op. 13 *Pathétique*, II Adagio cantabile | The singing slow movement: 8-bar theme, return an octave higher, denser LH | *Score* + *Analysis* <https://tonic-chord.com/beethoven-piano-sonata-no-8-in-c-minor-pathetique-analysis/>. FIDELITY: ret8 = 1.00; LH 2.5 → 8 onsets; melody MIDI 62 → 73. 2/4, A♭ major. | [`beethoven-op13-pathetique-2.mid`](../ref-midi/public/beethoven-op13-pathetique-2.mid) | [`beethoven-op13-pathetique-ii.json`](reference-plans/beethoven-op13-pathetique-ii.json) |
| Sonata Op. 27/2 *Moonlight*, I | The stillness archetype (C♯ minor already in the book) | *Score* / DCML. Bars 1–5: i – i4/2 – bII6 – V7 – i. Triplet ostinato — we approximate on the sixteenth grid. | [`beethoven-op27-2-moonlight-1.mid`](../ref-midi/public/beethoven-op27-2-moonlight-1.mid) | [`beethoven-op27-2-moonlight-i.json`](reference-plans/beethoven-op27-2-moonlight-i.json) |

**Proposed plan — Pathétique II (first 8).** Canonical file: [`reference-plans/beethoven-op13-pathetique-ii.json`](reference-plans/beethoven-op13-pathetique-ii.json). Excerpt:

```json
{
  "style": "beethoven",
  "character": "lyrical_song",
  "form": "period",
  "key": "Ab_major",
  "meter": "two_four",
  "texture": "alberti_melody",
  "palette": "diatonic",
  "tempo": "adagio",
  "dynamics": "p",
  "dynamicShape": "arch",
  "arrangement": "lift_on_return",
  "opening": "straight_in",
  "pedal": "half",
  "phrasing": "breathing",
  "bars": [
    { "chord": "I", "role": "statement", "contour": "arch" },
    { "chord": "vi", "role": "development", "contour": "wave" },
    { "chord": "V7_of_V", "role": "development", "contour": "rise" },
    { "chord": "V", "role": "half_cadence", "contour": "fall" },
    { "chord": "I", "role": "restatement", "contour": "arch" },
    { "chord": "vi", "role": "development", "contour": "wave" },
    { "chord": "I64", "chord2": "V7", "role": "climax", "contour": "arch" },
    { "chord": "I", "role": "cadence", "contour": "fall" }
  ]
}
```

The 16-bar reference is that 8-bar period **again**, +8va, arrangement level 3. Our 16-bar `period` layout is A A′ B A″ — close, but the B slot is new material the Adagio does not have until later.

**Moonlight I sketch.** Canonical file: [`reference-plans/beethoven-op27-2-moonlight-i.json`](reference-plans/beethoven-op27-2-moonlight-i.json). `meditative_stillness` / `period` / `Cs_minor` / `four_four` / `rolling_nocturne` / `diatonic` / `adagio` / `pp` / `steady` / `constant` / `straight_in` / `full`. First phrase already in the book: `i, i42, bII6, V7`. Proposed phrasing: `long_breathed`. **MISSING:** triplet grid (3:1 inside 4/4).

**Heuristic vs reference**

| | Pathétique II needed | Stub argmax | Sample |
| --- | --- | --- | --- |
| character | lyrical_song | **stormy_drama** (weight 26 > 22) | 2/3 stormy |
| form | period (8+8) | sentence | all three sentence |
| key / meter / texture | A♭, 2/4, alberti or murmuring | C minor, 4/4, tremolo_storm | scherzo / 3/4 / 6/8 |
| arrangement / opening | lift_on_return, straight_in | match | match |
| dynamics | *p* with a swell | *f* + sudden_contrast | *ff* showed up |

The stub’s **mode is still the C-minor storm** — the same peak Jev used to have before character was asked first. Character *exists*, and the lyrical archetype is correctly A♭ / adagio / *p* / period (`STYLE_BRIEF_AUDIT`, README). Argmax never picks it. So Beethoven “sounds like Beethoven” in the playground is the allegro caricature, not the movement FIDELITY used as the song model.

**Renderer even if the plan is right.** `lift_on_return` + theme memory can raise the return and thicken LH. They cannot (a) move the *whole 8-bar theme* up an octave as one gesture (return is bar-for-bar, register nudge is “a third higher on climax”), (b) hold one chord 2–4 bars as often as DCML says unless `holds` fires, (c) play Moonlight triplets.

**MISSING / stretch (Beethoven)**

1. **8-bar theme as the return unit** — form `period` at 16 bars inserts a B. Need a layout “A8 A8” or a `theme_length` closed field (`8` \| `4`). High payoff for this style and Chopin.
2. **Triplet subdivision** — Moonlight, several slow movements. Stretch: 12/8 at adagio (wrong meter name, closer pulse).
3. **`phrasing` on stormy pieces** — *Tempest* / Pathétique I breathe at fermatas; `stormy_drama` → `phrasingOf = none` (`JEV_REQUEST_STRUCTURE_REVIEW` §3.5). Confirmed by reverse-label: the Adagio is lyrical so it breathes; the storm references do not.
4. **sforzando / fp as more than `sudden_contrast`.** Stretch: dynamicShape already covers the block; in-bar *sf* is renderer dialect.

---

### 2.3 Chopin

**References**

| Piece | Why this dial | Evidence | MIDI | Plan JSON |
| --- | --- | --- | --- | --- |
| Nocturne Op. 9/2 | The model song-without-words: A A′ B A″, ornamented returns, pickup, unchanging LH | *Score* (Mutopia) + *Analysis* <https://en.wikipedia.org/wiki/Nocturnes,_Op._9_(Chopin)>, <https://paperlesspianoteacher.com/blog/chopin-nocturne-op-9-no-2-analysis>. 12/8, E♭, 34 bars; highest note late (bar 30). FIDELITY: returning run 4, ret4 0.81, pickup of an eighth. | [`chopin-op9-2-nocturne.mid`](../ref-midi/public/chopin-op9-2-nocturne.mid) | [`chopin-op9-2-nocturne.json`](reference-plans/chopin-op9-2-nocturne.json) |
| Prelude Op. 28/4 | Slow prelude / stillness; two-harmony bars | *Score*. E minor; FIDELITY / STYLE_NOTES: 27 % split bars, 3-bar holds. | [`chopin-op28-4-prelude.mid`](../ref-midi/public/chopin-op28-4-prelude.mid) | [`chopin-op28-4-prelude.json`](reference-plans/chopin-op28-4-prelude.json) |

**Proposed plan — Op. 9/2 (first 8 in 4-bar units).** Canonical file: [`reference-plans/chopin-op9-2-nocturne.json`](reference-plans/chopin-op9-2-nocturne.json). Excerpt:

```json
{
  "style": "chopin",
  "character": "lyrical_song",
  "form": "period",
  "key": "Eb_major",
  "meter": "twelve_eight",
  "texture": "rolling_nocturne",
  "palette": "chromatic_approach",
  "tempo": "andante",
  "dynamics": "p",
  "dynamicShape": "arch",
  "arrangement": "constant",
  "opening": "pickup",
  "pedal": "full",
  "phrasing": "upbeat",
  "bars": [
    { "chord": "I", "role": "statement", "contour": "arch" },
    { "chord": "V65", "role": "development", "contour": "wave" },
    { "chord": "I6", "role": "development", "contour": "leap_fall" },
    { "chord": "V7", "role": "half_cadence", "contour": "fall" },
    { "chord": "I", "role": "restatement", "contour": "arch" },
    { "chord": "V65", "role": "development", "contour": "wave" },
    { "chord": "I64", "chord2": "V7", "role": "climax", "contour": "arch" },
    { "chord": "I", "role": "cadence", "contour": "fall" }
  ]
}
```

Arrangement is **constant** for the first 16 (FIDELITY: the LH pattern never breaks; an étude is a bar-quantised *melody*, not a changing accompaniment). `lift_on_return` is what the stub prefers (60 %) — right for a ballade, wrong for this nocturne.

**Op. 28/4 sketch.** Canonical file: [`reference-plans/chopin-op28-4-prelude.json`](reference-plans/chopin-op28-4-prelude.json). `meditative_stillness` / `period` / `E_minor` / `four_four` / `rolling_nocturne` / `chromatic_approach` / `largo` / `pp` / `steady` / `constant` / `pickup` / `full`. Harmony leans i, iv, V with inner chromatic descent — **MISSING:** inner-voice line as a plan field.

**Heuristic vs reference**

| | Op. 9/2 needed | Stub argmax | Sample |
| --- | --- | --- | --- |
| character / form / texture | lyrical_song, period, rolling_nocturne | **match** | 2/3 lyrical + period; seed 1 was stormy / sentence / tremolo / B minor / presto |
| key / meter | E♭, **12/8** | D♭, **4/4** | 3/4 twice — waltz prior leaking into the nocturne |
| opening / pedal | pickup, full | **match** | vamp_intro 2/3 |
| arrangement | constant (this piece) | lift_on_return | all three lift |
| ornamented A′ | varied return | literal restatement | same |

**Renderer even if the plan is right.** Pickup + breath exist for `lyrical_song`. They cannot (a) write fioritura / turns on the return (ornament ladder is still a findings item), (b) tie the tune over the barline, (c) play 12/8 if the planner never picks it — **the meter exists and is not in Chopin priors**, (d) delay a resolution (the brief names it; no label).

**MISSING / stretch (Chopin)**

1. **12/8 on the nocturne prior** — cheapest win in this whole study. `METERS.twelve_eight` is already shipped; Chopin `meter` weights are 3/4 45 / 4/4 35 / 6/8 20. Op. 9/2, several nocturnes, and the barcarolle dialect live in 12/8.
2. **Ornament / fioritura as a closed return rung** — findings item 6. Guide figures have `neighbour` and `leap_recover`, not a turn or a cascade of grace notes.
3. **`phrasing` independent of character** — a stormy ballade still lands and rests; argmax storm (seed 1) would get `phrasing: none`.
4. **Mazurka accent (beat 2 or 3)** — `dance_lilt` + `stride_dance` + 3/4 is a waltz, not a mazurka. Proposed: `lilt: waltz | mazurka | sarabande | none` or a texture `mazurka_dance`.
5. **Rubato** — no tempo-map label. Stretch: leave it out; audio is mechanical on purpose.
6. **Inner chromatic line** — Op. 28/4. Stretch: `palette: chromatic_approach` + chord labels; the inner voice is renderer dialect (`chordal_melody` already slides by half-steps, but that texture is Fox/Debussy-coded).

---

### 2.4 Debussy

**References**

| Piece | Why this dial | Evidence | MIDI | Plan JSON |
| --- | --- | --- | --- | --- |
| Arabesque 1 | Parallel first-inversion tiles, compound flow | *Score* (Mutopia). STYLE_NOTES: IV6–iii6–ii6–I6; unresolved V9; bars duplicated (6–7 = 8–9). 4/4 with flowing 16ths; 9/8 is the compound-triple cousin in priors. | [`debussy-l66-arabesque-1.mid`](../ref-midi/public/debussy-l66-arabesque-1.mid) | [`debussy-l66-arabesque-1.json`](reference-plans/debussy-l66-arabesque-1.json) |
| Clair de lune | Arch, I6 opening, ii9 pedal, fade, no V–I | *Score*. STYLE_NOTES: I6 (no root in the bass), four bars of ii9, close I – iii – bIII6 – I, *ppp morendo*. FIDELITY: downbeats 13 / 69 / 19 % attacked / tied / silent; LH 1 → 4.8. | [`debussy-l75-clair-de-lune.mid`](../ref-midi/public/debussy-l75-clair-de-lune.mid) | [`debussy-l75-clair-de-lune.json`](reference-plans/debussy-l75-clair-de-lune.json) |

**Proposed plan — Arabesque 1 (first 8).** Canonical file: [`reference-plans/debussy-l66-arabesque-1.json`](reference-plans/debussy-l66-arabesque-1.json). Excerpt:

```json
{
  "style": "debussy",
  "character": "flowing_perpetual",
  "form": "mosaic_pairs",
  "key": "E_major",
  "meter": "four_four",
  "texture": "wash_arpeggio",
  "palette": "modal",
  "tempo": "andante",
  "dynamics": "p",
  "dynamicShape": "waves",
  "arrangement": "constant",
  "opening": "straight_in",
  "pedal": "full",
  "phrasing": "on_the_beat",
  "bars": [
    { "chord": "IV6", "role": "statement", "contour": "fall" },
    { "chord": "iii6", "role": "development", "contour": "fall" },
    { "chord": "ii6", "role": "restatement", "contour": "fall" },
    { "chord": "I6", "role": "echo", "contour": "fall" },
    { "chord": "IV6", "role": "contrast", "contour": "fall" },
    { "chord": "iii6", "role": "development", "contour": "fall" },
    { "chord": "ii6", "role": "contrast", "contour": "fall" },
    { "chord": "V9", "role": "half_cadence", "contour": "arch" }
  ]
}
```

**Clair de lune sketch.** Canonical file: [`reference-plans/debussy-l75-clair-de-lune.json`](reference-plans/debussy-l75-clair-de-lune.json). `dreamy_haze` / `arch_return` / `Db_major` / `nine_eight` / `wash_arpeggio` / `pentatonic` / `andante` / `pp` / `arch` / `lift_on_return` / `straight_in` / `full`. Proposed phrasing: `long_breathed`. Opening I6 is in the committed 8 bars; the later ii9×4 pedal and I – iii – bIII6 – I close stay in `_stretch`.

**Heuristic vs reference**

| | Needed | Stub argmax | Sample |
| --- | --- | --- | --- |
| character / form | haze or flow; mosaic or arch | dreamy_haze, mosaic_pairs | 2/3 haze; mosaic 2, arch 1 |
| key / meter / texture | D♭ or E; 9/8 or 4/4; planing / wash | D♭, 9/8, parallel_planing | F♯ minor twice; planing only 1/3 |
| dynamics / pedal / opening | *pp*, full, vamp or straight | **match** + vamp_intro | all vamp_intro |
| first chords | IV6–iii6–ii6–I6 or I6 | **I × 8** then a late bIII6 | holds + major book heads collapse to tonic |
| V7–I | never | none in the excerpt (good) | good |

The **book has the Arabesque phrase** (`open: IV6, iii6, ii6, I6`) and the Clair close. Argmax did not use them: `holds` sat on I. That is a planner-assembly miss, not a missing enum.

**Renderer even if the plan is right.** Planing and wash exist. They cannot (a) *tie 69 % of downbeats* (Clair) — `Note.dur` stays in the bar, (b) fade to *ppp morendo* (dynamics stop at *pp*; no ending label), (c) plane ninths as a different quality from triads (one `parallel_planing` texture).

**MISSING / stretch (Debussy)**

1. **Cross-bar ties** — Clair is the measured extreme (FIDELITY 69 %). Score-model change, M–L. Still the #1 renderer miss for this dial.
2. **Ending / morendo** — proposed `ending: ring | fade | tag | abrupt`. Findings item 3 covered intro better than outro.
3. **Holds should not erase verified planing phrases** — code rule, no new label. High payoff, low cost.
4. **Dynamics below *pp*** — stretch: *pp* + `decrescendo` is enough.

---

### 2.5 Philip Glass

**References** (scores in copyright; JSON only, no MIDI)

| Piece | Why this dial | Evidence | MIDI | Plan JSON |
| --- | --- | --- | --- | --- |
| *Glassworks*: “Opening” | The keyboard-accessible loop: three 4-bar groups × 4, 3:2, F minor | *Analysis* <https://en.wikipedia.org/wiki/Glassworks_(composition)>; Wu thesis <https://digital.library.unt.edu/ark:/67531/metadc10975/>. ABC:&#124;&#124;ABC; triplet eighths over duple eighths over whole-note bass. Hooktheory user tab: F minor / E♭ areas — *inferred* chords, not a score. | **none** (in copyright) | [`glass-glassworks-opening.json`](reference-plans/glass-glassworks-opening.json) |
| *Metamorphosis Two* | Quiet oscillation → fast four-note arpeggios → quiet | *Analysis* <https://www.parlancechamberconcerts.org/individual-program-notes/phillip-glass-(born-1937)/metamorphosis-ii>. Exact chords **not** encoded (`STYLE_NOTES`: not verifiable without scores). | **none** | [`glass-metamorphosis-two.json`](reference-plans/glass-metamorphosis-two.json) |

**Proposed plan — Opening (8-bar stand-in for one ABC cell).** Canonical file: [`reference-plans/glass-glassworks-opening.json`](reference-plans/glass-glassworks-opening.json). Excerpt:

```json
{
  "style": "glass",
  "character": "hypnotic_pulse",
  "form": "additive_loop",
  "key": "F_minor",
  "meter": "four_four",
  "texture": "minimal_cells",
  "palette": "diatonic",
  "tempo": "moderato",
  "dynamics": "mp",
  "dynamicShape": "terraced",
  "arrangement": "terraced_blocks",
  "opening": "straight_in",
  "pedal": "half",
  "phrasing": "on_the_beat",
  "bars": [
    { "chord": "i", "role": "statement", "contour": "static" },
    { "chord": "i", "role": "restatement", "contour": "static" },
    { "chord": "bVI", "role": "development", "contour": "static" },
    { "chord": "bVI", "role": "restatement", "contour": "static" },
    { "chord": "bIII", "role": "contrast", "contour": "static" },
    { "chord": "bIII", "role": "development", "contour": "static" },
    { "chord": "v", "role": "development", "contour": "static" },
    { "chord": "v", "role": "echo", "contour": "static" }
  ]
}
```

Chords are **inferred** from published loop descriptions and Hooktheory’s crowd tab (F minor, E♭/A♭ areas), not from a score. The book’s verified Tirol / Étude 17 cycle `i–bVI–bIII–V` is the honest closed stand-in. Wu describes three small loops plus a link — that is `additive_loop` plus a `surprise` breaker, which the stub already does.

**Metamorphosis Two sketch.** Canonical file: [`reference-plans/glass-metamorphosis-two.json`](reference-plans/glass-metamorphosis-two.json). `meditative_stillness` / `arch_return` / (key *not claimed*; JSON uses A minor only so `parsePlan` has a key) / `four_four` / `melody_over_ostinato` → a faster cell in the middle → quiet. `peak_then_bare`. Harmony is a book-legal stand-in. Do not invent the ostinato’s pitches.

**Heuristic vs reference**

| | Opening needed | Stub argmax | Sample |
| --- | --- | --- | --- |
| character / form / key | hypnotic_pulse, additive_loop, F minor | **exact match** | form always additive_loop; key G minor 2/3 |
| texture / arrangement / opening | minimal_cells, terraced, straight or vamp | **match** + vamp_intro | terraced always; texture wandered to pulsing |
| 4-bar cells × 4 | ABC ABC | 2-bar hook kept, bars 3–4 free (`themeSources` loop rule) | same |
| 3:2 | audible identity | not representable | — |
| inversion as variation | new bass each pass (`subs`) | book supports it; argmax sat on repeated roots (i i, bVI bVI) | holds ×2 flattened the cycle |

**Renderer even if the plan is right.** `minimal_cells` already stages add-a-note / phase-rotate every two bars (`STYLE_NOTES` second pass). It cannot (a) play 3:2 in 4/4 (sixteenth grid), (b) keep a **4-bar** cell intact for four repeats (loop theme memory is two bars), (c) stop without a cadence — argmax still ends `cadence` / `i` because every form’s last slot cadences.

**MISSING / stretch (Glass)**

1. **3:2 / hemiola grid** — Opening’s weaving identity. Proposed: `pulse: duple | triple | hemiola_3_2` consumed by `minimal_cells` and `melody_over_ostinato`. Or a texture `hemiola_cells`. Without this, Glass on piano is “even arpeggios in F minor.”
2. **Loop cell length 2 \| 4 \| 8** — one closed field the form expander reads. Opening is 4; “Time” is 4 with an 8-bar tune; our loops keep 2.
3. **Stop vs cadence** — finals already include `i64`; the last *role* is still `cadence`. Proposed: last slot may be `dissolve` only, or `close: cadence | stop | fade`.
4. **Exact Opening chords** — not proposed. Copyright. Keep verified cycles.

---

### 2.6 Hans Zimmer

**References** (scores in copyright; JSON only, no MIDI)

| Piece | Why this dial | Evidence | MIDI | Plan JSON |
| --- | --- | --- | --- | --- |
| “Time” (*Inception*) | Same 4-chord block × ~13, layers accumulate, peak ~70–77 %, yank back to bare piano | *Analysis* (Lehman 2016) <https://franklehman.com/wp-content/uploads/2021/01/2016-Manufacturing-the-Epic-Score-Music-Epic-Film-Routledge-1.pdf>. FIDELITY already quotes this. Exact RN **not** taken from a score. | **none** (in copyright) | [`zimmer-time.json`](reference-plans/zimmer-time.json) |
| “Cornfield Chase” (*Interstellar*) | 4-bar F–G–Am–G loop; melody is one repeated interval; theme → pulse → drive → B×3 → high layer → fade | *Analysis* (Berklee scoring paper, FIDELITY URL). | **none** | [`zimmer-cornfield-chase.json`](reference-plans/zimmer-cornfield-chase.json) |

**Proposed plan — “Time” as a 16-bar piano reduction (*inferred* harmony).** Canonical file: [`reference-plans/zimmer-time.json`](reference-plans/zimmer-time.json). The committed file repeats the 4-bar cell; excerpt is one pass:

```json
{
  "style": "hans_zimmer",
  "character": "hypnotic_pulse",
  "form": "layered_build",
  "key": "A_minor",
  "meter": "four_four",
  "texture": "melody_over_ostinato",
  "palette": "diatonic",
  "tempo": "andante",
  "dynamics": "p",
  "dynamicShape": "late_surge",
  "arrangement": "peak_then_bare",
  "opening": "vamp_intro",
  "pedal": "full",
  "phrasing": "long_breathed",
  "bars": [
    { "chord": "i", "role": "statement", "contour": "static" },
    { "chord": "bVI", "role": "restatement", "contour": "static" },
    { "chord": "bVII", "role": "development", "contour": "static" },
    { "chord": "V", "role": "restatement", "contour": "static" }
  ]
}
```

The four-bar cell repeats; arrangement levels 0 → 3 → 0. We **do not** write i–bVI–bIII–bVII (banned pop loop). The legal stand-in already in the book is **i–bVI–bVII–V** (STYLE_NOTES / brief). Lehman’s point is the *process* (same tonal block, new layer), not a specific RN we should invent. Key is *inferred* (common piano reductions sit in A minor); not claimed from a score.

**Cornfield Chase sketch.** Canonical file: [`reference-plans/zimmer-cornfield-chase.json`](reference-plans/zimmer-cornfield-chase.json). `heroic_bright` / `layered_build` / F major *inferred* / `four_four` / `melody_over_ostinato` / `late_surge` / `peak_then_bare`. Loop F–G–Am–G is I–V–vi–V, legal (not the banned I–V–vi–IV). Melody = one interval: contour `static` / `pendulum`.

**Heuristic vs reference**

| | “Time” needed | Stub argmax | Sample |
| --- | --- | --- | --- |
| character / form / meter | hypnotic_pulse, layered_build, 4/4 | **match** + D minor | layered_build 2/3; 6/8 appeared |
| texture / shape / arrangement / opening | melody_over_ostinato or pulsing; crescendo / late_surge; peak_then_bare; vamp | pulsing_chords, crescendo, **peak_then_bare**, vamp | arrangement always peak_then_bare |
| 4-bar loop intact | same RN every pass | i i / bVI bVI / bVII bVII / V V (holds stretched to 2) | good gravity, wrong cell length |
| 8-bar chant over 4-bar LH | theme ≠ loop | one form drives both | — |
| yank to bare piano | last third | peak_then_bare does this | match |

**Renderer even if the plan is right.** `peak_then_bare` + `layered_build` is the right pair. The post-pass doubles/thins *density*. It does not (a) **keep the identical ostinato figure** while adding a new layer (strings / choir / +8va chant) — that is Zimmer vs Glass, and the brief already says it, (b) hold a 4-bar harmonic cell without `holds` turning it into 2+2, (c) place the peak at 70–77 % of a 64-bar plan (levels are a ramp, not “iteration 9 of 13”).

**MISSING / stretch (Zimmer)**

1. **Same-figure layer add** — proposed renderer rule on `melody_over_ostinato` / `pulsing_chords` when `arrangement` is `build` or `peak_then_bare`: do not rotate or rewrite the LH; only double / add a sustained layer. No new label if we bind it to those textures + those arrangements. Highest Zimmer-specific payoff.
2. **Loop cell length** — shared with Glass.
3. **Theme length ≠ loop length** — “Time” chants 8 over a 4-bar block. Proposed: `hook_bars: 2 | 4 | 8` or form row `ostinato_variations`.
4. **Exact “Time” RN** — not proposed. Use the legal film loops already in the book.

---

### 2.7 Laufey

**References** (scores in copyright; JSON only, no MIDI)

| Piece | Why this dial | Evidence | MIDI | Plan JSON |
| --- | --- | --- | --- | --- |
| “From the Start” | Song-shaped jazz-pop piano: bossa, D♭, ii–V–I colour, intro | *Analysis* (not a score): Hooktheory <https://www.hooktheory.com/theorytab/view/laufey/from-the-start> (D♭, 4/4); Song Exploder interview (her own words: written after listening to bossa nova records) <https://songexploder.net/wp-content/uploads/2023/09/Song-Exploder-Laufey-Transcript.pdf>. Crowd / lesson sources describe E♭m9–A♭13–D♭maj7 as the hook (ii9–V13–Imaj7). **Not** read from commercial sheet; no price or edition claimed. | **none** (in copyright) | [`laufey-from-the-start.json`](reference-plans/laufey-from-the-start.json) |
| Harmonic signature across songs | Borrowed minor iv | *Analysis* <https://katiekeyboard.substack.com/p/laufey-and-lieder-harmonic-structure>: I–I7–vi7–iv6 and kin. This is **her language**, not a claim that “From the Start” itself uses iv. FIDELITY already noted our major book has `iv` only under `surprises`. | **none** | [`laufey-borrowed-iv-language.json`](reference-plans/laufey-borrowed-iv-language.json) |

**Proposed plan — “From the Start” piano reduction (*inferred*).** Canonical file: [`reference-plans/laufey-from-the-start.json`](reference-plans/laufey-from-the-start.json). Excerpt:

```json
{
  "style": "laufey",
  "character": "warm_groove",
  "form": "period",
  "key": "Db_major",
  "meter": "four_four",
  "texture": "lush_voicings",
  "palette": "diatonic",
  "tempo": "andante",
  "dynamics": "mp",
  "dynamicShape": "arch",
  "arrangement": "lift_on_return",
  "opening": "vamp_intro",
  "pedal": "half",
  "phrasing": "breathing",
  "bars": [
    { "chord": "ii9", "chord2": "V13", "role": "statement", "contour": "arch" },
    { "chord": "Imaj7", "role": "restatement", "contour": "fall" },
    { "chord": "ii9", "chord2": "V13", "role": "development", "contour": "wave" },
    { "chord": "Imaj7", "role": "half_cadence", "contour": "dip" },
    { "chord": "ii9", "chord2": "V13", "role": "restatement", "contour": "arch" },
    { "chord": "Imaj7", "role": "development", "contour": "fall" },
    { "chord": "ii9", "chord2": "V13", "role": "climax", "contour": "arch" },
    { "chord": "Imaj7", "role": "cadence", "contour": "fall" }
  ]
}
```

`V13` and `ii9` exist. Tempo: published analyses disagree on a single bpm (Hooktheory ~82 in FIDELITY; other listings call it a “quick bossa”). We label **andante** and do not pick a metronome number. Groove is the hole, not the RN.

A second, language-level sketch (not “From the Start”): [`reference-plans/laufey-borrowed-iv-language.json`](reference-plans/laufey-borrowed-iv-language.json). `lyrical_song` / `period` / D♭ / `chordal_melody` with `I, V7_of_IV, vi7, iv6` — the katiekeyboard family. That progression is **still not a head/phrase in `laufey.harmony.major`**.

**Heuristic vs reference**

| | Needed | Stub argmax | Sample |
| --- | --- | --- | --- |
| character / form / opening | warm_groove or lyrical; period or vamp_and_tag; vamp_intro | lyrical_song, period, vamp_intro | lyrical 2/3; vamp always |
| key | D♭ | F major | A♭ once; D♭ never in these three |
| texture | bossa / close voicings | chordal_melody (right family, no groove) | syncopated_ostinato once (3+3+2, not partido-alto) |
| harmony | ii9–V13–I, borrowed iv in the language | Imaj7, Imaj7, ii7, IVmaj7→V7 — jazz-pop, **no iv, no V13** | seed 1: Imaj7–vi7–ii65, still no iv |
| groove | bossa / swing eighths | even grid | — |

**Renderer even if the plan is right.** `vamp_intro` + `lift_on_return` + `lyrical_song` breath is the right song frame. It cannot (a) place bass on 1 and the *and* of 2 with off-beat shells, (b) swing the eighths, (c) sing a hook that rests like a vocalist unless Notes:guide picks a rest slot — default `renderPlan` still attacks downbeats (QA #1).

**MISSING / stretch (Laufey)**

1. **`bossa_comp` texture** — findings item 5, confirmed. Bass 1 + 2-and; shells on partido-alto; tune on top. Also useful to Fox `warm_groove`.
2. **Borrowed-iv *phrases*** — add I–V7_of_IV–vi7–iv6 (and I–Imaj7–IVmaj7–iv) to `laufey.harmony.major.phrases`, not only `surprises`. Cost S. Evidence is published analysis of her language, not one song’s score.
3. **`ii9` / `V13` in heads** — chords exist; heads prefer Imaj7 / ii7 / V7. One book line.
4. **D♭ prior** — key exists; Laufey weights F / B♭ / E♭ / C first. Cheap, audible for this reference.
5. **Swing eighths** — proposed `feel: straight | swing | bossa` or fold into the texture. Without it, every Laufey plan is “slow jazz chords in 4/4.”

Honesty: we did not hear a keyed Notes:guide pass (QA #5). A fake guide sketch of `hold_resolve` → `third` / `root` is what the dump script proposes for cadential bars; live Jev may not pick that.

---

### 2.8 Elijah Fox

**References** (shop scores exist; contents not seen — `STYLE_NOTES`)

| Piece / lesson | Why this dial | Evidence | MIDI | Plan JSON |
| --- | --- | --- | --- | --- |
| *City in the Sky* (his lesson) | Modal mixture as the hook | *Own words* (Flypaper / Soundfly): A♭maj7 (bVI from C minor) against Fmaj7 (IV from C major), then Cmaj7(♯5) with F6, close vi – V – ♯ivø7 – biii – ii. | **none** (shop scores unseen; no MIDI) | [`fox-city-in-the-sky.json`](reference-plans/fox-city-in-the-sky.json) |
| Displacement lesson | 5+5+6, 7+5+4, 4+3+5+4 over F–9 / C–9 | *Own words*, same syllabus. Encoded as `displaced_arpeggio`. | **none** | [`fox-displacement-lesson.json`](reference-plans/fox-displacement-lesson.json) |

No published form analysis of the miniatures beyond AABA / loops in that syllabus. Unverified: “felt piano,” gospel (already struck from the brief).

**Proposed plan — *City in the Sky* lesson reduction.** Canonical file: [`reference-plans/fox-city-in-the-sky.json`](reference-plans/fox-city-in-the-sky.json). Excerpt:

```json
{
  "style": "elijah_fox",
  "character": "dreamy_haze",
  "form": "vamp_and_tag",
  "key": "C_major",
  "meter": "four_four",
  "texture": "chordal_melody",
  "palette": "modal",
  "tempo": "andante",
  "dynamics": "p",
  "dynamicShape": "arch",
  "arrangement": "build",
  "opening": "vamp_intro",
  "pedal": "full",
  "phrasing": "long_breathed",
  "bars": [
    { "chord": "bVImaj7", "role": "statement", "contour": "arch" },
    { "chord": "IVmaj7", "role": "restatement", "contour": "wave" },
    { "chord": "bVImaj7", "role": "development", "contour": "arch" },
    { "chord": "IVmaj7", "role": "restatement", "contour": "wave" },
    { "chord": "Imaj7s5", "role": "contrast", "contour": "static" },
    { "chord": "IVadd6", "role": "development", "contour": "dip" },
    { "chord": "vi", "chord2": "V", "role": "development", "contour": "fall" },
    { "chord": "sharp_iv_half_dim7", "role": "surprise", "contour": "fall" }
  ]
}
```

Tag would continue biii7 – ii – Imaj7s11 / I6_9 (finals already in the book).

**Displacement sketch.** Canonical file: [`reference-plans/fox-displacement-lesson.json`](reference-plans/fox-displacement-lesson.json). Same harmony family on `i9` / `iv9`; texture `displaced_arpeggio`; character `dreamy_haze`. Groupings are in the texture prose, not a plan field.

**Heuristic vs reference**

| | Lesson needed | Stub argmax | Sample |
| --- | --- | --- | --- |
| character / form / key | haze, vamp_and_tag, C | **exact match** | vamp_and_tag all three; haze 2/3 |
| texture | chordal_melody or displaced_arpeggio | **displaced_arpeggio** | pulsing_chords wandered in |
| harmony | bVImaj7 ↔ IVmaj7, Imaj7s5, IVadd6 | **bVImaj7, bVImaj7, IVmaj7, IVmaj7, Imaj7s5, IVadd6… Imaj7s11** | the verified pair is the mode |
| opening / pedal | vamp, full | **match** | straight_in 2/3 |
| 5+5+6 | texture-internal | yes if texture sticks | lost when texture wanders |

This is the **best stub-to-reference fit on the dial.** The book was built from the lesson; argmax plays it back.

**Renderer even if the plan is right.** `displaced_arpeggio` can regroup sixteenths. It cannot (a) slide an inner voice under a *sung* top as a separate plan (texture `chordal_melody` does this, but only if picked), (b) hang a colour ending without the last role being `cadence` (same stop-vs-cadence issue as Glass), (c) prove the shop-score voicings — we have not seen them.

**MISSING / stretch (Fox)**

1. **Accent-grouping as a closed sub-label** — `5+5+6` \| `7+5+4` \| `4+3+5+4` on `displaced_arpeggio`, so Jev can pick the lesson’s number. Low cost; only this texture.
2. **Stop on a colour chord** — shared `close` label.
3. **Shop scores** — not used, not proposed.

---

## 3. Cross-style gaps that block “a real song / that composer”

Rows are things a first listen notices. “Plan?” = can we already write it in `CompositionPlan`? “Renderer?” = if we do, does `renderPlan` (or Notes:guide) realise it?

| Gap | Bach | Beethoven | Chopin | Debussy | Glass | Zimmer | Laufey | Fox | Plan? | Renderer? |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Phrase-length return (4–8), not 1–2 | n/a (Fortspinnung) | Pathétique II = 8 | Op. 9/2 = 4 | mosaic 2 | cell 4 | cell 4 + chant 8 | song 4 | vamp 2–4 | partial (`themeSources`; loops keep **2**) | yes for 4-bar A; no for 8-bar A |
| Breath / pickup / air | no (correct) | Adagio yes; storm fermata | pickup + air | Clair ties | no | long tones | vocal rest | long tones | character proxy only | lyrical yes; stormy **no**; ties **no** |
| Return that is not a copy | n/a | +8va + LH×3 | ornament ladder | echo / dissolve | new inversion / phase | **same figure**, new layer | last A lift | vary the vamp | `arrangement` + `varied` flag | density yes; ornament **no**; same-figure layer **no** |
| Intro before the tune | no | rare | sometimes | often | cell starts at once | vamp | 2-bar vamp | vamp | `opening` | yes |
| Stop / fade / colour ending | Picardy | PAC | PAC or fade | **morendo, no V–I** | **stop** | yank to bare | tag | **Imaj7s11** | finals exist; last role is `cadence` | rolled last bar; not a fade |
| Groove / lilt / 3:2 | 3/8 | triplets | **12/8**, mazurka accent | 9/8 ok | **3:2** | 4/4 pulse | **bossa / swing** | 5+5+6 | meters incomplete; no feel | sixteenth grid |
| Dialect LH | prelude figure ok | Alberti / tremolo ok | roll vs waltz vs mazurka | planing / wash | cell process | ostinato stays | **bossa shells** | displacement ok | most textures exist; **no bossa, no mazurka** | — |
| Harmony book vs reference | I–ii42 hit | storm book, not Adagio | cadences ok; no 12/8 | phrases exist, holds flatten | verified cycles | legal loops | **no iv phrase, no V13 head** | **hit** | — | — |
| Notes:guide figure set | prelude needs none | motto / sentence | fioritura missing | floating off-beat | static cell | one-interval chant | long tone + rest | inner slide | 7 figures | lyrical rest slot only |

**What actually blocks “a real song” (all lyrical styles).** Still the FIDELITY / QA #1 stack: breath that is not character-locked, a return you can hear, an intro. Reverse-labeling **adds** that the *unit* of return is often 8 bars (Beethoven Adagio) or a 4-bar cell repeated four times (Glass), and that `arrangement: lift_on_return` is **wrong** for Op. 9/2’s first page (constant LH) and **right** for Pathétique II.

**What actually blocks “that composer.”** Dialect, not song form:

- Chopin without 12/8 + ornament = a slow 4/4 nocturne étude.
- Glass without 3:2 + 4-bar cell = even arpeggios.
- Zimmer without same-figure layering = Glass with a crescendo (the brief’s own negative).
- Laufey without bossa + borrowed-iv phrases = soft C-major jazz-pop.
- Beethoven argmax without the lyrical archetype = C-minor storm every time.
- Fox is in good shape if `displaced_arpeggio` sticks.
- Bach argmax is in good shape if sample does not wander to stride.

---

## 4. Ranked “add this closed label / renderer rule”

Payoff = first-listen “song / that composer.” Cost = engineering (both planners, sheet, tests). Aligned with FIDELITY §5, QA “next 10,” and `NOTES_JEV_QUALITY` / request-structure A1–A2 — **re-ranked with reverse-label evidence**, not copied.

| # | Ship | Kind | Payoff | Cost | Evidence here | Already said? |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | **`phrasing` global** + make default `renderPlan` rest at phrase ends | label + rule | ★★★★★ | M (label S; rhythm banks already half-done) | Op. 9/2 pickup; Pathétique II; Laufey vocal air; Clair long tones. Stormy Chopin/Beethoven still `none`. | FIDELITY #1, QA #1, JEV_REQUEST A1. **Update:** do not wait on Jev — stub argmax storm never breathes. |
| 2 | **`hook_bars: 2 \| 4 \| 8`** (or an `A8 A8` period layout) | label | ★★★★★ | M | Pathétique II is an 8-bar theme; Glass Opening is a 4-bar cell ×4; “Time” is 4-bar LH + 8-bar chant; loops keep 2. | New as a field. FIDELITY #7 (1+1+2) is the 4-bar case. |
| 3 | **Same-figure layer add** on ostinato textures when arrangement is build / peak_then_bare | rule | ★★★★★ for Zimmer; ★★★ Glass negative | S–M | Lehman: same block, new layer, never a new process. Brief already forbids cell rotation. | FIDELITY #2 said “arrangement follows form.” **Update:** the label shipped; Zimmer still needs the *figure to stay*. |
| 4 | **`bossa_comp` + Laufey iv / ii9–V13 phrases** | texture + book | ★★★★ for one style | S + M | From the Start analyses; katiekeyboard iv family; argmax never emits iv or V13. | FIDELITY #5. **Update:** split “From the Start” (ii–V–I + bossa) from “language” (borrowed iv). Both needed. |
| 5 | **Put `twelve_eight` on Chopin nocturne priors** | prior | ★★★★ for Chopin | S | Op. 9/2 *is* 12/8; meter exists; priors omit it; argmax is 4/4. | Not in the three docs. Cheapest dialect win. |
| 6 | **Ornament ladder on `varied` returns** | rule | ★★★★ at 16, ★★★★★ at 32 | M | Op. 9/2 A′; guide has no turn. | FIDELITY #6. |
| 7 | **`pulse: duple \| triple \| hemiola_3_2`** (or texture `hemiola_cells`) | label | ★★★★ Glass; ★★★ Moonlight | M | Opening’s identity; Moonlight triplets. | STYLE_NOTES “left out: tuplets.” Reverse-label says it *is* the Glass tell. |
| 8 | **`close: cadence \| stop \| fade`** | label | ★★★ | S | Glass stop; Debussy morendo; Fox colour hang; Zimmer yank (partly `peak_then_bare`). | JEV_REQUEST mentioned ending. |
| 9 | **Holds must not flatten verified planing / prelude phrases** | rule | ★★★ | S | Debussy argmax = I×8; Arabesque phrase unused. Bach argmax used I–ii42 then a generic sequence. | New. |
| 10 | **Phrase-level `phrase_shape`** (drop 4 bar contours) | label + delete | ★★★ | S–M | Four contours still cannot form Op. 9/2’s arch. | JEV_REQUEST A2. |
| 11 | **`feel: straight \| swing \| bossa`** or fold into #4 | label | ★★★ Laufey | S if folded | Even grid on every Laufey plan. | New / part of #4. |
| 12 | **`lilt: waltz \| mazurka \| sarabande`** | label | ★★ Chopin/Bach dance | S | Mazurka accent ≠ stride 3/4. | New. After #5. |
| 13 | **Guide figures: `turn`, `mordent`, `chant_interval`** | notes enum | ★★ if Guide is the product | S | Fioritura; Zimmer one-interval melody; Bach aria mordents already in a texture. | NOTES_JEV_QUALITY D1 set is 7 shapes. **Update:** Guide cannot name the reference tunes’ figures. QA #5 (keyed listen) still first. |
| 14 | **Cross-bar ties** | score model | ★★★ Clair; ★★ songs | M–L | FIDELITY Clair 69 %. | FIDELITY #1c. Still later. |

**Not re-ranked, still true (QA UX, not music):** desktop 64-bar stand, cache key `style+bars`, Generate-to-apply CTA, Best-of honesty, phone Notes labels, stub-fast / Jev-honest CI. They do not change the first 16 bars a stranger hears.

**Considered, still out**

- Verse/chorus form family — wait until #1–3. `period` + 8-bar hook + breath *is* the Adagio and the nocturne.
- Jev writes free pitches — no.
- More chords as a project — Fox/Bach/Debussy books already have the reference RNs. Laufey needs *phrases*, not new chord ids (`iv6`, `V13`, `ii9` exist).
- Commercial sheet or prices — not used.
- Copyrighted MIDI in git — never.

---

## 5. Fake Notes:guide vs what the references would ask for

Dump script mapping (role/contour → figure/goal), run on the argmax plans:

| Style (argmax) | Typical sketch | What the reference wanted | Guide hole |
| --- | --- | --- | --- |
| Bach prelude | `step_to_goal` / `neighbour` on a static broken-chord piece | **no singing line** | Guide always writes a tune. Prelude should skip Notes or keep code. |
| Beethoven storm | `arpeggio_up` + `rise` × many | motto (leap + repeat) then sequence | no `motto` figure; sentence 1+1+2 is form, not figure |
| Chopin nocturne | `step_to_goal` / `hold_resolve` at cadence | ornamented arch, pickup, air | no `turn`; rest only if lyrical (yes here) |
| Debussy haze | `step_to_goal` / `hold_resolve` | floating, often off the beat, ties | no off-beat figure; no ties |
| Glass loop | `neighbour` / `motif_echo` / static | cell, not a melody toward a chord tone | `motif_echo` is the closest; goal (root/3rd/5th) over-specifies |
| Zimmer | `neighbour` + static | one interval against changing chords | need `chant_interval` |
| Laufey | `step_to_goal` / `hold_resolve` | vocal hook, rest, maybe pickup | figure set is almost enough; groove is the accompaniment, which Guide does not touch (good — Q1) |
| Fox | `step_to_goal` / `motif_echo` | inner-voice slide + colour top | no `inner_slide`; texture already does it if left to code |

**Implication for D1.** Guide helps Laufey / Chopin lyrical / Beethoven Adagio (figure + goal + code rhythm). It **hurts** Bach prelude and Glass cells (it invents a tune). A closed `notes_scope: singing_line | none` — or simply “Guide disabled for `flowing_perpetual` / `hypnotic_pulse` without a melody texture” — is a planner policy, not a new op.

QA #5 still stands: this environment did not hear live Guide.

---

## 6. Local scripts

```text
# HeuristicPlanner samples (JSON only; no MIDI)
npx --yes tsx scripts/dump-heuristic-plans.ts
npx --yes tsx scripts/dump-heuristic-plans.ts --styles chopin,laufey --bars 16 --seeds 1,7,19 --pick sample --guide-sketch
npx --yes tsx scripts/dump-heuristic-plans.ts --pick argmax --out /tmp/plans.json

# parsePlan every committed reference sketch
npx --yes tsx scripts/validate-reference-plans.ts
```

Needs `npm install`. Neither script writes MIDI. Public-domain encodings already in [`docs/ref-midi/public/`](../ref-midi/public/) are fetched from Mutopia, not generated.

---

## 7. What this note does not claim

- It does not claim commercial sheet was read, or quote prices, or encode copyrighted MIDI.
- Glass / Zimmer / Laufey / Fox bar-level RNs are **inferred** from published analyses and (Fox) own lessons. Where the book already has a verified cycle, that is the closed stand-in.
- It does not re-run the 192-piece MIDI metrics from FIDELITY. The heuristic excerpts above are 8 argmax + 24 sample plans (3 seeds × 8 styles), enough to see mode vs wander, not enough to re-estimate ret4.
- It does not ask to merge. Coder merges when Music pings.
