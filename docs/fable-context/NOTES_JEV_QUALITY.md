# Notes:jev quality (post memory + bass)

Fable, 2026-09-19. Follow-up to PR #38 (melody memory + closed bass). Stephen: note outputs still didn’t feel great after that landed.

## What changed

1. **Post-realize voice leading (code).** After Jev picks closed degrees, `realizeJevNoteChoices` snaps each sounding pitch to the nearest legal spelling of that degree’s pitch class, walking from `last_sounding` MIDI and then from note to note inside the bar. Contrast / climax / surprise skip the snap and keep the degree’s octave hint. **Degrees stay Jev’s plan.** Debug: the notes exchange shows Jev’s picks; `phrase.notes` (and the score) are the realized spelling.

2. **Richer notes state / wording.** The notes request now carries character, texture, arrangement, style brief (when on), `melody_motion`, and a `motif_echo` hint. Questions stress motif echo from `melody_so_far`, phrase role, and “no random leaps.” Lyrical / song characters get rhythm-criteria text that prefers a long tone + a rest.

3. **Sample priors (light).** When `pick=sample`, code blends Jev’s probabilities with a proximity prior (degrees near the previous sounding degree) and, for lyrical characters, a long-tone rhythm prior. Mix is ~0.32. Argmax is still raw Jev. The debug trace still shows Jev’s numbers.

4. **Bass.** Two more one-Choice patterns: `alberti` (broken bass–fifth–third–fifth) and `afterbeat` (rest on the beat, tone on the and). Realization voice-leads from the previous bar’s last bass pitch.

5. **Tiny variation.** If two consecutive *new-material* bars pick nearly the same degrees, the second is nudged by one scale step. Theme returns are untouched.

No new op. No free-text pitches.

## What is still hard

**Parallel Choices.** `pitch_1..4` (and rhythm vs pitches vs bass) still run in one POST and cannot see each other. Voice leading can only move register, not pick a better degree. Priors can only tilt a sample. A bar whose four marginals are tonic / leading / tonic_high / dominant_low will still be that tune, just in a closer octave. Theme returns help; new-material bars can still jump in *scale-degree* space. The honest fix is sequential questions or a closed motif/contour Choice — both cost latency or schema. This cut stays on-thesis: labels in, code spells.
