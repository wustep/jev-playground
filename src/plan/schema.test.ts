import { describe, expect, it } from 'vitest'
import {
  GLOBAL_FIELD_IDS,
  GLOBAL_FIELDS,
  PEDAL_IDS,
  PEDALS,
  TEMPO_BPM,
  TEMPO_IDS,
  TEMPOS,
  parseGlobals,
  parsePlan,
} from './schema'

const KEPT_TEMPO_BPM = {
  largo: 50,
  adagio: 66,
  andante: 84,
  moderato: 104,
  allegro: 132,
  presto: 168,
} as const

describe('TEMPOS', () => {
  it('keeps the original six ids and BPMs', () => {
    for (const [id, bpm] of Object.entries(KEPT_TEMPO_BPM)) {
      expect(TEMPO_IDS).toContain(id)
      expect(TEMPO_BPM[id as keyof typeof KEPT_TEMPO_BPM]).toBe(bpm)
    }
  })

  it('adds the five Standard Tempo Category rungs at their midpoints', () => {
    expect(TEMPO_BPM.larghissimo).toBe(16)
    expect(TEMPO_BPM.grave).toBe(30)
    expect(TEMPO_BPM.larghetto).toBe(63)
    expect(TEMPO_BPM.vivace).toBe(160)
    expect(TEMPO_BPM.prestissimo).toBe(208)
  })

  it('lists slow → fast, matching TEMPO_BPM', () => {
    expect(TEMPO_IDS).toEqual([
      'larghissimo',
      'grave',
      'largo',
      'larghetto',
      'adagio',
      'andante',
      'moderato',
      'allegro',
      'vivace',
      'presto',
      'prestissimo',
    ])
    const bpms = TEMPO_IDS.map((id) => TEMPO_BPM[id])
    expect(bpms).toEqual([...bpms].sort((a, b) => a - b))
    expect(Object.keys(TEMPOS)).toEqual(TEMPO_IDS)
  })
})

describe('PEDALS', () => {
  it('is a closed three-level sustain Choice', () => {
    expect(PEDAL_IDS).toEqual(['dry', 'half', 'full'])
    expect(Object.keys(PEDALS)).toEqual(PEDAL_IDS)
  })

  it('is a plan global, allowlisted and fanned out with the others', () => {
    expect(GLOBAL_FIELD_IDS).toContain('pedal')
    expect(GLOBAL_FIELDS.pedal).toBe(PEDALS)
  })

  it('defaults a hand-edited plan to half and accepts an explicit pick', () => {
    const bars = [
      { chord: 'I', role: 'statement', contour: 'arch' },
      { chord: 'V', role: 'development', contour: 'rise' },
      { chord: 'V7', role: 'half_cadence', contour: 'fall' },
      { chord: 'I', role: 'cadence', contour: 'fall' },
    ]
    const base = {
      version: 1,
      style: 'bach',
      character: 'playful_wit',
      form: 'period',
      key: 'C_major',
      meter: 'four_four',
      texture: 'two_voice_counterpoint',
      palette: 'diatonic',
      tempo: 'allegro',
      dynamics: 'mf',
      dynamicShape: 'terraced',
      defaultInstrument: 'harpsichord',
      bars,
    }
    expect(parseGlobals(base).pedal).toBe('half')
    expect(parsePlan({ ...base, pedal: 'dry' }).pedal).toBe('dry')
    expect(parsePlan({ ...base, pedal: 'full' }).pedal).toBe('full')
    expect(() => parsePlan({ ...base, pedal: 'soft' })).toThrow(/pedal/)
  })
})
