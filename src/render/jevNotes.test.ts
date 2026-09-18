import { describe, expect, it } from 'vitest'
import { MELODY_DEGREE_IDS, NOTE_TICK_VALUES, PHRASE_NOTE_COUNT, PHRASE_RHYTHMS, parseJevNoteChoices, parseNoteTick } from '../plan/notes'
import { METER_IDS, PlanValidationError } from '../plan/schema'
import { HeuristicPlanner } from '../planner/HeuristicPlanner'
import { JevPlanner, type JevTransport } from '../planner/JevPlanner'
import { buildRequest, parseOp } from '../planner/jev/requests'
import type { Answer, SystemOneResponse } from '../planner/jev/systemOne'
import {
  applyNotePhrase,
  parseScoreNote,
  parseScoreVoice,
  realizeJevNoteChoices,
  renderWithOptionalJevNotes,
  type NotePhrase,
} from './jevNotes'
import { midiOf } from './pitch'
import { renderPlan, timeline } from './renderPlan'
import { METER_INFO } from './score'

const planner = new HeuristicPlanner()

async function samplePlan(meter?: 'four_four' | 'three_four' | 'six_eight') {
  for (let seed = 1; seed <= 80; seed++) {
    const { plan } = await planner.plan({ style: 'bach', bars: 8, pick: 'sample', seed, brief: true })
    if (!meter || plan.meter === meter) return plan
  }
  const { plan } = await planner.plan({ style: 'bach', bars: 8, pick: 'argmax', seed: 1, brief: true })
  return plan
}

describe('closed note schema', () => {
  it('keeps every catalogued rhythm on the tick enum and filling its bar', () => {
    for (const [id, spec] of Object.entries(PHRASE_RHYTHMS)) {
      expect(spec.ticks, id).toHaveLength(PHRASE_NOTE_COUNT)
      expect(spec.ticks.reduce((sum, tick) => sum + tick, 0), id).toBe(METER_INFO[spec.meter].ticksPerBar)
      for (const tick of spec.ticks) expect(NOTE_TICK_VALUES, id).toContain(tick)
    }
    for (const meter of METER_IDS) {
      const offered = Object.entries(PHRASE_RHYTHMS).filter(([, spec]) => spec.meter === meter)
      expect(offered.length, meter).toBeGreaterThanOrEqual(5)
    }
  })

  it('parses a legal four-note phrase and rejects illegal durations, pitches and meters', () => {
    expect(parseJevNoteChoices({ rhythm: 'four_even', degrees: ['tonic', 'dominant', 'mediant', 'tonic_high'] }, 'four_four')).toEqual({
      rhythm: 'four_even',
      degrees: ['tonic', 'dominant', 'mediant', 'tonic_high'],
    })
    expect(() => parseJevNoteChoices({ rhythm: 'four_even', degrees: ['tonic', 'dominant', 'mediant', 'tonic_high'] }, 'three_four')).toThrow(PlanValidationError)
    expect(() => parseJevNoteChoices({ rhythm: 'four_even', degrees: ['tonic', 'dominant'] }, 'four_four')).toThrow(/degrees/)
    expect(() => parseJevNoteChoices({ rhythm: 'four_even', degrees: ['tonic', 'dominant', 'mediant', 'middle_c'] }, 'four_four')).toThrow(PlanValidationError)
    expect(() => parseNoteTick(5, 'dur')).toThrow(/legal note duration/)
    expect(() => parseNoteTick(0, 'dur')).toThrow(/legal note duration/)
    expect(() => parseScoreNote({ start: 0, dur: 5, pitches: ['C4'] }, 'notes[0]', 16)).toThrow(/legal note duration/)
    expect(() => parseScoreNote({ start: 0, dur: 16, pitches: ['MIDI 60'] }, 'notes[0]', 16)).toThrow(/spelled pitch/)
    expect(() => parseScoreNote({ start: 0, dur: 16, pitches: ['H4'] }, 'notes[0]', 16)).toThrow(/spelled pitch/)
    expect(() => parseScoreNote({ start: 12, dur: 8, pitches: ['C4'] }, 'notes[0]', 16)).toThrow(/barline/)
    expect(() => parseScoreVoice([
      { start: 0, dur: 8, pitches: ['C4'] },
      { start: 4, dur: 4, pitches: ['E4'] },
    ], 16)).toThrow(/overlaps/)
    expect(parseScoreVoice([{ start: 0, dur: 8, pitches: ['Eb4'] }, { start: 8, dur: 8, pitches: ['G4'] }], 16)).toHaveLength(2)
  })
})

describe('realize + overlay', () => {
  it('spells degrees in the key and changes the opening right-hand line', async () => {
    const plan = await samplePlan('four_four')
    const phrase = realizeJevNoteChoices(
      { rhythm: 'four_even', degrees: ['tonic', 'dominant', 'mediant', 'tonic_high'] },
      plan,
    )
    expect(phrase.notes).toHaveLength(4)
    expect(phrase.notes.map((n) => n.dur)).toEqual([4, 4, 4, 4])
    expect(phrase.notes.every((n) => n.pitches.length === 1)).toBe(true)
    for (const note of phrase.notes) expect(midiOf(note.pitches[0])).toBeGreaterThanOrEqual(55)

    const code = renderPlan(plan, 3)
    const overlaid = applyNotePhrase(code, phrase)
    expect(overlaid.bars[0].treble[0]).toEqual(phrase.notes)
    expect(overlaid.bars.slice(1)).toEqual(code.bars.slice(1))
    expect(overlaid.bars[0].bass).toEqual(code.bars[0].bass)
    expect(timeline(overlaid)[0].hand).toBe('right')
  })

  it('falls back to renderPlan when the phrase is illegal', async () => {
    const plan = await samplePlan('four_four')
    const code = renderPlan(plan, 7)
    const bad: NotePhrase = {
      barIndex: 0,
      voice: 'treble',
      rhythm: 'four_even',
      degrees: ['tonic', 'dominant', 'mediant', 'tonic_high'],
      notes: [{ start: 0, dur: 5, pitches: ['C4'], velocity: 72 }],
    }
    const result = renderWithOptionalJevNotes(plan, 7, bad)
    expect(result.used).toBe('code')
    expect(result.notice).toMatch(/Jev notes failed/)
    expect(result.notice).toMatch(/legal note duration|5/)
    expect(result.score).toEqual(code)

    const empty = renderWithOptionalJevNotes(plan, 7, null)
    expect(empty).toEqual({ score: code, used: 'code', notice: null })
  })

  it('rejects an all-rest phrase so the caller can fall back', async () => {
    const plan = await samplePlan('four_four')
    expect(() =>
      realizeJevNoteChoices({ rhythm: 'four_even', degrees: ['rest', 'rest', 'rest', 'rest'] }, plan),
    ).toThrow(/only rests/)
    const result = renderWithOptionalJevNotes(plan, 1, {
      barIndex: 0,
      voice: 'treble',
      rhythm: 'four_even',
      degrees: ['rest', 'rest', 'rest', 'rest'],
      notes: [],
    })
    expect(result.used).toBe('code')
    expect(result.notice).toMatch(/Jev notes failed/)
  })
})

describe('Jev notes op', () => {
  const notesOp = {
    op: 'notes' as const,
    style: 'bach' as const,
    brief: true,
    character: 'solemn_hymn' as const,
    key: 'C_major' as const,
    meter: 'four_four' as const,
    tempo: 'andante' as const,
    texture: 'chorale' as const,
    palette: 'diatonic' as const,
    bar: { chord: 'I' as const, role: 'statement' as const, contour: 'rise' as const },
  }

  it('is a small allowlisted op with closed choice criteria', () => {
    expect(parseOp(notesOp)).toEqual(notesOp)
    expect(() => parseOp({ ...notesOp, op: 'melody' })).toThrow(/notes/)
    expect(() => parseOp({ ...notesOp, meter: '7/8' })).toThrow()
    expect(() => parseOp({ ...notesOp, bar: { chord: 'H7', role: 'statement', contour: 'rise' } })).toThrow()

    const request = buildRequest(notesOp, 'jev-latest')
    expect(Object.keys(request.questions)).toEqual(['rhythm', 'pitch_1', 'pitch_2', 'pitch_3', 'pitch_4'])
    expect(Object.values(request.questions).every((question) => question.type === 'choice')).toBe(true)
    expect(Object.keys(request.questions.rhythm.criteria as object).every((id) => PHRASE_RHYTHMS[id as keyof typeof PHRASE_RHYTHMS].meter === 'four_four')).toBe(true)
    expect(Object.keys(request.questions.pitch_1.criteria as object)).toEqual(MELODY_DEGREE_IDS)
    expect(JSON.stringify(request.state)).toContain('C major')
    expect(JSON.stringify(request.questions)).not.toContain('MIDI')
  })

  it('turns a fake Jev distribution into a valid overlay', async () => {
    const plan = await samplePlan('four_four')
    const transport: JevTransport = async (op) => {
      const request = buildRequest(op, 'jev-latest')
      const answers: Record<string, Answer> = {}
      for (const [id, question] of Object.entries(request.questions)) {
        if (question.type !== 'choice') continue
        const options = Object.keys(question.criteria)
        const favourite = id === 'rhythm' ? 'four_even' : id === 'pitch_1' ? 'tonic' : 'dominant'
        const pick = options.includes(favourite) ? favourite : options[0]
        answers[id] = {
          type: 'choice',
          choice: pick,
          confidence: 0.8,
          probabilities: Object.fromEntries(options.map((option) => [option, option === pick ? 0.8 : 0.2 / (options.length - 1)])),
        }
      }
      const response: SystemOneResponse = { model: 'jev-1.13.0', answers, usage: { input_tokens: 40, output_tokens: 0 } }
      return response
    }
    const { phrase, exchange } = await new JevPlanner(transport).writeNotes(plan, { pick: 'argmax', seed: 1, brief: true })
    expect(exchange.op.op).toBe('notes')
    expect(exchange.sent).toBe(true)
    expect(phrase.notes.length).toBeGreaterThan(0)
    const { score, used, notice } = renderWithOptionalJevNotes(plan, 1, phrase)
    expect(used).toBe('jev')
    expect(notice).toBeNull()
    expect(score.bars[0].treble[0]).toEqual(phrase.notes)
  })
})
