import { describe, expect, it } from 'vitest'
import { jevChipPhase, type JevStatus } from './jevStatus'

const up: JevStatus = { available: true, direct: false, detail: 'via /api/jev' }
const down: JevStatus = { available: false, direct: false, detail: 'no key' }

describe('jevChipPhase', () => {
  it('reports checking, loading, live, offline, and error without calling a failure live', () => {
    expect(jevChipPhase({ status: null, busy: false, source: null, notice: null })).toBe('checking')
    expect(jevChipPhase({ status: up, busy: true, source: 'jev', notice: null })).toBe('loading')
    expect(jevChipPhase({ status: up, busy: false, source: 'jev', notice: null })).toBe('live')
    expect(jevChipPhase({ status: down, busy: false, source: 'stub', notice: null })).toBe('offline')
    expect(jevChipPhase({ status: up, busy: false, source: 'stub', notice: 'Jev request failed (nope). Showing the offline stub.' })).toBe('error')
    expect(jevChipPhase({ status: null, busy: false, source: 'stub', notice: null })).toBe('checking')
  })
})
