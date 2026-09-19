# `hook_bars` global + Guide realize (rests / returns)

Shipped 2026-09-19 against `GENERATED_VS_REFERENCE.md` items 1 and 4
(Guide realize-only), plus optional lyrical breath on the code path.

## `hookBars` (new global)

Closed: `2 | 4 | 8`. How many bars of the opening idea come back in the
skyline. Independent of `form` so a 16-bar period can still be a 4-bar
nocturne A, or an 8-bar Adagio theme said twice.

| Id | Renderer |
| --- | --- |
| `2` | Short cell — only the opening hook returns |
| `4` | Four-bar cell or phrase (Glass/Zimmer loops; Chopin A) |
| `8` | Full eight-bar theme (Beethoven lyrical / Pathétique-like) |

On `GLOBAL_FIELDS` / `GLOBAL_FIELD_IDS` after `phrasing`. Jev `globals`
picks it up automatically — **Coder: recheck the allowlist; no new op.**
Question id is `hookBars`; options are the strings `2`, `4`, `8`.
`parseGlobals` defaults from `form` + `character` when omitted.

Heuristic priors: Beethoven `lyrical_song` → 8; Glass/Zimmer loops → 4;
vamps / mosaic / short hooks → 2; Chopin lyrical stays 4.

`themeSources(form, bars, hookBars)` and `formSlots` read it. Omitted,
today's layout is unchanged (loop hook 2, singing phrase 3 bars up to
the cadence). `4` makes a loop cell return whole. `8` on a 16-bar
singing form is the 8-bar theme twice.

## Guide realize (no new op)

The `notes` op is unchanged (`mode: guide` still asks `figure` + `goal`).

- Rest slots / figure rests **vacate a felt beat** so occupancy can mark
  it silent (was: rest sliver under a long tone → 0 % silent, 16/16
  downbeats).
- Theme-return bars **ornament the source melody** (keep contour, neighbor
  one weak slot, snap strong beats to the later chord) instead of
  re-realizing a new figure+goal (Chopin Guide `ret4` 0.75 → 0.25).
- Q1: accompaniment stays with `renderPlan`.

## Code-path breath

`breathing` / `long_breathed` leave the phrase-end beat(s) empty.
`upbeat` still writes the pickup.
