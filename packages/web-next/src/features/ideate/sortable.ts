'use client'

import * as React from 'react'

/**
 * A list that reorders as it is dragged: the lifted item slides into place under the pointer and
 * the others move out of its way, then a drop keeps the new order and anything else puts it back.
 * Items carry `data-flip="<key>"`; the hook slides each one from where it was to where it is now
 * whenever the order changes, so a reorder (or a revert) is never a jump.
 */

/** Which way the items run: a stacked list reads the pointer's y, a row or a grid its x. */
export type Axis = 'x' | 'y'

export interface Sortable {
  /** The keys in their live order: the list as it is, or as the drag has it so far. */
  order: string[]
  dragging: string | null
  start: (key: string) => void
  /** The pointer is over an item: the lifted one goes before or after it, by the pointer's side. */
  overAt: (key: string, at: { x: number; y: number }) => void
  /** The drag is over: a drop keeps the live order, anything else puts the old one back. */
  end: (commit: boolean) => void
  /** Moves an item one place, for the keyboard. */
  nudge: (key: string, by: -1 | 1) => void
}

/** The list with one item moved. */
export function move<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list
  const next = [...list]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item!)
  return next
}

/**
 * The list's state and, apart, the ref callback for the items' container: the hook reads the
 * pointer's side there and slides the items.
 */
export function useSortable(
  keys: string[],
  axis: Axis,
  onReorder: (keys: string[]) => void,
): [Sortable, (el: HTMLElement | null) => void] {
  const ref = React.useRef<HTMLElement | null>(null)
  const attach = React.useCallback((el: HTMLElement | null) => {
    ref.current = el
  }, [])
  const [live, setLive] = React.useState<string[] | null>(null)
  const [dragging, setDragging] = React.useState<string | null>(null)
  // A touch drag's callbacks are made before it begins, so they read the latest through a ref.
  const state = React.useRef({ keys, onReorder, live, dragging })
  React.useLayoutEffect(() => {
    state.current = { keys, onReorder, live, dragging }
  })

  const api = React.useMemo<Omit<Sortable, 'order' | 'dragging'>>(
    () => ({
      start: (key) => {
        state.current.dragging = key
        setDragging(key)
      },
      overAt: (key, at) => {
        const { dragging: held } = state.current
        if (!held || held === key) return
        const order = state.current.live ?? state.current.keys
        const from = order.indexOf(held)
        const target = order.indexOf(key)
        const el = [...(ref.current?.querySelectorAll<HTMLElement>('[data-flip]') ?? [])].find(
          (n) => n.dataset.flip === key,
        )
        if (from < 0 || target < 0 || !el) return
        const r = el.getBoundingClientRect()
        const before = axis === 'y' ? at.y < r.top + r.height / 2 : at.x < r.left + r.width / 2
        let to = target + (before ? 0 : 1)
        if (from < to) to -= 1
        if (to === from) return
        const next = move(order, from, to)
        state.current.live = next
        setLive(next)
      },
      end: (commit) => {
        const { live: next, onReorder: keep } = state.current
        if (commit && next) keep(next)
        state.current.live = null
        state.current.dragging = null
        setLive(null)
        setDragging(null)
      },
      nudge: (key, by) => {
        const { keys: now, onReorder: keep } = state.current
        const from = now.indexOf(key)
        const next = move(now, from, from + by)
        if (next !== now) keep(next)
      },
    }),
    [axis],
  )

  useFlip(ref, dragging)
  return [{ ...api, order: live ?? keys, dragging }, attach]
}

const reducedMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * Slides each `[data-flip]` child of the container from where it was on the last render to where
 * it is now: first, last, invert, play. Runs after every render; a list this size costs nothing.
 * Positions are read against the container, so a scroll between two renders is not a move. The
 * held item is left alone: a transform on a drag's source ends the drag.
 */
function useFlip(ref: React.RefObject<HTMLElement | null>, held: string | null) {
  const last = React.useRef(new Map<string, { left: number; top: number }>())
  React.useLayoutEffect(() => {
    const box = ref.current?.getBoundingClientRect()
    const items = ref.current?.querySelectorAll<HTMLElement>('[data-flip]') ?? []
    const next = new Map<string, { left: number; top: number }>()
    for (const el of items) {
      const key = el.dataset.flip!
      const r = el.getBoundingClientRect()
      const rect = { left: r.left - (box?.left ?? 0), top: r.top - (box?.top ?? 0) }
      const was = last.current.get(key)
      next.set(key, rect)
      if (!was || key === held || typeof el.animate !== 'function' || reducedMotion()) continue
      const dx = was.left - rect.left
      const dy = was.top - rect.top
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue
      el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], {
        duration: 220,
        easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
      })
    }
    last.current = next
  })
}
