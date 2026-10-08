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
    drop: (key: string | null) => void
    end?: () => void
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

  const timer = window.setTimeout(() => {
    const r = source.getBoundingClientRect()
    grab = { x: x0 - r.left, y: y0 - r.top }
    ghost = source.cloneNode(true) as HTMLElement
    ghost.removeAttribute('id')
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
      borderRadius: getComputedStyle(source).borderRadius,
      boxShadow: 'var(--shadow-pop)',
      // Small and above the finger, so the day or column under it stays in sight.
      transformOrigin: `${grab.x}px ${grab.y}px`,
      transition: 'transform 200ms cubic-bezier(.2,.8,.2,1)',
    })
    document.body.append(ghost)
    const g = ghost
    requestAnimationFrame(() => {
      g.style.transform = 'translateY(-44px) scale(0.5) rotate(-2deg)'
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
    ghost.style.left = `${ev.clientX - grab.x}px`
    ghost.style.top = `${ev.clientY - grab.y}px`
    const at = document.elementFromPoint(ev.clientX, ev.clientY)
    const next = at?.closest<HTMLElement>('[data-drop]')?.dataset.drop ?? null
    if (next !== key) {
      key = next
      on.over?.(key)
    }
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
