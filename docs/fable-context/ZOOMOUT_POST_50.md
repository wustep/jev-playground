# Zoom-out after #50 — the labels do not reach the tune

Fable, 2026-09-20, `main` @ d742a9d (#50, melody-not-skyline metrics). Local
pass: compare script re-run on the new metrics, reference plans re-read against
the Mutopia MIDI, dial-sweep over every global to see which ones change the
singing voice.

No `TYPESAFE_API_KEY` here, so `--live-jev` was not run and is not reported.
Guide/Line are the same fake closed picks through the production realize
functions.

**#50 did its job** — the board is honest now, and it cost us one of our two
headline gaps (Chopin register was never wrong) while sharpening the other.

**The finding this pass**: `character` changes **nothing** in the singing
voice — 12 values, 5 styles, one identical outcome every time. `arrangement`
never touches the melody either; it is a left-hand density dial. Melody
register is a constant baked into each texture, and **every texture centres
between 74 and 76**. That is why Beethoven's Adagio cannot be reached by any
label, and why “draw the lyrical archetype” was going to disappoint.

---

## 1. What #50 changed about the scoreboard

Re-ran `scripts/compare-generated-vs-reference.ts`. The corrections in the
addendum hold, and two of them move the ranking.

| Claim | Before (both hands) | After (melody) | Effect |
| --- | --- | --- | --- |
| Chopin register | 71.4 vs 72.4 “win” | **76.4 vs 76.5** | Gap **retired** — the hypothesis was half right, and the half that was wrong was mine |
| Chopin return | `ret4` 0.75 | **0.563 / run 1** vs MIDI 0.813 / run 4 | Gap **promoted** |
| Debussy register | +15 | **+5.1** (75.9 vs 70.8) | Demoted |
| Beethoven register | 80.6 vs 62 (+18) | **71.7 vs 62 (+9.7)** | Still the largest register miss; combined was inflated by inner storm tones |
| Bach occupancy | ref 16/16 downbeats | ref figure attacks **0/16**, 50 % silent | Guide writing 16/16 is now unambiguously the error |
| Guide rests | “inaudible” | Chopin **22 %**, Laufey 22 %, Debussy 25 % silent | #48's rest work was real; only the metric hid it |

#50 also added `onsetDensityEarly/Return`, which instruments the
ZOOMOUT_POST_48 §3 lace finding directly. It immediately pays:

| | early → return | ratio |
| --- | --- | --- |
| Chopin MIDI RH | 7.25 → **11.75** | ×1.62 |
| Chopin code argmax | 3.5 → 3.75 | ×1.07 |

Two separate misses in one column. Our nocturne melody does not lace on the
return **and** it is half as dense as Chopin's to begin with.

### What the notes look like

The singing voice of Chopin argmax, bar by bar:

```
bar 0  n=2   20:C5 22:C5                     ← pickup only
bar 1  n=0                                   ← melody tacet
bar 2  n=3   0:Db5   12:Ab5  18:F5
bar 3  n=4   0:F5   6:Ab5  12:F5  18:Db5
bar 4  n=4   0:Db5  12:Ab5  20:Gb5 22:F5
bar 5  n=3   0:Db5  12:Ab5  18:F5
bar 6  n=4   0:Db5   6:Ab5  12:Ab5 18:F5
```

Onsets land on ticks 0, 6, 12, 18 and almost nowhere else — the four dotted
quarters. **Our 12/8 nocturne is a 4/4 in disguise.** Chopin's bar 1 is
`g4.~ g8 f g | f4. ef4 bf8` — long tone, then eighths inside the beat. #46 won
the time signature; the melody never learned the subdivision.

---

## 2. Which labels reach the singing voice

Every global, every value, on five argmax plans (seed 1, 16 bars), counting
**distinct singing-voice outcomes** (register, occupancy, `ret4`/`ret8`, run,
onset density, leaps, summit). Left hand counted separately.

| Global | Melody outcomes — chopin / beethoven / laufey / zimmer / glass | LH | Reading |
| --- | --- | --- | --- |
| `texture` | 23, 23, 23, 23, 23 | 18–19 | the only real dial |
| `form` | 10, 8, 10, 8, **1** | 1–2 | inert on Glass |
| `meter` | 6, 6, 6, 6, 6 | 2–6 | |
| `palette` | 5, 6, 6, 2, **1** | 1 | |
| `phrasing` | 4, 4, 4, 4, 4 | 1 | #46 reaches |
| `hookBars` | 3, 2, 3, 3, **1** | 1 | inert on Glass |
| `arrangement` | **1, 1, 1, 1, 1** | 1, 4, 4, 5, 4 | **melody-inert; LH only** |
| `character` | **1, 1, 1, 1, 1** | **1, 1, 1, 1, 1** | **fully inert** |
| `dynamicShape` | **1, 1, 1, 1, 1** | 1–2 | velocity only |
| `opening`, `pedal` | **1, 1, 1, 1, 1** | 1 | see caveat |

Three consequences.

**`character` is decorative.** It is the most semantically loaded global we
have — `lyrical_song` vs `stormy_drama` — and given a plan it changes nothing
in either hand. Its only power is indirect: it steers the *planner* toward a
texture. Swapping Beethoven's argmax to `character: lyrical_song` produced a
byte-identical melody on every metric.

**`arrangement` cannot express a Chopin return.** It is a left-hand density
dial by construction, so “the return is fuller” can only ever mean a thicker
LH. On `rolling_nocturne` it does not even do that — all five values give an
identical left hand. ZOOMOUT_POST_48 called this “choose a hand”; the truer
statement is that **the right-hand side of the mechanism does not exist.**

**`hookBars` is inert exactly where it was bought.** Glass (1 outcome) because
`minimalCells` never calls `melodyPitches`, as #48 found. And on Beethoven with
truthful labels, `hookBars` 2 / 4 / 8 all give `ret8` 0.75, run 8, register
75.8 — identical. The one style whose curated notes explicitly ask for an
8-bar return unit is a style where the field does nothing.

*Caveat:* `opening` and `pedal` plausibly act outside the measured window
(intro framing, sustain). Read their rows as “no effect on the sixteen bars we
score”, not as dead code.

### Why register is stuck

`melodyPitches` centres the line on `(lo + hi) / 2` (`src/render/melody.ts:152`),
and `lo`/`hi` are **hardcoded per texture**:

| Texture | window | centre | observed | MIDI melody |
| --- | --- | --- | --- | --- |
| `rolling_nocturne` | 68–84 | 76 | 76.4 | **76.5** |
| `alberti_melody` | 64–86 | 75 | 74.3 | **62** |
| `tremolo_storm` | 64–88 | 76 | 71.7 | 62 |
| `parallel_planing` | 65–84 | 74 | 75.9 | 70.8 |
| `bossa_comp` | 64–84 | 74 | 75.7 | — |
| `pulsing_chords` | 67–81 | 74 | 73.9 | — |
| `melody_over_ostinato` | 64–84 | 74 | — | — |

Every centre is 74–76. The generated melody sits at ~75 regardless of style,
character or plan. **Chopin “matches” by coincidence** — Op. 9/2's tune happens
to live at 76.5. Beethoven's Adagio at 62 is not reachable by any label,
which is why swapping all four Beethoven dials to their truthful values still
lands at 75.8.

---

## 3. Old plans vs the real MIDI

The committed reference JSONs are mostly truthful about what the scores do.
The problem is that they are **stale against our own schema**.

**None of the seven sets `phrasing` or `hookBars`.** Both fields exist now
(#46, #48); all seven files leave them undefined and carry the old proposal as
a `_stretch` string. `parsePlan` then fills a default, so the board's “Ref
labels” column is partly defaults, not curated truth — and on Chopin the
default **contradicts the file**: the JSON's stretch says `proposed phrasing:
upbeat`, the rendered row reports `breathing`.

Their curated stretch notes already name two of this pass's findings:

- Beethoven: *“8-bar theme as the return unit (period at 16 bars inserts B)”*
  and *“register lift of a whole phrase, not just climax + a third.”* Both
  still unbuilt; §2 shows `hookBars` would not deliver the first one anyway.
- Zimmer: *“same-figure layer add (arrangement label shipped; figure still
  changes)”* — consistent with `arrangement` being LH-only.

Truth deltas worth writing into the files:

| File | Says | MIDI says | Note |
| --- | --- | --- | --- |
| `beethoven-op13-pathetique-ii` | `hookBars` unset → 4 | **8** — RH bars 9–15 are bars 1–7 verbatim; `ret8` 0.94 / run 8 | Correct to write; currently inert |
| `chopin-op9-2-nocturne` | stretch says `upbeat`; default gives `breathing` | score does **both** — `r4` then a `bf8` pickup at bar 4 | Our `phrasing` cannot say “rest *and* pickup” |
| `debussy-l66-arabesque-1` | `opening: straight_in`, phrasing → `on_the_beat` | melody is tacet two bars, then enters on a rest; **12/16** downbeats | `straight_in` is wrong; occupancy is not on-the-beat |
| `zimmer-time` | `texture: melody_over_ostinato` | — | **argmax picks `pulsing_chords` instead** (see §4) |

Everything else (keys, meters, forms, Chopin `arrangement: constant`,
Beethoven `lift_on_return`) checks out against the scores.

---

## 4. Generated vs reference — where argmax diverges

Label hits, argmax: Bach 15, Fox 13, Glass 13, Chopin 12, Zimmer 12, Laufey 11,
**Beethoven 6, Debussy 5**. Those last two are picking a different piece.

I swapped argmax dials to their truthful reference values one at a time to
separate priors from renderer.

**Zimmer is a priors miss, and a cheap one.** Argmax picks `pulsing_chords`;
the reference says `melody_over_ostinato`. Swapping only that:

| | silent | downbeats | density | leap mean |
| --- | --- | --- | --- | --- |
| argmax (`pulsing_chords`) | 11 % | 15 a / 1 s | 7 → 6.25 | 0.28 |
| + `melody_over_ostinato` | **33 %** | **6 a / 9 s** | 2.25 → 2.75 | 2.39 |
| reference plan rendered | 28 % | 5 a / 10 s | 2.5 → 2.5 | 4.0 |

One label lands nine silent downbeats and triples the breath, straight onto the
reference profile. **`ret4` stays 0** — the return is a separate, renderer-side
problem. ZOOMOUT_POST_48 item 4 proposed routing `pulsingChords` through
`rhythmFor`; that fix is still valid but it is now second-line, because the
texture should not be `pulsing_chords` in the first place.

**Beethoven is a renderer miss.** Swapping all four dials to truth
(`lyrical_song` + `alberti_melody` + `two_four` + `period`) gives register
**75.8** against MIDI **62**, `ret4` 0.125. `character` alone: no change at all.
`meter: two_four` alone makes it *worse* (77.9). The committed reference plan
rendered sits at 74.3. **No combination of correct labels produces the
Adagio**, because §2's register constant dominates.

**Chopin is a renderer miss.** `arrangement: constant` and
`phrasing: breathing` — both truthful — change essentially nothing
(`ret4` 0.563 either way). The return and the density are not label problems.

---

## 5. Still broken, ranked by audible damage

Melody-honest. Register claims are against the MIDI melody track.

| # | What you hear | Evidence | Where |
| --- | --- | --- | --- |
| 1 | **Beethoven is a different piece, and no label can fix it.** | truthful labels → 75.8 vs 62; `character` inert | renderer |
| 2 | **Returns never lace.** Chopin should roughly ×1.6 its RH density over a constant LH. | 3.5 → 3.75 vs 7.25 → 11.75; `arrangement` is LH-only | renderer |
| 3 | **The melody ignores its own subdivision.** 12/8 that only plays dotted quarters. | onsets on 0/6/12/18; density 3.5 vs 7.25 | renderer |
| 4 | **Zimmer picks the wrong texture**, losing 9 silent downbeats and all its breath. | table in §4 | priors |
| 5 | **Guide writes a tune where there is none.** Bach's figure attacks 0/16 downbeats; Guide writes 16/16. | §1 | closed-label |
| 6 | **Glass never returns a cell** and is inert to `form`, `hookBars`. | `ret4` 0.063; 1 outcome for both dials | renderer / design |
| 7 | **Every lyrical downbeat is still attacked** even where rests are now audible. | Guide 22 % silent, still 16/16 | realize |
| 8 | **Debussy is +5 and in 9/8**, and opens `straight_in` where the score is tacet. | §1, §3 | priors |
| 9 | Fox melody is 4× too dense (14 vs ref 3.25); Guide leaps 24 st | §1 board | realize |

---

## 6. Highest-conviction next five

Tags: **priors** / **realize** / **renderer** / **closed-label**.

### 1. A melody register that the plan can set — **renderer** (+ one closed field)

`melodyPitches` centres on the texture's hardcoded `(lo+hi)/2`, so every style
sings at ~75. Give the plan a tessitura it can shift — a closed
`register: low | mid | high` (or a per-character offset applied to the
texture's window), reaching `melodyPitches` through `BarContext`.

This is the root cause behind ranked gap 1, and it is what makes `character`
worth having at all. **Ship it before any archetype work** — ZOOMOUT_POST_48
item 2 is inert without it, which §4 now proves rather than predicts.

Allowlist: one new closed field if it is exposed as a global. A
character-driven offset needs none and is the cheaper first cut.

### 2. Ornament-on-return for the code path — **renderer**

Gap 2, and it subsumes ZOOMOUT_POST_48 item 3. The honest framing after §2:
`arrangement` is a left-hand dial and there is **no right-hand return
mechanism at all**. Build one — on a `returns` bar, subdivide the remembered
figure rather than replay it: keep the strong-beat pitches, fill weak slots
with neighbours from the scale. Chopin's own device, and `onsetDensityReturn`
already measures it.

Pairs naturally with gap 3 (the subdivision our 12/8 never uses), and the same
machinery answers both.

### 3. Zimmer's texture prior — **priors**

One label, `pulsing_chords` → `melody_over_ostinato`, lands nine silent
downbeats and the reference breath profile (§4). Cheapest audible win here.
Keep the `rhythmFor` routing from ZOOMOUT_POST_48 item 4 as a follow-up for the
return, but it is no longer the headline.

Allowlist: none.

### 4. `notes_scope: singing_line | none` — **closed-label**, **needs allowlist**

Unchanged from ZOOMOUT_POST_48 item 5, and #50 strengthened it: the Bach figure
track attacks **0 of 16** downbeats. There is no tune, and Guide writes one on
every bar. Still Guide-only, still the one item needing a Coder allowlist
entry.

### 5. Refresh the reference plans against the schema — **priors**, doc-adjacent

Write `phrasing` and `hookBars` into all seven JSONs, fix Debussy's `opening`,
set Beethoven's `hookBars: 8`, and resolve the Chopin `upbeat`/`breathing`
contradiction (§3). Cheap, and it stops the board reporting defaults as
curated truth — the same class of error #50 just fixed on the MIDI side.

Do it *after* 1–3, so the refreshed files are written against a renderer that
can act on them.

**Allowlist needs across the five: item 4, and item 1 only if `register` is
exposed as a global rather than a character offset.**

### Accept / reject / rescope of ZOOMOUT_POST_48 items 2–5

| Item | Verdict | Why |
| --- | --- | --- |
| 2. Beethoven archetype + tessitura | **Rescope → new 1.** Drop the archetype half | `character` is fully inert (§2); truthful labels still give 75.8 vs 62. The tessitura half *is* the fix, and it generalises beyond Beethoven |
| 3. `lift_on_return` chooses a hand | **Accept → new 2, reframed** | Not “choose a hand” — `arrangement` is LH-only by construction and there is no RH mechanism to choose. Build the missing side |
| 4. `pulsingChords` → `rhythmFor` | **Rescope → new 3, demoted to follow-up** | Right diagnosis, wrong lever: argmax should not pick that texture. The routing fix survives for the return |
| 5. `notes_scope` | **Accept → new 4, unchanged** | Strengthened by the 0/16 Bach figure downbeats |

Item 1 (melody-not-skyline) shipped as #50. New this pass: the register
constant and the label-reach audit, which is why the old item 2 inverts.

---

## 7. Honesty

- **No live Jev.** Guide/Line numbers are fake closed picks through the
  production realize functions. Deltas are trustworthy; absolute values are not
  Jev's notes.
- The reach table (§2) is **one seed, one bar count, five styles, argmax
  plans**. A label that is inert here could matter at another seed or on a
  texture these five do not use. The `character` result is the strongest
  because it held identically across all five.
- `opening` and `pedal` are marked inert on the *measured sixteen bars*. They
  may act on intro framing or sustain that `scoreMetrics` does not score.
- Texture windows in §2 are the first `melodyPitches` call in each function.
  `minimalCells` and `displacedArpeggio` never call it, so they have no window
  and are excluded rather than reported as 0.
- Glass / Zimmer / Laufey / Fox still have no MIDI and no sheet. Their rows are
  reference-plan JSON rendered through our own paths.
- Chopin's MIDI upper track still includes some inner/crossing notes, so its
  7.25 → 11.75 slightly overstates the melody. The ratio is far larger than
  that error.
- n = 8 argmax + 24 samples + 8 reference realizes + 4 MIDI files, plus a
  dial sweep of 11 globals × 5 styles. Not the 192-piece FIDELITY sweep.

## 8. Reproducing

```text
npm ci
npx --yes tsx scripts/compare-generated-vs-reference.ts --out /tmp/post50.json
```

The dial sweep and swap experiments in §2 and §4 were throwaway scripts against
`src/compare/compareMetrics.ts` `scoreMetrics` + `renderPlan`, not committed.
They are three calls: render `parsePlan({ ...argmax, [field]: value })` for each
value, and count distinct metric signatures.

Do not merge. Coder merges when Music pings.
