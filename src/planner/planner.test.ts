import { Midi } from '@tonejs/midi'
import { describe, expect, it } from 'vitest'
import { handleJev } from '../../server/jevHandler'
import { scoreToMidi } from '../midi/exportMidi'
import { CHORD_IDS, STYLE_IDS, parsePlan } from '../plan/schema'
import { renderPlan, timeline } from '../render/renderPlan'
import { HeuristicPlanner } from './HeuristicPlanner'
import { JevPlanner, type JevTransport } from './JevPlanner'
import { buildRequest, parseOp } from './jev/requests'
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
  it('assembles a valid plan from one fan-out plus one request per bar', async () => {
    const { transport, seen } = fakeJev({ barCount: '8', texture: 'minimal_cells', key: 'A_minor', chord: 'bVI' })
    const planner = new JevPlanner(transport)
    const { plan, trace } = await planner.plan({ style: 'glass', bars: 'auto', pick: 'argmax', seed: 1, brief: false })

    expect(parsePlan(plan)).toEqual(plan)
    expect(plan.texture).toBe('minimal_cells')
    expect(plan.bars).toHaveLength(8)
    expect(plan.bars.every((bar) => bar.chord === 'bVI')).toBe(true)
    expect(trace.requests).toBe(9)
    expect(trace.model).toBe('jev-1.13.0')
    expect(trace.inputTokens).toBe(900)
    expect(trace.exchanges.every((exchange) => exchange.sent && exchange.response)).toBe(true)

    // Request 1 fans out globals + length + roles for all supported lengths.
    expect(Object.keys(seen[0].questions)).toHaveLength(8 + 1 + 4 + 8 + 16 + 32)
    // With the brief off, the style's name is all Jev gets.
    expect(seen[0].state).toMatchObject({ requested_style: { name: 'Philip Glass' } })
    expect(JSON.stringify(seen[0].state)).not.toContain('minimalism')
    // Bar requests carry the progression so far and offer every chord label.
    const fifth = seen[5]
    expect(Object.keys(fifth.questions.chord.criteria as object)).toEqual(CHORD_IDS)
    expect(JSON.stringify(fifth.state)).toContain('"current_bar":5')
    expect((fifth.state as { bars: { chord: string }[] }).bars[3].chord).toContain('bVI')
    expect((fifth.state as { bars: { chord: string }[] }).bars[4].chord).toBe('(to be decided now)')

    renderPlan(plan, 1) // and the renderer accepts it
  })

  it('never names a composer in option descriptions', () => {
    const request = buildRequest({ op: 'globals', style: 'debussy', brief: false }, 'jev-latest')
    const criteria = JSON.stringify(Object.values(request.questions).map((q) => q.criteria))
    for (const name of ['Bach', 'Beethoven', 'Debussy', 'Glass', 'Nahre', 'Fox']) expect(criteria).not.toContain(name)
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
    expect(trace.exchanges).toHaveLength(1 + plan.bars.length)
    expect(trace.exchanges.every((exchange) => !exchange.sent && !exchange.response)).toBe(true)
    expect(trace.exchanges[0].request.model).toBe('jev-latest')
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
    const globals = { key: 'C_major', meter: 'four_four', texture: 'chorale', palette: 'diatonic', tempo: 'andante', dynamics: 'mf', dynamicShape: 'steady', defaultInstrument: 'grand_piano' }
    const roles = ['statement', 'development', 'climax', 'cadence']
    expect(parseOp({ op: 'bar', style: 'bach', brief: true, globals, roles, chords: ['I'], index: 1 })).toMatchObject({ op: 'bar', index: 1 })
    expect(() => parseOp({ op: 'bar', style: 'bach', globals, roles, chords: [], index: 1 })).toThrow()
    expect(() => parseOp({ op: 'bar', style: 'bach', globals, roles, chords: ['H7'], index: 1 })).toThrow()
    expect(() => parseOp({ op: 'bar', style: 'bach', globals: { ...globals, texture: 'dubstep' }, roles, chords: [], index: 0 })).toThrow()
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
    // A pedalled texture exports real sustain-pedal events.
    expect(score.pedal).toBe(true)
    expect(midi.tracks[0].controlChanges[64]?.length).toBe(score.bars.length * 2)
  })
})
