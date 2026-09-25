# Rewrite: music first, labels second

2026-09-24. Branch `rewrite/music-first-principles`. This is what changed and why, written against [the modes zoom-out](ZOOMOUT_ASTRA_MODES.md) and [the post-48 pass](ZOOMOUT_POST_48.md), whose diagnosis it accepts and whose five ships it does in one go.

## The one thing that was wrong

**The renderer had no melody.** It had 23 texture functions, and each one invented a tune as a side effect of drawing its own figuration, with its own hardcoded pitch window. All 23 windows centred on MIDI 74–76.

Everything else followed from that. `character` could not change the melody because no code path connected a character to a note. `arrangement` could not change density on `rolling_nocturne` because that texture drew its own left hand and never consulted the label. The compare metric reported a left-hand skyline as a melody because nothing in the `Score` recorded which voice was the tune — so it had to guess, and it guessed wrong. And a plan could ask for Beethoven's low cantabile Adagio and get the same mid-treble line as everything else, because there was nowhere to put the word "low".

Measured against the committed public-domain reference MIDI, before:

| style | melody register | reference | melody onsets/bar | reference |
| --- | --- | --- | --- | --- |
| beethoven | **74.3** | **62.0** | **2.5** | **10.5** |
| chopin | 74.0 | 76.5 | **3.25** | **7.25** |
| bach | 67.3 | 69.1 | 12 | 12 |
| debussy | 66.3 | 70.8 | 5.5 | 6.5 |

## The model

Three steps, in this order, and the order is the argument:

1. **`writeMelody`** runs first, over the whole piece, alone. It owns the register (a plan field, a real MIDI window), the subdivision (a plan field, in attacks per beat), which bars bring an earlier bar back, and where the tune lands and rests.
2. **`writeAccompaniment`** is then handed the melody's floor and may not cross it. Five patterns.
3. **Expression** last: velocity, accent, rubato, pedal. It changes no pitches.

`Bar.treble[0]` is therefore the melody by construction, which is why the compare metric no longer has a heuristic in it.

## What the plan carries now

Eleven fields, down from fifteen, under one editorial rule: **a label that cannot be heard does not belong in the plan.**

Added — the three things the old schema had no way to say:

- `register`: `low` | `mid` | `high`. Windows calibrated from the reference MIDI's melody-track means (62, 69, 76.5), so each sits at the centre of one.
- `motion`: `sustained` | `walking` | `flowing` | `florid`, in attacks per felt beat.
- `accompaniment`: `sustained` | `broken` | `pulse` | `stride` | `counterline`.

Removed: `character` (12 values, one measured melody outcome per style), `texture` (23), `arrangement`, `opening`, `pedal` (derived from the accompaniment pattern), `phrasing` and `hookBars` (both folded into the phrase model), `defaultInstrument` (playback, not composition), and the per-bar `role` — a role is what the form says about a bar's position, and a plan that could contradict its own form was a plan the renderer had to defend against.

## Does a label reach the notes?

`scripts/label-reach.ts` re-runs the post-50 sweep. Holding everything else fixed, across all five styles:

| field | distinct melodies | distinct accompaniments | span |
| --- | --- | --- | --- |
| `register` | 3/3 | 3/3 | MIDI 58.6–79.0 |
| `motion` | 4/4 | 1–4/4 | 1.8–11.9 melody onsets a bar |
| `form` | 3–4/4 | 3–4/4 | — |
| `accompaniment` | **1/5** | **5/5** | — |

`accompaniment` producing one melody is the point, not a failure: changing what holds the tune up must not change the tune. Ceiling breaches — bars where anything under the melody reaches its lowest note — are **0** in every cell, and there is a test that keeps them there.

## Against the references, after

| style | register | reference | onsets/bar | reference |
| --- | --- | --- | --- | --- |
| beethoven | 64.0 | 62.0 | 5.75 | 10.5 |
| chopin | 76.8 | 76.5 | 7.75 | 7.25 |
| bach | 70.0 | 69.1 | 11 | 12 |
| debussy | 76.4 | 73.2 | 5.5 | 6.25 |

Register now tracks the references within about two semitones. Subdivision is right for Chopin, Bach and Debussy.

> **Retracted, 2026-09-24.** This section originally called Beethoven's onset density "the one still short" against Op. 13 II's 10.5 attacks a bar, and moved that reference plan to `florid`. The 10.5 was the metric: it counted every note-on in the upper-staff track, including the sixteenth murmur the right hand plays *under* the tune. The tune's top voice attacks 3.19 times a bar, at MIDI 66.3 rather than 62. See [the polish pass](#polish-pass-2026-09-24) below.

## The dial

This pass cut eight styles to five: Bach, Beethoven, Chopin, Debussy, Zimmer. The polish pass restored Glass, Laufey and Elijah Fox as table rows — see below.

A style is now one row of four fields in `src/render/styleVoice.ts` (accent, articulation, humanize, rubato) plus its harmony book. *(This said five, with `spacing`; no pattern ever read it — see [the structure pass](#structure-pass-2026-09-24).)* **Nothing in that row chooses a note.** Which notes to play is the plan's job; the row is only how they are played.

## One path

Jev chooses labels or the offline stub does, and `renderPlan` writes every note. The Jev op set drops six to three (`globals`, `phrase`, `score`). Gone: `JevPlanner.writeNotes` and its guide twin, `src/render/jevNotes.ts`, `src/plan/notes.ts`, the notes priors and continuity helpers, the `notes=` URL parameter, and the Planner × Notes control grid that made a listener guess which of them had written any given note.

Jev is asked for labels only. It is never asked for notes.

## What the rewrite cost

| file | before | after |
| --- | --- | --- |
| `src/render/textures/*` | 2,135 | — |
| `src/render/accompaniment.ts` | — | 262 |
| `src/plan/forms.ts` | 709 | — |
| `src/plan/phrase.ts` | — | 133 |
| `src/plan/schema.ts` | 693 | 515 (127 of them the chord table) |
| `src/planner/jev/requests.ts` | 684 | 334 |
| `src/planner/JevPlanner.ts` | 504 | 239 |

Net about −7,000 lines. 238 tests pass; `tsc` and `vite build` are clean.

## Bugs the rewrite surfaced

Three, all found by writing the new tests rather than by reading the old code:

- **No form ornamented its returns.** `period` answered itself once and literally; `arch` marked its *final* return `varied: false`, which is backwards — that return is the whole point of an arch.
- **`arch` at 8 bars returned nothing at all.** The quarter-based layout collapsed to A + departure with no reprise.
- **`summitCueHigh` could no longer discriminate.** Climax placement is derived now and always lands in the last third, so "is there a late climax" is true of every plan. Relatedly, `arrangementCueHigh` had to be gated on there being a singing line: without that, a two-voice counterpoint study in period form scored as high as an actual song.

A fourth came from looking at the running app rather than the tests: `sustained` attacked beat 0 and nothing else whatever the metre, so a long-note melody was always exactly one whole note a bar, and monotonous by the fourth.

## What is not done

- **No keyed A/B.** Everything here is the offline stub through the production renderer. A live-Jev listen at identical style, seed and bars is the release check, and it has not been run.
- **Zimmer has no reference MIDI**, so its row is unfalsifiable in the same way the three deleted styles were. It is kept for the drama pole, and that is a judgment, not a measurement.
- **`counterline` is thin.** It is a real second voice with contrary motion, but it does not imitate, so a Bach invention comes out as two lines rather than as a subject and its answer.

---

## Polish pass, 2026-09-24

Same branch. Keeps the melody-first model; adds no per-artist code.

### A metric correction first

`midiMetrics` read the reference melody as every note-on in the upper-staff track. For Op. 13 II that includes the inner sixteenths, so the tune looked like 10.9 attacks a bar at MIDI 62. Measured as a **top voice** — an attack counts only if nothing higher is still sounding over it — it is **3.19 attacks a bar at 66.3**. That retracts the Beethoven "gap" above, moves the `low` register window from [54,71] to [57,73], and returns the Op. 13 reference plan from `florid` to `flowing`. Rendered, it now lands at 65.1 / 3.5 against 66.3 / 3.19. `combinedSkyline` keeps the naive both-hands view on purpose: it exists to show the drift. Moonlight I is the case this cannot fix — its tune enters at bar 5, so its first bars' top line is the triplets.

### What the audit found and what changed

`scripts/audit-samples.ts` renders many seeds of every style and prints every metric beside every reference for that style.

| found | change | result |
| --- | --- | --- |
| One pitch struck 7 times running (a climax contour pressed on its ceiling; a short figure stretched by duplication on recall) | A line may strike a pitch twice, not three times; the guard sees across barlines. A blocked stutter-step turns around. | longest run 7 → 2–3 (3 = a cadence landing) |
| Ornamented returns came back at exactly the density they left (8.75 = 8.75 across 72 Chopin bars) | Fioritura: any note an eighth or longer may be split into sixteenths behind its arrival | returns 8.75 → 10.3; nocturne reference rises 7.25 → 10.6 |
| Returns started cold after the rest | A pickup at the end of the rest steps into the returning tune; half a beat of silence is kept | — |
| `counterline` never quoted the tune | First bar exposes the subject alone; the next answers it an octave below in its rhythm | — |
| Every tune attacked every downbeat (mazurka: 56%) | Where the accompaniment owns beat one — an invention's second voice, a dance bass — a fresh statement enters just after it. Silenced *after* the tune is written, so it removes notes and changes none. | Bach 95%, Chopin 98%, Laufey 97% |
| Every phrase end rested, including `open` ones | Only a cadence breathes; an open join runs on | Glass silent beats 9% → 4% (étude 0%) |
| Accompaniment density ignored loudness | Density follows velocity as well as role; full density doubles the bass an octave down | crescendos build texture |
| Zimmer never returned (`chain` everywhere) | sentence / arch | ret4 0.19 → 0.45 |
| Debussy drew `sustained` 7/12 | toward walking/flowing | 3.35 → 4.81 on/bar (refs 4.5–7.0) |

### Artists restored

Glass, Laufey and Elijah Fox are back: a `STYLE_LABELS` entry, a `StyleVoice` row, a dial theme, and their harmony books and priors from `main` put through the same v1 → v2 remap. The mechanical remap got two things wrong that measurement caught: it gave Glass `chain` form (no return) for music that *is* return, and it gave Fox no `florid` at all against a local reference running 16.4 attacks a bar — which also made his most typical piece sound exactly like Chopin's. A test now requires all eight argmax plans to differ on register / motion / accompaniment. Glass's 2-against-3 lean returns as a generic `rubato` value, not per-artist code.

### Reference coverage

Three public-domain Mutopia files were added so the variants with no reference have one: Chopin Mazurka Op. 6/1 (CC BY 3.0), Beethoven *Für Elise* (PD), Debussy Préludes I/4 (CC BY-SA 4.0). The mazurka moved Chopin's `dance` register from high to mid (top voice 69.1).

Living artists never enter the repository. Glass's Étude No. 6 and Fox's "Wyoming" are measured from `docs/ref-midi/local/` (gitignored) when present. Laufey (owned PDFs only) and Zimmer (nothing) remain gaps. The full table is in [`docs/ref-midi/public/README.md`](../ref-midi/public/README.md#living-artists-acquisition-status).

### After, 24 seeds × 16 bars

| style | register | ref | on/bar | ref | ceiling breaches |
| --- | --- | --- | --- | --- | --- |
| bach | 69.8 | 69.1–72.2 | 8.2 | 11–12 | 0 |
| beethoven | 70.1 | 66.3–71.9 | 4.0 | 3.2–4.2 | 0 |
| chopin | 74.7 | 69.1–76.5 | 6.7 | 3.1–10.6 | 0 |
| debussy | 74.6 | 70.8–74.3 | 4.8 | 4.5–7.0 | 0 |
| glass | 68.1 | 65.6 (local) | 4.9 | 6.0 | 0 |
| hans_zimmer | 70.1 | — | 3.6 | — | 0 |
| laufey | 70.1 | — | 4.3 | — | 0 |
| elijah_fox | 70.9 | 71.4 (local) | 6.4 | 16.4 | 0 |

`label-reach`: for every style, `register` gives 3/3 distinct lines, `motion` 4/4, and `accompaniment` one sung line with five distinct accompaniments.

### Still not done

- **No listening pass this round.** Chrome and Playwright were both unavailable, so the dial and sheet were not looked at; the dial CSS is the original 8-stop grid and unchanged.
- **Fox runs at 6.4 attacks a bar against "Wyoming"'s 16.4.** Deliberate: one 18-bar transcription shouldn't erase his slow chordal pieces. *(Now 7.7; see [the ear pass](#ear-pass-2026-09-24).)*
- **Bach at 8.2 vs 11–12**: the chorale and sarabande variants pull the mean down; inventions and preludes alone are at 13.
- ~~**Chopin's 8-bar period answers itself literally**, where Op. 9/2 dresses its very first answer.~~ Fixed in [the ear pass](#ear-pass-2026-09-24).
- ~~**Clair de lune's reference plan sings 5 semitones high** (78.9 vs 73.9).~~ Now +2.1; see [the ear pass](#ear-pass-2026-09-24).
- ~~**Downbeats**: returns and non-statement bars still attack beat one.~~ The Score has cross-bar ties now; see [the ear pass](#ear-pass-2026-09-24).
- **No keyed A/B** against live Jev.


---

## Structure pass, 2026-09-24

A code review of this branch, not a listening pass. Every change below leaves plans, Jev requests and rendered notes byte-identical across 480 heuristic plans and 192 fake-Jev plans, except the UI fix, which touches no notes.

### Fixed

- **The stand stayed stale after a planner switch.** The one-path commit dropped the effect that clears `plannerDirty` when a plan lands, so choosing another Planner and pressing Generate left Play and MIDI disabled. Restored in `src/music/MusicApp.tsx`.
- **One phrase catalog.** The server built each phrase question's criteria from `formSlots` + `bookFor`, and `JevPlanner` rebuilt the same catalog on its own to validate the answer. On `main` those two drifted (#58). `slotCatalog` in `src/plan/harmonyPhrases.ts` is now the only way either side gets a slot's options. A test drives `JevPlanner` through the server's path (JSON, `parseOp`, `buildRequest`) for every style, form, length and mode, answering with the last option offered.
- **`spacing` was never wired.** Every pattern ignored it, so the style row is the four fields that are applied. A per-style left-hand reach would be a sound change.
- **`counterline` is not exempt from the ceiling.** Its register is capped at the tune's floor, and it never reached the tune in 17,280 sampled counterline pieces (86,400 across all five patterns, all at zero). The docs called it exempt and the ceiling test skipped it. The test now covers all five patterns.
- **The treble staff is the tune's.** Accompaniment patterns can no longer return treble voices. None did, but one that did in a bar where the tune was silent would have become `treble[0]`, which every metric reads as the melody.
- **A silent bar's accompaniment** read `memory.melodyLast`, which after the melody pass is always the piece's last note. `renderPlan` passes the tune's last pitch before the bar instead. It never fires in the sweep.
- The cadence-split rule is written once (`splitBarOf`, `approachesInto`), both planners get typed globals from `parseGlobals`, and helpers orphaned by the texture and notes-mode deletions are gone.
- A test walks the `/api/jev` music imports and fails on a relative import without `.js`.

### Left for the music follow-up

- The four open ear flags above: Fox density, Chopin's literal first answer, Clair de lune's register, and downbeats on returns. *(Taken up in the ear pass below.)*
- `PhraseBuild` still names `duplicate`, `loop` and `pedal`, and the harmony books still carry `loops` and `pedals`, but no form's slots reach them. Glass's chord cycles never play. Removing them would shift the stub's random stream and its style-match vocabulary, and whether a loop form comes back is a musical call.
- `counterline` answers whatever a phrase's first bar played, a return or a contrast bar included, while its doc says it answers a fresh statement. Which one is right is a musical call.

---

## Ear pass, 2026-09-24

The four ear flags left after the polish pass, in the order the ear ranked them. Every change is a table row, the phrase model, or the Score; no per-artist code. Measured with `scripts/audit-samples.ts --seeds 24` (16 bars) and `scripts/compare-generated-vs-reference.ts --summary`. Still no listening pass.

### Chopin's first answer is dressed

Op. 9/2 answers its question at 12.5 attacks a bar against the question's 7.25, and its final return runs at 14.5. The generated period answered note for note: at 16 bars, 26 of 48 Chopin first answers were exact copies.

- `StyleVoice` gets an `answers` column. `dressed` decorates every return; `literal` saves the decoration for the form's late return. Chopin is the one `dressed` row. It lives in the style table because dressing a reprise is a player's habit as much as a composer's. Chopin wrote extra fioriture for Op. 9/2 into his pupils' copies.
- The dressing changed for every style. It used to re-derive the weak notes by interpolating between the strong ones. That lost half the tune, and rounding small steps to none produced pitches struck twice (E♭ E♭ F F G G). Now every note of the tune sounds on its own onset, and the quick notes split off behind it turn around it or run into the next one (`fioritura` in `src/render/melody.ts`). No pitch is ever struck twice.
- A dressed return that the random draw left undecorated now turns its longest note, so a dressed return can't come back as a clone.

Chopin returns that clone their source: 28 of 102 → 1 at 16 bars, and 8 of 54 → 1 at 8 bars. The one left is a florid bar made entirely of sixteenths, with nothing long enough to turn. Op. 9/2's reference plan: 7.75 → 9.88 attacks a bar (MIDI 10.63).

### The tune holds over a barline the accompaniment strikes

Measured at each barline, the references mostly strike the downbeat. The nocturne, the Adagio, Clair de lune, *Für Elise* and "Wyoming" strike 14 or 15 of 15. The exceptions are exactly the two pieces whose accompaniment owns beat one. BWV 772 holds its top voice over 7 of 15 barlines while the second voice strikes. The Op. 6/1 mazurka holds 6 of 15 over its dance bass. So this extends the rule the rewrite already had for those patterns, where a statement enters after the downbeat, instead of adding a style column.

- A return enters where its statement entered. Returns recalled the rhythm from before the statement's opening was silenced, so under `counterline` and `stride` every return struck the downbeat its statement had left to the accompaniment. No upbeat now leads into a downbeat the tune doesn't play.
- Under `counterline` or `stride`, inside a phrase, the last note of a bar may ring through the first slot of the next bar (60% of eligible barlines). It has to be a tone of the new chord, or a suspension that steps into the note after it. No pitch changes: the held note takes the struck note's place.
- Score notes gain `tied`. `timeline()` lengthens the held note instead of striking it again, so playback and MIDI export both hold it. The sheet draws the tie, as two halves across a system break. Metrics count it as held, the way they already treated reference MIDI.

| style | downbeats struck, before → after | references |
| --- | --- | --- |
| bach | 95% → 77% | invention 56%, prelude 0% |
| chopin | 98% → 91% | mazurka 56%, nocturne 100%, prelude 94% |
| laufey | 97% → 86% | — |
| elijah_fox | 97% → 95% | "Wyoming" 94% |
| beethoven, zimmer | 100% → 100% | Op. 13 II 100% |

### The `high` register comes down two semitones

Clair de lune's reference plan sang 5.4 semitones sharp. Every plan labelled `high` did the same (nocturne +1.2, Op. 28/4 +6.4, arabesque +3.9), while `mid` and `low` plans landed within about a semitone. The window was centred on the nocturne's 76.5, but a tune rendered in it sits above its centre. I swept shifts of −1 to −3, and `high` moved from [68, 85] to [66, 83]. Now the nocturne renders at −0.8, the arabesque at +1.6 and Clair de lune at +2.1. Debussy's generated mean went 74.6 → 73.2 against references at 70.8, 73.9 and 74.3, and its clair-like `hazy` variant renders at 72.5 against Clair de lune's 73.9. Its priors stay as they were.

### Fox plays his sixteenths more often

The rhythmic fact from his own teaching is the displacement lesson: continuous sixteenths regrouped 5+5+6 and 7+5+4, sixteen to the bar. "Wyoming" is exactly that in 4/4. His `perpetual` variant took the base metre, so more than half its pieces were in 3/4 or 6/8. As table rows, `perpetual` is now 4/4 (85%) and florid (90%) and is weighted 24 instead of 16, and `hazy` leans florid (60%). `still` and `singing` keep his slow chordal pieces.

Per variant, over 200 seeds: `perpetual` 9.3 → 12.4 attacks a bar, `hazy` 7.8 → 9.2. The audit mean went 6.34 → 7.66 against 16.4. The rest of the gap is the `florid` rate itself, 3.5 a beat, which every style shares. Raising it would turn every florid line into an unbroken sixteenth wall.

### Left alone

- **Bach's mean density.** Where Bach has a reference, the genre matches it: preludes render 11.7 attacks a bar against WTC I/1's 12, and inventions 10.0 against BWV 772's 11.1. The mean is low because chorales (4.5) and sarabandes (5.8) move slowly, which is right for them, and none of them has a reference. Re-weighting how often Bach writes a chorale would be a guess.
- **Fox's last 4 attacks a bar.** See above. *(Now 2.3; see the motif pass below.)*
- **No listening pass, no keyed A/B.**

---

## Motif pass, 2026-09-25

The earlier passes tuned register and density, and the audit shows both close to the references. What they did not measure is how the tune moves from note to note and bar to bar. There the renderer was weakest:

- **Walking lines arpeggiated.** Every beat counted as strong, so a one-note-a-beat tune snapped every note to a chord tone.
- **Bars had no rhythmic idea.** Every bar that did not return drew its rhythm fresh, beat by beat. A `sequence`, which the stub plans as the bar before on a new harmony, came out as an unrelated figure.
- **Florid lines trilled** instead of running.
- **Beats were divided uniformly**, so a third of two-note beats were Scotch snaps.
- **Closes rarely stepped into the tonic.**

Each fix below is a rule in `src/render/` or a style-row value. None of them is per-artist code.

| measure (heuristic stub, sampled) | `main` | now | references |
| --- | --- | --- | --- |
| walking lines, moves by step | 38% | 55% | 52–70% |
| sustained lines, moves by step | 41% | 49% | — |
| florid bars with a six-note two-pitch trill | 135 / 752 | 3 | — |
| flowing bars with the same | 22 / 1104 | 2 | — |
| two-note beats that snap (16th, dotted 8th) | ⅓ | 0 | 0 in every reference |
| closed cadences approached by step | 28% | 72% | — |
| closes restriking their approach | 15% | 6% | — |
| broken-figure bars with a dropped note | up to 23% | 0 | — |
| Fox `perpetual`, attacks a bar | 12.4 | 14.1 | "Wyoming" 16.4 |
| augmented seconds across scale × chord × key | 1834 | 10 | — |

Against the `main` audit (`scripts/audit-samples.ts --seeds 24`), no style's mean register moves more than 1.2 semitones and no mean density more than 0.8 attacks a bar. Ceiling breaches stay at 0. `accompaniment` still sings one tune (label-reach is unchanged from `main`).

### What changed

- **Stress, not beats** (`stressed` in `melody.ts`). Chord tones are required on the downbeat, on the half-bar of a duple or quadruple bar, where a second chord arrives, and on any note held two beats or more. A fresh bar's contour starts where the line left off, and its span fits the notes that carry it.
- **Figures** (`figureBetween`). A bar faster than the beat is a note on each beat along the contour, with runs and turns between: every move a step or a skip, never a pitch struck twice. A bar tends to repeat one figure on every beat.
- **The phrase's idea** (`development`). A sequence repeats the bar before: always its rhythm, and its figure too, moved by the root, when the contour matches. A continuation or the climax keeps the opener's rhythm, whole or its first half. In a chain, each phrase's opening grows from the last. JevPlanner now gives a sequence its model's contour, as it already did for returning bars, so live pieces get the same sequences the stub does.
- **Lilt** (`StyleVoice.lilt`). The share of dotted two-note beats is measured where there is a reference: BWV 772 7%, Op. 13 II and Préludes I/4 none, Op. 6/1 45%. Laufey's half-bar anticipations rest on the style notes. Fox gets a run rate of four a beat and his 5+5+6 / 7+5+4 accents. Glass never dots.
- **Perpetual motion.** A florid line arrives at an inner cadence on the downbeat, holds a beat, and runs on. A closed arrival is pinned to the tonic before the run is written.
- **Cadences.** The bar before a close ends a step from the tonic (2̂ or 7̂, a chord tone where stressed), and the close lands on the tonic nearest it.
- **Two scale bugs that sounded at those cadences.** In a split bar, passing notes now come from the second chord's scale, so a minor i6/4–V7 bar no longer runs B♭ against B. Bending to a chord no longer leaves an augmented second: melodic minor under a leading tone, a lowered seventh over a borrowed sixth.
- **Broken figures** stack whichever inversion fits under the tune, instead of dropping the tone that crosses its floor.

### Left alone

- **The stub score.** The rewrite (#56) deleted the `MusicApp` effect that asked for a style match after each plan landed, together with the notes-mode effect above it (`// Optional style-match scoring` in `git show 0290395 -- src/music/MusicApp.tsx`). Only Best sets `matches` now, so after Generate or a dial click every style reads "…" under the "stub score" tag. That is Coder's plumbing, and this pass does not touch `MusicApp`, the planners' `score()` or `/api/jev`.
- **Bach chorale density**, for the reason above.
- **Accompaniment density per style.** Bare-bass bars under soft Debussy (10%) and Zimmer (6%) match Clair de lune's 1.25 left-hand attacks a bar and Zimmer's drops to bare. The generated-vs-reference left-hand counts are confounded by which staff the references put their inner voices on.
- **Dressed returns** still use `fioritura`, tuned in the ear pass. All three remaining florid trills are there, and in Chopin's returns a turn around one note is arguably the ornament doing its job.
- **No listening pass, no keyed A/B.** The dial and sheet were checked in headless Chrome (the sheet engraves every style in every metre, which a test now covers), but nothing was listened to.

### Ear-check

At the same seed, on the Heuristic stub and then on live Jev:

- **Laufey, Beethoven, Zimmer:** walking and sustained tunes step, and Laufey anticipates beat three.
- **Bach:** a period's bars 9–11 are one figure three times on three harmonies, and inventions run instead of trilling.
- **Chopin** in a minor key: the V half of a cadence bar has its leading tone, and the close steps into the tonic.
- **Elijah Fox:** Generate until the plan shows `florid`. The sixteenths should not stop at bar 4 or 8, and should accent 5+5+6 then 7+5+4.
- **Glass:** dead-even rhythm.
