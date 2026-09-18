import { useEffect, useRef, useState } from 'react'
import type { AudioEngine } from '../audio/engine'
import { secondsPerTick } from '../render/renderPlan'
import type { Score } from '../render/score'
import { barAt, drawScore, playheadX, sheetFontsReady, type SheetLayout } from '../sheet/drawScore'
import {
  barRangeInDocument,
  bindFollowInput,
  createFollowSession,
  documentScrollBox,
  followBehavior,
  followInsets,
  frameCanScroll,
  frameScrollBox,
  nextFollowScroll,
  stickyChromeHeight,
} from './followScroll'

interface Props {
  score: Score
  engine: AudioEngine
  playing: boolean
  accent: string
  /** A bar was clicked: play (or keep playing) from its start. */
  onSeekBar?: (index: number) => void
}

const INK = '#16161a'
const MUTED = '#7a756b'

/**
 * Two stacked canvases: VexFlow paints the notation once per score/resize;
 * a transparent overlay repaints the playhead every frame from the audio clock.
 */
export function SheetView({ score, engine, playing, accent, onSeekBar }: Props) {
  const frameRef = useRef<HTMLDivElement>(null)
  const sheetRef = useRef<HTMLCanvasElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)
  const layoutRef = useRef<SheetLayout | null>(null)
  const followRef = useRef(createFollowSession())
  /** Last programmatic scrollTop; cleared whenever follow starts again (Play or seek). */
  const followRequestedRef = useRef<number | null>(null)
  const [width, setWidth] = useState(0)
  const [fontsReady, setFontsReady] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void sheetFontsReady().then(() => !cancelled && setFontsReady(true))
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const frame = frameRef.current
    if (!frame) return
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)))
    observer.observe(frame)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const canvas = sheetRef.current
    const overlay = overlayRef.current
    if (!canvas || !overlay || !fontsReady || width < 200) return
    try {
      const layout = drawScore(canvas, score, width, { ink: INK, muted: MUTED, accent })
      layoutRef.current = layout
      const dpr = window.devicePixelRatio || 1
      overlay.width = Math.round(layout.width * dpr)
      overlay.height = Math.round(layout.height * dpr)
      overlay.style.width = `${layout.width}px`
      overlay.style.height = `${layout.height}px`
      setError(null)
    } catch (cause) {
      layoutRef.current = null
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }, [score, width, fontsReady, accent])

  const beginFollow = () => {
    followRef.current.enable()
    followRequestedRef.current = null
  }

  // Play (false→true) and a measure-click seek both start a new follow session.
  // Manual scroll cancels until the next Play or seek.
  useEffect(() => {
    if (playing) beginFollow()
  }, [playing])

  useEffect(() => {
    const frame = frameRef.current
    if (!frame || !playing) return
    return bindFollowInput(frame, followRef.current)
  }, [playing])

  useEffect(() => {
    const overlay = overlayRef.current
    const pen = overlay?.getContext('2d')
    if (!overlay || !pen) return
    const clear = () => {
      pen.setTransform(1, 0, 0, 1, 0, 0)
      pen.clearRect(0, 0, overlay.width, overlay.height)
    }
    if (!playing) {
      clear()
      return
    }
    let raf = 0
    const tickSeconds = secondsPerTick(score)
    const totalTicks = score.bars.length * score.meter.ticksPerBar
    const follow = followRef.current
    const paint = () => {
      raf = requestAnimationFrame(paint)
      const layout = layoutRef.current
      const position = engine.position()
      clear()
      if (!layout || position == null) return
      // No modulo: when looping the engine already reports a wrapped position, and
      // when not, the end of the piece must stay the end (it used to snap back to bar 1).
      const tick = Math.min(position / tickSeconds, totalTicks - 0.001)
      const bar = layout.bars[Math.min(layout.bars.length - 1, Math.floor(tick / score.meter.ticksPerBar))]
      if (!bar) return
      const frame = frameRef.current
      if (frame) {
        const useFrame = frameCanScroll(frame)
        const box = useFrame ? frameScrollBox(frame) : documentScrollBox()
        const range = useFrame ? bar : barRangeInDocument(frame, bar)
        const chromeTop = useFrame ? 0 : stickyChromeHeight(frame)
        const top = nextFollowScroll(follow, box, range, followRequestedRef.current, followInsets(box.clientHeight, window.innerWidth, chromeTop))
        if (top != null) {
          followRequestedRef.current = top
          follow.markProgrammatic(performance.now(), undefined, top, useFrame ? frame.scrollTop : window.scrollY)
          if (useFrame) frame.scrollTo({ top, behavior: followBehavior() })
          else window.scrollTo({ top, behavior: followBehavior() })
        }
      }
      const dpr = window.devicePixelRatio || 1
      pen.setTransform(dpr, 0, 0, dpr, 0, 0)
      pen.fillStyle = `${accent}14`
      pen.fillRect(bar.x, bar.top, bar.width, bar.bottom - bar.top)
      const x = playheadX(bar, tick - bar.index * score.meter.ticksPerBar, score.meter.ticksPerBar)
      pen.fillStyle = accent
      pen.fillRect(x - 1, bar.top, 2, bar.bottom - bar.top)
    }
    raf = requestAnimationFrame(paint)
    return () => {
      cancelAnimationFrame(raf)
      clear()
    }
  }, [playing, score, engine, accent])

  const barFromEvent = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const layout = layoutRef.current
    if (!layout) return undefined
    const box = event.currentTarget.getBoundingClientRect()
    return barAt(layout, event.clientX - box.left, event.clientY - box.top)
  }

  return (
    <div className="sheet-frame" ref={frameRef} tabIndex={-1}>
      <canvas
        ref={sheetRef}
        className="sheet-canvas"
        aria-label="Sheet music for the generated piece. Click a bar to play from there."
        title="Click a bar to play from there"
        onClick={(event) => {
          const bar = barFromEvent(event)
          if (bar) {
            beginFollow()
            onSeekBar?.(bar.index)
          }
        }}
        onMouseMove={(event) => {
          event.currentTarget.style.cursor = barFromEvent(event) ? 'pointer' : 'default'
        }}
      />
      <canvas ref={overlayRef} className="sheet-overlay" aria-hidden="true" />
      {!fontsReady && <p className="sheet-note">Loading music fonts…</p>}
      {error && <p className="sheet-note sheet-error">Couldn’t engrave this score: {error}</p>}
    </div>
  )
}
