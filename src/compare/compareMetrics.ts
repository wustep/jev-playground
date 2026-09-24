/**
 * Generated-vs-reference ear metrics.
 *
 * Two measurement rules (ZOOMOUT_POST_48 item 1):
 *
 * 1. Score the **melody**, not the combined skyline of both hands.
 *    - Reference MIDI: split by Mutopia *staff track* (see `splitMidiHands`).
 *    - Generated Score: the singing / top melody voice only — `treble[0]`
 *      after overlay rules, never max-of-all-onsets across both staves.
 *
 * 2. `ret4` / `ret8` / longest return start at the first **thematic** bar
 *    (skip pickup, vamp, tacet, and prelude bars that are not the theme).
 *
 * Mutopia piano encodings in `docs/ref-midi/public/` are one track per
 * engraved staff, not a voice analysis. Names decide the hand:
 *
 *   melody / figure  — upper, up, rh, right, one, soprano, treble
 *   accompaniment    — lower, down, lh, left, two, bass, bottom
 *
 * Track *index* is not reliable (BWV 846 puts `lower` on track 0). Channel
 * numbers are not reliable either (some files 0/1, others 1/2). The rule is
 * right for these committed files (checked against the `.ly` staves) and
 * would not generalise to an arbitrary MIDI.
 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { basename } from 'node:path'

const { Midi } = createRequire(import.meta.url)('@tonejs/midi') as typeof import('@tonejs/midi')
import { keyInfo, resolveChord } from '../render/harmony'
import { midiOf } from '../render/pitch'
import type { Bar, Score, Voice } from '../render/score'

export interface SkyEvent {
  start: number
  dur: number
  midi: number
  pc: number
}

export interface Occupancy {
  attacked: number
  held: number
  silent: number
  beats: number
}

export interface MelodyBarRow {
  events: SkyEvent[]
  pcs: number[]
  occ: Occupancy
  midis: number[]
  onsets: number
  bassOnsets?: number
}

export interface MidiTrackLike {
  name?: string
  notes: { ticks: number; durationTicks: number; midi: number }[]
}

export type MutopiaHand = 'melody' | 'accompaniment'

/** Staff-name tokens Mutopia uses for the upper (melody / figure) staff. */
const MELODY_NAME = /\b(upper|up|rh|right|one|soprano|melody|treble|figure)\b/i
/** Staff-name tokens Mutopia uses for the lower (accompaniment) staff. */
const ACCOMP_NAME = /\b(lower|down|lh|left|two|bass|bottom)\b/i

/**
 * Piece-specific first thematic bar (0-based, after pickup alignment).
 * Debussy Arabesque: the tune is `s1 | s1` then enters — two silent melody
 * bars that the upper-staff track still fills with arpeggio.
 */
export const MIDI_THEMATIC_START_BAR: Record<string, number> = {
  'debussy-l66-arabesque-1.mid': 2,
}

export function classifyMutopiaHand(name: string | undefined): MutopiaHand | 'unknown' {
  const text = name?.trim() ?? ''
  if (!text) return 'unknown'
  const melody = MELODY_NAME.test(text)
  const accomp = ACCOMP_NAME.test(text)
  if (melody && !accomp) return 'melody'
  if (accomp && !melody) return 'accompaniment'
  return 'unknown'
}

function trackMean(track: MidiTrackLike): number {
  if (!track.notes.length) return 0
  return track.notes.reduce((sum, note) => sum + note.midi, 0) / track.notes.length
}

/**
 * Split a Mutopia piano MIDI into melody (RH / figure) vs accompaniment (LH).
 * Prefer staff names; fall back to the higher-mean note-bearing track.
 */
export function splitMidiHands(tracks: readonly MidiTrackLike[]): {
  melodyIndex: number
  accompanimentIndex: number | null
  rule: string
  melody: MidiTrackLike
  accompaniment: MidiTrackLike | null
} {
  const sounding = tracks
    .map((track, index) => ({ track, index, hand: classifyMutopiaHand(track.name), notes: track.notes.length }))
    .filter((row) => row.notes > 0)
  if (!sounding.length) {
    throw new Error('splitMidiHands: no sounding tracks')
  }

  const namedMelody = sounding.find((row) => row.hand === 'melody')
  const namedAccomp = sounding.find((row) => row.hand === 'accompaniment')
  if (namedMelody) {
    const accompaniment = namedAccomp ?? sounding.find((row) => row.index !== namedMelody.index) ?? null
    return {
      melodyIndex: namedMelody.index,
      accompanimentIndex: accompaniment?.index ?? null,
      rule: `mutopia-staff-name: ${namedMelody.track.name ?? '(named melody)'}`,
      melody: namedMelody.track,
      accompaniment: accompaniment?.track ?? null,
    }
  }

  if (namedAccomp && sounding.length >= 2) {
    const melody = sounding.find((row) => row.index !== namedAccomp.index)!
    return {
      melodyIndex: melody.index,
      accompanimentIndex: namedAccomp.index,
      rule: `mutopia-staff-name: accompaniment=${namedAccomp.track.name ?? ''}; other track is melody`,
      melody: melody.track,
      accompaniment: namedAccomp.track,
    }
  }

  const ranked = [...sounding].sort((a, b) => trackMean(b.track) - trackMean(a.track))
  const melody = ranked[0]
  const accompaniment = ranked[1] ?? null
  return {
    melodyIndex: melody.index,
    accompanimentIndex: accompaniment?.index ?? null,
    rule: 'fallback-higher-mean-track (no Mutopia staff name)',
    melody: melody.track,
    accompaniment: accompaniment?.track ?? null,
  }
}

export function skyline(voices: Voice[]): SkyEvent[] {
  const events: SkyEvent[] = []
  for (const voice of voices) {
    for (const note of voice) {
      if (!note.pitches.length) continue
      const midis = note.pitches.map((p) => midiOf(p))
      const top = Math.max(...midis)
      events.push({ start: note.start, dur: note.dur, midi: top, pc: ((top % 12) + 12) % 12 })
    }
  }
  events.sort((a, b) => a.start - b.start || b.midi - a.midi)
  const out: SkyEvent[] = []
  for (const event of events) {
    const last = out[out.length - 1]
    if (last && last.start === event.start) continue
    out.push(event)
  }
  return out
}

export function occupancy(events: { start: number; dur: number; midi: number }[], ticksPerBar: number, beatTicks: number): Occupancy {
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

export function barPcs(events: { start: number; dur: number; pc: number }[], ticksPerBar: number, beatTicks: number): number[] {
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

export function pcMatch(a: number[], b: number[]): number {
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

export function shapeOf(midis: number[]): 'rise' | 'fall' | 'arch' | 'static' | 'empty' {
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

export function leaps(midis: number[]): { mean: number; max: number; overP4: number } {
  if (midis.length < 2) return { mean: 0, max: 0, overP4: 0 }
  const gaps: number[] = []
  for (let i = 1; i < midis.length; i++) gaps.push(Math.abs(midis[i] - midis[i - 1]))
  return {
    mean: Number((gaps.reduce((a, b) => a + b, 0) / gaps.length).toFixed(2)),
    max: Math.max(...gaps),
    overP4: gaps.filter((g) => g > 5).length,
  }
}

/** True when a later body bar splits the treble into singing + inner/roll. */
export function scoreHasSplitTreble(score: Score): boolean {
  return score.bars.slice(0).some((bar) => bar.treble.length >= 2)
}

export function firstSplitTrebleBar(score: Score): Bar | undefined {
  return score.bars.slice(0).find((bar) => bar.treble.length >= 2)
}

function meanMidi(voices: Voice[]): number | null {
  const events = skyline(voices)
  if (!events.length) return null
  return events.reduce((sum, event) => sum + event.midi, 0) / events.length
}

/**
 * Opening tacet: the only treble voice is the same roll that later sits under
 * a sung line (`rolling_nocturne` bar 0). Not every 1-voice bar — a late
 * doubled climax must not erase Bach's figure or a Guide overlay on that bar.
 */
export function isTacetAccompanimentBar(bar: Bar, firstSplit?: Bar): boolean {
  const inner = firstSplit?.treble[1]
  if (bar.treble.length >= 2 || !bar.treble[0]?.length || !inner?.length) return false
  if (firstSplit && bar.index >= firstSplit.index) return false
  // The roll fills the bar; an overlaid / figure-as-tune line is a handful of notes.
  if (bar.treble[0].length < 6) return false
  const topMean = meanMidi([bar.treble[0]])
  const innerMean = meanMidi([inner])
  if (topMean == null || innerMean == null) return false
  return Math.abs(topMean - innerMean) <= 4
}

/**
 * Singing / top melody voice after overlay rules.
 * Two treble voices → `treble[0]` is the sung line (chordal skyline = top pitch).
 * One treble voice that matches a later inner roll → accompaniment-only tacet.
 * Otherwise the single voice *is* the figure / chorale / overlaid tune.
 */
export function singingVoices(bar: Bar, firstSplit?: Bar): Voice[] {
  if (bar.treble.length >= 2) return bar.treble[0] ? [bar.treble[0]] : []
  if (isTacetAccompanimentBar(bar, firstSplit)) return []
  return bar.treble[0] ? [bar.treble[0]] : []
}

export function accompanimentOfBar(bar: Bar): Voice[] {
  const inner = bar.treble.length >= 2 ? bar.treble.slice(1) : []
  return [...inner, ...bar.bass]
}

export function isPickupOnlyBar(events: { start: number }[], ticksPerBar: number, beatTicks: number): boolean {
  if (!events.length) return false
  const earliest = Math.min(...events.map((e) => e.start))
  return earliest >= ticksPerBar - beatTicks && events.every((e) => e.start >= ticksPerBar - beatTicks)
}

/**
 * First bar of the theme: skip leading silence and pickup-only bars.
 * Intro / vamp bars should already have been sliced off the row list.
 */
export function firstThematicBarIndex(
  rows: { events: { start: number }[] }[],
  ticksPerBar: number,
  beatTicks: number,
): number {
  for (let i = 0; i < rows.length; i++) {
    const events = rows[i].events
    if (!events.length) continue
    if (isPickupOnlyBar(events, ticksPerBar, beatTicks)) continue
    return i
  }
  return 0
}

/**
 * Align MIDI bar 0 to the first downbeat, not the first anacrusis onset.
 * Chopin Op. 9/2: RH pickup eighth at tick 0, LH (and theme) at 192.
 * Bach BWV 846: figure starts off the beat *after* the LH — not a pickup.
 */
export function midiPickupAlignTicks(opts: {
  melodyFirstTick: number
  accompanimentFirstTick: number | null
  ticksPerBar: number
  beatTicks: number
}): { start: number; reason: string } {
  const melody = opts.melodyFirstTick
  const accomp = opts.accompanimentFirstTick
  if (accomp != null && melody < accomp && accomp - melody <= opts.beatTicks && accomp - melody < opts.ticksPerBar) {
    return { start: accomp, reason: 'pickup-anacrusis (melody before accompaniment by ≤ one beat)' }
  }
  return { start: Math.min(melody, accomp ?? melody), reason: 'first-onset' }
}

export function midiThematicStartOverride(midiPath: string): number | undefined {
  return MIDI_THEMATIC_START_BAR[basename(midiPath)]
}

function rowsFromEvents(
  bars: { events: SkyEvent[]; onsets: number; bassOnsets?: number }[],
  ticksPerBar: number,
  beatTicks: number,
): MelodyBarRow[] {
  return bars.map((bar) => ({
    events: bar.events,
    pcs: barPcs(bar.events, ticksPerBar, beatTicks),
    occ: occupancy(bar.events, ticksPerBar, beatTicks),
    midis: bar.events.map((e) => e.midi),
    onsets: bar.onsets,
    bassOnsets: bar.bassOnsets,
  }))
}

function skylineFromOnsets(onsets: { start: number; dur: number; midi: number }[]): SkyEvent[] {
  const events = onsets
    .map((n) => ({ start: n.start, dur: n.dur, midi: n.midi, pc: ((n.midi % 12) + 12) % 12 }))
    .sort((a, b) => a.start - b.start || b.midi - a.midi)
  const sky: SkyEvent[] = []
  for (const event of events) {
    const last = sky[sky.length - 1]
    if (last && last.start === event.start) continue
    sky.push(event)
  }
  return sky
}

export function returnAlignment(rows: MelodyBarRow[]): {
  ret4: number | null
  ret8: number | null
  longestReturnRun: number
} {
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
    for (let start = 0; start + run * 2 <= rows.length; start++) {
      const later = start + run
      if (later + run > rows.length) continue
      const match =
        Array.from({ length: run }, (_, i) => pcMatch(rows[start + i].pcs, rows[later + i].pcs)).reduce((a, b) => a + b, 0) / run
      if (match >= 0.75) longestRun = Math.max(longestRun, run)
    }
  }
  return { ret4, ret8, longestReturnRun: longestRun }
}

function summarizeRows(rows: MelodyBarRow[]) {
  const silentBeats = rows.reduce((n, row) => n + row.occ.silent, 0)
  const totalBeats = rows.reduce((n, row) => n + row.occ.beats, 0)
  const downAttack = rows.filter((row) => row.events.some((e) => e.start === 0)).length
  const downSilent = rows.filter((row) => !row.events.some((e) => e.start <= 0 && e.start + e.dur > 0)).length
  const downHeld = rows.length - downAttack - downSilent
  const midis = rows.flatMap((row) => row.midis)
  const uniqueMidis = new Set(midis)
  const summit = midis.length ? Math.max(...midis) : 0
  const returns = returnAlignment(rows)
  const bassEarly = rows.slice(0, 4).reduce((n, row) => n + (row.bassOnsets ?? 0), 0) / Math.max(1, Math.min(4, rows.length))
  const bassReturn = rows.slice(8, 12).reduce((n, row) => n + (row.bassOnsets ?? 0), 0) / Math.max(1, rows.slice(8, 12).length)
  const onsetEarly = rows.slice(0, 4).reduce((n, row) => n + row.onsets, 0) / Math.max(1, Math.min(4, rows.length))
  const onsetReturn = rows.slice(8, 12).reduce((n, row) => n + row.onsets, 0) / Math.max(1, rows.slice(8, 12).length)
  return {
    barsMeasured: rows.length,
    silentBeatPct: totalBeats ? Number((silentBeats / totalBeats).toFixed(3)) : 0,
    downbeats: { attacked: downAttack, held: downHeld, silent: downSilent, n: rows.length },
    ...returns,
    leaps: leaps(midis),
    contour: shapeOf(rows.slice(0, 8).map((row) => (row.midis.length ? row.midis.reduce((a, b) => a + b, 0) / row.midis.length : 0))),
    registerMean: midis.length ? Number((midis.reduce((a, b) => a + b, 0) / midis.length).toFixed(1)) : 0,
    registerMin: midis.length ? Math.min(...midis) : 0,
    registerMax: summit,
    summitHits: midis.filter((m) => m === summit).length,
    uniqueMelodyPcs: uniqueMidis.size,
    bassOnsetsEarly: Number(bassEarly.toFixed(2)),
    bassOnsetsReturn: Number(bassReturn.toFixed(2)),
    onsetDensityEarly: Number(onsetEarly.toFixed(2)),
    onsetDensityReturn: Number(onsetReturn.toFixed(2)),
  }
}

function chordToneRate(score: Score, firstSplit?: Bar): number {
  const key = keyInfo(score.plan.key)
  let tones = 0
  let n = 0
  for (const bar of score.bars.slice(0)) {
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
    for (const event of skyline(singingVoices(bar, firstSplit))) {
      n += 1
      const set = event.start >= split ? secondary : primary
      if (set.has(event.midi % 12)) tones += 1
    }
  }
  return n ? Number((tones / n).toFixed(3)) : 0
}

export function bassFingerprint(score: Score): string {
  return score.bars
    .map((bar) =>
      bar.bass
        .flat()
        .map((note) => `${note.start}:${note.dur}:${note.pitches.join(',')}`)
        .join('|'),
    )
    .join('/')
}

export function innerRhCount(score: Score): number {
  return score.bars.reduce((n, bar) => n + bar.treble.slice(1).reduce((m, v) => m + v.length, 0), 0)
}

export function scoreMetrics(score: Score) {
  const body = score.bars.slice(0)
  const meter = score.meter
  const splitTreble = scoreHasSplitTreble(score)
  const firstSplit = firstSplitTrebleBar(score)
  const melodyRows = rowsFromEvents(
    body.map((bar) => {
      const voices = singingVoices(bar, firstSplit)
      const events = skyline(voices)
      return {
        events,
        onsets: voices.reduce((n, voice) => n + voice.filter((note) => note.pitches.length).length, 0),
        bassOnsets: bar.bass.flat().filter((n) => n.pitches.length).length,
      }
    }),
    meter.ticksPerBar,
    meter.beatTicks,
  )
  const combinedRows = rowsFromEvents(
    body.map((bar) => {
      const events = skyline(bar.treble)
      return { events, onsets: events.length }
    }),
    meter.ticksPerBar,
    meter.beatTicks,
  )
  const accompRows = rowsFromEvents(
    body.map((bar) => {
      const events = skyline(accompanimentOfBar(bar))
      return { events, onsets: events.length }
    }),
    meter.ticksPerBar,
    meter.beatTicks,
  )
  const thematicStartBar = firstThematicBarIndex(melodyRows, meter.ticksPerBar, meter.beatTicks)
  const measured = melodyRows.slice(thematicStartBar, thematicStartBar + 16)
  const combinedMeasured = combinedRows.slice(0, 16)
  const accompMeasured = accompRows.slice(thematicStartBar, thematicStartBar + 16)
  const melody = summarizeRows(measured)
  const combined = summarizeRows(combinedMeasured)
  const accompaniment = summarizeRows(accompMeasured)
  return {
    ...melody,
    meter: meter.id,
    chordToneRate: chordToneRate(score, firstSplit),
    introBars: 0,
    innerRhNotes: innerRhCount(score),
    voice: 'singing-treble' as const,
    splitTreble,
    thematicStartBar,
    thematicStartReason: thematicStartBar === 0 ? 'bar-0-is-theme' : 'skipped-leading-silence-or-pickup',
    combinedSkyline: {
      registerMean: combined.registerMean,
      silentBeatPct: combined.silentBeatPct,
      downbeats: combined.downbeats,
      ret4: combined.ret4,
      ret8: combined.ret8,
    },
    accompaniment: {
      registerMean: accompaniment.registerMean,
      silentBeatPct: accompaniment.silentBeatPct,
      downbeats: accompaniment.downbeats,
      onsetDensityEarly: accompaniment.onsetDensityEarly,
      onsetDensityReturn: accompaniment.onsetDensityReturn,
      bassOnsetsEarly: melody.bassOnsetsEarly,
      bassOnsetsReturn: melody.bassOnsetsReturn,
    },
  }
}

function midiBarOnsets(
  notes: { ticks: number; durationTicks: number; midi: number }[],
  start: number,
  barsWanted: number,
  ticksPerBar: number,
) {
  const bars = []
  for (let i = 0; i < barsWanted; i++) {
    const barStart = start + i * ticksPerBar
    const inBar = notes.filter((n) => n.ticks >= barStart && n.ticks < barStart + ticksPerBar)
    const raw = inBar.map((n) => ({ start: n.ticks - barStart, dur: n.durationTicks, midi: n.midi }))
    bars.push({ events: skylineFromOnsets(raw), onsets: raw.length })
  }
  return bars
}

export function midiMetrics(path: string, barsWanted = 16) {
  const midi = new Midi(readFileSync(path))
  const ts = midi.header.timeSignatures[0]?.timeSignature ?? [4, 4]
  const num = ts[0] ?? 4
  const den = ts[1] ?? 4
  const ppq = midi.header.ppq
  const ticksPerBar = ppq * num * (4 / den)
  const beatTicks = den === 8 ? ppq * 1.5 : ppq
  const tracks: MidiTrackLike[] = midi.tracks.map((track) => ({
    name: track.name,
    notes: track.notes.map((note) => ({ ticks: note.ticks, durationTicks: note.durationTicks, midi: note.midi })),
  }))
  const sounding = tracks.flatMap((track) => track.notes)
  if (!sounding.length) {
    return { error: 'empty midi', path }
  }

  const hands = splitMidiHands(tracks)
  const melodyFirst = Math.min(...hands.melody.notes.map((n) => n.ticks))
  const accompFirst = hands.accompaniment?.notes.length
    ? Math.min(...hands.accompaniment.notes.map((n) => n.ticks))
    : null
  const align = midiPickupAlignTicks({
    melodyFirstTick: melodyFirst,
    accompanimentFirstTick: accompFirst,
    ticksPerBar,
    beatTicks,
  })
  const load = Math.max(barsWanted + 8, 24)
  const melodyBars = midiBarOnsets(hands.melody.notes, align.start, load, ticksPerBar)
  const accompBars = midiBarOnsets(hands.accompaniment?.notes ?? [], align.start, load, ticksPerBar)
  const allNotes = tracks.flatMap((track) => track.notes)
  const combinedStart = Math.min(...allNotes.map((n) => n.ticks))
  const combinedBars = midiBarOnsets(allNotes, combinedStart, barsWanted, ticksPerBar)

  const melodyRows = rowsFromEvents(melodyBars, ticksPerBar, beatTicks)
  const accompRows = rowsFromEvents(accompBars, ticksPerBar, beatTicks)
  const combinedRows = rowsFromEvents(combinedBars, ticksPerBar, beatTicks)

  const detected = firstThematicBarIndex(melodyRows, ticksPerBar, beatTicks)
  const override = midiThematicStartOverride(path)
  const thematicStartBar = override ?? detected
  const measured = melodyRows.slice(thematicStartBar, thematicStartBar + barsWanted)
  const accompMeasured = accompRows.slice(thematicStartBar, thematicStartBar + barsWanted)
  const melody = summarizeRows(measured)
  const accompaniment = summarizeRows(accompMeasured)
  const combined = summarizeRows(combinedRows)

  return {
    path,
    tracks: midi.tracks.length,
    meter: `${num}/${den}`,
    ...melody,
    voice: 'mutopia-melody-track' as const,
    handSplit: {
      rule: hands.rule,
      melodyIndex: hands.melodyIndex,
      melodyName: hands.melody.name ?? '',
      accompanimentIndex: hands.accompanimentIndex,
      accompanimentName: hands.accompaniment?.name ?? '',
      align: align.reason,
      alignStartTick: align.start,
    },
    thematicStartBar,
    thematicStartReason:
      override != null
        ? `mutopia-override:${basename(path)}`
        : thematicStartBar === 0
          ? 'bar-0-is-theme'
          : 'skipped-leading-silence-or-pickup',
    combinedSkyline: {
      registerMean: combined.registerMean,
      silentBeatPct: combined.silentBeatPct,
      downbeats: { attacked: combined.downbeats.attacked, n: combined.downbeats.n },
      ret4: combined.ret4,
      ret8: combined.ret8,
    },
    accompaniment: {
      registerMean: accompaniment.registerMean,
      silentBeatPct: accompaniment.silentBeatPct,
      downbeats: accompaniment.downbeats,
      onsetDensityEarly: accompaniment.onsetDensityEarly,
      onsetDensityReturn: accompaniment.onsetDensityReturn,
    },
  }
}
