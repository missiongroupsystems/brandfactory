'use client'

import type * as React from 'react'

/**
 * The timeline's drag, by pointer: a mouse lifts an item once it has moved a few pixels, a
 * finger after a short press. A copy of the item lifts and follows the pointer along the line,
 * the item's own box stays behind as a soft slot, and the others make way (`useSortable`). The
 * line scrolls while the pointer is held near either end. A release settles the copy into the
 * slot; Escape, or the finger scrolling instead, puts everything back.
 *
 * The browser's own drag is never used: no detached image of the label, no selected text.
 */

type Point = { x: number; y: number }

export interface LineDrag {
  /** What lifts and travels: the clip, or the whole group when its label is pressed. */
  source: HTMLElement
  /** The line that scrolls, for the autoscroll near its ends and the hit test's vertical bounds. */
  scroller: HTMLElement | null
  /** A clip stays inside its group: the row's box, read as needed. Absent for a group. */
  bounds?: () => DOMRect | null
  /** How far the lifted copy scales up; nothing under reduced motion. */
  scale: number
  start: () => void
  /** The `data-drop` key under the (clamped) point, at that point. */
  over: (key: string | null, at: Point) => void
  end: (commit: boolean) => void
}

/** A finger's press this long lifts; a drift this far first is a scroll. */
const HOLD_MS = 320
const SLOP = 8
/** A mouse lifts once it has moved this far. */
const MOUSE_SLOP = 4
/** The pointer this close to the line's end scrolls it, up to this many px a frame. */
const EDGE = 64
const MAX_STEP = 14
/** The lifted copy's halo, and how long it takes to settle. */
const PAD = 8
const SETTLE_MS = 220
const EASE = 'cubic-bezier(0.2, 0.8, 0.2, 1)'

let lifted = false

// A finger that holds an item must not scroll the page: only a listener from before the touch
// began can refuse it.
if (typeof document !== 'undefined') {
  document.addEventListener(
    'touchmove',
    (e) => {
      if (lifted) e.preventDefault()
    },
    { passive: false },
  )
}

const reducedMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

const raf = (fn: () => void) =>
  typeof requestAnimationFrame === 'function' ? requestAnimationFrame(fn) : setTimeout(fn, 16)

export function startLineDrag(e: React.PointerEvent<HTMLElement>, on: LineDrag) {
  // One drag at a time: a finger while a mouse holds something is not a second drag.
  if (lifted || e.isPrimary === false) return
  const touch = e.pointerType === 'touch'
  if (!touch && e.button) return
  const id = e.pointerId
  const origin = { x: e.clientX, y: e.clientY }
  const { source } = on
  const still = reducedMotion()
  let ghost: HTMLElement | null = null
  /** The source's box at the lift, and where the line and the page were scrolled to then. */
  let home: DOMRect | null = null
  let scrolled = 0
  let page = { x: 0, y: 0 }
  let last = origin
  let active = false
  let frame = 0
  let restore: (() => void) | null = null
  // A mouse would start the browser's own drag of the picture, and select text on the way.
  if (!touch) e.preventDefault()

  function lift() {
    active = true
    lifted = true
    home = source.getBoundingClientRect()
    scrolled = on.scroller?.scrollLeft ?? 0
    page = { x: window.scrollX, y: window.scrollY }
    try {
      source.setPointerCapture?.(id)
    } catch {
      // A pointer that is gone already: the release will end this.
    }
    ghost = source.cloneNode(true) as HTMLElement
    ghost.removeAttribute('id')
    ghost.setAttribute('aria-hidden', 'true')
    ghost.querySelectorAll('[id]').forEach((n) => n.removeAttribute('id'))
    Object.assign(ghost.style, {
      position: 'fixed',
      left: `${home.left - PAD}px`,
      top: `${home.top - PAD}px`,
      width: `${home.width}px`,
      height: `${home.height}px`,
      padding: `${PAD}px`,
      boxSizing: 'content-box',
      margin: '0',
      zIndex: '80',
      pointerEvents: 'none',
      background: 'var(--page)',
      borderRadius: '14px',
      boxShadow: 'var(--shadow-pop)',
      transformOrigin: '50% 50%',
      transition: still ? 'none' : `transform 160ms ${EASE}`,
      willChange: 'transform, left',
    })
    document.body.append(ghost)
    // Read its layout once, so the browser takes the flat start before it rises.
    ghost.getBoundingClientRect()
    if (!still) raf(() => ghost && (ghost.style.transform = `scale(${on.scale})`))
    // The box it left: its children out of sight, a soft slot in their place.
    const kids = [...source.children] as HTMLElement[]
    const was = { background: source.style.background, radius: source.style.borderRadius }
    kids.forEach((k) => (k.style.visibility = 'hidden'))
    source.style.background = 'var(--surface-2)'
    source.style.borderRadius = '12px'
    restore = () => {
      kids.forEach((k) => (k.style.visibility = ''))
      source.style.background = was.background
      source.style.borderRadius = was.radius
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
    }
    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'grabbing'
    navigator.vibrate?.(8)
    on.start()
    track(origin, source)
    frame = raf(scroll) as number
  }

  /** The key under a point: what the browser finds there, else what the event hit (tests). */
  function keyAt(p: Point, hit: EventTarget | null): string | null {
    const found =
      typeof document.elementFromPoint === 'function' ? document.elementFromPoint(p.x, p.y) : null
    const el = (found ?? hit) as Element | null
    return el?.closest?.<HTMLElement>('[data-drop]')?.dataset.drop ?? null
  }

  /** The copy follows the pointer along the line; the slot moves to where it is held. */
  function track(p: Point, hit: EventTarget | null) {
    last = p
    if (!ghost || !home) return
    const box = on.bounds?.() ?? null
    let x = home.left + (p.x - origin.x)
    let outside = false
    if (box) {
      x = Math.min(Math.max(x, box.left), Math.max(box.left, box.right - home.width))
      outside = p.x < box.left || p.x > box.right || p.y < box.top || p.y > box.bottom
    }
    ghost.style.left = `${x - PAD}px`
    document.body.style.cursor = outside ? 'not-allowed' : 'grabbing'
    // The hit test runs along the line: a clip against its row, a group against the line.
    // The point is kept inside the row or the line, and on screen, so there is something under it.
    const zone = box ?? on.scroller?.getBoundingClientRect()
    const at = zone
      ? {
          x: Math.min(Math.max(p.x, zone.left + 1), zone.right - 1),
          y: Math.min(
            Math.max(Math.min(Math.max(p.y, zone.top + 1), zone.bottom - 1), 0),
            window.innerHeight - 1,
          ),
        }
      : p
    on.over(keyAt(at, hit), at)
  }

  /** Near either end of the line, the line scrolls as long as the pointer stays there. */
  function scroll() {
    frame = raf(scroll) as number
    const el = on.scroller
    if (!el) return
    const r = el.getBoundingClientRect()
    const depth =
      last.x < r.left + EDGE
        ? -(r.left + EDGE - last.x)
        : last.x > r.right - EDGE
          ? last.x - (r.right - EDGE)
          : 0
    if (!depth) return
    const before = el.scrollLeft
    el.scrollLeft += Math.sign(depth) * Math.min(Math.abs(depth) / EDGE, 1) * MAX_STEP
    if (el.scrollLeft !== before) track(last, null)
  }

  function move(ev: PointerEvent) {
    if (ev.pointerId !== id) return
    if (!active) {
      const drift = Math.hypot(ev.clientX - origin.x, ev.clientY - origin.y)
      if (touch) {
        // The finger went off to scroll before the press was long enough.
        if (drift > SLOP) finish()
        return
      }
      if (drift < MOUSE_SLOP) return
      lift()
    }
    track({ x: ev.clientX, y: ev.clientY }, ev.target)
  }

  function up(ev: PointerEvent) {
    if (ev.pointerId !== id) return
    if (active) settle(true)
    else finish()
  }

  function cancel(ev: PointerEvent) {
    if (ev.pointerId !== id) return
    if (active) settle(false)
    else finish()
  }

  function key(ev: KeyboardEvent) {
    if (ev.key !== 'Escape' || !active) return
    ev.preventDefault()
    settle(false)
  }

  // A long press also opens the browser's own menu for a picture or a link.
  const menu = (ev: Event) => ev.preventDefault()

  /**
   * The copy lands: with a commit, in the slot where it is held; without, back where it came
   * from (the slot slides back too, as the others return). Then the item shows again.
   */
  function settle(commit: boolean) {
    // The home box, where the line and the page stand now.
    const dx = (on.scroller ? scrolled - on.scroller.scrollLeft : 0) + (page.x - window.scrollX)
    const dy = page.y - window.scrollY
    const slot = source.getBoundingClientRect()
    const to = commit || !home ? slot : { left: home.left + dx, top: home.top + dy }
    finish()
    const g = ghost
    const done = () => {
      g?.remove()
      restore?.()
      restore = null
    }
    try {
      on.end(commit)
    } catch (err) {
      done()
      throw err
    }
    if (!g) return
    const lands = typeof g.animate === 'function' && !still
    if (!lands) return done()
    g.style.transition = 'none'
    g.animate(
      [
        { left: g.style.left, top: g.style.top, transform: g.style.transform || 'none' },
        { left: `${to.left - PAD}px`, top: `${to.top - PAD}px`, transform: 'scale(1)' },
      ],
      { duration: SETTLE_MS, easing: EASE, fill: 'forwards' },
    ).onfinish = done
  }

  /** The listeners go, and a press that never lifted leaves nothing behind. */
  function finish() {
    window.clearTimeout(timer)
    if (frame) cancelAnimationFrame(frame)
    frame = 0
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
    window.removeEventListener('pointercancel', cancel)
    window.removeEventListener('keydown', key)
    window.removeEventListener('contextmenu', menu)
    lifted = false
    active = false
    if (!ghost) restore?.()
  }

  const timer = touch ? window.setTimeout(lift, HOLD_MS) : 0
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
  window.addEventListener('pointercancel', cancel)
  window.addEventListener('keydown', key)
  window.addEventListener('contextmenu', menu)
}
