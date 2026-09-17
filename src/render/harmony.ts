// Key-relative labels → spelled pitch classes, via tonal.

import { Chord, Note, Scale } from 'tonal'
import type { ChordId, KeyId, PaletteId } from '../plan/schema'
import { tidy } from './pitch'

export interface KeyInfo {
  id: KeyId
  tonic: string
  minor: boolean
  /** VexFlow key-signature spec. */
  signature: string
  label: string
}

export function keyInfo(id: KeyId): KeyInfo {
  const [rawTonic, mode] = id.split('_')
  const tonic = rawTonic.replace(/s$/, '#')
  const minor = mode === 'minor'
  return { id, tonic, minor, signature: minor ? `${tonic}m` : tonic, label: `${tonic.replace('b', '♭').replace('#', '♯')} ${mode}` }
}

/** [interval of the root above the tonic, tonal chord type] */
const CHORD_TABLE: Record<ChordId, readonly [string, string]> = {
  I: ['1P', 'M'],
  i: ['1P', 'm'],
  ii: ['2M', 'm'],
  ii_dim: ['2M', 'dim'],
  iii: ['3M', 'm'],
  IV: ['4P', 'M'],
  iv: ['4P', 'm'],
  V: ['5P', 'M'],
  v: ['5P', 'm'],
  vi: ['6M', 'm'],
  vii_dim: ['7M', 'dim'],
  bII: ['2m', 'M'],
  bIII: ['3m', 'M'],
  bVI: ['6m', 'M'],
  bVII: ['7m', 'M'],
  I_aug: ['1P', 'aug'],
  V_aug: ['5P', 'aug'],
  Isus2: ['1P', 'sus2'],
  IVsus2: ['4P', 'sus2'],
  Vsus4: ['5P', 'sus4'],
  V7: ['5P', '7'],
  vii_dim7: ['7M', 'dim7'],
  ii_half_dim7: ['2M', 'm7b5'],
  Imaj7: ['1P', 'maj7'],
  i7: ['1P', 'm7'],
  ii7: ['2M', 'm7'],
  iii7: ['3M', 'm7'],
  IVmaj7: ['4P', 'maj7'],
  iv7: ['4P', 'm7'],
  vi7: ['6M', 'm7'],
  bIIImaj7: ['3m', 'maj7'],
  bVImaj7: ['6m', 'maj7'],
  bVII7: ['7m', '7'],
  bIImaj7: ['2m', 'maj7'],
  Iadd9: ['1P', 'Madd9'],
  i_add9: ['1P', 'madd9'],
  I6_9: ['1P', '69'],
  Imaj9: ['1P', 'maj9'],
  i9: ['1P', 'm9'],
  ii9: ['2M', 'm9'],
  iii9: ['3M', 'm9'],
  IVmaj9: ['4P', 'maj9'],
  IVmaj7s11: ['4P', 'maj7#11'],
  vi9: ['6M', 'm9'],
  vi11: ['6M', 'm11'],
  V9: ['5P', '9'],
  V13: ['5P', '13'],
  V7sus4: ['5P', '7sus4'],
  V7alt: ['5P', '7#9'],
  bVImaj9: ['6m', 'maj9'],
}

export interface ResolvedChord {
  id: ChordId
  /** e.g. "Abmaj7" */
  symbol: string
  root: string
  /** All chord tones as pitch classes, root first, stacked in thirds. */
  pcs: string[]
  /** The three or four tones that define the chord (root, 3rd/sus, 5th, 7th). */
  core: string[]
  /** Colour tones above the seventh (9, 11, 13) — empty for plain chords. */
  extensions: string[]
}

export function resolveChord(key: KeyInfo, id: ChordId): ResolvedChord {
  const [interval, type] = CHORD_TABLE[id]
  // Bbb major in D-flat is correct and unreadable; respell such roots (→ A).
  const root = tidy(Note.transpose(key.tonic, interval))
  const chord = Chord.getChord(type, root)
  const pcs = chord.notes.map(tidy)
  const prettyType = type === 'M' ? '' : type === 'Madd9' ? 'add9' : type === 'madd9' ? 'm(add9)' : type === '69' ? '6/9' : type
  const hasSeventh = chord.intervals.some((ivl) => ivl.startsWith('7'))
  const coreSize = hasSeventh ? 4 : 3
  return { id, symbol: `${root}${prettyType}`, root, pcs, core: pcs.slice(0, coreSize), extensions: pcs.slice(coreSize) }
}

const SCALE_BY_PALETTE: Record<PaletteId, { major: string; minor: string }> = {
  diatonic: { major: 'major', minor: 'aeolian' },
  chromatic_approach: { major: 'major', minor: 'aeolian' },
  pentatonic: { major: 'major pentatonic', minor: 'minor pentatonic' },
  whole_tone: { major: 'whole tone', minor: 'whole tone' },
  modal: { major: 'lydian', minor: 'dorian' },
}

/**
 * Pitch classes for melody and passing notes under `chord`.
 * In minor keys the scale borrows the chord's leading tone (harmonic minor)
 * so a run over V7 doesn't rub a natural seventh against the chord's raised one.
 */
export function scaleFor(key: KeyInfo, palette: PaletteId, chord: ResolvedChord): string[] {
  const name = SCALE_BY_PALETTE[palette][key.minor ? 'minor' : 'major']
  let pcs = Scale.get(`${key.tonic} ${name}`).notes.map(tidy)
  if (key.minor && (palette === 'diatonic' || palette === 'chromatic_approach')) {
    const leadingTone = Note.chroma(Note.transpose(key.tonic, '7M'))
    if (chord.pcs.some((pc) => Note.chroma(pc) === leadingTone)) {
      pcs = Scale.get(`${key.tonic} harmonic minor`).notes.map(tidy)
    }
  }
  return pcs
}
