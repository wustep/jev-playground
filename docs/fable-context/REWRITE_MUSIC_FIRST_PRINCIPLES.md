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

A style is now one row of five fields in `src/render/styleVoice.ts` (accent, articulation, humanize, rubato, spacing) plus its harmony book. **Nothing in that row chooses a note.** Which notes to play is the plan's job; the row is only how they are played.

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

Glass, Laufey and Elijah Fox are back: a `STYLE_LABELS` entry, a five-field `StyleVoice` row, a dial theme, and their harmony books and priors from `main` put through the same v1 → v2 remap. The mechanical remap got two things wrong that measurement caught: it gave Glass `chain` form (no return) for music that *is* return, and it gave Fox no `florid` at all against a local reference running 16.4 attacks a bar — which also made his most typical piece sound exactly like Chopin's. A test now requires all eight argmax plans to differ on register / motion / accompaniment. Glass's 2-against-3 lean returns as a generic `rubato` value, not per-artist code.

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
- **Fox runs at 6.4 attacks a bar against "Wyoming"'s 16.4.** Deliberate: one 18-bar transcription shouldn't erase his slow chordal pieces.
- **Bach at 8.2 vs 11–12**: the chorale and sarabande variants pull the mean down; inventions and preludes alone are at 13.
- **Chopin's 8-bar period answers itself literally**, where Op. 9/2 dresses its very first answer. At 16 bars the dressed return arrives.
- **Clair de lune's reference plan sings 5 semitones high** (78.9 vs 73.9); `high` is still the nearer window.
- **Downbeats**: returns and non-statement bars still attack beat one. Ties across the barline would do more, but need cross-bar notes in the Score.
- **No keyed A/B** against live Jev.

