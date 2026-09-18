/** Keep the sounding bar in view while playing, until the listener takes the scroll. */

export const FOLLOW_PADDING = 10
/** Smooth `scrollTo` keeps emitting `scroll` events; ignore those for this long. */
export const PROGRAMMATIC_HOLD_MS = 520
/** Ignore tap jitter; a real touch-scroll moves more than this. */
export const TOUCH_CANCEL_PX = 8

export type ScrollBox = {
  scrollTop: number
  clientHeight: number
  scrollHeight: number
}

export type Range = {
  top: number
  bottom: number
}

export function canScrollY(box: { scrollHeight: number; clientHeight: number; overflowY: string }): boolean {
  return (box.overflowY === 'auto' || box.overflowY === 'scroll') && box.scrollHeight > box.clientHeight + 1
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** Target `scrollTop` that reveals `range`, or `null` when nothing should move. */
export function followScrollTop(box: ScrollBox, range: Range, padding = FOLLOW_PADDING): number | null {
  if (box.scrollHeight <= box.clientHeight + 1) return null
  const maxScroll = Math.max(0, box.scrollHeight - box.clientHeight)
  const viewTop = box.scrollTop
  const viewBottom = viewTop + box.clientHeight
  if (range.top >= viewTop + padding && range.bottom <= viewBottom - padding) return null
  if (range.bottom - range.top + padding * 2 >= box.clientHeight) {
    return clamp(range.top - padding, 0, maxScroll)
  }
  if (range.top < viewTop + padding) return clamp(range.top - padding, 0, maxScroll)
  return clamp(range.bottom + padding - box.clientHeight, 0, maxScroll)
}

export function isUserScrollKey(code: string): boolean {
  return code === 'ArrowUp' || code === 'ArrowDown' || code === 'PageUp' || code === 'PageDown' || code === 'Home' || code === 'End'
}

export function isTypingTarget(target: unknown): boolean {
  if (!target || typeof target !== 'object') return false
  const el = target as { tagName?: string; isContentEditable?: boolean }
  if (el.isContentEditable) return true
  return typeof el.tagName === 'string' && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)
}

export function isScrollbarPointer(
  box: { left: number; top: number; clientWidth: number; clientHeight: number; offsetWidth: number; offsetHeight: number },
  point: { x: number; y: number },
): boolean {
  const gutterX = box.offsetWidth - box.clientWidth
  const gutterY = box.offsetHeight - box.clientHeight
  if (gutterX > 0 && point.x >= box.left + box.clientWidth) return true
  if (gutterY > 0 && point.y >= box.top + box.clientHeight) return true
  return false
}

export type FollowSession = {
  following: boolean
  programmaticUntil: number
  enable: () => void
  cancel: () => void
  markProgrammatic: (now: number, holdMs?: number) => void
  isProgrammatic: (now: number) => boolean
  onScroll: (now: number) => void
}

export function createFollowSession(): FollowSession {
  return {
    following: true,
    programmaticUntil: 0,
    enable() {
      this.following = true
    },
    cancel() {
      this.following = false
    },
    markProgrammatic(now, holdMs = PROGRAMMATIC_HOLD_MS) {
      this.programmaticUntil = Math.max(this.programmaticUntil, now + holdMs)
    },
    isProgrammatic(now) {
      return now < this.programmaticUntil
    },
    onScroll(now) {
      if (this.isProgrammatic(now)) return
      this.following = false
    },
  }
}

export function frameScrollBox(el: HTMLElement): ScrollBox {
  return { scrollTop: el.scrollTop, clientHeight: el.clientHeight, scrollHeight: el.scrollHeight }
}

export function documentScrollBox(): ScrollBox {
  const el = document.scrollingElement ?? document.documentElement
  return { scrollTop: window.scrollY, clientHeight: window.innerHeight, scrollHeight: el.scrollHeight }
}

/** Bar box in document content coordinates (CSS pixels from the page top). */
export function barRangeInDocument(frame: HTMLElement, bar: Range): Range {
  const origin = frame.getBoundingClientRect().top + window.scrollY - frame.scrollTop
  return { top: origin + bar.top, bottom: origin + bar.bottom }
}

export function followBehavior(): ScrollBehavior {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
}

export function touchMovedEnough(startY: number | null, currentY: number | null, threshold = TOUCH_CANCEL_PX): boolean {
  if (startY == null || currentY == null) return false
  return Math.abs(currentY - startY) >= threshold
}

/** Next scrollTop to apply, or `null` when follow is off / already in view / already requested. */
export function nextFollowScroll(session: FollowSession, box: ScrollBox, range: Range, lastRequested: number | null): number | null {
  if (!session.following) return null
  const top = followScrollTop(box, range)
  if (top == null || (lastRequested != null && Math.abs(top - lastRequested) < 1)) return null
  return top
}

export function frameCanScroll(frame: HTMLElement): boolean {
  return canScrollY({
    scrollHeight: frame.scrollHeight,
    clientHeight: frame.clientHeight,
    overflowY: getComputedStyle(frame).overflowY,
  })
}

function scrollbarHit(el: HTMLElement, event: PointerEvent): boolean {
  const rect = el.getBoundingClientRect()
  return isScrollbarPointer(
    {
      left: rect.left,
      top: rect.top,
      clientWidth: el.clientWidth,
      clientHeight: el.clientHeight,
      offsetWidth: el.offsetWidth,
      offsetHeight: el.offsetHeight,
    },
    { x: event.clientX, y: event.clientY },
  )
}

/**
 * Wheel / touch / scrollbar / keyboard on the sheet (and, when the page is the
 * scroller, on the document) cancel follow. Programmatic `scroll` is ignored.
 */
export function bindFollowInput(frame: HTMLElement, session: FollowSession, now: () => number = () => performance.now()): () => void {
  let frameTouchY: number | null = null
  let docTouchY: number | null = null
  const onUserIntent = () => session.cancel()
  const onFrameScroll = () => session.onScroll(now())
  const onFramePointer = (event: PointerEvent) => {
    if (scrollbarHit(frame, event)) session.cancel()
  }
  const onFrameKey = (event: KeyboardEvent) => {
    if (isUserScrollKey(event.code)) session.cancel()
  }
  const onFrameTouchStart = (event: TouchEvent) => {
    frameTouchY = event.touches[0]?.clientY ?? null
  }
  const onFrameTouchMove = (event: TouchEvent) => {
    if (touchMovedEnough(frameTouchY, event.touches[0]?.clientY ?? null)) session.cancel()
  }
  const onDocScroll = () => {
    if (!frameCanScroll(frame)) session.onScroll(now())
  }
  const onDocPointer = (event: PointerEvent) => {
    if (frameCanScroll(frame)) return
    const el = (document.scrollingElement ?? document.documentElement) as HTMLElement
    if (scrollbarHit(el, event)) session.cancel()
  }
  const onDocKey = (event: KeyboardEvent) => {
    if (frameCanScroll(frame) || isTypingTarget(event.target) || !isUserScrollKey(event.code)) return
    session.cancel()
  }
  const onDocWheel = () => {
    if (!frameCanScroll(frame)) session.cancel()
  }
  const onDocTouchStart = (event: TouchEvent) => {
    if (frameCanScroll(frame)) return
    docTouchY = event.touches[0]?.clientY ?? null
  }
  const onDocTouchMove = (event: TouchEvent) => {
    if (frameCanScroll(frame)) return
    if (touchMovedEnough(docTouchY, event.touches[0]?.clientY ?? null)) session.cancel()
  }

  const passive = { passive: true } as const
  frame.addEventListener('wheel', onUserIntent, passive)
  frame.addEventListener('touchstart', onFrameTouchStart, passive)
  frame.addEventListener('touchmove', onFrameTouchMove, passive)
  frame.addEventListener('scroll', onFrameScroll, passive)
  frame.addEventListener('pointerdown', onFramePointer)
  frame.addEventListener('keydown', onFrameKey)
  window.addEventListener('wheel', onDocWheel, passive)
  window.addEventListener('touchstart', onDocTouchStart, passive)
  window.addEventListener('touchmove', onDocTouchMove, passive)
  window.addEventListener('scroll', onDocScroll, passive)
  window.addEventListener('pointerdown', onDocPointer)
  window.addEventListener('keydown', onDocKey)

  return () => {
    frame.removeEventListener('wheel', onUserIntent)
    frame.removeEventListener('touchstart', onFrameTouchStart)
    frame.removeEventListener('touchmove', onFrameTouchMove)
    frame.removeEventListener('scroll', onFrameScroll)
    frame.removeEventListener('pointerdown', onFramePointer)
    frame.removeEventListener('keydown', onFrameKey)
    window.removeEventListener('wheel', onDocWheel)
    window.removeEventListener('touchstart', onDocTouchStart)
    window.removeEventListener('touchmove', onDocTouchMove)
    window.removeEventListener('scroll', onDocScroll)
    window.removeEventListener('pointerdown', onDocPointer)
    window.removeEventListener('keydown', onDocKey)
  }
}
