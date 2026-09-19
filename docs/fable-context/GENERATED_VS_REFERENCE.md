# Generated vs reference (post-#46)

Stephen, 2026-09-19, branch `cursor/generated-vs-reference-4e47`, on `main` after #46 (`phrasing`, Chopin `twelve_eight` prior, Laufey `bossa_comp`, Zimmer same-figure layer). Compares **what we actually emit** — HeuristicPlanner plans realized through `renderPlan` (Notes:**code**), Notes:**guide**, and Notes:**line** — to the in-repo reverse-labelled plans and public-domain MIDI.

**This is not another reverse-label study.** `REFERENCE_PLAN_GAP.md` asked what the vocabulary *should* say. This note asks: after #46, do we *pick* those labels, and do the three realize paths *sound like* the references?

**Thesis.** #46 closed the cheap dialect labels (12/8 nocturne, `phrasing`, `bossa_comp`, ostinato layer-keep). The stub’s **argmax now aims at the right piece-type for Chopin and Laufey**, which it did not before. What still blocks a first listen is **above the bar and inside the singing line**: 8-bar / 4-bar return units (`hook_bars`), Beethoven’s storm-as-mode, Debussy holds flattening verified phrases, Guide inventing a tune on preludes/cells, and a line that still attacks every downbeat even when the plan says `breathing`.

---

## 0. Method

**Planners.** `HeuristicPlanner` only. Argmax seed 1 + sample seeds 1 / 7 / 19, 16 bars, brief on. No live Jev: this environment has **no `TYPESAFE_API_KEY` / `VITE_JEV_API_KEY`** (confirmed empty; only `.env.example` on disk). `GET /api/jev` was not required. Guide and line overlays are **fake closed picks** run through the same realize paths MusicApp uses (`realizeJevGuideChoices` / `realizeJevNoteChoices` → `applyNotePhrases`). That is not “Jev sang this.” It is “if the closed picks look like the dump-script sketch, here is the Score.” Say so in every Guide / Line sentence.

**References.** Primary per dial (same pieces as the gap study):

| Style | Primary plan JSON | MIDI |
| --- | --- | --- |
| Bach | [`bach-bwv846-prelude.json`](reference-plans/bach-bwv846-prelude.json) | [`bach-bwv846-wtk1-prelude1.mid`](../ref-midi/public/bach-bwv846-wtk1-prelude1.mid) |
| Beethoven | [`beethoven-op13-pathetique-ii.json`](reference-plans/beethoven-op13-pathetique-ii.json) | [`beethoven-op13-pathetique-2.mid`](../ref-midi/public/beethoven-op13-pathetique-2.mid) |
| Chopin | [`chopin-op9-2-nocturne.json`](reference-plans/chopin-op9-2-nocturne.json) | [`chopin-op9-2-nocturne.mid`](../ref-midi/public/chopin-op9-2-nocturne.mid) |
| Debussy | [`debussy-l66-arabesque-1.json`](reference-plans/debussy-l66-arabesque-1.json) | [`debussy-l66-arabesque-1.mid`](../ref-midi/public/debussy-l66-arabesque-1.mid) |
| Glass | [`glass-glassworks-opening.json`](reference-plans/glass-glassworks-opening.json) | none (in copyright) |
| Zimmer | [`zimmer-time.json`](reference-plans/zimmer-time.json) | none |
| Laufey | [`laufey-from-the-start.json`](reference-plans/laufey-from-the-start.json) | none |
| Fox | [`fox-city-in-the-sky.json`](reference-plans/fox-city-in-the-sky.json) | none |

Committed reference `plan` objects still **omit `phrasing`** (it lived in `_stretch` when #45 wrote them). `parsePlan` fills the character default. Where `_stretch` names a proposed phrasing, that is the *wanted* label.

**Metrics** (first 16 sounding bars; generated skyline = top of `treble`; MIDI skyline = highest onset in the Mutopia file). Same family as `FIDELITY_FINDINGS.md`: silent-beat %, downbeats attacked, `ret4` / `ret8` / longest returning run (≥ 75 % pitch-class match per beat), chord-tone rate on the plan’s RN, leap mean/max, register mean, LH onset density early vs on the return. Q1: LH fingerprint identical after overlay?

Script: `npx --yes tsx scripts/compare-generated-vs-reference.ts` (JSON only; never writes MIDI). `--live-jev --live-styles chopin,laufey` is wired and will no-op without a key.

**Modes.**

| Mode | What we ran | Honesty |
| --- | --- | --- |
| **code** | labels → `renderPlan` | Live stub. Default Generate. |
| **guide** | fake figure+goal → `realizeJevGuideChoices` | Showcase path, **stub picks**. Live Jev not heard. |
| **line** | fake 4-slot rhythm+degrees → `realizeJevNoteChoices` | Raw experiment, **stub picks**. |

---

## 1. What #46 already closed

Measured, not hoped:

| #46 item | Evidence this pass |
| --- | --- |
| Chopin `twelve_eight` prior | Argmax meter is **`twelve_eight`**. Pre-#46 gap study: 4/4. Mutopia Op. 9/2 is 12/8; generated `ret4` 0.75 vs MIDI 0.81, longest run **4 = 4**. |
| `phrasing` global | Argmax writes it on every style. Chopin **`upbeat`** (the `_stretch` ask). Laufey / Fox lyrical **`breathing`**. Zimmer **`long_breathed`**. Bach prelude **`on_the_beat`**. Beethoven storm **`on_the_beat`** (correct for that caricature, wrong for the Adagio). |
| Laufey `bossa_comp` | Argmax texture is **`bossa_comp`**. Pre-#46: `chordal_melody`. |
| Laufey `ii9` / `V13` heads | Argmax bars: `Imaj7, Imaj7, ii9, V13` then `ii9\|V13`. The gap study’s “no V13” is closed on the mode. |
| Zimmer same-figure layer | Renderer rule is bound to `melody_over_ostinato` / `syncopated_ostinato` + `build` / `peak_then_bare`. Argmax still picks **`pulsing_chords`**, so the new rule does not fire on the mode. Sample seed 7 *does* pick the ostinato texture. Density on return still rises (bass onsets 4 → 11) via `applyArrangement`. |

**Do not re-propose `phrasing` or `bossa_comp`.** They ship and the stub uses them.

What #46 did *not* move, even when the label is right:

- **Downbeats are still 100 % attacked** on every lyrical Generate (Chopin / Laufey / Fox / Debussy best). `upbeat` / `breathing` carve a phrase-end rest and then a **pickup fills the next downbeat**, so the FIDELITY “étude” tell (fresh attack on every barline) is intact. Silent-beat % on code is 1–8 %, not the 13–26 % of the sung repertoire.
- **Borrowed iv** still never appears on Laufey argmax or the three samples. The language sketch (`I – V7/IV – vi7 – iv6`) is in the book; the mode does not pick it.
- **Beethoven argmax is still the C-minor storm.** `phrasing` cannot save a piece that never chose `lyrical_song`.

---

## 2. Per style — reference vs best generated

“Best generated” = highest global-label overlap with the primary reference (14 fields). Argmax is also always reported: that is what Generate (decide-by argmax) plays.

Guide / line numbers are **fake-pick realize**, not live Jev.

### 2.1 Bach — BWV 846

| | Reference | Argmax (also best, 14/14 globals) |
| --- | --- | --- |
| character / form / key / meter / texture | flowing_perpetual, spinning_out, C, 4/4, broken_chord_prelude | **exact** |
| arrangement / opening / pedal / phrasing | constant, straight_in, dry, on_the_beat | **exact** |
| first 8 chords | I, ii42, V65, I, vi6, V7/V, V6, Imaj42 | I, ii42, then **vi7–ii7 fifths** (book phrase unused after bar 2) |

| Metric (16 bars) | MIDI | code | guide (fake) | line (fake) |
| --- | --- | --- | --- | --- |
| silent beats | 0 % | 48 % † | 0 % | 0 % |
| downbeats attacked | 16/16 | 1/16 † | **16/16** | **16/16** |
| ret4 / longest run | 0.38 / 1 | 0.25 / 6 | 0.25 / — | 0.88 / — |
| chord-tone rate | — | 0.99 | 1.00 | 0.69 |
| leap mean / max | 6.7 / 22 | 6.0 / 12 | 2.8 / 17 | 3.9 / 17 |
| register mean | 66.4 | 66.8 | 65.5 | 75.5 |
| Q1 LH survived | — | — | **yes** | **yes** |

† Code skyline of `broken_chord_prelude` is not “a tune”: many beats have no top-voice attack. MIDI skyline of the real prelude *is* the figure and hits every downbeat. Do not read 48 % silence as breath.

**Still missing.** Sample seed 1 still wanders to `lyrical_song` / 6/8 / `stride_dance` (5/14). Holds + head/seq assembly skip the verified I–ii42–V65–I phrase after two bars. Guide **hurts** this dial: it writes a singing line (`step_to_goal` / `motif_echo`) that attacks every downbeat on a piece that should have none. Line’s high `ret4` is four even degrees repeating, not Fortspinnung.

### 2.2 Beethoven — Pathétique II

| | Reference (Adagio) | Argmax / best (5/14) |
| --- | --- | --- |
| character / form | lyrical_song, period | **stormy_drama, sentence** |
| key / meter / texture | A♭, 2/4, alberti_melody | **C minor, 4/4, tremolo_storm** |
| tempo / dynamics / phrasing | adagio, *p*, breathing | allegro, *f*, **on_the_beat** |
| arrangement / opening | lift_on_return, straight_in | match |
| first 8 | I, vi, V7/V, V, I, vi, I64\|V7, I | i×4, V7/IV, iv, iv, i64\|V |

| Metric | MIDI Adagio | code (storm) | guide (fake) | line (fake) |
| --- | --- | --- | --- | --- |
| meter | 2/4 | 4/4 | 4/4 | 4/4 |
| ret8 / longest run | **0.94 / 8** | 0.79 / 8 | 0.19 / — | 0.75 / — |
| register mean | **62** | **80.6** | 80.3 | 79.4 |
| LH density early → return | 13 → 20.5 onsets | 4 → 8 | (LH same) | (LH same) |
| downbeats attacked | 16/16 | 16/16 | 16/16 | 16/16 |
| Q1 | — | — | yes | yes |

**#46 did nothing here.** The lyrical archetype still exists (A♭ / adagio / *p* / period — `STYLE_BRIEF_AUDIT`). Argmax never draws it. Samples: heroic 6/8 scherzo, stormy 3/4 chords. We are scoring the wrong piece against the Adagio MIDI.

Guide on the storm is `arpeggio_up` × many — a motto-less rise, not an 8-bar cantabile. Line is four even attacks, high `ret4` from repetition, register still an octave too high.

### 2.3 Chopin — Op. 9/2

| | Reference | Argmax / best (11/14) |
| --- | --- | --- |
| character / form / texture | lyrical_song, period, rolling_nocturne | **match** |
| meter | **twelve_eight** | **twelve_eight** ← #46 |
| phrasing | **upbeat** (proposed) | **upbeat** ← #46 |
| key / tempo | E♭, andante | D♭, adagio |
| opening / pedal | pickup, full | **match** |
| arrangement | **constant** (LH never breaks) | lift_on_return |
| first 8 | I, V65, I6, V7, I, V65, I64\|V7, I | I, I, I6, I64\|V, I, I, I64\|V7, I (**holds** on I) |

| Metric | MIDI | code | guide (fake) | line (fake) |
| --- | --- | --- | --- | --- |
| meter | 12/8 | twelve_eight | twelve_eight | twelve_eight |
| silent beats | 0 % | 1.6 % | 0 % | 1.6 % |
| downbeats attacked | 16/16 | **16/16** | **16/16** | **16/16** |
| ret4 / longest run | **0.81 / 4** | **0.75 / 4** | 0.25 / — | 0.44 / — |
| chord-tone rate | — | 0.97 | 1.00 | 0.99 |
| leap mean / max | 6.7 / 27 | 6.8 / 22 | 5.3 / 17 | 5.6 / 15 |
| register mean | 72.4 | 71.4 | 69.3 | 69.0 |
| LH early → return | 30 → 34 (ornament) | 1.25 → 1.75 | same LH | same LH |
| guide rest slots | — | — | 14/16 bars | 15/16 bars |
| Q1 | — | — | **yes** | **yes** |

**#46 win.** The nocturne *frame* is now the mode: 12/8, rolling LH, pickup, upbeat phrasing, 4-bar return. Register matches the Mutopia file. Sample seed 1 is still the stormy 3/4 tremolo (3/14) — the wander risk is unchanged.

**Still missing.** (1) Arrangement `lift_on_return` vs this page’s constant LH. (2) Holds sit on I and skip V65. (3) No fioritura — Guide’s figure set is `step_to_goal` / `motif_echo` / `hold_resolve`, no `turn`. (4) Phrase-end rest + pickup does **not** create silent downbeats. (5) Guide `ret4` *drops* (0.75 → 0.25): the overlay rewrites the returning tune instead of ornamenting it. That is the showcase path failing the nocturne’s actual trick (same A, more lace).

### 2.4 Debussy — Arabesque 1

| | Reference | Argmax (4/14) | “Best” sample 19 (6/14) |
| --- | --- | --- | --- |
| character / form | flowing_perpetual, mosaic_pairs | dreamy_haze, mosaic_pairs | dreamy_haze, mosaic_pairs |
| key / meter / texture | E, 4/4, wash_arpeggio | D♭, **9/8**, parallel_planing | F♯ minor, 4/4, chordal_melody |
| phrasing | on_the_beat | long_breathed | long_breathed |
| first 8 | **IV6–iii6–ii6–I6** … | **I × 8** | i, bIII, i, bIII … |

Argmax is the honest Generate: Clair-ish haze / 9/8 / planing, then **holds erase the Arabesque phrase** (gap study #9, still true). Sample 19 wins the label-count but is not a better Arabesque.

| Metric | MIDI Arabesque | argmax would be I×8 planing | sample-19 code | sample-19 guide |
| --- | --- | --- | --- | --- |
| ret4 / longest run | 0.13 / 2 | (not the best row) | 0.13 / 2 | 0.25 |
| downbeats | 16/16 | — | 16/16 | 16/16 |
| register | 65.1 | — | 79.9 | 71.5 |
| Q1 | — | — | — | yes |

**Still missing.** Holds vs verified planing phrases. Cross-bar ties (Clair 69 % in FIDELITY; score model still forbids them). Guide on haze writes a chord-tone tune with 12 rest *slots* and **zero silent beats** — floating off the beat is not a figure.

### 2.5 Glass — Glassworks Opening

| | Reference (inferred) | Argmax / best (12/14) |
| --- | --- | --- |
| character / form / key / meter / texture | hypnotic_pulse, additive_loop, F minor, 4/4, minimal_cells | **exact** |
| arrangement / phrasing | terraced_blocks, on_the_beat | **match** |
| opening / dynamicShape | straight_in, terraced | vamp_intro, steady |
| first 8 | i i / bVI bVI / bIII bIII / v v | i i / bVI bVI / bIII bIII / V, **v6** |

| Metric | JSON process | code | guide (fake) | line (fake) |
| --- | --- | --- | --- | --- |
| ret4 (4-bar cell) | should be high | **0.06** | **0.00** | 0.88 † |
| longest run | 4 | **1** | — | — |
| downbeats | n/a | 16/16 | 16/16 | 16/16 |
| Q1 | — | — | yes | yes |

† Line `ret4` is four even degrees copied, not a 4-bar cell. Ignore it.

**#46 irrelevant.** The mode already aimed here. Loop theme memory is still **two bars**; `holds` stretch the cycle to i i / bVI bVI so bars 5–8 are not bars 1–4. Guide invents a neighbour/arpeggio tune on a cell piece (`notes_scope: none` still wanted). 3:2 is still unsayable.

### 2.6 Zimmer — “Time”

| | Reference (inferred) | Argmax / best (11/14) |
| --- | --- | --- |
| character / form / meter | hypnotic_pulse, layered_build, 4/4 | **match** |
| phrasing | **long_breathed** (proposed) | **long_breathed** ← #46 |
| arrangement / opening | peak_then_bare, vamp_intro | **match** |
| texture | melody_over_ostinato | **pulsing_chords** (same-figure rule does not bind) |
| key / shape | A minor, late_surge | D minor, crescendo |
| first 8 | i, bVI, bVII, V ×2 | i i / bVI bVI / bVII bVII / V V |

| Metric | Process ask | code | guide (fake) | line (fake) |
| --- | --- | --- | --- | --- |
| ret4 (4-bar cell) | high | **0.00** | 0.00 | 0.88 † |
| LH early → return | same figure, more layers | 4 → **11** | same LH | same LH |
| contour | static / one interval | static | **rise** | rise |
| leap max | small | 12 | 10 | **24** |
| Q1 | — | — | yes | yes |

**#46 half-win.** Phrasing label is right. Arrangement thickens. The figure-keep rule misses the mode because texture priors still peak on `pulsing_chords`. The harmonic *cell* is 2+2 holds, not a 4-bar block. Guide writes `neighbour` + `arpeggio_up` — a climbing tune, not a chanted interval. `hook_bars: 4` (LH) + 8 (chant) still warranted.

### 2.7 Laufey — “From the Start” sketch

| | Reference (inferred) | Argmax / best (10/14) |
| --- | --- | --- |
| form / meter / opening / phrasing | period, 4/4, vamp_intro, breathing | **match** (phrasing ← #46) |
| texture | lush_voicings (bossa *wanted*) | **`bossa_comp`** ← #46 (better than the JSON’s stand-in) |
| character / key / dynamics | warm_groove, D♭, *mp* | lyrical_song, **F**, *p* |
| first 8 | ii9\|V13, Imaj7 ×4 | Imaj7, Imaj7, **ii9, V13**, … ii9\|V13, Imaj7 |

Borrowed-iv language sketch (`laufey-borrowed-iv-language.json`: I, V7/IV, vi7, **iv6**, Imaj7, IVmaj7, **iv**, I) — **zero** `iv` / `iv6` on argmax or seeds 1 / 7 / 19.

| Metric | Ask | code | guide (fake) | line (fake) |
| --- | --- | --- | --- | --- |
| silent beats | vocal air | 4.7 % | 0 % | 1.6 % |
| downbeats attacked | some silent | **16/16** | **16/16** | **16/16** |
| ret4 | song 4 | 0.69 | 0.44 | 0.81 |
| chord-tone rate | ~0.95 diatonic | 0.98 | 0.99 | 0.92 |
| leap max | sung, small | 18 | **29** | **29** |
| Q1 (groove stays) | yes | — | **yes** | **yes** |
| guide rest slots | — | — | 14/16 | 15/16 |

**#46 win on groove + ii–V colour.** The mode is now a bossa-comp song in 4/4 that breathes *as a label*. Q1 holds: Guide/Line swap the skyline and leave the partido-alto LH alone.

**Still missing.** D♭ prior (F is still the mode). Borrowed-iv *phrases* (book has them; planner does not emit). Guide/Line leap a 29-semitone hole — a fake `leap_recover` / register snap, and live Jev could do the same if it picks that figure. Rest *slots* do not become silent *beats* or silent *downbeats*. `feel: swing | bossa` is still even sixteenths under the new texture.

### 2.8 Elijah Fox — *City in the Sky* lesson

| | Reference | Argmax / best (12/14) |
| --- | --- | --- |
| character / form / key | dreamy_haze, vamp_and_tag, C | **exact** |
| phrasing / opening / arrangement | long_breathed, vamp_intro, build | **match** |
| texture / palette | chordal_melody, modal | displaced_arpeggio, pentatonic (legal lesson colour) |
| first 8 | bVImaj7, IVmaj7, … Imaj7s5, IVadd6 | bVImaj7×2, IVmaj7×2 ×2 (verified pair, held) |

| Metric | Ask | code | guide (fake) | line (fake) |
| --- | --- | --- | --- | --- |
| ret4 | vamp 2–4 | 0.54 | 0.88 | 0.88 |
| silent beats | long tones | 7.8 % | 0 % | **17 %** |
| leap max | colour, not scream | 26 | 28 | 21 |
| Q1 | — | — | yes | yes |

Still the best stub-to-reference fit. Line is the only mode that produced real silent-beat % (long-short + rest slot on 4/4). Guide again invents a stepwise top over displacement that already *is* the lesson.

---

## 3. Still missing, ranked by audible damage — per mode

Guide is the showcase. Line is the raw experiment. Code is what strangers hear.

### Code (`renderPlan`)

| Rank | Gap | Damage | Why it is still open after #46 |
| --- | --- | --- | --- |
| 1 | **`hook_bars: 2 \| 4 \| 8`** (or an A8 A8 period) | Pathétique theme is 8; Glass Opening is a 4-bar cell ×4; “Time” is 4-bar LH + 8-bar chant; loops still keep **2**. Glass `ret4` 0.06, Zimmer `ret4` 0.00. | Gap study #2. Not in #46 on purpose. |
| 2 | **Beethoven lyrical is never the mode** | Generate is C-minor storm vs the Adagio MIDI (register 81 vs 62, 4/4 tremolo vs 2/4 alberti). | Character weights. `phrasing` cannot fix a wrong archetype. |
| 3 | **Downbeat still always attacked** on lyrical code | Chopin / Laufey / Fox / Debussy: 16/16. Pickup fills the air #46 just carved. Étude tell from FIDELITY / QA #1 is **not** gone. | Renderer: phrase-end rest + pickup by design. Need mid-phrase air, or a downbeat that may be silent without a pickup. |
| 4 | **Holds flatten verified phrases** | Debussy argmax I×8 (Arabesque IV6–iii6–ii6–I6 unused). Chopin sits on I and skips V65. Bach leaves I–ii42 for a fifths sequence. | Gap study #9. No #46 work. |
| 5 | **Ornamented / layered return** | Chopin A′ is a copy (guide `ret4` even worse). Zimmer mode uses `pulsing_chords` so same-figure keep does not run. | Fioritura still no figure. Bind layer-keep to `pulsing_chords` too, or shift Zimmer argmax onto ostinato. |
| 6 | **Glass 3:2 / hemiola** | Opening without weaving is even cells in F minor. | Still unsayable. |
| 7 | **Laufey D♭ + borrowed-iv emission** | Groove is right; key is F; iv never appears. | Priors / assembleHarmony, not new chord ids. |
| 8 | **`close: cadence \| stop \| fade`** | Glass / Fox / Clair still cadence. | Unchanged. |

### Guide (showcase — fake picks through the real realize path)

| Rank | Gap | Damage |
| --- | --- | --- |
| 1 | **Always writes a tune** | Bach prelude and Glass cells get `step_to_goal` / `neighbour` / `arpeggio_up` and 16/16 downbeats. Need `notes_scope: singing_line \| none` (or disable Guide on `flowing_perpetual` / `hypnotic_pulse` without a melody texture). |
| 2 | **Return is re-realized, not ornamented** | Chopin code `ret4` 0.75 → guide 0.25. Showcase path destroys the nocturne’s A / A′. Theme memory copies figure+goal ids, then code writes a *new* line on the later chord — not lace on the same contour. |
| 3 | **Rest slots ≠ breath** | 12–15 bars tagged `rest`, silent-beat % still 0, downbeats still 16/16. Q2 puts the rest on a short weak slot; long tones cover every beat. |
| 4 | **Leaps** | Laufey / Fox max 28–29 st. No `turn` / `chant_interval`. `leap_recover` is a 7–12 st jump by construction. |
| 5 | **No off-beat / tie / motto figure** | Clair, Adagio motto, Zimmer chant — cannot name them. |

Q1 is **closed** on this path: LH fingerprint matched code on all eight styles.

### Line (raw experiment — fake 4-slot)

| Rank | Gap | Damage |
| --- | --- | --- |
| 1 | **Four slots cannot sing** | Even when lyrical bias inserts a rest, occupancy stays on-the-beat. Fox is the exception (17 % silent) because `four_long_short` actually leaves air. |
| 2 | **False-friend `ret4`** | Glass / Zimmer / Bach line `ret4` 0.88 is “same four degrees every bar,” not a theme. Do not ship on this metric. |
| 3 | **Chord-tone rate drops** on perpetual / film textures | Bach 0.69, Zimmer 0.72 — degrees wander off the figure. |
| 4 | **Same leap / register issues as Guide** | Max 24–29 st. Register on Bach line jumps to 75.5 (code 66.8). |

Q1 also closed. Line is useful as an A/B of “Jev picks ticks,” not as a product path.

---

## 4. Cross-cutting (all styles)

What a first listen still notices, after #46:

1. **The return unit is too short** except where `period` already keeps a 4-bar A (Chopin `ret4` 0.75 ≈ MIDI 0.81). Eight-bar Adagio and 4-bar film/minimal cells lose.
2. **Breath is a label, not a downbeat.** `phrasing` is picked correctly; occupancy did not move.
3. **Guide is the wrong tool on non-songs** and a weaker tool on songs than code for *return*. It is the right tool only if we add ornament-on-return and `notes_scope: none`.
4. **Sample wander** still produces a Chopin storm and a Bach siciliano. Argmax is much more honest post-#46; sample is the demo risk.
5. **Living-artist harmony honesty** is unchanged: Glass / Zimmer / Laufey / Fox RNs stay inferred; no copyrighted MIDI.

---

## 5. Next ship list

Do **not** re-propose `phrasing` or `bossa_comp`. Ranked by first-listen damage, cost S–M, closed labels / renderer rules only.

| # | Ship | Mode it fixes | Why now |
| --- | --- | --- | --- |
| 1 | **`hook_bars: 2 \| 4 \| 8`** (form expander + `themeSources`) | code | Glass `ret4` 0.06, Zimmer `ret4` 0, Pathétique 8-bar A. Highest leftover from the gap study. |
| 2 | **Beethoven lyrical weight / argmax** (or “character first” already there — raise `lyrical_song` so it can win) | code | Entire dial is the wrong piece. |
| 3 | **Phrase-end rest that is not immediately a pickup**, *or* allow a silent downbeat after `breathing` / `long_breathed` | code | #46 carved air and filled it. Occupancy did not move. |
| 4 | **Holds must not erase verified phrases** | code | Debussy I×8, Chopin I-sits, Bach fifths. |
| 5 | **Ornament ladder on `varied` / restatement** + Guide `turn` | code + guide | Op. 9/2 A′. Guide `ret4` collapse is the tell. |
| 6 | **`notes_scope: singing_line \| none`** (planner policy is enough) | guide | Prelude / Glass / Zimmer cells. |
| 7 | **Zimmer argmax → `melody_over_ostinato`** (or bind figure-keep to `pulsing_chords`) | code | #46 rule is dead on the mode. |
| 8 | **Emit Laufey iv phrases; D♭ prior** | code | Groove closed; language and key not. |
| 9 | **Guide leap cap** (code-side, like the existing proximity prior on line-sample) | guide | 29 st is not a vocal hook. |
| 10 | **`close: cadence \| stop \| fade`** | code | After #1. |
| 11 | **`pulse: … hemiola_3_2`** | code | Glass identity. After hook_bars. |
| 12 | **Keyed live Guide/Line on Chopin + Laufey** | guide / line | This note’s fake picks are a ceiling only if Jev would pick the same figures. QA #5 is still open. |

**Out, still.** Verse/chorus form family. Free-text pitches. New chord ids. Copyrighted MIDI. Mazurka `lilt` — after #1 and #3.

---

## 6. Scripts

```text
# parsePlan every committed reference sketch
npx --yes tsx scripts/validate-reference-plans.ts

# Heuristic argmax + samples, code/guide/line realize, MIDI metrics (JSON only)
npx --yes tsx scripts/compare-generated-vs-reference.ts --out /tmp/generated-vs-reference.json

# If a key is present (this run: it was not)
npx --yes tsx scripts/compare-generated-vs-reference.ts --live-jev --live-styles chopin,laufey
```

Neither script writes MIDI. Public-domain encodings stay in [`docs/ref-midi/public/`](../ref-midi/public/). Living-artist rows stay JSON-only.

---

## 7. What this note does not claim

- It does not claim live Jev planned or sang. Guide/Line are fake closed picks through production realize functions.
- It does not re-run the 192-piece FIDELITY sweep. n = 8 argmax + 24 samples + 8 reference-plan realizes + 4 Mutopia files.
- MIDI skyline is blunt (both hands; no hand-set pickup). Chopin `ret4` 0.81 and Pathétique `ret8` 0.94 matching FIDELITY is why the files are trusted anyway.
- Glass / Zimmer / Laufey / Fox bar RNs stay inferred. No commercial sheet, no prices, no copyrighted MIDI.

Do not merge. Coder merges when Music pings.
