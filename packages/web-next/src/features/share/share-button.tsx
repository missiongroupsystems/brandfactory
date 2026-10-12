'use client'

import Link from 'next/link'
import * as React from 'react'

import { CheckIcon } from '@/components/icons'
import { Sheet } from '@/components/sheet'
import { usePhone } from '@/components/use-phone'

import {
  setShareAccess,
  shareUrl,
  useShareAccess,
  type ShareAccess,
  type ShareKind,
} from './comments-store'

/**
 * Share, for an idea or a shoot: one link, and who it opens for. Anyone with the link may view,
 * comment with only a name, or edit; or the link opens only for the team. A popover on a
 * computer, a sheet on a phone.
 */
export function ShareButton({ kind, id }: { kind: ShareKind; id: string }) {
  const phone = usePhone()
  const [open, setOpen] = React.useState(false)
  const [copied, setCopied] = React.useState(false)
  const access = useShareAccess(kind, id)
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
      <div className="flex items-center gap-1 text-[12.5px]">
        <Choice
          label="Who can open the link"
          value={access.who}
          options={WHO}
          onChange={(who) => setShareAccess(kind, id, { who })}
          className="text-ink-2"
        />
        {access.who === 'link' && (
          <Choice
            label="What they can do"
            value={access.can}
            options={CAN}
            onChange={(can) => setShareAccess(kind, id, { can })}
            className="ml-auto text-ink-3"
          />
        )}
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

const WHO: { value: ShareAccess['who']; label: string }[] = [
  { value: 'link', label: 'Anyone with the link' },
  { value: 'team', label: 'Only the team' },
]

const CAN: { value: ShareAccess['can']; label: string }[] = [
  { value: 'view', label: 'Can view' },
  { value: 'comment', label: 'Can comment' },
  { value: 'edit', label: 'Can edit' },
]

/** A quiet select that reads as text with a chevron; the phone opens its own picker. */
function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
  className = '',
}: {
  label: string
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
  className?: string
}) {
  return (
    <span className={`relative flex items-center ${className}`}>
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="h-8 cursor-pointer appearance-none rounded-full [field-sizing:content] bg-transparent pr-6 pl-2 font-medium outline-none hover:bg-surface hover:text-ink focus-visible:shadow-[0_0_0_1.5px_var(--ink)]"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <svg
        width="8"
        height="8"
        viewBox="0 0 8 8"
        aria-hidden="true"
        className="pointer-events-none absolute right-2.5"
      >
        <path d="M1.5 3 4 5.5 6.5 3" stroke="currentColor" strokeWidth="1.2" fill="none" />
      </svg>
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
