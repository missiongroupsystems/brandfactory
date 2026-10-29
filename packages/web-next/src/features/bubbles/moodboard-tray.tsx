'use client'

import * as React from 'react'

import type { BrandId } from '@/data/brands'
import { moodboardOf, referencesOf, type Reference } from '@/data/ideas'

import { MoodboardTile } from './cards/moodboard-tile'

/** How many posts one question can carry. */
export const MAX_ATTACHED = 12

/** The brand's moodboard posts that have a picture: what the tray and the chips can show. */
export const moodboardPosts = (brandId: BrandId): Reference[] =>
  referencesOf(brandId).filter((r) => r.image)

/**
 * The moodboard above the chat box: a grid of tiles to tick, with a row to narrow it to one
 * board or to what was shared. The ticks come back as keys, in the order they were ticked; a
 * 13th tick is refused and the tray says so.
 */
export function MoodboardTray({
  brandId,
  ticked,
  onChange,
}: {
  brandId: BrandId
  ticked: string[]
  onChange: (keys: string[]) => void
}) {
  const posts = moodboardPosts(brandId)
  const boards = moodboardOf(brandId).boards.filter((b) => b.pins.some((p) => p.image))
  const onBoard = new Set(boards.flatMap((b) => b.pins.map((p) => p.id)))
  const shared = posts.filter((p) => !onBoard.has(p.id))
  const filters = [
    { key: 'all', label: 'All', posts },
    ...boards.map((b) => ({ key: b.id, label: b.name, posts: b.pins.filter((p) => p.image) })),
    ...(shared.length ? [{ key: 'shared', label: 'Shared', posts: shared }] : []),
  ]
  const [filter, setFilter] = React.useState('all')
  const shown = filters.find((f) => f.key === filter)?.posts ?? posts
  const [full, setFull] = React.useState(false)
  React.useEffect(() => {
    if (!full) return
    const timer = setTimeout(() => setFull(false), 1600)
    return () => clearTimeout(timer)
  }, [full])
  // Focus comes in with the tray, on its first control; the composer gives it back on Escape.
  const panel = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    panel.current?.querySelector<HTMLElement>('button')?.focus({ preventScroll: true })
  }, [])
  const toggle = (id: string) => {
    if (ticked.includes(id)) return onChange(ticked.filter((k) => k !== id))
    if (ticked.length >= MAX_ATTACHED) return setFull(true)
    onChange([...ticked, id])
  }
  return (
    <div
      ref={panel}
      role="dialog"
      aria-label="Moodboard"
      className="bb-menu absolute bottom-[calc(100%+8px)] left-0 z-30 flex w-full origin-bottom-left flex-col gap-2 rounded-[16px] bg-page p-2 shadow-[0_0_0_1px_var(--line),var(--shadow-pop)]"
    >
      {filters.length > 1 && (
        <div className="flex gap-1 overflow-x-auto px-1 pt-1 [scrollbar-width:none]">
          {filters.map((f) => (
            <button
              key={f.key}
              type="button"
              aria-pressed={filter === f.key}
              onClick={() => setFilter(f.key)}
              className={`bb-press h-7 shrink-0 rounded-full px-2.5 text-[13px] whitespace-nowrap transition-colors ${
                filter === f.key ? 'bg-ink text-page' : 'text-ink-3 hover:bg-surface hover:text-ink'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}
      <ol
        aria-label="Moodboard posts"
        className="grid max-h-[min(316px,42svh)] grid-cols-[repeat(auto-fill,minmax(72px,1fr))] gap-2 overflow-y-auto overscroll-contain p-1 [scrollbar-width:thin]"
      >
        {shown.map((p) => (
          <li key={p.id} className="min-w-0">
            <MoodboardTile
              post={p}
              ticked={ticked.includes(p.id)}
              onToggle={() => toggle(p.id)}
              className="aspect-square w-full"
            />
          </li>
        ))}
      </ol>
      {full && (
        <span role="status" className="bb-fade px-2 pb-1 text-[12px] text-ink-4">
          Up to {MAX_ATTACHED}
        </span>
      )}
    </div>
  )
}
