import { Midi } from '@tonejs/midi'
import { STYLE_LABELS, type InstrumentId } from '../plan/schema'
import { timeline } from '../render/renderPlan'
import type { Score } from '../render/score'

/** General MIDI program numbers for the playground's instruments. */
const GM_PROGRAM: Record<InstrumentId, number> = {
  grand_piano: 0,
  electric_piano: 4,
  harpsichord: 6,
  church_organ: 19,
  strings: 48,
  choir: 52,
}

/** Score → Standard MIDI File (format 1: right hand and left hand tracks). */
export function scoreToMidi(score: Score, instrument: InstrumentId): Uint8Array {
  const midi = new Midi()
  midi.header.name = `${STYLE_LABELS[score.plan.style]} — jev-playground`
  // Tempo first: note times below are converted to ticks against it.
  midi.header.setTempo(score.bpm)
  midi.header.timeSignatures.push({ ticks: 0, timeSignature: [score.meter.num, score.meter.den] })

  // Written durations only: the pedal is exported as CC64 below instead of
  // being baked into note lengths.
  const notes = timeline(score, { sustain: false })
  const secondsPerBar = (score.meter.ticksPerBar * 60) / score.bpm / 4
  for (const hand of ['right', 'left'] as const) {
    const track = midi.addTrack()
    track.name = hand === 'right' ? 'Right hand' : 'Left hand'
    track.channel = hand === 'right' ? 0 : 1
    track.instrument.number = GM_PROGRAM[instrument]
    for (const n of notes) {
      if (n.hand !== hand) continue
      track.addNote({ midi: n.midi, time: n.time, duration: Math.max(0.03, n.duration), velocity: n.velocity / 127 })
    }
    if (score.pedal !== 'dry') {
      const value = score.pedal === 'full' ? 1 : 0.5
      score.bars.forEach((bar) => {
        const start = bar.index * secondsPerBar
        track.addCC({ number: 64, value, time: start + 0.02 })
        track.addCC({ number: 64, value: 0, time: start + secondsPerBar - 0.02 })
      })
    }
  }
  return midi.toArray()
}

export function downloadMidi(score: Score, instrument: InstrumentId): string {
  const bytes = scoreToMidi(score, instrument)
  const filename = `jev-${score.plan.style}-${score.plan.key}-${score.seed}.mid`
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'audio/midi' }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return filename
}
