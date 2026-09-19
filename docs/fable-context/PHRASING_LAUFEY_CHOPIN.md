# Phrasing global, Chopin 12/8, Laufey bossa

Shipped 2026-09-19 against `REFERENCE_PLAN_GAP.md` items 1–2, plus Zimmer
same-figure layer (item 3). `hook_bars` shipped in a later pass — see
`HOOK_BARS_GUIDE_REALIZE.md`.

## `phrasing` (new global)

Closed: `on_the_beat | upbeat | breathing | long_breathed`.

| Id | Renderer |
| --- | --- |
| `on_the_beat` | No phrase-end rest, no pickup (perpetual / storm / pulse) |
| `upbeat` | One beat of air at the phrase end; pickup into the next downbeat |
| `breathing` | Lands early and leaves the last beat empty (no pickup) |
| `long_breathed` | Two beats of air, left empty |

On `GLOBAL_FIELDS` / `GLOBAL_FIELD_IDS` after `pedal`. Jev `globals` picks it
up automatically (same pattern as `arrangement` / `pedal`) — **Coder: recheck
the allowlist; no new op.** `parseGlobals` defaults from `character` when the
field is omitted.

Heuristic priors: lyrical → breathing / upbeat; perpetual / stormy →
`on_the_beat`; haze / stillness / Zimmer pulse → `long_breathed`.

## Chopin 12/8

`METERS.twelve_eight` already existed. Chopin `lyrical_song` (nocturne)
meter weights now peak on `twelve_eight` over 4/4 and 6/8. No new meter.

## Laufey `bossa_comp`

New texture. Bass on beat 1 and the *and* of 2; shells (3rd + 7th) on
partido-alto off-beats; sung tune on top. Favored on Laufey `lyrical_song`
and `warm_groove` (and a Fox `warm_groove` colour).

Major harmony book now *uses* borrowed iv and ii9–V13 in `phrases` / `heads`
/ `splits` / `loops` (the chord ids already existed; they were surprises or
unused).

## Zimmer same-figure layer

Renderer only: on `melody_over_ostinato` / `syncopated_ostinato` plus
`build` or `peak_then_bare`, `figureStep` keeps the written step. Density
still comes from `applyArrangement` (octave layer at 3, thin at 0). No new
allowlist label. Other textures still half/double their figure.
