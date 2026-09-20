#!/usr/bin/env npx tsx
/**
 * Generated vs reference: HeuristicPlanner (and optional live Jev) vs the
 * committed reverse-labelled plans / public-domain MIDI.
 *
 * Prints JSON (labels + Score metrics). Never writes MIDI. Never prints secrets.
 *
 *   npx --yes tsx scripts/compare-generated-vs-reference.ts
 *   npx --yes tsx scripts/compare-generated-vs-reference.ts --live-jev --live-styles chopin,laufey
 *
 * Guide / line overlays use the same realize paths as MusicApp. Without a live
 * key they use fake closed picks (same sketch as dump-heuristic-plans).
 *
 * Metrics score the melody only (Mutopia RH/figure track; generated singing
 * voice after overlay). ret4 starts at the first thematic bar. See
 * `src/compare/compareMetrics.ts` and `docs/ref-midi/public/README.md`.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'

import {
  GLOBAL_FIELD_IDS,
  parsePlan,
  resolveHookBars,
  type BarCount,
  type BarRoleId,
  type CompositionPlan,
  type ContourId,
  type StyleId,
} from '../src/plan/schema'
import {
  MELODY_DEGREE_IDS,
  PHRASE_RHYTHMS,
  rhythmHasLongTone,
  rhythmIsEven,
  type MelodyDegreeId,
  type MelodyFigureId,
  type MelodyGoalId,
  type PhraseRhythmId,
} from '../src/plan/notes'
import { themeSources } from '../src/plan/forms'
import { HeuristicPlanner } from '../src/planner/HeuristicPlanner'
import { JevPlanner, directTransport } from '../src/planner/JevPlanner'
import { prefersLongAndRest } from '../src/planner/jev/notesPriors'
import {
  applyNotePhrases,
  lastSoundingMidi,
  realizeJevGuideChoices,
  realizeJevNoteChoices,
  type NotePhrase,
} from '../src/render/jevNotes'
import { renderPlan } from '../src/render/renderPlan'
import { bassFingerprint, innerRhCount, midiMetrics, scoreMetrics } from '../src/compare/compareMetrics'

/** Closed figure + goal a Notes:guide pass might pick. Not live Jev. */
function sketchGuideBar(role: BarRoleId, contour: ContourId): { figure: MelodyFigureId; goal: MelodyGoalId } {
  const figure: MelodyFigureId =
    role === 'echo' || role === 'restatement' || role === 'sequence'
      ? 'motif_echo'
      : role === 'cadence' || role === 'dissolve' || role === 'half_cadence'
        ? 'hold_resolve'
        : contour === 'leap_fall' || contour === 'drop_rise'
          ? 'leap_recover'
          : contour === 'static'
            ? 'neighbour'
            : contour === 'fall'
              ? 'arpeggio_down'
              : contour === 'rise'
                ? 'arpeggio_up'
                : 'step_to_goal'
  const goal: MelodyGoalId =
    role === 'cadence' || role === 'half_cadence' ? 'root' : role === 'climax' || role === 'surprise' ? 'fifth' : 'third'
  return { figure, goal }
}

const DEFAULT_SEEDS = [1, 7, 19]
const LABEL_FIELDS = GLOBAL_FIELD_IDS
const PRIMARY: Record<StyleId, string> = {
  bach: 'bach-bwv846-prelude',
  beethoven: 'beethoven-op13-pathetique-ii',
  chopin: 'chopin-op9-2-nocturne',
  debussy: 'debussy-l66-arabesque-1',
  glass: 'glass-glassworks-opening',
  hans_zimmer: 'zimmer-time',
  laufey: 'laufey-from-the-start',
  elijah_fox: 'fox-city-in-the-sky',
}

interface RefFile {
  id: string
  piece: string
  evidence: string
  midi: string | null
  notes?: string
  _stretch?: string[]
  plan: unknown
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name)
  return i >= 0 ? process.argv[i + 1] : undefined
}

function flag(name: string): boolean {
  return process.argv.includes(name)
}

function proposedPhrasing(stretch: string[] | undefined): string | null {
  for (const line of stretch ?? []) {
    const match = /proposed phrasing:\s*([a-z_]+)/i.exec(line)
    if (match) return match[1]
  }
  return null
}

function labelsOf(plan: CompositionPlan): Record<string, string> {
  return Object.fromEntries(LABEL_FIELDS.map((field) => [field, String(plan[field] ?? '')]))
}

function labelHits(generated: CompositionPlan, reference: CompositionPlan, wantedPhrasing?: string | null) {
  const hits: Record<string, { ref: string; gen: string; match: boolean }> = {}
  for (const field of LABEL_FIELDS) {
    const ref = field === 'phrasing' && wantedPhrasing ? wantedPhrasing : String(reference[field] ?? '')
    const gen = String(generated[field] ?? '')
    hits[field] = { ref, gen, match: ref === gen }
  }
  return hits
}

function firstChords(plan: CompositionPlan, n = 8): string[] {
  return plan.bars.slice(0, n).map((bar) => (bar.chord2 ? `${bar.chord}|${bar.chord2}` : bar.chord))
}

function pickLineRhythm(meter: CompositionPlan['meter'], lyrical: boolean, contour: ContourId): PhraseRhythmId {
  const ids = (Object.keys(PHRASE_RHYTHMS) as PhraseRhythmId[]).filter((id) => PHRASE_RHYTHMS[id].meter === meter)
  if (!ids.length) throw new Error(`no phrase rhythm for ${meter}`)
  if (lyrical) {
    const long = ids.find((id) => rhythmHasLongTone(id) && !rhythmIsEven(id))
    return long ?? ids.find((id) => rhythmHasLongTone(id)) ?? ids[0]
  }
  if (contour === 'static') return ids.find((id) => rhythmIsEven(id)) ?? ids[0]
  return ids.find((id) => rhythmIsEven(id)) ?? ids[0]
}

function sketchLineDegrees(contour: ContourId, role: BarRoleId, lyrical: boolean): MelodyDegreeId[] {
  const table: Record<ContourId, MelodyDegreeId[]> = {
    arch: ['tonic', 'mediant', 'dominant', 'mediant'],
    rise: ['tonic', 'mediant', 'dominant', 'tonic_high'],
    fall: ['tonic_high', 'dominant', 'mediant', 'tonic'],
    wave: ['tonic', 'submediant', 'mediant', 'dominant'],
    dip: ['mediant', 'tonic', 'supertonic', 'mediant'],
    static: ['mediant', 'mediant', 'dominant', 'mediant'],
    pendulum: ['tonic', 'dominant', 'tonic', 'dominant'],
    leap_fall: ['tonic', 'tonic_high', 'dominant', 'mediant'],
    drop_rise: ['mediant', 'dominant_low', 'tonic', 'mediant'],
  }
  const degrees = [...(table[contour] ?? table.arch)]
  if (lyrical && role !== 'climax' && role !== 'contrast' && role !== 'surprise') {
    degrees[2] = 'rest'
  }
  if (degrees.every((d) => d === 'rest')) degrees[0] = 'tonic'
  return degrees.filter((d) => MELODY_DEGREE_IDS.includes(d))
}

function fakeGuidePhrases(plan: CompositionPlan): NotePhrase[] {
  const lyrical = prefersLongAndRest(plan.character)
  const returns = themeSources(plan.form, plan.bars.length as BarCount, resolveHookBars(plan))
  const phrases: NotePhrase[] = []
  let previousMidi: number | undefined
  let lastNotes: NotePhrase['notes'] | undefined
  let lastRhythm: NotePhrase['rhythm'] | undefined
  for (let i = 0; i < plan.bars.length; i++) {
    const source = returns[i]
    const from = source !== undefined ? phrases[source] : undefined
    const sketch = from?.figure && from.goal ? { figure: from.figure, goal: from.goal } : sketchGuideBar(plan.bars[i].role, plan.bars[i].contour)
    const phrase = realizeJevGuideChoices(sketch, plan, {
      barIndex: i,
      lastSoundingMidi: previousMidi,
      lastNotes,
      lastRhythm,
      lyrical,
      sourceNotes: from?.notes,
    })
    phrases.push(phrase)
    previousMidi = lastSoundingMidi(phrase.notes) ?? previousMidi
    lastNotes = phrase.notes
    lastRhythm = phrase.rhythm
  }
  return phrases
}

function fakeLinePhrases(plan: CompositionPlan): NotePhrase[] {
  const lyrical = prefersLongAndRest(plan.character)
  const returns = themeSources(plan.form, plan.bars.length as BarCount, resolveHookBars(plan))
  const phrases: NotePhrase[] = []
  let previousMidi: number | undefined
  for (let i = 0; i < plan.bars.length; i++) {
    const source = returns[i]
    const from = source !== undefined ? phrases[source] : undefined
    const bar = plan.bars[i]
    const rhythm = from?.rhythm ?? pickLineRhythm(plan.meter, lyrical, bar.contour)
    const degrees = from?.degrees ?? sketchLineDegrees(bar.contour, bar.role, lyrical)
    const phrase = realizeJevNoteChoices({ rhythm, degrees }, plan, {
      barIndex: i,
      lastSoundingMidi: previousMidi,
    })
    phrases.push(phrase)
    previousMidi = lastSoundingMidi(phrase.notes) ?? previousMidi
  }
  return phrases
}

function realizeModes(plan: CompositionPlan, seed: number, phrases?: { guide?: NotePhrase[]; line?: NotePhrase[] }) {
  const code = renderPlan(plan, seed)
  const guidePhrases = phrases?.guide ?? fakeGuidePhrases(plan)
  const linePhrases = phrases?.line ?? fakeLinePhrases(plan)
  const guide = applyNotePhrases(code, guidePhrases)
  const line = applyNotePhrases(code, linePhrases)
  return {
    code: scoreMetrics(code),
    guide: {
      ...scoreMetrics(guide),
      accompanimentSurvived: bassFingerprint(code) === bassFingerprint(guide),
      innerRhPreserved: innerRhCount(guide) >= innerRhCount(code),
      figures: guidePhrases.map((p) => p.figure),
      goals: guidePhrases.map((p) => p.goal),
      restSlots: guidePhrases.filter((p) => p.degrees.includes('rest')).length,
    },
    line: {
      ...scoreMetrics(line),
      accompanimentSurvived: bassFingerprint(code) === bassFingerprint(line),
      innerRhPreserved: innerRhCount(line) >= innerRhCount(code),
      restSlots: linePhrases.filter((p) => p.degrees.includes('rest')).length,
      rhythms: linePhrases.map((p) => p.rhythm),
    },
    picks: {
      guide: guidePhrases.map((p) => ({ figure: p.figure, goal: p.goal, degrees: p.degrees })),
      line: linePhrases.map((p) => ({ rhythm: p.rhythm, degrees: p.degrees })),
    },
  }
}

function loadRefs(): { file: RefFile; plan: CompositionPlan }[] {
  const dir = 'docs/fable-context/reference-plans'
  return readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .map((name) => {
      const file = JSON.parse(readFileSync(`${dir}/${name}`, 'utf8')) as RefFile
      return { file, plan: parsePlan(file.plan) }
    })
}

function scoreLabelMatch(hits: ReturnType<typeof labelHits>): number {
  return Object.values(hits).filter((h) => h.match).length
}

async function maybeLiveJev(styles: StyleId[]) {
  const apiKey = process.env.TYPESAFE_API_KEY?.trim() || process.env.VITE_JEV_API_KEY?.trim()
  if (!apiKey) {
    return { available: false as const, reason: 'no TYPESAFE_API_KEY / VITE_JEV_API_KEY in environment', samples: [] as unknown[] }
  }
  const planner = new JevPlanner(directTransport(apiKey, process.env.TYPESAFE_BASE_URL, process.env.TYPESAFE_MODEL), process.env.TYPESAFE_MODEL)
  const samples: unknown[] = []
  for (const style of styles) {
    try {
      const { plan, trace } = await planner.plan({ style, bars: 16, pick: 'argmax', seed: 1, brief: true })
      const guide = await planner.writeNotes(plan, { pick: 'argmax', seed: 1, brief: true }, { mode: 'guide' })
      const line = await planner.writeNotes(plan, { pick: 'argmax', seed: 1, brief: true }, { mode: 'line' })
      const realized = realizeModes(plan, 1, { guide: guide.phrases, line: line.phrases })
      samples.push({
        style,
        planner: 'jev',
        pick: 'argmax',
        seed: 1,
        model: trace.model,
        requests: { plan: trace.requests, guide: guide.exchanges.length, line: line.exchanges.length },
        labels: labelsOf(plan),
        chords: firstChords(plan),
        realized,
      })
    } catch (error) {
      samples.push({
        style,
        planner: 'jev',
        error: error instanceof Error ? error.message.slice(0, 240) : String(error).slice(0, 240),
      })
    }
  }
  return { available: true as const, reason: 'live TypeSafe via env key (not printed)', samples }
}

async function main() {
  const bars = (Number(arg('--bars') ?? 16) || 16) as BarCount
  const seeds = (arg('--seeds') ?? DEFAULT_SEEDS.join(',')).split(',').map(Number)
  const liveStyles = ((arg('--live-styles') ?? 'chopin,laufey').split(',') as StyleId[]).filter(Boolean)
  const refs = loadRefs()
  const planner = new HeuristicPlanner()
  const byStyle = new Map<StyleId, { file: RefFile; plan: CompositionPlan }[]>()
  for (const row of refs) {
    const list = byStyle.get(row.plan.style) ?? []
    list.push(row)
    byStyle.set(row.plan.style, list)
  }

  const styles = Object.keys(PRIMARY) as StyleId[]
  const perStyle = []
  for (const style of styles) {
    const pack = byStyle.get(style) ?? []
    const primary = pack.find((row) => row.file.id === PRIMARY[style]) ?? pack[0]
    if (!primary) continue
    const wantedPhrasing = proposedPhrasing(primary.file._stretch)
    const midi = primary.file.midi ? midiMetrics(primary.file.midi) : null
    const refRealized = realizeModes(primary.plan, 1)
    const generated = []
    for (const pick of ['argmax', 'sample'] as const) {
      const useSeeds = pick === 'argmax' ? [1] : seeds
      for (const seed of useSeeds) {
        const { plan } = await planner.plan({ style, bars, pick, seed, brief: true })
        const hits = labelHits(plan, primary.plan, wantedPhrasing)
        generated.push({
          planner: 'heuristic',
          pick,
          seed,
          labels: labelsOf(plan),
          chords: firstChords(plan),
          labelHits: hits,
          labelMatchCount: scoreLabelMatch(hits),
          themeReturns: themeSources(plan.form, plan.bars.length as BarCount, resolveHookBars(plan)).filter((x) => x !== undefined).length,
          realized: realizeModes(plan, seed),
        })
      }
    }
    const best = [...generated].sort((a, b) => b.labelMatchCount - a.labelMatchCount)[0]
    perStyle.push({
      style,
      primary: {
        id: primary.file.id,
        piece: primary.file.piece,
        evidence: primary.file.evidence,
        midi: primary.file.midi,
        stretch: primary.file._stretch ?? [],
        proposedPhrasing: wantedPhrasing,
        labels: labelsOf(primary.plan),
        chords: firstChords(primary.plan),
        realized: refRealized,
        midiMetrics: midi,
      },
      others: pack
        .filter((row) => row.file.id !== primary.file.id)
        .map((row) => ({
          id: row.file.id,
          piece: row.file.piece,
          labels: labelsOf(row.plan),
          chords: firstChords(row.plan),
          proposedPhrasing: proposedPhrasing(row.file._stretch),
        })),
      generated,
      best: {
        pick: best.pick,
        seed: best.seed,
        labelMatchCount: best.labelMatchCount,
        labels: best.labels,
        chords: best.chords,
        labelHits: best.labelHits,
        realized: best.realized,
      },
    })
  }

  const live = flag('--live-jev') ? await maybeLiveJev(liveStyles) : { available: false as const, reason: 'not requested (--live-jev off)', samples: [] }

  const payload = {
    generatedAt: new Date().toISOString(),
    note:
      'Heuristic plans are live. Guide/line without --live-jev use fake closed picks through realizeJevGuideChoices / realizeJevNoteChoices (same paths as MusicApp). Metrics are melody-only (Mutopia RH/figure track; generated singing voice) and ret4 starts at the first thematic bar. No MIDI written. No secrets logged.',
    liveJev: { available: live.available, reason: live.reason, styles: live.available ? liveStyles : [], samples: live.samples },
    styles: perStyle,
  }
  const json = JSON.stringify(payload, null, 2)
  const out = arg('--out') ?? '/tmp/generated-vs-reference.json'
  writeFileSync(out, json)
  console.error(`wrote ${out} (${json.length} bytes)`)
  process.stdout.write(json + '\n')
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error)
  process.exit(1)
})
