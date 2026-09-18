import { Midi } from '@tonejs/midi'
import { describe, expect, it } from 'vitest'
import { handleJev } from '../../server/jevHandler'
import { scoreToMidi } from '../midi/exportMidi'
import { BAR_COUNT_VALUES, BAR_ROLE_IDS, CHARACTER_IDS, FORM_IDS, PEDAL_IDS, STYLE_IDS, TEMPO_IDS, parsePlan } from '../plan/schema'
import { formRoles, formSlots } from '../plan/forms'
import { STYLE_PROFILES } from '../plan/styles'
import { keyInfo, resolveChord } from '../render/harmony'
import { renderPlan, timeline } from '../render/renderPlan'
import { HeuristicPlanner } from './HeuristicPlanner'
import { JevPlanner, type JevTransport } from './JevPlanner'
import { buildRequest, chordOptionsFor, parseOp } from './jev/requests'
import { pickFrom, rng, withNovelty } from './pick'
import type { Answer, SystemOneRequest, SystemOneResponse } from './jev/systemOne'

/**
 * A stand-in for the TypeSafe API that obeys the documented response shape:
 * every Choice gets a distribution over exactly the options it was offered,
 * every Score a distribution over its levels. `prefer` biases named questions.
 */
function fakeJev(prefer: Record<string, string> = {}) {
  const seen: SystemOneRequest[] = []
  const transport: JevTransport = async (op) => {
    const request = buildRequest(op, 'jev-latest')
    seen.push(request)
    const answers: Record<string, Answer> = {}
    for (const [id, question] of Object.entries(request.questions)) {
      if (question.type === 'choice') {
        const options = Object.keys(question.criteria)
        const favourite = prefer[id] ?? options[0]
        const rest = 0.2 / (options.length - 1)
        answers[id] = {
          type: 'choice',
          choice: favourite,
          confidence: 0.8,
          probabilities: Object.fromEntries(options.map((option) => [option, option === favourite ? 0.8 : rest])),
        }
      } else if (question.type === 'noul') {
        answers[id] = { type: 'noul', noul: prefer[id] === 'yes' ? 0.95 : 0.2 }
      } else if (question.type === 'score') {
        answers[id] = { type: 'score', score: 1.6, legend: {}, probabilities: { '0': 0.05, '1': 0.3, '2': 0.65 }, confidence: 0.78 }
      }
    }
    const response: SystemOneResponse = { model: 'jev-1.13.0', answers, usage: { input_tokens: 100, output_tokens: 0 } }
    return response
  }
  return { transport, seen }
}

describe('JevPlanner', () => {
  it('assembles a valid plan from a character, one fan-out, and one request per phrase slot', async () => {
    const { transport, seen } = fakeJev({ character: 'hypnotic_pulse', writes_hypnotic_pulse: 'yes', form: 'additive_loop', texture: 'minimal_cells', key: 'A_minor' })
    const planner = new JevPlanner(transport)
    const { plan, trace } = await planner.plan({ style: 'glass', bars: 8, pick: 'argmax', seed: 1, brief: false })

    expect(parsePlan(plan)).toEqual(plan)
    expect(plan.character).toBe('hypnotic_pulse')
    expect(plan.texture).toBe('minimal_cells')
    expect(plan.bars).toHaveLength(8)
    expect(plan.bars.every((bar) => typeof bar.chord === 'string')).toBe(true)
    // Roles are not asked of Jev: they are the chosen form, expanded by code.
    expect(plan.bars.map((bar) => bar.role)).toEqual(formRoles('additive_loop', 8))
    expect(trace.requests).toBe(4)
    expect(trace.model).toBe('jev-1.13.0')
    expect(trace.inputTokens).toBe(400)
    expect(trace.exchanges.every((exchange) => exchange.sent && exchange.response)).toBe(true)

    // Request 1 asks only about character: which is most typical, plus one yes/no per character …
    expect(Object.keys(seen[0].questions)).toHaveLength(1 + CHARACTER_IDS.length)
    expect(Object.values(seen[0].questions).filter((question) => question.type === 'noul')).toHaveLength(CHARACTER_IDS.length)
    // … and with the brief off, the style's name is all Jev gets.
    expect(seen[0].state).toMatchObject({ requested_style: { name: 'Philip Glass' } })
    expect(JSON.stringify(seen[0].state)).not.toContain('minimalism')
    // Request 2 fans out form + the other globals, conditioned on that character. Length is never asked.
    expect(Object.keys(seen[1].questions)).toHaveLength(12)
    expect(Object.keys(seen[1].questions)).toContain('arrangement')
    expect(Object.keys(seen[1].questions)).toContain('opening')
    expect(Object.keys(seen[1].questions)).toContain('pedal')
    expect(Object.keys(seen[1].questions.tempo.criteria as object)).toEqual(TEMPO_IDS)
    expect(Object.keys(seen[1].questions.pedal.criteria as object)).toEqual(PEDAL_IDS)
    expect(Object.keys(seen[1].questions)).not.toContain('barCount')
    expect(JSON.stringify(seen[1].state)).toContain('steady motoric pulse')
    // Phrase requests carry the book options and prior-slot contour context.
    expect(Object.keys(seen[2].questions)).toEqual(['phrase', 'contour_0', 'contour_1', 'contour_2', 'contour_3'])
    expect(Object.keys(seen[2].questions.phrase.criteria as object).length).toBeGreaterThan(2)
    expect(JSON.stringify(seen[3].state)).toContain('phrases_so_far')
    expect(JSON.stringify(seen[3].state)).toContain('prior_melodic_shapes')
    expect(Object.keys(chordOptionsFor('A_minor'))).not.toContain('Imaj9')
    expect(Object.keys(chordOptionsFor('C_major'))).not.toContain('i64')

    renderPlan(plan, 1) // and the renderer accepts it
  })

  it('keeps a sampled progression moving without touching what the trace reports', async () => {
    const { transport } = fakeJev({ key: 'C_major' })
    const { plan, trace } = await new JevPlanner(transport).plan({ style: 'bach', bars: 8, pick: 'sample', seed: 4, brief: true })
    const repeats = plan.bars.filter((bar, i) => i > 0 && bar.chord === plan.bars[i - 1].chord).length
    expect(repeats).toBeLessThan(6)
    expect(new Set(plan.bars.map((bar) => bar.chord)).size).toBeGreaterThan(1)
    const first = trace.decisions.find((d) => d.field === 'slots[0].phrase')!
    const top = Object.values(first.probabilities).reduce((a, b) => Math.max(a, b), 0)
    expect(top).toBeCloseTo(0.8)
  })

  it('hands Chopin, Hans Zimmer and Laufey briefs to Jev when asked', () => {
    for (const [style, name, snippet] of [
      ['chopin', 'Frédéric Chopin', 'cantabile'],
      ['hans_zimmer', 'Hans Zimmer', 'ostinato'],
      ['laufey', 'Laufey', 'jazz-pop'],
    ] as const) {
      const on = buildRequest({ op: 'concept', style, brief: true }, 'jev-latest')
      const off = buildRequest({ op: 'concept', style, brief: false }, 'jev-latest')
      expect(off.state).toMatchObject({ requested_style: { name } })
      expect(JSON.stringify(off.state)).not.toContain(snippet)
      expect(JSON.stringify(on.state)).toContain(name)
      expect(JSON.stringify(on.state)).toContain(snippet)
    }
  })

  it('never names a composer in option descriptions', () => {
    const requests = [
      buildRequest({ op: 'concept', style: 'debussy', brief: false }, 'jev-latest'),
      buildRequest({ op: 'globals', style: 'debussy', brief: false, character: 'dreamy_haze' }, 'jev-latest'),
      buildRequest({
        op: 'notes',
        style: 'debussy',
        brief: false,
        character: 'dreamy_haze',
        key: 'Db_major',
        meter: 'four_four',
        tempo: 'andante',
        texture: 'parallel_planing',
        palette: 'whole_tone',
        bar: { chord: 'Imaj7', role: 'statement', contour: 'arch' },
      }, 'jev-latest'),
      buildRequest({
        op: 'phrase',
        style: 'debussy',
        brief: false,
        globals: {
          character: 'dreamy_haze',
          form: 'mosaic_pairs',
          key: 'Db_major',
          meter: 'nine_eight',
          texture: 'parallel_planing',
          palette: 'whole_tone',
          tempo: 'andante',
          dynamics: 'pp',
          dynamicShape: 'arch',
          defaultInstrument: 'grand_piano',
        },
        barCount: 8,
        slotIndex: 0,
        chords: [],
        contours: [],
      }, 'jev-latest'),
    ]
    const criteria = JSON.stringify(requests.flatMap((request) => Object.values(request.questions).map((q) => [q.criteria, q.instructions])))
    const chords = JSON.stringify([chordOptionsFor('C_major'), chordOptionsFor('C_minor')])
    for (const name of ['Bach', 'Beethoven', 'Debussy', 'Glass', 'Laufey', 'Fox', 'Chopin', 'Zimmer', 'Satie', 'Reich']) {
      expect(criteria).not.toContain(name)
      expect(chords).not.toContain(name)
    }
  })

  it('maps Score answers to low / medium / high', async () => {
    const { transport } = fakeJev()
    const { plan } = await new HeuristicPlanner().plan({ style: 'bach', bars: 4, pick: 'argmax', seed: 1, brief: true })
    const { scores, exchanges } = await new JevPlanner(transport).score(plan, STYLE_IDS)
    expect(scores.bach).toEqual({ match: 'high', confidence: 0.78, raw: 1.6 })
    expect(Object.keys(exchanges[0].request.questions)).toHaveLength(STYLE_IDS.length)
    // The label under test is withheld from the scorer's state.
    expect(JSON.stringify(exchanges[0].request.state)).not.toContain('"style"')
  })
})

describe('HeuristicPlanner', () => {
  it('records the payloads Jev would have been sent, unsent', async () => {
    const { plan, trace } = await new HeuristicPlanner().plan({ style: 'elijah_fox', bars: 8, pick: 'sample', seed: 9, brief: true })
    expect(trace.requests).toBe(0)
    expect(trace.exchanges).toHaveLength(2 + plan.bars.length / 4)
    expect(trace.exchanges.every((exchange) => !exchange.sent && !exchange.response)).toBe(true)
    expect(trace.exchanges[0].request.model).toBe('jev-latest')
    expect(trace.latencyMs).toBeGreaterThan(0)
    expect(PEDAL_IDS).toContain(plan.pedal)
    expect(trace.decisions.some((d) => d.field === 'pedal')).toBe(true)
  })


  it('plans 16- and 32-bar forms end-to-end', async () => {
    const planner = new HeuristicPlanner()
    for (const bars of [16, 32] as const) {
      const { plan } = await planner.plan({ style: 'bach', bars, pick: 'argmax', seed: 1, brief: true })
      expect(plan.bars).toHaveLength(bars)
      expect(parsePlan(plan)).toEqual(plan)
      renderPlan(plan, 1)
    }
  })

  it('varies widely within a style across regenerations', async () => {
    const planner = new HeuristicPlanner()
    for (const style of STYLE_IDS) {
      const progressions = new Set<string>()
      const textures = new Set<string>()
      const characters = new Set<string>()
      const forms = new Set<string>()
      for (let seed = 1; seed <= 60; seed++) {
        const { plan } = await planner.plan({ style, bars: 8, pick: 'sample', seed, brief: true })
        progressions.add(plan.bars.map((bar) => bar.chord).join(' '))
        textures.add(plan.texture)
        characters.add(plan.character)
        forms.add(plan.form)
      }
      // Before the harmony grammar a style had 2–4 eight-bar progressions in total.
      expect(progressions.size, `${style} progressions`).toBeGreaterThanOrEqual(40)
      expect(textures.size, `${style} textures`).toBeGreaterThanOrEqual(5)
      expect(characters.size, `${style} characters`).toBeGreaterThanOrEqual(4)
      expect(forms.size, `${style} forms`).toBeGreaterThanOrEqual(3)
    }
  })

  it('never falls into the four-chord pop loop', async () => {
    // I–V–vi–IV and its rotations, and the minor-key spelling i–bVI–bIII–bVII, by chord root.
    const loops = ['C G A F', 'G A F C', 'A F C G', 'F C G A', 'C Ab Eb Bb', 'Ab Eb Bb C', 'Eb Bb C Ab', 'Bb C Ab Eb']
    const planner = new HeuristicPlanner()
    for (const style of STYLE_IDS) {
      for (let seed = 1; seed <= 80; seed++) {
        const { plan } = await planner.plan({ style, bars: 16, pick: 'sample', seed, brief: true })
        const key = keyInfo(plan.key.endsWith('_minor') ? 'C_minor' : 'C_major')
        const roots = plan.bars.map((bar) => resolveChord(key, bar.chord).root)
        for (let i = 0; i + 4 <= roots.length; i++) {
          expect(loops, `${style} seed ${seed} bars ${i + 1}–${i + 4}: ${plan.bars.slice(i, i + 4).map((bar) => bar.chord).join(' ')}`).not.toContain(roots.slice(i, i + 4).join(' '))
        }
      }
    }
  })

  it('keeps each plan coherent with its character', async () => {
    const planner = new HeuristicPlanner()
    for (let seed = 1; seed <= 120; seed++) {
      const { plan } = await planner.plan({ style: 'bach', bars: 8, pick: 'sample', seed, brief: true })
      if (plan.character === 'solemn_hymn') expect(['presto', 'allegro']).not.toContain(plan.tempo)
      if (plan.character === 'dance_lilt') expect(plan.meter).not.toBe('four_four')
      if (plan.character === 'stormy_drama') expect(plan.key.endsWith('_minor')).toBe(true)
    }
  })

  it('puts 2/4, 9/8 and 12/8 on the styles that use them', () => {
    expect(STYLE_PROFILES.beethoven.priors.meter).toMatchObject({ two_four: expect.any(Number) })
    expect(STYLE_PROFILES.bach.priors.meter).toMatchObject({ nine_eight: expect.any(Number), twelve_eight: expect.any(Number) })
    expect(STYLE_PROFILES.debussy.priors.meter).toMatchObject({ nine_eight: expect.any(Number) })
    expect(STYLE_PROFILES.bach.archetypes.dance_lilt?.priors.meter).toMatchObject({ twelve_eight: expect.any(Number), nine_eight: expect.any(Number) })
    expect(STYLE_PROFILES.beethoven.archetypes.heroic_bright?.priors.meter).toMatchObject({ two_four: expect.any(Number) })
    expect(STYLE_PROFILES.debussy.archetypes.dreamy_haze?.priors.meter).toMatchObject({ nine_eight: expect.any(Number) })
  })

  it('scores its own style at least as high as the others', async () => {
    const planner = new HeuristicPlanner()
    const order = { low: 0, medium: 1, high: 2 }
    for (const style of STYLE_IDS) {
      const { plan } = await planner.plan({ style, bars: 8, pick: 'argmax', seed: 1, brief: true })
      const { scores } = await planner.score(plan, STYLE_IDS)
      expect(scores[style]!.match).toBe('high')
      for (const other of STYLE_IDS) expect(order[scores[other]!.match]).toBeLessThanOrEqual(order[scores[style]!.match])
    }
  })
})

describe('forms', () => {
  it('expand to exactly one role per bar, opening with a statement and ending with a cadence', () => {
    for (const form of FORM_IDS) {
      for (const bars of BAR_COUNT_VALUES) {
        const roles = formRoles(form, bars)
        expect(roles, `${form} × ${bars}`).toHaveLength(bars)
        expect(formSlots(form, bars)).toHaveLength(bars / 4)
        expect(roles[0]).toBe('statement')
        expect(roles[roles.length - 1]).toBe('cadence')
        for (const role of roles) expect(BAR_ROLE_IDS).toContain(role)
      }
    }
  })

  it('give every style something to build each phrase ending from', () => {
    for (const style of STYLE_IDS) {
      for (const mode of ['major', 'minor'] as const) {
        const book = STYLE_PROFILES[style].harmony[mode]
        expect(book.heads.length).toBeGreaterThan(2)
        expect(book.seqs.length).toBeGreaterThan(2)
        expect(book.loops.length).toBeGreaterThan(0)
        expect(book.finals.length).toBeGreaterThan(0)
        for (const end of ['open', 'half', 'closed'] as const) expect(book.tails[end].length, `${style} ${mode} ${end}`).toBeGreaterThan(0)
      }
    }
  })
})

describe('pick policy', () => {
  it('samples at face value but never from the long tail', () => {
    const random = rng(11)
    const counts: Record<string, number> = { a: 0, b: 0, c: 0, d: 0 }
    for (let i = 0; i < 4000; i++) counts[pickFrom({ a: 0.5, b: 0.3, c: 0.17, d: 0.03 }, 'sample', random)]++
    expect(counts.d).toBe(0) // beyond the 90 % nucleus
    expect(counts.b / counts.a).toBeGreaterThan(0.5) // 0.3 : 0.5, not the 0.36 that squaring gave
    expect(counts.c).toBeGreaterThan(400)
    expect(pickFrom({ a: 0.5, b: 0.3, c: 0.17, d: 0.03 }, 'argmax', random)).toBe('a')
  })

  it('damps the option just used, and overused ones, then renormalises', () => {
    const adjusted = withNovelty<string>({ I: 0.8, IV: 0.1, V: 0.1 }, ['V', 'I'])
    expect(adjusted.I).toBeLessThan(0.6)
    expect(adjusted.I + adjusted.IV + adjusted.V).toBeCloseTo(1)
    expect(withNovelty<string>({ I: 0.5, V: 0.5 }, ['I', 'V', 'I', 'V', 'I', 'IV']).I).toBeLessThan(0.5)
  })
})

describe('/api/jev handler', () => {
  const post = (body: unknown) => new Request('http://localhost/api/jev', { method: 'POST', body: JSON.stringify(body) })

  it('reports availability without leaking the key', async () => {
    const off = await handleJev(new Request('http://localhost/api/jev'), {})
    expect(await off.json()).toEqual({ available: false, model: 'jev-latest' })
    const on = await handleJev(new Request('http://localhost/api/jev'), { TYPESAFE_API_KEY: 'secret', TYPESAFE_MODEL: 'jev-1.13.0' })
    const body = await on.text()
    expect(JSON.parse(body)).toEqual({ available: true, model: 'jev-1.13.0' })
    expect(body).not.toContain('secret')
  })

  it('refuses to run without a key and rejects anything that is not a known op', async () => {
    expect((await handleJev(post({ op: 'globals', style: 'bach' }), {})).status).toBe(503)
    const env = { TYPESAFE_API_KEY: 'secret' }
    expect((await handleJev(post({ state: 'anything', questions: {} }), env)).status).toBe(400)
    expect((await handleJev(post({ op: 'globals', style: 'mozart' }), env)).status).toBe(400)
    expect((await handleJev(new Request('http://localhost/api/jev', { method: 'POST', body: '{' }), env)).status).toBe(400)
  })

  it('validates bar ops strictly', () => {
    const globals = { character: 'solemn_hymn', form: 'period', key: 'C_major', meter: 'four_four', texture: 'chorale', palette: 'diatonic', tempo: 'andante', dynamics: 'mf', dynamicShape: 'steady', defaultInstrument: 'grand_piano' }
    const roles = ['statement', 'development', 'climax', 'cadence']
    expect(parseOp({ op: 'bar', style: 'bach', brief: true, globals, roles, chords: ['I'], index: 1 })).toMatchObject({ op: 'bar', index: 1 })
    expect(() => parseOp({ op: 'bar', style: 'bach', globals, roles, chords: [], index: 1 })).toThrow()
    expect(() => parseOp({ op: 'bar', style: 'bach', globals, roles, chords: ['H7'], index: 1 })).toThrow()
    expect(() => parseOp({ op: 'bar', style: 'bach', globals: { ...globals, texture: 'dubstep' }, roles, chords: [], index: 0 })).toThrow()
    expect(parseOp({ op: 'phrase', style: 'bach', brief: true, globals, barCount: 8, slotIndex: 1, chords: ['I', 'V6', 'ii6', 'V'], contours: ['arch', 'rise', 'fall', 'fall'] })).toMatchObject({
      op: 'phrase',
      slotIndex: 1,
    })
    expect(() => parseOp({ op: 'phrase', style: 'bach', globals, barCount: 8, slotIndex: 1, chords: ['I'], contours: ['arch'] })).toThrow(/chords/)
    expect(() => parseOp({ op: 'phrase', style: 'bach', globals, barCount: 7, slotIndex: 0, chords: [], contours: [] })).toThrow(/barCount/)
  })

  it('accepts the debug notes op and rejects anything else', () => {
    const notes = {
      op: 'notes',
      style: 'bach',
      brief: true,
      character: 'solemn_hymn',
      key: 'C_major',
      meter: 'four_four',
      tempo: 'andante',
      texture: 'chorale',
      palette: 'diatonic',
      bar: { chord: 'I', role: 'statement', contour: 'rise' },
    }
    expect(parseOp(notes)).toMatchObject({ op: 'notes', meter: 'four_four' })
    expect(parseOp({ ...notes, barIndex: 3 })).toMatchObject({ op: 'notes', barIndex: 3 })
    expect(() => parseOp({ ...notes, barIndex: -1 })).toThrow(/barIndex/)
    expect(() => parseOp({ ...notes, op: 'midi' })).toThrow(/notes/)
    expect(() => parseOp({ ...notes, palette: 'serial' })).toThrow()
  })
})

describe('MIDI export', () => {
  it('round-trips through a Standard MIDI File', async () => {
    const { plan } = await new HeuristicPlanner().plan({ style: 'debussy', bars: 8, pick: 'argmax', seed: 2, brief: true })
    const score = renderPlan(plan, 2)
    const midi = new Midi(scoreToMidi(score, 'grand_piano'))
    expect(Math.round(midi.header.tempos[0].bpm)).toBe(score.bpm)
    expect(midi.header.timeSignatures[0].timeSignature).toEqual([score.meter.num, score.meter.den])
    expect(midi.tracks.map((track) => track.name)).toEqual(['Right hand', 'Left hand'])
    expect(midi.tracks.reduce((sum, track) => sum + track.notes.length, 0)).toBe(timeline(score).length)
    // Debussy's washed textures pick half/full; dry would skip CC64.
    expect(score.pedal).not.toBe('dry')
    expect(midi.tracks[0].controlChanges[64]?.length).toBe(score.bars.length * 2)
  })

  it('skips sustain CC when the plan is dry', async () => {
    const { plan } = await new HeuristicPlanner().plan({ style: 'bach', bars: 8, pick: 'argmax', seed: 2, brief: true })
    const score = renderPlan({ ...plan, pedal: 'dry' }, 2)
    const midi = new Midi(scoreToMidi(score, 'harpsichord'))
    expect(score.pedal).toBe('dry')
    expect(midi.tracks[0].controlChanges[64]).toBeUndefined()
  })
})
