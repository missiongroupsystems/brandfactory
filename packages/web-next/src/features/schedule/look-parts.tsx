'use client'

import Image from 'next/image'
import * as React from 'react'

import { ChevronIcon, SparkIcon } from '@/components/icons'
import { isVideo, Media } from '@/components/media'
import { PlatformLogo } from '@/components/platform-logos'
import { startTouchDrag } from '@/components/touch-drag'
import type { Day, FeedMark, Format, LayerKey, Post, Week } from '@/data/demo'
import { useCoverOfHook, useCoverOfPost } from '@/features/ideate/ideas-store'

import type { CalendarMode } from './calendar-view'
import { channelsOf, postTime, type StageFilter } from './calendar-items'
import { EventChip } from './event-chip'
import { ideaLabel, useOpenIdea } from './open-idea'
import type { MonthPick } from './month-picker'
import { useBrand } from './posts-store'
import type { Story } from './stories'

/** The phone schedule's pieces: the title bar, the rows, the photos and the drag. */

/** What the schedule page hands the phone's agenda. */
export interface LookProps {
  weeks: Week[]
  /** The month grid's rows: the borrowed first week, if any, and the weeks with outside days marked. */
  month: { lead?: Week; weeks: Week[] }
  /** A day in the borrowed first row: it opens in its own month. */
  onOpenLead: (day: number) => void
  week: number
  day: number
  view: CalendarMode
  title: string
  /** The title's month picker, under the views. */
  monthPick: MonthPick
  layers: Record<LayerKey, boolean>
  stages: StageFilter
  failed: Post[]
  atToday: boolean
  onView: (view: CalendarMode) => void
  onSelect: (week: number, day: number) => void
  /** One step in the view's own unit. */
  onStep: (by: -1 | 1) => void
  onToday: () => void
  onOpenPost: (postId: string) => void
  onNewPost: (date?: string, time?: string, format?: Format) => void
  /** The day a new shoot takes: the day picked, if it is ahead on the brand's calendar. */
  shootDay?: string
  onOpenStories: (date: string) => void
  onStages: (next: StageFilter) => void
  onLayers: (next: Record<LayerKey, boolean>) => void
}

export const STAGE_LABEL = {
  draft: 'Draft',
  scheduled: 'Scheduled',
  posted: 'Posted',
  failed: 'Not posted',
} as const
export const WEEKDAY = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
]
/** The photo that follows the finger, in px. */
const LIFT = 56

export type IdeaMark = Extract<FeedMark, { kind: 'idea' }>
export type Lift = (post: Post, selector?: string) => (e: React.PointerEvent<HTMLElement>) => void

/** The idea's colour: the brand's for the team's own, the insights' green for a suggestion. */
export const tintOf = (mark: IdeaMark, brandColour: string) =>
  mark.suggested ? 'var(--insight)' : `var(${brandColour})`

/** The events that touch a day of the week, by column. */
export const eventsOn = (w: Week, di: number, on: (e: Week['events'][number]) => boolean) =>
  w.events.filter((e) => on(e) && e.col - 1 <= di && di < e.col - 1 + e.span)

/**
 * A held post's photo moves to another day: the long press from the calendar today, with the
 * drop targets marked `data-drop` by each look. `onDropped` follows the post to its new day.
 */
export function useMovePost(
  days: Day[],
  postsOf: (d: Day) => Post[],
  onDropped?: (date: string) => void,
) {
  const { movePost } = useBrand()
  const [moving, setMoving] = React.useState<string | null>(null)
  const [over, setOver] = React.useState<string | null>(null)
  const [landed, setLanded] = React.useState<string | null>(null)
  const from = moving ? days.find((d) => postsOf(d).some((p) => p.id === moving))?.date : undefined
  const canTake = (d: Day) => moving !== null && !d.past && d.date !== from
  const lift: Lift = (post, selector) => (e) => {
    if (post.stage === 'posted') return
    startTouchDrag(e, {
      lift: { selector, size: LIFT },
      start: () => {
        setLanded(null)
        setMoving(post.id)
      },
      over: setOver,
      drop: (date) => {
        if (!date || !movePost(post.id, date)) return
        setLanded(post.id)
        onDropped?.(date)
      },
      end: () => setMoving(null),
    })
  }
  return { moving, over, landed, canTake, lift }
}

/**
 * A swipe across the content steps it: left for forward. `onPointerDown` and `onPointerUp` go on
 * the swiped element, with `touch-action: pan-y` so the page still scrolls under a finger.
 */
export function useSwipe(onStep: (by: -1 | 1) => void, enabled = true) {
  const start = React.useRef<{ x: number; y: number } | null>(null)
  return {
    style: { touchAction: 'pan-y' } as React.CSSProperties,
    onPointerDown: (e: React.PointerEvent) => {
      start.current = { x: e.clientX, y: e.clientY }
    },
    onPointerUp: (e: React.PointerEvent) => {
      const s = start.current
      start.current = null
      if (!s || !enabled) return
      const dx = e.clientX - s.x
      if (Math.abs(dx) > 48 && Math.abs(dx) > 2 * Math.abs(e.clientY - s.y)) onStep(dx < 0 ? 1 : -1)
    },
  }
}

/**
 * The one bar: the title, which opens a menu, then what is on the right (Today when away, the
 * filters and the "+"). The looks share it so none of them grows a second bar.
 */
export function LookBar({
  title,
  label,
  menu,
  onTitle,
  children,
}: {
  title: string
  /** What the title's button does, for a screen reader. */
  label: string
  /** The menu under the title; `close` shuts it. */
  menu?: (close: () => void) => React.ReactNode
  /** Instead of a menu: what the title opens (a sheet). */
  onTitle?: () => void
  children: React.ReactNode
}) {
  const [open, setOpen] = React.useState(false)
  const root = React.useRef<HTMLDivElement>(null)
  const button = React.useRef<HTMLButtonElement>(null)
  const close = React.useCallback(() => setOpen(false), [])

  React.useEffect(() => {
    if (!open) return
    function onPointer(e: PointerEvent) {
      if (!root.current?.contains(e.target as Node)) close()
    }
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      close()
      button.current?.focus()
    }
    window.addEventListener('pointerdown', onPointer)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onPointer)
      window.removeEventListener('keydown', onKey)
    }
  }, [open, close])

  return (
    <div className="flex items-center gap-1.5 px-4 pt-1 pb-3">
      <div ref={root} className="relative min-w-0 flex-1">
        <h1 className="min-w-0 font-display text-[26px] leading-none tracking-[-0.03em] max-[360px]:text-[22px]">
          <button
            ref={button}
            type="button"
            aria-haspopup="dialog"
            aria-expanded={menu ? open : undefined}
            aria-label={`${title}. ${label}`}
            onClick={() => (onTitle ? onTitle() : open ? close() : setOpen(true))}
            className="flex h-10 max-w-full items-center gap-2 rounded-[10px] pr-1.5 text-left"
          >
            <span className="truncate">{title}</span>
            <span className="shrink-0 text-ink-4">
              <ChevronIcon open={open} size={11} />
            </span>
          </button>
        </h1>
        {open && menu && (
          <div
            role="dialog"
            aria-label={label}
            className="bb-menu absolute top-11 left-0 z-30 flex w-[300px] max-w-[calc(100vw-32px)] origin-top-left flex-col rounded-[16px] bg-page p-1.5 shadow-[0_0_0_1px_var(--line),var(--shadow-pop)]"
          >
            {menu(close)}
          </div>
        )}
      </div>
      <span className="flex shrink-0 items-center gap-1.5">{children}</span>
    </div>
  )
}

/** "Today", shown when the calendar is away from it. */
export function TodayPill({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="bb-pop flex h-9 items-center rounded-full px-3 text-[13px] font-medium text-ink-2 shadow-[inset_0_0_0_1px_var(--line)]"
    >
      Today
    </button>
  )
}

/** A radio row in the title's menu. */
export function MenuChoice({
  checked,
  onClick,
  children,
}: {
  checked: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={checked}
      onClick={onClick}
      className={`flex h-10 items-center rounded-[10px] px-3 text-left text-[15px] ${checked ? 'bg-surface text-ink' : 'text-ink-3'}`}
    >
      {children}
    </button>
  )
}

/** A day's events, as chips in their layer's colours. */
export function EventChips({ events }: { events: Week['events'] }) {
  if (events.length === 0) return null
  return (
    <div className="flex flex-wrap gap-1.5">
      {events.map((e) => (
        <EventChip
          key={e.shootId ?? e.eventId ?? e.text}
          event={e}
          className="flex h-7 items-center rounded-[7px] px-2.5 text-[13px] font-medium"
        >
          {e.text}
        </EventChip>
      ))}
    </div>
  )
}

const ROW = 'bb-touch-drag flex w-full items-center gap-3.5 py-2.5 text-left transition-opacity'

/**
 * One post: its photo, its hook, then the time, the stage and the accounts on one grey line.
 */
export function PostRow({
  post,
  dim = false,
  landed = false,
  delay,
  onOpen,
  onPointerDown,
}: {
  post: Post
  dim?: boolean
  landed?: boolean
  /** Rows arrive one after the other: this one's wait, in ms. */
  delay?: number
  onOpen: () => void
  onPointerDown?: (e: React.PointerEvent<HTMLButtonElement>) => void
}) {
  const standIn = useStandIn(post)
  const failed = post.stage === 'failed'
  return (
    <button
      type="button"
      onClick={onOpen}
      onPointerDown={onPointerDown}
      className={`${ROW} ${landed ? 'bb-land' : delay !== undefined ? 'bb-rise' : ''}`}
      style={{ opacity: dim ? 0.3 : 1, animationDelay: delay ? `${delay}ms` : undefined }}
    >
      <span
        data-photo
        className="relative block size-12 shrink-0 overflow-hidden rounded-[10px] bg-tile"
      >
        <Photo src={post.images[0]} standIn={standIn} />
        {post.stage === 'draft' && (
          <span className="pointer-events-none absolute inset-[3px] rounded-[7px] border border-dashed border-(--tile-dash)" />
        )}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className={`text-[15px] leading-snug truncate`}>{post.hook}</span>
        <span
          className={`flex items-center gap-1.5 text-[13px] tabular-nums ${failed ? 'font-medium text-fail-ink' : 'text-ink-3'}`}
        >
          {postTime(post)}
          <span
            className="size-1.5 rounded-full"
            style={{ background: `var(--stage-${post.stage})` }}
          />
          {STAGE_LABEL[post.stage]}
          <span className="ml-0.5 flex items-center gap-1 text-ink-4">
            {channelsOf(post).map((c) => (
              <PlatformLogo key={c} platform={c} size={12} />
            ))}
          </span>
        </span>
        {failed && post.error && (
          <span className="line-clamp-2 text-[13px] leading-[1.35] text-fail-ink">
            {post.error}
          </span>
        )}
      </span>
    </button>
  )
}

/** A plan in the list: a dashed square with its cover, the hook and why it sits on this day. */
export function IdeaRow({ mark, date, delay }: { mark: IdeaMark; date: string; delay?: number }) {
  const { brand } = useBrand()
  const open = useOpenIdea()
  const tint = tintOf(mark, brand.colour)
  const cover = useCoverOfHook(brand.id, mark.hook)
  return (
    <button
      type="button"
      onClick={() => open(mark, date)}
      aria-label={ideaLabel(mark, mark.why)}
      className={`${ROW} ${delay !== undefined ? 'bb-rise' : ''}`}
      style={{ animationDelay: delay ? `${delay}ms` : undefined }}
    >
      <span
        className={`relative flex size-12 shrink-0 items-center justify-center rounded-[10px] border border-dashed ${mark.suggested ? 'bg-(--insight-wash)' : ''}`}
        style={{ borderColor: `color-mix(in oklab, ${tint} 55%, transparent)`, color: tint }}
      >
        {cover ? (
          <span className="absolute inset-1.5 overflow-hidden rounded-[6px] bg-tile opacity-80">
            <Image src={cover} alt="" fill sizes="36px" className="object-cover" />
          </span>
        ) : (
          <SparkIcon size={11} />
        )}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-[15px] leading-snug">{mark.hook}</span>
        <span className="truncate text-[13px]" style={{ color: tint }}>
          {mark.suggested ? 'Suggested' : 'Idea'} · {mark.why}
        </span>
      </span>
    </button>
  )
}

/** A day's stories as one row: a ring around the first frame, the count and their times. */
export function StoriesRow({
  stories,
  delay,
  onOpen,
}: {
  stories: Story[]
  delay?: number
  onOpen: () => void
}) {
  if (stories.length === 0) return null
  const first = stories.find((s) => s.image)
  const times = stories.slice(0, 3).map((s) => s.time)
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${stories.length} ${stories.length > 1 ? 'stories' : 'story'}: open them`}
      className={`${ROW} ${delay !== undefined ? 'bb-rise' : ''}`}
      style={{ animationDelay: delay ? `${delay}ms` : undefined }}
    >
      <StoryRing image={first?.image} size={48} />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[15px] leading-snug">
          {stories.length} {stories.length > 1 ? 'stories' : 'story'}
        </span>
        <span className="truncate text-[13px] text-ink-3 tabular-nums">
          {times.join(' · ')}
          {stories.length > 3 ? ' …' : ''}
        </span>
      </span>
    </button>
  )
}

/**
 * A story's first frame in a ring, the way a phone shows a story. The ring is the frame's own
 * outline: drawn on a second box around it, the two rounded to different pixels and the frame sat
 * off centre.
 */
export function StoryRing({ image, size }: { image?: string; size: number }) {
  return (
    <span
      className="flex shrink-0 items-center justify-center"
      style={{ width: size, height: size }}
    >
      <span
        className="relative block overflow-hidden rounded-full bg-tile outline-[1.5px] outline-offset-1 outline-ink outline-solid"
        style={{ width: size - 5, height: size - 5 }}
      >
        {image && <Media src={image} sizes="64px" />}
      </span>
    </span>
  )
}

export function Photo({ src, standIn, words }: { src?: string; standIn?: string; words?: string }) {
  if (!src) {
    // A post with no media yet shows its idea's cover, faded, as the desktop tile does; with no
    // cover either, its words, where nothing beside the tile says them.
    if (!standIn)
      return words ? (
        <span className="absolute inset-0 overflow-hidden px-1 py-1.5 text-left">
          <span className="line-clamp-4 font-display text-[9px] leading-[1.15] [overflow-wrap:anywhere] text-ink-2">
            {words}
          </span>
        </span>
      ) : null
    return (
      <Image
        src={standIn}
        alt=""
        fill
        sizes="112px"
        draggable={false}
        className="object-cover opacity-40 grayscale-[0.4]"
      />
    )
  }
  if (src.startsWith('blob:') || isVideo(src)) return <Media src={src} sizes="112px" />
  return <Image src={src} alt="" fill sizes="112px" draggable={false} className="object-cover" />
}

/** The cover a post with no media borrows from its idea. */
export function useStandIn(post: Post): string | undefined {
  const cover = useCoverOfPost(useBrand().brand.id, post)
  return post.images.length === 0 ? cover : undefined
}
