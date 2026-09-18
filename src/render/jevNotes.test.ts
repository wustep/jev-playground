import { describe, expect, it } from 'vitest'
import { BASS_PATTERN_IDS, MELODY_DEGREE_IDS, NOTE_TICK_VALUES, PHRASE_NOTE_COUNT, PHRASE_RHYTHMS, parseJevNoteChoices, parseNoteTick } from '../plan/notes'
import { METER_IDS, PlanValidationError, type BarCount } from '../plan/schema'
import { HeuristicPlanner } from '../planner/HeuristicPlanner'
import { JevPlanner, type JevTransport } from '../planner/JevPlanner'
import { buildRequest, parseOp } from '../planner/jev/requests'
import type { Answer, SystemOneResponse } from '../planner/jev/systemOne'
import { themeSources } from '../plan/forms'
import {
  applyNotePhrase,
  applyNotePhrases,
  bassSlotsFor,
  notePhrasesCoverPlan,
  parseScoreNote,
  parseScoreVoice,
  realizeBassPattern,
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

function closedPhrase(plan: Awaited<ReturnType<typeof samplePlan>>, barIndex: number): NotePhrase {
  return realizeJevNoteChoices(
    { rhythm: 'four_long_short', degrees: ['tonic_high', 'dominant', 'mediant', 'tonic'], bassPattern: 'root_fifth' },
    plan,
    { barIndex },
  )
}

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
    const body = phrase.barIndex + (code.introBars ?? 0)
    expect(overlaid.bars[body].treble[0]).toEqual(phrase.notes)
    expect(overlaid.bars.filter((_, i) => i !== body)).toEqual(code.bars.filter((_, i) => i !== body))
    expect(overlaid.bars[body].bass).toEqual(code.bars[body].bass)
    expect(timeline(overlaid)[0].hand).toBe('right')

    const both = realizeJevNoteChoices(
      { rhythm: 'four_even', degrees: ['tonic', 'dominant', 'mediant', 'tonic_high'], bassPattern: 'root_fifth' },
      plan,
    )
    expect(both.bass?.notes.length).toBeGreaterThan(0)
    const withBass = applyNotePhrase(code, both)
    expect(withBass.bars[body].treble[0]).toEqual(both.notes)
    expect(withBass.bars[body].bass[0]).toEqual(both.bass!.notes)
    expect(withBass.bars[body].bass[0]).not.toEqual(code.bars[body].bass[0])
  })

  it('overlays the right-hand line on every plan bar, not just bar 1', async () => {
    const plan = await samplePlan('four_four')
    const phrases = plan.bars.map((_, i) => closedPhrase(plan, i))
    expect(notePhrasesCoverPlan(phrases, plan.bars.length)).toBe(true)
    expect(notePhrasesCoverPlan(phrases.slice(0, 1), plan.bars.length)).toBe(false)

    const code = renderPlan(plan, 3)
    const overlaid = applyNotePhrases(code, phrases)
    const intro = code.introBars ?? 0
    expect(overlaid.bars.slice(0, intro)).toEqual(code.bars.slice(0, intro))
    for (let i = 0; i < plan.bars.length; i++) {
      const index = i + intro
      expect(overlaid.bars[index].treble[0], `bar ${i + 1}`).toEqual(phrases[i].notes)
      expect(overlaid.bars[index].bass[0], `bar ${i + 1} bass`).toEqual(phrases[i].bass!.notes)
      expect(overlaid.bars[index].bass[0], `bar ${i + 1} bass changed`).not.toEqual(code.bars[index].bass[0])
    }

    const { score, used, notice } = renderWithOptionalJevNotes(plan, 3, phrases)
    expect(used).toBe('jev')
    expect(notice).toBeNull()
    const changed = plan.bars.filter((_, i) => {
      const index = i + (score.introBars ?? 0)
      return JSON.stringify(score.bars[index].treble[0]) !== JSON.stringify(code.bars[index].treble[0])
    })
    expect(changed.length).toBeGreaterThan(1)
    expect(score.bars.slice(score.introBars).map((bar) => bar.treble[0])).toEqual(phrases.map((phrase) => phrase.notes))
  })

  it('skips intro framing bars when overlaying later plan bars', async () => {
    const base = await samplePlan('four_four')
    const plan = { ...base, opening: 'vamp_intro' as const }
    const phrases = plan.bars.map((_, i) => closedPhrase(plan, i))
    const code = renderPlan(plan, 5)
    expect(code.introBars).toBeGreaterThan(0)
    const overlaid = applyNotePhrases(code, phrases)
    expect(overlaid.bars.slice(0, overlaid.introBars)).toEqual(code.bars.slice(0, code.introBars))
    for (let i = 0; i < plan.bars.length; i++) {
      const index = i + overlaid.introBars
      expect(overlaid.bars[index].treble[0]).toEqual(phrases[i].notes)
    }
    expect(notePhrasesCoverPlan([{ ...phrases[0], barIndex: 0 }], plan.bars.length)).toBe(false)
  })

  it('falls back to renderPlan when any overlaid phrase is illegal', async () => {
    const plan = await samplePlan('four_four')
    const good = plan.bars.map((_, i) => closedPhrase(plan, i))
    const mixed = good.map((phrase, i) =>
      i === 3 ? { ...phrase, notes: [{ start: 0, dur: 5, pitches: ['C4'], velocity: 72 }] } : phrase,
    )
    const code = renderPlan(plan, 7)
    const result = renderWithOptionalJevNotes(plan, 7, mixed)
    expect(result.used).toBe('code')
    expect(result.notice).toMatch(/Jev notes failed/)
    expect(result.score).toEqual(code)
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
    const result = renderWithOptionalJevNotes(plan, 7, [bad])
    expect(result.used).toBe('code')
    expect(result.notice).toMatch(/Jev notes failed/)
    expect(result.notice).toMatch(/legal note duration|5/)
    expect(result.score).toEqual(code)

    const empty = renderWithOptionalJevNotes(plan, 7, null)
    expect(empty).toEqual({ score: code, used: 'code', notice: null })
  })

  it('keeps renderPlan bass when one bar’s left hand is illegal', async () => {
    const plan = await samplePlan('four_four')
    const good = plan.bars.map((_, i) => closedPhrase(plan, i))
    const mixed = good.map((phrase, i) =>
      i === 2
        ? { ...phrase, bass: { pattern: 'root_fifth' as const, notes: [{ start: 0, dur: 5, pitches: ['C3'], velocity: 64 }] } }
        : phrase,
    )
    const code = renderPlan(plan, 7)
    const result = renderWithOptionalJevNotes(plan, 7, mixed)
    expect(result.used).toBe('jev')
    expect(result.notice).toMatch(/bass failed/)
    const intro = result.score.introBars ?? 0
    expect(result.score.bars[2 + intro].treble[0]).toEqual(mixed[2].notes)
    expect(result.score.bars[2 + intro].bass).toEqual(code.bars[2 + intro].bass)
    expect(result.score.bars[0 + intro].bass[0]).toEqual(good[0].bass!.notes)
  })

  it('rejects an all-rest phrase so the caller can fall back', async () => {
    const plan = await samplePlan('four_four')
    expect(() =>
      realizeJevNoteChoices({ rhythm: 'four_even', degrees: ['rest', 'rest', 'rest', 'rest'] }, plan),
    ).toThrow(/only rests/)
    const result = renderWithOptionalJevNotes(plan, 1, [{
      barIndex: 0,
      voice: 'treble',
      rhythm: 'four_even',
      degrees: ['rest', 'rest', 'rest', 'rest'],
      notes: [],
    }])
    expect(result.used).toBe('code')
    expect(result.notice).toMatch(/Jev notes failed/)
  })
})

describe('closed bass patterns', () => {
  it('fills every catalogued meter and stays in the bass range', async () => {
    const plan = await samplePlan('four_four')
    for (const pattern of BASS_PATTERN_IDS) {
      const slots = bassSlotsFor(pattern, METER_INFO.four_four)
      expect(slots.reduce((sum, slot) => sum + slot.ticks, 0), pattern).toBe(16)
      const bass = realizeBassPattern(pattern, plan, { barIndex: 0 })
      expect(bass.pattern).toBe(pattern)
      expect(bass.notes.length).toBeGreaterThan(0)
      expect(bass.notes.at(-1)!.start + bass.notes.at(-1)!.dur).toBe(16)
      for (const note of bass.notes) {
        expect(NOTE_TICK_VALUES).toContain(note.dur)
        expect(midiOf(note.pitches[0])).toBeGreaterThanOrEqual(28)
        expect(midiOf(note.pitches[0])).toBeLessThanOrEqual(55)
      }
    }
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
    expect(Object.keys(request.questions)).toEqual(['rhythm', 'pitch_1', 'pitch_2', 'pitch_3', 'pitch_4', 'bass_pattern'])
    expect(Object.values(request.questions).every((question) => question.type === 'choice')).toBe(true)
    expect(Object.keys(request.questions.rhythm.criteria as object).every((id) => PHRASE_RHYTHMS[id as keyof typeof PHRASE_RHYTHMS].meter === 'four_four')).toBe(true)
    expect(Object.keys(request.questions.pitch_1.criteria as object)).toEqual(MELODY_DEGREE_IDS)
    expect(Object.keys(request.questions.bass_pattern.criteria as object)).toEqual(BASS_PATTERN_IDS)
    expect(JSON.stringify(request.state)).toContain('C major')
    expect(JSON.stringify(request.state)).toContain('melody_so_far')
    expect(request.state).toMatchObject({ melody_so_far: [], last_sounding_degree: null })
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
        const favourite = id === 'rhythm' ? 'four_even' : id === 'pitch_1' ? 'tonic' : id === 'bass_pattern' ? 'root_fifth' : 'dominant'
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
    const { phrases, exchanges } = await new JevPlanner(transport).writeNotes(plan, { pick: 'argmax', seed: 1, brief: true })
    expect(exchanges.length).toBeGreaterThan(0)
    expect(exchanges.every((exchange) => exchange.op.op === 'notes')).toBe(true)
    expect(exchanges.every((exchange) => exchange.sent)).toBe(true)
    expect(phrases).toHaveLength(plan.bars.length)
    expect(notePhrasesCoverPlan(phrases, plan.bars.length)).toBe(true)
    const returns = themeSources(plan.form, plan.bars.length as BarCount)
    expect(exchanges).toHaveLength(returns.filter((source) => source === undefined).length)
    for (let i = 0; i < plan.bars.length; i++) {
      const source = returns[i]
      if (source === undefined) continue
      expect(phrases[i].rhythm).toBe(phrases[source].rhythm)
      expect(phrases[i].degrees).toEqual(phrases[source].degrees)
      expect(phrases[i].bass?.pattern).toBe(phrases[source].bass?.pattern)
    }
    const { score, used, notice } = renderWithOptionalJevNotes(plan, 1, phrases)
    expect(used).toBe('jev')
    expect(notice).toBeNull()
    const intro = score.introBars ?? 0
    for (let i = 0; i < phrases.length; i++) {
      expect(score.bars[i + intro].treble[0]).toEqual(phrases[i].notes)
      expect(score.bars[i + intro].bass[0]).toEqual(phrases[i].bass!.notes)
    }
    const firstNotes = exchanges[0].op
    if (firstNotes.op === 'notes') {
      expect(firstNotes.melodySoFar ?? []).toEqual([])
      expect(firstNotes.barIndex).toBe(0)
    }
    const laterNotes = exchanges.find((exchange) => exchange.op.op === 'notes' && exchange.op.op === 'notes' && (exchange.op.barIndex ?? 0) > 0)
    expect(laterNotes).toBeDefined()
    if (laterNotes && laterNotes.op.op === 'notes') {
      expect(laterNotes.op.melodySoFar?.length).toBe(laterNotes.op.barIndex)
      expect(laterNotes.request.state).toHaveProperty('melody_so_far')
      const soFar = laterNotes.request.state as { melody_so_far: unknown[] }
      expect(soFar.melody_so_far.length).toBe(laterNotes.op.barIndex)
      expect(JSON.stringify(laterNotes.request.state)).toContain('rhythm_id')
      expect(JSON.stringify(laterNotes.request.questions.rhythm.instructions)).toContain('melody_so_far')
    }
  })

  it('names the requested plan bar in the notes op and carries prior melody', () => {
    const later = buildRequest({
      ...notesOp,
      barIndex: 5,
      melodySoFar: [
        { rhythm: 'four_even', degrees: ['tonic', 'dominant', 'mediant', 'tonic'] },
        { rhythm: 'four_long_short', degrees: ['dominant', 'mediant', 'supertonic', 'tonic'] },
        { rhythm: 'four_even', degrees: ['tonic', 'rest', 'dominant', 'mediant'] },
        { rhythm: 'four_even', degrees: ['mediant', 'dominant', 'leading', 'tonic'] },
        { rhythm: 'four_syncop', degrees: ['dominant', 'tonic', 'leading', 'tonic'] },
      ],
      bassSoFar: ['root_hold', 'root_fifth', 'walk_down', 'pedal', 'octave_drop'],
      nextChord: 'V',
    }, 'jev-latest')
    expect(JSON.stringify(later.state)).toContain('bar 6')
    expect(JSON.stringify(later.state)).not.toMatch(/bar 1 only/)
    expect(later.state).toMatchObject({ this_bar: { bar_number: 6 } })
    expect(JSON.stringify(later.state)).toContain('melody_so_far')
    expect((later.state as { melody_so_far: unknown[] }).melody_so_far).toHaveLength(5)
    expect(JSON.stringify(later.state)).toContain('four_syncop')
    expect(JSON.stringify(later.state)).toContain('next_chord')
    expect(JSON.stringify(later.questions.rhythm.instructions)).toContain('melody_so_far')
    expect(JSON.stringify(later.questions.pitch_1.instructions)).toContain('last_sounding_degree')
    expect(later.questions).toHaveProperty('bass_pattern')
  })
})
