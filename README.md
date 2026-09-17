# Jev Playground / music

Can a **System One** model steer music across styles?

[Jev](https://typesafe.ai/blog/introducing-system-one-models-and-jev) (TypeSafe's first System One model) doesn't generate text or notes — it makes fast, typed **classify / score / pick** decisions with calibrated probabilities. This playground tests whether that is enough to steer a composition:

- **Jev** (or an offline stub behind the same interface) decides *only enum labels*: key, meter, texture, palette, tempo, dynamics, instrument, and per bar a chord, a phrase role and a melodic contour.
- **App code** expands that plan into notes, engraves it (VexFlow), plays it (smplr) and exports it (`.mid`).

Styles on the dial: **Bach · Beethoven · Debussy · Philip Glass · Nahre Sol · Elijah Fox**.

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

**Where plan JSON feeds the renderer:** one call, in `src/App.tsx`:

```ts
const score = useMemo(() => renderPlan(plan, generated.input.seed), [plan, generated])
```

`renderPlan` (`src/render/renderPlan.ts`) is pure and deterministic. Nothing upstream of it knows about notes; nothing downstream knows about Jev. The plan JSON is shown in the UI and is **editable** — change `"texture"` or a bar's `"chord"`, hit *Apply to renderer*, and hear only the renderer's response to that one label.

### The plan (`src/plan/schema.ts`)

```ts
interface CompositionPlan {
  version: 1
  style: StyleId              // bach | beethoven | debussy | glass | nahre_sol | elijah_fox
  key: KeyId                  // 18 keys, C_major … F_minor
  meter: MeterId              // four_four | three_four | six_eight
  texture: TextureId          // 10 textures: chorale, two_voice_counterpoint, … lush_voicings
  palette: PaletteId          // diatonic | chromatic_approach | pentatonic | whole_tone | modal
  tempo: TempoId              // largo … presto (bucketed bpm)
  dynamics: DynamicId         // pp … ff
  dynamicShape: DynamicShapeId// steady | terraced | crescendo | decrescendo | arch | sudden_contrast
  defaultInstrument: InstrumentId
  bars: BarPlan[]             // 4 | 8 × { chord: ChordId (50 key-relative labels), role, contour }
}
```

Every option has a one-line musical description. The UI shows it; `JevPlanner` sends it as that option's Choice `criteria`. Descriptions never name a composer — connecting “Debussy” to `parallel_planing` is the judgment being tested (there's a unit test for that).

### What Jev is asked (`src/planner/jev/requests.ts`)

Built against the public API (`POST https://api.typesafe.ai/v1/systemone`, [docs](https://docs.typesafe.ai/api.md)):

| # | Request | Questions | Why this shape |
| --- | --- | --- | --- |
| 1 | `globals` | 8 global Choices + bar count + bar roles for **both** 4- and 8-bar forms (21 Choices) | Questions in one request run in parallel and can't see each other → fan out everything independent, speculatively; code reads the role set matching the chosen length. |
| 2…N | `bar` ×4/8 | `chord` (50 options) + `contour` | Chords depend on each other, so they're asked sequentially with the progression-so-far in `state`. |
| opt. | `score` | one **Score** per style, levels low / medium / high | “How well does this plan match style X?” → `StyleMatchScore { match, confidence, raw }`. The plan's own `style` label is withheld from state. |

Jev returns a full probability distribution per Choice. **Code owns the policy** (`src/planner/pick.ts`): `argmax`, or seeded `sample` from the (sharpened) distribution — so “Generate” gives variety without asking Jev to be random. The *Style brief* toggle sends either just the style's name, or name + a prose description, to separate what Jev knows from what we told it.

The browser never posts raw state/questions to the proxy. It posts a small typed `JevOp`; the server re-validates it against the enums and rebuilds the request with the same pure functions, so `/api/jev` can't be used as an open relay for the key.

### The offline stub (`src/planner/HeuristicPlanner.ts`)

Same interface, no network: samples hand-written per-style priors and progression/form templates (`src/plan/styles.ts`). It's the demo default and a baseline to compare Jev's choices against. If a live Jev call fails, the UI says so and shows the stub's plan — it never passes a stub plan off as Jev's.

### The renderer (`src/render/`)

`harmony.ts` resolves key-relative chord labels to spelled pitch classes via **tonal**; `voiceLeading.ts` (nearest-inversion voicings, inversion-aware bass, essential-tone selection) and `melody.ts` (contour-driven lines that snap to chord tones on strong positions and the palette scale on weak ones, stepwise runs, chromatic approach tones, motif-rhythm memory for restatements) are the small helpers; `textures/*` are the ten texture generators. `renderPlan.test.ts` renders every style × many seeds and every texture × meter with random labels, and asserts the output is always engravable.

### Audio (`src/audio/engine.ts`)

One `AudioContext`, created on the first user gesture. Every instrument and the reverb send run `→ master gain → limiter → destination`; nothing else touches the destination. A 25 ms two-clock lookahead scheduler feeds smplr, so stop / instrument swap / loop are immediate and nothing is queued more than ~180 ms ahead. Status is truthful (`idle / loading n/m / ready / error`). `dispose()` stops voices, disconnects nodes and closes the context (StrictMode-safe). Instruments: SplendidGrandPiano, ElectricPiano, and Soundfont harpsichord / church organ / strings / choir.

## Debug view

`?debug=1` or the **Debug** switch in the header. One view for both paths:

- resolved style string + id, planner, model, request count, latency, tokens, pick policy, seed
- bar-by-bar chord label → resolved chord, role, contour, with confidences
- global decisions with confidence and runner-up; style-match scores when present
- **payloads**: the exact `POST /v1/systemone` request bodies, pretty-printed and copyable, plus the `JevOp` the browser sends to the proxy and the raw responses. With the stub, the same panel shows the payloads Jev *would* have been sent for that plan, tagged “not sent”.

## Layout

```
api/jev.ts              Vercel function → server/jevHandler.ts
server/jevHandler.ts    validate JevOp → build request → TypeSafe (key stays here)
src/plan/               schema (enums, plan, validation) · style briefs + stub priors
src/planner/            Planner interface · HeuristicPlanner · JevPlanner · pick policy · jev/
src/render/             renderPlan (the seam) · harmony · melody · voiceLeading · textures/
src/sheet/              notation splitting (ticks → tied note values) · VexFlow drawing
src/audio/ src/midi/    playback engine · MIDI export
src/ui/ src/App.tsx     dial, transport, plan panel (editable JSON), match row, debug panel
```

Files imported by the serverless function use explicit `.js` import extensions (Node ESM); everything else is extensionless.

## Known limits (v0)

- One harmony per bar; no modulation, pickups, tuplets or cross-bar ties.
- Jev has not been exercised against a live key from this repo yet — request/response handling is tested against the documented contract with a fake transport, and the proxy path is verified up to TypeSafe's 401. Expect to tune question wording and the sampling temperature once real distributions are visible in the debug panel.
- The stub's style-match score can only agree with its own priors; it's a plumbing baseline, not a judge.
