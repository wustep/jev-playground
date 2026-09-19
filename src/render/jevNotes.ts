// Debug-only overlay: Jev's closed-schema RH melody on top of renderPlan.
//
// The default Generate path is unchanged (labels → renderPlan). Notes:jev is
// the showcase: Jev picks the singing line; the arranged accompaniment stays.
// When this module is asked to apply phrases it validates every tick and pitch
// against the enums / spelled-pitch grammar; illegal RH throws so the caller
// can fall back to the code renderer.
//
// One NotePhrase is one plan bar. Callers overlay every targeted bar: only the
// top melody voice (treble[0], or the skyline of a chordal singing line) is
// swapped. Remaining RH inner voices and the full LH texture stay with
// renderPlan. A closed bass_pattern may still be realized for the debug trace;
// it is not written onto the score. Theme-return bars reuse the source bar's
// rhythm and degrees, re-spelled on the later chord.
//
// Voice leading is post-realize, in code: `degrees` stay Jev's closed picks
// (the plan). `notes` is the spelled line after successive sounding pitches
// are snapped toward stepwise / small-leap motion, unless the bar's role is
// contrast / climax / surprise. Debug: the notes exchange shows Jev's picks;
// phrase.notes (and the score) are the realized spelling.

import {
  BASS_PATTERNS,
  NOTE_TICKS,
  PHRASE_NOTE_COUNT,
  PHRASE_RHYTHMS,
  guideRestSlot,
  isNoteTick,
  parseJevGuideChoices,
  parseJevNoteChoices,
  parseNoteTick,
  parseSpelledPitch,
  rhythmForGuideFigure,
  startsFromRhythm,
  melodyAllowsLeap,
  type BassPatternId,
  type JevGuideChoices,
  type JevNoteChoices,
  type MelodyDegreeId,
  type MelodyFigureId,
  type MelodyGoalId,
  type PhraseRhythmId,
} from '../plan/notes.js'
import { PlanValidationError, type BarRoleId, type CompositionPlan } from '../plan/schema.js'
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

/** Semitones above the tonic for functional names 1–7 (major / natural minor). */
export const FUNCTION_SEMITONES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
} as const

export interface SpellDegreeOptions {
  /** Natural-minor functions (b3 / b6 / b7). Ignored on 7-note scales. */
  minor?: boolean
}

function pcChroma(pc: string): number {
  return midiOf(`${pc}4`) % 12
}

function circularDistance(a: number, b: number): number {
  const raw = Math.abs(a - b) % 12
  return Math.min(raw, 12 - raw)
}

/**
 * Pitch class for a closed degree name on `scale`.
 *
 * Degree names are functional (tonic = 1, dominant = 5), not indexes into
 * whatever palette we were handed. Indexing a 5-note pentatonic used to wrap
 * “dominant” onto the last rung (C pentatonic → A). That is the Q7 bug.
 *
 * Mapping:
 * - 7-note (possibly chord-bent) scales: `scale[degree]` — a bent fourth
 *   stays the bent fourth.
 * - Gapped palettes (pentatonic / whole-tone / blues, length < 7): take the
 *   intended diatonic pitch class from the key and snap to the nearest
 *   palette tone (circular chroma). Ties prefer a non-tonic tone so
 *   “leading” does not collapse onto tonic when both are 1 semitone away,
 *   then the raised neighbor (clockwise from the intended class). If the
 *   nearest tone is tonic and the degree is not, the next-nearest wins
 *   when it is at most one semitone farther.
 *
 * C major pentatonic [C D E G A]: tonic C, supertonic D, mediant E,
 * subdominant E (F→E), dominant G, submediant A, leading A (B prefers A
 * over tonic C).
 *
 * C whole-tone [C D E F# G# A#]: tonic C, supertonic D, mediant E,
 * subdominant F# (F ties E/F# → raised), dominant G#, submediant A#,
 * leading A#.
 *
 * C minor pentatonic [C Eb F G Bb], minor functions: tonic C, supertonic Eb
 * (D→Eb), mediant Eb, subdominant F, dominant G, submediant G (Ab→G),
 * leading Bb.
 *
 * C major blues [C D Eb E G A]: tonic C, supertonic D, mediant E,
 * subdominant E, dominant G, submediant A, leading A.
 */
export function pitchClassForDegree(
  degree: MelodyDegreeId,
  scale: string[],
  options: SpellDegreeOptions = {},
): string | null {
  if (degree === 'rest') return null
  if (scale.length === 0) throw new JevNotesError('notes: scale is empty')
  const spec = DEGREE_STEPS[degree]
  if (scale.length >= 7) {
    return scale[((spec.degree % scale.length) + scale.length) % scale.length]
  }
  const tonicChroma = pcChroma(scale[0])
  const steps = options.minor ? FUNCTION_SEMITONES.minor : FUNCTION_SEMITONES.major
  const intended = (tonicChroma + steps[spec.degree]) % 12
  const allowTonic = spec.degree === 0
  const ranked = scale
    .map((pc) => {
      const chroma = pcChroma(pc)
      return {
        pc,
        chroma,
        dist: circularDistance(chroma, intended),
        isTonic: chroma === tonicChroma,
      }
    })
    .sort((a, b) => {
      if (a.dist !== b.dist) return a.dist - b.dist
      if (!allowTonic && a.isTonic !== b.isTonic) return a.isTonic ? 1 : -1
      const aRaise = (a.chroma - intended + 12) % 12
      const bRaise = (b.chroma - intended + 12) % 12
      return aRaise - bRaise
    })
  const best = ranked[0]
  const next = ranked[1]
  if (!allowTonic && best.isTonic && next && next.dist <= best.dist + 1) return next.pc
  return best.pc
}

export interface BassPhrase {
  pattern: BassPatternId
  notes: Voice
}

export interface NotePhrase {
  barIndex: number
  voice: 'treble'
  rhythm: PhraseRhythmId
  /**
   * Jev's closed degree picks (the plan), after optional variation nudge.
   * Register / spelling lives on `notes`, not here. Guide mode fills these
   * from the realized line so overlay validation stays on the same path.
   */
  degrees: MelodyDegreeId[]
  /** Realized RH: voice-led spelling of `degrees` on the sixteenth grid. */
  notes: Voice
  bass?: BassPhrase
  /** D1 guide picks. Omitted on the 4-slot line path. */
  figure?: MelodyFigureId
  goal?: MelodyGoalId
  mode?: 'guide' | 'line'
}

/** Stepwise / small-leap register snap, unless the role is allowed to leap. */
export function shouldVoiceLeadMelody(role: BarRoleId): boolean {
  return !melodyAllowsLeap(role)
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

export function spellDegree(
  degree: MelodyDegreeId,
  scale: string[],
  targetMidi: number,
  options: SpellDegreeOptions = {},
): string | null {
  if (degree === 'rest') return null
  const pc = pitchClassForDegree(degree, scale, options)
  if (!pc) return null
  const spec = DEGREE_STEPS[degree]
  const rungs = ladder([pc], TREBLE_LO, TREBLE_HI)
  if (rungs.length === 0) throw new JevNotesError(`notes: no ${pc} in the treble range`)
  return rungs[nearestIndex(rungs, targetMidi + spec.octave * 12)]
}

/**
 * Same pitch class as `spellDegree`, but ignore the degree's octave hint and
 * sit nearest `targetMidi`. Used after Jev has picked degrees, to voice-lead
 * register only.
 */
export function spellDegreeNear(
  degree: MelodyDegreeId,
  scale: string[],
  targetMidi: number,
  options: SpellDegreeOptions = {},
): string | null {
  const pc = pitchClassForDegree(degree, scale, options)
  if (!pc) return null
  const rungs = ladder([pc], TREBLE_LO, TREBLE_HI)
  if (rungs.length === 0) throw new JevNotesError(`notes: no ${pc} in the treble range`)
  return rungs[nearestIndex(rungs, targetMidi)]
}

export function lastSoundingMidi(notes: Voice): number | undefined {
  for (let i = notes.length - 1; i >= 0; i--) {
    const pitch = notes[i]?.pitches[0]
    if (pitch) return midiOf(pitch)
  }
  return undefined
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

type BassTone = 'bass' | 'fifth' | 'third' | 'octave' | 'rest' | { walk: number }

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
  if (pattern === 'alberti') {
    const tones: BassTone[] = ['bass', 'fifth', 'third', 'fifth']
    return beats.map((ticks, i) => ({ tone: tones[i % tones.length], ticks }))
  }
  if (pattern === 'afterbeat') {
    const half = meter.beatTicks / 2
    const offbeat: BassTone[] = ['bass', 'fifth', 'third', 'fifth']
    if (isNoteTick(half) && beats.every((ticks) => isNoteTick(ticks - half))) {
      return beats.flatMap((ticks, i) => [
        { tone: 'rest' as const, ticks: half },
        { tone: offbeat[i % offbeat.length], ticks: ticks - half },
      ])
    }
    return [{ tone: 'rest', ticks: halves[0] }, { tone: 'fifth', ticks: halves[1] }]
  }
  return beats.map((ticks, i) => ({ tone: { walk: -i }, ticks }))
}

function pcForTone(tone: Exclude<BassTone, 'rest'>, chord: ResolvedChord, scale: string[]): string {
  if (tone === 'bass') return chord.bass
  if (tone === 'fifth') return chordFifth(chord)
  if (tone === 'third') return chordThird(chord)
  if (tone === 'octave') return chord.bass
  return walkPc(scale, chord.bass, tone.walk)
}

export function realizeBassPattern(
  pattern: BassPatternId,
  plan: CompositionPlan,
  options: { barIndex?: number; velocity?: number; lastBassMidi?: number } = {},
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
  let target = options.lastBassMidi ?? DEFAULT_BASS_MIDI
  slots.forEach((slot, i) => {
    if (!isNoteTick(slot.ticks)) {
      throw new PlanValidationError(`notes.bass: slot ${i + 1} has illegal duration ${slot.ticks}`)
    }
    if (slot.tone === 'rest') {
      start += slot.ticks
      return
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
  options: {
    barIndex?: number
    velocity?: number
    lastSoundingMidi?: number
    lastBassMidi?: number
    /** Default: snap register unless this bar's role is contrast / climax / surprise. */
    voiceLead?: boolean
  } = {},
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
  const lead = options.voiceLead ?? shouldVoiceLeadMelody(bar.role)
  const notes: Voice = []
  let target = options.lastSoundingMidi ?? DEFAULT_TREBLE_MIDI
  choices.degrees.forEach((degree, i) => {
    const start = starts[i]
    const dur = spec.ticks[i]
    if (!isFiniteTick(dur) || !Object.hasOwn(NOTE_TICKS, String(dur))) {
      throw new PlanValidationError(`notes: rhythm slot ${i + 1} has illegal duration ${dur}`)
    }
    const scale = scaleAt(key, plan.palette, chord, chord2, start, meter.splitTick)
    const spell = { minor: key.minor }
    const pitch = lead ? spellDegreeNear(degree, scale, target, spell) : spellDegree(degree, scale, DEFAULT_TREBLE_MIDI, spell)
    if (!pitch) return
    notes.push(parseScoreNote({ start, dur, pitches: [pitch], velocity }, `notes[${i}]`, meter.ticksPerBar))
    target = midiOf(pitch)
  })
  if (notes.length === 0) throw new JevNotesError('Jev notes produced only rests')
  const treble = parseScoreVoice(notes, meter.ticksPerBar)
  const phrase: NotePhrase = { barIndex, voice: 'treble', rhythm: choices.rhythm, degrees: choices.degrees, notes: treble }
  if (choices.bassPattern) {
    try {
      phrase.bass = realizeBassPattern(choices.bassPattern, plan, {
        barIndex,
        velocity: options.velocity ? Math.max(1, options.velocity - 8) : DEFAULT_BASS_VELOCITY,
        lastBassMidi: options.lastBassMidi,
      })
    } catch {
      // Illegal bass stays off the phrase; the caller keeps renderPlan's LH.
    }
  }
  return phrase
}

/** True when the stacked chord includes a minor or major seventh. */
export function chordHasSeventh(chord: ResolvedChord): boolean {
  const root = midiOf(`${chord.root}4`) % 12
  return chord.pcs.some((pc) => {
    const ivl = (midiOf(`${pc}4`) % 12 - root + 12) % 12
    return ivl === 10 || ivl === 11
  })
}

/** Chord-relative goal pitch class. Missing seventh snaps to the fifth. */
export function goalPitchClass(chord: ResolvedChord, goal: MelodyGoalId): string {
  if (goal === 'root') return chord.root
  if (goal === 'third') return chord.pcs[1] ?? chord.root
  if (goal === 'fifth') return chord.pcs[2] ?? chord.root
  if (chordHasSeventh(chord)) return chord.pcs[3] ?? chord.core[3] ?? chord.pcs[2] ?? chord.root
  return chord.pcs[2] ?? chord.root
}

export function isChordTonePc(pc: string, chord: ResolvedChord): boolean {
  const chroma = midiOf(`${pc}4`) % 12
  return chord.pcs.some((tone) => midiOf(`${tone}4`) % 12 === chroma)
}

/** Map a sounding pitch back onto a closed degree id (debug / overlay). */
export function degreeIdForPitch(pitch: string, tonic: string, minor: boolean): MelodyDegreeId {
  const tonicMidi = midiOf(`${tonic}4`)
  const intended = midiOf(pitch)
  const interval = ((intended - tonicMidi) % 12 + 12) % 12
  const octave = Math.round((intended - (tonicMidi + interval)) / 12)
  const steps = minor ? FUNCTION_SEMITONES.minor : FUNCTION_SEMITONES.major
  let best = 0
  let bestDist = 99
  for (let i = 0; i < steps.length; i++) {
    const dist = circularDistance(interval, steps[i])
    if (dist < bestDist) {
      bestDist = dist
      best = i
    }
  }
  if (best === 0 && octave >= 1) return 'tonic_high'
  if (best === 4 && octave < 0) return 'dominant_low'
  if (best === 2 && octave >= 1) return 'mediant_high'
  const names: Exclude<MelodyDegreeId, 'rest'>[] = [
    'tonic',
    'supertonic',
    'mediant',
    'subdominant',
    'dominant',
    'submediant',
    'leading',
  ]
  return names[best]
}

function stepToward(from: string, goal: string, scale: string[]): string {
  const rungs = ladder(scale, TREBLE_LO, TREBLE_HI)
  if (rungs.length === 0) return goal
  const fromI = nearestIndex(rungs, midiOf(from))
  const goalI = nearestIndex(rungs, midiOf(goal))
  if (fromI === goalI) return rungs[fromI]
  return rungs[fromI + (goalI > fromI ? 1 : -1)]
}

function neighbourOf(goal: string, scale: string[], fromMidi: number): string {
  const rungs = ladder(scale, TREBLE_LO, TREBLE_HI)
  if (rungs.length < 2) return goal
  const goalI = nearestIndex(rungs, midiOf(goal))
  const upper = Math.min(rungs.length - 1, goalI + 1)
  const lower = Math.max(0, goalI - 1)
  const preferUpper = fromMidi <= midiOf(goal)
  const pick = preferUpper ? upper : lower
  return rungs[pick === goalI ? (preferUpper ? lower : upper) : pick]
}

function nextChordTone(fromMidi: number, chord: ResolvedChord, dir: 1 | -1): string {
  const tones = chord.core.length >= 3 ? chord.core : chord.pcs
  const rungs = ladder(tones, TREBLE_LO, TREBLE_HI)
  if (rungs.length === 0) return spellPc(chord.root, fromMidi, { lo: TREBLE_LO, hi: TREBLE_HI })
  const idx = nearestIndex(rungs, fromMidi)
  const stepped = Math.max(0, Math.min(rungs.length - 1, idx + dir))
  return rungs[stepped]
}

function pitchClassOf(pitch: string): string {
  return pitch.replace(/\d+$/, '')
}

function nearestChordTone(pitch: string, chord: ResolvedChord): string {
  const tones = chord.core.length >= 3 ? chord.core : chord.pcs
  const rungs = ladder(tones, TREBLE_LO, TREBLE_HI)
  if (rungs.length === 0) return pitch
  return rungs[nearestIndex(rungs, midiOf(pitch))]
}

function guideFigurePitches(
  figure: MelodyFigureId,
  goalPitch: string,
  fromMidi: number,
  scale: string[],
  chord: ResolvedChord,
  lastNotes?: Voice,
): (string | null)[] {
  const goal = goalPitch
  const lastNamed = lastNotes ? lastSoundingMidi(lastNotes) : undefined
  const previousPc = (() => {
    if (!lastNotes) return pitchClassOf(spellPc(scale[0] ?? chord.root, fromMidi, { lo: TREBLE_LO, hi: TREBLE_HI }))
    for (let i = lastNotes.length - 1; i >= 0; i--) {
      const named = lastNotes[i]?.pitches[0]
      if (named) return pitchClassOf(named)
    }
    return pitchClassOf(spellPc(scale[0] ?? chord.root, fromMidi, { lo: TREBLE_LO, hi: TREBLE_HI }))
  })()
  const previous = spellPc(previousPc, lastNamed ?? fromMidi, { lo: TREBLE_LO, hi: TREBLE_HI })

  if (figure === 'motif_echo' && lastNotes && lastNotes.length > 0) {
    const last = lastSoundingMidi(lastNotes) ?? fromMidi
    const shift = midiOf(goal) - last
    return Array.from({ length: PHRASE_NOTE_COUNT }, (_, i) => {
      const sample = lastNotes[Math.min(i, lastNotes.length - 1)]
      if (!sample?.pitches[0]) return goal
      const moved = midiOf(sample.pitches[0]) + shift
      return spellPc(sample.pitches[0].replace(/\d+$/, ''), moved, { lo: TREBLE_LO, hi: TREBLE_HI })
    })
  }

  if (figure === 'arpeggio_up' || figure === 'arpeggio_down') {
    const dir: 1 | -1 = figure === 'arpeggio_up' ? 1 : -1
    const out: string[] = []
    let cursor = fromMidi
    for (let i = 0; i < PHRASE_NOTE_COUNT; i++) {
      const pitch = nextChordTone(cursor, chord, dir)
      out.push(pitch)
      cursor = midiOf(pitch)
    }
    out[out.length - 1] = goal
    return out
  }

  if (figure === 'neighbour') {
    const neighbour = neighbourOf(goal, scale, fromMidi)
    return [stepToward(previous, goal, scale), neighbour, goal, goal]
  }

  if (figure === 'leap_recover') {
    const delta = midiOf(goal) - fromMidi
    const leapMidi = fromMidi + (delta === 0 ? 7 : Math.sign(delta) * Math.max(7, Math.min(12, Math.abs(delta))))
    const leap = spellPc(goal.replace(/\d+$/, ''), leapMidi, { lo: TREBLE_LO, hi: TREBLE_HI })
    const recover = stepToward(leap, goal, scale)
    return [previous, leap, recover, goal]
  }

  if (figure === 'hold_resolve') {
    const hold = Math.abs(midiOf(previous) - midiOf(goal)) <= 2 ? previous : stepToward(previous, goal, scale)
    return [hold, hold, stepToward(hold, goal, scale), goal]
  }

  // step_to_goal (and motif_echo with no memory)
  const p0 = stepToward(previous, goal, scale)
  const p1 = stepToward(p0, goal, scale)
  const p2 = stepToward(p1, goal, scale)
  return [p0, p1, p2, goal]
}

/**
 * Copy a source singing line and lace it: keep pitch-class contour, snap
 * strong beats to this bar's chord, and lean one weak slot a step aside.
 * Used on theme-return bars so Guide ornaments A′ instead of writing a new tune.
 */
function ornamentSourcePitches(
  source: Voice,
  slots: { start: number; dur: number }[],
  chord: ResolvedChord,
  scale: string[],
  fromMidi: number,
): (string | null)[] {
  const sourcePitches = source.map((note) => note.pitches[0]).filter((pitch): pitch is string => !!pitch)
  if (sourcePitches.length === 0) return slots.map(() => null)
  const out: (string | null)[] = slots.map((_, i) => sourcePitches[Math.min(i, sourcePitches.length - 1)] ?? null)
  const weak = slots.findIndex((slot, i) => i > 0 && i < slots.length - 1 && slot.start % 4 !== 0)
  if (weak > 0 && out[weak]) {
    out[weak] = neighbourOf(out[weak]!, scale, midiOf(out[weak]!))
  }
  return out.map((pitch, i) => {
    if (!pitch) return null
    const slot = slots[i]
    if (slot.start % 4 === 0 || slot.dur >= 4) return nearestChordTone(pitch, chord)
    return spellPc(pitchClassOf(pitch), i === 0 ? fromMidi : midiOf(out[i - 1] ?? pitch), { lo: TREBLE_LO, hi: TREBLE_HI })
  })
}

/**
 * A rest slot must vacate a felt beat: clip any note that would hold through
 * the beat containing the rest, so occupancy can mark that beat silent.
 */
function vacateRestBeat(notes: Voice, restStart: number, restDur: number, beatTicks: number): Voice {
  const beatStart = Math.floor(restStart / beatTicks) * beatTicks
  const silentFrom = Math.min(restStart, beatStart)
  const silentTo = Math.max(restStart + restDur, beatStart + beatTicks)
  return notes
    .map((note) => {
      if (note.start >= silentTo || note.start + note.dur <= silentFrom) return note
      if (note.start < silentFrom) return { ...note, dur: silentFrom - note.start }
      return { ...note, dur: 0 }
    })
    .filter((note) => note.dur > 0)
}

export function realizeJevGuideChoices(
  choices: JevGuideChoices,
  plan: CompositionPlan,
  options: {
    barIndex?: number
    velocity?: number
    lastSoundingMidi?: number
    lastNotes?: Voice
    lastRhythm?: PhraseRhythmId
    /** Prefer a long tone + a rest (lyrical characters / song-like roles). */
    lyrical?: boolean
    voiceLead?: boolean
    /** Theme-return source melody — ornament this instead of writing a new figure. */
    sourceNotes?: Voice
  } = {},
): NotePhrase {
  const parsed = parseJevGuideChoices(choices)
  const barIndex = options.barIndex ?? 0
  const velocity = options.velocity ?? DEFAULT_VELOCITY
  const meter = METER_INFO[plan.meter]
  const key = keyInfo(plan.key)
  const bar = plan.bars[barIndex]
  if (!bar) throw new PlanValidationError(`notes: plan has no bar ${barIndex + 1}`)
  const chord = resolveChord(key, bar.chord)
  const chord2 = bar.chord2 ? resolveChord(key, bar.chord2) : undefined
  const lyrical = options.lyrical === true && !melodyAllowsLeap(bar.role)
  const returning = (options.sourceNotes?.length ?? 0) > 0
  const rhythm = rhythmForGuideFigure(parsed.figure, plan.meter, {
    lyrical,
    echoRhythm: parsed.figure === 'motif_echo' || returning ? options.lastRhythm : undefined,
  })
  const spec = PHRASE_RHYTHMS[rhythm]
  if (spec.meter !== plan.meter) {
    throw new PlanValidationError(`notes.rhythm: "${rhythm}" does not fit ${plan.meter}`)
  }
  const starts = startsFromRhythm(rhythm)
  const lead = options.voiceLead ?? shouldVoiceLeadMelody(bar.role)
  const fromMidi = options.lastSoundingMidi ?? DEFAULT_TREBLE_MIDI
  const goalMidiTarget = lead ? fromMidi : DEFAULT_TREBLE_MIDI
  const primaryScale = scaleAt(key, plan.palette, chord, chord2, 0, meter.splitTick)
  const goalPitch = spellPc(goalPitchClass(chord, parsed.goal), goalMidiTarget, { lo: TREBLE_LO, hi: TREBLE_HI })
  const slots = spec.ticks.map((dur, i) => ({ start: starts[i], dur }))
  let pitches = returning
    ? ornamentSourcePitches(options.sourceNotes!, slots, chord, primaryScale, fromMidi)
    : guideFigurePitches(parsed.figure, goalPitch, fromMidi, primaryScale, chord, options.lastNotes)

  const restAt = lyrical ? guideRestSlot(spec.ticks, meter.beatTicks, meter.ticksPerBar) : null
  if (restAt != null) pitches = pitches.map((pitch, i) => (i === restAt ? null : pitch))

  // Q3: strong beats prefer chord tones. Then force the last sounding slot onto the goal.
  let target = fromMidi
  const spelled: (string | null)[] = pitches.map((pitch, i) => {
    if (!pitch) return null
    const start = starts[i]
    const harmony = chord2 && start >= meter.splitTick ? chord2 : chord
    const strong = start % meter.beatTicks === 0
    let next = pitch
    if (strong && !isChordTonePc(pitchClassOf(next), harmony)) {
      next = nearestChordTone(next, harmony)
    } else if (lead) {
      next = spellPc(pitchClassOf(next), target, { lo: TREBLE_LO, hi: TREBLE_HI })
    }
    target = midiOf(next)
    return next
  })

  let lastSounding = -1
  for (let i = spelled.length - 1; i >= 0; i--) {
    if (spelled[i]) {
      lastSounding = i
      break
    }
  }
  if (lastSounding >= 0 && !returning) {
    const start = starts[lastSounding]
    const harmony = chord2 && start >= meter.splitTick ? chord2 : chord
    const aim = lastSounding > 0 && spelled[lastSounding - 1] ? midiOf(spelled[lastSounding - 1]!) : fromMidi
    spelled[lastSounding] = spellPc(goalPitchClass(harmony, parsed.goal), aim, { lo: TREBLE_LO, hi: TREBLE_HI })
  }

  let notes: Voice = []
  const degrees: MelodyDegreeId[] = []
  spelled.forEach((pitch, i) => {
    const start = starts[i]
    const dur = spec.ticks[i]
    if (!isFiniteTick(dur) || !Object.hasOwn(NOTE_TICKS, String(dur))) {
      throw new PlanValidationError(`notes: rhythm slot ${i + 1} has illegal duration ${dur}`)
    }
    if (!pitch) {
      degrees.push('rest')
      return
    }
    notes.push(parseScoreNote({ start, dur, pitches: [pitch], velocity }, `notes[${i}]`, meter.ticksPerBar))
    degrees.push(degreeIdForPitch(pitch, key.tonic, key.minor))
  })
  if (restAt != null) {
    notes = vacateRestBeat(notes, starts[restAt], spec.ticks[restAt], meter.beatTicks)
  }
  if (notes.length === 0) throw new JevNotesError('Jev notes produced only rests')
  const treble = parseScoreVoice(notes, meter.ticksPerBar)
  return {
    barIndex,
    voice: 'treble',
    rhythm,
    degrees,
    notes: treble,
    figure: parsed.figure,
    goal: parsed.goal,
    mode: 'guide',
  }
}

function isFiniteTick(value: number): boolean {
  return Number.isInteger(value) && value > 0
}

function shapeVoice(replacement: Voice, sample?: number): Voice {
  return sample == null ? replacement : replacement.map((note) => ({ ...note, velocity: note.velocity || sample }))
}

/**
 * Lower pitches of a chordal singing line after the skyline (top note) is
 * lifted off. Empty when the voice is already monophonic.
 */
export function peelSkyline(voice: Voice): Voice {
  const leftover: Voice = []
  for (const note of voice) {
    if (note.pitches.length <= 1) continue
    leftover.push({ ...note, pitches: note.pitches.slice(0, -1) })
  }
  return leftover
}

/**
 * Swap only the singing line. Keep remaining RH inner voices; if the top
 * voice was a chordal skyline, keep its inner pitches as the inner voice.
 * Score contract: at most two voices per staff.
 */
export function overlayMelodyVoice(staff: Voice[], replacement: Voice, sample?: number): Voice[] {
  const melody = shapeVoice(replacement, sample)
  if (staff.length === 0) return [melody]
  const leftover = peelSkyline(staff[0])
  const inners = leftover.length > 0 ? [leftover, ...staff.slice(1)] : staff.slice(1)
  return inners.length > 0 ? [melody, inners[0]] : [melody]
}

export function applyBassPhrase(score: Score, barIndex: number, bass: BassPhrase): Score {
  const index = barIndex + (score.introBars ?? 0)
  const bar = scoreBarForPlan(score, barIndex)
  if (!bar) throw new JevNotesError(`Jev notes: no score bar for plan bar ${barIndex + 1}`)
  const voice = parseScoreVoice(bass.notes, score.meter.ticksPerBar, { lo: BASS_LO, hi: BASS_HI })
  assertVoiceFillsBar(voice, score.meter.ticksPerBar, 'notes.bass')
  const sample = bar.bass[0]?.[0]?.velocity
  // Kept for tests / future use. Notes:jev Q1 leaves the LH on renderPlan.
  const nextBass = [shapeVoice(voice, sample)]
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
  const treble = overlayMelodyVoice(bar.treble, voice, sample)
  return {
    ...score,
    bars: score.bars.map((entry, i) => (i === index ? { ...entry, treble } : entry)),
  }
}

/** Overlay Jev's singing line on every targeted plan bar. Intro framing and LH stay put. */
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
      return { ...realized, notes: parseScoreVoice(phrase.notes, code.meter.ticksPerBar), bass: undefined }
    })
    const score = applyNotePhrases(code, overlays)
    return { score, used: 'jev', notice: null }
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause)
    return { score: code, used: 'code', notice: `Jev notes failed (${reason}). Using the code renderer’s notes instead.` }
  }
}
