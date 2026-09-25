// Key-relative labels → spelled pitch classes, via tonal.

import { Chord, Key, Note, Scale } from 'tonal'
import type { ChordId, KeyId, PaletteId } from '../plan/schema'
import { tidy } from './pitch'

export interface KeyInfo {
  id: KeyId
  tonic: string
  minor: boolean
  /** VexFlow key-signature spec. */
  signature: string
  label: string
  /** True when the key signature is written in sharps (chromatic notes are then spelled as sharps too). */
  sharps: boolean
}

export function keyInfo(id: KeyId): KeyInfo {
  const [rawTonic, mode] = id.split('_')
  const tonic = rawTonic.replace(/s$/, '#')
  const minor = mode === 'minor'
  const alteration = minor ? Key.minorKey(tonic).alteration : Key.majorKey(tonic).alteration
  return { id, tonic, minor, signature: minor ? `${tonic}m` : tonic, label: `${tonic.replace('b', '♭').replace('#', '♯')} ${mode}`, sharps: alteration > 0 }
}

/**
 * [interval of the root above the tonic, tonal chord type, bass?]
 * `bass` is the interval of the bass note above the TONIC (not the root) and
 * is only given when the bass is not the root: inversions and pedal chords.
 */
const CHORD_TABLE: Record<ChordId, readonly [root: string, type: string, bass?: string]> = {
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

  I6: ['1P', 'M', '3M'],
  i6: ['1P', 'm', '3m'],
  I64: ['1P', 'M', '5P'],
  i64: ['1P', 'm', '5P'],
  Imaj42: ['1P', 'maj7', '7M'],
  i42: ['1P', 'm7', '7m'],
  ii6: ['2M', 'm', '4P'],
  ii65: ['2M', 'm7', '4P'],
  ii42: ['2M', 'm7', '1P'],
  ii_dim6: ['2M', 'dim', '4P'],
  ii_half_dim65: ['2M', 'm7b5', '4P'],
  iii6: ['3M', 'm', '5P'],
  iii64: ['3M', 'm', '7M'],
  IV6: ['4P', 'M', '6M'],
  iv6: ['4P', 'm', '6m'],
  IV64: ['4P', 'M', '1P'],
  iv64: ['4P', 'm', '1P'],
  V6: ['5P', 'M', '7M'],
  V65: ['5P', '7', '7M'],
  V43: ['5P', '7', '2M'],
  V42: ['5P', '7', '4P'],
  v6: ['5P', 'm', '7m'],
  vi6: ['6M', 'm', '1P'],
  vii_dim6: ['7M', 'dim', '2M'],
  bIII6: ['3m', 'M', '5P'],
  bII6: ['2m', 'M', '4P'],

  V7_of_V: ['2M', '7'],
  V65_of_V: ['2M', '7', '4A'],
  V7_of_IV: ['1P', '7'],
  V7_of_ii: ['6M', '7'],
  V7_of_vi: ['3M', '7'],
  vii_dim7_of_V: ['4A', 'dim7'],
  bVI7: ['6m', '7'],
  sharp_i_dim7: ['1A', 'dim7'],
  sharp_iv_half_dim7: ['4A', 'm7b5'],
  biii7: ['3m', 'm7'],
  bII7: ['2m', '7#11'],
  V7b9: ['5P', '7b9'],
  V9sus4: ['5P', '9sus4'],

  II: ['2M', 'M'],
  II_over_I: ['2M', 'M', '1P'],
  III: ['3M', 'M'],
  VI: ['6M', 'M'],
  IV7: ['4P', '7'],
  bVII9: ['7m', '9'],
  bVIImaj7: ['7m', 'maj7'],
  bVII_over_I: ['7m', 'M', '1P'],
  V7_over_I: ['5P', '7', '1P'],
  iv_add6: ['4P', 'm6'],
  Iadd6: ['1P', '6'],
  IVadd6: ['4P', '6'],
  Imaj7s5: ['1P', 'maj7#5'],
  Imaj7s11: ['1P', 'maj7#11'],
  i_maj7: ['1P', 'mMaj7'],
  i_add6: ['1P', 'm6'],
  i11: ['1P', 'm11'],
  iv9: ['4P', 'm9'],
}

/** Semitones from the tonic to a chord's root, 0–11. Theory only; no key needed. */
export function rootDegree(id: ChordId): number {
  return Note.chroma(Note.transpose('C', CHORD_TABLE[id][0])) ?? 0
}

export interface ResolvedChord {
  id: ChordId
  /** e.g. "Abmaj7", or "C/E" when the bass is not the root */
  symbol: string
  root: string
  /** Pitch class the left hand should put at the bottom: the root, unless the label is an inversion or a pedal chord. */
  bass: string
  /** True when `bass` was dictated by the label, so textures must not re-voice it. */
  fixedBass: boolean
  /** All chord tones as pitch classes, root first, stacked in thirds. */
  pcs: string[]
  /** The three or four tones that define the chord (root, 3rd/sus, 5th, 7th). */
  core: string[]
  /** Colour tones above the seventh (9, 11, 13) — empty for plain chords. */
  extensions: string[]
}

const PRETTY_TYPE: Record<string, string> = { M: '', Madd9: 'add9', madd9: 'm(add9)', '69': '6/9', mMaj7: 'm(maj7)' }

export function resolveChord(key: KeyInfo, id: ChordId): ResolvedChord {
  const [interval, type, bassInterval] = CHORD_TABLE[id]
  // Bbb major in D-flat is correct and unreadable; respell such roots (→ A).
  const root = tidy(Note.transpose(key.tonic, interval))
  const chord = Chord.getChord(type, root)
  const pcs = chord.notes.map(tidy)
  const hasSeventh = chord.intervals.some((ivl) => ivl.startsWith('7'))
  // Sixth chords (C6, Cm6) keep the sixth in the core: it is the colour.
  const coreSize = hasSeventh || chord.intervals.includes('6M') ? 4 : 3
  // Spell the bass the way the chord does (F# in D7/F#, not Gb) when it is a chord tone.
  const rawBass = bassInterval ? tidy(Note.transpose(key.tonic, bassInterval)) : root
  const bass = pcs.find((pc) => Note.chroma(pc) === Note.chroma(rawBass)) ?? rawBass
  const name = `${root}${PRETTY_TYPE[type] ?? type}`
  return {
    id,
    symbol: bass === root ? name : `${name}/${bass}`,
    root,
    bass,
    fixedBass: bass !== root,
    pcs,
    core: pcs.slice(0, coreSize),
    extensions: pcs.slice(coreSize),
  }
}

const SCALE_BY_PALETTE: Record<PaletteId, { major: string; minor: string }> = {
  diatonic: { major: 'major', minor: 'aeolian' },
  chromatic_approach: { major: 'major', minor: 'aeolian' },
  pentatonic: { major: 'major pentatonic', minor: 'minor pentatonic' },
  whole_tone: { major: 'whole tone', minor: 'whole tone' },
  modal: { major: 'lydian', minor: 'dorian' },
  modal_dark: { major: 'mixolydian', minor: 'phrygian' },
  blues: { major: 'major blues', minor: 'minor blues' },
}

/** Seven-note palettes bend to the chord; the gapped and symmetric ones keep their own colour. */
const BENDS_TO_CHORD: ReadonlySet<PaletteId> = new Set<PaletteId>(['diatonic', 'chromatic_approach', 'modal', 'modal_dark'])

/**
 * Pitch classes for melody and passing notes under `chord`.
 *
 * The palette scale is bent toward the harmony: any scale degree that sits a
 * semitone from a chord tone it doesn't contain is replaced by that chord
 * tone. So a run over V7 in a minor key gets the leading tone (harmonic
 * minor), one over V7/V gets the raised fourth, one over bVI gets the lowered
 * sixth and third — no cross-relations between the line and the chord.
 */
export function scaleFor(key: KeyInfo, palette: PaletteId, chord: ResolvedChord): string[] {
  const name = SCALE_BY_PALETTE[palette][key.minor ? 'minor' : 'major']
  const pcs = Scale.get(`${key.tonic} ${name}`).notes.map(tidy)
  if (!BENDS_TO_CHORD.has(palette)) return pcs
  const chromas = pcs.map((pc) => Note.chroma(pc) ?? -1)
  for (const tone of chord.pcs) {
    const chroma = Note.chroma(tone)
    if (chroma == null || chromas.includes(chroma)) continue
    // Prefer the degree with the same letter (G → Gb); else whichever neighbour is a semitone off.
    const neighbours = pcs.map((pc, i) => ({ i, pc, distance: Math.min((chromas[i] - chroma + 12) % 12, (chroma - chromas[i] + 12) % 12) })).filter((n) => n.distance === 1)
    const target = neighbours.find((n) => n.pc[0] === tone[0]) ?? neighbours[0]
    if (!target) continue
    pcs[target.i] = tone
    chromas[target.i] = chroma
  }
  // Bending opens augmented seconds — A♭–B in C minor over V, A♭–B in C major
  // over a borrowed iv — which a line then steps across. Close each from the
  // side the chord does not own: the melodic minor raises the sixth under a
  // leading tone; mixture lowers the seventh over a borrowed sixth. Where the
  // chord owns both, as a diminished seventh does, the second is its own.
  const chordChromas = new Set(chord.pcs.map((pc) => Note.chroma(pc)))
  for (let i = 0; i < pcs.length; i++) {
    const upper = (i + 1) % pcs.length
    if ((chromas[upper] - chromas[i] + 12) % 12 !== 3) continue
    const ownsLower = chordChromas.has(chromas[i])
    const ownsUpper = chordChromas.has(chromas[upper])
    if (ownsLower === ownsUpper) continue
    const moved = ownsUpper ? i : upper
    pcs[moved] = tidy(Note.transpose(pcs[moved], ownsUpper ? '1A' : '-1A'))
    chromas[moved] = Note.chroma(pcs[moved]) ?? chromas[moved]
  }
  // Two degrees may have collapsed onto one pitch; drop the duplicate.
  return pcs.filter((pc, i) => chromas.indexOf(Note.chroma(pc) ?? -1) === i)
}
