import { useEffect, useRef, useState } from 'react'
import type { AudioEngine } from '../audio/engine'
import { secondsPerTick } from '../render/renderPlan'
import type { Score } from '../render/score'
import { barAt, drawScore, playheadX, sheetFontsReady, type SheetLayout } from '../sheet/drawScore'

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
    let followedTop = -1
    const tickSeconds = secondsPerTick(score)
    const totalTicks = score.bars.length * score.meter.ticksPerBar
    const paint = () => {
      raf = requestAnimationFrame(paint)
      const layout = layoutRef.current
      const position = engine.position()
      clear()
      if (!layout || position == null) return
      const tick = (position / tickSeconds) % totalTicks
      const bar = layout.bars[Math.min(layout.bars.length - 1, Math.floor(tick / score.meter.ticksPerBar))]
      if (!bar) return
      // On phones the frame is a capped scroll box: keep the sounding system in view.
      const frame = frameRef.current
      if (frame && bar.top !== followedTop && frame.scrollHeight > frame.clientHeight + 1) {
        followedTop = bar.top
        frame.scrollTo({ top: Math.max(0, bar.top - 10), behavior: 'smooth' })
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
    <div className="sheet-frame" ref={frameRef}>
      <canvas
        ref={sheetRef}
        className="sheet-canvas"
        aria-label="Sheet music for the generated piece. Click a bar to play from there."
        title="Click a bar to play from there"
        onClick={(event) => {
          const bar = barFromEvent(event)
          if (bar) onSeekBar?.(bar.index)
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
