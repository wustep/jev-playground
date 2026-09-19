import { describe, expect, it } from 'vitest'
import { BASS_PATTERN_IDS, FIGURE_QUESTION_ID, GOAL_QUESTION_ID, MELODY_DEGREE_IDS, MELODY_FIGURE_IDS, MELODY_GOAL_IDS, NOTE_TICK_VALUES, PHRASE_NOTE_COUNT, PHRASE_RHYTHMS, guideRestSlot, parseJevNoteChoices, parseNoteTick, type MelodyDegreeId } from '../plan/notes'
import { METER_IDS, PlanValidationError, type BarCount, type BarRoleId, type CompositionPlan } from '../plan/schema'
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
  overlayMelodyVoice,
  parseScoreNote,
  parseScoreVoice,
  peelSkyline,
  pitchClassForDegree,
  lastSoundingMidi,
  realizeBassPattern,
  realizeJevGuideChoices,
  realizeJevNoteChoices,
  renderWithOptionalJevNotes,
  spellDegree,
  spellDegreeNear,
  chordHasSeventh,
  goalPitchClass,
  type NotePhrase,
} from './jevNotes'
import { keyInfo, resolveChord, scaleFor } from './harmony'
import { midiOf } from './pitch'
import { renderPlan, timeline } from './renderPlan'
import { METER_INFO, type Voice } from './score'

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

function cMajorPlan(role: BarRoleId = 'statement'): CompositionPlan {
  return {
    version: 1,
    style: 'chopin',
    character: 'lyrical_song',
    form: 'period',
    key: 'C_major',
    meter: 'four_four',
    texture: 'rolling_nocturne',
    palette: 'diatonic',
    tempo: 'andante',
    dynamics: 'p',
    dynamicShape: 'arch',
    defaultInstrument: 'grand_piano',
    arrangement: 'lift_on_return',
    opening: 'straight_in',
    bars: [
      { chord: 'I', role, contour: 'rise' },
      { chord: 'V', role: 'contrast', contour: 'leap_fall' },
    ],
  }
}

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
    expect(withBass.bars[body].bass).toEqual(code.bars[body].bass)
  })

  it('keeps renderPlan inner RH voices and the full left-hand texture', async () => {
    const plan = await samplePlan('four_four')
    const phrase = closedPhrase(plan, 0)
    const code = renderPlan(plan, 3)
    const body = phrase.barIndex + (code.introBars ?? 0)
    const inner: Voice = Array.from({ length: 16 }, (_, i) => ({ start: i, dur: 1, pitches: ['G4'], velocity: 64 }))
    const bassInner: Voice = inner.map((note) => ({ ...note, pitches: ['C3'] }))
    const crowded: typeof code = {
      ...code,
      bars: code.bars.map((bar, i) =>
        i === body
          ? { ...bar, treble: [bar.treble[0] ?? [], inner], bass: [bar.bass[0] ?? [], bassInner] }
          : bar,
      ),
    }
    expect(crowded.bars[body].treble.length).toBeGreaterThan(1)
    expect(crowded.bars[body].bass.length).toBeGreaterThan(1)

    const overlaid = applyNotePhrase(crowded, phrase)
    expect(overlaid.bars[body].treble[0]).toEqual(phrase.notes)
    expect(overlaid.bars[body].treble.slice(1)).toEqual([inner])
    expect(overlaid.bars[body].bass).toEqual(crowded.bars[body].bass)
    expect(overlaid.bars[body].bass).not.toEqual([phrase.bass!.notes])
  })

  it('keeps a chorale alto under the Jev soprano', () => {
    const plan: CompositionPlan = { ...cMajorPlan(), style: 'bach', character: 'solemn_hymn', texture: 'chorale' }
    const phrase = realizeJevNoteChoices(
      { rhythm: 'four_even', degrees: ['tonic', 'mediant', 'dominant', 'tonic_high'] },
      plan,
    )
    const code = renderPlan(plan, 11)
    const overlaid = applyNotePhrase(code, phrase)
    const body = phrase.barIndex + (code.introBars ?? 0)
    expect(code.bars[body].treble.length).toBeGreaterThan(1)
    expect(overlaid.bars[body].treble[0]).toEqual(phrase.notes)
    expect(overlaid.bars[body].treble[1]).toEqual(code.bars[body].treble[1])
    expect(overlaid.bars[body].bass).toEqual(code.bars[body].bass)
  })

  it('keeps an Alberti left hand under the Jev tune', () => {
    const plan: CompositionPlan = { ...cMajorPlan(), texture: 'alberti_melody' }
    const phrase = realizeJevNoteChoices(
      { rhythm: 'four_even', degrees: ['tonic', 'dominant', 'mediant', 'tonic'] },
      plan,
    )
    const code = renderPlan(plan, 3)
    const overlaid = applyNotePhrase(code, phrase)
    const body = phrase.barIndex + (code.introBars ?? 0)
    const attacks = (voices: Voice[]) => voices.reduce((sum, voice) => sum + voice.length, 0)
    expect(overlaid.bars[body].treble[0]).toEqual(phrase.notes)
    expect(overlaid.bars[body].treble.slice(1)).toEqual(code.bars[body].treble.slice(1))
    expect(overlaid.bars[body].bass).toEqual(code.bars[body].bass)
    expect(attacks(code.bars[body].bass)).toBeGreaterThanOrEqual(4)
    expect(attacks([...overlaid.bars[body].treble, ...overlaid.bars[body].bass])).toBe(
      phrase.notes.length + attacks(code.bars[body].treble.slice(1)) + attacks(code.bars[body].bass),
    )
  })

  it('peels a chordal skyline so inner RH tones stay under the Jev tune', () => {
    const singing: Voice = [
      { start: 0, dur: 8, pitches: ['E4', 'G4', 'C5'], velocity: 70 },
      { start: 8, dur: 8, pitches: ['D4', 'G4', 'B4'], velocity: 70 },
    ]
    const jev: Voice = [
      { start: 0, dur: 8, pitches: ['E5'], velocity: 80 },
      { start: 8, dur: 8, pitches: ['G5'], velocity: 80 },
    ]
    expect(peelSkyline(singing)).toEqual([
      { start: 0, dur: 8, pitches: ['E4', 'G4'], velocity: 70 },
      { start: 8, dur: 8, pitches: ['D4', 'G4'], velocity: 70 },
    ])
    const overlaid = overlayMelodyVoice([singing], jev)
    expect(overlaid[0]).toEqual(jev)
    expect(overlaid[1]).toEqual(peelSkyline(singing))
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
      expect(overlaid.bars[index].treble.slice(1), `bar ${i + 1} inner`).toEqual(code.bars[index].treble.slice(1))
      expect(overlaid.bars[index].bass, `bar ${i + 1} bass`).toEqual(code.bars[index].bass)
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

  it('never overlays a closed bass pattern — renderPlan keeps the left hand', async () => {
    const plan = await samplePlan('four_four')
    const phrases = plan.bars.map((_, i) => closedPhrase(plan, i))
    const code = renderPlan(plan, 7)
    const result = renderWithOptionalJevNotes(plan, 7, phrases)
    expect(result.used).toBe('jev')
    expect(result.notice).toBeNull()
    const intro = result.score.introBars ?? 0
    for (let i = 0; i < phrases.length; i++) {
      expect(result.score.bars[i + intro].treble[0]).toEqual(phrases[i].notes)
      expect(result.score.bars[i + intro].bass).toEqual(code.bars[i + intro].bass)
    }
  })

  it('still falls back when a voice-led phrase later becomes illegal', async () => {
    const plan = cMajorPlan()
    const good = realizeJevNoteChoices(
      { rhythm: 'four_even', degrees: ['tonic_high', 'dominant_low', 'tonic', 'mediant_high'] },
      plan,
    )
    expect(good.degrees).toEqual(['tonic_high', 'dominant_low', 'tonic', 'mediant_high'])
    const code = renderPlan(plan, 7)
    const result = renderWithOptionalJevNotes(plan, 7, [{
      ...good,
      notes: [{ start: 0, dur: 5, pitches: ['C4'], velocity: 72 }],
    }])
    expect(result.used).toBe('code')
    expect(result.notice).toMatch(/Jev notes failed/)
    expect(result.score).toEqual(code)
  })
})

describe('post-realize voice leading', () => {
  const leaping: { rhythm: 'four_even'; degrees: MelodyDegreeId[] } = {
    rhythm: 'four_even',
    degrees: ['tonic_high', 'dominant_low', 'tonic', 'mediant_high'],
  }

  it('keeps Jev degrees and snaps register toward stepwise / small-leap motion', () => {
    const plan = cMajorPlan('statement')
    const raw = realizeJevNoteChoices(leaping, plan, { voiceLead: false })
    const led = realizeJevNoteChoices(leaping, plan, { voiceLead: true, lastSoundingMidi: 72 })
    expect(led.degrees).toEqual([...leaping.degrees])
    expect(raw.degrees).toEqual(led.degrees)
    const rawMidis = raw.notes.map((note) => midiOf(note.pitches[0]))
    const ledMidis = led.notes.map((note) => midiOf(note.pitches[0]))
    for (let i = 1; i < ledMidis.length; i++) {
      expect(Math.abs(ledMidis[i] - ledMidis[i - 1]), `led step ${i}`).toBeLessThanOrEqual(7)
    }
    expect(Math.abs(rawMidis[1] - rawMidis[0])).toBeGreaterThan(7)
    expect(Math.abs(ledMidis[0] - 72)).toBeLessThanOrEqual(7)
    expect(spellDegreeNear('dominant_low', ['C', 'D', 'E', 'F', 'G', 'A', 'B'], 72)).toBe('G4')
    expect(spellDegree('dominant_low', ['C', 'D', 'E', 'F', 'G', 'A', 'B'], 67)).not.toBe(
      spellDegreeNear('dominant_low', ['C', 'D', 'E', 'F', 'G', 'A', 'B'], 67),
    )
  })

  it('does not snap register on contrast, climax, or surprise', () => {
    const contrast = realizeJevNoteChoices(leaping, cMajorPlan('contrast'))
    const climax = realizeJevNoteChoices(leaping, cMajorPlan('climax'))
    const raw = realizeJevNoteChoices(leaping, cMajorPlan('statement'), { voiceLead: false })
    expect(contrast.notes.map((note) => note.pitches[0])).toEqual(raw.notes.map((note) => note.pitches[0]))
    expect(climax.notes.map((note) => note.pitches[0])).toEqual(raw.notes.map((note) => note.pitches[0]))
  })

  it('continues from last_sounding midi across the barline', () => {
    const plan = cMajorPlan()
    const first = realizeJevNoteChoices({ rhythm: 'four_even', degrees: ['tonic', 'supertonic', 'mediant', 'dominant'] }, plan)
    const last = lastSoundingMidi(first.notes)
    expect(last).toBeDefined()
    const second = realizeJevNoteChoices(
      { rhythm: 'four_even', degrees: ['dominant_low', 'tonic', 'supertonic', 'mediant'] },
      plan,
      { lastSoundingMidi: last, voiceLead: true },
    )
    expect(Math.abs(midiOf(second.notes[0].pitches[0]) - last!)).toBeLessThanOrEqual(7)
  })
})

describe('gapped palette degree mapping', () => {
  const pentatonic = ['C', 'D', 'E', 'G', 'A']
  const wholeTone = ['C', 'D', 'E', 'F#', 'G#', 'A#']
  const minorPentatonic = ['C', 'Eb', 'F', 'G', 'Bb']
  const majorBlues = ['C', 'D', 'Eb', 'E', 'G', 'A']
  const minorBlues = ['C', 'Eb', 'F', 'Gb', 'G', 'Bb']

  it('maps functional names onto C pentatonic instead of wrapping the index', () => {
    expect(scaleFor(keyInfo('C_major'), 'pentatonic', resolveChord(keyInfo('C_major'), 'I'))).toEqual(pentatonic)
    expect(pitchClassForDegree('tonic', pentatonic)).toBe('C')
    expect(pitchClassForDegree('supertonic', pentatonic)).toBe('D')
    expect(pitchClassForDegree('mediant', pentatonic)).toBe('E')
    expect(pitchClassForDegree('subdominant', pentatonic)).toBe('E')
    expect(pitchClassForDegree('dominant', pentatonic)).toBe('G')
    expect(pitchClassForDegree('submediant', pentatonic)).toBe('A')
    expect(pitchClassForDegree('leading', pentatonic)).toBe('A')
    expect(pitchClassForDegree('tonic_high', pentatonic)).toBe('C')
    expect(pitchClassForDegree('dominant_low', pentatonic)).toBe('G')
    expect(pitchClassForDegree('rest', pentatonic)).toBeNull()
    // The old wrap: scale[4] was A.
    expect(pitchClassForDegree('dominant', pentatonic)).not.toBe('A')
  })

  it('maps functional names onto whole-tone and blues palettes', () => {
    expect(pitchClassForDegree('tonic', wholeTone)).toBe('C')
    expect(pitchClassForDegree('supertonic', wholeTone)).toBe('D')
    expect(pitchClassForDegree('mediant', wholeTone)).toBe('E')
    expect(pitchClassForDegree('subdominant', wholeTone)).toBe('F#')
    expect(pitchClassForDegree('dominant', wholeTone)).toBe('G#')
    expect(pitchClassForDegree('submediant', wholeTone)).toBe('A#')
    expect(pitchClassForDegree('leading', wholeTone)).toBe('A#')

    expect(pitchClassForDegree('tonic', majorBlues)).toBe('C')
    expect(pitchClassForDegree('supertonic', majorBlues)).toBe('D')
    expect(pitchClassForDegree('mediant', majorBlues)).toBe('E')
    expect(pitchClassForDegree('subdominant', majorBlues)).toBe('E')
    expect(pitchClassForDegree('dominant', majorBlues)).toBe('G')
    expect(pitchClassForDegree('submediant', majorBlues)).toBe('A')
    expect(pitchClassForDegree('leading', majorBlues)).toBe('A')

    expect(pitchClassForDegree('supertonic', minorPentatonic, { minor: true })).toBe('Eb')
    expect(pitchClassForDegree('mediant', minorPentatonic, { minor: true })).toBe('Eb')
    expect(pitchClassForDegree('subdominant', minorPentatonic, { minor: true })).toBe('F')
    expect(pitchClassForDegree('dominant', minorPentatonic, { minor: true })).toBe('G')
    expect(pitchClassForDegree('submediant', minorPentatonic, { minor: true })).toBe('G')
    expect(pitchClassForDegree('leading', minorPentatonic, { minor: true })).toBe('Bb')

    expect(pitchClassForDegree('dominant', minorBlues, { minor: true })).toBe('G')
    expect(pitchClassForDegree('leading', minorBlues, { minor: true })).toBe('Bb')
    expect(pitchClassForDegree('subdominant', minorBlues, { minor: true })).toBe('F')
  })

  it('still indexes a 7-note (possibly bent) scale by degree', () => {
    const diatonic = ['C', 'D', 'E', 'F', 'G', 'A', 'B']
    expect(pitchClassForDegree('dominant', diatonic)).toBe('G')
    expect(pitchClassForDegree('subdominant', diatonic)).toBe('F')
    expect(pitchClassForDegree('leading', diatonic)).toBe('B')
    const bent = scaleFor(keyInfo('C_major'), 'diatonic', resolveChord(keyInfo('C_major'), 'V7_of_V'))
    expect(bent).toContain('F#')
    expect(pitchClassForDegree('subdominant', bent)).toBe('F#')
  })

  it('realizes a pentatonic dominant as G, not the wrapped A', () => {
    const plan: CompositionPlan = { ...cMajorPlan(), palette: 'pentatonic' }
    const phrase = realizeJevNoteChoices(
      { rhythm: 'four_even', degrees: ['tonic', 'dominant', 'mediant', 'tonic_high'] },
      plan,
      { voiceLead: false },
    )
    expect(phrase.notes.map((note) => note.pitches[0].replace(/\d/, ''))).toEqual(['C', 'G', 'E', 'C'])
    expect(midiOf(phrase.notes[3].pitches[0]) - midiOf(phrase.notes[0].pitches[0])).toBe(12)
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

  it('fills alberti and afterbeat, and voice-leads from a prior bass pitch', () => {
    const plan = cMajorPlan()
    const alberti = realizeBassPattern('alberti', plan)
    expect(alberti.notes).toHaveLength(4)
    expect(alberti.notes.map((note) => note.dur)).toEqual([4, 4, 4, 4])
    const afterbeat = realizeBassPattern('afterbeat', plan)
    expect(afterbeat.notes[0].start).toBeGreaterThan(0)
    expect(afterbeat.notes.every((note) => NOTE_TICK_VALUES.includes(note.dur))).toBe(true)
    expect(afterbeat.notes.at(-1)!.start + afterbeat.notes.at(-1)!.dur).toBe(16)
    const held = realizeBassPattern('root_hold', plan, { lastBassMidi: 36 })
    expect(midiOf(held.notes[0].pitches[0])).toBe(36)
  })
})

describe('realize + overlay', () => {
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
    expect(JSON.stringify(request.state)).toContain('arrangement')
    expect(JSON.stringify(request.state)).toContain('Grave, chordal')
    expect(request.state).toMatchObject({ melody_so_far: [], last_sounding_degree: null, melody_motion: 'stepwise_echo' })
    expect(JSON.stringify(request.questions.rhythm.criteria)).toMatch(/breathe/)
    expect(JSON.stringify(request.questions.rhythm.instructions)).toMatch(/long tone/)
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
    const code = renderPlan(plan, 1)
    for (let i = 0; i < phrases.length; i++) {
      expect(score.bars[i + intro].treble[0]).toEqual(phrases[i].notes)
      expect(score.bars[i + intro].bass).toEqual(code.bars[i + intro].bass)
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
    expect(JSON.stringify(later.questions.pitch_1.instructions)).toMatch(/random leap/)
    expect(later.state).toMatchObject({ motif_echo: expect.stringContaining('melody_so_far') })
    expect(later.questions).toHaveProperty('bass_pattern')
  })

  it('asks figure + goal in guide mode and drops pitch_1..4', () => {
    const guide = buildRequest({ ...notesOp, mode: 'guide' }, 'jev-latest')
    expect(Object.keys(guide.questions)).toEqual([FIGURE_QUESTION_ID, GOAL_QUESTION_ID])
    expect(Object.keys(guide.questions.figure.criteria as object)).toEqual(MELODY_FIGURE_IDS)
    expect(Object.keys(guide.questions.goal.criteria as object)).toEqual(MELODY_GOAL_IDS)
    expect(guide.questions).not.toHaveProperty('pitch_1')
    expect(guide.questions).not.toHaveProperty('rhythm')
    expect(guide.questions).not.toHaveProperty('bass_pattern')
    expect(JSON.stringify(guide.state)).toMatch(/figure and a goal|figures and goals|Guide the opening/)
    expect(guide.state).toMatchObject({ notes_mode: expect.stringContaining('guides the tune') })

    const later = buildRequest({
      ...notesOp,
      mode: 'guide',
      barIndex: 2,
      melodySoFar: [
        { figure: 'step_to_goal', goal: 'fifth' },
        { figure: 'motif_echo', goal: 'root' },
      ],
    }, 'jev-latest')
    expect((later.state as { melody_so_far: unknown[] }).melody_so_far).toHaveLength(2)
    expect(JSON.stringify(later.state)).toContain('step_to_goal')
    expect(JSON.stringify(later.state)).not.toContain('pitch_1')
    expect(JSON.stringify(later.questions.figure.instructions)).toContain('melody_so_far')
  })

  it('turns a fake Jev guide distribution into a valid overlay', async () => {
    const plan = await samplePlan('four_four')
    const transport: JevTransport = async (op) => {
      const request = buildRequest(op, 'jev-latest')
      const answers: Record<string, Answer> = {}
      for (const [id, question] of Object.entries(request.questions)) {
        if (question.type !== 'choice') continue
        const options = Object.keys(question.criteria)
        const favourite = id === 'figure' ? 'step_to_goal' : id === 'goal' ? 'fifth' : options[0]
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
    const { phrases, exchanges } = await new JevPlanner(transport).writeNotes(plan, { pick: 'argmax', seed: 1, brief: true }, { mode: 'guide' })
    expect(exchanges.every((exchange) => exchange.op.op === 'notes' && exchange.op.mode === 'guide')).toBe(true)
    expect(phrases).toHaveLength(plan.bars.length)
    expect(phrases.every((phrase) => phrase.figure && phrase.goal && phrase.mode === 'guide')).toBe(true)
    const returns = themeSources(plan.form, plan.bars.length as BarCount)
    expect(exchanges).toHaveLength(returns.filter((source) => source === undefined).length)
    for (let i = 0; i < plan.bars.length; i++) {
      const source = returns[i]
      if (source === undefined) continue
      expect(phrases[i].figure).toBe(phrases[source].figure)
      expect(phrases[i].goal).toBe(phrases[source].goal)
    }
    const { score, used, notice } = renderWithOptionalJevNotes(plan, 1, phrases)
    expect(used).toBe('jev')
    expect(notice).toBeNull()
    const intro = score.introBars ?? 0
    const code = renderPlan(plan, 1)
    for (let i = 0; i < phrases.length; i++) {
      expect(score.bars[i + intro].treble[0]).toEqual(phrases[i].notes)
      expect(score.bars[i + intro].bass).toEqual(code.bars[i + intro].bass)
      expect(score.bars[i + intro].treble.slice(1)).toEqual(code.bars[i + intro].treble.slice(1))
    }
    const later = exchanges.find((exchange) => exchange.op.op === 'notes' && (exchange.op.barIndex ?? 0) > 0)
    if (later && later.op.op === 'notes') {
      expect(later.op.melodySoFar?.length).toBe(later.op.barIndex)
      expect(JSON.stringify(later.request.state)).toContain('figure_id')
    }
  })
})

describe('D1 guide realization', () => {
  it('lands the last sounding slot on the chosen chord-tone goal', () => {
    const plan = cMajorPlan()
    const fifth = realizeJevGuideChoices({ figure: 'step_to_goal', goal: 'fifth' }, plan, { lyrical: false })
    expect(fifth.goal).toBe('fifth')
    expect(fifth.figure).toBe('step_to_goal')
    expect(fifth.notes.length).toBeGreaterThan(0)
    expect(fifth.notes.at(-1)!.pitches[0].replace(/\d+$/, '')).toBe('G')
    const root = realizeJevGuideChoices({ figure: 'hold_resolve', goal: 'root' }, plan, { lyrical: false })
    expect(root.notes.at(-1)!.pitches[0].replace(/\d+$/, '')).toBe('C')
    const third = realizeJevGuideChoices({ figure: 'arpeggio_up', goal: 'third' }, plan, { lyrical: false })
    expect(third.notes.at(-1)!.pitches[0].replace(/\d+$/, '')).toBe('E')
  })

  it('uses a real seventh on V7 and snaps seventh to the fifth on a triad', () => {
    const plan = cMajorPlan()
    const tonic = resolveChord(keyInfo('C_major'), 'I')
    const dominant = resolveChord(keyInfo('C_major'), 'V7')
    expect(chordHasSeventh(tonic)).toBe(false)
    expect(chordHasSeventh(dominant)).toBe(true)
    expect(goalPitchClass(tonic, 'seventh')).toBe('G')
    expect(goalPitchClass(dominant, 'seventh')).toBe('F')
    const onI = realizeJevGuideChoices({ figure: 'step_to_goal', goal: 'seventh' }, plan, { lyrical: false })
    expect(onI.notes.at(-1)!.pitches[0].replace(/\d+$/, '')).toBe('G')
    const v7Plan: CompositionPlan = { ...plan, bars: [{ chord: 'V7', role: 'statement', contour: 'fall' }, plan.bars[1]] }
    const onV7 = realizeJevGuideChoices({ figure: 'step_to_goal', goal: 'seventh' }, v7Plan, { lyrical: false })
    expect(onV7.notes.at(-1)!.pitches[0].replace(/\d+$/, '')).toBe('F')
  })

  it('keeps renderPlan accompaniment under a guide overlay', () => {
    const plan: CompositionPlan = { ...cMajorPlan(), texture: 'alberti_melody' }
    const phrase = realizeJevGuideChoices({ figure: 'arpeggio_down', goal: 'root' }, plan, { lyrical: false })
    const code = renderPlan(plan, 3)
    const overlaid = applyNotePhrase(code, phrase)
    const body = phrase.barIndex + (code.introBars ?? 0)
    expect(overlaid.bars[body].treble[0]).toEqual(phrase.notes)
    expect(overlaid.bars[body].treble.slice(1)).toEqual(code.bars[body].treble.slice(1))
    expect(overlaid.bars[body].bass).toEqual(code.bars[body].bass)
    const { score, used } = renderWithOptionalJevNotes(plan, 3, [phrase])
    expect(used).toBe('jev')
    expect(score.bars[body].bass).toEqual(code.bars[body].bass)
  })

  it('does not rest the longest slot or the first mid-phrase beat', () => {
    expect(guideRestSlot([8, 4, 2, 2], 4, 16)).toBe(3)
    expect(guideRestSlot([4, 4, 4, 4], 4, 16)).toBe(1)
    const plan = cMajorPlan()
    const phrase = realizeJevGuideChoices({ figure: 'hold_resolve', goal: 'fifth' }, plan, { lyrical: true })
    const ticks = PHRASE_RHYTHMS[phrase.rhythm].ticks
    const onsets: number[] = []
    let at = 0
    for (const dur of ticks) {
      onsets.push(at)
      at += dur
    }
    const restIndexes = ticks.map((_, i) => i).filter((i) => !phrase.notes.some((note) => note.start === onsets[i]))
    expect(restIndexes).not.toContain(ticks.findIndex((tick) => tick === Math.max(...ticks)))
    const mid = onsets.findIndex((start) => start >= 8 && start % 4 === 0)
    expect(restIndexes).not.toContain(mid)
    expect(phrase.notes.some((note) => note.dur === Math.max(...ticks))).toBe(true)
  })

  it('prefers chord tones on strong beats', () => {
    const plan = cMajorPlan()
    const phrase = realizeJevGuideChoices({ figure: 'step_to_goal', goal: 'fifth' }, plan, { lyrical: false })
    const chord = resolveChord(keyInfo('C_major'), 'I')
    const chromas = new Set(chord.pcs.map((pc) => midiOf(`${pc}4`) % 12))
    for (const note of phrase.notes) {
      if (note.start % 4 !== 0) continue
      expect(chromas.has(midiOf(note.pitches[0]) % 12), `strong tick ${note.start}`).toBe(true)
    }
  })
})
