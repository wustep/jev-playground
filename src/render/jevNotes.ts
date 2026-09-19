// Debug-only overlay: Jev's closed-schema RH melody + LH bass on top of renderPlan.
//
// The default Generate path is unchanged (labels → renderPlan). When this
// module is asked to apply phrases it validates every tick and pitch against
// the enums / spelled-pitch grammar; illegal RH throws so the caller can fall
// back to the code renderer. Illegal bass on one bar keeps that bar's
// renderPlan left hand and records a notice.
//
// One NotePhrase is one plan bar. Callers overlay every targeted bar; the
// Debug Notes:jev path writes both staves (theme-return bars reuse the
// source bar's rhythm, degrees and bass pattern, re-spelled on the later chord).

import {
  BASS_PATTERNS,
  NOTE_TICKS,
  PHRASE_NOTE_COUNT,
  PHRASE_RHYTHMS,
  isNoteTick,
  parseBassPattern,
  parseJevNoteChoices,
  parseNoteTick,
  parseSpelledPitch,
  startsFromRhythm,
  type BassPatternId,
  type JevNoteChoices,
  type MelodyDegreeId,
  type PhraseRhythmId,
} from '../plan/notes.js'
import { PlanValidationError, type CompositionPlan } from '../plan/schema.js'
import { keyInfo, resolveChord, scaleFor, type KeyInfo, type ResolvedChord } from './harmony'
import { midiOf, nearestIndex, ladder } from './pitch'
import { renderPlan } from './renderPlan'
import { scoreBarForPlan, METER_INFO, type Note, type Score, type Voice } from './score'

export class JevNotesError extends Error {}

const TREBLE_LO = 55
const TREBLE_HI = 84
const BASS_LO = 28
const BASS_HI = 55
const DEFAULT_VELOCITY = 72
const DEFAULT_BASS_VELOCITY = 64
const DEFAULT_TREBLE_MIDI = 67
const DEFAULT_BASS_MIDI = 48

export interface PitchRange {
  lo: number
  hi: number
}

const DEGREE_STEPS: Record<Exclude<MelodyDegreeId, 'rest'>, { degree: number; octave: number }> = {
  tonic: { degree: 0, octave: 0 },
  supertonic: { degree: 1, octave: 0 },
  mediant: { degree: 2, octave: 0 },
  subdominant: { degree: 3, octave: 0 },
  dominant: { degree: 4, octave: 0 },
  submediant: { degree: 5, octave: 0 },
  leading: { degree: 6, octave: 0 },
  tonic_high: { degree: 0, octave: 1 },
  dominant_low: { degree: 4, octave: -1 },
  mediant_high: { degree: 2, octave: 1 },
}

export interface BassPhrase {
  pattern: BassPatternId
  notes: Voice
}

export interface NotePhrase {
  barIndex: number
  voice: 'treble'
  rhythm: PhraseRhythmId
  degrees: MelodyDegreeId[]
  notes: Voice
  bass?: BassPhrase
}

/** True when every plan bar has a phrase to overlay. A stale 1-bar cache is not enough. */
export function notePhrasesCoverPlan(phrases: readonly NotePhrase[] | null | undefined, barCount: number): boolean {
  if (!phrases || barCount <= 0 || phrases.length < barCount) return false
  const covered = new Set(phrases.map((phrase) => phrase.barIndex))
  for (let i = 0; i < barCount; i++) {
    if (!covered.has(i)) return false
  }
  return true
}

function asPhraseList(phrases: readonly NotePhrase[] | null | undefined): NotePhrase[] {
  return phrases?.length ? [...phrases] : []
}

export function parseScoreNote(raw: unknown, path: string, ticksPerBar: number, range: PitchRange = { lo: TREBLE_LO, hi: TREBLE_HI }): Note {
  if (!raw || typeof raw !== 'object') throw new PlanValidationError(`${path}: expected a note object`)
  const obj = raw as Record<string, unknown>
  const start = obj.start
  if (typeof start !== 'number' || !Number.isInteger(start) || start < 0 || start >= ticksPerBar) {
    throw new PlanValidationError(`${path}.start: expected an integer tick in 0..${ticksPerBar - 1}`)
  }
  const dur = parseNoteTick(obj.dur, `${path}.dur`)
  if (start + dur > ticksPerBar) {
    throw new PlanValidationError(`${path}: duration ${dur} from tick ${start} crosses the barline (${ticksPerBar} ticks)`)
  }
  if (!Array.isArray(obj.pitches)) throw new PlanValidationError(`${path}.pitches: expected an array`)
  const pitches = obj.pitches.map((pitch, i) => {
    const spelled = parseSpelledPitch(pitch, `${path}.pitches[${i}]`)
    let midi: number
    try {
      midi = midiOf(spelled)
    } catch {
      throw new PlanValidationError(`${path}.pitches[${i}]: "${spelled}" is not a pitch`)
    }
    if (midi < range.lo || midi > range.hi) {
      throw new PlanValidationError(`${path}.pitches[${i}]: "${spelled}" is outside the ${range.lo === BASS_LO ? 'bass' : 'treble'} range`)
    }
    return spelled
  })
  const velocity = obj.velocity
  if (velocity !== undefined && (typeof velocity !== 'number' || !Number.isInteger(velocity) || velocity < 1 || velocity > 127)) {
    throw new PlanValidationError(`${path}.velocity: expected an integer 1–127`)
  }
  return { start, dur, pitches, velocity: typeof velocity === 'number' ? velocity : DEFAULT_VELOCITY }
}

/** Validate a monophonic voice on the existing Score note shape. */
export function parseScoreVoice(raw: unknown, ticksPerBar: number, range?: PitchRange): Voice {
  if (!Array.isArray(raw)) throw new PlanValidationError('notes: expected an array of notes')
  const notes = raw.map((note, i) => parseScoreNote(note, `notes[${i}]`, ticksPerBar, range)).sort((a, b) => a.start - b.start)
  for (let i = 1; i < notes.length; i++) {
    const previous = notes[i - 1]
    if (previous.start + previous.dur > notes[i].start) {
      throw new PlanValidationError(`notes[${i}]: overlaps the previous note`)
    }
  }
  return notes
}

export function assertVoiceFillsBar(notes: Voice, ticksPerBar: number, path: string): void {
  const covered = notes.reduce((sum, note) => sum + note.dur, 0)
  if (notes.length === 0) throw new JevNotesError(`${path}: no sounding notes`)
  const last = notes[notes.length - 1]
  if (last.start + last.dur > ticksPerBar) {
    throw new PlanValidationError(`${path}: duration crosses the barline`)
  }
  if (covered > ticksPerBar) throw new PlanValidationError(`${path}: durations do not fit the bar`)
}

export function spellDegree(degree: MelodyDegreeId, scale: string[], targetMidi: number): string | null {
  if (degree === 'rest') return null
  if (scale.length === 0) throw new JevNotesError('notes: scale is empty')
  const spec = DEGREE_STEPS[degree]
  const pc = scale[((spec.degree % scale.length) + scale.length) % scale.length]
  const rungs = ladder([pc], TREBLE_LO, TREBLE_HI)
  if (rungs.length === 0) throw new JevNotesError(`notes: no ${pc} in the treble range`)
  return rungs[nearestIndex(rungs, targetMidi + spec.octave * 12)]
}

function spellPc(pc: string, targetMidi: number, range: PitchRange): string {
  const rungs = ladder([pc], range.lo, range.hi)
  if (rungs.length === 0) throw new JevNotesError(`notes: no ${pc} in range ${range.lo}–${range.hi}`)
  return rungs[nearestIndex(rungs, targetMidi)]
}

function chordFifth(chord: ResolvedChord): string {
  return chord.pcs[2] ?? chord.root
}

function chordThird(chord: ResolvedChord): string {
  return chord.pcs[1] ?? chord.root
}

function scaleIndex(scale: readonly string[], pc: string): number {
  const chroma = midiOf(`${pc}4`) % 12
  const found = scale.findIndex((tone) => midiOf(`${tone}4`) % 12 === chroma)
  return found >= 0 ? found : 0
}

function walkPc(scale: readonly string[], from: string, steps: number): string {
  if (scale.length === 0) throw new JevNotesError('notes: scale is empty')
  const index = scaleIndex(scale, from)
  return scale[((index + steps) % scale.length + scale.length) % scale.length]
}

/** Beat-aligned slot lengths that each sit on NOTE_TICKS and sum to the bar. */
export function bassBeatTicks(meter: { ticksPerBar: number; beatTicks: number }): number[] {
  const count = meter.ticksPerBar / meter.beatTicks
  if (!Number.isInteger(count) || count < 1 || !isNoteTick(meter.beatTicks)) {
    throw new PlanValidationError(`notes.bass: ${meter.ticksPerBar} ticks cannot be split into beats of ${meter.beatTicks}`)
  }
  return Array.from({ length: count }, () => meter.beatTicks)
}

export function bassHalfTicks(meter: { ticksPerBar: number; splitTick: number }): [number, number] {
  const first = meter.splitTick
  const second = meter.ticksPerBar - first
  if (!isNoteTick(first) || !isNoteTick(second)) {
    throw new PlanValidationError(`notes.bass: cannot split a ${meter.ticksPerBar}-tick bar at ${first}`)
  }
  return [first, second]
}

type BassTone = 'bass' | 'fifth' | 'third' | 'octave' | { walk: number }

export function bassSlotsFor(
  pattern: BassPatternId,
  meter: { ticksPerBar: number; beatTicks: number; splitTick: number },
): { tone: BassTone; ticks: number }[] {
  if (!Object.hasOwn(BASS_PATTERNS, pattern)) throw new PlanValidationError(`notes.bassPattern: unknown "${pattern}"`)
  if (pattern === 'root_hold') return [{ tone: 'bass', ticks: meter.ticksPerBar }]
  const halves = bassHalfTicks(meter)
  if (pattern === 'root_fifth') return [{ tone: 'bass', ticks: halves[0] }, { tone: 'fifth', ticks: halves[1] }]
  if (pattern === 'fifth_root') return [{ tone: 'fifth', ticks: halves[0] }, { tone: 'bass', ticks: halves[1] }]
  if (pattern === 'octave_drop') return [{ tone: 'bass', ticks: halves[0] }, { tone: 'octave', ticks: halves[1] }]
  const beats = bassBeatTicks(meter)
  if (pattern === 'pedal') return beats.map((ticks) => ({ tone: 'bass' as const, ticks }))
  if (pattern === 'walk_up') {
    const tones: BassTone[] = ['bass', 'third', 'fifth', 'octave']
    return beats.map((ticks, i) => ({ tone: tones[Math.min(i, tones.length - 1)], ticks }))
  }
  return beats.map((ticks, i) => ({ tone: { walk: -i }, ticks }))
}

function pcForTone(tone: BassTone, chord: ResolvedChord, scale: string[]): string {
  if (tone === 'bass') return chord.bass
  if (tone === 'fifth') return chordFifth(chord)
  if (tone === 'third') return chordThird(chord)
  if (tone === 'octave') return chord.bass
  return walkPc(scale, chord.bass, tone.walk)
}

export function realizeBassPattern(
  pattern: BassPatternId,
  plan: CompositionPlan,
  options: { barIndex?: number; velocity?: number } = {},
): BassPhrase {
  const barIndex = options.barIndex ?? 0
  const velocity = options.velocity ?? DEFAULT_BASS_VELOCITY
  const meter = METER_INFO[plan.meter]
  if (!isNoteTick(meter.ticksPerBar)) {
    throw new PlanValidationError(`notes.bass: ${plan.meter} bar length ${meter.ticksPerBar} is not a legal duration`)
  }
  const key = keyInfo(plan.key)
  const bar = plan.bars[barIndex]
  if (!bar) throw new PlanValidationError(`notes: plan has no bar ${barIndex + 1}`)
  const chord = resolveChord(key, bar.chord)
  const chord2 = bar.chord2 ? resolveChord(key, bar.chord2) : undefined
  const slots = bassSlotsFor(pattern, meter)
  const tickSum = slots.reduce((sum, slot) => sum + slot.ticks, 0)
  if (tickSum !== meter.ticksPerBar) {
    throw new PlanValidationError(`notes.bass: "${pattern}" does not fill the bar`)
  }
  const notes: Voice = []
  let start = 0
  let target = DEFAULT_BASS_MIDI
  slots.forEach((slot, i) => {
    if (!isNoteTick(slot.ticks)) {
      throw new PlanValidationError(`notes.bass: slot ${i + 1} has illegal duration ${slot.ticks}`)
    }
    const harmony = chord2 && start >= meter.splitTick ? chord2 : chord
    const scale = scaleAt(key, plan.palette, chord, chord2, start, meter.splitTick)
    const pc = pcForTone(slot.tone, harmony, scale)
    const aim = slot.tone === 'octave' ? target - 12 : target
    const pitch = spellPc(pc, aim, { lo: BASS_LO, hi: BASS_HI })
    notes.push(parseScoreNote({ start, dur: slot.ticks, pitches: [pitch], velocity }, `bass[${i}]`, meter.ticksPerBar, { lo: BASS_LO, hi: BASS_HI }))
    target = midiOf(pitch)
    start += slot.ticks
  })
  const voice = parseScoreVoice(notes, meter.ticksPerBar, { lo: BASS_LO, hi: BASS_HI })
  assertVoiceFillsBar(voice, meter.ticksPerBar, 'notes.bass')
  return { pattern, notes: voice }
}

function scaleAt(
  key: KeyInfo,
  palette: CompositionPlan['palette'],
  chord: ResolvedChord,
  chord2: ResolvedChord | undefined,
  tick: number,
  splitTick: number,
): string[] {
  const harmony = chord2 && tick >= splitTick ? chord2 : chord
  return scaleFor(key, palette, harmony)
}

export function realizeJevNoteChoices(
  choices: JevNoteChoices,
  plan: CompositionPlan,
  options: { barIndex?: number; velocity?: number } = {},
): NotePhrase {
  const barIndex = options.barIndex ?? 0
  const velocity = options.velocity ?? DEFAULT_VELOCITY
  const meter = METER_INFO[plan.meter]
  const spec = PHRASE_RHYTHMS[choices.rhythm]
  if (spec.meter !== plan.meter) {
    throw new PlanValidationError(`notes.rhythm: "${choices.rhythm}" does not fit ${plan.meter}`)
  }
  if (spec.ticks.reduce((sum, tick) => sum + tick, 0) !== meter.ticksPerBar) {
    throw new PlanValidationError(`notes.rhythm: "${choices.rhythm}" does not fill the bar`)
  }
  if (choices.degrees.length !== PHRASE_NOTE_COUNT) {
    throw new PlanValidationError(`notes.degrees: expected ${PHRASE_NOTE_COUNT}`)
  }
  const key = keyInfo(plan.key)
  const bar = plan.bars[barIndex]
  if (!bar) throw new PlanValidationError(`notes: plan has no bar ${barIndex + 1}`)
  const chord = resolveChord(key, bar.chord)
  const chord2 = bar.chord2 ? resolveChord(key, bar.chord2) : undefined
  const starts = startsFromRhythm(choices.rhythm)
  const notes: Voice = []
  choices.degrees.forEach((degree, i) => {
    const start = starts[i]
    const dur = spec.ticks[i]
    if (!isFiniteTick(dur) || !Object.hasOwn(NOTE_TICKS, String(dur))) {
      throw new PlanValidationError(`notes: rhythm slot ${i + 1} has illegal duration ${dur}`)
    }
    const scale = scaleAt(key, plan.palette, chord, chord2, start, meter.splitTick)
    const pitch = spellDegree(degree, scale, DEFAULT_TREBLE_MIDI)
    if (!pitch) return
    notes.push(parseScoreNote({ start, dur, pitches: [pitch], velocity }, `notes[${i}]`, meter.ticksPerBar))
  })
  if (notes.length === 0) throw new JevNotesError('Jev notes produced only rests')
  const treble = parseScoreVoice(notes, meter.ticksPerBar)
  const phrase: NotePhrase = { barIndex, voice: 'treble', rhythm: choices.rhythm, degrees: choices.degrees, notes: treble }
  if (choices.bassPattern) {
    try {
      phrase.bass = realizeBassPattern(choices.bassPattern, plan, { barIndex, velocity: options.velocity ? Math.max(1, options.velocity - 8) : DEFAULT_BASS_VELOCITY })
    } catch {
      // Illegal bass stays off the phrase; the caller keeps renderPlan's LH.
    }
  }
  return phrase
}

function isFiniteTick(value: number): boolean {
  return Number.isInteger(value) && value > 0
}

function overlayStaff(replacement: Voice, sample?: number): Voice[] {
  const shaped = sample == null ? replacement : replacement.map((note) => ({ ...note, velocity: note.velocity || sample }))
  // Jev's line replaces the staff. Leftover inner voices were written against
  // the code melody and fight stems / beams on the same staff.
  return [shaped]
}

export function applyBassPhrase(score: Score, barIndex: number, bass: BassPhrase): Score {
  const index = barIndex + (score.introBars ?? 0)
  const bar = scoreBarForPlan(score, barIndex)
  if (!bar) throw new JevNotesError(`Jev notes: no score bar for plan bar ${barIndex + 1}`)
  const voice = parseScoreVoice(bass.notes, score.meter.ticksPerBar, { lo: BASS_LO, hi: BASS_HI })
  assertVoiceFillsBar(voice, score.meter.ticksPerBar, 'notes.bass')
  const sample = bar.bass[0]?.[0]?.velocity
  const nextBass = overlayStaff(voice, sample)
  return {
    ...score,
    bars: score.bars.map((entry, i) => (i === index ? { ...entry, bass: nextBass } : entry)),
  }
}

export function applyNotePhrase(score: Score, phrase: NotePhrase): Score {
  const index = phrase.barIndex + (score.introBars ?? 0)
  const bar = scoreBarForPlan(score, phrase.barIndex)
  if (!bar) throw new JevNotesError(`Jev notes: no score bar for plan bar ${phrase.barIndex + 1}`)
  const voice = parseScoreVoice(phrase.notes, score.meter.ticksPerBar)
  const sample = bar.treble[0]?.[0]?.velocity
  const treble = overlayStaff(voice, sample)
  let next: Score = {
    ...score,
    bars: score.bars.map((entry, i) => (i === index ? { ...entry, treble } : entry)),
  }
  if (phrase.bass) {
    try {
      next = applyBassPhrase(next, phrase.barIndex, phrase.bass)
    } catch {
      // Keep renderPlan bass on this bar.
    }
  }
  return next
}

/** Replace the RH staff (and bass staff when present) on every targeted plan bar. Intro framing stays put. */
export function applyNotePhrases(score: Score, phrases: readonly NotePhrase[]): Score {
  return phrases.reduce((next, phrase) => applyNotePhrase(next, phrase), score)
}

export function renderWithOptionalJevNotes(
  plan: CompositionPlan,
  seed: number,
  phrases: readonly NotePhrase[] | null | undefined,
): { score: Score; used: 'jev' | 'code'; notice: string | null } {
  const code = renderPlan(plan, seed)
  const list = asPhraseList(phrases)
  if (list.length === 0) return { score: code, used: 'code', notice: null }
  try {
    const overlays = list.map((phrase) => {
      const choices = parseJevNoteChoices(
        { rhythm: phrase.rhythm, degrees: phrase.degrees, ...(phrase.bass ? { bassPattern: phrase.bass.pattern } : {}) },
        plan.meter,
      )
      const realized = realizeJevNoteChoices(choices, plan, { barIndex: phrase.barIndex, velocity: phrase.notes[0]?.velocity })
      let bass = realized.bass
      if (phrase.bass) {
        try {
          const stored = parseScoreVoice(phrase.bass.notes, code.meter.ticksPerBar, { lo: BASS_LO, hi: BASS_HI })
          assertVoiceFillsBar(stored, code.meter.ticksPerBar, 'notes.bass')
          bass = { pattern: parseBassPattern(phrase.bass.pattern), notes: stored }
        } catch {
          bass = undefined
        }
      }
      return { ...realized, notes: parseScoreVoice(phrase.notes, code.meter.ticksPerBar), ...(bass ? { bass } : { bass: undefined }) }
    })
    const score = applyNotePhrases(code, overlays)
    const skipped = overlays
      .filter((phrase, i) => list[i].bass && !phrase.bass)
      .map((phrase) => phrase.barIndex + 1)
    const notice =
      skipped.length === 0
        ? null
        : `Jev bass failed on bar${skipped.length === 1 ? '' : 's'} ${skipped.join(', ')}. Keeping the code renderer’s left hand on ${skipped.length === 1 ? 'that bar' : 'those bars'}.`
    return { score, used: 'jev', notice }
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause)
    return { score: code, used: 'code', notice: `Jev notes failed (${reason}). Using the code renderer’s notes instead.` }
  }
}
