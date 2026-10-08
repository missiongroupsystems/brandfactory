'use client'

import * as React from 'react'
import { createPortal } from 'react-dom'

/**
 * A phone's bottom sheet: a card or a set of controls, opened from a row or a button. A tap outside,
 * Done or Escape closes it. The page under it does not scroll while it is open.
 */
export function Sheet({
  title,
  onClose,
  onDone = onClose,
  children,
}: {
  title: string
  onClose: () => void
  /** What Done does when it is more than a close: the crop keeps its edit, a stray tap does not. */
  onDone?: () => void
  children: React.ReactNode
}) {
  const done = React.useRef<HTMLButtonElement>(null)
  // The sheet's content may change what closing does (a crop in progress); the focus must not move
  // again each time it does.
  const close = React.useEffectEvent(onClose)
  React.useEffect(() => {
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'
    // Focus goes into the sheet, and back to the control that opened it when it closes.
    const opener = document.activeElement as HTMLElement | null
    done.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = overflow
      window.removeEventListener('keydown', onKey)
      opener?.focus()
    }
  }, [])
  // Only a phone opens it, but it stays visible if the window then widens (a phone turned on its
  // side), so it can close: under the body, no phone-only wrapper can hide it. It mounts on a tap,
  // never on the server.
  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="bb-fade absolute inset-0 bg-ink/30"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="bb-sheet-up relative flex max-h-[88svh] flex-col rounded-t-[22px] bg-page pb-[env(safe-area-inset-bottom)] shadow-sheet"
      >
        <span aria-hidden="true" className="mx-auto mt-2 h-1 w-9 rounded-full bg-track" />
        <div className="flex h-12 items-center justify-between pr-2 pl-5">
          <span className="text-[16px] font-medium">{title}</span>
          <button
            ref={done}
            type="button"
            onClick={onDone}
            className="h-10 rounded-full px-3 text-[14px] font-medium text-ink-2 transition-colors hover:text-ink"
          >
            Done
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-1 pb-6">
          {children}
        </div>
      </div>
    </div>,
    document.body,
  )
}
