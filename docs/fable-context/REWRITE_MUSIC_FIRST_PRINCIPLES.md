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

Register now tracks the references within about two semitones. Subdivision is right for Chopin, Bach and Debussy. **Beethoven's onset density is the one still short**: the Op. 13 Adagio's 10.5 attacks a 2/4 bar are 32nd-note figuration over a slow pulse, and the `florid` rate (3.5 a beat) does not reach it. Raising the rate would over-drive every other style, so the honest fix is a fifth motion value or a tempo-aware rate; neither is in this branch.

## The dial

Eight styles to five: Bach, Beethoven, Chopin, Debussy, Zimmer. The four with committed reference MIDI can be measured; Zimmer holds the drama pole. Glass, Laufey and Elijah Fox are gone — no references, and their priors were the most costume-like.

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

- **Beethoven's subdivision**, above. The clearest remaining gap against a reference.
- **No keyed A/B.** Everything here is the offline stub through the production renderer. A live-Jev listen at identical style, seed and bars is the release check, and it has not been run.
- **Zimmer has no reference MIDI**, so its row is unfalsifiable in the same way the three deleted styles were. It is kept for the drama pole, and that is a judgment, not a measurement.
- **`counterline` is thin.** It is a real second voice with contrary motion, but it does not imitate, so a Bach invention comes out as two lines rather than as a subject and its answer.
