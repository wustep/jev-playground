// What holds the tune up. Five patterns, where there used to be 23 textures.
//
// The textures were not five times too many because of breadth — they were
// wrong in kind. Each one wrote a melody *and* an accompaniment together, so
// "does the left hand cover the tune" was a question 23 separate files had to
// get right independently, and several didn't. Here the melody is already
// written, and every pattern below is handed its `ceiling`: the lowest note
// the tune sounds. Nothing may cross it. That single argument is most of
// what "the texture supports the tune" means.
//
// `counterline` is the one pattern that is not support. A two-voice invention
// has no accompaniment; it has a second tune, of equal weight and its own
// rhythm. It still sings in a register of its own under the first voice's
// floor, so the ceiling holds for it too — and the test checks all five.

import type { AccompanimentId, CompositionPlan } from '../plan/schema'
import { Note as TonalNote } from 'tonal'
import type { ResolvedChord } from './harmony'
import { clamp, ladder, midiOf, nearestIndex, nearestNote } from './pitch'
import type { PedalId, Voice } from './score'
import { STYLE_VOICES } from './styleVoice'
import { bassFor, essentialTones, leadVoicing, lowBass, stackUp } from './voiceLeading'
import { beatsPerBar, chordAt, note, pieceChoice, scaleAt, type BarView } from './voice'
import type { MelodyBar } from './melody'

/**
 * Everything under the tune goes on the bass staff. The treble staff is the
 * tune's alone, which is what makes `Bar.treble[0]` the melody by
 * construction rather than by luck.
 */
export interface AccompanimentBar {
  bass: Voice[]
}

export interface AccompanimentOptions {
  /** Lowest MIDI the tune sounds this bar. Nothing below may reach it. */
  ceiling: number
  /** 0 bare … 3 full. Derived from the bar's role, not from a plan label. */
  density: 0 | 1 | 2 | 3
  /** A pulse keeps the metre's eighths whatever the density (`StyleVoice.ostinato`). */
  ostinato?: boolean
  /** How far a broken figure spreads (`StyleVoice.reach`). */
  reach?: 'wide'
}

/** A safe top for accompaniment voices: clear of the tune by a comfortable step. */
const headroom = (ceiling: number) => Math.max(40, ceiling - 3)

// ── sustained ───────────────────────────────────────────────────────────────

function sustained(bar: BarView, options: AccompanimentOptions): AccompanimentBar {
  const { meter } = bar
  const top = headroom(options.ceiling)
  const split = bar.chord2 ? meter.splitTick : meter.ticksPerBar
  const spans = bar.chord2 ? [{ start: 0, dur: split }, { start: split, dur: meter.ticksPerBar - split }] : [{ start: 0, dur: meter.ticksPerBar }]
  const bassVoice: Voice = []
  const chordVoice: Voice = []
  for (const span of spans) {
    const chord = chordAt(bar, span.start)
    const low = lowBass(chord, bar.memory.bass, 45, Math.min(33, top - 24), Math.min(52, top - 12))
    bar.memory.bass = low
    bassVoice.push(note(span.start, span.dur, withOctave(low, options.density), bar.velocity - 6))
    if (options.density === 0) continue
    const size = options.density >= 3 ? 4 : options.density >= 2 ? 3 : 2
    const voicing = leadVoicing(essentialTones(chord, size), bar.memory.voicing, Math.min(top - 6, midiOf(low) + 16))
    const capped = voicing.filter((pitch) => midiOf(pitch) < top)
    if (capped.length) {
      bar.memory.voicing = capped
      chordVoice.push(note(span.start, span.dur, capped, bar.velocity - 12))
    }
  }
  return { bass: chordVoice.length ? [bassVoice, chordVoice] : [bassVoice] }
}

// ── parts: held harmony as four-part writing ────────────────────────────────

const mod12 = (n: number) => ((n % 12) + 12) % 12
const chromaOf = (pc: string) => TonalNote.chroma(pc) ?? -1

/** Octaves or fifths between the tune and the bass, reached in similar motion. */
function parallel(from: { s: number; b: number } | undefined, s: number | undefined, b: number): boolean {
  if (!from || s === undefined || s === from.s || b === from.b) return false
  const interval = mod12(s - b)
  return (interval === 0 || interval === 7) && interval === mod12(from.s - from.b) && Math.sign(s - from.s) === Math.sign(b - from.b)
}

/** Steps are how a bass line moves; a repeated or leaping bass is a last resort. */
function moveCost(from: number | undefined, to: number): number {
  if (from === undefined) return 0
  const move = Math.abs(to - from)
  return move === 0 ? 2 : move <= 2 ? 0 : move <= 4 ? 0.5 : move <= 7 ? 1.5 : 3
}

/**
 * Tenor and alto for one strike: the tones the tune and bass leave out,
 * with a doubling where a triad leaves only one — the root, else the fifth,
 * else the third, never the leading tone. Between the bass and `top`, each as
 * near to where it was as it can be, tenor within an octave of the alto and
 * the alto, where it can be, within an octave of the tune.
 */
function innerVoices(tones: readonly string[], s: number | undefined, b: number, previous: readonly string[] | undefined, top: number, leadingTone: number): string[] {
  const covered = new Set([mod12(b), ...(s === undefined ? [] : [mod12(s)])])
  let needed = tones.filter((pc) => !covered.has(chromaOf(pc)))
  if (needed.length > 2) needed = needed.filter((pc) => pc !== tones[2]).slice(0, 2)
  const diminished = tones.length === 3 && mod12(chromaOf(tones[2]) - chromaOf(tones[0])) === 6
  const doublings = needed.length >= 2 ? [] : (diminished ? [tones[1]] : [tones[0], tones[2], tones[1]]).filter((pc) => chromaOf(pc) !== leadingTone)
  const pairs = doublings.length ? doublings.flatMap((pc) => [[needed[0] ?? pc, pc], [pc, needed[0] ?? pc]]) : needed.length === 2 ? [needed, [needed[1], needed[0]]] : [[needed[0], undefined]]
  const [prevTenor, prevAlto] = previous?.length === 2 ? previous.map(midiOf) : [undefined, undefined]
  const reach = s ?? top
  let best: string[] = []
  let bestCost = Infinity
  for (const [upper, lower] of pairs) {
    if (!upper) continue
    const near = ladder([upper], Math.max(b + 3, reach - 12), top)
    const altos = near.length ? near : ladder([upper], b + 3, top)
    if (!altos.length) continue
    const alto = altos[nearestIndex(altos, prevAlto ?? reach - 5)]
    const tenors = lower ? ladder([lower], Math.max(b + 3, midiOf(alto) - 12), midiOf(alto) - 1) : []
    const tenor = tenors.length ? tenors[nearestIndex(tenors, prevTenor ?? midiOf(alto) - 5)] : undefined
    const voiced = tenor ? [tenor, alto] : [alto]
    const gap = Math.max(0, reach - midiOf(alto) - 12)
    const cost = (lower && !tenor ? 20 : 0) + gap + Math.abs(midiOf(alto) - (prevAlto ?? reach - 5)) + (tenor ? Math.abs(midiOf(tenor) - (prevTenor ?? midiOf(alto) - 5)) : 0)
    if (cost < bestCost) {
      best = voiced
      bestCost = cost
    }
  }
  return best
}

/**
 * Held harmony for a style whose keyboard has no pad (`StyleVoice.held`):
 * bass, tenor and alto strike with the tune on every beat it strikes, as a
 * chorale moves, and hold where it holds.
 *
 * Each strike carries the note the tune sings over it. Where that note is a
 * tone of the bar's chord, the chord is voiced again and the bass takes the
 * root or third, whichever steps. Where it is a passing note, the bass steps
 * to a triad of the scale that holds it — I–V6–I under 3̂–2̂–1̂ — or, with no
 * such step, the parts hold under it. A bass a third from the next strike
 * passes through the step between on the half-beat. A bass chosen here
 * never moves in octaves or fifths with the tune.
 *
 * The downbeat and a second harmony take the label's own bass, so an
 * inversion or a pedal it names is kept.
 */
function parts(bar: BarView, options: AccompanimentOptions, melody: MelodyBar): AccompanimentBar {
  const { meter } = bar
  const top = options.ceiling - 1
  const lo = Math.min(38, top - 24)
  const hi = Math.min(55, top - 10)
  const middle = (lo + hi) / 2
  const tune = melody.notes
  const leadingTone = mod12(chromaOf(bar.key.tonic) - 1)
  const strikes: number[] = []
  for (let tick = 0; tick < meter.ticksPerBar; tick += meter.beatTicks) {
    if (tick === 0 || (bar.chord2 && tick === meter.splitTick) || tune.some((n) => n.start === tick && !n.tied)) strikes.push(tick)
  }

  let bass = bar.memory.bass ? midiOf(bar.memory.bass) : undefined
  let earlier: number | undefined
  let voicing = bar.memory.voicing
  const before = bar.memory.melody[bar.index - 1]
  let pair = before?.pitches.length && bass !== undefined ? { s: midiOf(before.pitches[before.pitches.length - 1]), b: bass } : undefined
  const events: { tick: number; low: string; inner: string[] }[] = []
  // A bass that rocks between two notes is not a line: going back to the
  // note before last is dearer than any other step or third.
  const walk = (b: number) => moveCost(bass, b) + (b === earlier && b !== bass ? 1 : 0)

  strikes.forEach((tick, k) => {
    const chord = chordAt(bar, tick)
    const sung = tune.find((n) => n.start <= tick && n.start + n.dur > tick)
    const s = sung ? midiOf(sung.pitches[0]) : undefined
    // A tune note a minor seventh over a triad's root makes it a seventh chord.
    const seventh = s !== undefined && chord.core.length === 3 && mod12(s - chromaOf(chord.root)) === 10 ? TonalNote.pitchClass(sung!.pitches[0]) : undefined
    const heard = s === undefined || seventh !== undefined || chord.pcs.some((pc) => chromaOf(pc) === mod12(s))
    const change = tick === 0 || (bar.chord2 !== undefined && tick === meter.splitTick)
    // A first inversion names only where the bass starts; a pedal, a six-four
    // or a seventh in the bass names where it stays.
    const pinned = chord.fixedBass && chromaOf(chord.bass) !== chromaOf(chord.pcs[1])
    let tones: readonly string[] = seventh ? [...chord.core, seventh] : chord.core
    let low: string | undefined
    if (change || (heard && pinned)) {
      low = nearestNote([chord.bass], bass ?? middle, lo, hi)
    } else if (heard) {
      const third = mod12(chromaOf(chord.pcs[1]) - chromaOf(chord.root))
      const diminished = chord.core.length === 3 && mod12(chromaOf(chord.core[2]) - chromaOf(chord.root)) === 6
      const pcs = third !== 3 && third !== 4 ? [chord.root] : diminished ? [chord.pcs[1]] : [chord.root, chord.pcs[1]]
      const next = strikes[k + 1] === undefined ? bar.next : strikes[k + 1] === meter.splitTick ? bar.chord2 : undefined
      const target = next ? midiOf(nearestNote([next.bass], bass ?? middle, lo, hi)) : undefined
      const doubled = (b: number) => (s === undefined || mod12(b) !== mod12(s) ? 0 : mod12(b) === chromaOf(chord.root) ? 0.3 : 1)
      const cost = (b: number) => walk(b) + (parallel(pair, s, b) ? 10 : 0) + doubled(b) + (target !== undefined && Math.abs(b - target) > 2 ? 0.5 : 0)
      low = pcs.map((pc) => nearestNote([pc], bass ?? middle, lo, hi)).reduce((best, pitch) => (cost(midiOf(pitch)) < cost(midiOf(best)) ? pitch : best))
    } else if (!pinned && s !== undefined) {
      const scale = scaleAt(bar, tick)
      let bestCost = 2
      for (let d = 0; scale.length === 7 && d < 7; d++) {
        const triad = [scale[d], scale[(d + 2) % 7], scale[(d + 4) % 7]]
        const fifth = mod12(chromaOf(triad[2]) - chromaOf(triad[0]))
        if (fifth === 8 || !triad.some((pc) => chromaOf(pc) === mod12(s))) continue
        // A diminished triad passes only in first inversion: vii°6.
        for (const pc of fifth === 6 ? [triad[1]] : [triad[0], triad[1]]) {
          const b = nearestNote([pc], bass ?? middle, lo, hi)
          const cost = walk(midiOf(b)) + (parallel(pair, s, midiOf(b)) ? 10 : 0) + (mod12(midiOf(b)) === mod12(s) ? 1.5 : 0)
          if (cost < bestCost) {
            bestCost = cost
            low = b
            tones = triad
          }
        }
      }
    }
    if (!low) return
    const b = midiOf(low)
    const inner = options.density === 0 ? [] : innerVoices(tones, s, b, voicing, top, leadingTone)
    events.push({ tick, low, inner })
    earlier = bass
    bass = b
    pair = s === undefined ? pair : { s, b }
    if (inner.length === 2) voicing = inner
  })

  const half = meter.beatTicks / 2
  const lowLine: Voice = []
  const innerLine: Voice = []
  events.forEach((event, k) => {
    const end = events[k + 1]?.tick ?? meter.ticksPerBar
    const from = midiOf(event.low)
    const onward = events[k + 1] ? midiOf(events[k + 1].low) : !bar.position.phraseFinal && bar.next ? midiOf(nearestNote([bar.next.bass], from, lo, hi)) : undefined
    const leap = onward === undefined ? 0 : Math.abs(onward - from)
    const between = meter.beatTicks === 4 && end - event.tick === meter.beatTicks && leap >= 3 && leap <= 4 ? ladder(scaleAt(bar, event.tick + half), Math.min(from, onward!) + 1, Math.max(from, onward!) - 1) : []
    const held = lowLine[lowLine.length - 1]
    // The bass holds a note it would strike again; the voices above it still move.
    if (held && held.pitches[0] === event.low && held.start + held.dur === event.tick && !between.length) held.dur = end - held.start
    else if (between.length === 1) lowLine.push(note(event.tick, half, event.low, bar.velocity - 6), note(event.tick + half, half, between[0], bar.velocity - 10))
    else lowLine.push(note(event.tick, end - event.tick, event.low, bar.velocity - 6))
    if (event.inner.length) innerLine.push(note(event.tick, end - event.tick, event.inner, bar.velocity - 12))
  })
  if (lowLine.length) bar.memory.bass = lowLine[lowLine.length - 1].pitches[0]
  if (voicing) bar.memory.voicing = voicing
  return { bass: [innerLine, lowLine].filter((voice) => voice.length) }
}

// ── broken ──────────────────────────────────────────────────────────────────

/** Orders a broken chord can be spread in, low to high and back. */
const BREAK_SHAPES = [
  [0, 1, 2, 1],
  [0, 2, 1, 2],
  [0, 1, 2, 3],
  [0, 2, 3, 2],
]

const rotations = (tones: readonly string[]) => tones.map((_, inversion) => [...tones.slice(inversion), ...tones.slice(0, inversion)])

/**
 * `count` of the chord's tones stacked from `from` in whichever inversion
 * fits under `top` — fewer only if none does, and a seventh chord then
 * gives up its fifth and root before its third and seventh. Under a low
 * tune a root-first stack crosses the tune's floor, and a tone that cannot
 * sound is a hole in the figure.
 */
function stackUnder(chord: ResolvedChord, count: number, from: number, top: number): string[] {
  const all = essentialTones(chord, count)
  for (let size = all.length; size >= 1; size--) {
    const preferred = chord.core.length > 3 ? rotations(essentialTones(chord, size)) : []
    for (const order of [...preferred, ...rotations(all).map((order) => order.slice(0, size))]) {
      const stack = stackUp(order, from)
      if (midiOf(stack[stack.length - 1]) < top) return stack
    }
  }
  return []
}

/**
 * The chord spread open over its bass, from the fifth to the tenth and past
 * it where the tune leaves room: 1, 5, 10, 15 over a triad (1, 5, 10, 14
 * over a seventh chord), else 1, 5, 8, 10 (1, 5, 7, 10). Each tone sits at
 * least a third over the one before. Undefined where the label fixes the
 * bass or not even the tenth fits under `top`.
 */
function openOver(chord: ResolvedChord, bass: number, top: number): string[] | undefined {
  if (chord.fixedBass) return undefined
  const [root, third, fifth, seventh] = chord.core
  const spread = (order: readonly string[]) => {
    const out: string[] = []
    let floor = bass + 5
    for (const pc of order) {
      const [pitch] = ladder([pc], floor, Math.min(top - 1, floor + 11))
      if (!pitch) return undefined
      out.push(pitch)
      floor = midiOf(pitch) + 3
    }
    return out
  }
  return spread([fifth, third, seventh ?? root]) ?? spread([fifth, seventh ?? root, third])
}

function broken(bar: BarView, options: AccompanimentOptions): AccompanimentBar {
  const { meter } = bar
  const top = headroom(options.ceiling)
  // An eighth-note stream in every metre — half a simple beat, a third of a
  // compound one: continuous under the tune without outrunning it.
  const step = 2
  const shape = BREAK_SHAPES[pieceChoice(bar.memory, bar.rand, 'break', BREAK_SHAPES.length)]
  const played = [...new Set(shape)].sort((a, b) => a - b)
  const voice: Voice = []
  const bassVoice: Voice = []
  let previousBass: string | undefined = bar.memory.bass
  for (let tick = 0; tick < meter.ticksPerBar; tick += step) {
    const chord = chordAt(bar, tick)
    const k = Math.floor(tick / step)
    if (tick === 0 || (bar.chord2 && tick === meter.splitTick)) {
      // The deep bass note under the figuration, on each new harmony.
      const low = lowBass(chord, previousBass, 43, Math.min(31, top - 26), Math.min(50, top - 14))
      previousBass = low
      bar.memory.bass = low
      const dur = bar.chord2 ? meter.splitTick : meter.ticksPerBar
      bassVoice.push(note(tick, tick === 0 ? dur : meter.ticksPerBar - tick, low, bar.velocity - 4))
    }
    if (options.density === 0 && tick % meter.beatTicks !== 0) continue
    // A shape that plays three places of a four-note chord plays the three
    // tones that name it, in its own order. Over all four stacked, the place
    // it skipped could be the seventh: a ii7 or a V7 broken as a triad.
    const open = options.reach === 'wide' && previousBass ? openOver(chord, midiOf(previousBass), top) : undefined
    const compact = (open !== undefined || chord.core.length > 3) && played.length < 4
    const stack = open ?? stackUnder(chord, compact ? played.length : 4, Math.max(midiOf(previousBass ?? 'C3') + 7, top - 22), top)
    const place = compact ? played.indexOf(shape[k % shape.length]) : shape[k % shape.length]
    const pick = stack[place % stack.length] ?? stack[0]
    if (!pick || midiOf(pick) >= top) continue
    voice.push(note(tick, step, pick, bar.velocity - 16 + (tick % meter.beatTicks === 0 ? 5 : 0)))
  }
  return { bass: [bassVoice, voice].filter((v) => v.length) }
}

// ── pulse ───────────────────────────────────────────────────────────────────

function pulse(bar: BarView, options: AccompanimentOptions): AccompanimentBar {
  const { meter } = bar
  const top = headroom(options.ceiling)
  const step = options.ostinato ? 2 : options.density >= 2 ? Math.max(2, meter.beatTicks / 2) : meter.beatTicks
  const voice: Voice = []
  const bassVoice: Voice = []
  let previousBass: string | undefined = bar.memory.bass
  for (let tick = 0; tick < meter.ticksPerBar; tick += step) {
    const chord = chordAt(bar, tick)
    if (tick === 0 || (bar.chord2 && tick === meter.splitTick)) {
      const low = lowBass(chord, previousBass, 43, Math.min(31, top - 26), Math.min(50, top - 14))
      previousBass = low
      bar.memory.bass = low
      bassVoice.push(note(tick, bar.chord2 ? meter.splitTick : meter.ticksPerBar, withOctave(low, options.density), bar.velocity - 4))
    }
    const size = options.density >= 3 ? 3 : 2
    const voicing = leadVoicing(essentialTones(chord, size, { rootless: true }), bar.memory.voicing, top - 10).filter((pitch) => midiOf(pitch) < top)
    if (!voicing.length) continue
    bar.memory.voicing = voicing
    // The pulse leans on the downbeat and stays even after it — that evenness is the point.
    voice.push(note(tick, Math.max(1, step - (step > 2 ? 1 : 0)), voicing, bar.velocity - (tick === 0 ? 10 : 18)))
  }
  return { bass: [bassVoice, voice].filter((v) => v.length) }
}

// ── stride ──────────────────────────────────────────────────────────────────

/**
 * The bass a stride answers itself with on the half-bar of a four-beat bar:
 * the chord's fifth, nearest the bass it struck on one — or, where the label
 * fixes the bass (an inversion, a pedal), that bass again.
 */
function alternateBass(chord: ResolvedChord, struck: string, lo: number, hi: number): string {
  return chord.fixedBass ? struck : nearestNote([chord.core[2]], midiOf(struck), lo, hi)
}

function stride(bar: BarView, options: AccompanimentOptions): AccompanimentBar {
  const { meter } = bar
  const top = headroom(options.ceiling)
  const beats = beatsPerBar(meter)
  const lo = Math.min(31, top - 28)
  const hi = Math.min(50, top - 16)
  const bassVoice: Voice = []
  const chordVoice: Voice = []
  for (let beat = 0; beat < beats; beat++) {
    const tick = beat * meter.beatTicks
    const chord = chordAt(bar, tick)
    const arrives = beat === 0 || (bar.chord2 && tick === meter.splitTick)
    // In four, bass and chord take turns: a stride, a march and a two-feel
    // ballad all go bass, chord, bass, chord — not the waltz's bass, chord,
    // chord with a beat added. The barest bar keeps its rest on three.
    const answers = !arrives && beats === 4 && tick === meter.splitTick && options.density > 0 && bar.memory.bass !== undefined
    if (arrives || answers) {
      const low = arrives ? bassFor(chord, bar.memory.bass, { lo, hi, allowInversion: !bar.isLast && bar.index > 0 }) : alternateBass(chord, bar.memory.bass!, lo, hi)
      bar.memory.bass = low
      bassVoice.push(note(tick, meter.beatTicks, withOctave(low, options.density), bar.velocity - (arrives ? 0 : 6)))
      continue
    }
    if (options.density === 0 && beat % 2 === 0) continue
    const size = options.density >= 3 ? 4 : 3
    const voicing = leadVoicing(essentialTones(chord, size), bar.memory.voicing, top - 12).filter((pitch) => midiOf(pitch) < top)
    if (!voicing.length) continue
    bar.memory.voicing = voicing
    chordVoice.push(note(tick, Math.max(1, meter.beatTicks - 1), voicing, bar.velocity - 16))
  }
  return { bass: [bassVoice, chordVoice].filter((v) => v.length) }
}

// ── counterline ─────────────────────────────────────────────────────────────

/**
 * Not an accompaniment: a second tune, a register below the first.
 *
 * Two-voice counterpoint is clear when the ear can hear that the second voice
 * is *answering* the first, so this does what an invention does:
 *
 *   • The piece's first bar exposes the subject alone. The second voice
 *     waits; a lone low tonic is all that sounds under it.
 *   • The bar after a fresh statement answers it: the same figure, the same
 *     rhythm, an octave lower, re-fitted to this bar's harmony — while the
 *     tune moves on to something new above it.
 *   • Elsewhere it runs free, mostly in contrary motion, moving where the
 *     tune holds and holding where it moves.
 *
 * An earlier version only ever ran free, so an invention came out as two
 * unrelated lines rather than a subject and its answer.
 */
function counterline(bar: BarView, options: AccompanimentOptions, melody: MelodyBar): AccompanimentBar {
  const { meter } = bar
  const hi = Math.min(options.ceiling - 2, 67)
  const lo = hi - 19
  const bassUnder = (): Voice => {
    const top = Math.max(40, lo - 5)
    const low = lowBass(bar.chord, bar.memory.bass, top - 6, top - 12, top)
    bar.memory.bass = low
    return [note(0, meter.ticksPerBar, low, bar.velocity - 14)]
  }

  // The subject, alone.
  if (bar.index === 0) return { bass: [bassUnder()] }

  // The answer, if the bar before stated something new.
  const previous = bar.memory.melody[bar.index - 1]
  const statedFreshly = bar.index === 1 || (bar.position.phrase > 0 && bar.index % 4 === 1)
  if (previous && statedFreshly && previous.pitches.length > 1) {
    const rungs = ladder(bar.scale, lo - 12, hi)
    if (rungs.length) {
      const answer: Voice = []
      previous.slots.forEach((slot, k) => {
        const chord = chordAt(bar, slot.start)
        const strong = slot.start % meter.beatTicks === 0
        let midi = midiOf(previous.pitches[k]) - 12
        while (midi > hi) midi -= 12
        while (midi < lo) midi += 12
        const pool = strong ? ladder(chord.core, lo, hi) : ladder(scaleAt(bar, slot.start), lo, hi)
        if (!pool.length) return
        answer.push(note(slot.start, slot.dur, pool[nearestIndex(pool, midi)], bar.velocity - 6))
      })
      if (answer.length) {
        bar.memory.counterLast = midiOf(answer[answer.length - 1].pitches[0])
        return { bass: options.density >= 2 ? [answer, bassUnder()] : [answer] }
      }
    }
  }

  // Free counterpoint.
  const step = melody.notes.length <= beatsPerBar(meter) ? Math.max(1, meter.beatTicks / 2) : meter.beatTicks
  const voice: Voice = []
  let last = bar.memory.counterLast ?? (lo + hi) / 2
  for (let tick = 0; tick < meter.ticksPerBar; tick += step) {
    const chord = chordAt(bar, tick)
    const strong = tick % meter.beatTicks === 0
    const rungs = ladder(strong ? chord.core : scaleAt(bar, tick), lo, hi)
    if (!rungs.length) continue
    // Contrary motion against the tune's direction at this moment.
    const heard = melody.notes.filter((n) => n.start <= tick)
    const heading = heard.length >= 2 ? Math.sign(midiOf(heard[heard.length - 1].pitches[0]) - midiOf(heard[heard.length - 2].pitches[0])) : 0
    let index = nearestIndex(rungs, clamp(last - heading * 2, lo, hi))
    if (midiOf(rungs[index]) === last && rungs.length > 1) index = clamp(index + (heading >= 0 ? -1 : 1), 0, rungs.length - 1)
    last = midiOf(rungs[index])
    voice.push(note(tick, step, rungs[index], bar.velocity - 8))
  }
  bar.memory.counterLast = last
  return { bass: options.density >= 2 ? [voice, bassUnder()] : [voice] }
}

// ── the dispatcher ──────────────────────────────────────────────────────────

const PATTERNS: Record<AccompanimentId, (bar: BarView, options: AccompanimentOptions, melody: MelodyBar) => AccompanimentBar> = {
  sustained,
  broken,
  pulse,
  stride,
  counterline,
}

/** Sustain that suits each pattern. Not a plan field: the pattern decides. */
export const PEDAL_FOR: Record<AccompanimentId, PedalId> = {
  sustained: 'half',
  broken: 'full',
  pulse: 'half',
  stride: 'half',
  counterline: 'dry',
}

const inParts = (plan: CompositionPlan) => plan.accompaniment === 'sustained' && STYLE_VOICES[plan.style].held === 'parts'

/** The pedal a plan's accompaniment is played with. Parts moving on every beat are played dry, or each chord blurs into the next. */
export const pedalFor = (plan: CompositionPlan): PedalId => (inParts(plan) ? 'dry' : PEDAL_FOR[plan.accompaniment])

/**
 * Accompaniment density from the bar's role. The old schema asked a planner
 * for an `arrangement` label and then measured that it changed no melody
 * outcome and, on one texture, no left-hand outcome either. The shape it was
 * reaching for is this: thin under a first statement, full at the peak.
 */
export function densityFor(bar: BarView): 0 | 1 | 2 | 3 {
  const byRole = ((): number => {
    switch (bar.position.role) {
      case 'climax':
        return 3
      case 'cadence':
        return bar.isLast ? 3 : 2
      case 'half_cadence':
        return 1
      case 'statement':
        return bar.position.returnsFrom === undefined ? 1 : 2
      case 'contrast':
        return 1
      default:
        return 2
    }
  })()
  // Loudness fills the texture out, softness thins it. `velocity` already
  // carries the plan's dynamic level and shape, so a crescendo builds a
  // fuller accompaniment as well as a louder one — which is most of what a
  // build is — without a separate label to ask for it.
  const byLevel = bar.velocity >= 88 ? 1 : bar.velocity <= 48 ? -1 : 0
  return Math.max(0, Math.min(3, byRole + byLevel)) as 0 | 1 | 2 | 3
}

/**
 * The bass doubled an octave down, at full density — the weight a climax or
 * the top of a build puts under the harmony. Skipped where the octave would
 * fall off the bottom of the piano's useful range.
 */
function withOctave(bass: string, density: number): string[] {
  if (density < 3 || midiOf(bass) - 12 < 28) return [bass]
  return [TonalNote.transpose(bass, '-8P'), bass]
}

/**
 * `lastSung` is the tune's last sounding MIDI before this bar. It is passed in
 * rather than read from `bar.memory.melodyLast`, because by the time anything
 * is accompanied the melody pass has finished, and that field holds the
 * piece's final note, not this bar's neighbour.
 */
export function writeAccompaniment(plan: CompositionPlan, bar: BarView, melody: MelodyBar, lastSung: number | undefined): AccompanimentBar {
  // With no tune sounding this bar, the accompaniment keeps its own company
  // under where the tune last was, so a rest is a rest and not a hole.
  const ceiling = melody.floor ?? (lastSung ?? 72) - 2
  const { ostinato, reach } = STYLE_VOICES[plan.style]
  const options = { ceiling, density: densityFor(bar), ostinato, reach }
  return (inParts(plan) ? parts : PATTERNS[plan.accompaniment])(bar, options, melody)
}
