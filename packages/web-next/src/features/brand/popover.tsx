'use client'

import * as React from 'react'
import { createPortal } from 'react-dom'

import { usePhone } from '@/components/use-phone'

/** Where the control that opened a popover sits, in page coordinates, so it scrolls with it. */
export interface Anchor {
  top: number
  bottom: number
  left: number
  width: number
}

export function anchorOf(el: Element): Anchor {
  const r = el.getBoundingClientRect()
  return {
    top: r.top + window.scrollY,
    bottom: r.bottom + window.scrollY,
    left: r.left + window.scrollX,
    width: r.width,
  }
}

const GUTTER = 16

/**
 * A small panel by the control that opened it; a bottom sheet on a phone. A tap outside or Done
 * closes it (`onClose`), Escape backs out (`onCancel`). Focus goes to the first `data-autofocus`
 * inside, and back to the opener after.
 */
export function Popover({
  anchor,
  label,
  width = 288,
  height = 420,
  placement = 'below',
  plain = false,
  onClose,
  onCancel = onClose,
  children,
}: {
  anchor: Anchor
  label: string
  width?: number
  /** About how tall it is, to open above the anchor when there is no room below. */
  height?: number
  /** `over` lays it on top of the anchor, as wide as it: an edit of a block in place. */
  placement?: 'below' | 'over'
  /** The content has its own Done, so a phone's sheet draws no title bar. */
  plain?: boolean
  onClose: () => void
  onCancel?: () => void
  children: React.ReactNode
}) {
  const phone = usePhone()
  const panel = React.useRef<HTMLDivElement>(null)
  const close = React.useEffectEvent(onClose)
  const cancel = React.useEffectEvent(onCancel)

  React.useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    const first = panel.current?.querySelector<HTMLElement>('[data-autofocus]')
    ;(first ?? panel.current)?.focus({ preventScroll: true })
    if (first instanceof HTMLTextAreaElement || first instanceof HTMLInputElement)
      first.setSelectionRange(first.value.length, first.value.length)
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      cancel()
    }
    const onPointer = (e: PointerEvent) => {
      if (!panel.current?.contains(e.target as Node)) close()
    }
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('pointerdown', onPointer)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('pointerdown', onPointer)
      if (opener?.isConnected) opener.focus({ preventScroll: true })
    }
  }, [])

  if (phone) {
    return createPortal(
      <div className="fixed inset-0 z-50 flex flex-col justify-end">
        <div aria-hidden="true" className="bb-fade absolute inset-0 bg-ink/30" />
        <div
          ref={panel}
          role="dialog"
          aria-label={label}
          tabIndex={-1}
          className="bb-sheet-up relative flex max-h-[90svh] flex-col overflow-y-auto overscroll-contain rounded-t-[22px] bg-page px-5 pb-[calc(20px+env(safe-area-inset-bottom))] shadow-sheet outline-none"
        >
          <span
            aria-hidden="true"
            className="mx-auto mt-2 mb-1 h-1 w-9 shrink-0 rounded-full bg-track"
          />
          <div
            className={`h-11 shrink-0 items-center justify-between ${plain ? 'hidden' : 'flex'}`}
          >
            <span className="text-[15px] font-medium">{label}</span>
            <button
              type="button"
              onClick={onClose}
              className="-mr-3 h-10 rounded-full px-3 text-[14px] font-medium text-ink-2"
            >
              Done
            </button>
          </div>
          {children}
        </div>
      </div>,
      document.body,
    )
  }

  const over = placement === 'over'
  const w = over ? anchor.width + 32 : width
  const maxLeft = document.documentElement.clientWidth - w - GUTTER
  const left = Math.max(GUTTER, Math.min(over ? anchor.left - 16 : anchor.left, maxLeft))
  const roomBelow = window.innerHeight - (anchor.bottom - window.scrollY)
  const above = !over && roomBelow < height + GUTTER && anchor.top - window.scrollY > roomBelow
  const style: React.CSSProperties = over
    ? { top: anchor.top - 16, left, width: w }
    : above
      ? { top: anchor.top - 10, left, width: w, transform: 'translateY(-100%)' }
      : { top: anchor.bottom + 10, left, width: w }

  return createPortal(
    <div style={style} className="absolute z-50">
      <div
        ref={panel}
        role="dialog"
        aria-label={label}
        tabIndex={-1}
        className={`bb-menu rounded-[16px] bg-page shadow-pop outline-none ${above ? 'origin-bottom-left' : 'origin-top-left'}`}
      >
        {children}
      </div>
    </div>,
    document.body,
  )
}
