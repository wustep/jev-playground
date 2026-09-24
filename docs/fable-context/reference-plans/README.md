# Reverse-labelled reference plans

Closed `CompositionPlan` sketches for every dial style in [`REFERENCE_PLAN_GAP.md`](../REFERENCE_PLAN_GAP.md).

**Why they are here.** The gap study’s inline JSON is the same payload, committed so a planner or renderer can load it without copying out of the markdown. `plan` is meant to parse with `parsePlan` (`src/plan/schema.ts`). Anything the enums cannot say lives in `notes`.

**Migrated to schema v2.** These were labelled against the old fifteen-field plan. `character`, `texture`, `arrangement`, `opening`, `pedal`, `phrasing`, `hookBars` and the per-bar `role` are gone; `register`, `motion` and `accompaniment` replace them, read off the score and — where a MIDI reference exists — off its measured melody register and onset density. Op. 13's Adagio is `low` / `florid` because its melody track averages MIDI 62 and 10.5 onsets a 2/4 bar, not because a label seemed apt. The `_stretch` lists are gone with the fields they were asking for.

**Living artists (Glass, Zimmer, Laufey, Fox):** JSON only. No MIDI. Harmony is *inferred* from published analyses or the musician’s own teaching — not a transcription.

Wrapper shape:

```json
{
  "id": "style-piece-slug",
  "piece": "Human title",
  "whyHere": "Why this file represents the dial",
  "evidence": "score | analysis | inferred | own_words",
  "midi": "docs/ref-midi/public/….mid or null",
  "plan": { "version": 2, "style": "…", "bars": [/* 4, 8, 16, 32 or 64 */] },
  "notes": "Honesty / how to read the sketch"
}
```
