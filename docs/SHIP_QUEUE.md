# Ship queue for PR #2 → main → Vercel

Do not drop any item. Small commits; `git push` after each. When ALL are done: merge PR #2 to main, confirm Vercel production deploy of jev-playground is green.

## Done
- [x] Style breadth + mobile polish + payload wrap + STYLE_NOTES
- [x] Remove System One lede + Split colophon / proxy footer line
- [x] Remove 1→2→3 flow strip + pipeline dump (quieter UI)
- [x] One Generate button (new seed); bars default 16, planner never decides bars
- [x] Decide by / seed tucked with Debug (not broken on heuristic — stub supports argmax)

## Still todo
- [x] Style-switch loading / clear in-flight feedback
- [x] Prewarm/cache one 16-bar plan+score per artist; click artist plays immediately; Generate replaces with new seed
- [x] More horizontal padding on sheet music
- [ ] Deepen style strings / research; tone down Philip Glass repetition (priors/textures, not just prose)
- [x] Click a measure on the sheet to seek playback to that bar
- [x] Investigate perceived slowness (renderPlan was ~ms — check VexFlow/sheet path); ship cheap wins in this PR
- [ ] Routes: `/` landing (links to Music + Trolley), `/music/` = composer, `/trolley/` absurd editable cast trolley; SPA rewrites for refresh
- [ ] API: IP rate-limit `/api/jev` (429 + Retry-After); no key leak; allowlisted ops; extend for trolley as needed; tests
- [ ] Merge PR #2 to main (Stephen asked for main + Vercel ready)
- [ ] Confirm production Vercel deploy healthy

## Constraints
- No force push. Prefer merge via `gh pr merge` when checklist complete.
- Do not expose `TYPESAFE_API_KEY`.
- OOM risk: avoid heavy parallel playwright; push often.

## Notes
- Slowness: `renderPlan` is ~2 ms for 32 bars. The cost of a style switch is VexFlow engraving on the main
  thread: ~40–100 ms for 16 bars, ~90–180 ms for 32 (production build, headless Chrome). Top self-times were
  `structuredClone` (VexFlow deep-clones a flat style/font record per element), canvas `setTransform`/`scale`
  per glyph, and `measureText`. Shipped: shallow-copy patch for the two Metrics getters (removes the clone
  cost), memoised pitch ladders in the renderer, and — what actually changes how it feels — the per-style
  cache + immediate loading feedback. Not done (not cheap): off-main-thread or incremental engraving.
