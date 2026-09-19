# QA pass and ranked improvements

Grok, 2026-09-19, branch `cursor/stale-sheet-settings-99f6` (after #42). Browser pass of `/music/` and `/trolley/` on the offline stub — **no `TYPESAFE_API_KEY` in this environment**, so live Jev, Notes:guide, and Notes:line were exercised only as disabled states.

Part A of this PR (stale-sheet UX) is the shipped code. This note is the overall pass: what broke, what was already fixed here, and the next 10 bets with payoff — not a laundry list.

---

## Environment

- Local Vite (`npm run dev`) at `http://127.0.0.1:5173`
- `GET /api/jev` → `{ available: false }`
- Planner = Heuristic stub; Notes = Code writes the tune; Guide/Line and Jev planner options disabled with “(no key)”
- Headed Chromium. `npx tsc --noEmit` clean. `npx vitest run` — 26 files, 264 tests.

---

## Part A — stale-sheet UX (verified)

Changing controls that no longer match the piece on the stand now uses the same pending treatment as a dial-tab swap.

| Action | Expected | Result |
| --- | --- | --- |
| Debug on, Notes stays code | Sheet stays live | Pass — no `is-stale`, Play enabled |
| Seed ≠ `generated.input.seed` | Mute + disable until Generate, or until the seed is restored | Pass — `is-stale`, `aria-busy`, frame opacity 0.45, `pointer-events: none`, Play/MIDI/seek disabled, status `Settings changed — Generate to apply` |
| Restore original seed | Live again without Generate | Pass |
| Decide-by sample → argmax → sample | Stale, then live | Pass |
| Style brief on → off → on | Stale, then live | Pass |
| Planner / Notes:guide\|line with no key | Disabled, not a false stale | Pass — `disabled` on the options; Debug-off + leftover `notes=guide` still treats the path as code |
| Bars 16 → 64 | Stale immediately, then a new stub plan | Pass — heuristic settles in ~80 ms so the mute is a flicker; status `Ready — 64 bars` |
| Dial switch / Generate / Best | Same mute while in flight | Pass |

Bars is treated as structural (same as a dial cache miss): restore a same-length cache hit, otherwise stub-plan. Planner only dirties when the user changes the select — `detectJev` auto-select and dial/boot stubs stay live.

---

## Bugs found

No blockers. Nothing in this pass needed a drive-by product fix beyond Part A.

| Sev | Where | Repro | Expected | Actual | Notes |
| --- | --- | --- | --- | --- | --- |
| Medium | `/music/` desktop, 64 bars | Generate or Bars → 64, stay on a wide desktop viewport | Play and the plan stay reachable while reading the piece | The stand is the full engraved height (~2k px canvas). Play and the plan sit at opposite ends of a long document | Mobile already clamps `.sheet-frame` to `min(68vh, 620px)` and scrolls inside. Desktop does not. Follow-the-playhead still works (document scroll). Not introduced here. |
| Low | `/music/` mobile, Notes | 390 px wide, Notes = “Code writes the tune” | The selected mode is readable | The `<select>` truncates to “Code writes the tu…” | Long labels next to Planner in a 2-column grid. Guide/Line will be worse. |
| Low | `/music/` Best vs Planner | (code) Best always samples the heuristic planner | The Planner select should not imply the winner was Jev-planned | After Best, `trace.planner` is heuristic. If the user had switched Planner to Jev, Part A *clears* `plannerDirty` on the new plan identity, so the sheet is live while the select still says Jev | Same quiet-stub rule as a dial click. Honest, but the select lies. |
| Low | `/music/` style cache | Bars 16 → 64 on Bach after a 16-bar Generate | Keep the 16-bar piece if the user goes back | `styleCache` is one row per style. The 64-bar stub overwrites it | Going 16 → 64 → 16 stub-plans a new 16. |
| n/a | Notes:guide / Notes:line live | Need a key | Jev pass, then the sheet unsales | Not run. Disabled options and the `[]` fallback path are unit-tested | Re-check on a keyed deploy before calling D1 done. |

No error banners on `/music/` or `/trolley/` in this pass. No page errors in the console. Trolley Randomize + “What would the stub do?” returned a verdict (pull / leave-it bar, confidence, lost/saved). Landing cards route.

Playback: Play → Stop, `aria-pressed` / `.is-playing`, sheet click seek while sounding. Samples were not audible in this VM; the transport state and playhead path ran.

---

## Fixes already in this PR

Part A only — no extra drive-by CSS after the pass.

- `displayedSheetIsStale` in `src/music/sheetStale.ts` (busy, `pendingStyle`, pending notes, planner dirty, PlanInput mismatch)
- Sheet panel `is-stale` / `aria-busy`; frame muted + non-interactive; transport faded; Play / Space / seek / MIDI disabled
- Status `Settings changed — Generate to apply` when controls drifted and nothing is in flight
- Bars change stub-plans like a dial miss
- Tests in `src/music/sheetStale.test.ts`

---

## Ranked improvements (10)

Payoff = what a first-time listener or a first-time clicker actually notices. Cost is engineering, including both planners, the sheet, and tests. Musical items 1–3 are still the fidelity stack from `FIDELITY_FINDINGS.md`; they are here because they remain the highest-leverage work, not because this pass rediscovered them.

| # | Ship | Why now | Payoff | Cost |
| --- | --- | --- | --- | --- |
| 1 | **Breath and pickup** | Every lyrical texture still attacks every downbeat and never rests. Guide mode can pick a rest slot; the default `renderPlan` path still sounds like an étude. | The single most “sung” property we lack | M — rhythm banks + phrase-end rule; optional closed `phrasing` global |
| 2 | **Arrangement follows the form** | Theme return is real; the return is still the same density as bar 1. 32- and 64-bar plans make this worse, not better. | A return that *sounds* like a return | M — per-phrase level 0–3 + one `arrangement` global (already on the plan) |
| 3 | **Desktop stand for 32/64** | Mobile already has a scrolling frame. Desktop 64 is a poster, not a stand — Play and the plan fall off the page. | Makes the new bar counts usable | S — reuse the mobile `max-height` + in-frame follow above ~1080 px, or a “fit systems” toggle |
| 4 | **Cache key = style + bars** | One slot per artist fights the 64-bar control. Dial clicks after a 64-bar experiment lose the 16-bar prewarm. | Instant 16- and 64-bar switches | S — `Map<\`${style}:${bars}\`>` or a small LRU |
| 5 | **Keyed QA of Notes:guide** | D1 shipped in #42 and was not heard here. The disabled-no-key UI is correct; the music is the open question. | Know whether figure+goal sings, or whether we are A/B-ing noise | S to run; M if the line still leaps | Live Jev only |
| 6 | **Generate-to-apply as the stale CTA** | Status text is right; Generate does not visually take the hint. After Seed/Decide-by/Brief drift the next click should be obvious. | People will Generate instead of poking a dead Play | S — accent the primary while `stale && !inFlight` |
| 7 | **Best should say what it is** | Best samples the stub and (when live) scores with Jev. The Planner select can still read “Jev — live”. | Stops a false “Jev wrote this” reading | S — status `Picked… (heuristic sample, Jev score)` and/or keep `plannerDirty` if the select is Jev |
| 8 | **Notes labels that fit a phone** | “Code writes the tune” already clips at 390 px. Three modes in the main row was the right product move; the copy is desktop-sized. | The control we just promoted is readable | S — short labels (`Code` / `Guide` / `Line`) + title tooltips, or a stacked Notes row under 760 px |
| 9 | **One summit + varied return** | Cheap renderer work that rides with #1–2. Top note is still hit ~3×; returns are still copies. | Shape a 16-bar piece can hear | S–M — ceiling in `melody.ts`; ornament ladder on restatement |
| 10 | **DevEx: stub-fast, Jev-honest CI** | Cloud agents and most PRs have no key. We can prove UX and `renderPlan`; we cannot prove Jev. A smoke path that records one live `globals` + one `notes` exchange (or a checked-in fixture of a real response) would have caught request-shape drift without 90 req/min. | Fewer “works on stub, dies on Jev” merges | S for fixtures; M for a gated live job |

Not on this list, on purpose: more dial styles, a second trolley, off-thread VexFlow, free-text pitches, or another planner. Those do not change the first 16 bars a stranger hears, or the first click after they change Seed.

---

## Manual notes (if you re-run)

1. `/music/` — wait for an engraved canvas (`Ready — 16 bars` or `Restored plan`).
2. Debug on. Sheet must stay live.
3. Nudge Seed. Stand mutes, Play dies, status asks you to Generate. Put the seed back — live again.
4. Bars → 64. Accept a short mute; confirm `Ready — 64 bars` and a long score.
5. Generate, Play, click a later system, Stop. Dial to another artist. Best.
6. Notes: without a key, Guide/Line stay disabled. With a key, Guide should mute until phrases land, then unsale; Code should never mute.
7. 390 × 844 — 2-column dial, full-width Play, no horizontal overflow.
8. `/trolley/` — Randomize, stub judge, verdict + lost/saved.

Do not merge this PR. Coder merges when Music pings.
