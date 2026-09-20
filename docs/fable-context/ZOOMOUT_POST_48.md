# Zoom-out after #48 — the notes, re-measured against the scores

Fable, 2026-09-19, `main` @ 79d2a54 (after #48: `hook_bars` + Guide realize
rests/returns). Local pass: compare script re-run, five Mutopia **LilyPond
sources** read as notation, four reference MIDIs re-measured **per hand**.

No `TYPESAFE_API_KEY` in this environment, so `--live-jev` was not run and is
not reported. Guide/Line below are the same fake closed picks through the
production realize functions that `GENERATED_VS_REFERENCE.md` used.

**The headline is a measurement finding.** The scoreboard scores the top of
*both hands*. Every lyrical reference in this repo puts its accompaniment in
the treble staff, so the “reference” column has been describing the
accompaniment, not the tune. Chopin’s “closest code win” is an artifact. Fix
the metric before spending a PR on anything it ranked.

---

## 0. What I read

New this pass — Mutopia LilyPond sources, same files the committed MIDI was
rendered from (see [`docs/ref-midi/public/README.md`](../ref-midi/public/README.md)
for provenance and licences). Notation makes rests, ties, grace notes and
repeats explicit where MIDI blurs them.

| Source | Used for |
| --- | --- |
| `chopin_nocturne_op9_n2.ly` | A / A′ / A″ at bars 1, 5, 13; the bar-4 `r4` |
| `pathetique-2.ly` | bars 9–15 vs 1–7; the LH 16ths at bar 9 |
| `debussy_Arabesque_1.ly` | the two-bar silent opening; rest-on-downbeat entries |
| `wtk1-prelude1.ly` | confirming there is no tune to write |
| `Chop-28-4.ly` | read, not cited below |

Living artists stay JSON-only (`reference-plans/`), rendered through the same
three paths. No commercial sheet, no transcriptions.

---

## 1. The metric is measuring the wrong hand

`compare-generated-vs-reference.ts` builds the reference skyline from the
highest onset across **all tracks**. Split by hand, the four MIDI files say
something quite different:

| Style | RH track (the tune) | Both hands — **what we score** | code argmax |
| --- | --- | --- | --- |
| Chopin Op. 9/2 | **76.5** | 72.4 | 71.4 |
| Beethoven Pathétique II | 62.0 | 62.0 | 80.6 |
| Debussy Arabesque | **70.1** | 65.1 | 79.9 |
| Bach BWV 846 (figure track) | 69.1 | 66.4 | 66.8 |

Two of the scoreboard’s load-bearing numbers move:

- **Chopin is not a register win.** “71.4 ≈ 72.4” compares our tune to
  Chopin’s *left hand poking through the gaps*. Against the actual melody
  (76.5) we sit about five semitones low. The 12/8 pulse win from #46 stands;
  the register win does not.
- **Debussy is less wrong than reported.** +9.8 against the real melody, not
  +15. Still too high, but it is not the outlier the board implies.

Beethoven is unaffected — its LH is far below, so both readings agree, and
**80.6 vs 62.0 is a genuine 18-semitone miss.**

### The occupancy numbers are the same artifact

Every reference row reads `0 % silent, 16/16 downbeats`. That is the
accompaniment. What the notation says about the same bars:

- **Debussy**: bars 1–2 of the melody are `s1 | s1` — *silent*. Bar 3 enters
  `r4 cs fs cs~`: a quarter **rest on the downbeat**, then a tie across the
  barline into bar 4. Bars 6 and 8 rest again. The Arabesque tune attacks
  maybe half its downbeats; the arpeggio underneath attacks all sixteen.
- **Chopin**: bar 4 ends `... ef4.) r4 bf8` — an explicit quarter rest, then
  the pickup. The phrase-end air is real, and so is the pickup after it. Our
  `upbeat` + `withEndRest` shape is right; it is invisible because the LH roll
  fills the beat in the skyline.

So “every lyrical downbeat is attacked” is overstated **as a gap against the
references** — we cannot currently tell how often *they* attack one. It is
still true of our own notes, and it is still worth fixing. But the size of the
gap is unknown until the metric separates the hands.

### It is also partly real

Not purely a metric problem. `overlayMelodyVoice` (`src/render/jevNotes.ts:864`)
peels the old skyline and keeps it as an inner voice. In `rolling_nocturne`
the treble staff *is* the accompaniment, so when #48’s `vacateRestBeat` clears
the melody’s beat, the peeled roll underneath still sounds on it. Chopin Guide
has 14 rest slots and 1.6 % silent beats — both readings are correct, and the
rest is genuinely inaudible. Making it audible means touching the
accompaniment, which is what Q1 promises not to do. Flagging the tension
rather than pretending it is a one-liner.

---

## 2. What #46–#48 actually fixed in the notes

Re-run of the compare script, argmax rows, against the pre-#48 table.

| Claim | Evidence | Verdict |
| --- | --- | --- |
| #48 Guide ornaments the return | **Glass** guide `ret4` 0 → **0.5**, run 1 → **4**. **Laufey** guide 0.44 → **0.688**, now equal to code’s 0.688 — it no longer destroys the return. | **Landed, off the flagship case** |
| #48 Chopin Guide `ret4` 0.25 → recovered | Still **0.25** (code 0.75). Unchanged. | **Did not land** |
| #48 rest slots vacate a felt beat | **Fox** guide 0 % → **17.2 %** silent. Laufey 0 % → 3.1 %. Bach-sample 21.9 %, Zimmer-sample 34.4 %, Beethoven REFgui 31.3 % with a silent downbeat. | **Landed where rest slots exist** |
| #48 code-path breath | Fox 8 → 12.5 %, Zimmer 9 → 10.9 %, Laufey 4.7 → 6.3 % silent. **No lyrical downbeat vacated anywhere.** | **Landed, small** |
| #48 Guide leap cap effect | Chopin guide leap max 17 → **13**. Laufey 29 → 24. Fox still 28. | **Partly** |
| #48 `hook_bars` gives Glass/Zimmer a 4-bar skyline return | Glass code `ret4` **0.063**, Zimmer code **0.0** — both unchanged. | **Did not land** |
| #46 Chopin 12/8 + register | 12/8 and `ret4` 0.75 stand. Register win is an artifact (§1). | **Half** |

Two of #48’s four claims did not reach the notes. Both have a traced cause.

### Why `hook_bars` did not move Glass or Zimmer

`themeSources` now copies four bars (`src/plan/forms.ts:679`) and the plans
carry `hookBars: 4`. The copy cannot reach either skyline:

- **Glass / `minimalCells`** (`src/render/textures/modern.ts:22`) never calls
  `melodyPitches`, so `bar.returns` is unreachable by construction. Its top
  voice is driven by `stage = Math.floor(bar.index / 2)`, a monotonic process
  that is *designed* never to repeat a cell — the comment says so: “Nothing is
  ever simply repeated for long.” `hookBars` and this texture contradict each
  other.
- **Zimmer / `pulsingChords`** (`src/render/textures/modernExtra.ts:70`) picks
  its rhythm with `options[Math.floor(bar.rand() * options.length)]` — a
  direct draw that **bypasses `rhythmFor` entirely**. No rhythm memory, so no
  return (`context.ts:198`) and no breath (`context.ts:190`). Its `insistent`
  branch then fills every slot with one repeated pitch, which is why leap mean
  is 0.52 and the summit is hit all 16 bars.

Zimmer is a small fix. Glass is a design contradiction to decide, not patch.

### Why Chopin’s Guide return did not recover

`realizeJevGuideChoices` passes `echoRhythm: options.lastRhythm` on a
returning bar (`src/render/jevNotes.ts:752`). `lastRhythm` is **bar i−1’s**
rhythm, not the source bar’s. So bar 4 borrows bar 3’s rhythm while
`ornamentSourcePitches` maps bar 0’s pitches onto it by
`sourcePitches[Math.min(i, len - 1)]` — index-clamped, so a 3-note source
spread over 6 slots repeats its last pitch four times. Pitches from one bar,
slots from another, contour mangled.

Dumping the Chopin argmax skyline shows a second reason the number was soft:

```
themeSources= 4<-0  5<-1  6<-2   (7 is a cadence, written fresh)
bar 0  |  20:C5/2 22:C5/2                 ← the pickup, nothing else
bar 1  |  0:Ab3 2:Db4 4:F4 6:Ab3 ...      ← the LH roll, in treble[0]
bar 2  |  0:Db5/12 12:Ab5/6 18:F5/6       ← the tune actually starts here
```

`ret4` compares bars 0–3 with 4–7. Bars 0 and 1 are a pickup and an
accompaniment roll, so the reported 0.75 rests on bars 2–3 matching 6–7. The
theme does not start where the metric assumes it does.

---

## 3. What the scores say we are getting wrong

The most useful thing in the notation is not a number. It is that **Chopin and
Beethoven lift on opposite hands**, and we do the same thing to both.

**Chopin Op. 9/2 — the left hand never lifts; the right hand laces.**
LH attacks per bar across all sixteen: `11,12,12,12,12,...` — constant. The
melody skeleton is fixed and gets progressively more decorated:

| | bar 1 | bar 5 (A′) | bar 13 (A″) |
| --- | --- | --- | --- |
| notation | `g'4.~ g8 f g` | `g'4. f16 g f e f g f8` | `\grace{g16 bf ef} g4 a,16 bf cf bf cs d g16. f32` |
| RH attacks / bar, 4-bar mean | **7.25** | **12.5** | **15.25** |

Same downbeat, same pitch, same harmonic goal — the long tone is subdivided in
place. Bars 3, 7 and 15 are the same skeleton three times, gaining a grace-note
turn (`\grace { e16 [f16] } g8`). The B section drops back to 7.5. Density is
the form.

**Beethoven Pathétique II — the right hand is literally unchanged; the left
hand quadruples.** Bars 9–15 of `topmain` are note-for-note bars 1–7. What
changes at bar 9 is `bottom`: `as4( des | c g)` becomes
`as''16 es as es g es g es` — LH attacks per bar **2.4 → 7.6**.

We do neither. `lift_on_return` always thickens the LH and always rewrites the
RH, which is backwards for Chopin and half-right for Beethoven (our LH 4 → 8
is the right gesture under the wrong tune). Our Chopin 4-bar density goes
`5.25, 3.75, 4.5, 3.75` — flat and slightly falling where the score rises by a
factor of two.

**Bach and Debussy, for contrast.** Bach RH attacks per bar: `12` sixteen
times, CV 0.00. There is no tune and no variation — Guide writing a melody
over it is the clearest single audible error on that dial. Debussy is the
opposite: CV 0.33, bars ranging 3 to 10 attacks, with the tune absent for two
bars and entering on a rest.

**On “uniform attacks” — that critique was wrong.** Measured, our CV is
*higher* than the references (Chopin 0.50 vs 0.40, Beethoven 0.49 vs 0.10,
Bach 0.19 vs 0.00). We are not too even; we oscillate. Ours goes
`4,10,4,10,10,10,4,2`; Chopin’s *grows* `7.25 → 12.5 → 15.25`. The gap is the
shape of the density curve across statements, not its variance. Do not ship a
“vary the rhythm” change — we already vary it, in the wrong direction.

---

## 4. Still broken, ranked by audible damage

Metric caveats from §1 applied; items the board ranked on artifacts are marked.

| # | What you hear | Evidence | Where |
| --- | --- | --- | --- |
| 1 | **Beethoven is a different piece.** High 4/4 tremolo storm against a 2/4 Adagio. | register 80.6 vs RH 62.0; summit ×4; `ret4` 0.063 | priors + realize |
| 2 | **Returns are copies or rewrites, never lace.** Chopin A′ should roughly double its RH density over a fixed LH; ours falls. | ref 7.25→12.5→15.25 vs ours 5.25→3.75 | realize |
| 3 | **Glass and Zimmer never return a cell.** `hook_bars` shipped and cannot reach either skyline. | Glass `ret4` 0.063, Zimmer 0.0 | renderer |
| 4 | **Guide writes a tune where there is none.** Bach (CV 0.00, no melody) and Glass cells get 16/16 sung downbeats. | Bach guide 16/16, reg 65.6 | closed-label |
| 5 | **The tune sits low on Chopin, high on Debussy.** −5 and +9.8 against the real melodies. | §1 table | priors |
| 6 | **Rests are inaudible under a treble accompaniment.** Real, not only a metric artifact. | Chopin guide: 14 slots, 1.6 % silent | realize (Q1 tension) |
| 7 | **No texture-first opening.** The Arabesque waits two bars; we always start with everything. | `introBars: 0` everywhere | renderer |
| 8 | **Laufey never sounds a borrowed iv.** | argmax chords `Imaj7 ii9 V13` only | priors |
| 9 | Guide leaps of 24–28 st on Fox/Laufey | leap max 28 (Fox argmax) | realize |

Dropped from the old board: “every lyrical downbeat is attacked” as a *ranked
gap* — still true of us, but unmeasurable against the references until #1
below lands, and partly folded into 2 and 6.

---

## 5. Highest-conviction next five

Ranked by audible damage per unit of risk. Tags: **measurement** /
**priors** / **realize** / **renderer** / **closed-label**.

### 1. Score the melody, not the skyline — **measurement**, no allowlist

`scripts/compare-generated-vs-reference.ts` only. Split the reference MIDI by
track/hand and report melody register and occupancy separately from the
accompaniment; do the same for the generated `Score` (melody voice vs peeled
inner). Report `ret4` from the first *thematic* bar, not bar 0, so a pickup bar
does not dilute it.

Not music, but every item below is ranked on numbers this changes — it already
cost us a false Chopin win and an inflated Debussy miss. Cheapest thing on the
list and it re-grades the board. **Ship first.**

### 2. Beethoven lyrical archetype **plus a melody tessitura** — **priors** + **realize**

Accepting Music’s #1, with a correction that changes its scope: the archetype
alone will not fix it. Rendering the *committed reference plan* — the correct
labels — still lands at register **80.3** against the MIDI’s 62.0. The tune is
drawn high regardless of the plan, so `lyrical_song` needs a register target
reaching `melodyPitches`, not only a stormy→lyrical flip. Shipping the
archetype by itself buys a 2/4 meter and the same wrong octave.

Allowlist: none if the archetype rides existing globals.

### 3. `lift_on_return` must choose a hand — **realize**

The deepest finding in §3, and it subsumes Music’s #3. Two mechanisms behind
one label: ornament the RH over a constant LH (Chopin), or hold the RH and
thicken the LH (Beethoven). Includes the #48 return bug — take the **source
bar’s** rhythm rather than `lastRhythm`, and time-align `ornamentSourcePitches`
instead of index-clamping. Fold the leap cap in here; it is a clamp, not a PR.

Highest musical payoff, and the only item that makes a return *sound* like one.
Also the largest diff — worth splitting Chopin-side from Beethoven-side if it
runs long.

### 4. Route `pulsingChords` through `rhythmFor` — **renderer**

Zimmer’s same-figure chant, breath and 4-bar return all fail on one line
(`modernExtra.ts:70` draws its rhythm directly). Routing it through `rhythmFor`
with a memory key restores return and breath in one change, and bounds the
`insistent` branch that pins the summit for all sixteen bars.

Accepting Music’s #4 and promoting it: smallest diff on this list with a
clearly audible result.

**Glass is explicitly not in this item.** `minimalCells` is built to never
repeat; `hook_bars` asks it to. That is a decision for Music — either the Glass
cell returns and the additive process is capped, or Glass opts out of
`hook_bars`. Do not let a PR quietly pick one.

### 5. `notes_scope: singing_line | none` — **closed-label**, **needs allowlist**

Accepting Music’s #2 at #5. Real (Bach CV 0.00 — there is no tune to write),
but it only affects Guide, the showcase path, and it is the one item here that
needs a new closed field plus a Coder allowlist entry. Everything above is
renderer- or realize-local. Ship it once 1–4 have re-graded the board.

**Allowlist needs across the five: item 5 only.**

### Verdict on Music’s provisional 1–5

| Music | Verdict | Why |
| --- | --- | --- |
| 1. Beethoven lyrical priors | **Accept, →2, rescoped** | Correct target; archetype alone leaves the octave wrong (REFcod 80.3) |
| 2. `notes_scope` | **Accept, →5** | Real, Guide-only, and the sole allowlist cost |
| 3. Guide leap cap | **Reject as a slot** | #48 already took Chopin 17→13; worst leaps are on sample seeds, not argmax. Fold into 3 |
| 4. Zimmer same-figure | **Accept, →4, promoted** | One-line root cause found; best payoff per diff |
| 5. Laufey borrowed-iv | **Reject as a slot** | Cheap and correct, but one sonority. Ride it with any priors PR |

Two items Music did not rank are now **1** and **3** — the metric fix, and
`lift_on_return` choosing a hand. Both came out of reading the scores rather
than the board.

---

## 6. Honesty

- **No live Jev.** No key here. Guide/Line are fake closed picks through the
  production realize functions. Their absolute numbers are not Jev’s notes;
  the pre/post *deltas* are trustworthy because both runs used the same picks.
- `ret4` / `ret8` compare pitch-class sets per felt beat, and §2 shows they can
  be diluted by a pickup bar. Treat every `ret` number in this note as soft
  until item 1 ships.
- Reference RH/LH split is by MIDI **track**, which is Mutopia’s engraving
  layout, not a musical voice analysis. It is right for these four files
  (checked against the `.ly` staves) and would not generalise.
- Chopin RH attack counts are onsets in the upper track, so bars with
  hand-crossing or inner voices overstate the melody slightly. The 7.25 →
  12.5 → 15.25 trend is far larger than that error.
- Glass / Zimmer / Laufey / Fox have no MIDI and no sheet. Their rows are
  reference-plan JSON rendered through our own paths — a claim about what our
  labels imply, not about the recordings.
- n = 8 argmax + 24 samples + 8 reference-JSON realizes + 4 MIDI files. Not the
  192-piece FIDELITY sweep.

## 7. Reproducing

```text
npm ci
npx --yes tsx scripts/compare-generated-vs-reference.ts --out /tmp/post48.json
```

LilyPond sources were fetched from the Mutopia paths already recorded in
[`docs/ref-midi/public/README.md`](../ref-midi/public/README.md) (same
directories, `.ly` instead of `.mid`). They are read-only reference and are
**not** committed — the MIDI already in the repo is the redistributable
artifact, and adding `.ly` files would duplicate it under a second licence
footprint.

Do not merge. Coder merges when Music pings.
