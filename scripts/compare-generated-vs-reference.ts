#!/usr/bin/env npx tsx
/**
 * Generated vs reference: HeuristicPlanner (and optional live Jev) against the
 * committed reverse-labelled plans and public-domain MIDI.
 *
 * Prints JSON (labels + Score metrics). Never writes MIDI. Never prints secrets.
 *
 *   npx --yes tsx scripts/compare-generated-vs-reference.ts
 *   npx --yes tsx scripts/compare-generated-vs-reference.ts --summary
 *   npx --yes tsx scripts/compare-generated-vs-reference.ts --live-jev --live-styles chopin,beethoven
 *
 * Metrics read the melody voice directly (`Bar.treble[0]`, which the renderer
 * writes first and alone) against the Mutopia right-hand track. There is no
 * longer a "which voice is the tune" heuristic to be wrong about. See
 * `src/compare/compareMetrics.ts` and `docs/ref-midi/public/README.md`.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'

import { GLOBAL_FIELD_IDS, parsePlan, type BarCount, type CompositionPlan, type StyleId } from '../src/plan/schema'
import { barPositions } from '../src/plan/phrase'
import { HeuristicPlanner } from '../src/planner/HeuristicPlanner'
import { JevPlanner, directTransport } from '../src/planner/JevPlanner'
import { renderPlan } from '../src/render/renderPlan'
import { midiMetrics, scoreMetrics } from '../src/compare/compareMetrics'

interface RefFile {
  id: string
  piece: string
  evidence: string
  midi?: string
  plan: unknown
}

/** The piece each style is measured against. */
const PRIMARY: Record<StyleId, string> = {
  bach: 'bach-bwv846-prelude',
  beethoven: 'beethoven-op13-pathetique-ii',
  chopin: 'chopin-op9-2-nocturne',
  debussy: 'debussy-l75-clair-de-lune',
  hans_zimmer: 'zimmer-time',
}

const DEFAULT_SEEDS = [1, 7, 42]

const arg = (name: string): string | undefined => {
  const at = process.argv.indexOf(name)
  return at >= 0 ? process.argv[at + 1] : undefined
}
const has = (name: string) => process.argv.includes(name)

const labelsOf = (plan: CompositionPlan): Record<string, string> =>
  Object.fromEntries(GLOBAL_FIELD_IDS.map((field) => [field, String(plan[field])]))

function labelHits(generated: CompositionPlan, reference: CompositionPlan) {
  return Object.fromEntries(
    GLOBAL_FIELD_IDS.map((field) => [field, { got: String(generated[field]), want: String(reference[field]), match: generated[field] === reference[field] }]),
  )
}

const firstChords = (plan: CompositionPlan, n = 8): string[] => plan.bars.slice(0, n).map((bar) => (bar.chord2 ? `${bar.chord}|${bar.chord2}` : bar.chord))

const realize = (plan: CompositionPlan, seed: number) => scoreMetrics(renderPlan(plan, seed))

function loadRefs(): { file: RefFile; plan: CompositionPlan }[] {
  const dir = 'docs/fable-context/reference-plans'
  return readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .map((name) => {
      const file = JSON.parse(readFileSync(`${dir}/${name}`, 'utf8')) as RefFile
      return { file, plan: parsePlan(file.plan) }
    })
}

const labelMatchCount = (hits: ReturnType<typeof labelHits>) => Object.values(hits).filter((hit) => hit.match).length

async function maybeLiveJev(styles: StyleId[], bars: BarCount) {
  const apiKey = process.env.TYPESAFE_API_KEY?.trim() || process.env.VITE_JEV_API_KEY?.trim()
  if (!apiKey) return { available: false as const, reason: 'no TYPESAFE_API_KEY / VITE_JEV_API_KEY in environment', samples: [] as unknown[] }
  const planner = new JevPlanner(directTransport(apiKey, process.env.TYPESAFE_BASE_URL, process.env.TYPESAFE_MODEL), process.env.TYPESAFE_MODEL)
  const samples: unknown[] = []
  for (const style of styles) {
    try {
      const { plan, trace } = await planner.plan({ style, bars, pick: 'argmax', seed: 1, brief: true })
      samples.push({ style, planner: 'jev', pick: 'argmax', seed: 1, model: trace.model, requests: trace.requests, labels: labelsOf(plan), chords: firstChords(plan), realized: realize(plan, 1) })
    } catch (error) {
      samples.push({ style, planner: 'jev', error: error instanceof Error ? error.message.slice(0, 240) : String(error).slice(0, 240) })
    }
  }
  return { available: true as const, reason: 'live TypeSafe via env key (not printed)', samples }
}

async function main() {
  const bars = (Number(arg('--bars') ?? 16) || 16) as BarCount
  const seeds = (arg('--seeds') ?? DEFAULT_SEEDS.join(',')).split(',').map(Number)
  const liveStyles = ((arg('--live-styles') ?? 'chopin,beethoven').split(',') as StyleId[]).filter(Boolean)
  const refs = loadRefs()
  const planner = new HeuristicPlanner()
  const byId = new Map(refs.map((row) => [row.file.id, row]))

  const styles = Object.keys(PRIMARY) as StyleId[]
  const perStyle = []
  for (const style of styles) {
    const primary = byId.get(PRIMARY[style])
    if (!primary) continue
    const midi = primary.file.midi ? midiMetrics(primary.file.midi) : null
    const generated = []
    for (const pick of ['argmax', 'sample'] as const) {
      for (const seed of pick === 'argmax' ? [1] : seeds) {
        const { plan } = await planner.plan({ style, bars, pick, seed, brief: true })
        const hits = labelHits(plan, primary.plan)
        generated.push({
          planner: 'heuristic',
          pick,
          seed,
          labels: labelsOf(plan),
          chords: firstChords(plan),
          labelHits: hits,
          labelMatchCount: labelMatchCount(hits),
          themeReturns: barPositions(plan.form, plan.bars.length as BarCount).filter((position) => position.returnsFrom !== undefined).length,
          realized: realize(plan, seed),
        })
      }
    }
    perStyle.push({
      style,
      primary: {
        id: primary.file.id,
        piece: primary.file.piece,
        evidence: primary.file.evidence,
        midi: primary.file.midi,
        labels: labelsOf(primary.plan),
        chords: firstChords(primary.plan),
        realized: realize(primary.plan, 1),
      },
      referenceMidi: midi,
      generated,
      others: refs.filter((row) => row.plan.style === style && row.file.id !== primary.file.id).map((row) => ({ id: row.file.id, piece: row.file.piece, labels: labelsOf(row.plan) })),
    })
  }

  const report = {
    generatedAt: new Date().toISOString(),
    note: 'Heuristic plans are live. Metrics read Bar.treble[0] — the melody voice the renderer writes first — against the Mutopia right-hand track. No MIDI written. No secrets logged.',
    liveJev: has('--live-jev') ? await maybeLiveJev(liveStyles, bars) : { available: false, reason: 'not requested (--live-jev off)', samples: [] },
    styles: perStyle,
  }

  if (has('--summary')) {
    const row = (label: string, register: unknown, onsets: unknown, ret: unknown, breaches: unknown) =>
      `${label.padEnd(22)} ${String(register ?? '—').padStart(6)} ${String(onsets ?? '—').padStart(7)} ${String(ret ?? '—').padStart(6)} ${String(breaches ?? '—').padStart(4)}`
    console.log(row('', 'reg', 'onsets', 'ret4', 'brch'))
    for (const entry of perStyle) {
      const best = [...entry.generated].sort((a, b) => b.labelMatchCount - a.labelMatchCount)[0]
      const midi = entry.referenceMidi as { registerMean?: number; onsetDensityEarly?: number; ret4?: number } | null
      console.log(row(`${entry.style} · midi`, midi?.registerMean, midi?.onsetDensityEarly, midi?.ret4, ''))
      console.log(row(`${entry.style} · ref plan`, entry.primary.realized.registerMean, entry.primary.realized.onsetDensityEarly, entry.primary.realized.ret4, entry.primary.realized.ceilingBreaches))
      console.log(row(`${entry.style} · generated`, best.realized.registerMean, best.realized.onsetDensityEarly, best.realized.ret4, best.realized.ceilingBreaches))
      console.log()
    }
    return
  }

  const out = arg('--out') ?? '/tmp/generated-vs-reference.json'
  const json = JSON.stringify(report, null, 2)
  writeFileSync(out, json)
  console.log(`wrote ${out} (${json.length} bytes)`)
}

void main()
