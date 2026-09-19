# Reverse-labelled reference plans

Closed `CompositionPlan` sketches for every dial style in [`REFERENCE_PLAN_GAP.md`](../REFERENCE_PLAN_GAP.md).

**Why they are here.** The gap study’s inline JSON is the same payload, committed so a planner or renderer can load it without copying out of the markdown. `plan` is meant to parse with `parsePlan` (`src/plan/schema.ts`). Proposed labels that are **not** on the schema, and anything the enums cannot say, live in `notes` and `_stretch`.

**Living artists (Glass, Zimmer, Laufey, Fox):** JSON only. No MIDI. Harmony is *inferred* from published analyses or the musician’s own teaching — not a transcription.

Wrapper shape:

```json
{
  "id": "style-piece-slug",
  "piece": "Human title",
  "whyHere": "Why this file represents the dial",
  "evidence": "score | analysis | inferred | own_words",
  "midi": "docs/ref-midi/public/….mid or null",
  "plan": { "version": 1, "style": "…", "bars": [/* 4, 8, 16, 32 or 64 */] },
  "notes": "Honesty / how to read the sketch",
  "_stretch": ["proposed phrasing: …", "missing: …"]
}
```
