// Score → VexFlow 5 on a <canvas>: grand staff, systems that wrap to the
// available width, up to two voices per staff, ties for split values, and the
// plan's labels (chord, role, dynamic) printed over each bar.
//
// Returns a layout map (bar boxes + tick→x anchors) so the playhead overlay
// can follow the music without re-rendering the notation.

import {
  Accidental,
  Articulation,
  Barline,
  Beam,
  Dot,
  Formatter,
  Metrics,
  Modifier,
  Renderer,
  Stave,
  StaveConnector,
  StaveNote,
  StaveTie,
  Stem,
  Stroke,
  Voice as VexVoice,
} from 'vexflow/bravura'
import { Note as Tonal } from 'tonal'
import type { Bar, MeterInfo, Score, Voice } from '../render/score'
import { engraveVoice, VEX_DURATION } from './notation'

export interface BarLayout {
  index: number
  x: number
  width: number
  top: number
  bottom: number
  /** Known x positions of tick onsets inside this bar, ascending. */
  anchors: { tick: number; x: number }[]
}

export interface SheetLayout {
  width: number
  height: number
  /** Engraving scale (< 1 on narrow screens). Layout numbers are already in CSS pixels. */
  scale: number
  bars: BarLayout[]
}

export interface SheetTheme {
  ink: string
  muted: string
  accent: string
}

/** Side margin, in engraving pixels: generous on a desk, tighter where every pixel is a note. */
const marginX = (width: number) => (width >= 720 ? 34 : 20)

// VexFlow deep-clones (structuredClone) a small flat style / font record for
// every element it creates — the single largest self-time in a profile of the
// generate → sheet path (~10 % of engraving). A shallow copy is equivalent for
// these flat records and an order of magnitude cheaper.
{
  const fonts = new Map<string, object>()
  const styles = new Map<string, object>()
  const fontInfo = Metrics.getFontInfo.bind(Metrics)
  const style = Metrics.getStyle.bind(Metrics)
  const copy = <T extends object>(cache: Map<string, object>, key: string, load: (key: string) => T): T => {
    let value = cache.get(key) as T | undefined
    if (!value) cache.set(key, (value = load(key)))
    const out = { ...value } as Record<string, unknown>
    for (const [k, v] of Object.entries(out)) if (Array.isArray(v)) out[k] = [...v]
    return out as T
  }
  Metrics.getFontInfo = (key: string) => copy(fonts, key, fontInfo)
  Metrics.getStyle = (key: string) => copy(styles, key, style)
}
const SYSTEM_TOP = 46 // room above the treble staff for chord symbols
const STAFF_GAP = 96
const SYSTEM_HEIGHT = 292
/** Extra pixels either side of a notehead. VexFlow's default (3) makes dense 16ths look like one bar. */
export const LEDGER_STROKE_PX = 1

/** VexFlow wants "eb/4"; tonal gives "Eb4". */
function vexKey(pitch: string): string {
  return `${Tonal.pitchClass(pitch).toLowerCase()}/${Tonal.octave(pitch)}`
}

/** Where a rest sits, so two voices on one staff don't collide. */
function restKey(clef: 'treble' | 'bass', voiceIndex: number, voiceCount: number): string {
  if (voiceCount === 1) return clef === 'treble' ? 'b/4' : 'd/3'
  if (clef === 'treble') return voiceIndex === 0 ? 'g/5' : 'd/4'
  return voiceIndex === 0 ? 'b/3' : 'f/2'
}

export interface BuiltVoice {
  voice: VexVoice
  notes: StaveNote[]
  ties: StaveTie[]
  beams: Beam[]
  onsets: { tick: number; note: StaveNote }[]
}

export function buildVoice(source: Voice, clef: 'treble' | 'bass', voiceIndex: number, voiceCount: number, meter: MeterInfo): BuiltVoice {
  const stemDirection = voiceCount > 1 ? (voiceIndex === 0 ? Stem.UP : Stem.DOWN) : undefined
  const engraved = engraveVoice(source, meter)
  const notes: StaveNote[] = []
  const ties: StaveTie[] = []
  const onsets: BuiltVoice['onsets'] = []

  engraved.forEach((piece, i) => {
    const { duration, dots } = VEX_DURATION[piece.dur]
    const staveNote = piece.note
      ? new StaveNote({
          keys: piece.note.pitches.map(vexKey),
          duration,
          dots,
          clef,
          strokePx: LEDGER_STROKE_PX,
          ...(stemDirection === undefined ? { autoStem: true } : { stemDirection }),
        })
      : new StaveNote({ keys: [restKey(clef, voiceIndex, voiceCount)], duration: `${duration}r`, dots, clef, strokePx: LEDGER_STROKE_PX })
    if (dots > 0) Dot.buildAndAttach([staveNote], { all: true })
    if (piece.note && piece.head) {
      if (piece.note.accent) staveNote.addModifier(new Articulation('a>').setPosition(clef === 'treble' ? Modifier.Position.ABOVE : Modifier.Position.BELOW), 0)
      if (piece.note.roll && piece.note.pitches.length > 1) staveNote.addStroke(0, new Stroke(Stroke.Type.ARPEGGIO_DIRECTIONLESS))
      onsets.push({ tick: piece.start, note: staveNote })
    }
    notes.push(staveNote)
    const previous = engraved[i - 1]
    if (previous?.tieToNext && previous.note) {
      const indexes = previous.note.pitches.map((_, k) => k)
      ties.push(new StaveTie({ firstNote: notes[i - 1], lastNote: staveNote, firstIndexes: indexes, lastIndexes: indexes }))
    }
  })

  const voice = new VexVoice({ numBeats: meter.num, beatValue: meter.den }).setStrict(true).addTickables(notes)
  const beams = Beam.generateBeams(notes, {
    groups: Beam.getDefaultBeamGroups(`${meter.num}/${meter.den}`),
    ...(stemDirection === undefined ? {} : { stemDirection, maintainStemDirections: true }),
  })
  return { voice, notes, ties, beams, onsets }
}

/**
 * VexFlow keys ModifierContexts by `tickable.getStave()`. Notes that still have
 * no stave (the default here before this helper) all share `undefined`, so a
 * treble whole note and a bass 16th at tick 0 are formatted as one staff —
 * stems flip mid-beam (filled black rectangles) and ledger lines stretch.
 */
export function attachVoicesToStave(voices: BuiltVoice[], stave: Stave) {
  for (const built of voices) {
    built.voice.setStave(stave)
    for (const note of built.notes) note.setStave(stave)
  }
}

/** Keep every note in a beam on the beam's stem direction after Formatter has run. */
export function unifyBeamStems(beam: Beam) {
  const direction = beam.getStemDirection()
  for (const note of beam.getNotes()) {
    if (!note.isRest()) note.setStemDirection(direction)
  }
}

/** How much horizontal room a bar wants, from its busiest voice. */
function barDensity(bar: Bar, meter: MeterInfo): number {
  return Math.max(...[...bar.treble, ...bar.bass].map((voice) => engraveVoice(voice, meter).length), 1)
}

function chooseBarsPerSystem(score: Score, width: number, firstBarExtra: number): number {
  const busiest = Math.max(...score.bars.map((bar) => barDensity(bar, score.meter)))
  const minBarWidth = Math.min(360, Math.max(150, busiest * 19 + 44))
  const fit = Math.floor((width - marginX(width) * 2 - firstBarExtra) / minBarWidth)
  return [4, 2, 1].find((n) => n <= Math.max(1, fit)) ?? 1
}

/**
 * Phones get the same engraving, drawn smaller: at full size a 16th-note bar
 * needs ~350px, so a 360px screen would squeeze one cramped bar per system.
 */
export function sheetScale(width: number): number {
  if (width >= 720) return 1
  if (width <= 420) return 0.68
  return 0.68 + ((width - 420) / 300) * 0.32
}

/** Wait for VexFlow's bundled music + text fonts before the first draw. */
export async function sheetFontsReady(): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return
  await Promise.allSettled([document.fonts.load('30px Bravura'), document.fonts.load('16px Academico')])
}

export function drawScore(canvas: HTMLCanvasElement, score: Score, cssWidth: number, theme: SheetTheme): SheetLayout {
  const { meter } = score
  // Everything below is laid out in "engraving pixels"; the canvas is scaled
  // once, and the returned layout is converted back to CSS pixels at the end.
  const scale = sheetScale(cssWidth)
  const width = cssWidth / scale
  const signatureWidth = 54 + keySignatureWidth(score.keySignature)
  const barsPerSystem = chooseBarsPerSystem(score, width, signatureWidth + 30)
  const systemCount = Math.ceil(score.bars.length / barsPerSystem)
  const height = systemCount * SYSTEM_HEIGHT + 8

  const renderer = new Renderer(canvas, Renderer.Backends.CANVAS)
  renderer.resize(cssWidth, Math.ceil(height * scale))
  const context = renderer.getContext()
  context.scale(scale, scale)
  context.setFillStyle(theme.ink)
  context.setStrokeStyle(theme.ink)
  const pen = canvas.getContext('2d')!

  const layout: SheetLayout = { width: cssWidth, height: Math.ceil(height * scale), scale, bars: [] }
  let lastDynamic: string | undefined

  for (let system = 0; system < systemCount; system++) {
    const bars = score.bars.slice(system * barsPerSystem, (system + 1) * barsPerSystem)
    const top = system * SYSTEM_HEIGHT + SYSTEM_TOP
    const lead = signatureWidth + (system === 0 ? 30 : 0)
    const barWidth = (width - marginX(width) * 2 - lead) / barsPerSystem
    let x = marginX(width)

    bars.forEach((bar, column) => {
      const first = column === 0
      const staveWidth = barWidth + (first ? lead : 0)
      const treble = new Stave(x, top, staveWidth)
      const bass = new Stave(x, top + STAFF_GAP, staveWidth)
      if (first) {
        treble.addClef('treble').addKeySignature(score.keySignature)
        bass.addClef('bass').addKeySignature(score.keySignature)
        if (system === 0) {
          treble.addTimeSignature(`${meter.num}/${meter.den}`)
          bass.addTimeSignature(`${meter.num}/${meter.den}`)
        }
      }
      const isFinal = bar.index === score.bars.length - 1
      if (isFinal) {
        treble.setEndBarType(Barline.type.END)
        bass.setEndBarType(Barline.type.END)
      }
      const noteStart = Math.max(treble.getNoteStartX(), bass.getNoteStartX())
      treble.setNoteStartX(noteStart)
      bass.setNoteStartX(noteStart)
      treble.setDefaultLedgerLineStyle({ strokeStyle: theme.ink, lineWidth: 1 })
      bass.setDefaultLedgerLineStyle({ strokeStyle: theme.ink, lineWidth: 1 })
      treble.setContext(context).draw()
      bass.setContext(context).draw()

      if (first) {
        new StaveConnector(treble, bass).setType('brace').setContext(context).draw()
        new StaveConnector(treble, bass).setType('singleLeft').setContext(context).draw()
      }
      new StaveConnector(treble, bass).setType(isFinal ? 'boldDoubleRight' : 'singleRight').setContext(context).draw()

      const upper = bar.treble.map((voice, i) => buildVoice(voice, 'treble', i, bar.treble.length, meter))
      const lower = bar.bass.map((voice, i) => buildVoice(voice, 'bass', i, bar.bass.length, meter))
      attachVoicesToStave(upper, treble)
      attachVoicesToStave(lower, bass)
      if (upper.length) Accidental.applyAccidentals(upper.map((b) => b.voice), score.keySignature)
      if (lower.length) Accidental.applyAccidentals(lower.map((b) => b.voice), score.keySignature)

      const formatter = new Formatter()
      if (upper.length) formatter.joinVoices(upper.map((b) => b.voice))
      if (lower.length) formatter.joinVoices(lower.map((b) => b.voice))
      const all = [...upper, ...lower]
      formatter.format(all.map((b) => b.voice), Math.max(40, x + staveWidth - noteStart - 14))
      all.forEach((b) => b.beams.forEach(unifyBeamStems))

      upper.forEach((b) => b.voice.draw(context, treble))
      lower.forEach((b) => b.voice.draw(context, bass))
      all.forEach((b) => b.beams.forEach((beam) => beam.setContext(context).draw()))
      all.forEach((b) => b.ties.forEach((tie) => tie.setContext(context).draw()))

      // Tick → x anchors for the playhead, merged across every voice.
      const anchorMap = new Map<number, number>()
      for (const built of all) for (const onset of built.onsets) if (!anchorMap.has(onset.tick)) anchorMap.set(onset.tick, onset.note.getAbsoluteX())
      if (!anchorMap.has(0)) anchorMap.set(0, noteStart)
      const anchors = [...anchorMap.entries()].map(([tick, ax]) => ({ tick, x: ax })).sort((a, b) => a.tick - b.tick)
      layout.bars.push({ index: bar.index, x, width: staveWidth, top: top - 8, bottom: top + STAFF_GAP + 96, anchors })

      // Plan labels: what Jev (or the stub) decided for this bar.
      const labelX = first ? noteStart - 6 : x + 8
      pen.save()
      pen.textBaseline = 'alphabetic'
      pen.fillStyle = theme.ink
      pen.font = '600 15px "Fraunces", "Academico", Georgia, serif'
      pen.fillText(prettyChord(bar.chordSymbol), labelX, top - 4)
      const symbolWidth = pen.measureText(prettyChord(bar.chordSymbol)).width
      pen.fillStyle = theme.accent
      pen.font = '500 11px "JetBrains Mono", ui-monospace, monospace'
      pen.fillText(bar.plan.chord, labelX + symbolWidth + 8, top - 5)
      if (bar.split && bar.plan.chord2) {
        // The second harmony, over the first note at or after the split.
        const at = anchors.find((anchor) => anchor.tick >= bar.split!.tick)
        const splitX = Math.max(labelX + symbolWidth + pen.measureText(bar.plan.chord).width + 16, at ? at.x - 4 : x + staveWidth / 2)
        pen.fillStyle = theme.ink
        pen.font = '600 15px "Fraunces", "Academico", Georgia, serif'
        pen.fillText(prettyChord(bar.split.chordSymbol), splitX, top - 4)
        const splitWidth = pen.measureText(prettyChord(bar.split.chordSymbol)).width
        pen.fillStyle = theme.accent
        pen.font = '500 11px "JetBrains Mono", ui-monospace, monospace'
        pen.fillText(bar.plan.chord2, splitX + splitWidth + 8, top - 5)
      }
      pen.fillStyle = theme.muted
      pen.font = '500 10.5px "JetBrains Mono", ui-monospace, monospace'
      pen.fillText(`${bar.index + 1} · ${bar.plan.role.replace(/_/g, ' ')}`, labelX, top + STAFF_GAP + 134)
      if (bar.dynamic !== lastDynamic) {
        pen.fillStyle = theme.ink
        pen.font = 'italic 600 17px "Academico", "Fraunces", Georgia, serif'
        pen.fillText(bar.dynamic, first ? noteStart - 16 : x + 4, top + 120)
        lastDynamic = bar.dynamic
      }
      pen.restore()

      x += staveWidth
    })
  }
  if (scale !== 1) {
    for (const bar of layout.bars) {
      bar.x *= scale
      bar.width *= scale
      bar.top *= scale
      bar.bottom *= scale
      for (const anchor of bar.anchors) anchor.x *= scale
    }
  }
  return layout
}

/** Flats and sharps as real glyphs in chord symbols. */
function prettyChord(symbol: string): string {
  return symbol.replace(/([A-G])b/g, '$1♭').replace(/([A-G])#/g, '$1♯').replace(/#(\d)/g, '♯$1').replace(/b(\d)/g, '♭$1')
}

function keySignatureWidth(signature: string): number {
  const SHARPS_OR_FLATS: Record<string, number> = {
    C: 0, G: 1, D: 2, A: 3, E: 4, B: 5, F: 1, Bb: 2, Eb: 3, Ab: 4, Db: 5, Gb: 6,
    Am: 0, Em: 1, Bm: 2, 'F#m': 3, 'C#m': 4, Dm: 1, Gm: 2, Cm: 3, Fm: 4,
  }
  return (SHARPS_OR_FLATS[signature] ?? 3) * 11 + 6
}

/** The bar whose box contains a point (CSS pixels within the sheet), if any. */
export function barAt(layout: SheetLayout, x: number, y: number): BarLayout | undefined {
  return layout.bars.find((bar) => x >= bar.x && x <= bar.x + bar.width && y >= bar.top && y <= bar.bottom)
}

/** x position of the playhead for a tick offset inside a bar. */
export function playheadX(bar: BarLayout, tick: number, ticksPerBar: number): number {
  const points = [...bar.anchors, { tick: ticksPerBar, x: bar.x + bar.width - 4 }]
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]
    const b = points[i + 1]
    if (tick >= a.tick && tick < b.tick) return a.x + ((tick - a.tick) / (b.tick - a.tick)) * (b.x - a.x)
  }
  return points[points.length - 1].x
}
