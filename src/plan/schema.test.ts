import { describe, expect, it } from 'vitest'
import {
  BAR_COUNT_VALUES,
  GLOBAL_FIELD_IDS,
  GLOBAL_FIELDS,
  PEDAL_IDS,
  PEDALS,
  PHRASING_IDS,
  PHRASINGS,
  TEMPO_BPM,
  TEMPO_IDS,
  TEMPOS,
  defaultPhrasing,
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

describe('PHRASINGS', () => {
  it('is a closed four-way Choice, fanned out with the other globals', () => {
    expect(PHRASING_IDS).toEqual(['on_the_beat', 'upbeat', 'breathing', 'long_breathed'])
    expect(Object.keys(PHRASINGS)).toEqual(PHRASING_IDS)
    expect(GLOBAL_FIELD_IDS).toContain('phrasing')
    expect(GLOBAL_FIELDS.phrasing).toBe(PHRASINGS)
  })

  it('defaults a hand-edited plan from character and accepts an explicit pick', () => {
    const bars = [
      { chord: 'I', role: 'statement', contour: 'arch' },
      { chord: 'V', role: 'development', contour: 'rise' },
      { chord: 'V7', role: 'half_cadence', contour: 'fall' },
      { chord: 'I', role: 'cadence', contour: 'fall' },
    ]
    const lyrical = {
      version: 1,
      style: 'chopin',
      character: 'lyrical_song',
      form: 'period',
      key: 'Eb_major',
      meter: 'twelve_eight',
      texture: 'rolling_nocturne',
      palette: 'diatonic',
      tempo: 'andante',
      dynamics: 'p',
      dynamicShape: 'arch',
      defaultInstrument: 'grand_piano',
      bars,
    }
    const storm = { ...lyrical, style: 'beethoven', character: 'stormy_drama', meter: 'four_four', texture: 'tremolo_storm' }
    expect(defaultPhrasing('lyrical_song')).toBe('breathing')
    expect(defaultPhrasing('stormy_drama')).toBe('on_the_beat')
    expect(parseGlobals(lyrical).phrasing).toBe('breathing')
    expect(parseGlobals(storm).phrasing).toBe('on_the_beat')
    expect(parsePlan({ ...lyrical, phrasing: 'upbeat' }).phrasing).toBe('upbeat')
    expect(parsePlan({ ...storm, phrasing: 'breathing' }).phrasing).toBe('breathing')
    expect(() => parsePlan({ ...lyrical, phrasing: 'none' })).toThrow(/phrasing/)
  })

  it('accepts 64-bar plans and rejects lengths outside BAR_COUNT_VALUES', () => {
    expect(BAR_COUNT_VALUES).toEqual([4, 8, 16, 32, 64])
    const bar = { chord: 'I', role: 'statement', contour: 'arch' }
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
    }
    expect(parsePlan({ ...base, bars: Array.from({ length: 64 }, () => bar) }).bars).toHaveLength(64)
    expect(() => parsePlan({ ...base, bars: Array.from({ length: 48 }, () => bar) })).toThrow(/4, 8, 16, 32, 64/)
  })
})
