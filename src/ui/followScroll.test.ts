import { describe, expect, it } from 'vitest'
import {
  PROGRAMMATIC_HOLD_MS,
  canScrollY,
  createFollowSession,
  followScrollTop,
  isScrollbarPointer,
  isTypingTarget,
  isUserScrollKey,
  nextFollowScroll,
  touchMovedEnough,
} from './followScroll'

const viewport = { scrollTop: 0, clientHeight: 400, scrollHeight: 2000 }

describe('canScrollY', () => {
  it('requires overflow auto/scroll and overflowing content', () => {
    expect(canScrollY({ scrollHeight: 800, clientHeight: 400, overflowY: 'auto' })).toBe(true)
    expect(canScrollY({ scrollHeight: 800, clientHeight: 400, overflowY: 'scroll' })).toBe(true)
    expect(canScrollY({ scrollHeight: 800, clientHeight: 400, overflowY: 'hidden' })).toBe(false)
    expect(canScrollY({ scrollHeight: 400, clientHeight: 400, overflowY: 'auto' })).toBe(false)
  })
})

describe('followScrollTop', () => {
  it('returns null when the container cannot scroll', () => {
    expect(followScrollTop({ scrollTop: 0, clientHeight: 400, scrollHeight: 400 }, { top: 40, bottom: 200 })).toBeNull()
  })

  it('returns null when the bar is already fully in view', () => {
    expect(followScrollTop(viewport, { top: 40, bottom: 220 })).toBeNull()
    expect(followScrollTop({ ...viewport, scrollTop: 300 }, { top: 340, bottom: 520 })).toBeNull()
  })

  it('scrolls up to a bar above the viewport', () => {
    expect(followScrollTop({ ...viewport, scrollTop: 400 }, { top: 40, bottom: 220 })).toBe(30)
  })

  it('scrolls down just enough to reveal a bar below the viewport', () => {
    expect(followScrollTop(viewport, { top: 500, bottom: 680 })).toBe(290)
  })

  it('pins the top when the bar is taller than the viewport', () => {
    expect(followScrollTop(viewport, { top: 80, bottom: 900 })).toBe(70)
  })

  it('clamps to the max scroll', () => {
    expect(followScrollTop({ scrollTop: 0, clientHeight: 400, scrollHeight: 450 }, { top: 200, bottom: 480 })).toBe(50)
  })
})

describe('user scroll intent', () => {
  it('treats arrow / page / home / end as scroll keys, not Space', () => {
    expect(isUserScrollKey('ArrowDown')).toBe(true)
    expect(isUserScrollKey('PageUp')).toBe(true)
    expect(isUserScrollKey('Home')).toBe(true)
    expect(isUserScrollKey('End')).toBe(true)
    expect(isUserScrollKey('Space')).toBe(false)
    expect(isUserScrollKey('KeyJ')).toBe(false)
  })

  it('detects a click on the vertical or horizontal scrollbar gutter', () => {
    const box = { left: 0, top: 0, clientWidth: 300, clientHeight: 400, offsetWidth: 315, offsetHeight: 400 }
    expect(isScrollbarPointer(box, { x: 308, y: 40 })).toBe(true)
    expect(isScrollbarPointer(box, { x: 120, y: 40 })).toBe(false)
    const wide = { left: 10, top: 20, clientWidth: 300, clientHeight: 400, offsetWidth: 300, offsetHeight: 416 }
    expect(isScrollbarPointer(wide, { x: 40, y: 430 })).toBe(true)
  })

  it('recognises typing targets so page keys in a field do not cancel', () => {
    expect(isTypingTarget({ tagName: 'INPUT' })).toBe(true)
    expect(isTypingTarget({ tagName: 'TEXTAREA' })).toBe(true)
    expect(isTypingTarget({ tagName: 'DIV', isContentEditable: true })).toBe(true)
    expect(isTypingTarget({ tagName: 'DIV' })).toBe(false)
    expect(isTypingTarget(null)).toBe(false)
  })
})

describe('FollowSession', () => {
  it('starts following and re-enables after a cancel', () => {
    const session = createFollowSession()
    expect(session.following).toBe(true)
    session.cancel()
    expect(session.following).toBe(false)
    session.enable()
    expect(session.following).toBe(true)
  })

  it('ignores scroll events while a programmatic scroll is in flight', () => {
    const session = createFollowSession()
    session.markProgrammatic(1000)
    session.onScroll(1000 + PROGRAMMATIC_HOLD_MS - 1)
    expect(session.following).toBe(true)
    session.onScroll(1000 + PROGRAMMATIC_HOLD_MS + 1)
    expect(session.following).toBe(false)
  })

  it('cancels if scroll moves away from the programmatic target during the hold', () => {
    const session = createFollowSession()
    session.markProgrammatic(1000, PROGRAMMATIC_HOLD_MS, 400)
    session.onScroll(1050, 120)
    expect(session.following).toBe(true)
    session.onScroll(1100, 200)
    expect(session.following).toBe(true)
    session.onScroll(1150, 40)
    expect(session.following).toBe(false)
  })

  it('cancels a jump away from the target on the first observed scroll', () => {
    const session = createFollowSession()
    session.markProgrammatic(1000, PROGRAMMATIC_HOLD_MS, 400, 200)
    session.onScroll(1010, 0)
    expect(session.following).toBe(false)
  })

  it('does not treat leftover motion toward the target as a user cancel', () => {
    const session = createFollowSession()
    session.markProgrammatic(1000, 50, 400)
    session.onScroll(1010, 80)
    session.onScroll(1020, 200)
    expect(session.following).toBe(true)
    session.onScroll(1100, 320)
    expect(session.following).toBe(true)
    expect(session.isProgrammatic(1100)).toBe(true)
  })

  it('stays cancelled after a user scroll even if later scroll is programmatic', () => {
    const session = createFollowSession()
    session.onScroll(0)
    expect(session.following).toBe(false)
    session.markProgrammatic(10)
    session.onScroll(10)
    expect(session.following).toBe(false)
  })

  it('does not propose a scroll after cancel until Play re-enables follow', () => {
    const session = createFollowSession()
    const box = { scrollTop: 0, clientHeight: 400, scrollHeight: 2000 }
    const offscreen = { top: 800, bottom: 980 }
    expect(nextFollowScroll(session, box, offscreen, null)).toBe(590)
    expect(nextFollowScroll(session, box, offscreen, 590)).toBeNull()
    session.cancel()
    expect(nextFollowScroll(session, box, offscreen, null)).toBeNull()
    session.enable()
    expect(nextFollowScroll(session, box, offscreen, null)).toBe(590)
  })
})

describe('touchMovedEnough', () => {
  it('ignores taps and fires once the finger has scrolled', () => {
    expect(touchMovedEnough(100, 104)).toBe(false)
    expect(touchMovedEnough(100, 110)).toBe(true)
    expect(touchMovedEnough(null, 110)).toBe(false)
  })
})
