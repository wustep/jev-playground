// Debug-only overlay: Jev's closed-schema opening melody on top of renderPlan.
//
// The default Generate path is unchanged (labels → renderPlan). When this
// module is asked to apply a phrase it validates every tick and pitch against
// the enums / spelled-pitch grammar; anything illegal throws so the caller
// can fall back to the code renderer with a notice.

import {
  NOTE_TICKS,
  PHRASE_NOTE_COUNT,
  PHRASE_RHYTHMS,
  parseJevNoteChoices,
  parseNoteTick,
  parseSpelledPitch,
  startsFromRhythm,
  type JevNoteChoices,
  type MelodyDegreeId,
  type PhraseRhythmId,
} from '../plan/notes.js'
import { PlanValidationError, type CompositionPlan } from '../plan/schema.js'
import { keyInfo, resolveChord, scaleFor, type KeyInfo, type ResolvedChord } from './harmony'
import { midiOf, nearestIndex, ladder } from './pitch'
import { renderPlan } from './renderPlan'
import { METER_INFO, type Note, type Score, type Voice } from './score'

export class JevNotesError extends Error {}

const TREBLE_LO = 55
const TREBLE_HI = 84
const DEFAULT_VELOCITY = 72

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

export interface NotePhrase {
  barIndex: 0
  voice: 'treble'
  rhythm: PhraseRhythmId
  degrees: MelodyDegreeId[]
  notes: Voice
}

export function parseScoreNote(raw: unknown, path: string, ticksPerBar: number): Note {
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
    if (midi < TREBLE_LO || midi > TREBLE_HI) {
      throw new PlanValidationError(`${path}.pitches[${i}]: "${spelled}" is outside the treble range`)
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
export function parseScoreVoice(raw: unknown, ticksPerBar: number): Voice {
  if (!Array.isArray(raw)) throw new PlanValidationError('notes: expected an array of notes')
  const notes = raw.map((note, i) => parseScoreNote(note, `notes[${i}]`, ticksPerBar)).sort((a, b) => a.start - b.start)
  for (let i = 1; i < notes.length; i++) {
    const previous = notes[i - 1]
    if (previous.start + previous.dur > notes[i].start) {
      throw new PlanValidationError(`notes[${i}]: overlaps the previous note`)
    }
  }
  return notes
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

export function realizeJevNoteChoices(choices: JevNoteChoices, plan: CompositionPlan, velocity = DEFAULT_VELOCITY): NotePhrase {
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
  const bar = plan.bars[0]
  if (!bar) throw new PlanValidationError('notes: plan has no bars')
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
    const pitch = spellDegree(degree, scale, 67)
    if (!pitch) return
    notes.push(parseScoreNote({ start, dur, pitches: [pitch], velocity }, `notes[${i}]`, meter.ticksPerBar))
  })
  if (notes.length === 0) throw new JevNotesError('Jev notes produced only rests')
  return { barIndex: 0, voice: 'treble', rhythm: choices.rhythm, degrees: choices.degrees, notes: parseScoreVoice(notes, meter.ticksPerBar) }
}

function isFiniteTick(value: number): boolean {
  return Number.isInteger(value) && value > 0
}

export function applyNotePhrase(score: Score, phrase: NotePhrase): Score {
  const bar = score.bars[phrase.barIndex]
  if (!bar) throw new JevNotesError('Jev notes: no opening bar to overlay')
  const voice = parseScoreVoice(phrase.notes, score.meter.ticksPerBar)
  const sample = bar.treble[0]?.[0]?.velocity
  const shaped = sample == null ? voice : voice.map((note) => ({ ...note, velocity: note.velocity || sample }))
  const treble = bar.treble.length === 0 ? [shaped] : [shaped, ...bar.treble.slice(1)]
  return {
    ...score,
    bars: score.bars.map((entry, i) => (i === phrase.barIndex ? { ...entry, treble } : entry)),
  }
}

export function renderWithOptionalJevNotes(
  plan: CompositionPlan,
  seed: number,
  phrase: NotePhrase | null | undefined,
): { score: Score; used: 'jev' | 'code'; notice: string | null } {
  const code = renderPlan(plan, seed)
  if (!phrase) return { score: code, used: 'code', notice: null }
  try {
    const choices = parseJevNoteChoices({ rhythm: phrase.rhythm, degrees: phrase.degrees }, plan.meter)
    const realized = realizeJevNoteChoices(choices, plan, phrase.notes[0]?.velocity)
    // Prefer the already-realized notes when they still parse; otherwise the re-realize.
    const overlay = { ...realized, notes: parseScoreVoice(phrase.notes, code.meter.ticksPerBar) }
    return { score: applyNotePhrase(code, overlay), used: 'jev', notice: null }
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause)
    return { score: code, used: 'code', notice: `Jev notes failed (${reason}). Using the code renderer’s notes instead.` }
  }
}

