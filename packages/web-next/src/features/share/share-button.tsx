'use client'

import Link from 'next/link'
import * as React from 'react'

import { CheckIcon } from '@/components/icons'
import { Sheet } from '@/components/sheet'
import { usePhone } from '@/components/use-phone'

import { shareUrl, type ShareKind } from './comments-store'

/**
 * Share, for an idea or a shoot: one link anyone can open, to view the brief or the call sheet
 * and leave a comment with only a name. A popover on a computer, a sheet on a phone.
 */
export function ShareButton({ kind, id }: { kind: ShareKind; id: string }) {
  const phone = usePhone()
  const [open, setOpen] = React.useState(false)
  const [copied, setCopied] = React.useState(false)
  const field = React.useRef<HTMLButtonElement>(null)
  const pop = React.useRef<HTMLDivElement>(null)
  // The link is only drawn once the popover is open, which is in the browser.
  const url = open ? shareUrl(kind, id, window.location.origin) : ''

  React.useEffect(() => {
    if (!open || phone) return
    const away = (e: PointerEvent) => {
      const t = e.target as Node
      if (!pop.current?.contains(t) && !field.current?.contains(t)) setOpen(false)
    }
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', away)
    document.addEventListener('keydown', key)
    return () => {
      document.removeEventListener('pointerdown', away)
      document.removeEventListener('keydown', key)
    }
  }, [open, phone])

  React.useEffect(() => {
    if (!copied) return
    const t = setTimeout(() => setCopied(false), 2000)
    return () => clearTimeout(t)
  }, [copied])

  function copy() {
    // A browser without clipboard access still shows the link to copy by hand.
    void navigator.clipboard?.writeText(url).catch(() => {})
    setCopied(true)
  }

  const body = (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-1.5 rounded-full bg-surface p-1 pl-3.5">
        <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-ink-3">
          {url.replace(/^https?:\/\//, '')}
        </span>
        <button
          type="button"
          onClick={copy}
          className="bb-press flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-ink px-3.5 text-[12.5px] font-medium text-page hover:opacity-85"
        >
          {copied && <CheckIcon size={10} strokeWidth={2.2} />}
          {copied ? 'Copied' : 'Copy link'}
        </button>
      </div>
      {/* The same tab, so the demo's memory comes along: what a guest writes shows back here. */}
      <Link
        href={`/share/${kind}/${id}`}
        className="self-start text-[12px] text-ink-4 transition-colors hover:text-ink"
      >
        Preview what they see
      </Link>
    </div>
  )

  return (
    <span className="relative flex">
      <button
        ref={field}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="bb-press flex h-9 items-center gap-1.5 rounded-full bg-surface px-3.5 text-[13px] font-medium text-ink-2 transition-colors hover:bg-paper hover:text-ink"
      >
        <LinkGlyph />
        Share
      </button>
      {open &&
        (phone ? (
          <Sheet title="Share" onClose={() => setOpen(false)}>
            {body}
          </Sheet>
        ) : (
          <div
            ref={pop}
            role="dialog"
            aria-label="Share"
            className="bb-menu absolute top-full right-0 z-30 mt-2 w-[340px] rounded-[16px] bg-page p-4 shadow-sheet"
          >
            {body}
          </div>
        ))}
    </span>
  )
}

function LinkGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path
        d="M5 7a2.1 2.1 0 0 0 3 0l1.8-1.8a2.1 2.1 0 0 0-3-3L6.3 2.7M7 5a2.1 2.1 0 0 0-3 0L2.2 6.8a2.1 2.1 0 0 0 3 3l.5-.5"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  )
}
