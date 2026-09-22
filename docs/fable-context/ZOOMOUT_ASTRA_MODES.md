# Zoom out: one Jev path for Music

2026-09-22. Decision memo for Music. Read against [the post-50 pass](https://github.com/wustep/jev-playground/pull/51), [Notes:jev quality](NOTES_JEV_QUALITY.md), [the reference-plan gap](REFERENCE_PLAN_GAP.md), and the current Planner and Notes paths. This is a proposal, not an implementation or a new listening test.

## Verdict

**Yes, collapse the user-facing Jev modes.** Keep one Jev choice alongside the code baseline. In that path, Jev chooses the closed plan and, only where a singing line exists, a closed figure and harmonic goal. Code realizes the actual line and accompaniment. Do not offer "Jev plans," "Jev guides," and "Jev writes the line" as three equally good ways to make a piece.

This is a product decision with an audio dependency. Hiding the switches today would make the page simpler but leave Beethoven high, Chopin under-subdivided, and Zimmer on the wrong texture. The five ships below make the one path worth showing.

## Why both promises still disappoint

Ranked by how much they explain the sound, then the cost of presenting it:

1. **Labels do not reach the singing voice.** Planner=Jev can choose a plausible `character`, `arrangement`, or `hookBars`, yet the renderer may produce the same tune. The post-50 sweep found one melody outcome for all 12 `character` values in each of five styles. `arrangement` changed no melody outcome; it only affects left-hand density, and on `rolling_nocturne` did not change that either. `hookBars` was inert on Glass and on Beethoven with truthful labels. Every measured texture's `melodyPitches` window centres at MIDI 74–76. Beethoven's Adagio melody is 62; even four corrected plan labels render at 75.8. This is the main reason "Jev plans" can be semantically right and still sound wrong. The planner also makes real mistakes: Beethoven and Debussy argmax hit only 6 and 5 reference labels, and Zimmer picks `pulsing_chords` instead of `melody_over_ostinato`. Fix reach before asking Jev to choose more labels.

2. **Realization cannot yet honor the melody intent.** Notes:guide asks Jev for a figure and goal, then code writes a line over the existing score. Notes:line asks for a closed four-slot rhythm and degrees; code voice-leads and overlays them. Neither gives Jev a way to ask for Chopin's subdivision and ornamented return over a constant left hand. The code nocturne attacks mostly ticks 0, 6, 12, 18 in 12/8: 3.5 then 3.75 melody onsets per bar, against the MIDI's 7.25 then 11.75. Guide's return uses the *previous* bar's rhythm with the source bar's pitches, and its overlay can leave accompaniment sounding through a supposed melody rest. The line path can smooth a chosen degree, but four slots and a proximity prior cannot supply phrase structure or a low register target. Guide also invents a melody on Bach's prelude: the reference figure track attacks 0/16 downbeats, while Guide attacks 16/16. This explains why "Jev plays" can sound bad even if its closed choices look sensible in Debug.

3. **The UI sells implementation branches as musical modes.** Today Planner selects heuristic or Jev; Notes independently selects Code, Guide, or Line, with Guide and Line available only in Debug and with live Jev. A listener must infer what combinations mean, whether the shown plan or the overlay made a note, and why selecting Notes changes Debug and can re-request bars. The Notes labels already clip at 390 px in the offline QA pass. This is less important than the music, but it makes weak outputs harder to diagnose and gives the experimental Line path a product promise it has not earned.

The post-50 pass did **not** call live Jev: it fed fake closed picks through the production Guide and Line realize functions. Its causal findings about label reach and code paths stand. It does not measure how often a keyed Jev would pick each note choice. Stephen's listening report is the reason to make this decision; the local evidence identifies what to fix.

## The single path

| Listener choice | Jev chooses | Code realizes | Visibility |
| --- | --- | --- | --- |
| Code | No live choices; heuristic plan | Score and audio | Baseline in Music |
| Jev | Closed character, globals and phrase/bar labels; a figure and harmonic goal only when `notes_scope` says there is a singing line | Register, rhythmic slots, rests, pitch spelling, thematic return, inner voices and accompaniment | One choice in Music, live availability shown plainly |
| Debug comparisons | Current Guide-only and four-slot Line experiments | Existing realize paths | Debug panel and legacy URLs, clearly marked experiments |

The one Jev path should not blindly overlay every bar. A closed `notes_scope: singing_line | none` lets the code leave Bach-like figures and Glass cells alone. On a singing-line bar, figure and goal are *intent*, not four preselected pitches. Code must make that intent audible through the same melody register, subdivision, and return logic used by the baseline. Keep the plan JSON and per-decision trace in Debug so Music can tell whether a failure came from a wrong pick or an unresponsive renderer. Preserve existing `notes=guide|line|jev` URLs for comparison, but remove Guide and Line as peer choices in the main Music controls.

Do the audio work before presenting this as a quality upgrade. Until then, a single Jev control can honestly mean "Jev chooses the plan; code plays it," with note experiments in Debug. The target path adds figure and goal once they demonstrably improve the singing line. A keyed A/B against Code, with identical style, seed and bars, is the release check; the local fake picks are insufficient to claim that win.

## Next five ships, in order

| # | Ship and owner | What proves it landed | Allowlist |
| --- | --- | --- | --- |
| 1 | **Plan-controlled melody register** (`renderer`). Carry a low/mid/high tessitura or equivalent closed plan intent through `BarContext` into `melodyPitches` and the Guide spelling window. Start with Beethoven's truthful plan. | Its Adagio line moves toward MIDI 62 without moving Chopin's already-correct 76.4 away from 76.5. A character label must change sounding notes, not just the planner prior. | One new global question if `register` is exposed to Jev; none for an existing-label mapping. Prefer the least new vocabulary that reaches both code and Guide. |
| 2 | **A real right-hand phrase and return** (`renderer` + `realize`). Subdivide the 12/8 nocturne within dotted beats; on a return, preserve strong-beat pitches and ornament weak slots over the same left-hand figure. In Guide, take the source bar's rhythm, align source pitches in time, and keep a chosen rest clear of treble accompaniment. | Chopin's early-to-return melody onset density rises instead of 3.5 → 3.75, with recognizable source pitches and stable LH density. The rest is audible, not merely present in `phrase.notes`. | None if realized from current form, meter, arrangement, and Guide choices. |
| 3 | **Fix the highest-yield texture prior** (`priors`). Make Zimmer's "Time" plan prefer `melody_over_ostinato`; correct the reference plans' explicit `phrasing`, `hookBars`, and Debussy opening values so defaults are not reported as curated labels. Keep the `pulsingChords` rhythm-routing repair as a follow-up for pieces that should use that texture. | Zimmer's one-label swap already changes silence 11% → 33% and downbeats 15 attacked / 1 silent → 6 / 9; verify the live or stub plan picks it. The refreshed files agree with their own stretch notes. | None for existing globals. |
| 4 | **Give notes a scope** (`closed-label`). Add `notes_scope: singing_line | none` to the Jev intent, with a code policy fallback for known non-melody textures. Do not write a melody over Bach's prelude figure or Glass's cells. | Bach's 0/16 reference figure downbeats no longer become Guide's 16/16 sung downbeats; lyrical styles still receive a line. | **Required:** new closed question and Coder allowlist entry if Jev selects it. No new op or free-text pitches. |
| 5 | **Collapse the Music control** (`UX`). Show Code and Jev as the two listener choices; put Guide and Line A/B, traces, and legacy URLs in Debug. Make the rendered source and any fallback visible. Run keyed same-seed listens only after 1–4, including Bach, Beethoven, Chopin, Zimmer, and a song style. | One control describes who chooses and who realizes. A listener can hear the one Jev path and locate the causal choices without guessing a Planner × Notes combination. | None. |

The ordering favors the structural register and phrase failures over a cheap prior swap because a better plan cannot reach those two gaps. Ship 3 as a small independent change if it can land sooner. The reference-plan refresh is bookkeeping within 3, after the renderer contract is settled; it is not a separate claim of better sound. Glass's `minimalCells` versus `hookBars` contradiction needs an explicit Music choice: repeat a cell or mark that texture exempt. Do not hide the contradiction with a score metric.

## Take on the post-50 five

| Post-50 item | Decision here |
| --- | --- |
| 1. Plan-settable register | **Keep at 1.** It is the clearest counterexample to "the right label fixes it." Reach both code and the Guide line; test Beethoven and Chopin together. |
| 2. Ornament on return | **Keep at 2 and widen to subdivision and Guide realization.** Chopin's first statement is already too sparse. An ornament pass over four dotted-quarter attacks would decorate the wrong skeleton. |
| 3. Zimmer texture prior | **Keep at 3.** It is a cheap, measured breath win. `ret4` remains zero after the swap, so do not call it a complete Zimmer fix. |
| 4. `notes_scope` | **Keep at 4, required for the collapsed path.** A single mode must decline to sing when the reference has no line. This is the certain Coder allowlist change. |
| 5. Refresh reference plans | **Accept, fold into 3.** Seven old JSONs omit `phrasing` and `hookBars`; Chopin's default even contradicts its stretch note. Correct the fixture truth without treating that edit as an audible ship. Use the freed slot for the Music control and keyed A/B. |

Evidence limit: the post-50 label sweep used one seed, 16 bars and five styles. `opening` and `pedal` may act outside that measured window. Living-artist rows lack MIDI or sheet references. These limits temper extrapolation, but they do not make the identical `character` outcomes or Beethoven's unreachable register a UI problem.
