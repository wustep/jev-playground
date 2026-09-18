# Jev request-structure review

Fable, 2026-09-18. Read of `wustep/jev-playground` on `main` (`2f187c0`, PR #31 merged) plus `src/planner/jev/requests.ts`, `JevPlanner.ts`, `src/plan/{forms,harmonyPhrases,styles,schema}.ts`, README score/choice notes, Debug `notes` / payload shape, and `docs/fable-context/FIDELITY_FINDINGS.md`.

**Goal.** Richer, more dynamic songs that match composer style. Not schema churn. Jev picks closed labels; code writes notes.

**Short version.** The live graph is already the right *kind* of API: character first, then a globals fan-out, then one HarmonyBook phrase per 4-bar slot. Breath, arrangement and opening are on `main` and do not need re-proposing as inventions. What still makes a Jev plan an étude is *how* later questions are asked: four parallel bar contours that cannot form a phrase, contours asked for bars code will overwrite, every style offered every texture/form/key, frame labels (`arrangement`, `opening`) asked before `form` is known, and a style-match Score whose rubric still ignores the song fields the plan now carries. Fix those and the same renderer will sound like a piece.

**Best button (Appendix B).** Dual critic: keep `target.raw - max(other.raw)`, add a 4-level `song_quality` Score scored from plan labels only, `dualObjective = contrast + 0.45 * (song.raw - 1.5)`, N 4 → 5. Wire spec for a follow-up; not in this PR.

---

## 0. Verified against `main` (do not re-ship)

`FIDELITY_FINDINGS.md` ranked breath / arrangement / opening as the next renderer ships. They landed in PR #31 (`555e399`, `2a596be`, `ea220b8`). Status:

| Finding | On `main`? | Jev asked? | Notes |
| --- | --- | --- | --- |
| Phrase-level theme return | yes (PR #30) | no | `themeSources(form, bars)` in code. Jev still *asked* for returning-bar contours; answers discarded (`JevPlanner` lines 204–212). |
| Breath + pickup | yes | **no** | `phrasingOf(character)` in the renderer. `lyrical_song` / `solemn_hymn` / `dance_lilt` / `warm_groove` / `restless_searching` breathe; `meditative_stillness` / `dreamy_haze` take a long rest; perpetual / stormy / pulse / heroic / playful do not. |
| Arrangement follows the form | yes | **yes** | `arrangement` is a `globals` Choice. Code expands to per-bar density 0–3. |
| Intro / pickup / vamp | yes | **yes** | `opening` is a `globals` Choice. Extra `Score.bars`; `plan.bars` stays 4/8/16/32. |
| One summit, ornament ladder, 1+1+2 hook, Laufey groove | no | — | Still renderer / book work. Only a Jev label if code cannot derive it. |

README’s request table is stale: it still says “`form` + 8 global Choices + bar count.” Live `globals` asks **11** Choices (`form`, `key`, `meter`, `texture`, `palette`, `tempo`, `dynamics`, `dynamicShape`, `defaultInstrument`, `arrangement`, `opening`). Bar count is never asked (the UI passes it in). Debug payloads are the live spec: `?debug=1` prints the exact `POST /v1/systemone` bodies.

---

## 1. Current request graph

Questions in one request are **parallel and cannot see each other**. Code combines answers (`JevPlanner`). Allowlist is the op, not the question set: `/api/jev` accepts `concept | globals | bar | phrase | score | notes` (plus trolley). New questions inside an existing op do **not** need an allowlist change. A new op does.

```
request 1   concept     character Choice + 12 character Nouls
request 2   globals     11 parallel Choices, character in state
request 3…  phrase ×N   1 HarmonyBook phrase + 4 contour Choices
optional    score       1 Score per style + `song_quality` (Best-of-N dual critic; Appendix B)
debug       notes       1 rhythm + 4 scale-degree Choices (bar 1 RH only)
legacy      bar         per-bar chord + contour + optional approach (tests only)
```

A 16-bar Generate is **6 POSTs, 44 questions** (13 + 11 + 4×5). Jev returns a full distribution per Choice; `pick.ts` owns argmax vs nucleus sample. The debug trace shows Jev’s numbers, not the policy-adjusted ones.

### What each answer is used for

| Answer | Used? | By |
| --- | --- | --- |
| `character` Choice + `writes_*` Nouls | yes | Combined: `noul^4 * (typical + 0.5)`, then draw one |
| globals Choices | yes | Written onto the plan; renderer reads them |
| `phrase` | yes | Expanded to 4 chords; last slot forced argmax; novelty damp on repeats |
| `contour_0..3` on a **new** bar | yes | `bars[].contour` → `melody.ts` |
| `contour_k` on a **returning** bar | **no** | Overwritten with the source bar’s contour |
| `score` / `match_*` | yes, off the Generate path | Best-of-N of *heuristic* plans. Rubric: texture, chords, tempo, dynamics, instrument. Form / arrangement / opening / character are in `describePlan` state and ignored by the criteria. |
| `notes` rhythm + `pitch_1..4` | debug only | Overlay on bar 1; illegal ticks fall back to `renderPlan` |
| `bar` chord / contour / approach | not live | Phrase path uses book `splits` in code |

---

## 2. Constraints this review respects

- Closed Choices / Nouls / Scores. No free text. No MIDI pitches in the API. If `notes` stays, it stays closed enums.
- Parallel questions cannot condition on each other. Prefer later rounds on earlier picks: **character → piece kind → frame → phrases**.
- A label plus code can carry more structure than a pile of bar questions. That is already how `form` → roles and `themeSources` → returns work. Copy that move; do not invent a notes-writing op.
- Do not clone the character Noul+Choice pattern onto every field. It exists because the Choice alone peaked (Beethoven = stormy, C minor, allegro). Most fields are not that peaked, and 22 texture Nouls would be a token tax, not a song.

---

## 3. Pathologies (evidence, not taste)

### 3.1 Parallel marginals write études

Documented on this repo, twice:

1. **Per-bar roles**, asked in parallel: argmax came back “half cadence ×4”. Fixed by one `form` Choice, expanded in `forms.ts`.
2. **Per-bar chords**, asked in parallel: Jev sat on the tonic through restatements. Fixed by one HarmonyBook phrase per slot.

**Still live:** four `contour_*` Choices on the same `phrase` request. They cannot form an arch. Repertoire (Huron 1996; Tierney, Russo & Patel 2011; `FIDELITY_FINDINGS` §1.3) is phrase-level: convex arch ≈ 40 % of folk phrases; sung phrases average ~9.5 notes; phrase-final notes ~1.7× longer. A period whose bars are `rise, rise, leap_fall, static` is four études glued at the barline — and that is the tune `themeSources` now *returns*.

The Debug `notes` op repeats the same mistake one layer down: `pitch_1..4` are parallel, so the four degrees cannot see each other. Do not promote it.

### 3.2 Answers Jev cannot change

On a 16-bar `period`, `themeSources` is `. . . . | 1 2 3 . | . . . . | 1 2 3 .` — **6 of 16** contour answers discarded. On a 16-bar `sentence` it is worse (duplicate + full presentation return): **~9 of 16**. Findings item 8; still true on `main`. The request also never tells Jev which bars of `current_slot` return, so the model is spending tokens on a question whose correct answer is “copy slot 1” and then being ignored.

### 3.3 Option lists wider than the style

`chordOptionsFor(key)` already hides the other mode (“~25 fewer ways to go wrong”). Globals do not. Every style is offered all 22 textures, 11 forms, 21 keys, 6 instruments. The heuristic never does this: it samples `STYLE_PROFILES[style].priors` / archetypes. Live Jev, asked “which keyboard texture” with `toccata_perpetual` sitting next to `rolling_nocturne` for Laufey, can pick a foreign label at the 15–20 % the nucleus sampler will happily draw. That is a live-distribution hole, not a missing enum.

### 3.4 Frame labels asked before `form`

`arrangement` and `opening` are the right labels (findings 2–3, shipped). They sit in the `globals` fan-out, so they cannot see `form` or `texture`. `lift_on_return` on `free_fantasia` is a no-op (fantasia never repeats). `vamp_intro` on `flowing_perpetual` / `toccata_perpetual` fights the texture. `peak_then_bare` on an 8-bar `period` has no midpoint to peak. Character conditioning is real — README’s Beethoven *lyrical song* → A♭, adagio, *p* was measured on this fan-out — but it does not bind arrangement to the layout it is supposed to follow.

`dynamicShape` is a third “how does intensity move” question in the same parallel bundle as `arrangement` and `dynamics`. `build_then_drop` and `peak_then_bare` describe the same gesture in two vocabularies; `arrangement.ts` already special-cases both.

### 3.5 Character is overloaded for breath

Breath shipped *without* a label, derived from character. That is the right default, and it should stay the fallback. The hole: `stormy_drama` → `phrasing: none`, so a Chopin ballade or Beethoven *Tempest* never rests. Repertoire says those pieces breathe at phrase ends. Character cannot mean both “turbulent” and “sings.” A closed `phrasing` global is the findings’ own alternative (“or one closed `phrasing` global”) and is now cheap because the renderer already consumes the idea.

### 3.6 Score cannot see a song

`describePlan` now includes `arrangement` and `opening`. `styleMatchQuestion` still says “Judge texture, chord vocabulary, tempo, dynamics and instrument together.” Best-of-N (`bestOf.ts`) therefore cannot prefer a vamp + lifted return + singing texture over a straight-in étude in the same key. Findings already flagged this: “revisit after item 2 adds its label.” Item 2 is on `main`.

---

## 4. Add

New state, questions, ops, or Score uses that would audibly improve style fidelity or song-ness. Ranked.

### A1. `phrasing` — Jev owns whether the tune sings

- **Why.** Breath is the most “sung” property in the MIDI table (0 % silent beats vs 13–26 % in Mendelssohn / Foster / Satie). Code already realises it. Character is a poor proxy for stormy *songs* (Chopin ballades, Beethoven slow-movement drama). Laufey / Fox `warm_groove` already breathes; Bach `flowing_perpetual` correctly does not. Jev should be allowed to say “this stormy Chopin piece still lands and rests.”
- **Payoff.** ★★★★★ (same as findings item 1; the renderer is done, the missing bit is the label on stormy/lyrical edge cases).
- **Cost.** S. One more `globals` (or `frame`) Choice. `phrasingOf` becomes the default when the field is omitted, so hand-edited plans stay valid.
- **Allowlist.** No (existing `globals`, or A/R1 `frame` below).
- **Sketch.**

```json
{
  "op": "globals",
  "style": "chopin",
  "brief": true,
  "character": "stormy_drama"
}
```

State already has `piece_character`. Add one question:

```json
{
  "phrasing": {
    "type": "choice",
    "instructions": "How should the tune phrase in a piece with the character in `piece_character`, in the style of `requested_style.name`? This is about rests and pickups, not which notes to write.",
    "criteria": {
      "on_the_beat": "The line attacks every downbeat and does not rest at phrase ends — perpetual or motoric.",
      "upbeat": "The line leans into downbeats from a short pickup; phrase ends may rest a little.",
      "breathing": "The line lands early at phrase ends, holds, and leaves a beat of air — a sung phrase.",
      "long_breathed": "Long tones and real silence between phrases; time almost stops."
    }
  }
}
```

Plan field: `phrasing?: 'on_the_beat' | 'upbeat' | 'breathing' | 'long_breathed'`. Renderer: map onto today’s `'none' | 'breathing' | 'long'` (fold `upbeat` into breathing + pickup). Do **not** free-text a breath pattern.

### A2. Phrase-level `phrase_shape` (and stop asking four bar contours)

This is an Add of one Choice and a Remove of four. Listed here because it is the new label; the deletion is R1.

- **Why.** Same pathology as per-bar roles. The unit that returns is a phrase (Op. 9/2 bars 5–8 = 1–4; *Pathétique* II bars 9–16 = 1–8). Four independent contours make a hook that is not worth returning. Arch / descend dominate the cited corpora.
- **Payoff.** ★★★★★. Every style, every Generate. The returned tune becomes one gesture.
- **Cost.** S–M. Request builder + `JevPlanner` expansion + tests. Renderer already reads `bars[].contour`; code writes four of them from one label. No new pitches.
- **Allowlist.** No.
- **Sketch.** On `phrase`, replace `contour_0..3` with:

```json
{
  "phrase_shape": {
    "type": "choice",
    "instructions": "Which shape should the singing line of `current_slot` have as a whole? Software will expand this into per-bar motion. Match `current_slot.how_it_ends` and the shapes in `phrases_so_far`. Returning slots should continue the source phrase's shape, not invent a new one.",
    "criteria": {
      "arch": "Rises through the first half, peaks, falls into the close — the default sung phrase.",
      "descend": "Falls through the four bars, a sigh or lament.",
      "ascend": "Climbs through the four bars, often into a half cadence or climax.",
      "static_cell": "Hovers around one pitch or a small rocking figure — a cell, a vamp, a pulse.",
      "wave": "Undulates twice across the phrase, a written-out turn.",
      "leap_fill": "Opens with a leap, then fills the gap by step into the close."
    }
  }
}
```

Code expansion (illustrative, not a renderer spec):

| `phrase_shape` | bar contours |
| --- | --- |
| `arch` | `rise, arch, arch, fall` |
| `descend` | `fall, fall, dip, fall` |
| `ascend` | `rise, rise, leap_fall, rise` |
| `static_cell` | `static, wave, static, static` |
| `wave` | `wave, dip, wave, fall` |
| `leap_fill` | `leap_fall, fall, dip, fall` |

On a slot whose first three bars return, **do not ask** `phrase_shape`; copy the source slot’s shape (R1). Cadence bar may still take `fall` / `static` from the close, in code.

### A3. Returning-slot `return_as` (ornament ladder as a label)

- **Why.** After PR #30 a second return is literal. Op. 9/2 “increasingly ornamented with each recurrence”; 32-bar AABA varies “particularly the last A”; *Träumerei* reaches higher each time. Findings item 6: ★★★ at 16 bars, ★★★★ at 32. The slot already has `varied: boolean` and a return count — unused by Jev, unread as a question.
- **Payoff.** ★★★ (16) / ★★★★ (32). Needs the renderer to edit a recalled rhythm (findings: M). The *question* is S once that exists.
- **Cost.** Question: S. Audible ship: M (renderer). Do not add the question before the renderer can honour it — a discarded Choice is how we got R1.
- **Allowlist.** No. Same `phrase` op; only on slots with `source_slot != null`.
- **Sketch.** State addition (also A4) plus:

```json
{
  "return_as": {
    "type": "choice",
    "instructions": "This slot brings back `current_slot.source_slot`. How should the return sound, in this style, for a piece of this character? Do not name notes.",
    "criteria": {
      "literal": "The same line, over this slot's harmony.",
      "ornamented": "The same line with passing notes and a turn into the long note.",
      "lifted": "The same line a third or an octave higher, fuller.",
      "thinned": "The same line, quieter and sparser — an echo."
    }
  }
}
```

Ask only when `current_slot.return_count >= 1`. Code may also derive a default from `varied` + return count (plain → ornamented → lifted) and skip Jev on the first cut. Prefer that if the renderer ships first.

### A4. Phrase state Jev is not shown today

Not a question — state. Zero extra tokens of *judgment*, large gain in what the existing `phrase` Choice can mean.

- **Why.** `phraseRequest` sends roles and `how_it_ends`, plus prior chords/contours. It does **not** send `material`, `varied`, `build`, or the return map. Jev cannot know “this is A′” vs “this is B.” Harmony options are already filtered by `build` in code; the model is still picking a progression as if the slot were new.
- **Payoff.** ★★★. Cheaper than any new Choice. A varied `a` slot should reharmonise, not draw a new head.
- **Cost.** S. Request builder + tests that the server rebuilds the same state.
- **Allowlist.** No.
- **Sketch.** `current_slot` becomes:

```json
{
  "current_slot": {
    "slot": 4,
    "bars": "13–16",
    "material": "a",
    "varied": true,
    "build": "head_tail",
    "how_it_ends": "The four bars settle back on the tonic",
    "roles": ["restatement — …", "development — …", "climax — …", "cadence — …"],
    "source_slot": 1,
    "return_count": 2,
    "returns": [1, 2, 3, null],
    "prior_melodic_shapes": ["…"]
  }
}
```

`returns[k]` is the 1-based source bar or `null`. Rename today’s `current_slot.prior_melodic_shapes` (it is the *previous* slot’s contours, not this one’s) to `previous_slot_shapes` at piece level so the model is not lied to.

### A5. Dual critic: restated `match_*` + `song_quality` Score

- **Why.** Best is the only Score use on the music path. Style contrast (`target.raw - max(other.raw)`) keeps on-style études. The findings’ song cues (breath, phrase-length return, arrangement lift, one late summit, not perpetual downbeats) are already *proxied* by labels `describePlan` sends — `character`, `phrase_layout`, `texture`, `arrangement`, `opening`, `dynamic_shape`, `bars[].role`. A second Score on the same `score` op can read those without MIDI. N is moving 4 → 5; still one POST per candidate (questions are parallel).
- **Payoff.** ★★★★ on the Best button. ★☆ for live Generate (does not call `score`).
- **Cost.** S. Criteria strings + a combine function. Allowlist unchanged (`op: 'score'`).
- **Ship the question now** — do not wait for A1/A4. Breath is not a plan field; the criteria use character / opening / texture as the stand-in the renderer already uses. Canonical id: `song_quality` (4 standalone levels, raw 0–3). Full instructions, criteria, proxy table, and Best-of-N objective: **Appendix B**.
- **Also** restate `match_*` so style contrast sees form / arrangement / opening (today’s rubric still says texture, chords, tempo, dynamics, instrument only):

```json
{
  "type": "score",
  "instructions": "How closely does `plan` match the musical style of Frédéric Chopin? Judge character, phrase layout, texture, harmony, arrangement, opening, tempo and dynamics together. The style name is not written on the plan; do not reward a lucky guess at the label.",
  "criteria": [
    "A different tradition: texture, phrase layout and harmony would not be recognised as this musician's.",
    "Partial: some globals fit, but the form, arrangement or chord vocabulary point elsewhere or at a generic étude.",
    "Immediate: someone who knows the music would recognise the kind of piece, the texture, the harmony and how it opens and returns."
  ]
}
```

### A6. `feel` (groove) — only after a groove texture exists

- **Why.** Laufey analyses: bossa / swing-ballad, borrowed iv (`I–I7–vi7–iv6`). Current leading textures are `chordal_melody`, `alberti_melody`, `stride_dance`. A `feel` Choice with no swinging texture is a dead label (see R3). Findings item 5 is a book + texture ship first.
- **Payoff.** ★★★★ for Laufey / Fox, ★☆ elsewhere.
- **Cost.** Label S; audible M (new `bossa_comp` or swing stride).
- **Allowlist.** No, once it is a global.
- **Sketch.** Offer only for `laufey` / `elijah_fox` (style-filtered, §6):

```json
{
  "feel": {
    "type": "choice",
    "instructions": "Which rhythmic feel should a piece with this character have, in this style?",
    "criteria": {
      "straight": "Even subdivisions, no swing.",
      "swing": "Long-short eighths, laid-back.",
      "bossa": "Straight eighths, partido-alto off-beats, bass on 1 and the and of 2.",
      "ballad_backbeat": "Slow, behind the beat, sparse left-hand snaps."
    }
  }
}
```

Do not invent a feel for Bach.

### A7. `ending` — only if openings stay Jev-owned

- **Why.** `opening` is asked; the close is still code-only (rolled chord + rit). Arranging guides: ending = rit + rolled chord, or the last four bars as a tag. Lower stakes than opening (“the pattern starts, then somebody sings”).
- **Payoff.** ★★. Nice at 32 bars; easy to overfit.
- **Cost.** S + a little sheet/MIDI plumbing (already paid for intro bars).
- **Allowlist.** No.
- **Sketch.** `ending: ring_rit | tag | fade | abrupt` on the `frame` round. Default from `form` + `opening` in code if we do not want the question.

### Not an Add

| Temptation | Why not |
| --- | --- |
| Jev writes notes / MIDI degrees on the Generate path | Thesis. Every remaining hole is structure a closed label + code expresses. `notes` stays Debug. |
| Verse/chorus form family | Wait. `period`, `arch_return`, 32-bar `vamp_and_tag` (already AABA) *are* song forms once phrase-shape + phrasing + frame-after-form land. Then it is one `LAYOUTS` row, not an op. |
| Noul-per-texture or Noul-per-form | Character-pattern cargo-cult. Filter the option list (R2 / §6). |
| Per-bar `approach` on the live path | Book `splits` already do this in code. |
| Mid-Generate Score reject/retry | Rate limit (90/min) and latency. Critic stays Best-of-N. |
| `summit` as a Jev question | Findings: ~40 lines in `melody.ts`. No judgment required. |
| 3/8, tuplets, more chords | Findings: none of the measured tells is vocabulary. |

---

## 5. Remove or stop asking

### R1. Contour Choices on bars Jev cannot change

- **Why.** §3.2. ~6–9 wasted Choice questions per 16-bar piece. Same request as the phrase Choice, so they also steal attention from the one question that *is* the harmony.
- **Payoff.** ★★ housekeeping, ★★★ if paired with A2 (the remaining contours become a phrase).
- **Cost.** S. `requests.ts`, `parseOp` still accepts unused `contours` on the op (prior bars); just stop emitting `contour_k` when `themeSources()[start+k] != null`. Tests in `planner.test.ts` currently expect exactly `contour_0..3`.
- **Allowlist.** No.
- **Sketch.** Slot 4 of a 16-bar period (`returns: [1,2,3,null]`):

```json
{
  "questions": {
    "phrase": { "type": "choice", "instructions": "…", "criteria": { "ht:0:1": "…" } },
    "phrase_shape": { "type": "choice", "instructions": "…", "criteria": { "arch": "…" } }
  }
}
```

No `contour_*`. If A2 has not shipped yet, ask `contour_3` only (the cadence bar written fresh) and copy 0–2 from the source.

### R2. Stop offering foreign globals

- **Why.** §3.3. The model cannot pick what it is not shown. Mode-filtered chords already follow this rule. Offering `choir` and `church_organ` on every Laufey plan, or `minimal_cells` on every Chopin plan, is how you get a “Chopin” étude.
- **Payoff.** ★★★★ style fidelity. Quiet, no new round trip.
- **Cost.** S. A `offered(style, character, field)` helper from existing priors (weight > 0, or top 6–8). Server rebuilds the same list; tests lock it.
- **Allowlist.** No.
- **Sketch.** Chopin + `lyrical_song` `texture` criteria (not the full 22):

```json
{
  "texture": {
    "type": "choice",
    "instructions": "Which keyboard texture best realises the character in `piece_character` the way `requested_style.name` would write it?",
    "criteria": {
      "rolling_nocturne": "Slow rolling broken chords …",
      "alberti_melody": "Singing right-hand melody over …",
      "chordal_melody": "Melody carried as the top note …",
      "stride_dance": "Dance accompaniment …",
      "wash_arpeggio": "Wide harp-like arpeggio sweeps …"
    }
  }
}
```

Same cut for `form` (Chopin lyrical: `period`, `arch_return`, `sentence` — not `additive_loop`), `key` (the archetype’s keys, not all 21), `defaultInstrument` (often one option: skip the question, A/R3).

### R3. Stop asking `defaultInstrument` when the style has no real choice

- **Why.** Chopin 95 % piano, Beethoven 90 %, Bach is the only dial that meaningfully splits harpsichord / organ / piano. A peaked Choice is exactly the Beethoven-C-minor problem, except here there is no interesting Noul side. Tokens better spent on `phrasing`.
- **Payoff.** ★★ (attention), ★☆ audible (renderer already defaults).
- **Cost.** S. Code fills from style+character priors when the question is omitted.
- **Allowlist.** No.
- **Sketch.** `globals` questions for Chopin omit `defaultInstrument`. Bach still asks, criteria limited to `harpsichord | church_organ | grand_piano`.

### R4. Do not clone character’s Noul+Choice

- **Why.** The combo is **not** redundant on `concept`. README / `requests.ts` header: Choice alone → 95 % stormy Beethoven; Nouls alone → too flat; code combines. That is the one place live distributions forced a two-instrument ask. Copying it onto form or texture is wasted questions (11 or 22 extra Nouls) that still cannot see each other.
- **Payoff.** Avoided cost, not a ship.
- **Cost.** None if we simply do not do it.
- **Allowlist.** —
- **Sketch.** Keep `concept` as it is:

```json
{
  "state": {
    "task": "Plan a short piece … First decide what kind of piece it is.",
    "requested_style": { "name": "Ludwig van Beethoven", "description": "…" }
  },
  "questions": {
    "character": { "type": "choice", "instructions": "Which character is most typical …", "criteria": { "lyrical_song": "…", "stormy_drama": "…" } },
    "writes_lyrical_song": { "type": "noul", "instructions": "… Character: A slow, singing melody …", "criteria": { "true": "Yes — …", "false": "No — …" } },
    "writes_stormy_drama": { "type": "noul", "…" }
  }
}
```

Optional housekeeping (not ranked for song quality): omit `writes_*` for characters the style’s archetypes do not list (Beethoven has no `warm_groove` archetype). Saves ~6 Nouls. Only if token traces show `concept` as the fat request.

### R5. Freeze the Debug `notes` op; do not ask four parallel pitches

- **Why.** §3.1. Parallel degrees cannot form a motif. Promoting this to Generate would fight the thesis and repeat the role/chord failure mode. Closed enums are fine; the *fan-out* is wrong.
- **Payoff.** Prevents a regression. Current Debug overlay is honest about fallback.
- **Cost.** None if left Debug-only. If anyone touches it: one `rhythm` Choice + reuse `phrase_shape` / the bar’s contour; code picks degrees. Never MIDI.
- **Allowlist.** Keep `notes` parseable. Do not add a `notes_phrase` op.
- **Sketch.** If the experiment is ever re-opened, one request:

```json
{
  "op": "notes",
  "questions": {
    "rhythm": { "type": "choice", "criteria": { "four_long_short": "Half note, quarter, two eighths", "four_short_long": "…" } }
  }
}
```

Degrees come from the planned contour + palette in code. No `pitch_1`.

### R6. `bar` op: keep parseable, stop treating it as a planning path

- **Why.** Live planner uses `phrase`. `bar` still asks `chord` + `contour` + `approach` per bar — the old parallel pathology, plus an approach Choice the phrase path already replaced with book `splits`. Tests and older payloads depend on parse.
- **Payoff.** Clarity. No song change.
- **Cost.** Doc / comment only (this file). Do not delete `parseOp` cases in this review’s PR.
- **Allowlist.** Leave `bar` on the allowlist so old tests and any cached Debug replay do not 400.

### R7. `dynamicShape` vs `arrangement` — do not ask both in the same breath

- **Why.** §3.4. Two intensity-over-time enums, parallel, plus `dynamics` for level. `arrangement.ts` already applies `late_surge` / `build_then_drop` on top of arrangement levels. Contradictions (`pp` + `crescendo` + `peak_then_bare` + `lift_on_return`) are legal JSON and muddy pieces.
- **Payoff.** ★★ coherence.
- **Cost.** S. Prefer: keep `dynamics` (level) and `arrangement` (density over form). Move `dynamicShape` to the `frame` round *after* arrangement, **or** derive it from arrangement + character (`peak_then_bare` → `build_then_drop`, `terraced_blocks` → `terraced`, `constant` + hymn → `steady`). Deriving is fewer questions and enough for v1.
- **Allowlist.** No.
- **Sketch.** Derived map, no question:

```json
{ "arrangement": "peak_then_bare", "dynamicShape": "build_then_drop" }
{ "arrangement": "lift_on_return", "dynamicShape": "arch" }
{ "arrangement": "terraced_blocks", "dynamicShape": "terraced" }
{ "arrangement": "constant", "character": "solemn_hymn", "dynamicShape": "steady" }
```

If live traces later show Jev wanting `sudden_contrast` on Beethoven independently of arrangement, add the Choice back on `frame`, not on the first fan-out.

---

## 6. Restructure

Sequencing, fan-out vs later conditioning, phrase vs bar, state vs questions, how answers are read.

### S1. Character → piece → frame → phrases

Today: character, then **all** globals in one fan-out, then phrases.

Proposed:

```
1  concept     character          (keep Choice + Nouls)
2  piece       form, texture, tempo
3  frame       key, meter, palette, dynamics, (instrument),
               arrangement, opening, phrasing
               — form + texture + character now in state
4  phrase ×N   HarmonyBook phrase
               + phrase_shape if the slot writes new tune
               + return_as if the slot returns and the renderer honours it
```

- **Why.** Arrangement is “how density changes when material returns” — undefined before `form`. Opening is “straight in / vamp / pickup” — fights `toccata_perpetual`, loves `melody_over_ostinato`. Phrasing (A1) wants to see texture (a chorale already breathes by construction; a rolling nocturne needs the label). This is the conditioning the header comment already claims (“everything independent is fanned out”) but `arrangement` / `opening` are **not** independent of `form`.
- **Payoff.** ★★★★. Returns that sound like returns; intros that belong to the texture.
- **Cost.** M. One extra POST (6 → 7 on a 16-bar piece). Rate limit: still fine (Generate is ~7, Best-of-N scores are separate). Two implementation shapes:

**S1a. New `frame` op (clean).** Allowlist **yes**.

```json
{ "op": "piece", "style": "chopin", "brief": true, "character": "lyrical_song" }
```

```json
{
  "op": "frame",
  "style": "chopin",
  "brief": true,
  "character": "lyrical_song",
  "form": "period",
  "texture": "rolling_nocturne",
  "tempo": "adagio"
}
```

`piece` can keep today’s `op: 'globals'` name with a shorter question set; `frame` is the new allowlisted op. `parseOp` on `globals` should accept the short set so old Debug payloads do not 400 — or split and bump the client together.

**S1b. No new op (cheaper).** Ask `arrangement` / `opening` / `phrasing` only on **phrase slot 0**, with `form` already in `piece` state. Piece-level answers, asked once. Slightly ugly (a phrase request that also frames the piece) but allowlist-neutral.

Prefer **S1a** if any other frame label is coming (`feel`, `ending`). Prefer **S1b** if we only move the three shipped-or-proposed frame fields.

`piece` question sketch:

```json
{
  "state": {
    "task": "…",
    "requested_style": { "name": "Frédéric Chopin", "description": "…" },
    "piece_character": "A slow, singing melody over a simple accompaniment; tender and intimate"
  },
  "questions": {
    "form": { "type": "choice", "criteria": { "period": "…", "arch_return": "…", "sentence": "…" } },
    "texture": { "type": "choice", "criteria": { "rolling_nocturne": "…", "alberti_melody": "…" } },
    "tempo": { "type": "choice", "criteria": { "adagio": "…", "andante": "…", "largo": "…" } }
  }
}
```

`frame` state adds the drawn `form` / `texture` / `tempo` as descriptions (never ids).

### S2. Phrase is the grain; bar is an expansion

- **Why.** Roles already. Harmony already. Contours not yet (A2). `bar` leftover is a third grain and should not come back. Cadence splits stay in code (`finishPhraseHarmony`). Theme return stays in code (`themeSources`).
- **Payoff.** Already mostly paid. Finishing the job is A2 + R1 + A4.
- **Cost.** Covered there.
- **Allowlist.** No.
- **Sketch.** One `phrase` answer → four `BarPlan`s, as now, plus one `phrase_shape` → four contours. The plan JSON the UI edits can keep per-bar contours (the renderer’s contract). Jev never sees bar-level contour questions.

### S3. Style-and-character option filters are part of the request, not just the stub

- **Why.** §3.3, R2. The heuristic’s archetypes *are* the request-builder’s missing function. JevPlanner “never reads priors” (`styles.ts` header) was correct when the point was “do not leak the answer.” It is wrong when it means “offer the union of all music.” Filtering options is not leaking: connecting “Debussy” to `parallel_planing` is still a judgment if `wash_arpeggio` and `bell_organum` are also on the list. It stops being a judgment if `toccata_perpetual` is the distractor.
- **Payoff.** ★★★★.
- **Cost.** S. Shared helper used by `globals` / `piece` / `frame` / (optionally) contour leftover.
- **Allowlist.** No.
- **Sketch.** `criteria` keys ⊆ `Object.keys(STYLE_PROFILES[style].archetypes[character].priors.texture ?? priors.texture)`. Server-side only; the browser still posts `{ op, style, character }`.

### S4. How answers are combined (keep, tighten)

Keep:

- Character: `noul ** 4 * (typical + 0.5)`.
- Nucleus sample at face value (`TOP_P = 0.9`). Do not square (live Jev was already sure).
- Phrase novelty damp; last slot argmax.
- Trace shows Jev’s distribution, not the policy.

Tighten:

- Returning contours: do not call `decide()` on a discarded answer (already skipped). After A2, do not send the question.
- If `phrase_shape` is asked on a returning slot by mistake, ignore it the way contours are ignored today — but do not ask.
- Score: withhold `plan.style` (already). After A5, also withhold nothing else — form/arrangement/opening *should* be judged. `song_quality` is a separate answer, not a ninth style.

### S5. `score` stays off Generate; its state should match the critic’s job

- **Why.** Scoring a Jev plan mid-flight is 8 style Scores + `song_quality` × N. The critic scores heuristic candidates (Appendix B). Putting `song_quality` on Generate would not write better notes; it would only reject plans after the expensive phrase loop.
- **Payoff.** Correctness of Best-of-N, once A5 lands.
- **Cost.** S.
- **Allowlist.** No.

### Proposed 16-bar budget

| | POSTs | Questions (typical) |
| --- | --- | --- |
| Today | 6 | 44 (13+11+20) |
| After R1+A2 only | 6 | 32 (13+11+4×2) |
| After S1+A1+R2+R3 | 7 | ~28 (13+3+7+4×1.3) |
| After A3 on returning slots | 7 | ~30 |

One extra POST is worth it for frame-after-form. Do not add a fifth planning op (`theme`, `ending`, `notes`) in the same cut.

---

## 7. Ship next for song quality

Independent of UI PRs. Ordered for the music playground: audible first, cheapest coherent slice first, no discarded questions, no notes op. Renderer work that *already landed* is not on this list.

| # | Ship | Kind | Why this next | Allowlist |
| --- | --- | --- | --- | --- |
| **1** | **Phrase-level `phrase_shape`; drop per-bar contours, especially on returns** | Restructure + Remove | The thing that now returns is four independent wiggles. Same fix as `form` for roles. ~8–16 fewer questions. Repertoire is phrase-arch. | No |
| **2** | **Filter texture / form / key / instrument by style+character priors** | Restructure + Remove | Stops foreign labels the nucleus sampler will draw. Same rule as mode-filtered chords. No new questions. | No |
| **3** | **Ask `phrasing`; ask `arrangement` / `opening` / `phrasing` after `form`+`texture`** | Add + Restructure | Breath on stormy songs; frame labels that can see the layout they describe. `S1b` if we refuse a new op; `S1a` `frame` if we want a clean allowlist. | No / yes (`frame`) |
| **4** | **Put `material` / `varied` / `returns` on phrase state** | Add (state only) | The existing phrase Choice can finally mean “A′” instead of “another four chords.” | No |
| **5** | **Dual critic: `song_quality` Score + restated `match_*`; Best-of-N 4 → 5** | Add (Score) | Best can keep a song-shaped plan from labels already in `describePlan`. Appendix B is the wire spec. Not on the Generate loop. | No |

Then, not before the renderer can play them: `return_as` (A3), Laufey `feel` + `bossa_comp` (A6), derived-or-asked `ending` (A7). Summit and 1+1+2 stay code (`melody.ts`, `forms.ts` role tables) — no Jev question.

### Suggested first PRs after this doc (not this PR)

- **Best dual critic (urgent, independent):** Appendix B — `song_quality` on `score`, `BEST_OF_N = 5`, `dualObjective`. Allowlist-neutral. Can land before phrase_shape.
- **Generate path:** a single allowlist-neutral cut of **#1 + #2 + #4**: phrase_shape, filtered criteria, richer `current_slot`. **#3** is the follow-up (one extra POST or a `frame` op).

---

## Appendix: live `globals` / `phrase` shape today (for diffing)

`globals` questions, in `GLOBAL_FIELD_IDS` order minus `character`:

`form`, `key`, `meter`, `texture`, `palette`, `tempo`, `dynamics`, `dynamicShape`, `defaultInstrument`, `arrangement`, `opening`.

`phrase` questions today:

`phrase`, `contour_0`, `contour_1`, `contour_2`, `contour_3`.

`score` questions today: `match_bach` … `match_elijah_fox` (3-level Scores). Plan label withheld. Appendix B adds `song_quality` (4-level) on the same request.

`concept` questions today: `character` + `writes_<CharacterId>` × 12.

---

## Appendix B — Best dual critic: `song_quality` (wire spec)

Urgent addendum for the Best button. A follow-up agent wires this; this appendix is the contract. No MIDI. No new op. No allowlist change.

Best-of-N samples heuristic plans (cheap), then one `score` POST each. Today that POST is eight `match_*` Scores; the winner is `target.raw - max(other.raw)`. That elects the most *on-style* étude. The second critic is one more parallel Score, `song_quality`, whose levels encode the findings’ song cues **as they appear on `CompositionPlan`**, which is what `describePlan` already puts in `state.plan`.

N is **5** (was 4). Still 5 POSTs, still well under 90/min. Each POST: 8 style Scores + 1 `song_quality`.

### B.1 What Jev can see (and cannot)

`score` state today (`describePlan`):

```json
{
  "task": "Judge a composition plan for a short solo keyboard piece.",
  "plan": {
    "character": "A slow, singing melody over a simple accompaniment; tender and intimate",
    "phrase_layout": "Question and answer: a phrase that pauses on an open half cadence, then the same opening again, this time closing firmly",
    "key": "…",
    "meter": "…",
    "texture": "Slow rolling broken chords in the middle register …",
    "melodic_palette": "…",
    "tempo": "…",
    "dynamics": "…",
    "dynamic_shape": "Swells gradually to a peak past the midpoint, then recedes",
    "instrument": "…",
    "arrangement": "The first statement is simple; when the idea comes back the arrangement is fuller — a thicker left hand, the tune doubled at the octave",
    "opening": "A short upbeat into the first downbeat, the tune leaning in from the bar before",
    "length_in_bars": 16,
    "bars": [
      { "bar": 1, "chord": "I — …", "role": "Presents the main idea for the first time", "melodic_shape": "Line rises to a mid-bar peak and returns" }
    ]
  }
}
```

`plan.style` stays withheld. `arrangement` / `opening` are omitted by `describePlan` when unset — **always emit them** in the follow-up (same defaults as `parseGlobals`: `lift_on_return`, `straight_in`) so the critic is not scoring a missing field.

Not in the plan, so **not in the criteria**: actual rests, ties, MIDI summit, skyline breath %. Those are renderer consequences of the labels below. Asking Jev to imagine them is asking it to invent notes.

### B.2 Plan-label proxies (findings → enums)

Use this table in tests and in the instructions. Descriptions, not ids, go to Jev; ids are for the follow-up’s fixtures.

| Findings cue | High (song) on the plan | Low (étude) on the plan |
| --- | --- | --- |
| Breath / rests / not perpetual downbeats | `character` is lyrical_song, solemn_hymn, dance_lilt, warm_groove, restless_searching, meditative_stillness, or dreamy_haze; **or** `opening` is pickup / vamp_intro; **and** `texture` is a sung line over accompaniment (alberti_melody, rolling_nocturne, chordal_melody, aria_walking_bass, stride_dance, lush_voicings, melody_over_ostinato, chorale, pulsing_chords) | `character` is flowing_perpetual, hypnotic_pulse, or playful_wit **and** `opening` is straight_in **and** `texture` is unbroken figuration (broken_chord_prelude, toccata_perpetual, minimal_cells, interlocking_hands, two_voice_counterpoint) |
| Phrase-length return (3–8 bars, not one bar) | `phrase_layout` is period, sentence, arch_return, call_and_response, vamp_and_tag, or binary_dance. Roles include restatement / echo after a statement. | `phrase_layout` is free_fantasia (never repeats). `additive_loop` / `layered_build` / `spinning_out` are **not** automatic études — they only fail this cue if the arrangement stays constant and there is no melody-over-ostinato / pulsing tune. |
| Arrangement lift on return | `arrangement` is lift_on_return, build, peak_then_bare, or terraced_blocks | `arrangement` is constant |
| One late summit | Exactly one `climax` role, in the last third of `length_in_bars` (bars 11–16 of 16; 6–8 of 8); **or** `dynamic_shape` is late_surge or arch **and** the last climax is past the midpoint. Roles `dissolve` / `echo` after that peak help. | No climax; climax at ~50% only (the measured 48% pathology); two or more climaxes spread evenly (the 2.8× top-note tell) |

Glass / Zimmer loop + `peak_then_bare` or `build` + `vamp_intro` + melody-over-ostinato / pulsing_chords is a *song in the film-score / minimal sense* (findings: “Time”, *Metamorphosis*). Do not mark every loop as an étude.

Bach invention: flowing_perpetual + two_voice_counterpoint + spinning_out + constant + straight_in is correctly an étude. Style contrast still prefers it when it is much more Bach than the alternatives; `song_quality` only overturns a *mild* style edge (B.4).

### B.3 The question (copy into `scoreRequest`)

Question id: `song_quality`. Type: `score`. Four levels; each sentence is a complete situation (the model never sees the ordering). `raw` is the probability-weighted position on **0–3**.

```json
{
  "song_quality": {
    "type": "score",
    "instructions": "How song-like is the composition plan in `plan`? Judge only the labels in `plan` — character, phrase_layout, texture, arrangement, opening, dynamic_shape, length_in_bars, and each bar's role. Do not imagine notes, rests, MIDI, or a performance. A song here means a short keyboard piece a listener would hear as a tune that returns, can breathe, and changes clothes; an étude means unbroken figuration that starts again every bar. Loop-and-layer plans (a short cycle that builds or peaks then drops, often with a vamp) count as songs in the film-score and minimal sense.",
    "criteria": [
      "Étude / perpetual study. The character is continuous figuration or a motor pulse, the texture is two-hand perpetual motion or unbroken broken-chord / cell figuration, the opening is straight in (or omitted), and the arrangement is constant. The phrase layout does not bring a three-to-four-bar idea back — it spins, fantasises, or loops without a sung line on top. Bar roles have no single late peak: no climax, or climaxes scattered through the middle. Realising this plan would attack every downbeat and never change clothes.",
      "A finished piece, not yet a song. There is a real character, texture and phrase layout, but the song cues are missing or they fight each other. Either the layout does not return a phrase-length idea (a fantasia, or a loop/spin with a constant arrangement and no melody riding an ostinato), or a returning layout is paired with a straight-in opening, a perpetual or on-the-beat character, and a constant arrangement. Dynamics may swell, but climaxes sit at the midpoint or repeat. Someone would hear a coherent miniature, still an étude's cousin.",
      "Song-shaped. The phrase layout is one where a three-to-four-bar idea comes back (question and answer, sentence, arch with return, call and response, vamp and tag, or a binary that returns home), or it is a loop/layer form whose texture is a tune over a repeating figure. The character and texture are a singing line over accompaniment — lyrical, hymn, dance, warm groove, searching, still, or hazy; nocturne, alberti, chordal melody, aria, stride, chorale, ostinato-under-tune, pulsing chords — not a two-hand perpetual. The opening is a vamp or a pickup, or the character is one that lands and rests at phrase ends. Arrangement may still be constant. At most one clear climax, and it is not early. On the page this is a short song without words, even if the return is not yet dressed.",
      "A song that returns in new clothes. Song-shaped, and the plan also marks the return and the peak. Arrangement is lift-on-return, a build, peak-then-bare, or terraced blocks — not constant. There is one summit late in the piece: a climax role in the last third of the bars, or a late-surge / arch dynamic shape whose climax is past the midpoint, not a climax at half-time and again at the end. A film-score or minimal plan qualifies at this level when a short loop accumulates layers or peaks then drops to a bare texture, the opening is a vamp, and a melody sits on the ostinato. A straight-in perpetual texture with a constant arrangement cannot be this level."
    ]
  }
}
```

Do not add a fifth level. Do not mention composer names. Do not ask for free text.

### B.4 Combine with style contrast

Keep `contrastiveScore` as it is:

```
styleContrast = target.raw - max(other.raw)     // style Scores are 3-level; raw ∈ [0, 2]
                                                // typical range ≈ [−2, +2]
```

`song_quality.raw` ∈ **[0, 3]**. Center it so an étude *hurts* and a dressed song *helps*:

```
SONG_WEIGHT = 0.45
SONG_MID    = 1.5

dualObjective = styleContrast + SONG_WEIGHT * (song_quality.raw - SONG_MID)
```

If `song_quality` is missing or NaN, `dualObjective = styleContrast` (fail open). `pickBestIndex` reads `dualObjective` instead of contrast alone.

Worked examples (why these weights):

| Candidate | styleContrast | song raw | dual |
| --- | --- | --- | --- |
| On-style étude | 0.90 | 0 | 0.90 + 0.45×(−1.5) = **0.225** |
| Slightly less on-style song | 0.40 | 3 | 0.40 + 0.45×(+1.5) = **1.075** ← Best |
| Wrong-style song | −1.00 | 3 | −1.00 + 0.675 = **−0.325** ← loses to the étude |
| Tie on style, song vs piece | 0.50 | 3 vs 1 | **1.175** vs **0.275** |

Song quality overturns a *mild* style edge and breaks ties. It cannot elect a wrong style. That is the dual critic: style keeps Bach from becoming generic Laufey; song keeps Best from handing you the most Bach-like prelude.

If Bach Best starts preferring arias over inventions even when the invention is clearly more Bach (`styleContrast` gap ≳ 0.8), drop `SONG_WEIGHT` to **0.30** (étude penalty −0.45 instead of −0.675). Do not invert the terms (do not multiply contrast by song).

Sketch for `bestOf.ts` (follow-up; not this PR):

```ts
export const BEST_OF_N = 5
export const SONG_QUALITY_WEIGHT = 0.45
export const SONG_QUALITY_MID = 1.5

export function dualObjective(
  styleContrast: number | null,
  songRaw: number | null,
): number | null {
  if (styleContrast === null) return null
  if (songRaw == null || !Number.isFinite(songRaw)) return styleContrast
  return styleContrast + SONG_QUALITY_WEIGHT * (songRaw - SONG_QUALITY_MID)
}
```

`ScoreResult` grows an optional `songQuality?: { raw: number; confidence: number }` read from `answers.song_quality` (`type === 'score'`). Do not reuse `MATCH_LEVELS` / `low|medium|high` — those are 3-wide and belong to `match_*` only. Round `song_quality` only if the UI needs a label; the critic uses `raw`.

Heuristic stub scorer: a deterministic stand-in so offline Best still moves. Count how many of the four cues in B.2 are high, map 0→0, 1→1, 2→2, 3–4→3. Not ground truth; plumbing, same as today’s prior-fit `heuristicMatch`.

### B.5 Follow-up checklist (code, not this PR)

1. `BEST_OF_N = 5`; update the “four POSTs” comment.
2. `describePlan`: always include `arrangement` and `opening` (defaults above).
3. `scoreRequest`: add the `song_quality` question from B.3 next to the `match_*` loop. Restate `match_*` instructions as in A5 (form / arrangement / opening).
4. `JevPlanner.score` / `HeuristicPlanner.score`: parse `song_quality` onto `ScoreResult`.
5. `selectBestOfN`: `dualObjective(contrastiveScore(...), songQuality.raw)`; `pickBestIndex` on that.
6. Tests: fixture plans for the four rows in B.4 (on-style étude vs milder song vs wrong-style song); stub `song_quality` raw; assert the song wins the first pair and loses the wrong-style pair. Do not call TypeSafe in CI.
7. Debug payload: the ninth question should show up on the style-match exchange.

Still do not put `song_quality` on the Generate planning loop. Still do not invent MIDI in the API.
