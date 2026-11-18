'use client'

import Link from 'next/link'
import * as React from 'react'

import { CloseIcon } from '@/components/icons'
import { Media } from '@/components/media'
import { PlatformLogo } from '@/components/platform-logos'
import type { Post } from '@/data/demo'

import { ALL_STAGES, type StageFilter } from './calendar-items'
import { useMoveToDrafts } from './posts-store'

/** Every account a post failed on: from its jobs on the core, else the one the demo names. */
export function failedOn(p: Post): NonNullable<Post['failedOn']>[] {
  const fromJobs = Object.entries(p.sends ?? {})
    .filter(([, job]) => job?.status === 'failed')
    .map(([k]) => k as NonNullable<Post['failedOn']>)
  return fromJobs.length > 0 ? fromJobs : p.failedOn ? [p.failedOn] : []
}

/** Live on one account already: the core keeps what went out, so it cannot go back to drafts. */
export const isPartlyOut = (p: Post) =>
  Object.values(p.sends ?? {}).some((j) => j?.status === 'live')

/** Only the failed stage: what the phone's filter switches the calendar to. */
export const ONLY_FAILED = Object.fromEntries(
  Object.keys(ALL_STAGES).map((k) => [k, k === 'failed']),
) as StageFilter

export function onlyFailed(stages: StageFilter): boolean {
  return Object.entries(stages).every(([k, on]) => on === (k === 'failed'))
}

/** How long a cleared row takes to fold away; the post leaves the list after it. */
const LEAVE_MS = 260

/**
 * Posts that did not go out, as a quiet line beside the title: "2 failed". Nothing when none
 * failed. It opens a short list, each row to its own post, so a post on another week is one press
 * away. A row's × takes that post to drafts without posting it, as the post page's "Move to
 * drafts" does; the row folds away and the count follows. A long list scrolls inside the menu.
 */
export function FailedPill({ posts }: { posts: Post[] }) {
  const moveToDrafts = useMoveToDrafts()
  const [open, setOpen] = React.useState(false)
  // The rows folding away while their post goes to drafts.
  const [leaving, setLeaving] = React.useState<ReadonlySet<string>>(new Set())
  const root = React.useRef<HTMLSpanElement>(null)
  const button = React.useRef<HTMLButtonElement>(null)
  const none = posts.length === 0
  // None left (all cleared, or another brand): the list closes, so a new failure starts shut.
  if (none && open) setOpen(false)
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
      const step = e.key === 'ArrowDown' ? 1 : -1
      const next = at === -1 ? (step === 1 ? 0 : list.length - 1) : at + step
      list[(next + list.length) % list.length]?.focus()
    }
    document.addEventListener('pointerdown', away)
    document.addEventListener('keydown', key)
    return () => {
      document.removeEventListener('pointerdown', away)
      document.removeEventListener('keydown', key)
    }
  }, [open])

  async function clear(id: string, row: HTMLElement | null) {
    if (leaving.has(id)) return
    // The focus moves on to the next post (or the one before), so it is not lost with the row.
    const rows = [...(root.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])]
    const own = row?.querySelector<HTMLElement>('[role="menuitem"]') ?? null
    const at = own ? rows.indexOf(own) : -1
    ;(rows[at + 1] ?? rows[at - 1])?.focus()
    // The row folds first: the store drops the post as soon as the core has it, and a row cut
    // off mid-fold would jump.
    setLeaving((s) => new Set(s).add(id))
    await new Promise((done) => setTimeout(done, LEAVE_MS))
    await moveToDrafts(id)
    // Moved: the post is a draft now and has left `posts`. Refused: the row unfolds again.
    setLeaving((s) => {
      const left = new Set(s)
      left.delete(id)
      return left
    })
  }

  if (none) return null
  return (
    <span ref={root} className="relative flex">
      <button
        ref={button}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        title="The posts that did not go out"
        onClick={() => setOpen((o) => !o)}
        className={`bb-pop flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[12.5px] font-medium whitespace-nowrap text-fail-ink transition-colors hover:bg-(--fail-soft) ${open ? 'bg-(--fail-soft)' : ''}`}
      >
        <span className="bb-beacon size-1.5 rounded-full bg-fail" />
        {posts.length} failed
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Posts that did not go out"
          className="bb-menu absolute top-[calc(100%+6px)] left-0 z-30 w-[320px] overflow-hidden rounded-[14px] bg-page shadow-pop ring-1 ring-(--cal-line)"
        >
          <FadingScroll>
            {posts.map((p) => {
              const gone = leaving.has(p.id)
              return (
                <div
                  key={p.id}
                  data-leaving={gone || undefined}
                  className="bb-fold transition-[grid-template-rows,opacity] motion-reduce:transition-none"
                  style={{ gridTemplateRows: gone ? '0fr' : '1fr', opacity: gone ? 0 : 1 }}
                >
                  <div className="group flex items-center rounded-[10px] transition-colors hover:bg-surface has-[:focus-visible]:bg-surface">
                    <Link
                      role="menuitem"
                      href={`/post/${p.id}`}
                      tabIndex={gone ? -1 : undefined}
                      onClick={() => setOpen(false)}
                      className="flex min-w-0 flex-1 items-center gap-3 rounded-[10px] py-1.5 pr-2.5 pl-1.5 outline-none"
                    >
                      <span className="relative block size-10 shrink-0 overflow-hidden rounded-[8px] bg-tile">
                        {p.images[0] && <Media src={p.images[0]} sizes="80px" />}
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-[13.5px] font-medium">{p.hook}</span>
                        <span className="truncate text-[12.5px] text-ink-3 tabular-nums">
                          {p.slot}
                        </span>
                      </span>
                      <span className="ml-1 flex shrink-0 items-center gap-1.5 text-ink-3">
                        {failedOn(p).map((k) => (
                          <PlatformLogo key={k} platform={k} size={12} />
                        ))}
                      </span>
                    </Link>
                    {/* Not for a post already out on one account: that is kept (isPartlyOut).
                        At rest the slot is shut, so the logos sit at the row's edge; on hover or
                        keyboard focus it opens and the logos slide over. Open on touch. */}
                    {!isPartlyOut(p) && (
                      <span className="grid shrink-0 grid-cols-[0fr] transition-[grid-template-columns] duration-[180ms] ease-out group-hover:grid-cols-[1fr] group-has-[:focus-visible]:grid-cols-[1fr] motion-reduce:transition-none [@media(hover:none)]:grid-cols-[1fr]">
                        <span className="min-w-0 overflow-hidden">
                          <button
                            type="button"
                            aria-label="Move to drafts"
                            title="Move to drafts"
                            tabIndex={gone ? -1 : undefined}
                            onClick={(e) =>
                              void clear(p.id, e.currentTarget.closest<HTMLElement>('.group'))
                            }
                            className="mr-1 grid size-5 scale-75 place-items-center rounded-full text-ink-4 opacity-0 outline-none transition-[opacity,transform,background-color,color] duration-[180ms] ease-out group-hover:scale-100 group-hover:opacity-100 group-has-[:focus-visible]:scale-100 group-has-[:focus-visible]:opacity-100 hover:bg-tile hover:text-ink-2 focus-visible:bg-tile focus-visible:text-ink-2 active:scale-90 motion-reduce:transition-none [@media(hover:none)]:scale-100 [@media(hover:none)]:opacity-100"
                          >
                            <CloseIcon size={9} />
                          </button>
                        </span>
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </FadingScroll>
        </div>
      )}
    </span>
  )
}

/**
 * The list, at most about seven rows tall, scrolling inside the menu with a thin bar. An edge
 * with more beyond it fades out, so the list says it goes on without a word.
 */
function FadingScroll({ children }: { children: React.ReactNode }) {
  const box = React.useRef<HTMLDivElement>(null)
  const [edges, setEdges] = React.useState({ top: false, bottom: false })
  const measure = React.useCallback(() => {
    const el = box.current
    if (!el) return
    const top = el.scrollTop > 1
    const bottom = el.scrollTop + el.clientHeight < el.scrollHeight - 1
    setEdges((e) => (e.top === top && e.bottom === bottom ? e : { top, bottom }))
  }, [])
  React.useLayoutEffect(measure)
  const fade = 'transparent, black 20px'
  const mask = [
    edges.top ? `linear-gradient(to bottom, ${fade}, black)` : null,
    edges.bottom ? `linear-gradient(to top, ${fade}, black)` : null,
  ].filter(Boolean)
  return (
    <div
      ref={box}
      onScroll={measure}
      className="flex max-h-[min(380px,calc(100svh-160px))] flex-col overflow-y-auto overscroll-contain p-1.5 [scrollbar-color:var(--cal-line)_transparent] [scrollbar-width:thin]"
      style={
        mask.length
          ? {
              maskImage: mask.join(', '),
              WebkitMaskImage: mask.join(', '),
              maskComposite: 'intersect',
              WebkitMaskComposite: 'source-in',
            }
          : undefined
      }
    >
      {children}
    </div>
  )
}
