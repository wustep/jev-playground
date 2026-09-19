# Jev Playground

Can a **System One** model steer music across styles?

[Jev](https://typesafe.ai/blog/introducing-system-one-models-and-jev) (TypeSafe's first System One model) doesn't generate text or notes — it makes fast, typed **classify / score / pick** decisions with calibrated probabilities. This playground tests whether that is enough to steer a composition:

- **Jev** (or an offline stub behind the same interface) decides *only enum labels*: the piece's character and form, key, meter, texture, palette, tempo, dynamics, instrument, and — per 4-bar slot — a harmony-book phrase plus per-bar contours. Code expands those into per-bar chords and roles.
- **App code** expands that plan into notes, engraves it (VexFlow), plays it (smplr) and exports it (`.mid`).

Styles on the dial: **Johann Sebastian Bach · Ludwig van Beethoven · Frédéric Chopin · Claude Debussy · Philip Glass · Hans Zimmer · Laufey · Elijah Fox**.

## Routes

| Route | What |
| --- | --- |
| `/` | Landing page: links to the demos. |
| `/music/` | The composer described below: Jev picks labels, code writes the notes. |
| `/trolley/` | Absurd trolley problems. Put anyone or anything on either track (counts, traits, a twist), or **Randomize**; then ask what Jev would do. Jev makes typed decisions only — `trolley_cast` (Choices over closed tables, sampled by code) and `trolley_judge` (a decision Choice, difficulty and absurdity Scores, a “most people would pull” Noul). Every sentence is assembled by code (`src/trolley/describe.ts`). Clearly hypothetical; no harm is ever described. |

One Vite entry; `src/main.tsx` switches on the path and lazy-loads each demo (the landing page and the trolley never download VexFlow). `vercel.json` rewrites `/music/*` and `/trolley/*` to `index.html` so direct visits and refreshes work. `?debug=1` works on both demos.

## Run

```sh
npm install
npm run dev        # http://localhost:5173 — works offline with the heuristic stub
npm run build      # tsc --noEmit && vite build   (must pass)
npm test           # vitest: renderer invariants, Jev request shapes, proxy, MIDI round-trip
```

Node 20+.

## Env vars

Copy `.env.example` → `.env.local`. **Nothing is required** — with no key the app runs on the `HeuristicPlanner` and says so in the header.

| Var | Where it's read | Purpose |
| --- | --- | --- |
| `TYPESAFE_API_KEY` | server only (`/api/jev`) | **Recommended.** Enables the live `JevPlanner` through the proxy. Never reaches the browser bundle. |
| `TYPESAFE_BASE_URL` | server only | Override `https://api.typesafe.ai`. |
| `TYPESAFE_MODEL` | server only | Override `jev-latest` (e.g. pin `jev-1.13.0`). |
| `VITE_JEV_API_KEY` | **browser bundle** | Local-only escape hatch: the browser calls TypeSafe directly, no proxy. `VITE_*` vars are inlined into public JS — don't set this on a deployed build. |
| `VITE_JEV_BASE_URL`, `VITE_JEV_MODEL` | browser bundle | Overrides for direct mode. |

`/api/jev` is served by a Vercel function in production (`api/jev.ts`) and by a Vite middleware during `npm run dev` (`vite.config.ts`) — same handler (`server/jevHandler.ts`), so `TYPESAFE_API_KEY` in `.env.local` just works locally without `vercel dev`.

### `/api/jev` hardening

- **Allowlist, not a proxy.** The body must be one of eight typed ops (music: `concept`, `globals`, `bar`, `phrase`, `score`, and Debug-only `notes`; trolley: `trolley_cast`, `trolley_judge`), re-validated against the enums; the server builds the actual `state`/`questions`. Raw `state`/`questions` are rejected with 400. `bar` stays parseable for older tests; live planning uses `phrase`. The `notes` op is unchanged as a verb; optional `melodySoFar`, `bassSoFar`, `nextChord`, and `barIndex` are parsed against the existing note / chord enums so a Coder allowlist that only lists `notes` still validates.
- **Rate limit.** 90 POSTs per minute per client IP (`JEV_RATE_LIMIT` overrides), keyed on `x-vercel-forwarded-for` / `x-real-ip` — headers Vercel's edge sets and a client can't forge. Over the limit: `429` + `Retry-After`. The counters are **in memory per function instance**, so on serverless this is best-effort: a cold start resets it and parallel instances count separately. That is enough to stop loops and casual abuse; a hard cap needs a shared store (Vercel KV / Upstash), which this project doesn't have configured.
- **Nothing secret in responses.** The key is only ever sent upstream in the `Authorization` header. `GET` returns `{ available, model }` and no other env. Failed upstream calls return a generic message — never TypeSafe's response body; successful ones pass back only `model`, `answers`, `usage`.
- 16 kB body cap, `GET`/`POST` only (`405` + `Allow`), `Cache-Control: no-store`. Covered by `server/jevHandler.test.ts`.

On Vercel: `vercel env add TYPESAFE_API_KEY production`, then redeploy. The header chip flips from “Jev offline · stub” to “Jev connected”.

## Architecture: Jev vs renderer

```
 “Philip Glass”                                                    src/
      │ style string
      ▼
 ┌─────────────────────────────┐   Planner interface               planner/Planner.ts
 │ JevPlanner  │ Heuristic-    │   plan(input)  → CompositionPlan  planner/JevPlanner.ts
 │ (live)      │ Planner (stub)│   score(plan)  → StyleMatchScore  planner/HeuristicPlanner.ts
 └─────────────────────────────┘
      │ CompositionPlan JSON — closed enums only                   plan/schema.ts
      ▼
 ╔═════════════════════════════╗
 ║ renderPlan(plan, seed)      ║  ◀── THE SEAM                     render/renderPlan.ts
 ╚═════════════════════════════╝
      │ Score: notes on a 16th grid, 2 staves × ≤2 voices          render/score.ts
      ├──▶ drawScore()      VexFlow 5 canvas + playhead overlay    sheet/drawScore.ts
      ├──▶ AudioEngine      smplr, one AudioContext                audio/engine.ts
      └──▶ scoreToMidi()    @tonejs/midi                           midi/exportMidi.ts
```

**Where plan JSON feeds the renderer:** one call, in `src/music/MusicApp.tsx`:

```ts
const score = useMemo(() => renderPlan(plan, generated.input.seed), [plan, generated])
```

`renderPlan` (`src/render/renderPlan.ts`) is pure and deterministic. Nothing upstream of it knows about notes; nothing downstream knows about Jev. The plan JSON is shown in the UI and is **editable** — change `"texture"` or a bar's `"chord"`, hit *Apply to renderer*, and hear only the renderer's response to that one label. Behind **Debug**, an experimental `Notes: Jev` toggle may overlay a closed-schema right-hand melody **and** left-hand bass on every plan bar after the plan. Later bars see `melody_so_far` (prior rhythm + degree ids) so the line can continue. Illegal RH ticks/pitches fall back to `renderPlan`; illegal bass on one bar keeps that bar’s code left hand. The default Generate path is unchanged.

### The plan (`src/plan/schema.ts`)

```ts
interface CompositionPlan {
  version: 1
  style: StyleId              // bach | beethoven | chopin | debussy | glass | hans_zimmer | laufey | elijah_fox
  character: CharacterId      // 12: lyrical_song, stormy_drama, dance_lilt, hypnotic_pulse … decided FIRST
  form: FormId                // 11: period, sentence, spinning_out, additive_loop, mosaic_pairs …
  key: KeyId                  // 21 keys, C_major … F_minor
  meter: MeterId              // four_four | three_four | two_four | six_eight | nine_eight | twelve_eight
  texture: TextureId          // 22 textures: chorale … toccata_perpetual, rolling_nocturne, bell_organum
  palette: PaletteId          // diatonic | chromatic_approach | pentatonic | whole_tone | modal | modal_dark | blues
  tempo: TempoId              // larghissimo … prestissimo (bucketed bpm)
  dynamics: DynamicId         // pp … ff
  dynamicShape: DynamicShapeId// steady | terraced | crescendo | … | waves | late_surge | build_then_drop
  defaultInstrument: InstrumentId
  arrangement?: ArrangementId // how density changes when material returns
  opening?: OpeningId         // straight_in | vamp_intro | pickup
  pedal?: PedalId             // dry | half | full — sustain for the piece
  bars: BarPlan[]             // 4 | 8 | 16 | 32 × { chord: ChordId (107 key-relative labels, inversions included), role (11), contour (9) }
}
```

Every option has a one-line musical description. The UI shows it; `JevPlanner` sends it as that option's Choice `criteria`. Descriptions never name a composer — connecting “Debussy” to `parallel_planing` is the judgment being tested (there's a unit test for that).

`character` is what makes two generations of one style different *pieces* rather than reshuffles: it is decided first and every later decision is conditioned on it. `form` is a label for the phrase layout; code expands it into `bars[].role` (`src/plan/forms.ts`), and the roles are what the renderer reads.

How each style's vocabulary was researched — scores, corpora, analyses, and for living artists interviews, bios and teaching — is in [`docs/STYLE_NOTES.md`](docs/STYLE_NOTES.md), as *learned → changed*.

### What Jev is asked (`src/planner/jev/requests.ts`)

Built against the public API (`POST https://api.typesafe.ai/v1/systemone`, [docs](https://docs.typesafe.ai/api.md)):

| # | Request | Questions | Why this shape |
| --- | --- | --- | --- |
| 1 | `concept` | `character` Choice (most typical) + one **Noul** per character (“is this a real part of their output?”) | Asked what is *most characteristic*, live Jev is — rightly — sure: Beethoven is C minor, block chords, allegro at 90–100 %, every time. Several characters apply at once, which is what Nouls are for; alone they are too flat, the Choice alone too peaked. Code combines them and draws one. |
| 2 | `globals` | `form` + 8 global Choices + bar count, with the drawn character in `state` | Questions in one request run in parallel and can't see each other → fan out everything independent. Conditioning on one shared premise is what keeps the plan coherent (measured: Beethoven *lyrical song* → A♭ major, adagio, *p*; *playful wit* → 3/4 scherzo in D). |
| 3…N | `phrase` ×1/2/4/8 | one HarmonyBook phrase for the slot's PhraseEnd + four `contour`s | ~4× fewer harmony requests than a chord per bar. Options are that style's heads, seqs, tails and verified phrases, described functionally. Prior-slot chords and contours sit in `state`. Cadence splits come from the book in code. |
| opt. | `score` | one **Score** per style, levels low / medium / high | “How well does this plan match style X?” → `StyleMatchScore { match, confidence, raw }`. The plan's own `style` label is withheld from state. |
| Debug | `notes` × new plan bars | RH `rhythm` + `pitch_1..4` + `bass_pattern` in **one** POST | Closed enums only. State includes style brief (when on), character / texture / arrangement, `melody_so_far`, `last_sounding_degree`, `bass_so_far`, phrase role, and `next_chord` when known. Code voice-leads register after the picks (degrees stay the plan). Sample mode lightly tilts toward nearby degrees and, for lyrical characters, a long+rest rhythm. Theme-return bars reuse source choices and re-spell. Not a new op. See [`docs/fable-context/NOTES_JEV_QUALITY.md`](docs/fable-context/NOTES_JEV_QUALITY.md). |

Bar roles are **not** asked. An earlier version asked one role Choice per bar, in parallel; each answer was a marginal that knew nothing of its neighbours and the argmax came back as “statement, development, half cadence ×4, cadence”. One `form` Choice, expanded by code, is coherent by construction and cut the fan-out from ~16k to ~3.7k input tokens.

Jev returns a full probability distribution per Choice. **Code owns the policy** (`src/planner/pick.ts`): `argmax`, or seeded `sample` — nucleus sampling (the top 90 % of the mass, at face value) so “Generate” gives variety without asking Jev to be random and without a 1 % option hijacking the piece. Two more policies apply when sampling: a novelty weight keeps a progression moving (Jev likes to sit on the tonic through every restatement), and the final phrase slot is always argmax (a piece that ends on V7 because a 40 % option came up just sounds broken). The debug trace always shows Jev's own numbers, not the policy-adjusted ones. The *Style brief* toggle sends either just the style's name, or name + a prose description, to separate what Jev knows from what we told it.

The browser never posts raw state/questions to the proxy. It posts a small typed `JevOp`; the server re-validates it against the enums and rebuilds the request with the same pure functions, so `/api/jev` can't be used as an open relay for the key.

### The offline stub (`src/planner/HeuristicPlanner.ts`)

Same interface, no network, same order of decisions: a character (one of the style's archetypes — prelude, invention, chorale, sarabande, gigue, toccata for Bach), then globals from that archetype's priors, then bars. Harmony is assembled from a per-style grammar — two-bar heads, travelling units and tails, four-bar phrases lifted from real pieces, chord cycles, pedals, codas — by the chosen form's phrase slots, so eight bars come out of hundreds of combinations rather than three templates, and a returning `a` phrase really does return. A guard re-rolls anything whose roots spell I–V–vi–IV in any rotation. It's the demo default and a baseline to compare Jev's choices against. If a live Jev call fails, the UI says so and shows the stub's plan — it never passes a stub plan off as Jev's.

### The renderer (`src/render/`)

`harmony.ts` resolves key-relative chord labels to spelled pitch classes via **tonal** — including the bass note an inversion or pedal label dictates — and bends the melody scale toward chromatic chord tones; `voiceLeading.ts` (nearest-inversion voicings, bass handling, essential-tone selection) and `melody.ts` (contour-driven lines that snap to chord tones on strong positions and the palette scale on weak ones, stepwise runs, chromatic approach tones, and motif memory: a restatement over the statement's chord replays its tune; a `sequence` or `echo` bar reuses the previous bar's figure) are the small helpers; `textures/*` are the 22 texture generators, most of which pick one of several figures per piece from the seed. `renderPlan` then phrases each bar — a hairpin toward the next bar's level, metric accent and touch scaled by the piece's character. `renderPlan.test.ts` renders every style × many seeds and every texture × meter with random labels, and asserts the output is always engravable.

### Audio (`src/audio/engine.ts`)

One `AudioContext`, created on the first user gesture. Every instrument and the existing smplr Reverb send (one short room, ≈11 % wet, darker Dattorro decay/damping — no second room, no pedal wash) run `→ master gain → limiter → destination`; nothing else touches the destination. A 25 ms two-clock lookahead scheduler feeds smplr, so stop / instrument swap / loop are immediate and nothing is queued more than ~180 ms ahead. Status is truthful (`idle / loading n/m / ready / error`). `dispose()` stops voices, disconnects nodes and closes the context (StrictMode-safe). Instruments: SplendidGrandPiano, ElectricPiano, and Soundfont harpsichord / church organ / strings / choir. Sustain is a plan global (`dry` | `half` | `full`), realised as note hold in the renderer and CC64 in MIDI — not as a wet-path wash.

## Debug view

`?debug=1` or the **Debug** switch in the header. One view for both paths:

- resolved style string + id, planner, model, request count, latency, tokens, pick policy, seed
- bar-by-bar chord label → resolved chord, role, contour, with confidences
- global decisions with confidence and runner-up; style-match scores when present
- **payloads**: the exact `POST /v1/systemone` request bodies, pretty-printed and copyable, plus the `JevOp` the browser sends to the proxy and the raw responses. With the stub, the same panel shows the payloads Jev *would* have been sent for that plan, tagged “not sent”.

## Layout

```
api/jev.ts              Vercel function → server/jevHandler.ts
server/jevHandler.ts    rate limit → validate op (allowlist) → build request → TypeSafe (key stays here)
server/rateLimit.ts     per-IP fixed window, in memory (best-effort on serverless)
src/main.tsx            path switch: / · /music/ · /trolley/ (lazy chunks)
src/landing/ src/shell/ landing page · route helper
src/music/MusicApp.tsx  the composer page
src/trolley/            schema (closed tables) · requests (typed ops) · describe (all sentences) · play (Jev + stub) · page
src/plan/               schema (enums, plan, validation) · style briefs + stub priors
src/planner/            Planner interface · HeuristicPlanner · JevPlanner · pick policy · jev/
src/render/             renderPlan (the seam) · harmony · melody · voiceLeading · textures/
src/sheet/              notation splitting (ticks → tied note values) · VexFlow drawing
src/audio/ src/midi/    playback engine · MIDI export
src/ui/                 sheet view, plan panel (editable JSON), debug panel
```

Files imported by the serverless function use explicit `.js` import extensions (Node ESM); everything else is extensionless.

## Known limits (v0)

- Cadence bars may split; no modulation, pickups, tuplets or cross-bar ties. Meters now include 2/4, 9/8 and 12/8; 3/8 and cut time are still out (see the end of `docs/STYLE_NOTES.md`).
- Question wording and sampling policy were tuned against live Jev distributions for six styles on one afternoon; they are a starting point, not a calibration.
- The stub's style-match score can only agree with its own priors; it's a plumbing baseline, not a judge.
