'use client'

import Image from 'next/image'
import * as React from 'react'

import { CloseIcon, PencilIcon } from '@/components/icons'
import { ProfilePicture } from '@/components/profile-picture'

const ITEM =
  'rounded-[8px] px-2.5 py-[7px] text-left text-[13.5px] text-ink transition-colors outline-none hover:bg-surface-2 focus-visible:bg-surface'
const SIZE = 96

/**
 * The person's photo (or initials) on `/profile`, with a small pencil on its edge. The pencil
 * opens View photo, Change photo and Remove photo; the photo itself opens View photo.
 */
export function ProfilePhoto({
  src,
  initials,
  busy,
  pencil,
  onChange,
  onRemove,
}: {
  src: string | null
  initials: string
  busy: boolean
  /** The pencil, for the page to put the focus back on when the crop closes. */
  pencil: React.RefObject<HTMLButtonElement | null>
  onChange: () => void
  onRemove: () => void
}) {
  const [open, setOpen] = React.useState(false)
  const [viewing, setViewing] = React.useState(false)
  const root = React.useRef<HTMLDivElement>(null)
  const items = React.useRef<Array<HTMLButtonElement | null>>([])

  React.useEffect(() => {
    if (!open) return
    items.current.find(Boolean)?.focus()
    function onPointer(e: PointerEvent) {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('pointerdown', onPointer)
    return () => window.removeEventListener('pointerdown', onPointer)
  }, [open])

  function onMenuKey(e: React.KeyboardEvent) {
    const list = items.current.filter((el): el is HTMLButtonElement => el !== null)
    const at = list.indexOf(document.activeElement as HTMLButtonElement)
    const go = (i: number) => list[(i + list.length) % list.length]?.focus()
    if (e.key === 'Escape') {
      setOpen(false)
      pencil.current?.focus()
    } else if (e.key === 'Tab') setOpen(false)
    else if (e.key === 'ArrowDown') go(at + 1)
    else if (e.key === 'ArrowUp') go(at - 1)
    else return
    if (e.key !== 'Tab') e.preventDefault()
  }

  // The focus goes back to the pencil first, so the photo view returns it there on close.
  const pick = (act: () => void) => () => {
    setOpen(false)
    pencil.current?.focus()
    act()
  }
  const actions = [
    src && { label: 'View photo', act: () => setViewing(true) },
    { label: 'Change photo', act: onChange },
    src && { label: 'Remove photo', act: onRemove },
  ].filter((a): a is { label: string; act: () => void } => Boolean(a))

  const face = (
    <ProfilePicture src={src ?? undefined} size={SIZE} className="rounded-full">
      {initials}
    </ProfilePicture>
  )
  const round = `flex size-24 items-center justify-center overflow-hidden rounded-full text-[26px] font-semibold transition-opacity ${busy ? 'opacity-50' : ''}`
  const colours = { background: 'var(--avatar)', color: 'var(--avatar-ink)' }

  return (
    <div ref={root} className="relative w-fit">
      {src ? (
        <button
          type="button"
          aria-label="View photo"
          onClick={() => {
            setOpen(false)
            setViewing(true)
          }}
          className={`bb-press ${round}`}
          style={colours}
        >
          {face}
        </button>
      ) : (
        <span aria-hidden="true" className={round} style={colours}>
          {face}
        </span>
      )}
      <button
        ref={pencil}
        type="button"
        aria-label="Edit photo"
        aria-haspopup="menu"
        aria-expanded={open}
        // Not `disabled`: a disabled button drops the focus that Remove photo just put on it.
        aria-disabled={busy}
        onClick={() => !busy && setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' && !open && !busy) {
            e.preventDefault()
            setOpen(true)
          }
        }}
        className="bb-press absolute right-0 bottom-0 flex size-8 items-center justify-center rounded-full border-2 border-page bg-ink text-page shadow-soft aria-disabled:opacity-50"
      >
        <PencilIcon />
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Photo"
          tabIndex={-1}
          onKeyDown={onMenuKey}
          className="bb-menu absolute top-[calc(100%+8px)] left-0 z-30 flex w-[188px] origin-top-left flex-col rounded-[12px] bg-page p-1.5 shadow-pop"
        >
          {actions.map((a, i) => (
            <button
              key={a.label}
              ref={(el) => {
                items.current[i] = el
              }}
              type="button"
              role="menuitem"
              tabIndex={-1}
              onClick={pick(a.act)}
              className={ITEM}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
      {viewing && src && <Lightbox src={src} onClose={() => setViewing(false)} />}
    </div>
  )
}

/** The whole photo over a dimmed page. Escape, the close button or a press outside it closes it. */
function Lightbox({ src, onClose }: { src: string; onClose: () => void }) {
  const card = React.useRef<HTMLDivElement>(null)
  const closeButton = React.useRef<HTMLButtonElement>(null)
  const close = React.useEffectEvent(onClose)
  React.useEffect(() => {
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'
    // Focus goes into the photo, and back to the control that opened it when it closes.
    const opener = document.activeElement as HTMLElement | null
    card.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
      // Close is the only control in it: Tab stays there, never on the page behind.
      else if (e.key === 'Tab') {
        e.preventDefault()
        closeButton.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = overflow
      window.removeEventListener('keydown', onKey)
      opener?.focus()
    }
  }, [])
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      <button
        type="button"
        aria-label="Close photo"
        tabIndex={-1}
        onClick={onClose}
        className="bb-fade absolute inset-0 bg-black/75"
      />
      <div
        ref={card}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Your photo"
        className="bb-pop relative outline-none"
      >
        <Image
          src={src}
          alt="Your profile photo"
          width={512}
          height={512}
          unoptimized={src.startsWith('blob:')}
          className="size-[min(calc(100vw-48px),480px)] rounded-[20px] object-cover shadow-sheet"
        />
        <button
          ref={closeButton}
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="bb-press absolute -top-3 -right-3 flex size-8 items-center justify-center rounded-full bg-page text-ink shadow-pop"
        >
          <CloseIcon />
        </button>
      </div>
    </div>
  )
}
