'use client'

import Image from 'next/image'
import Link from 'next/link'
import * as React from 'react'

import { CarouselIcon, PlusIcon, ReelIcon, SparkIcon } from '@/components/icons'
import { Media } from '@/components/media'
import { PlatformLogo } from '@/components/platform-logos'
import { startTouchDrag } from '@/components/touch-drag'
import { Segmented } from '@/components/controls'
import type { Day, FeedMark, LayerKey, Post, Week } from '@/data/demo'
import { INSIGHTS_BY_BRAND } from '@/data/insights'

import type { CalendarMode } from './calendar-view'
import { channelsOf, itemsOf, postTime, type StageFilter } from './calendar-items'
import { useBrand } from './posts-store'
import { storiesOf } from './stories'
import { StoryDeck } from './story-panel'
import { IdeaTile } from './week-grid'

const LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
const WEEKDAY = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const STAGE_LABEL = {
  draft: 'Draft',
  awaiting: 'Awaiting approval',
  scheduled: 'Scheduled',
  posted: 'Posted',
  failed: 'Not posted',
} as const

/**
 * The schedule on a phone, in the same three views as on a wider screen, each in a phone's shape. A
 * sticky strip of the week's seven days (the whole month in Month) picks a day, with a dot per post
 * in its stage's colour; a swipe or the arrows step a week, or a month. Week lists the seven days
 * one under another; Day is the day by the hour; Month lists the day picked in the grid. Press and
 * hold a post to drag it onto another day, in the strip or in the week's list.
 */
export function Agenda({
  weeks,
  week,
  day,
  view,
  title,
  layers,
  stages,
  dayView,
  onView,
  onSelect,
  onStepWeek,
  onStepMonth,
  atToday,
  onToday,
  onOpenPost,
  onNewPost,
  onOpenStories,
  controls,
}: {
  weeks: Week[]
  week: number
  day: number
  view: CalendarMode
  title: string
  layers: Record<LayerKey, boolean>
  stages: StageFilter
  /** The Day view's hours, drawn by the page as on a wider screen. */
  dayView: React.ReactNode
  onView: (view: CalendarMode) => void
  onSelect: (week: number, day: number) => void
  onStepWeek: (by: -1 | 1) => void
  onStepMonth: (by: -1 | 1) => void
  atToday: boolean
  onToday: () => void
  onOpenPost: (postId: string) => void
  onNewPost: (dayN?: string, time?: string) => void
  onOpenStories: (dayN: string) => void
  /** The failed pill, the layers and the stage filter. */
  controls: React.ReactNode
}) {
  const { brand, library, byId, movePost } = useBrand()
  const [moving, setMoving] = React.useState<string | null>(null)
  const [over, setOver] = React.useState<string | null>(null)
  const [landed, setLanded] = React.useState<string | null>(null)
  const swipe = React.useRef<{ x: number; y: number } | null>(null)

  const month = view === 'month'
  const shownWeek = weeks[Math.min(week, weeks.length - 1)]!
  const shownDay = shownWeek.days[day]!
  const best = INSIGHTS_BY_BRAND[brand.id].best
  const movingFrom = moving
    ? weeks
        .flatMap((w) => w.days)
        .find((d) => itemsOf(d, byId, stages).posts.some((p) => p.id === moving))?.n
    : undefined
  const step = month ? onStepMonth : onStepWeek
  const canTake = (d: Day) => moving !== null && !d.past && d.n !== movingFrom

  function drop(postId: string, dayN: string | null) {
    if (!dayN || !movePost(postId, dayN)) return
    setLanded(postId)
    // In Day and Month, follow the post to its new day; the week's list shows it where it lands.
    if (view !== 'week') {
      weeks.forEach((w, wi) => w.days.forEach((d, di) => d.n === dayN && onSelect(wi, di)))
    }
  }

  const chip = (d: Day, wi: number, di: number) => {
    const posts = itemsOf(d, byId, stages).posts
    const chosen = wi === week && di === day
    const target = canTake(d)
    return (
      <button
        key={`${wi}-${di}`}
        type="button"
        data-drop={d.n}
        onClick={() => {
          onSelect(wi, di)
          if (view === 'week') {
            document.getElementById(`agenda-${d.n}`)?.scrollIntoView({ behavior: 'smooth' })
          }
        }}
        aria-label={`${WEEKDAY[di]} ${d.n}${posts.length ? `, ${posts.length} post${posts.length > 1 ? 's' : ''}` : ''}`}
        aria-pressed={chosen}
        className={`flex h-[50px] flex-col items-center justify-start gap-1 rounded-[14px] pt-1 transition-colors ${over === d.n && target ? 'bg-ink/10 shadow-[inset_0_0_0_1.5px_var(--ink)]' : target ? 'shadow-[inset_0_0_0_1px_var(--cal-ghost)]' : ''}`}
      >
        <span
          className={`flex size-8 items-center justify-center rounded-full text-[15px] font-medium tabular-nums ${chosen ? 'bg-ink text-page' : d.today ? 'text-ink shadow-[inset_0_0_0_1.5px_var(--ink)]' : d.past ? 'text-ink-5' : 'text-ink-2'}`}
        >
          {d.n}
        </span>
        <span className="flex h-1.5 items-center gap-[3px]">
          {posts.slice(0, 3).map((p) => (
            <span
              key={p.id}
              className="size-1.5 rounded-full"
              style={{ background: `var(--stage-${p.stage})` }}
            />
          ))}
        </span>
      </button>
    )
  }

  /**
   * A day's heading: its name and "Today". In Month it adds the best hour from Insights, which
   * starts a post; the Day view shades that hour instead, and the week's list keeps to the name.
   */
  const heading = (d: Day, di: number, size: 'lg' | 'sm', withBest: boolean) => (
    <div className="flex items-center justify-between gap-3">
      <h2
        className={`font-semibold tracking-[-0.01em] ${size === 'lg' ? 'text-[17px]' : 'text-[15px]'} ${d.past ? 'text-ink-3' : ''}`}
      >
        {size === 'lg' ? WEEKDAY[di] : WEEKDAY[di]!.slice(0, 3)} {d.n}
        {d.today && <span className="ml-2 text-[13px] font-medium text-ink-4">Today</span>}
      </h2>
      {withBest && !d.past && (
        <button
          type="button"
          onClick={() => onNewPost(d.n, best)}
          className="flex shrink-0 items-center gap-1 text-[12px] font-medium text-(--insight-6)"
        >
          <SparkIcon size={9} />
          Best at {best}
        </button>
      )}
    </div>
  )

  /** What a day holds: its events and stories, its posts as rows, its ideas, and a way to add one. */
  const body = (d: Day, w: Week, di: number, compact: boolean) => {
    const items = itemsOf(d, byId, stages)
    const stories = storiesOf(d.n, items, brand.id, library, byId)
    // In the week's list an event of several days shows once, on its first day, with its length.
    const events = w.events.filter(
      (e) =>
        layers[e.layer] &&
        (compact ? e.col - 1 === di : e.col - 1 <= di && di < e.col - 1 + e.span),
    )
    const empty = items.posts.length === 0 && items.ideas.length === 0 && stories.length === 0
    return (
      <>
        {(events.length > 0 || stories.length > 0) && (
          <div className="flex flex-wrap items-center gap-2">
            {events.map((e) => (
              <span
                key={e.text}
                className="flex h-7 items-center rounded-[6px] px-2.5 text-[12px] font-medium"
                style={{
                  background: `var(--layer-${e.layer})`,
                  color: `var(--layer-${e.layer}-ink)`,
                }}
              >
                {e.text}
                {compact && e.span > 1 && (
                  <span className="ml-1.5 font-normal opacity-70">· {e.span} days</span>
                )}
              </span>
            ))}
            <StoryDeck stories={stories} onOpen={() => onOpenStories(d.n)} size="md" />
          </div>
        )}
        {items.posts.length > 0 && (
          <ul className="flex flex-col gap-2.5">
            {items.posts.map((post) => (
              <li key={post.id}>
                <PostRow
                  post={post}
                  compact={compact}
                  dim={moving === post.id}
                  landed={landed === post.id}
                  onOpen={() => onOpenPost(post.id)}
                  onPointerDown={(e) => {
                    if (post.stage === 'posted') return
                    startTouchDrag(e, {
                      start: () => {
                        setLanded(null)
                        setMoving(post.id)
                      },
                      over: setOver,
                      drop: (dayN) => drop(post.id, dayN),
                      end: () => setMoving(null),
                    })
                  }}
                />
              </li>
            ))}
          </ul>
        )}
        {items.ideas.length > 0 && (
          <div className="flex flex-col gap-2">
            <span className="flex items-center gap-1.5 font-mono text-[10px] tracking-[0.08em] text-(--insight-6) uppercase">
              <SparkIcon size={9} />
              Ideas for this day
            </span>
            {compact ? (
              items.ideas.map((mark) => (
                <IdeaRow key={mark.hook} mark={mark} onNew={() => onNewPost(d.n)} />
              ))
            ) : (
              <div className="-mx-4 flex gap-3 overflow-x-auto px-4">
                {items.ideas.map((mark) => (
                  <div key={mark.hook} className="w-[124px] shrink-0">
                    <IdeaTile mark={mark} onNewPost={() => onNewPost(d.n)} />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {/* The week's list keeps an empty day to one quiet line; the header's plus adds to the day picked. */}
        {compact
          ? empty &&
            (d.past ? (
              <p className="-mt-1 text-[13px] text-ink-4">Nothing posted.</p>
            ) : (
              <button
                type="button"
                onClick={() => onNewPost(d.n)}
                className="-mt-1 flex items-center gap-1.5 self-start text-[13px] text-ink-4"
              >
                Nothing planned.
                <span className="font-medium text-ink-2">Add a post</span>
              </button>
            ))
          : !d.past && (
              <button
                type="button"
                onClick={() => onNewPost(d.n)}
                className="flex h-12 items-center justify-center gap-2 rounded-[14px] border border-dashed border-(--cal-ghost) text-[13px] font-medium text-ink-3"
              >
                <PlusIcon size={12} />
                {empty ? 'Nothing planned. Add a post' : 'Add a post'}
              </button>
            )}
        {!compact && d.past && empty && <p className="text-[13px] text-ink-4">Nothing posted.</p>}
      </>
    )
  }

  return (
    <div className="flex flex-col">
      <div className="relative flex items-center gap-2 px-4 pt-1 pb-3">
        <h1 className="min-w-0 truncate font-display text-[28px] leading-none tracking-[-0.03em] max-[360px]:text-[23px]">
          {title}
        </h1>
        <span className="ml-auto flex shrink-0 items-center gap-1.5">
          {controls}
          <button
            type="button"
            onClick={() => onNewPost(shownDay.past ? undefined : shownDay.n)}
            aria-label="New post"
            className="bb-press flex size-9 items-center justify-center rounded-full bg-ink text-page"
          >
            <PlusIcon size={13} />
          </button>
        </span>
      </div>
      <div className="flex items-center gap-2 px-4 pb-3">
        <div className="flex-1">
          <Segmented<CalendarMode>
            label="View"
            pill
            value={view}
            onChange={onView}
            options={[
              { value: 'month', label: 'Month' },
              { value: 'week', label: 'Week' },
              { value: 'day', label: 'Day' },
            ]}
          />
        </div>
        {/* Always there, so the view switch never changes width; quiet while today is shown. */}
        <button
          type="button"
          onClick={onToday}
          aria-disabled={atToday}
          className={`flex h-[38px] shrink-0 items-center rounded-full bg-surface px-3.5 text-[12.5px] font-medium transition-colors ${atToday ? 'text-ink-5' : 'text-ink-2'}`}
        >
          Today
        </button>
      </div>

      {/* The strip stays on screen while the list scrolls, so a dragged post always has a day to land on. */}
      <div
        className="sticky top-0 z-20 border-b border-line bg-page/95 px-2 pb-1.5 backdrop-blur-xl"
        style={{ touchAction: 'pan-y' }}
        onPointerDown={(e) => {
          swipe.current = { x: e.clientX, y: e.clientY }
        }}
        onPointerUp={(e) => {
          const s = swipe.current
          swipe.current = null
          if (!s || moving) return
          const dx = e.clientX - s.x
          if (Math.abs(dx) > 48 && Math.abs(dx) > 2 * Math.abs(e.clientY - s.y))
            step(dx < 0 ? 1 : -1)
        }}
      >
        <div className="flex items-center">
          <StepArrow
            label={month ? 'Previous month' : 'Previous week'}
            onClick={() => step(-1)}
            flip
          />
          <div className="grid flex-1 grid-cols-7">
            {LETTERS.map((l, i) => (
              <span
                key={i}
                className="py-1 text-center font-mono text-[10px] tracking-[0.06em] text-ink-4"
              >
                {l}
              </span>
            ))}
          </div>
          <StepArrow label={month ? 'Next month' : 'Next week'} onClick={() => step(1)} />
        </div>
        <div
          key={month ? 'month' : shownWeek.label}
          className="bb-swap mx-7 grid grid-cols-7 gap-y-0.5"
        >
          {month
            ? weeks.flatMap((w, wi) => w.days.map((d, di) => chip(d, wi, di)))
            : shownWeek.days.map((d, di) => chip(d, week, di))}
        </div>
      </div>

      {view === 'week' ? (
        <div key={shownWeek.label} className="bb-swap flex flex-col pb-8">
          {shownWeek.days.map((d, di) => (
            <section
              key={d.n}
              id={`agenda-${d.n}`}
              data-drop={d.n}
              aria-label={`${WEEKDAY[di]} ${d.n}`}
              // Clear of the sticky strip when a day in it is tapped.
              className={`flex scroll-mt-[96px] flex-col gap-3 border-b border-(--cal-line) px-4 py-4 transition-colors ${over === d.n && canTake(d) ? 'bg-(--cal-drop)' : ''} ${d.past && !itemsOf(d, byId, stages).posts.some((p) => p.stage === 'failed') ? 'opacity-70' : ''}`}
            >
              {heading(d, di, 'sm', false)}
              {body(d, shownWeek, di, true)}
            </section>
          ))}
        </div>
      ) : view === 'day' ? (
        <div key={shownDay.n} className="bb-swap flex flex-col gap-4 pt-5">
          <div className="px-4">{heading(shownDay, day, 'lg', false)}</div>
          {dayView}
        </div>
      ) : (
        <div
          key={shownDay.n}
          className={`bb-swap flex flex-col gap-4 px-4 pt-5 pb-8 ${shownDay.past && !itemsOf(shownDay, byId, stages).posts.some((p) => p.stage === 'failed') ? 'opacity-70' : ''}`}
        >
          {heading(shownDay, day, 'lg', true)}
          {body(shownDay, shownWeek, day, false)}
        </div>
      )}
    </div>
  )
}

/** An idea in the week's list: one row, in the idea's colour, that starts the post or opens Ideate. */
function IdeaRow({
  mark,
  onNew,
}: {
  mark: Extract<FeedMark, { kind: 'idea' }>
  onNew: () => void
}) {
  const { brand } = useBrand()
  const tint = mark.suggested ? 'var(--insight)' : `var(${brand.colour})`
  const inner = (
    <>
      <span style={{ color: tint }}>
        <SparkIcon size={11} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-display text-[15px] leading-[1.2]">{mark.hook}</span>
        <span
          className="truncate text-[12px]"
          style={{ color: `color-mix(in oklab, ${tint} 70%, var(--ink-3))` }}
        >
          {mark.suggested ? 'Suggested' : 'Idea'} · {mark.why}
        </span>
      </span>
    </>
  )
  const className =
    'flex w-full items-center gap-3 rounded-[14px] px-3 py-2.5 text-left shadow-[inset_0_0_0_1px_var(--cal-ghost)]'
  const style = {
    background: `linear-gradient(100deg, color-mix(in oklab, ${tint} 10%, var(--page)), var(--page) 70%)`,
  }
  return mark.suggested ? (
    <Link href="/ideate" className={className} style={style}>
      {inner}
    </Link>
  ) : (
    <button type="button" onClick={onNew} className={className} style={style}>
      {inner}
    </button>
  )
}

function PostRow({
  post,
  compact,
  dim,
  landed,
  onOpen,
  onPointerDown,
}: {
  post: Post
  /** The week's list: a smaller photo and a one-line hook. */
  compact: boolean
  dim: boolean
  landed: boolean
  onOpen: () => void
  onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => void
}) {
  const failed = post.stage === 'failed'
  const image = post.images[0]
  return (
    <button
      type="button"
      onClick={onOpen}
      onPointerDown={onPointerDown}
      className={`bb-touch-drag flex w-full items-center gap-3 rounded-[16px] bg-page p-2 pr-3 text-left transition-opacity ${landed ? 'bb-land' : ''} ${failed ? 'shadow-[0_0_0_1px_var(--fail-line),var(--shadow-soft)]' : 'shadow-[0_0_0_1px_var(--line),var(--shadow-soft)]'}`}
      style={{ opacity: dim ? 0.35 : 1 }}
    >
      <span
        className={`relative block aspect-[4/5] shrink-0 overflow-hidden rounded-[10px] bg-tile ${compact ? 'w-[52px]' : 'w-[68px]'}`}
      >
        {image?.startsWith('blob:') ? (
          <Media src={image} sizes="136px" />
        ) : (
          image && (
            <Image
              src={image}
              alt=""
              fill
              sizes="136px"
              draggable={false}
              className="object-cover"
            />
          )
        )}
        {post.stage === 'draft' && (
          <span className="absolute inset-[3px] rounded-[7px] border border-dashed border-(--tile-dash)" />
        )}
        <span className="absolute top-1.5 right-1.5 text-page drop-shadow-[0_1px_2px_var(--tile-glyph-shadow)]">
          {post.format === 'reel' ? <ReelIcon size={11} /> : <CarouselIcon size={11} />}
        </span>
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span
          className={`flex items-center gap-1.5 text-[12px] tabular-nums ${failed ? 'font-medium text-fail-ink' : 'text-ink-3'}`}
        >
          <span className="font-medium">{postTime(post)}</span>
          <span
            className="size-1.5 rounded-full"
            style={{ background: `var(--stage-${post.stage})` }}
          />
          {STAGE_LABEL[post.stage]}
        </span>
        <span
          className={`line-clamp-2 font-display leading-[1.2] ${compact ? 'text-[15px]' : 'text-[16px]'}`}
        >
          {post.hook}
        </span>
        <span className="flex items-center gap-1.5 text-ink-4">
          {channelsOf(post).map((c) => (
            <PlatformLogo key={c} platform={c} size={12} />
          ))}
        </span>
        {failed && post.error && (
          <span className="line-clamp-2 text-[12px] leading-[1.35] font-medium text-fail-ink">
            {post.error}
          </span>
        )}
      </span>
    </button>
  )
}

function StepArrow({
  label,
  onClick,
  flip = false,
}: {
  label: string
  onClick: () => void
  flip?: boolean
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="flex size-7 shrink-0 items-center justify-center rounded-full text-ink-4"
    >
      <svg
        width="11"
        height="11"
        viewBox="0 0 12 12"
        fill="none"
        aria-hidden="true"
        style={flip ? { transform: 'scaleX(-1)' } : undefined}
      >
        <path
          d="M4.5 2.5L8 6L4.5 9.5"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  )
}
