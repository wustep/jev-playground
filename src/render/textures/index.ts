import type { TextureId } from '../../plan/schema'
import type { Texture } from '../context'
import { brokenChordPrelude, chorale, twoVoiceCounterpoint } from './baroque'
import { albertiMelody, dramaticChords } from './classical'
import { parallelPlaning, washArpeggio } from './impressionist'
import { lushVoicings, minimalCells, syncopatedOstinato } from './modern'

export const TEXTURE_RENDERERS: Record<TextureId, Texture> = {
  chorale,
  two_voice_counterpoint: twoVoiceCounterpoint,
  broken_chord_prelude: brokenChordPrelude,
  alberti_melody: albertiMelody,
  dramatic_chords: dramaticChords,
  parallel_planing: parallelPlaning,
  wash_arpeggio: washArpeggio,
  minimal_cells: minimalCells,
  syncopated_ostinato: syncopatedOstinato,
  lush_voicings: lushVoicings,
}

/** Textures that are played with the sustain pedal down. */
export const PEDALLED: ReadonlySet<TextureId> = new Set<TextureId>(['parallel_planing', 'wash_arpeggio', 'lush_voicings', 'broken_chord_prelude'])
