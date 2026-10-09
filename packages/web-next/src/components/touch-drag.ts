'use client'

import type * as React from 'react'

/**
 * Drag by touch. A phone's browser does not start the HTML drag (`draggable`, `dataTransfer`) from
 * a finger, so a long press starts this one instead: a copy of the item follows the finger, the
 * page holds still, and lifting over an element marked `data-drop="<key>"` drops there. A short
 * press is still a tap, and a swipe before the press is long enough still scrolls.
 */

const HOLD_MS = 320
/** How far a finger can drift during the press before it counts as a scroll. */
const SLOP = 8
/** Near the top or bottom edge, the page scrolls under the finger. */
const EDGE = 72
/** A lifted photo floats this far above the finger. */
const LIFT_GAP = 14

let lifted = false
let pressing = false

// The page can only refuse to scroll from a listener that was there when the touch began.
if (typeof document !== 'undefined') {
  document.addEventListener(
    'touchmove',
    (e) => {
      if (lifted) e.preventDefault()
    },
    { passive: false },
  )
}

/** True from a finger's press on a draggable item until it lifts: the HTML drag stands down. */
export function touchDragPending(): boolean {
  return pressing
}

export function startTouchDrag(
  e: React.PointerEvent<HTMLElement>,
  on: {
    start: () => void
    over?: (key: string | null) => void
    /** Every move of the finger, with where it is: a list that reorders live reads the position. */
    move?: (key: string | null, at: { x: number; y: number }) => void
    drop: (key: string | null) => void
    end?: () => void
    /**
     * Lift only the item's photo: the element this selector finds in it (the item itself when
     * absent), drawn `size` px square, centred just above the finger from the first frame. Without
     * it the whole item lifts from where it lies.
     */
    lift?: { selector?: string; size: number }
  },
) {
  if (e.pointerType !== 'touch' || !e.isPrimary) return
  const source = e.currentTarget
  const id = e.pointerId
  const x0 = e.clientX
  const y0 = e.clientY
  let ghost: HTMLElement | null = null
  let grab = { x: 0, y: 0 }
  let key: string | null = null
  pressing = true

  /** Puts a lifted photo centred above the finger. */
  function place(x: number, y: number) {
    const size = on.lift!.size
    ghost!.style.left = `${x - size / 2}px`
    ghost!.style.top = `${y - size - LIFT_GAP}px`
  }

  const timer = window.setTimeout(() => {
    const part =
      (on.lift?.selector && source.querySelector<HTMLElement>(on.lift.selector)) || source
    const r = part.getBoundingClientRect()
    grab = { x: x0 - r.left, y: y0 - r.top }
    ghost = part.cloneNode(true) as HTMLElement
    ghost.removeAttribute('id')
    // A tile that just landed still runs its settle animation, which would hold the copy's transform.
    ghost.style.animation = 'none'
    ghost.setAttribute('aria-hidden', 'true')
    Object.assign(ghost.style, {
      position: 'fixed',
      left: `${r.left}px`,
      top: `${r.top}px`,
      width: `${r.width}px`,
      height: `${r.height}px`,
      margin: '0',
      zIndex: '80',
      pointerEvents: 'none',
      opacity: '0.94',
      borderRadius: getComputedStyle(part).borderRadius,
      boxShadow: 'var(--shadow-pop)',
      // Small and above the finger, so the day or column under it stays in sight.
      transformOrigin: `${grab.x}px ${grab.y}px`,
      transition: 'transform 200ms cubic-bezier(.2,.8,.2,1)',
    })
    const g = ghost
    if (on.lift) {
      // The photo starts at the finger, small, and grows into place: it never leaves its old spot.
      Object.assign(g.style, {
        width: `${on.lift.size}px`,
        height: `${on.lift.size}px`,
        overflow: 'hidden',
        borderRadius: '12px',
        transformOrigin: '50% 100%',
        transform: 'scale(0.6)',
      })
      place(x0, y0)
    }
    document.body.append(ghost)
    // Read its layout once, so the browser takes the small start before it grows.
    g.getBoundingClientRect()
    requestAnimationFrame(() => {
      g.style.transform = on.lift ? 'scale(1)' : 'translateY(-44px) scale(0.5) rotate(-2deg)'
    })
    lifted = true
    navigator.vibrate?.(8)
    on.start()
  }, HOLD_MS)

  function move(ev: PointerEvent) {
    if (ev.pointerId !== id) return
    if (!ghost) {
      if (Math.hypot(ev.clientX - x0, ev.clientY - y0) > SLOP) finish()
      return
    }
    if (on.lift) place(ev.clientX, ev.clientY)
    else {
      ghost.style.left = `${ev.clientX - grab.x}px`
      ghost.style.top = `${ev.clientY - grab.y}px`
    }
    const at = document.elementFromPoint(ev.clientX, ev.clientY)
    const next = at?.closest<HTMLElement>('[data-drop]')?.dataset.drop ?? null
    if (next !== key) {
      key = next
      on.over?.(key)
    }
    on.move?.(key, { x: ev.clientX, y: ev.clientY })
    if (ev.clientY < EDGE) window.scrollBy(0, -10)
    else if (ev.clientY > window.innerHeight - EDGE) window.scrollBy(0, 10)
  }

  function up(ev: PointerEvent) {
    if (ev.pointerId !== id) return
    if (ghost) {
      // The lift would also land as a tap on whatever is under the finger.
      const swallow = (c: Event) => {
        c.stopPropagation()
        c.preventDefault()
      }
      // A touch held still by the drag often sends no click: the next press then disarms it.
      const disarm = () => window.removeEventListener('click', swallow, true)
      window.addEventListener('click', swallow, { capture: true, once: true })
      window.addEventListener('pointerdown', disarm, { capture: true, once: true })
      window.setTimeout(disarm, 400)
      on.drop(key)
    }
    finish()
  }

  // A long press also opens the browser's own menu for a link or an image.
  function menu(ev: Event) {
    ev.preventDefault()
  }

  function finish() {
    window.clearTimeout(timer)
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
    window.removeEventListener('pointercancel', finish)
    window.removeEventListener('contextmenu', menu)
    pressing = false
    if (ghost) {
      ghost.remove()
      ghost = null
      lifted = false
      on.over?.(null)
      on.end?.()
    }
  }

  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
  window.addEventListener('pointercancel', finish)
  window.addEventListener('contextmenu', menu)
}
