'use client'

import type * as React from 'react'

/**
 * The small parts a draggable list shares: the idea page's storyboard and references, and the
 * call sheet's filmstrip.
 */

/**
 * Lets a drag land: the browser asks on `dragenter` and again on every `dragover`, and refuses the
 * drop unless the last answer was yes. An item that slides under a still pointer is asked once,
 * on `dragenter`, so both get the same answer.
 */
export function accept(e: React.DragEvent, when: boolean) {
  if (!when) return false
  e.preventDefault()
  return true
}

export const at = (e: React.DragEvent) => ({ x: e.clientX, y: e.clientY })

/** True when a point is inside an element's box. */
export function inside(el: Element | null, p: { x: number; y: number } | null): boolean {
  if (!el || !p) return false
  const r = el.getBoundingClientRect()
  return p.x >= r.left && p.x <= r.right && p.y >= r.top && p.y <= r.bottom
}

/** Moves an item by the keyboard: Option (Alt) with an arrow key on its handle. */
export function nudgeKey(e: React.KeyboardEvent): -1 | 1 | null {
  if (!e.altKey) return null
  if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') return -1
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') return 1
  return null
}

/**
 * The keyboard's grip on a tile or a card: out of sight until it has the focus, when it shows as
 * a small mark in the corner. Option with an arrow key moves the item; the drag is the pointer's.
 */
export function Handle({
  label,
  hint,
  onNudge,
}: {
  label: string
  hint?: string
  onNudge: (by: -1 | 1) => void
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-describedby={hint}
      onKeyDown={(e) => {
        const by = nudgeKey(e)
        if (!by) return
        e.preventDefault()
        onNudge(by)
      }}
      className="sr-only top-2 left-2 z-10 rounded-full bg-page text-ink-3 shadow-soft focus-visible:not-sr-only focus-visible:absolute focus-visible:flex focus-visible:size-7 focus-visible:items-center focus-visible:justify-center focus-visible:outline-none"
    >
      <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" aria-hidden="true">
        <circle cx="3" cy="2" r="1" />
        <circle cx="7" cy="2" r="1" />
        <circle cx="3" cy="5" r="1" />
        <circle cx="7" cy="5" r="1" />
        <circle cx="3" cy="8" r="1" />
        <circle cx="7" cy="8" r="1" />
      </svg>
    </button>
  )
}
