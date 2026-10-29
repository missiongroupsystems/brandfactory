'use client'

import Link from 'next/link'
import * as React from 'react'

import { ProfilePicture } from '@/components/profile-picture'
import { BRAND } from '@/data/demo'
import { useConnections } from '@/features/connections/connections-store'
import { useBrand } from '@/features/schedule/posts-store'
import { leave, onUser, remote } from '@/lib/remote'

const avatar = 'flex size-9 items-center justify-center rounded-full text-xs font-semibold'
const ITEM =
  'flex items-center justify-between gap-3 rounded-[8px] px-2.5 py-[7px] text-[13.5px] text-ink transition-colors outline-none hover:bg-surface-2 focus-visible:bg-surface'
const avatarColours = { background: 'var(--avatar)', color: 'var(--avatar-ink)' }

/**
 * The first letters of the first and last names; with no name, of the email's name part split on
 * dots (pranav.pappu@… is PP). One word gives one letter.
 */
export function initials(name: string, email: string): string {
  const named = name.trim().split(/\s+/).filter(Boolean)
  const words = named.length > 0 ? named : (email.split('@')[0] ?? '').split('.').filter(Boolean)
  const first = words[0]?.[0] ?? ''
  const last = words.length > 1 ? (words[words.length - 1]![0] ?? '') : ''
  return (first + last).toUpperCase()
}

/**
 * The round avatar at the header's end: the signed-in person's photo or initials on the core, the
 * demo's initials in the static demo. Its menu is where settings live: the current brand's kit
 * and its connections (with a dot when one needs signing in again, shown on the avatar too, so a
 * broken connection is seen without opening anything), then on the core the person's own profile
 * and Sign out.
 */
export function AccountMenu() {
  const { brand, brands } = useBrand()
  const attention = Object.values(useConnections(brand.id)).includes('attention')
  const [user, setUser] = React.useState<{ name: string; email: string; avatar?: string | null }>({
    name: '',
    email: '',
  })
  React.useEffect(() => {
    if (!remote) return
    return onUser(setUser)
  }, [])
  const [open, setOpen] = React.useState(false)
  const root = React.useRef<HTMLDivElement>(null)
  const trigger = React.useRef<HTMLButtonElement>(null)
  const items = React.useRef<Array<HTMLElement | null>>([])

  React.useEffect(() => {
    if (!open) return
    items.current[0]?.focus()
    function onPointer(e: PointerEvent) {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('pointerdown', onPointer)
    return () => window.removeEventListener('pointerdown', onPointer)
  }, [open])

  function onMenuKey(e: React.KeyboardEvent) {
    const list = items.current.filter((el): el is HTMLElement => el !== null)
    const at = list.indexOf(document.activeElement as HTMLElement)
    const go = (i: number) => list[(i + list.length) % list.length]?.focus()
    if (e.key === 'Escape') {
      setOpen(false)
      trigger.current?.focus()
    } else if (e.key === 'Tab') setOpen(false)
    else if (e.key === 'ArrowDown') go(at + 1)
    else if (e.key === 'ArrowUp') go(at - 1)
    else return
    if (e.key !== 'Tab') e.preventDefault()
  }

  return (
    <div ref={root} className="relative">
      <button
        ref={trigger}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${remote ? `Account: ${user.email}` : 'Account'}${attention ? ', a connection needs attention' : ''}`}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' && !open) {
            e.preventDefault()
            setOpen(true)
          }
        }}
        className={`${avatar} overflow-hidden transition-shadow hover:ring-2 hover:ring-line ${open ? 'ring-2 ring-line' : ''}`}
        style={avatarColours}
      >
        {/* The person's own photo when they added one, else their initials. */}
        {remote ? (
          <ProfilePicture src={user.avatar ?? undefined} size={36} className="rounded-full">
            {initials(user.name, user.email)}
          </ProfilePicture>
        ) : (
          BRAND.user
        )}
      </button>
      {attention && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute top-0 right-0 size-2 rounded-full bg-fail shadow-[0_0_0_2px_var(--page)]"
        />
      )}
      {open && (
        <div
          role="menu"
          aria-label="Account"
          tabIndex={-1}
          onKeyDown={onMenuKey}
          className="bb-menu absolute top-11 right-0 z-30 flex w-[232px] origin-top-right flex-col rounded-[12px] bg-page p-1.5 shadow-pop"
        >
          {remote && (
            <>
              <span className="flex flex-col px-2.5 pt-2 pb-1.5">
                {user.name && <span className="truncate text-[13.5px] text-ink">{user.name}</span>}
                <span className="truncate text-[13px] text-ink-4">{user.email}</span>
              </span>
              <span aria-hidden="true" className="mx-2 my-1.5 h-px bg-line" />
            </>
          )}
          {/* The current brand's voice, colours and files: named only where there is a choice. */}
          <Link
            ref={(el) => {
              items.current[0] = el
            }}
            href="/brand"
            role="menuitem"
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className={ITEM}
          >
            Brand kit
            {brands.length > 1 && (
              <span className="truncate text-[12px] text-ink-4">{brand.name}</span>
            )}
          </Link>
          <Link
            ref={(el) => {
              items.current[1] = el
            }}
            href="/brand/connections"
            role="menuitem"
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className={ITEM}
          >
            Connections
            {attention && (
              <span aria-label="Needs attention" className="size-1.5 rounded-full bg-fail" />
            )}
          </Link>
          {remote && (
            <>
              <span aria-hidden="true" className="mx-2 my-1.5 h-px bg-line" />
              <Link
                ref={(el) => {
                  items.current[2] = el
                }}
                href="/profile"
                role="menuitem"
                tabIndex={-1}
                onClick={() => setOpen(false)}
                className={ITEM}
              >
                Edit profile
              </Link>
              <button
                ref={(el) => {
                  items.current[3] = el
                }}
                type="button"
                role="menuitem"
                tabIndex={-1}
                onClick={leave}
                className={ITEM}
              >
                Sign out
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
