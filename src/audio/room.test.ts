import { describe, expect, it } from 'vitest'
import { ROOM, tuneRoom } from './room'

describe('ROOM', () => {
  it('is a short, dry-dominant room', () => {
    expect(ROOM.wet).toBeGreaterThanOrEqual(0.08)
    expect(ROOM.wet).toBeLessThanOrEqual(0.15)
    expect(ROOM.decay).toBeGreaterThanOrEqual(0.25)
    expect(ROOM.decay).toBeLessThanOrEqual(0.55)
    expect(ROOM.damping).toBeGreaterThan(0.2)
    expect(ROOM.bandwidth).toBeLessThan(0.85)
    expect('highCutHz' in ROOM).toBe(false)
  })

  it('tunes a Dattorro send to fully wet / short / dark', () => {
    const params = {
      decay: { value: 0.5 },
      damping: { value: 0.005 },
      bandwidth: { value: 0.9999 },
      wet: { value: 1 },
      dry: { value: 0 },
    }
    tuneRoom({ getParam: (name) => params[name as keyof typeof params] })
    expect(params.decay.value).toBe(ROOM.decay)
    expect(params.damping.value).toBe(ROOM.damping)
    expect(params.bandwidth.value).toBe(ROOM.bandwidth)
    expect(params.wet.value).toBe(1)
    expect(params.dry.value).toBe(0)
  })
})
