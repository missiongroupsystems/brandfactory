'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import * as React from 'react'

import { Media } from '@/components/media'
import { PlatformLogo } from '@/components/platform-logos'
import type { Post } from '@/data/demo'

import { ALL_STAGES, type StageFilter } from './calendar-items'

/** Every account a post failed on: from its jobs on the core, else the one the demo names. */
export function failedOn(p: Post): NonNullable<Post['failedOn']>[] {
  const fromJobs = Object.entries(p.sends ?? {})
    .filter(([, job]) => job?.status === 'failed')
    .map(([k]) => k as NonNullable<Post['failedOn']>)
  return fromJobs.length > 0 ? fromJobs : p.failedOn ? [p.failedOn] : []
}

/** Only the failed stage: what the phone's filter switches the calendar to. */
export const ONLY_FAILED = Object.fromEntries(
  Object.keys(ALL_STAGES).map((k) => [k, k === 'failed']),
) as StageFilter

export function onlyFailed(stages: StageFilter): boolean {
  return Object.entries(stages).every(([k, on]) => on === (k === 'failed'))
}

/**
 * Posts that did not go out, as a quiet line beside the title: "2 failed". Nothing when none
 * failed. One failed post opens at once; several open a short list, each to its own page, so a
 * post on another week is one press away.
 */
export function FailedPill({ posts }: { posts: Post[] }) {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const root = React.useRef<HTMLSpanElement>(null)
  const button = React.useRef<HTMLButtonElement>(null)
  React.useEffect(() => {
    if (!open) return
    // The focus goes onto the first post, Up and Down move it, and Escape brings it back.
    const items = () => [
      ...(root.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []),
    ]
    items()[0]?.focus()
    const away = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        button.current?.focus()
        return
      }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
      e.preventDefault()
      const list = items()
      const at = list.indexOf(document.activeElement as HTMLElement)
      const next = (at + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length
      list[next]?.focus()
    }
    document.addEventListener('pointerdown', away)
    document.addEventListener('keydown', key)
    return () => {
      document.removeEventListener('pointerdown', away)
      document.removeEventListener('keydown', key)
    }
  }, [open])
  if (posts.length === 0) return null
  const one = posts.length === 1
  return (
    <span ref={root} className="relative flex">
      <button
        ref={button}
        type="button"
        aria-haspopup={one ? undefined : 'menu'}
        aria-expanded={one ? undefined : open}
        title={one ? 'Open the post that did not go out' : 'The posts that did not go out'}
        onClick={() => (one ? router.push(`/post/${posts[0]!.id}`) : setOpen((o) => !o))}
        className={`bb-pop flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[12.5px] font-medium whitespace-nowrap text-fail-ink transition-colors hover:bg-(--fail-soft) ${open ? 'bg-(--fail-soft)' : ''}`}
      >
        <span className="size-1.5 rounded-full bg-fail" />
        {posts.length} failed
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Posts that did not go out"
          className="bb-menu absolute top-[calc(100%+6px)] left-0 z-30 flex w-[300px] flex-col rounded-[14px] bg-page p-1.5 shadow-pop ring-1 ring-(--cal-line)"
        >
          {posts.map((p) => (
            <Link
              key={p.id}
              role="menuitem"
              href={`/post/${p.id}`}
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 rounded-[10px] p-1.5 transition-colors hover:bg-surface"
            >
              <span className="relative block size-10 shrink-0 overflow-hidden rounded-[8px] bg-tile">
                {p.images[0] && <Media src={p.images[0]} sizes="80px" />}
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[13.5px] font-medium">{p.hook}</span>
                <span className="text-[12.5px] text-ink-3">{p.slot}</span>
              </span>
              <span className="flex shrink-0 items-center gap-1.5 text-ink-3">
                {failedOn(p).map((k) => (
                  <PlatformLogo key={k} platform={k} size={12} />
                ))}
              </span>
            </Link>
          ))}
        </div>
      )}
    </span>
  )
}
