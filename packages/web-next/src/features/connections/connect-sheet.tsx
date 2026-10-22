'use client'

import * as React from 'react'
import { createPortal } from 'react-dom'

import { CheckIcon, LogoMark } from '@/components/icons'
import { PlatformLogo, type PlatformLogoKey } from '@/components/platform-logos'
import { PINTEREST_ACCOUNT } from '@/data/brand-kit'
import type { Brand } from '@/data/brands'
import { LARK_CALENDAR } from '@/data/connections'
import { VENUE } from '@/data/publish'
import { useBrand } from '@/features/schedule/posts-store'

import { connect, type SourceKey } from './connections-store'

interface SourceInfo {
  name: string
  /** The account or place it is linked as. */
  account: (brand: Brand) => string
  /** What it brings, in a few words, shown while it is not linked. */
  brings: string
  /** What the sign-in asks for, one plain line each. */
  asks: (brand: Brand) => string[]
}

export const SOURCES: Record<SourceKey, SourceInfo> = {
  ig: {
    name: 'Instagram',
    account: (b) => b.handle,
    brings: 'Posts, reels and stories',
    asks: () => ['Publish posts, reels and stories', 'Read comments and insights'],
  },
  tt: {
    name: 'TikTok',
    account: (b) => b.handle,
    brings: 'Videos',
    asks: () => ['Post videos', 'Read views and comments'],
  },
  fb: {
    name: 'Facebook',
    account: (b) => `${b.name} Page`,
    brings: 'Posts to the Page',
    asks: () => ['Publish to the Page', 'Read comments'],
  },
  pinterest: {
    name: 'Pinterest',
    account: (b) => `${b.name} board · ${PINTEREST_ACCOUNT}`,
    brings: 'Pins for the moodboard',
    asks: (b) => [`Read the pins on ${b.name}’s board`],
  },
  drive: {
    name: 'Google Drive',
    account: (b) => `${b.name} folder`,
    brings: 'Final edits, straight into a post',
    asks: () => ['See your folders and photos', 'Copy the photos you pick into a post'],
  },
  lark: {
    name: 'Lark calendar',
    account: () => LARK_CALENDAR,
    brings: 'Shoots and crew invites',
    asks: () => ['Add shoots to the calendar', 'Send invites and read the replies'],
  },
  web: {
    name: 'Website',
    account: () => 'Wix',
    brings: 'Visits',
    asks: () => ['Read visits to the site'],
  },
  gbp: {
    name: 'Google Business Profile',
    account: (b) => VENUE[b.id] ?? b.name,
    brings: 'Searches, Maps views, calls',
    asks: () => ['Read searches, Maps views, calls and directions'],
  },
  res: {
    name: 'Bookings',
    account: () => 'Reservations',
    brings: 'Bookings, by the day they were made',
    asks: () => ['Read bookings, by the day they were made'],
  },
}

const LOGO: Partial<Record<SourceKey, PlatformLogoKey>> = {
  ig: 'ig',
  tt: 'tt',
  fb: 'fb',
  pinterest: 'pinterest',
  drive: 'drive',
  web: 'wix',
  gbp: 'google',
}

/** The service's own logo; Lark and bookings, which have none to borrow, get a plain mark. */
export function SourceMark({ source, size }: { source: SourceKey; size: number }) {
  const logo = LOGO[source]
  if (logo) return <PlatformLogo platform={logo} size={size} />
  if (source === 'lark') {
    return (
      <span aria-hidden="true" className="font-semibold leading-none" style={{ fontSize: size }}>
        L
      </span>
    )
  }
  // A calendar for bookings, as Insights draws it.
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4.5 6.5h15v13h-15zM4.5 10.5h15M8.5 4v4M15.5 4v4"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** How long the pretend sign-in takes: long enough to read as a sign-in, short enough not to wait. */
export const CONNECT_DELAY = 700
/** How long the sheet shows it worked before it closes: the tick has drawn and been seen. */
export const CONNECTED_HOLD = 1400
/** How long the card takes to go once it has shown it worked. */
export const LEAVE = 240

/**
 * The sign-in a link opens, as an OAuth screen reads: what brand base asks to do, then Allow.
 * Simulated: nothing leaves the browser. Allow links the source for the brand in the header,
 * shows it worked (the dots join into a line and a tick pops in), then `onConnected` carries on
 * with what the user was doing (the Drive picker, the invites).
 * A dialog on a desktop, a sheet from the bottom on a phone.
 */
export function ConnectSheet({
  source,
  onClose,
  onConnected = onClose,
}: {
  source: SourceKey
  onClose: () => void
  onConnected?: () => void
}) {
  const { brand } = useBrand()
  const info = SOURCES[source]
  const [step, setStep] = React.useState<'ask' | 'busy' | 'done'>('ask')
  const busy = step === 'busy'
  const [leaving, setLeaving] = React.useState(false)
  const allowRef = React.useRef<HTMLButtonElement>(null)
  const timer = React.useRef(0)
  // Once it has linked, closing the sheet early still carries on (the picker, the invites).
  const dismiss = () => (step === 'done' ? onConnected() : onClose())
  const close = React.useEffectEvent(dismiss)

  React.useEffect(() => {
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'
    // Focus goes to Allow, and back to the control that opened the sheet when it closes.
    const opener = document.activeElement as HTMLElement | null
    allowRef.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    window.addEventListener('keydown', onKey)
    return () => {
      // A cancel while it signs in links nothing.
      window.clearTimeout(timer.current)
      document.body.style.overflow = overflow
      window.removeEventListener('keydown', onKey)
      opener?.focus()
    }
  }, [])

  function allow() {
    if (step !== 'ask') return
    setStep('busy')
    timer.current = window.setTimeout(() => {
      connect(brand.id, source)
      setStep('done')
      timer.current = window.setTimeout(() => {
        // The card settles away before the next thing opens, so the close reads as an ending.
        setLeaving(true)
        timer.current = window.setTimeout(onConnected, LEAVE)
      }, CONNECTED_HOLD)
    }, CONNECT_DELAY)
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6 max-md:items-end max-md:p-0">
      <button
        type="button"
        aria-label="Close"
        onClick={dismiss}
        className={`absolute inset-0 bg-ink/30 ${leaving ? 'bb-fade-out' : 'bb-fade'}`}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={step === 'done' ? `${info.name} connected` : `Connect ${info.name}`}
        className={`${leaving ? 'bb-leave max-md:bb-sheet-down' : 'bb-rise max-md:bb-sheet-up'} relative flex w-[380px] flex-col gap-6 rounded-[22px] bg-page p-7 shadow-sheet max-md:w-full max-md:rounded-b-none max-md:px-5 max-md:pt-6 max-md:pb-[calc(20px+env(safe-area-inset-bottom))]`}
      >
        <span aria-hidden="true" className="flex items-center gap-2.5 text-ink">
          <span
            className={`flex size-11 items-center justify-center rounded-[13px] bg-surface ${step === 'done' ? 'bb-hug' : ''}`}
          >
            <LogoMark />
          </span>
          <span className="relative flex h-6 w-8 items-center justify-center">
            {step === 'done' ? (
              <>
                <span className="bb-fill absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-live" />
                <span
                  className="bb-pop relative flex size-6 items-center justify-center rounded-full bg-live text-white"
                  style={{ animationDelay: '160ms' }}
                >
                  <svg width="13" height="13" viewBox="0 0 26 26" fill="none">
                    <path
                      className="bb-draw"
                      d="M6 13.5L11 18.5L20 8"
                      stroke="currentColor"
                      strokeWidth="3.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
              </>
            ) : (
              <span className="flex gap-1">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className={`size-1 rounded-full bg-ink-5 ${busy ? 'bb-pulse' : ''}`}
                    style={busy ? { animationDelay: `${i * 160}ms` } : undefined}
                  />
                ))}
              </span>
            )}
          </span>
          <span
            className={`flex size-11 items-center justify-center rounded-[13px] bg-surface text-ink-2 ${step === 'done' ? 'bb-hug' : ''}`}
            style={{ '--hug': '-4px' } as React.CSSProperties}
          >
            <SourceMark source={source} size={18} />
          </span>
        </span>
        <div className="flex flex-col gap-1.5">
          <h2 className="text-[19px] font-medium tracking-[-0.02em]">
            {step === 'done' ? `${info.name} connected` : `Connect ${info.name}`}
          </h2>
          <p className="text-[13.5px] text-ink-3">
            {step === 'done'
              ? `${brand.name} is linked as ${info.account(brand)}.`
              : `For ${brand.name}, brand base wants to:`}
          </p>
        </div>
        <ul className="flex flex-col gap-2.5">
          {info.asks(brand).map((line) => (
            <li key={line} className="flex items-start gap-2.5 text-[14px] text-ink-2">
              <span className="mt-[3px] flex size-4 shrink-0 items-center justify-center rounded-full bg-surface text-ink">
                <CheckIcon size={8} strokeWidth={2.2} />
              </span>
              {line}
            </li>
          ))}
        </ul>
        <div
          className={`flex items-center justify-end gap-1 transition-opacity duration-300 max-md:flex-col-reverse max-md:items-stretch max-md:gap-2 ${step === 'done' ? 'opacity-0' : ''}`}
          inert={step === 'done'}
        >
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-full px-4 text-[13px] font-medium text-ink-2 transition-colors hover:text-ink max-md:h-12 max-md:text-[14px]"
          >
            Cancel
          </button>
          <button
            ref={allowRef}
            type="button"
            onClick={allow}
            className="bb-press flex h-10 items-center justify-center gap-2 rounded-full bg-ink px-5 text-[13px] font-medium text-page hover:opacity-85 max-md:h-12 max-md:text-[14px]"
          >
            {busy && (
              <span className="size-3 animate-spin rounded-full border-[1.5px] border-white/30 border-t-white" />
            )}
            {busy ? 'Connecting…' : 'Allow'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
