'use client'

import Link from 'next/link'
import * as React from 'react'

import { CheckIcon } from '@/components/icons'
import { Sheet } from '@/components/sheet'
import { usePhone } from '@/components/use-phone'

import {
  ensureLink,
  setShareAccess,
  useShareToken,
  shareUrl,
  useShareAccess,
  type ShareAccess,
  type ShareKind,
} from './comments-store'
import { remote } from '@/lib/remote'

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
  const token = useShareToken(kind, id)
  const url = open ? shareUrl(kind, id, window.location.origin) : ''
  React.useEffect(() => {
    if (open) ensureLink(kind, id)
  }, [open, kind, id])

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
    void navigator.clipboard?.writeText(url).catch(() => {})
    setCopied(true)
  }

  const body = (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2.5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface text-ink-2">
          {access.who === 'link' ? <GlobeGlyph /> : <LockGlyph />}
        </span>
        <Choice
          label="Who can open the link"
          value={access.who}
          options={WHO}
          onChange={(who) => setShareAccess(kind, id, { who })}
          className="-ml-2 text-[13.5px] font-medium text-ink"
        />
        {access.who === 'link' && (
          <Choice
            label="What they can do"
            value={access.can}
            options={remote ? CAN.filter((c) => c.value !== 'edit') : CAN}
            onChange={(can) => setShareAccess(kind, id, { can })}
            className="ml-auto text-[13.5px] text-ink-3"
          />
        )}
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={copy}
          className="bb-press flex h-10 flex-1 items-center justify-center gap-1.5 rounded-full bg-ink text-[13.5px] font-medium text-page hover:opacity-85"
        >
          {copied ? <CheckIcon size={11} strokeWidth={2.2} /> : <LinkGlyph />}
          {copied ? 'Copied' : 'Copy link'}
        </button>
        {/* The same tab, so the demo's memory comes along: what a guest writes shows back here. */}
        <Link
          href={`/share/${kind}/${remote ? (token ?? '') : id}`}
          // With the server on, the guest's view opens apart, so it never mixes with the team's.
          {...(remote && { target: '_blank', rel: 'noopener' })}
          aria-label="Preview as a guest"
          title="Preview as a guest"
          className="bb-press flex size-10 shrink-0 items-center justify-center rounded-full bg-surface text-ink-2 transition-colors hover:bg-paper hover:text-ink"
        >
          <EyeGlyph />
        </Link>
      </div>
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
            className="bb-menu absolute top-full right-0 z-30 mt-2 w-[344px] rounded-[18px] bg-page p-4 shadow-sheet"
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

/**
 * With the server on, "Can edit" is left out: a guest's edit page is not built yet, and the
 * team's page needs a sign-in (decision 6 says to drop the option until it is).
 */
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
        className="h-8 cursor-pointer appearance-none rounded-full [field-sizing:content] bg-transparent pr-6 pl-2 outline-none transition-colors hover:bg-surface focus-visible:bg-surface"
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

function GlobeGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.2" />
      <path
        d="M1.5 7h11M7 1.5c1.6 1.6 2.3 3.4 2.3 5.5S8.6 10.9 7 12.5C5.4 10.9 4.7 9.1 4.7 7S5.4 3.1 7 1.5Z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function LockGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <rect
        x="2.75"
        y="6.25"
        width="8.5"
        height="6"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <path d="M4.75 6.25V4.5a2.25 2.25 0 0 1 4.5 0v1.75" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  )
}

function EyeGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M1.75 8S4 3.75 8 3.75 14.25 8 14.25 8 12 12.25 8 12.25 1.75 8 1.75 8Z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.2" />
    </svg>
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
