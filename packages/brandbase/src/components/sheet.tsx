'use client'

import * as React from 'react'

import { CloseIcon } from './icons'

/**
 * A surface over the page: a blurred scrim, a panel that glides in, Escape and the scrim to
 * close, and focus moved into the panel so a keyboard lands where the eye does.
 *
 * `side` is a drawer on the right (New post); `stage` is a wide centred sheet that rises in
 * (Publish, where the previews need the room). Both keep a fixed height: when content gets
 * shorter (Publish after its button), the second click of a double-click must land on the
 * sheet, not on the scrim behind it, which would close it.
 */
export function Sheet({
  label,
  onClose,
  variant = 'side',
  width = 480,
  children,
}: {
  label: string
  onClose: () => void
  variant?: 'side' | 'stage'
  width?: number
  children: React.ReactNode
}) {
  const panel = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    // Focus goes in on open and back to whatever opened it on close.
    const opener = document.activeElement as HTMLElement | null
    panel.current?.focus()
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
      if (e.key !== 'Tab' || !panel.current) return
      // Keep Tab inside the sheet: the page behind it is not reachable while it is open.
      const focusable = panel.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input, textarea, [tabindex]:not([tabindex="-1"])',
      )
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (!first || !last) return
      if (
        e.shiftKey &&
        (document.activeElement === first || document.activeElement === panel.current)
      ) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      opener?.focus()
    }
  }, [onClose])

  const stage = variant === 'stage'
  return (
    <div className="fixed inset-0 z-40">
      <button
        type="button"
        aria-label="Close"
        tabIndex={-1}
        onClick={onClose}
        // No backdrop blur: Chrome redraws a blur of the whole page on every frame of the
        // sheet's entrance (measured: 200 ms stalls even at 2px). A denser scrim gives the same calm.
        className={`bb-scrim absolute inset-0 cursor-default ${stage ? 'bg-[var(--scrim-strong)]' : 'bg-scrim'}`}
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        style={stage ? undefined : { width: `min(${width}px, calc(100% - 32px))` }}
        className={
          stage
            ? 'bb-stage absolute inset-x-0 top-10 bottom-4 mx-auto w-[min(1120px,calc(100%-32px))] overflow-y-auto rounded-3xl bg-page px-[clamp(20px,4vw,52px)] pt-7 pb-8 shadow-[var(--shadow-stage)] outline-none max-md:top-4'
            : 'bb-sheet absolute top-4 right-4 bottom-4 flex flex-col overflow-y-auto rounded-2xl bg-page px-8 pt-5 pb-7 shadow-sheet outline-none'
        }
      >
        <div className={stage ? 'absolute top-5 right-5 z-10' : 'flex justify-end'}>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className={`flex items-center justify-center rounded-full text-ink-3 transition-colors hover:bg-surface hover:text-ink ${stage ? 'size-11' : 'size-8'}`}
          >
            <CloseIcon />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
