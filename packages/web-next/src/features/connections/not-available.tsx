'use client'

import * as React from 'react'

import { platformOn, remote } from '@/lib/remote'

/**
 * The services whose access is not set up on our side yet. On the core none of them can be
 * connected: Meta and TikTok have not given the app access, Google Drive, Lark and the Insights
 * sources are not wired, and the connect sheet's sign-in is a pretend one. Pinterest is the one
 * exception, once the server says its app is set up (`GET /platforms`). A connection stored for
 * one of the others is not trusted. The static demo keeps its pretend sign-in.
 */
export const NOT_SET_UP = [
  'ig',
  'tt',
  'fb',
  'pinterest',
  'drive',
  'lark',
  'web',
  'gbp',
  'res',
] as const

/** What still works meanwhile, said after "… isn't connected on our side yet." */
const MEANWHILE: Partial<Record<string, string>> = {
  pinterest: 'Its pins reach the moodboard once it’s set up.',
  drive: 'You can upload from your computer meanwhile.',
  lark: 'Shoots stay on this calendar meanwhile.',
  web: 'Its figures reach Insights once it’s set up.',
  gbp: 'Its figures reach Insights once it’s set up.',
  res: 'Its figures reach Insights once it’s set up.',
}

/** Why a service shows "Not available yet", in plain words. Several names read as one plural. */
export function reasonOf(name: string, source?: string): string {
  const many = name.includes(' and ')
  const then =
    (source && MEANWHILE[source]) ??
    `You can plan posts here; they won’t publish until ${many ? 'they’re' : 'it’s'} set up.`
  return `${name} ${many ? 'aren’t' : 'isn’t'} connected on our side yet. ${then}`
}

export function notAvailable(key: string): boolean {
  return remote && (NOT_SET_UP as readonly string[]).includes(key) && !platformOn(key)
}

/**
 * A calm amber "Not available yet" in place of Connect. Its reason opens in a small card on hover,
 * on keyboard focus and on a tap; Escape or a tap elsewhere closes it.
 */
export function NotAvailable({
  name,
  source,
  align = 'right',
}: {
  /** The platform, or several: "Instagram, TikTok and Facebook". */
  name: string
  /** Its key, for what still works meanwhile; publishing platforms when left out. */
  source?: string
  align?: 'left' | 'right' | 'center'
}) {
  const [open, setOpen] = React.useState(false)
  // Escape hides the card even while the pointer rests on it, until the pointer or focus leaves.
  const [hushed, setHushed] = React.useState(false)
  const root = React.useRef<HTMLSpanElement>(null)
  const id = React.useId()
  React.useEffect(() => {
    // A tap does not focus a button in iOS Safari, so a tap elsewhere closes it, not a blur.
    const onPointer = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setOpen(false)
      setHushed(true)
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [])
  const rest = () => {
    setOpen(false)
    setHushed(false)
  }
  return (
    <span
      ref={root}
      className="group/na relative inline-flex shrink-0"
      onMouseLeave={rest}
      onBlur={rest}
    >
      <button
        type="button"
        aria-describedby={id}
        onClick={() => {
          setHushed(false)
          setOpen(true)
        }}
        className="flex h-8 items-center gap-1.5 rounded-full bg-(--pending-soft) px-3 text-[12.5px] font-medium text-(--pending-ink) outline-none focus-visible:shadow-[0_0_0_2px_var(--pending)]"
      >
        <span aria-hidden="true" className="size-1.5 rounded-full bg-(--pending)" />
        Not available yet
      </button>
      <span
        id={id}
        role="tooltip"
        className={`absolute top-[calc(100%+8px)] z-30 before:absolute before:inset-x-0 before:-top-2 before:h-2 before:content-[""] w-[248px] rounded-[12px] bg-page p-3 text-left text-[12.5px] leading-[1.45] text-ink-2 shadow-pop transition-opacity duration-150 ${hushed ? '' : 'group-hover/na:visible group-hover/na:opacity-100 group-focus-within/na:visible group-focus-within/na:opacity-100'} ${align === 'right' ? 'right-0' : align === 'left' ? 'left-0' : 'left-1/2 -translate-x-1/2'} ${open ? 'visible opacity-100' : 'invisible opacity-0'}`}
      >
        {reasonOf(name, source)}
      </span>
    </span>
  )
}
