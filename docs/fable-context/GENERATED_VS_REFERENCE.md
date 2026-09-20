# Generated vs reference — the notes (post-#46)

Stephen, 2026-09-19, after #46. This note is about **sounding music**: the realized Score skyline from three note-producing paths, compared to the real references.

---

# Addendum — hand-split scoreboard (2026-09-20)

ZOOMOUT_POST_48 item 1. The tables below this addendum scored the **top of both hands**. Every lyrical Mutopia file in this repo puts accompaniment on the treble staff, so the old “Ref notes” column described the roll, not the tune. Re-run: `npx --yes tsx scripts/compare-generated-vs-reference.ts`. Helpers: `src/compare/compareMetrics.ts`. Rule: [`docs/ref-midi/public/README.md`](../ref-midi/public/README.md).

**What we score now**

- MIDI: Mutopia **staff-name** hand (RH / figure vs LH). Track index is not the hand — BWV 846 puts `lower` on track 0.
- Generated code/guide/line: **singing voice only** (`treble[0]` after overlay). A `rolling_nocturne` tacet bar is empty, not the roll.
- `ret4` / `ret8` start at the first **thematic** bar (Chopin MIDI pickup aligns to the LH downbeat at tick 192; Debussy Arabesque skips `s1 | s1`; generated Chopin skips the tacet roll).

`combinedSkyline` is still in the JSON so the old numbers can be diffed. Do not aim later ships at it.

## Hypothesis check (Chopin register)

The zoom-out guessed the old “closest code win” (71.4 ≈ 72.4) was both-hands skyline, and that RH would show us **~5 st low** vs the MIDI melody (76.5).

| | Combined skyline (old) | Melody / singing (now) |
| --- | --- | --- |
| MIDI Op. 9/2 | **72.4** | **76.5** (upper track, pickup-aligned) |
| code argmax | **71.4** | **76.4** (treble[0], skip tacet) |

**Half right.** The win was an artifact. The 5-st gap was 71.4 (roll filling the generated skyline) vs 76.5 (MIDI RH). Once both sides score the tune, **registers match**. What the old 0.75 `ret4` was sitting on does *not*: melody `ret4` is **0.563 / run 1** against MIDI **0.813 / run 4**. Aim at the return, not the octave.

## Corrected scoreboard — argmax, melody only

Generate = heuristic argmax. Living-artist Ref = reference JSON → same singing-voice metrics. MIDI rows are the Mutopia melody/figure track.

| Dial | Ref melody | code melody | guide melody | line melody |
| --- | --- | --- | --- | --- |
| **Bach** MIDI figure (`upper`, track 1) | 4/4; register **69.1**; **0/16** downbeats; 50 % silent (figure is off the beat); ret4 0 / run 1. Combined was 66.4 / 16/16 / 0 % — that was the LH. | Register **66.1**, 48 % silent, **1/16** downbeats, ret4 0.25 / run 6. Same family as the figure. | **Invents a tune**: 16/16 downbeats, 0 % silent, register 63.7. Q1 yes. | 16/16; ret4 0.88 is four even degrees. Register 74.8. |
| **Beethoven** MIDI Adagio | 2/4; register **62**; ret8 **0.94** / run **8**; 16/16 downbeats; LH onsets 2.5 → **10**. Combined register agrees (LH is far below). | Still the wrong piece: 4/4 tremolo, register **71.7** (combined was 80.6 — inner storm tones). ret4 0.06; LH 4 → 8. | Register **80**, 16/16, summit ×**24**. | Register 78.8; fake ret4 0.88. |
| **Chopin** MIDI Op. 9/2 | 12/8; register **76.5**; ret4 **0.81** / run **4**; 16/16 downbeats; 1.6 % silent; LH density ~24, constant. Combined register was 72.4. | 12/8; register **76.4**; ret4 **0.56** / run **1** (theme@1 — skipped tacet). 15/15 downbeats, 6.7 % silent. LH 1.25 → 1.75. Combined still prints 71.4 / ret4 0.75. | Register 65.5, 14 rest slots → **22 % silent** (now audible on the singing voice), still 16/16 downbeats. ret4 0.58. Q1 yes. | ret4 0.83 / run 4; 16/16; register 62.9. |
| **Debussy** MIDI Arabesque | 4/4; register **70.8** from thematic bar 2; **12/16** downbeats, 4 silent; 6.3 % silent beats; ret4 0.06. Combined was 65.1 / 16/16 / 0 % — the arpeggio. | 9/8 planing, register **75.9** (+5 vs melody, not +15). ret4 0.67; 15/16 downbeats. Combined register still 79.9. | 16/16 downbeats, 25 % silent, 12 rest slots, register 64.4. | 16/16, register 63.6, ret4 0.67. |
| **Glass** JSON→code | ret4 **0.06** / run 1; register 65.6; 8/8 downbeats. | Same hole: ret4 **0.06** / run 1, 16/16, summit ×11. | Rising tune, register 77.8, ret4 0.5 / run 4. Q1 yes. | ret4 0.88 — ignore (copied degrees). |
| **Zimmer** JSON→code | ostinato; ret4 0.75 / run 4 on the 8-bar sketch after a pickup-ish bar; register 77.7. | Chant-ish (leap mean **0.28**) but ret4 **0.00** / run 2; 15/16 downbeats; summit ×4; LH 4 → **11**. | ret4 0; 16/16; leap max 16. Q1 yes. | Fake ret4 1.00. |
| **Laufey** JSON→code | arch; 15.6 % silent; ret4 0.58; register 74.2. | Bossa LH 2 → 2.5. Line still **16/16** downbeats, 9.4 % silent, ret4 0.69, register 75.7. | 14 rest slots → 22 % silent, still 16/16 downbeats. Leap max 5. ret4 0.75. Q1 yes. | Leap max 10; 16/16; fake ret4 0.92. |
| **Fox** JSON→code | rise; 12.5 % silent; ret4 0.25; register 74. | Displacement; ret4 0.63 / run 3; 16/16; leap max **24**; register 67.9. | 16/16, 19 % silent, ret4 0.81. Q1 yes. | 19 % silent; leap max 20; fake ret4 0.88. |

**What later ships should believe**

- **Chopin is not a register miss and not a register win.** 76.4 ≈ 76.5. The leftover is the return (0.56 vs 0.81) and 15/15 downbeats.
- **Debussy is +5, not +15.** Still high and in 9/8.
- **Beethoven is still a different piece** — 71.7 vs 62, 4/4 vs 2/4, ret4 0.06 vs ret8 0.94. Combined 80.6 was the storm’s inner peaks.
- **Bach MIDI occupancy was the LH.** The figure track attacks **no** downbeats. Guide writing 16/16 is the error.
- **Glass / Zimmer `ret4` ≈ 0 on Generate is real** (not a hand-split artifact).
- Guide rest slots now show up as singing-voice silence (Chopin 22 %, Laufey 22 %). Downbeats are still all attacked.

Sections below are the **pre-split board**. Treat their MIDI registers (Chopin 72.4, Debussy 65.1) and “16/16 every lyrical downbeat” claims as both-hands ghosts.

---

# Original note (both-hands skyline, 2026-09-19)

| Path | How notes get written | What we ran |
| --- | --- | --- |
| **code** | labels → `renderPlan` | Heuristic argmax, 16 bars. Default Generate. |
| **guide** | closed figure+goal → `realizeJevGuideChoices` → overlay on that Score | Showcase path. **Fake picks** (no live Jev). |
| **line** | closed 4-slot rhythm+degrees → `realizeJevNoteChoices` → overlay | Raw experiment. **Fake picks.** |

**Reference notes**

- Bach / Beethoven / Chopin / Debussy: Mutopia MIDI skyline (highest onset, first 16 bars). Same family as `FIDELITY_FINDINGS.md`.
- Glass / Zimmer / Laufey / Fox (no MIDI): the singing line you get by **rendering the committed reference plan JSON** through the same three paths. That is what those labels imply for the notes — not a transcription.

Plan labels are **supporting context** only: they explain why a path wrote these notes. They are not the score.

**Thesis (from the notes).** #46 changed some *notes*: Chopin now *sounds* in 12/8 with a 4-bar returning skyline and a matching register; Laufey’s left hand is a bossa pattern, not even jazz-pop chords. What you still hear is an **étude singing line**: every lyrical downbeat is attacked, Guide rest-slots do not become silence, Guide **rewrites** a returning tune instead of ornamenting it, Beethoven Generate is a high tremolo storm (MIDI Adagio sits an octave lower), and Glass / Zimmer never return a 4-bar cell in the skyline (`ret4` ≈ 0). `hook_bars` is still the highest leftover because it is a *note* problem (the theme in the skyline is 1–2 bars).

No `TYPESAFE_API_KEY` here. Guide/Line are not “Jev sang this.” They are the production realize functions fed the dump-script figure/goal and 4-slot sketches.

---

## 0. Ear metrics

First 16 sounding bars (8 when the reference JSON is an 8-bar sketch). Generated skyline = top of `treble`. MIDI skyline = highest onset. Occupancy per felt beat: attacked / held / silent. A bar “returns” at ≥ 75 % pitch-class match per beat (`ret4`, longest run). Chord-tone rate is against the *plan’s* RN (MIDI has none). Q1: is the LH fingerprint identical after overlay?

Script: `npx --yes tsx scripts/compare-generated-vs-reference.ts` (JSON only; no MIDI written). `--live-jev` is wired and no-ops without a key.

---

## 1. Scoreboard — what the notes do

Generate = heuristic **argmax**. Living-artist “Ref” = reference JSON → `renderPlan` skyline.

| Dial | Ref notes | code notes | guide notes | line notes |
| --- | --- | --- | --- | --- |
| **Bach** MIDI prelude | 4/4; 0 % silent; **16/16** downbeats; ret4 0.38 / run 1; leaps 6.7 / 22; register **66.4** | Same register **66.8**, leaps 6.0 / 12. Skyline is the *figure*, not a tune: 48 % “silent” beats, **1/16** downbeats — do not read as breath. | **Invents a tune**: 16/16 downbeats, 0 % silent, contour fall, leap max 17. LH kept (Q1). | 16/16 downbeats; ret4 0.88 is four even degrees, not Fortspinnung; register jumps to **75.5**. |
| **Beethoven** MIDI Adagio | 2/4; ret8 **0.94** / run **8**; register **62**; summit ×1; LH 13 → 20.5 | **Wrong piece in the notes**: 4/4 tremolo, register **80.6**, summit ×4, ret4 0.06, LH 4 → 8. ret8 0.79 is a sentence copy, not the cantabile. | Still the storm: register 80.3, 16/16 downbeats, `arpeggio_up` rise, summit ×**26**. | Same storm, higher fake ret4 (0.75). Register 79.4. |
| **Chopin** MIDI Op. 9/2 | 12/8; ret4 **0.81** / run **4**; register **72.4**; 16/16 downbeats; leaps 6.7 / 27 | **Closest code win.** 12/8; ret4 **0.75** / run **4**; register **71.4**; leaps 6.8 / 22. Still **16/16** downbeats, 1.6 % silent. LH 1.25 → 1.75 (almost constant). | Register 69.3, chord-tone 1.00, 14/16 bars have a rest *slot* — **0 % silent beats, 16/16 downbeats**. ret4 **collapses 0.75 → 0.25** (rewrites A′). Leap max 17. Q1 yes. | ret4 0.44; 16/16 downbeats; leap max 15. Q1 yes. |
| **Debussy** MIDI Arabesque | 4/4; ret4 0.13 / run 2; register **65.1**; leaps 8.4 / 38; 16/16 downbeats | 9/8 planing, register **80.1**, ret4 0.67 / run 2, 15/16 downbeats. Higher and squarer than the MIDI wash. | 16/16 downbeats, 0 % silent, 12 rest slots, register 70.1. A chord-tone tune on top of planing. | Same: 16/16, rest slots 13, register 69.2. |
| **Glass** JSON→code | 4/4 cells; ret4 **0.06** / run 1; static; register 65.6; 8/8 downbeats | Same hole in the *notes*: ret4 **0.06** / run **1**, 16/16 downbeats, summit ×11. Even arpeggios, no 4-bar skyline return. | Invents a rising neighbour-tune (register 76.6, ret4 0). 16/16 downbeats. Q1 yes. | ret4 0.88 — **ignore** (four even degrees copied). |
| **Zimmer** JSON→code | ostinato skyline; ret4 0.38; contour arch; register 78.2; 8/16 downbeats silent; LH 4 → 8 | Static chant-ish (leap mean **0.64**) but ret4 **0.00** / run 2; 15/16 downbeats; summit ×**16**; LH 4 → **11**. Thickens, does not return the 4-bar cell. | Rise, not chant. ret4 0; 16/16 downbeats; summit ×16. Q1 yes. | Leap max **24**; fake ret4 0.88. |
| **Laufey** JSON→code | arch; silent 12.5 %; ret4 0.54; register 79.7; leaps 5.4 / 18; LH 1.5 | Bossa LH (2 → 2.5). Skyline still **16/16** downbeats, 4.7 % silent, ret4 0.69, contour **rise**, leaps 5.6 / 18, register 73.5. | 14 rest slots → **0 % silent, 16/16 downbeats**. Leap max **29**. ret4 drops to 0.44. Q1: partido-alto LH **survives**. | Leap max 29; 16/16 downbeats; fake ret4 0.81. |
| **Fox** JSON→code | rise; silent 9 %; ret4 0.25; register 76.5; leaps 5.2 / 12 | Displacement skyline; ret4 0.54 / run 3; 16/16 downbeats; leap max **26**; register 70.3. | 16/16 downbeats, 0 % silent, leap max **28**, ret4 0.88. Q1 yes. | **Only path with real air** (17 % silent) — long-short + rest actually vacates beats. Leap max 21. Still 16/16 downbeats. |

**One listen, three paths**

- **code** can now *pulse* like Op. 9/2 and *comp* like a bossa. It still **attacks every lyrical downbeat** and does not return 4–8 bar cells except where `period` already copies a 4-bar A (Chopin).
- **guide** (showcase) keeps the accompaniment (Q1 closed) and then **sings on every downbeat**, often with a 17–29 st leap. On Chopin it is *worse* than code for the thing the nocturne is (A / A′ in the skyline).
- **line** (experiment) is four slots. High `ret4` is usually “same four degrees,” not a theme. Fox is the one time a rest slot became silence.

---

## 2. Per style — notes first

### 2.1 Bach — BWV 846

| | MIDI skyline | code | guide | line |
| --- | --- | --- | --- | --- |
| silent / downbeats | 0 % / 16/16 | 48 % / 1/16 † | 0 % / **16/16** | 0 % / **16/16** |
| ret4 / run | 0.38 / 1 | 0.25 / 6 | 0.25 / 2 | 0.88 / 8 ‡ |
| leaps mean/max | 6.7 / 22 | 6.0 / 12 | 2.8 / 17 | 3.9 / 17 |
| register | **66.4** | **66.8** | 65.5 | **75.5** |
| Q1 LH | — | — | yes | yes |

† Code skyline of broken-chord figuration is not a singing line; MIDI skyline *is* the figure and hits every beat. ‡ Line ret4 is repeated degrees.

**Hear.** Code is in the right register and leap size as the Mutopia prelude — a perpetual figure, not a song. Guide and Line **add a melody the piece does not have**, attacking every downbeat. That is audible damage on this dial.

*Plan context (not the headline):* argmax globals match the reference JSON (prelude / 4/4 / broken_chord / on_the_beat). Harmony wanders after I–ii42. Sample seed 1 can emit a 6/8 stride siciliano — different notes.

### 2.2 Beethoven — Pathétique II

| | MIDI Adagio | code | guide | line |
| --- | --- | --- | --- | --- |
| pulse | **2/4** | 4/4 | 4/4 | 4/4 |
| ret8 / run | **0.94 / 8** | 0.79 / 8 | 0.75 / 8 | 0.94 / 8 |
| register / summit | **62** / ×1 | **80.6** / ×4 | 80.3 / ×**26** | 79.4 / ×26 |
| LH density | 13 → **20.5** | 4 → 8 | same LH | same LH |
| downbeats | 16/16 | 16/16 | 16/16 | 16/16 |
| contour | sung 8-bar A | **rise** (storm) | rise | rise |

**Hear.** Generate does not sound like the Adagio. The MIDI theme sits around MIDI 62 and comes back an octave of *form* (ret8 0.94) with a thicker left hand. Our notes sit around **81**, start as tremolo, and hit the top note four (code) or twenty-six (guide/line) times. Matching ret8 on line is a copied 4-slot pattern, not an 8-bar cantabile.

Reference JSON → code (the labels’ implied Adagio) is already high (register 79.6 on 8 bars) — even the *right* plan does not drop the tune to the MIDI tessitura. The wrong plan makes it a different piece.

*Plan context:* argmax is stormy_drama / C minor / tremolo / allegro / on_the_beat. The lyrical archetype exists and is not drawn. #46’s `phrasing` never reaches these notes.

### 2.3 Chopin — Op. 9/2

| | MIDI | code | guide | line |
| --- | --- | --- | --- | --- |
| pulse | **12/8** | **12/8** | 12/8 | 12/8 |
| silent / downbeats | 0 % / 16/16 | 1.6 % / **16/16** | 0 % / **16/16** | 1.6 % / **16/16** |
| ret4 / run | **0.81 / 4** | **0.75 / 4** | **0.25 / 2** | 0.44 / 3 |
| leaps mean/max | 6.7 / 27 | 6.8 / 22 | 5.3 / 17 | 5.6 / 15 |
| register | **72.4** | **71.4** | 69.3 | 69.0 |
| LH early → return | 30 → 34 (ornament in the MIDI skyline) | 1.25 → 1.75 | same | same |
| rest slots | — | — | 14/16 | 15/16 |

**Hear.** This is the #46 note-level win: the generated skyline is now in **12/8**, in the **same register** as the Mutopia file, with a **4-bar returning pitch-class shape** (0.75 vs 0.81). Leaps are in family. The LH barely thickens — closer to the nocturne’s constant roll than to a ballade lift.

What you still hear: **every barline is attacked**. Phrase-end air is filled by a pickup, so occupancy does not move. Guide’s rest slots are inaudible as silence; worse, Guide **destroys the return** (0.75 → 0.25). The nocturne’s trick is the same A with more lace. Showcase path writes a new chord-tone line.

*Plan context:* argmax picked twelve_eight, upbeat, rolling_nocturne, pickup — that is why the pulse and register moved. Holds still sit on I (V65 unused). Arrangement is lift_on_return; the notes barely lift, so the label is louder than the LH.

### 2.4 Debussy — Arabesque 1

| | MIDI | code (argmax) | guide | line |
| --- | --- | --- | --- | --- |
| pulse | 4/4 wash | **9/8** planing | 9/8 | 9/8 |
| silent / downbeats | 0 % / 16/16 | 10 % / 15/16 | 0 % / 16/16 | 2 % / 16/16 |
| ret4 / run | 0.13 / 2 | 0.67 / 2 | 0.67 | 0.67 |
| register | **65.1** | **80.1** | 70.1 | 69.2 |
| leaps mean/max | 8.4 / 38 | 5.0 / 20 | 4.9 / 17 | 5.8 / 12 |

**Hear.** MIDI is a mid-register wash that barely repeats (ret4 0.13) and leaps widely. Generate is a **higher, more periodic** 9/8 planing texture (register +15, ret4 0.67). Guide/Line pin a chord-tone tune on every downbeat — the opposite of Clair’s tied, off-beat line (FIDELITY: 69 % of Clair downbeats *tied*; our Score cannot tie across a bar).

Reference JSON → code (4/4 wash, IV6–iii6–ii6–I6) has a fall contour at register 66.3, closer to MIDI tessitura than argmax — but its skyline misses every downbeat (wash starts off the beat). The *right* labels still do not reproduce the MIDI occupancy.

*Plan context:* argmax is haze / 9/8 / planing / I×8. Holds flatten the Arabesque phrase, so the notes never walk IV6–I6.

### 2.5 Glass — Opening (JSON → notes)

No MIDI. Ref = reference plan rendered.

| | Ref code | code | guide | line |
| --- | --- | --- | --- | --- |
| silent / downbeats | 3 % / 8/8 | 1.6 % / **16/16** | 0 % / **16/16** | 0 % / **16/16** |
| ret4 / run | **0.06 / 1** | **0.06 / 1** | **0.00 / 1** | 0.88 / 8 ‡ |
| contour | static | arch | **rise** | arch |
| register | 65.6 | 68.9 | 76.6 | 75.5 |
| summit hits | 5 / 8 bars | **11** / 16 | 8 | 9 |
| Q1 | — | — | yes | yes |

**Hear.** Even the *reference* JSON, rendered, does not return a 4-bar cell in the skyline (`ret4` 0.06). Generate is the same: even arpeggios, run length 1, top note hit 11 times. Guide makes it worse — a rising tune in a higher register. Line’s pretty `ret4` is four repeated degrees.

The 3:2 weave is not in any path’s notes (sixteenth grid). That is an audible identity miss, not a label miss.

*Plan context:* globals already match (F minor, additive_loop, minimal_cells). Loop memory is two bars; holds stretch i i / bVI bVI. `hook_bars: 4` is how you get a 4-bar skyline return.

### 2.6 Zimmer — “Time” (JSON → notes)

| | Ref code | code | guide | line |
| --- | --- | --- | --- | --- |
| silent / downbeats | 19 % / 8 silent | 9 % / 1 silent | 0 % / **16/16** | 0 % / **16/16** |
| ret4 / run | 0.38 / 1 | **0.00 / 2** | 0.00 / 1 | 0.88 / 4 ‡ |
| contour | arch | **static** | **rise** | rise |
| leaps mean/max | 3.3 / 11 | **0.64 / 12** | 1.5 / 10 | 2.8 / **24** |
| summit hits | 2 | **16** | **16** | **16** |
| LH early → return | 4 → 8 | 4 → **11** | same | same |

**Hear.** Code is the closest to a chant (tiny mean leap, static contour) but the **4-bar block never returns in the skyline** and the summit is the whole piece (16 hits). LH thickens (4 → 11) — you hear a build, not “same figure, new layer.” Guide/Line climb and attack every downbeat; Line leaps a 24 st hole.

Ref JSON → code already has ret4 only 0.38 and an arch (the implied chant is not fully in `renderPlan` either). Generate is flatter and less returning.

*Plan context:* argmax is peak_then_bare + pulsing_chords, so the #46 same-figure keep (ostinato textures only) does not run. Harmony is i i / bVI bVI, not i–bVI–bVII–V.

### 2.7 Laufey — “From the Start” (JSON → notes)

| | Ref code | code | guide | line |
| --- | --- | --- | --- | --- |
| silent / downbeats | **12.5 %** / 8/8 | 4.7 % / **16/16** | 0 % / **16/16** | 1.6 % / **16/16** |
| ret4 | 0.54 | 0.69 | 0.44 | 0.81 ‡ |
| contour | **arch** | **rise** | rise | rise |
| leaps mean/max | 5.4 / 18 | 5.6 / 18 | 6.7 / **29** | 5.8 / **29** |
| register | 79.7 | 73.5 | 67.9 | 68.7 |
| LH | 1.5 | **2 → 2.5** (bossa) | **same LH** | **same LH** |
| rest slots | — | — | 14/16 | 15/16 |

**Hear.** #46 is in the **left hand**: bossa density, Q1 holds under Guide/Line. The **singing line** is still an étude — every downbeat attacked, contour a rise (ref JSON sang an arch with 12.5 % silence), and Guide/Line open a 29-semitone hole. Rest slots do not become rests you can hear.

*Plan context:* argmax is bossa_comp + breathing + ii9/V13. Key is F, not D♭ (you hear a different tonic). Borrowed iv never sounds. Even grid under the new texture.

### 2.8 Fox — *City in the Sky* (JSON → notes)

| | Ref code | code | guide | line |
| --- | --- | --- | --- | --- |
| silent / downbeats | 9 % / 8/8 | 8 % / **16/16** | 0 % / **16/16** | **17 %** / **16/16** |
| ret4 / run | 0.25 / 1 | 0.54 / 3 | 0.88 / 4 | 0.88 / 5 |
| leaps mean/max | 5.2 / 12 | 4.6 / **26** | 3.4 / **28** | 4.2 / 21 |
| register | 76.5 | 70.3 | 75.4 | 77.8 |
| Q1 | — | — | yes | yes |

**Hear.** Code is a displaced-arpeggio skyline that repeats a bit more than the lesson sketch (ret4 0.54 vs 0.25) and leaps farther (26 vs 12). Guide is a smooth chord-tone top (Q1 keeps the displacement) that never breathes. Line is the only generated path that **vacates beats** (17 %) — still attacks every downbeat.

*Plan context:* argmax already aims at the lesson pair (bVImaj7 / IVmaj7) on displaced_arpeggio. Best stub-to-reference *aim*; the leftover is leap size and downbeats.

---

## 3. Gaps ranked by what you hear in the notes

Not by label mismatch. Guide is the showcase; Line is the experiment; code is Generate.

### Code — the default singing line + accompaniment

| Rank | What you hear | Where | Ship |
| --- | --- | --- | --- |
| 1 | **No 4–8 bar theme in the skyline** except Chopin’s 4-bar A. Glass/Zimmer `ret4` ≈ 0; Adagio MIDI is an 8-bar return we never play. | Glass, Zimmer, Beethoven | **`hook_bars: 2 \| 4 \| 8`** |
| 2 | **Wrong notes for Beethoven** — high tremolo storm (register 81, 4/4) vs Adagio (62, 2/4, thicker return). | Beethoven | Draw the lyrical archetype so *these* notes can exist |
| 3 | **Every lyrical downbeat is attacked** (16/16). Pickup fills the air #46 carved. Silent-beat % 1–8, not sung. | Chopin, Laufey, Fox, Debussy | Phrase-end rest **without** a mandatory pickup, or a legal silent downbeat |
| 4 | **Return is a copy, not lace / a new layer** | Chopin A′; Zimmer summit ×16, LH just denser | Ornament on restatement; fire figure-keep on the texture we actually emit |
| 5 | **Tessitura / pulse off the MIDI** | Debussy +15 semitones and 9/8 vs 4/4 wash; Glass no 3:2 in the grid | Holds vs verified phrases; `pulse` after hook_bars |
| 6 | **Laufey line rises and never sits on iv** | contour rise vs ref arch; no borrowed-iv sonority | Emit iv phrases (the notes); D♭ if we want that tonic |

### Guide — showcase overlay

| Rank | What you hear | Where |
| --- | --- | --- |
| 1 | **A tune on pieces that should not have one** — 16/16 downbeats on the prelude and on Glass cells | Bach, Glass, Zimmer |
| 2 | **The return disappears** — Chopin skyline ret4 0.75 → 0.25. Same A′ problem the nocturne is made of. | Chopin, Laufey (0.69 → 0.44) |
| 3 | **Rests you cannot hear** — 12–15 bars tagged rest, 0 % silent beats, 16/16 downbeats. Long tones cover the slot. | All lyrical |
| 4 | **Leaps that are not vocal** — 17 (Chopin/Bach), 28–29 (Fox/Laufey), summit ×26 (Beethoven storm) | Laufey, Fox, Beethoven |
| 5 | **Q1 is closed** — LH fingerprint matches code on all eight. Groove/figure stays. That part of the notes is right. | all |

Need `notes_scope: none` on perpetual/cells, ornament-on-return (not re-realize), a leap cap, and a rest that vacates a *beat*.

### Line — raw 4-slot overlay

| Rank | What you hear | Where |
| --- | --- | --- |
| 1 | **Four attacks, almost no air** — Fox 17 % is the exception (`four_long_short` actually leaves ticks empty) | 7/8 styles |
| 2 | **Fake themes** — ret4 0.88 on Bach/Glass/Zimmer is “same four degrees,” not a cell | Glass, Zimmer, Bach |
| 3 | **Same leap / high-register problems as Guide** — Bach register 75.5 vs MIDI 66; leap max 24–29 | Bach, Zimmer, Laufey |
| 4 | **Q1 closed**, same as Guide | all |

Useful as an A/B of “ticks + degrees,” not as the product path.

---

## 4. What #46 already changed **in the notes**

Do not re-propose `phrasing` or `bossa_comp`. They shipped; some of the notes moved.

| #46 | In the notes (this pass) | Still not in the notes |
| --- | --- | --- |
| Chopin 12/8 prior | Generated skyline is **12/8**; ret4 0.75 ≈ MIDI 0.81; register 71 ≈ 72 | Downbeats still 16/16; Guide wipes the return |
| `phrasing` | Labels are written. Occupancy **did not move** — pickup re-attacks the barline | Breath you can hear |
| Laufey `bossa_comp` | LH density 2–2.5; Q1 keeps it under overlays | Singing line still étude-shaped; 29 st leaps on Guide/Line |
| Zimmer same-figure | LH thickens 4 → 11. Figure-keep **does not run** on argmax (`pulsing_chords`) | Same-figure chant; 4-bar skyline return; summit ×16 |

Borrowed iv still never sounds. Beethoven notes are still the storm.

---

## 5. Next ship list (from the notes)

| # | Ship | Notes it changes |
| --- | --- | --- |
| 1 | **`hook_bars: 2 \| 4 \| 8`** | Glass/Zimmer skyline `ret4`; Adagio 8-bar return. **This PR.** Coder: allowlist `hookBars`. |
| 2 | **Beethoven lyrical so Generate can emit Adagio-register notes** | Register 81 → ~62; 2/4 alberti vs tremolo |
| 3 | **Air that vacates a beat / downbeat** (not a pickup-filled phrase end) | 16/16 lyrical downbeats. **Partial this PR:** Guide rest slots vacate a felt beat; code-path `breathing` / `long_breathed` leave the last beat empty (no pickup). |
| 4 | **Ornament the returning skyline** (Guide realize-only; no new op) | Chopin Guide ret4 0.25. **This PR.** |
| 5 | **`notes_scope: singing_line \| none`** | Guide on prelude / Glass / Zimmer |
| 6 | **Guide leap cap** | 29 st Laufey/Fox |
| 7 | **Holds must not flatten phrases** (so Debussy/Bach *notes* walk the verified RNs) | I×8 planing; fifths after I–ii42 |
| 8 | **Zimmer notes on ostinato** (or bind figure-keep to `pulsing_chords`) | Same-figure layer you can hear |
| 9 | **Sound Laufey iv; optional D♭ tonic** | Language in the notes |
| 10 | **`close` / hemiola** after #1 | Fade/stop; Glass 3:2 in the grid |
| 11 | **Keyed live Guide/Line on Chopin + Laufey** | Fake picks are not Jev’s leaps |

**Out.** Re-proposing `phrasing` or `bossa_comp`. Verse/chorus forms. Free-text pitches. Copyrighted MIDI.

---

## 6. Scripts

```text
npx --yes tsx scripts/validate-reference-plans.ts
npx --yes tsx scripts/compare-generated-vs-reference.ts --out /tmp/generated-vs-reference.json
npx --yes tsx scripts/compare-generated-vs-reference.ts --live-jev --live-styles chopin,laufey
```

JSON now includes `handSplit`, `thematicStartBar`, `combinedSkyline` (old both-hands number), and `accompaniment`. Believe the top-level melody fields.

No MIDI written. Public-domain encodings stay in [`docs/ref-midi/public/`](../ref-midi/public/). Living-artist rows stay JSON-only; their “Ref” column is that JSON rendered.

---

## 7. Honesty

- Guide/Line are fake closed picks through production realize functions. No live Jev.
- n = 8 argmax + 24 samples + 8 reference-JSON realizes + 4 Mutopia files. Not the 192-piece FIDELITY sweep.
- MIDI skyline **was** blunt (both hands). Superseded by the 2026-09-20 addendum: Mutopia staff-name hand split + thematic start. Chopin ret4 0.81 and Pathétique ret8 0.94 still match FIDELITY on the melody track.
- Glass / Zimmer / Laufey / Fox RNs stay inferred. No commercial sheet, no prices.

Do not merge. Coder merges when Music pings.
