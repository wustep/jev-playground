import type { TextureId } from '../../plan/schema'
import type { Texture } from '../context'
import { brokenChordPrelude, chorale, twoVoiceCounterpoint } from './baroque'
import { albertiMelody, dramaticChords } from './classical'
import { ariaWalkingBass, rollingNocturne, scherzoStaccato, strideDance, toccataPerpetual, tremoloStorm } from './classicalExtra'
import { parallelPlaning, washArpeggio } from './impressionist'
import { lushVoicings, minimalCells, syncopatedOstinato } from './modern'
import { bellOrganum, chordalMelody, displacedArpeggio, interlockingHands, melodyOverOstinato, pulsingChords } from './modernExtra'

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
  aria_walking_bass: ariaWalkingBass,
  toccata_perpetual: toccataPerpetual,
  stride_dance: strideDance,
  rolling_nocturne: rollingNocturne,
  tremolo_storm: tremoloStorm,
  pulsing_chords: pulsingChords,
  melody_over_ostinato: melodyOverOstinato,
  interlocking_hands: interlockingHands,
  displaced_arpeggio: displacedArpeggio,
  chordal_melody: chordalMelody,
  bell_organum: bellOrganum,
  scherzo_staccato: scherzoStaccato,
}

/** Textures that are played with the sustain pedal down. */
export const PEDALLED: ReadonlySet<TextureId> = new Set<TextureId>([
  'parallel_planing',
  'wash_arpeggio',
  'lush_voicings',
  'broken_chord_prelude',
  'rolling_nocturne',
  'melody_over_ostinato',
  'displaced_arpeggio',
  'chordal_melody',
  'bell_organum',
])
