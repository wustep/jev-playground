import { Midi } from '@tonejs/midi'
import { describe, expect, it } from 'vitest'
import { handleJev } from '../../server/jevHandler'
import { scoreToMidi } from '../midi/exportMidi'
import { ACCOMPANIMENT_IDS, BAR_COUNT_VALUES, CHORDS, FORM_IDS, GLOBAL_FIELD_IDS, MOTION_IDS, REGISTER_IDS, STYLE_IDS, TEMPO_IDS, parsePlan } from '../plan/schema'
import { barPositions, formSlots } from '../plan/phrase'
import { STYLE_PROFILES } from '../plan/styles'
import { keyInfo, resolveChord } from '../render/harmony'
import { renderPlan, timeline } from '../render/renderPlan'
import { HeuristicPlanner } from './HeuristicPlanner'
import { JevPlanner, type JevTransport } from './JevPlanner'
import { buildRequest, parseOp } from './jev/requests'
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
  it('assembles a valid plan from one fan-out and one request per phrase slot', async () => {
    const { transport, seen } = fakeJev({ register: 'high', motion: 'flowing', accompaniment: 'broken', form: 'arch', key: 'A_minor' })
    const planner = new JevPlanner(transport)
    const { plan, trace } = await planner.plan({ style: 'chopin', bars: 8, pick: 'argmax', seed: 1, brief: false })

    expect(parsePlan(plan)).toEqual(plan)
    expect(plan.register).toBe('high')
    expect(plan.motion).toBe('flowing')
    expect(plan.accompaniment).toBe('broken')
    expect(plan.bars).toHaveLength(8)
    expect(plan.bars.every((bar) => typeof bar.chord === 'string')).toBe(true)
    // Roles are not asked of Jev, nor carried on the plan: they are the form.
    expect(plan.bars.every((bar) => !('role' in bar))).toBe(true)
    // One globals fan-out plus one phrase request per four-bar slot.
    expect(trace.requests).toBe(3)
    expect(trace.model).toBe('jev-1.13.0')
    expect(trace.inputTokens).toBe(300)
    expect(trace.exchanges.every((exchange) => exchange.sent && exchange.response)).toBe(true)

    // Request 1 fans out every global at once. Length is never asked.
    expect(Object.keys(seen[0].questions)).toEqual([...GLOBAL_FIELD_IDS])
    expect(Object.keys(seen[0].questions).slice(0, 3)).toEqual(['register', 'motion', 'accompaniment'])
    expect(Object.keys(seen[0].questions.tempo.criteria as object)).toEqual(TEMPO_IDS)
    expect(Object.keys(seen[0].questions.register.criteria as object)).toEqual(REGISTER_IDS)
    expect(Object.keys(seen[0].questions.motion.criteria as object)).toEqual(MOTION_IDS)
    expect(Object.keys(seen[0].questions.accompaniment.criteria as object)).toEqual(ACCOMPANIMENT_IDS)
    expect(Object.keys(seen[0].questions)).not.toContain('barCount')
    // Nothing Jev is asked mentions a label the schema no longer has.
    for (const dead of ['character', 'texture', 'arrangement', 'opening', 'pedal', 'phrasing', 'hookBars']) {
      expect(Object.keys(seen[0].questions), dead).not.toContain(dead)
    }
    // … and with the brief off, the style's name is all Jev gets.
    expect(seen[0].state).toMatchObject({ requested_style: { name: 'Frédéric Chopin' } })
    expect(JSON.stringify(seen[0].state)).not.toContain('fioritura')

    // Phrase requests carry the book options and prior-slot contour context.
    expect(Object.keys(seen[1].questions)).toEqual(['phrase', 'contour_0', 'contour_1', 'contour_2', 'contour_3'])
    expect(Object.keys(seen[1].questions.phrase.criteria as object).length).toBeGreaterThan(2)
    expect(JSON.stringify(seen[2].state)).toContain('phrases_so_far')
    expect(JSON.stringify(seen[2].state)).toContain('prior_melodic_shapes')
    expect(JSON.stringify(seen[1].state)).toContain('melody_register')

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

  it('accepts any phrase the server offers, for every style, form, length and mode', async () => {
    // What /api/jev actually does with an op: it arrives as JSON, is re-parsed
    // against the enums, and the question is rebuilt server-side. Jev then
    // answers with the LAST option offered, not the first, so a catalog that
    // matched only at its head would still fail here. #58 was this class of
    // bug on `main`: the server offered ids the client then rejected.
    const server: JevTransport = async (op) => {
      const request = buildRequest(parseOp(JSON.parse(JSON.stringify(op))), 'jev-latest')
      const answers: Record<string, Answer> = {}
      for (const [id, question] of Object.entries(request.questions)) {
        if (question.type !== 'choice') continue
        const options = Object.keys(question.criteria)
        const favourite = options[options.length - 1]
        answers[id] = { type: 'choice', choice: favourite, confidence: 1, probabilities: Object.fromEntries(options.map((option) => [option, option === favourite ? 1 : 0])) }
      }
      return { model: 'jev-test', answers, usage: { input_tokens: 0, output_tokens: 0 } }
    }
    for (const style of STYLE_IDS) {
      for (const form of FORM_IDS) {
        for (const key of ['C_major', 'A_minor'] as const) {
          for (const bars of BAR_COUNT_VALUES) {
            const forced: JevTransport = async (op, signal) => {
              const response = await server(op, signal)
              if (op.op !== 'globals') return response
              const pin = (value: string) => ({ type: 'choice' as const, choice: value, confidence: 1, probabilities: { [value]: 1 } })
              return { ...response, answers: { ...response.answers, form: pin(form), key: pin(key) } }
            }
            const { plan } = await new JevPlanner(forced).plan({ style, bars, pick: 'sample', seed: bars, brief: false })
            expect(parsePlan(plan), `${style} ${form} ${key} ${bars}`).toEqual(plan)
            expect(plan.form).toBe(form)
          }
        }
      }
    }
  }, 60_000)

  it('gives a sequence the shape of the bar it repeats, as the stub does', async () => {
    // Jev answers every contour question differently; the form still decides
    // that a sequence has its model's shape, so the renderer can carry it.
    const { transport } = fakeJev({ form: 'period', contour_0: 'arch', contour_1: 'fall', contour_2: 'rise', contour_3: 'dip' })
    const { plan } = await new JevPlanner(transport).plan({ style: 'bach', bars: 16, pick: 'argmax', seed: 1, brief: true })
    const positions = barPositions('period', 16)
    expect(positions.slice(8, 11).map((p) => p.role)).toEqual(['contrast', 'sequence', 'sequence'])
    expect(plan.bars.slice(8, 11).map((bar) => bar.contour)).toEqual(['arch', 'arch', 'arch'])
    // Bars that are neither returns nor sequences keep what Jev chose.
    expect(plan.bars.slice(0, 3).map((bar) => bar.contour)).toEqual(['arch', 'fall', 'rise'])
  })

  it('hands every style brief to Jev when asked', () => {
    for (const [style, name, snippet] of [
      ['bach', 'Johann Sebastian Bach', 'ii4/2'],
      ['beethoven', 'Ludwig van Beethoven', 'sforzando'],
      ['chopin', 'Frédéric Chopin', 'fioritura'],
      ['debussy', 'Claude Debussy', 'never V7–I'],
      ['glass', 'Philip Glass', 'minimalism'],
      ['hans_zimmer', 'Hans Zimmer', 'i–bVI–bVII–V'],
      ['laufey', 'Laufey', 'vocal-range'],
      ['elijah_fox', 'Elijah Fox', '5+5+6'],
    ] as const) {
      const on = buildRequest({ op: 'globals', style, brief: true }, 'jev-latest')
      const off = buildRequest({ op: 'globals', style, brief: false }, 'jev-latest')
      expect(off.state).toMatchObject({ requested_style: { name } })
      expect(JSON.stringify(off.state)).not.toContain(snippet)
      expect(JSON.stringify(on.state)).toContain(name)
      expect(JSON.stringify(on.state)).toContain(snippet)
    }
  })

  it('never names a composer in option descriptions', () => {
    const requests = [
      buildRequest({ op: 'globals', style: 'debussy', brief: false }, 'jev-latest'),
      buildRequest({
        op: 'phrase',
        style: 'debussy',
        brief: false,
        globals: {
          register: 'high',
          motion: 'sustained',
          accompaniment: 'sustained',
          form: 'arch',
          key: 'Db_major',
          meter: 'nine_eight',
          palette: 'whole_tone',
          tempo: 'andante',
          dynamics: 'pp',
          dynamicShape: 'arch',
        },
        barCount: 8,
        slotIndex: 0,
        chords: [],
        contours: [],
      }, 'jev-latest'),
    ]
    const criteria = JSON.stringify(requests.flatMap((request) => Object.values(request.questions).map((q) => [q.criteria, q.instructions])))
    // Every chord description can reach Jev inside a phrase option's label.
    const chords = JSON.stringify(CHORDS)
    for (const name of ['Bach', 'Beethoven', 'Debussy', 'Glass', 'Laufey', 'Fox', 'Chopin', 'Zimmer', 'Satie', 'Reich']) {
      expect(criteria).not.toContain(name)
      expect(chords).not.toContain(name)
    }
  })

  it('maps Score answers to low / medium / high', async () => {
    const { transport } = fakeJev()
    const { plan } = await new HeuristicPlanner().plan({ style: 'bach', bars: 4, pick: 'argmax', seed: 1, brief: true })
    const { scores, songQuality, exchanges } = await new JevPlanner(transport).score(plan, STYLE_IDS)
    expect(scores.bach).toEqual({ match: 'high', confidence: 0.78, raw: 1.6 })
    expect(songQuality).toEqual({ raw: 1.6, confidence: 0.78 })
    expect(Object.keys(exchanges[0].request.questions)).toHaveLength(STYLE_IDS.length + 1)
    expect(exchanges[0].request.questions).toHaveProperty('song_quality')
    expect(exchanges[0].request.questions.song_quality.type).toBe('score')
    expect(exchanges[0].request.questions.song_quality.criteria).toHaveLength(4)
    // The label under test is withheld from the scorer's state.
    expect(JSON.stringify(exchanges[0].request.state)).not.toContain('"style"')
  })
})

describe('HeuristicPlanner', () => {
  it('records the payloads Jev would have been sent, unsent', async () => {
    const { plan, trace } = await new HeuristicPlanner().plan({ style: 'debussy', bars: 8, pick: 'sample', seed: 9, brief: true })
    expect(trace.requests).toBe(0)
    expect(trace.exchanges).toHaveLength(1 + plan.bars.length / 4)
    expect(trace.exchanges.every((exchange) => !exchange.sent && !exchange.response)).toBe(true)
    expect(trace.exchanges[0].request.model).toBe('jev-latest')
    expect(trace.latencyMs).toBeGreaterThan(0)
    for (const field of GLOBAL_FIELD_IDS) expect(trace.decisions.some((d) => d.field === field), field).toBe(true)
    // The variant is the stub's private choice; it is traced but never planned.
    expect(trace.decisions.some((d) => d.field === 'variant')).toBe(true)
    expect(plan).not.toHaveProperty('variant')
  })


  it('plans 16-, 32- and 64-bar forms end-to-end', async () => {
    const planner = new HeuristicPlanner()
    for (const bars of [16, 32, 64] as const) {
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
      const accompaniments = new Set<string>()
      const motions = new Set<string>()
      const forms = new Set<string>()
      for (let seed = 1; seed <= 60; seed++) {
        const { plan } = await planner.plan({ style, bars: 8, pick: 'sample', seed, brief: true })
        progressions.add(plan.bars.map((bar) => bar.chord).join(' '))
        accompaniments.add(plan.accompaniment)
        motions.add(plan.motion)
        forms.add(plan.form)
      }
      // Before the harmony grammar a style had 2–4 eight-bar progressions in total.
      expect(progressions.size, `${style} progressions`).toBeGreaterThanOrEqual(40)
      expect(accompaniments.size, `${style} accompaniments`).toBeGreaterThanOrEqual(2)
      expect(motions.size, `${style} motions`).toBeGreaterThanOrEqual(2)
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

  it('keeps each style singing where that style sings', async () => {
    const planner = new HeuristicPlanner()
    const seen: Record<string, Record<string, number>> = {}
    for (const style of STYLE_IDS) {
      seen[style] = {}
      for (let seed = 1; seed <= 60; seed++) {
        const { plan } = await planner.plan({ style, bars: 8, pick: 'sample', seed, brief: true })
        seen[style][plan.register] = (seen[style][plan.register] ?? 0) + 1
      }
    }
    const share = (style: string, register: string) => (seen[style][register] ?? 0) / 60
    // Chopin's line lives high; Beethoven's cantabile reaches low, which the
    // old schema had no way to say and no way to render.
    expect(share('chopin', 'high')).toBeGreaterThan(share('chopin', 'low'))
    expect(share('beethoven', 'low')).toBeGreaterThan(share('chopin', 'low'))
    expect(share('bach', 'mid')).toBeGreaterThan(0.5)
  })

  it('gives every dial face its own sound on argmax, not just its own name', async () => {
    // Style as constraint, not costume: the most typical piece of each style
    // must differ from every other's on the three fields that decide what a
    // listener hears — where the tune sings, how it moves, what holds it up.
    const planner = new HeuristicPlanner()
    const sounds = new Map<string, string>()
    for (const style of STYLE_IDS) {
      const { plan } = await planner.plan({ style, bars: 16, pick: 'argmax', seed: 1, brief: true })
      const sound = `${plan.register}/${plan.motion}/${plan.accompaniment}`
      expect(sounds.get(sound), `${style} sounds like ${sounds.get(sound)}: ${sound}`).toBeUndefined()
      sounds.set(sound, style)
    }
  })

  it('gives Chopin a nocturne on argmax: high, flowing, over a broken left hand', async () => {
    const { plan } = await new HeuristicPlanner().plan({ style: 'chopin', bars: 16, pick: 'argmax', seed: 1, brief: true })
    expect(plan.register).toBe('high')
    expect(plan.accompaniment).toBe('broken')
    expect(['flowing', 'florid']).toContain(plan.motion)
    expect(plan.meter).toBe('twelve_eight')
  })

  it('gives Bach a running line, and often a second voice rather than a backing', async () => {
    const planner = new HeuristicPlanner()
    // The most typical Bach keyboard piece is a prelude in unbroken
    // figuration, not an invention — so argmax is `broken`, and rightly.
    const { plan } = await planner.plan({ style: 'bach', bars: 16, pick: 'argmax', seed: 1, brief: true })
    expect(plan.motion).toBe('florid')
    expect(plan.register).toBe('mid')
    let duets = 0
    for (let seed = 1; seed <= 40; seed++) {
      const sampled = await planner.plan({ style: 'bach', bars: 16, pick: 'sample', seed, brief: true })
      if (sampled.plan.accompaniment === 'counterline') duets++
    }
    expect(duets / 40, 'Bach writes two voices more often than not').toBeGreaterThan(0.4)
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
  it('give exactly one position per bar, opening with a statement and ending with a cadence', () => {
    for (const form of FORM_IDS) {
      for (const bars of BAR_COUNT_VALUES) {
        const positions = barPositions(form, bars)
        expect(positions, `${form} × ${bars}`).toHaveLength(bars)
        expect(formSlots(form, bars)).toHaveLength(Math.max(1, bars / 4))
        expect(positions[0].role).toBe('statement')
        expect(positions[positions.length - 1].role).toBe('cadence')
        // A cadence is a conclusion, never a quotation.
        for (const position of positions) {
          if (position.phraseFinal) expect(position.returnsFrom).toBeUndefined()
          if (position.returnsFrom !== undefined) expect(position.returnsFrom).toBeLessThan(positions.indexOf(position))
        }
      }
    }
  })

  it('bring a phrase back in every form but the one that says it does not', () => {
    for (const bars of [8, 16, 32] as const) {
      for (const form of FORM_IDS) {
        const returns = barPositions(form, bars).filter((position) => position.returnsFrom !== undefined).length
        if (form === 'chain') expect(returns, `${form} × ${bars}`).toBe(0)
        else expect(returns, `${form} × ${bars}`).toBeGreaterThan(0)
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

  it('validates phrase ops strictly and knows nothing else', () => {
    const globals = { register: 'mid', motion: 'walking', accompaniment: 'sustained', form: 'period', key: 'C_major', meter: 'four_four', palette: 'diatonic', tempo: 'andante', dynamics: 'mf', dynamicShape: 'steady' }
    expect(parseOp({ op: 'phrase', style: 'bach', brief: true, globals, barCount: 8, slotIndex: 1, chords: ['I', 'V6', 'ii6', 'V'], contours: ['arch', 'rise', 'fall', 'fall'] })).toMatchObject({ op: 'phrase', slotIndex: 1 })
    expect(parseOp({ op: 'phrase', style: 'bach', brief: true, globals, barCount: 64, slotIndex: 0, chords: [], contours: [] })).toMatchObject({ op: 'phrase', barCount: 64, slotIndex: 0 })
    expect(() => parseOp({ op: 'phrase', style: 'bach', globals, barCount: 8, slotIndex: 1, chords: ['I'], contours: ['arch'] })).toThrow(/chords/)
    expect(() => parseOp({ op: 'phrase', style: 'bach', globals, barCount: 7, slotIndex: 0, chords: [], contours: [] })).toThrow(/barCount/)
    expect(() => parseOp({ op: 'phrase', style: 'bach', globals: { ...globals, accompaniment: 'dubstep' }, barCount: 8, slotIndex: 0, chords: [], contours: [] })).toThrow(/accompaniment/)
  })

  it('knows only the three ops, and rejects the ones the modes used to need', () => {
    expect(parseOp({ op: 'globals', style: 'bach', brief: true })).toMatchObject({ op: 'globals' })
    for (const dead of ['concept', 'bar', 'notes', 'midi']) {
      expect(() => parseOp({ op: dead, style: 'bach' }), dead).toThrow(/unknown op/)
    }
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

  it('skips sustain CC when the accompaniment plays dry', async () => {
    const { plan } = await new HeuristicPlanner().plan({ style: 'bach', bars: 8, pick: 'argmax', seed: 2, brief: true })
    // Two voices in dialogue are pedalled dry so they can be told apart.
    const score = renderPlan({ ...plan, accompaniment: 'counterline' }, 2)
    const midi = new Midi(scoreToMidi(score, 'harpsichord'))
    expect(score.pedal).toBe('dry')
    expect(midi.tracks[0].controlChanges[64]).toBeUndefined()
  })
})
