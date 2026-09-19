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
const SYSTEM_TOP = 52 // room above the treble staff for chord symbols
const STAFF_GAP = 96
const SYSTEM_HEIGHT = 300
/** Room under the bass staff for dynamics + role labels (SYSTEM_HEIGHT − top − gap). */
const SYSTEM_BELOW = SYSTEM_HEIGHT - SYSTEM_TOP - STAFF_GAP
/**
 * VexFlow `Stave.y` is not the top staff line: `spaceAboveStaffLn` (4) × 10px
 * of headroom sits above line 0, and the five lines occupy the next 40px.
 */
const STAVE_HEADROOM = 40
const STAFF_LINE_SPAN = 40
/** Chord symbols sit this many pixels above the stave y (well above line 0). */
export const CHORD_ABOVE_STAFF = 20
/** Dynamics sit below the bass bottom line, not on the staff. */
export const DYNAMIC_BELOW_BASS = STAVE_HEADROOM + STAFF_LINE_SPAN + 18
/** Role text sits below the dynamic, still inside SYSTEM_BELOW. */
export const ROLE_BELOW_BASS = STAVE_HEADROOM + STAFF_LINE_SPAN + 44
/** Extra pixels either side of a notehead. VexFlow's default (3) makes dense 16ths look like one bar. */
export const LEDGER_STROKE_PX = 1

/** VexFlow `Tables.keyProperties` accepts A–G plus # / ## / b / bb / n. */
const VEX_PITCH = /^[a-g](#{1,2}|b{1,2}|n)?$/i

/**
 * VexFlow wants "eb/4"; tonal gives "Eb4".
 * Illegal spellings (no octave, empty, H4, "MIDI 60") used to become `eb/undefined`
 * or empty `keys`, which leaves a StaveNote with no noteheads — `getYs()` then
 * throws NoYValues and SheetView banners the whole score.
 */
export function vexKey(pitch: string): string | null {
  if (typeof pitch !== 'string' || !pitch) return null
  const pc = Tonal.pitchClass(pitch)
  const octave = Tonal.octave(pitch)
  if (!pc || !VEX_PITCH.test(pc) || octave == null || !Number.isInteger(octave)) return null
  return `${pc.toLowerCase()}/${Math.max(0, Math.min(8, octave))}`
}

/** Drop un-engravable pitches; keep the spelled names the rest of the pipeline knows. */
export function usablePitches(pitches: readonly string[]): string[] {
  return pitches.filter((pitch) => vexKey(pitch) != null)
}

/** Where a rest sits, so two voices on one staff don't collide. */
function restKey(clef: 'treble' | 'bass', voiceIndex: number, voiceCount: number): string {
  if (voiceCount === 1) return clef === 'treble' ? 'b/4' : 'd/3'
  if (clef === 'treble') return voiceIndex === 0 ? 'g/5' : 'd/4'
  return voiceIndex === 0 ? 'b/3' : 'f/2'
}

function ticksOf(note: StaveNote): number {
  return note.getTicks().value()
}

function noteLines(note: { getKeys(): string[]; getKeyLine?(index: number): number }): number[] {
  try {
    if (!note.getKeyLine) return []
    return note.getKeys().map((_, i) => note.getKeyLine!(i))
  } catch {
    return []
  }
}

function spansOverlap(aStart: number, aDur: number, bStart: number, bDur: number): boolean {
  return aStart < bStart + bDur && bStart < aStart + aDur
}

/** Keep a rest on the staff if we can; otherwise one ledger either side. */
function restLineAwayFrom(otherLines: number[], preferAbove: boolean): number {
  const lo = Math.min(...otherLines)
  const hi = Math.max(...otherLines)
  const above = hi + 2
  const below = lo - 2
  if (preferAbove) {
    if (above <= 9) return Math.max(5.5, above)
    if (below >= -1) return below
    return 5.5
  }
  if (below >= -1) return Math.min(0.5, below)
  if (above <= 9) return above
  return 0.5
}

/**
 * Sit each rest in its own voice's register, then push colliding rests off
 * the other voice's noteheads. Default rest keys are only a first guess.
 */
export function settleRests(voices: BuiltVoice[]) {
  for (const built of voices) {
    const lines = built.notes.filter((note) => !note.isRest()).flatMap(noteLines)
    if (!lines.length) continue
    const mid = (Math.min(...lines) + Math.max(...lines)) / 2
    for (const note of built.notes) {
      if (!note.isRest()) continue
      try {
        note.setKeyLine(0, mid)
      } catch {
        /* keep the default rest key */
      }
    }
  }
  if (voices.length < 2) return
  for (let i = 0; i < voices.length; i++) {
    let t = 0
    for (const note of voices[i].notes) {
      const dur = ticksOf(note)
      if (note.isRest()) {
        const otherLines: number[] = []
        for (let j = 0; j < voices.length; j++) {
          if (j === i) continue
          let u = 0
          for (const other of voices[j].notes) {
            const otherDur = ticksOf(other)
            if (spansOverlap(t, dur, u, otherDur) && !other.isRest()) otherLines.push(...noteLines(other))
            u += otherDur
          }
        }
        if (otherLines.length) {
          let restLine = 0
          try {
            restLine = note.getKeyLine(0)
          } catch {
            restLine = i === 0 ? 5.5 : 0.5
          }
          if (otherLines.some((line) => Math.abs(line - restLine) < 1.5)) {
            try {
              note.setKeyLine(0, restLineAwayFrom(otherLines, i === 0))
            } catch {
              /* a colliding rest is still a rest */
            }
          }
        }
      }
      t += dur
    }
  }
}

/** Empty staves still need a whole-bar rest (vamp bars often drop the tune). */
export function voicesForStaff(voices: Voice[], clef: 'treble' | 'bass', meter: MeterInfo): BuiltVoice[] {
  // Score promises at most two voices per staff. A leftover inner voice after a
  // Jev overlay (or a buggy third part) would share stems with voice 1.
  const kept = voices.slice(0, 2)
  if (!kept.length) return [buildVoice([], clef, 0, 1, meter)]
  return kept.map((voice, i) => buildVoice(voice, clef, i, kept.length, meter))
}

function midiSafe(pitch: string): number | null {
  const midi = Tonal.midi(pitch)
  return midi == null || !Number.isFinite(midi) ? null : midi
}

/**
 * Extra pixels when a system has notes far above the treble, far below the
 * bass, or in the crack between staves (high bass / low treble).
 */
export function systemPadding(bars: readonly Bar[]): { above: number; gap: number; below: number } {
  let above = 0
  let extraGap = 0
  let below = 0
  for (const bar of bars) {
    for (const voice of bar.treble) {
      for (const n of voice) {
        for (const pitch of n.pitches) {
          const midi = midiSafe(pitch)
          if (midi == null) continue
          if (midi > 84) above = Math.max(above, (midi - 84) * 3)
          if (midi < 62) extraGap = Math.max(extraGap, (62 - midi) * 3)
        }
      }
    }
    for (const voice of bar.bass) {
      for (const n of voice) {
        for (const pitch of n.pitches) {
          const midi = midiSafe(pitch)
          if (midi == null) continue
          if (midi > 57) extraGap = Math.max(extraGap, (midi - 57) * 3)
          if (midi < 40) below = Math.max(below, (40 - midi) * 3)
        }
      }
    }
  }
  return {
    above: Math.min(36, Math.round(above)),
    gap: Math.min(48, Math.round(extraGap)),
    below: Math.min(32, Math.round(below)),
  }
}

function systemHeight(pad: { above: number; gap: number; below: number }): number {
  return SYSTEM_TOP + pad.above + STAFF_GAP + pad.gap + SYSTEM_BELOW + pad.below
}

/** Flatten a beam whose notes span more than an octave on the staff. */
export function flattenWideBeams(beam: Beam) {
  const lines = beam.getNotes().filter((note) => !note.isRest()).flatMap((note) => noteLines(note as StaveNote))
  if (lines.length >= 2 && Math.max(...lines) - Math.min(...lines) >= 5) {
    beam.renderOptions.flatBeams = true
  }
}

/** Tie only the keys that exist on both ends, not a blind prefix of indexes. */
export function tieIndexes(first: StaveNote, last: StaveNote): { firstIndexes: number[]; lastIndexes: number[] } {
  const firstIndexes: number[] = []
  const lastIndexes: number[] = []
  first.getKeys().forEach((key, i) => {
    const j = last.getKeys().indexOf(key)
    if (j >= 0) {
      firstIndexes.push(i)
      lastIndexes.push(j)
    }
  })
  return { firstIndexes, lastIndexes }
}

function staveRest(clef: 'treble' | 'bass', voiceIndex: number, voiceCount: number, duration: string, dots: number): StaveNote {
  return new StaveNote({
    keys: [restKey(clef, voiceIndex, voiceCount)],
    duration: `${duration}r`,
    dots,
    clef,
    strokePx: LEDGER_STROKE_PX,
  })
}

function staveSounding(
  keys: string[],
  duration: string,
  dots: number,
  clef: 'treble' | 'bass',
  stemDirection: number | undefined,
): StaveNote {
  return new StaveNote({
    keys,
    duration,
    dots,
    clef,
    strokePx: LEDGER_STROKE_PX,
    ...(stemDirection === undefined ? { autoStem: true } : { stemDirection }),
  })
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
  const cleaned = source
    .filter((n) => n.dur > 0 && n.start >= 0)
    .map((n) => {
      const pitches = usablePitches(n.pitches)
      return pitches.length ? { ...n, pitches } : undefined
    })
    .filter((n): n is NonNullable<typeof n> => n != null)
  // Empty / all-illegal voices still fill the bar with rests so the Voice ticks.
  const engraved = engraveVoice(cleaned, meter)
  const notes: StaveNote[] = []
  const ties: StaveTie[] = []
  const onsets: BuiltVoice['onsets'] = []
  const sounding: boolean[] = []

  engraved.forEach((piece, i) => {
    const { duration, dots } = VEX_DURATION[piece.dur] ?? { duration: '16', dots: 0 }
    const keys = piece.note ? piece.note.pitches.map(vexKey).filter((key): key is string => key != null) : []
    let staveNote: StaveNote
    let isSounding = false
    try {
      if (piece.note && keys.length) {
        staveNote = staveSounding(keys, duration, dots, clef, stemDirection)
        isSounding = !staveNote.isRest()
      } else {
        staveNote = staveRest(clef, voiceIndex, voiceCount, duration, dots)
      }
    } catch {
      staveNote = staveRest(clef, voiceIndex, voiceCount, duration, dots)
      isSounding = false
    }
    if (dots > 0) {
      try {
        Dot.buildAndAttach([staveNote], { all: true })
      } catch {
        /* a rest without a legal dot is still a rest */
      }
    }
    if (isSounding && piece.note && piece.head) {
      try {
        if (piece.note.accent) staveNote.addModifier(new Articulation('a>').setPosition(clef === 'treble' ? Modifier.Position.ABOVE : Modifier.Position.BELOW), 0)
        if (piece.note.roll && keys.length > 1) staveNote.addStroke(0, new Stroke(Stroke.Type.ARPEGGIO_DIRECTIONLESS))
      } catch {
        /* keep the note; lose the mark */
      }
      onsets.push({ tick: piece.start, note: staveNote })
    }
    notes.push(staveNote)
    sounding.push(isSounding)
    const previous = engraved[i - 1]
    if (previous?.tieToNext && sounding[i - 1] && isSounding) {
      const { firstIndexes, lastIndexes } = tieIndexes(notes[i - 1], staveNote)
      if (firstIndexes.length) {
        const tie = new StaveTie({ firstNote: notes[i - 1], lastNote: staveNote, firstIndexes, lastIndexes })
        if (stemDirection !== undefined) tie.setDirection(stemDirection)
        ties.push(tie)
      }
    }
  })

  const voice = new VexVoice({ numBeats: meter.num, beatValue: meter.den }).setStrict(false).addTickables(notes)
  let beams: Beam[] = []
  try {
    beams = Beam.generateBeams(notes, {
      groups: Beam.getDefaultBeamGroups(`${meter.num}/${meter.den}`),
      beamRests: true,
      beamMiddleOnly: true,
      ...(stemDirection === undefined ? {} : { stemDirection, maintainStemDirections: true }),
    })
    beams.forEach(flattenWideBeams)
  } catch {
    beams = []
  }
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
    try {
      built.voice.setStave(stave)
    } catch {
      /* tickables still get a stave below */
    }
    for (const note of built.notes) {
      try {
        note.setStave(stave)
      } catch {
        /* draw path skips notes that still have no Y */
      }
    }
  }
}

/** Keep every note in a beam on the beam's stem direction after Formatter has run. */
export function unifyBeamStems(beam: Beam) {
  try {
    const direction = beam.getStemDirection()
    for (const note of beam.getNotes()) {
      if (!note.isRest()) note.setStemDirection(direction)
    }
  } catch {
    /* leave stems as format left them */
  }
}

function hasYs(note: { getYs(): number[] }): boolean {
  try {
    return note.getYs().length > 0
  } catch {
    return false
  }
}

function drawQuietly(draw: () => void) {
  try {
    draw()
  } catch {
    /* one bad beam/tie/voice must not blank the sheet */
  }
}

/**
 * How much horizontal room a bar wants: the busiest engraved voice, the
 * number of distinct onsets, and a surcharge when two voices share a staff
 * (Formatter has to leave space for accidentals on both).
 */
export function barDensity(bar: Bar, meter: MeterInfo): number {
  const voices = [...bar.treble, ...bar.bass]
  const maxVoice = Math.max(...voices.map((voice) => engraveVoice(voice, meter).length), 1)
  const staffVoices = Math.max(bar.treble.length, bar.bass.length, 1)
  const onsets = new Set<number>()
  for (const voice of voices) {
    for (const note of voice) {
      if (note.pitches.length) onsets.add(note.start)
    }
  }
  return Math.max(maxVoice, onsets.size) + Math.max(0, staffVoices - 1) * 6
}

/** Pixels of note-area a bar needs before 16ths start colliding. */
export function minBarWidth(density: number): number {
  return Math.min(560, Math.max(180, density * 24 + 64))
}

export function chooseBarsPerSystem(score: Score, width: number, firstBarExtra: number): number {
  const busiest = Math.max(...score.bars.map((bar) => barDensity(bar, score.meter)), 1)
  const fit = Math.floor((width - marginX(width) * 2 - firstBarExtra) / minBarWidth(busiest))
  return [4, 2, 1].find((n) => n <= Math.max(1, fit)) ?? 1
}

/** Pack bars into systems of 4, 2, or 1 so each bar keeps its width floor. */
export function packSystems(score: Score, width: number, firstBarExtra: number, laterBarExtra: number): Bar[][] {
  const systems: Bar[][] = []
  let i = 0
  while (i < score.bars.length) {
    const extra = systems.length === 0 ? firstBarExtra : laterBarExtra
    const avail = width - marginX(width) * 2 - extra
    let count = 1
    let used = minBarWidth(barDensity(score.bars[i], score.meter))
    while (count < 4 && i + count < score.bars.length) {
      const next = minBarWidth(barDensity(score.bars[i + count], score.meter))
      if (used + next > avail) break
      used += next
      count++
    }
    const snapped = [4, 2, 1].find((n) => n <= count) ?? 1
    systems.push(score.bars.slice(i, i + snapped))
    i += snapped
  }
  return systems
}

function allocateBarWidths(bars: readonly Bar[], avail: number, meter: MeterInfo): number[] {
  const mins = bars.map((bar) => minBarWidth(barDensity(bar, meter)))
  const sum = mins.reduce((total, value) => total + value, 0)
  if (sum <= 0) return bars.map(() => avail / Math.max(1, bars.length))
  const scale = avail / sum
  return mins.map((min) => min * scale)
}

/** Chord / dynamic / role positions: above the treble, below the bass, in the clef margin. */
export function sheetLabelLayout(top: number, gap: number, x: number, noteStart: number, first: boolean) {
  return {
    labelX: first ? noteStart - 6 : x + 8,
    chordY: top - CHORD_ABOVE_STAFF,
    dynamicX: x + (first ? 14 : 10),
    dynamicY: top + gap + DYNAMIC_BELOW_BASS,
    roleY: top + gap + ROLE_BELOW_BASS,
  }
}

/**
 * Phones get the same engraving, drawn smaller: at full size a 16th-note bar
 * needs ~450px, so a 360px screen would squeeze one cramped bar per system.
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
  const firstLead = signatureWidth + 30
  const laterLead = signatureWidth
  const systems = packSystems(score, width, firstLead, laterLead).map((bars) => ({ bars, pad: systemPadding(bars) }))
  const systemCount = systems.length
  const height = systems.reduce((sum, system) => sum + systemHeight(system.pad), 8)

  const renderer = new Renderer(canvas, Renderer.Backends.CANVAS)
  renderer.resize(cssWidth, Math.ceil(height * scale))
  const context = renderer.getContext()
  context.scale(scale, scale)
  context.setFillStyle(theme.ink)
  context.setStrokeStyle(theme.ink)
  const pen = canvas.getContext('2d')!

  const layout: SheetLayout = { width: cssWidth, height: Math.ceil(height * scale), scale, bars: [] }
  let lastDynamic: string | undefined

  let systemTop = 0
  for (let system = 0; system < systemCount; system++) {
    const { bars, pad } = systems[system]
    const top = systemTop + SYSTEM_TOP + pad.above
    const gap = STAFF_GAP + pad.gap
    const lead = system === 0 ? firstLead : laterLead
    const noteWidths = allocateBarWidths(bars, width - marginX(width) * 2 - lead, meter)
    let x = marginX(width)

    bars.forEach((bar, column) => {
      const first = column === 0
      const staveWidth = noteWidths[column] + (first ? lead : 0)
      const treble = new Stave(x, top, staveWidth)
      const bass = new Stave(x, top + gap, staveWidth)
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

      const all: BuiltVoice[] = []
      try {
        const upper = voicesForStaff(bar.treble, 'treble', meter)
        const lower = voicesForStaff(bar.bass, 'bass', meter)
        settleRests(upper)
        settleRests(lower)
        attachVoicesToStave(upper, treble)
        attachVoicesToStave(lower, bass)
        if (upper.length) Accidental.applyAccidentals(upper.map((b) => b.voice), score.keySignature)
        if (lower.length) Accidental.applyAccidentals(lower.map((b) => b.voice), score.keySignature)

        const formatter = new Formatter()
        if (upper.length) formatter.joinVoices(upper.map((b) => b.voice))
        if (lower.length) formatter.joinVoices(lower.map((b) => b.voice))
        all.push(...upper, ...lower)
        if (all.length) {
          const room = Math.max(40, x + staveWidth - noteStart - 12)
          formatter.format(all.map((b) => b.voice), room)
        }
        all.forEach((b) => b.beams.forEach(unifyBeamStems))

        upper.forEach((b) => drawQuietly(() => b.voice.draw(context, treble)))
        lower.forEach((b) => drawQuietly(() => b.voice.draw(context, bass)))
        all.forEach((b) =>
          b.beams.forEach((beam) => {
            if (beam.getNotes().every(hasYs)) drawQuietly(() => beam.setContext(context).draw())
          }),
        )
        all.forEach((b) =>
          b.ties.forEach((tie) => {
            drawQuietly(() => tie.setContext(context).draw())
          }),
        )
      } catch {
        /* staves and labels still draw; this bar's notes are skipped */
      }

      // Tick → x anchors for the playhead, merged across every voice.
      const anchorMap = new Map<number, number>()
      for (const built of all) {
        for (const onset of built.onsets) {
          if (anchorMap.has(onset.tick) || !hasYs(onset.note)) continue
          try {
            anchorMap.set(onset.tick, onset.note.getAbsoluteX())
          } catch {
            /* playhead can live without this onset */
          }
        }
      }
      if (!anchorMap.has(0)) anchorMap.set(0, noteStart)
      const anchors = [...anchorMap.entries()].map(([tick, ax]) => ({ tick, x: ax })).sort((a, b) => a.tick - b.tick)
      layout.bars.push({
        index: bar.index,
        x,
        width: staveWidth,
        top: top - CHORD_ABOVE_STAFF - 6,
        bottom: top + gap + ROLE_BELOW_BASS + 10 + pad.below,
        anchors,
      })

      // Plan labels: chords above the treble, dynamics + role below the bass.
      const { labelX, chordY, dynamicX, dynamicY, roleY } = sheetLabelLayout(top, gap, x, noteStart, first)
      pen.save()
      pen.textBaseline = 'alphabetic'
      pen.fillStyle = theme.ink
      pen.font = '600 15px "Fraunces", "Academico", Georgia, serif'
      pen.fillText(prettyChord(bar.chordSymbol), labelX, chordY)
      const symbolWidth = pen.measureText(prettyChord(bar.chordSymbol)).width
      pen.fillStyle = theme.accent
      pen.font = '500 11px "JetBrains Mono", ui-monospace, monospace'
      pen.fillText(bar.plan.chord, labelX + symbolWidth + 8, chordY - 1)
      if (bar.split && bar.plan.chord2) {
        // The second harmony, over the first note at or after the split.
        const at = anchors.find((anchor) => anchor.tick >= bar.split!.tick)
        const splitX = Math.max(labelX + symbolWidth + pen.measureText(bar.plan.chord).width + 16, at ? at.x - 4 : x + staveWidth / 2)
        pen.fillStyle = theme.ink
        pen.font = '600 15px "Fraunces", "Academico", Georgia, serif'
        pen.fillText(prettyChord(bar.split.chordSymbol), splitX, chordY)
        const splitWidth = pen.measureText(prettyChord(bar.split.chordSymbol)).width
        pen.fillStyle = theme.accent
        pen.font = '500 11px "JetBrains Mono", ui-monospace, monospace'
        pen.fillText(bar.plan.chord2, splitX + splitWidth + 8, chordY - 1)
      }
      pen.fillStyle = theme.muted
      pen.font = '500 10.5px "JetBrains Mono", ui-monospace, monospace'
      pen.fillText(`${bar.index + 1} · ${bar.plan.role.replace(/_/g, ' ')}`, labelX, roleY)
      if (bar.dynamic !== lastDynamic) {
        pen.fillStyle = theme.ink
        pen.font = 'italic 600 17px "Academico", "Fraunces", Georgia, serif'
        pen.fillText(bar.dynamic, dynamicX, dynamicY)
        lastDynamic = bar.dynamic
      }
      pen.restore()

      x += staveWidth
    })
    systemTop += systemHeight(pad)
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
