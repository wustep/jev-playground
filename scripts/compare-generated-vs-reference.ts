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
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const { Midi } = createRequire(import.meta.url)('@tonejs/midi') as typeof import('@tonejs/midi')
import {
  GLOBAL_FIELD_IDS,
  parsePlan,
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
import { keyInfo, resolveChord } from '../src/render/harmony'
import {
  applyNotePhrases,
  lastSoundingMidi,
  realizeJevGuideChoices,
  realizeJevNoteChoices,
  type NotePhrase,
} from '../src/render/jevNotes'
import { midiOf } from '../src/render/pitch'
import { renderPlan } from '../src/render/renderPlan'
import type { Score, Voice } from '../src/render/score'

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

function skyline(voices: Voice[]): { start: number; dur: number; midi: number; pc: number }[] {
  const events: { start: number; dur: number; midi: number; pc: number }[] = []
  for (const voice of voices) {
    for (const note of voice) {
      if (!note.pitches.length) continue
      const midis = note.pitches.map((p) => midiOf(p))
      const top = Math.max(...midis)
      events.push({ start: note.start, dur: note.dur, midi: top, pc: ((top % 12) + 12) % 12 })
    }
  }
  events.sort((a, b) => a.start - b.start || b.midi - a.midi)
  const out: typeof events = []
  for (const event of events) {
    const last = out[out.length - 1]
    if (last && last.start === event.start) continue
    out.push(event)
  }
  return out
}

function occupancy(events: { start: number; dur: number; midi: number }[], ticksPerBar: number, beatTicks: number) {
  const beats = Math.max(1, Math.floor(ticksPerBar / beatTicks))
  let attacked = 0
  let held = 0
  let silent = 0
  for (let beat = 0; beat < beats; beat++) {
    const t = beat * beatTicks
    const covering = events.filter((e) => e.start <= t && e.start + e.dur > t)
    if (covering.some((e) => e.start === t)) attacked += 1
    else if (covering.length) held += 1
    else silent += 1
  }
  return { attacked, held, silent, beats }
}

function barPcs(events: { start: number; dur: number; pc: number }[], ticksPerBar: number, beatTicks: number): number[] {
  const beats = Math.max(1, Math.floor(ticksPerBar / beatTicks))
  const pcs: number[] = []
  for (let beat = 0; beat < beats; beat++) {
    const t = beat * beatTicks
    const covering = events.filter((e) => e.start <= t && e.start + e.dur > t)
    const attack = covering.find((e) => e.start === t) ?? covering[0]
    pcs.push(attack ? attack.pc : -1)
  }
  return pcs
}

function pcMatch(a: number[], b: number[]): number {
  if (!a.length || a.length !== b.length) return 0
  let hits = 0
  let n = 0
  for (let i = 0; i < a.length; i++) {
    if (a[i] < 0 && b[i] < 0) continue
    n += 1
    if (a[i] === b[i] && a[i] >= 0) hits += 1
  }
  return n ? hits / n : 0
}

function shapeOf(midis: number[]): 'rise' | 'fall' | 'arch' | 'static' | 'empty' {
  if (midis.length < 2) return midis.length ? 'static' : 'empty'
  const first = midis[0]
  const last = midis[midis.length - 1]
  const peak = Math.max(...midis)
  const trough = Math.min(...midis)
  if (peak - trough <= 2) return 'static'
  const peakAt = midis.indexOf(peak) / (midis.length - 1)
  if (peakAt > 0.25 && peakAt < 0.75 && peak - first >= 3 && peak - last >= 3) return 'arch'
  if (last - first >= 3) return 'rise'
  if (first - last >= 3) return 'fall'
  return 'static'
}

function leaps(midis: number[]): { mean: number; max: number; overP4: number } {
  if (midis.length < 2) return { mean: 0, max: 0, overP4: 0 }
  const gaps: number[] = []
  for (let i = 1; i < midis.length; i++) gaps.push(Math.abs(midis[i] - midis[i - 1]))
  return {
    mean: Number((gaps.reduce((a, b) => a + b, 0) / gaps.length).toFixed(2)),
    max: Math.max(...gaps),
    overP4: gaps.filter((g) => g > 5).length,
  }
}

function chordToneRate(score: Score): number {
  const key = keyInfo(score.plan.key)
  let tones = 0
  let n = 0
  for (const bar of score.bars.slice(score.introBars)) {
    const chord = resolveChord(key, bar.plan.chord)
    const chord2 = bar.plan.chord2 ? resolveChord(key, bar.plan.chord2) : undefined
    const split = bar.split?.tick ?? score.meter.splitTick
    const pcsOf = (c: typeof chord) => {
      const fromMidi = new Set<number>()
      for (const pc of c.pcs) fromMidi.add(midiOf(`${pc}4`) % 12)
      return fromMidi
    }
    const primary = pcsOf(chord)
    const secondary = chord2 ? pcsOf(chord2) : primary
    for (const event of skyline(bar.treble)) {
      n += 1
      const set = event.start >= split ? secondary : primary
      if (set.has(event.midi % 12)) tones += 1
    }
  }
  return n ? Number((tones / n).toFixed(3)) : 0
}

function bassFingerprint(score: Score): string {
  return score.bars
    .map((bar) =>
      bar.bass
        .flat()
        .map((note) => `${note.start}:${note.dur}:${note.pitches.join(',')}`)
        .join('|'),
    )
    .join('/')
}

function innerRhCount(score: Score): number {
  return score.bars.reduce((n, bar) => n + bar.treble.slice(1).reduce((m, v) => m + v.length, 0), 0)
}

function scoreMetrics(score: Score) {
  const body = score.bars.slice(score.introBars)
  const meter = score.meter
  const barRows = body.map((bar) => {
    const events = skyline(bar.treble)
    return {
      events,
      pcs: barPcs(events, meter.ticksPerBar, meter.beatTicks),
      occ: occupancy(events, meter.ticksPerBar, meter.beatTicks),
      midis: events.map((e) => e.midi),
      bassOnsets: bar.bass.flat().filter((n) => n.pitches.length).length,
    }
  })
  const first16 = barRows.slice(0, 16)
  const silentBeats = first16.reduce((n, row) => n + row.occ.silent, 0)
  const totalBeats = first16.reduce((n, row) => n + row.occ.beats, 0)
  const downAttack = first16.filter((row) => row.events.some((e) => e.start === 0)).length
  const downSilent = first16.filter((row) => !row.events.some((e) => e.start <= 0 && e.start + e.dur > 0)).length
  const downHeld = first16.length - downAttack - downSilent
  const ret4 =
    first16.length >= 8
      ? Number(
          (
            [0, 1, 2, 3].reduce((s, i) => s + pcMatch(first16[i].pcs, first16[i + 4].pcs), 0) / 4
          ).toFixed(3),
        )
      : null
  const ret8 =
    first16.length >= 16
      ? Number(
          (
            [0, 1, 2, 3, 4, 5, 6, 7].reduce((s, i) => s + pcMatch(first16[i].pcs, first16[i + 8].pcs), 0) / 8
          ).toFixed(3),
        )
      : null
  let longestRun = 1
  for (let run = 2; run <= 8; run++) {
    for (let start = 0; start + run * 2 <= first16.length; start++) {
      const later = start + run
      if (later + run > first16.length) continue
      const match =
        Array.from({ length: run }, (_, i) => pcMatch(first16[start + i].pcs, first16[later + i].pcs)).reduce((a, b) => a + b, 0) / run
      if (match >= 0.75) longestRun = Math.max(longestRun, run)
    }
  }
  const midis = first16.flatMap((row) => row.midis)
  const uniqueMidis = new Set(midis)
  const summit = midis.length ? Math.max(...midis) : 0
  const summitHits = midis.filter((m) => m === summit).length
  const bassEarly = first16.slice(0, 4).reduce((n, row) => n + row.bassOnsets, 0) / Math.max(1, Math.min(4, first16.length))
  const bassReturn = first16.slice(8, 12).reduce((n, row) => n + row.bassOnsets, 0) / Math.max(1, first16.slice(8, 12).length)
  const register = midis.length ? Number((midis.reduce((a, b) => a + b, 0) / midis.length).toFixed(1)) : 0
  return {
    barsMeasured: first16.length,
    meter: meter.id,
    silentBeatPct: totalBeats ? Number((silentBeats / totalBeats).toFixed(3)) : 0,
    downbeats: { attacked: downAttack, held: downHeld, silent: downSilent, n: first16.length },
    longestReturnRun: longestRun,
    ret4,
    ret8,
    chordToneRate: chordToneRate(score),
    leaps: leaps(midis),
    contour: shapeOf(first16.slice(0, 8).map((row) => (row.midis.length ? row.midis.reduce((a, b) => a + b, 0) / row.midis.length : 0))),
    registerMean: register,
    registerMin: midis.length ? Math.min(...midis) : 0,
    registerMax: summit,
    summitHits,
    uniqueMelodyPcs: uniqueMidis.size,
    bassOnsetsEarly: Number(bassEarly.toFixed(2)),
    bassOnsetsReturn: Number(bassReturn.toFixed(2)),
    introBars: score.introBars,
    innerRhNotes: innerRhCount(score),
  }
}

function midiMetrics(path: string, barsWanted = 16) {
  const midi = new Midi(readFileSync(path))
  const ts = midi.header.timeSignatures[0]?.timeSignature ?? [4, 4]
  const num = ts[0] ?? 4
  const den = ts[1] ?? 4
  const ppq = midi.header.ppq
  const ticksPerBar = ppq * num * (4 / den)
  const beatTicks = den === 8 ? ppq * 1.5 : ppq
  const notes = midi.tracks.flatMap((track, trackIndex) =>
    track.notes.map((note) => ({
      ticks: note.ticks,
      durationTicks: note.durationTicks,
      midi: note.midi,
      trackIndex,
    })),
  )
  if (!notes.length) {
    return { error: 'empty midi', path }
  }
  const start = Math.min(...notes.map((n) => n.ticks))
  const rows = []
  for (let i = 0; i < barsWanted; i++) {
    const barStart = start + i * ticksPerBar
    const inBar = notes.filter((n) => n.ticks >= barStart && n.ticks < barStart + ticksPerBar)
    const events = inBar
      .map((n) => ({
        start: n.ticks - barStart,
        dur: n.durationTicks,
        midi: n.midi,
        pc: n.midi % 12,
      }))
      .sort((a, b) => a.start - b.start || b.midi - a.midi)
    const sky: typeof events = []
    for (const event of events) {
      const last = sky[sky.length - 1]
      if (last && last.start === event.start) continue
      sky.push(event)
    }
    rows.push({
      events: sky,
      pcs: barPcs(sky, ticksPerBar, beatTicks),
      occ: occupancy(sky, ticksPerBar, beatTicks),
      midis: sky.map((e) => e.midi),
      onsets: events.length,
    })
  }
  const silentBeats = rows.reduce((n, row) => n + row.occ.silent, 0)
  const totalBeats = rows.reduce((n, row) => n + row.occ.beats, 0)
  const midis = rows.flatMap((row) => row.midis)
  const ret4 =
    rows.length >= 8
      ? Number(([0, 1, 2, 3].reduce((s, i) => s + pcMatch(rows[i].pcs, rows[i + 4].pcs), 0) / 4).toFixed(3))
      : null
  const ret8 =
    rows.length >= 16
      ? Number(([0, 1, 2, 3, 4, 5, 6, 7].reduce((s, i) => s + pcMatch(rows[i].pcs, rows[i + 8].pcs), 0) / 8).toFixed(3))
      : null
  let longestRun = 1
  for (let run = 2; run <= 8; run++) {
    for (let startBar = 0; startBar + run * 2 <= rows.length; startBar++) {
      const later = startBar + run
      const match =
        Array.from({ length: run }, (_, i) => pcMatch(rows[startBar + i].pcs, rows[later + i].pcs)).reduce((a, b) => a + b, 0) / run
      if (match >= 0.75) longestRun = Math.max(longestRun, run)
    }
  }
  return {
    path,
    tracks: midi.tracks.length,
    meter: `${num}/${den}`,
    barsMeasured: rows.length,
    silentBeatPct: totalBeats ? Number((silentBeats / totalBeats).toFixed(3)) : 0,
    downbeats: {
      attacked: rows.filter((row) => row.events.some((e) => e.start === 0)).length,
      n: rows.length,
    },
    longestReturnRun: longestRun,
    ret4,
    ret8,
    leaps: leaps(midis),
    registerMean: midis.length ? Number((midis.reduce((a, b) => a + b, 0) / midis.length).toFixed(1)) : 0,
    registerMin: midis.length ? Math.min(...midis) : 0,
    registerMax: midis.length ? Math.max(...midis) : 0,
    summitHits: midis.length ? midis.filter((m) => m === Math.max(...midis)).length : 0,
    onsetDensityEarly: Number((rows.slice(0, 4).reduce((n, r) => n + r.onsets, 0) / 4).toFixed(2)),
    onsetDensityReturn: Number((rows.slice(8, 12).reduce((n, r) => n + r.onsets, 0) / Math.max(1, rows.slice(8, 12).length)).toFixed(2)),
  }
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
  const returns = themeSources(plan.form, plan.bars.length as BarCount)
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
  const returns = themeSources(plan.form, plan.bars.length as BarCount)
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
          themeReturns: themeSources(plan.form, plan.bars.length as BarCount).filter((x) => x !== undefined).length,
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
      'Heuristic plans are live. Guide/line without --live-jev use fake closed picks through realizeJevGuideChoices / realizeJevNoteChoices (same paths as MusicApp). No MIDI written. No secrets logged.',
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
