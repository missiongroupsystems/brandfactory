'use client'

import Image from 'next/image'
import * as React from 'react'

import { CarouselIcon, PlusIcon, ReelIcon, SparkIcon } from '@/components/icons'
import { Media } from '@/components/media'
import { PlatformLogo } from '@/components/platform-logos'
import { startTouchDrag } from '@/components/touch-drag'
import type { CalendarEvent, Day, Post, Week } from '@/data/demo'
import { INSIGHTS_BY_BRAND } from '@/data/insights'

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
 * The schedule on a phone: one day at a time, as a list a thumb can read. A strip of the week's
 * seven days sits on top and opens into the whole month; each day shows a dot per post in its
 * stage's colour. Swipe the strip for the next week. Press and hold a post to drag it onto another
 * day of the strip, the phone's form of the calendar's drag.
 */
export function Agenda({
  weeks,
  week,
  day,
  monthTitle,
  events,
  stages,
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
  monthTitle: string
  /** The events on the chosen day, as the layers allow. */
  events: CalendarEvent[]
  stages: StageFilter
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
  const [month, setMonth] = React.useState(false)
  const [moving, setMoving] = React.useState<string | null>(null)
  const [over, setOver] = React.useState<string | null>(null)
  const [landed, setLanded] = React.useState<string | null>(null)
  const swipe = React.useRef<{ x: number; y: number } | null>(null)

  const shownWeek = weeks[Math.min(week, weeks.length - 1)]!
  const shownDay = shownWeek.days[day]!
  const items = itemsOf(shownDay, byId, stages)
  const stories = storiesOf(shownDay.n, items, brand.id, library, byId)
  const best = INSIGHTS_BY_BRAND[brand.id].best
  const movingFrom = moving
    ? weeks
        .flatMap((w) => w.days)
        .find((d) => itemsOf(d, byId, stages).posts.some((p) => p.id === moving))?.n
    : undefined
  const step = month ? onStepMonth : onStepWeek

  function drop(postId: string, dayN: string | null) {
    if (!dayN || !movePost(postId, dayN)) return
    setLanded(postId)
    // Follow the post to its new day.
    weeks.forEach((w, wi) => w.days.forEach((d, di) => d.n === dayN && onSelect(wi, di)))
  }

  const chip = (d: Day, wi: number, di: number) => {
    const posts = itemsOf(d, byId, stages).posts
    const chosen = wi === week && di === day
    const target = moving !== null && !d.past && d.n !== movingFrom
    return (
      <button
        key={`${wi}-${di}`}
        type="button"
        data-drop={d.n}
        onClick={() => {
          onSelect(wi, di)
          setMonth(false)
        }}
        aria-label={`${WEEKDAY[di]} ${d.n}${posts.length ? `, ${posts.length} post${posts.length > 1 ? 's' : ''}` : ''}`}
        aria-pressed={chosen}
        className={`flex h-[52px] flex-col items-center justify-start gap-1 rounded-[14px] pt-1.5 transition-colors ${over === d.n && target ? 'bg-ink/10 shadow-[inset_0_0_0_1.5px_var(--ink)]' : target ? 'shadow-[inset_0_0_0_1px_var(--cal-ghost)]' : ''}`}
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

  return (
    <div className="flex flex-col">
      <div className="relative flex items-center gap-1 px-4 pt-1 pb-2">
        <button
          type="button"
          onClick={() => setMonth((m) => !m)}
          aria-expanded={month}
          className="flex items-center gap-1.5 font-display text-[28px] leading-none tracking-[-0.03em]"
        >
          {monthTitle}
          <svg
            width="14"
            height="14"
            viewBox="0 0 12 12"
            fill="none"
            aria-hidden="true"
            className={`mt-1 text-ink-4 transition-transform duration-300 ${month ? 'rotate-180' : ''}`}
          >
            <path
              d="M3 4.5L6 7.5L9 4.5"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <span className="ml-auto flex items-center gap-1.5">{controls}</span>
      </div>

      {/* The strip stays on screen while the day scrolls, so a dragged post always has a day to land on. */}
      <div
        className="sticky top-0 z-20 border-b border-line bg-page/95 px-2 pb-2 backdrop-blur-xl"
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
                className="py-1.5 text-center font-mono text-[10px] tracking-[0.06em] text-ink-4"
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

      <div
        key={shownDay.n}
        className={`bb-swap flex flex-col gap-4 px-4 pt-5 pb-8 ${shownDay.past && !items.posts.some((p) => p.stage === 'failed') ? 'opacity-70' : ''}`}
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-[17px] font-semibold tracking-[-0.01em]">
            {WEEKDAY[day]} {shownDay.n}
            {shownDay.today && (
              <span className="ml-2 text-[13px] font-medium text-ink-4">Today</span>
            )}
          </h2>
          {!atToday && (
            <button
              type="button"
              onClick={onToday}
              className="bb-pop ml-auto flex h-7 items-center rounded-full bg-surface px-3 text-[12px] font-medium text-ink-2"
            >
              Today
            </button>
          )}
          {!shownDay.past && (
            <button
              type="button"
              onClick={() => onNewPost(shownDay.n, best)}
              className="flex shrink-0 items-center gap-1 text-[12px] font-medium text-(--insight-6)"
            >
              <SparkIcon size={9} />
              Best at {best}
            </button>
          )}
        </div>

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
              </span>
            ))}
            <StoryDeck stories={stories} onOpen={() => onOpenStories(shownDay.n)} size="md" />
          </div>
        )}

        {items.posts.length > 0 && (
          <ul className="flex flex-col gap-2.5">
            {items.posts.map((post) => (
              <li key={post.id}>
                <PostRow
                  post={post}
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
            <div className="-mx-4 flex gap-3 overflow-x-auto px-4">
              {items.ideas.map((mark) => (
                <div key={mark.hook} className="w-[124px] shrink-0">
                  <IdeaTile mark={mark} onNewPost={() => onNewPost(shownDay.n)} />
                </div>
              ))}
            </div>
          </div>
        )}

        {items.posts.length === 0 && items.ideas.length === 0 && stories.length === 0 && (
          <p className="py-6 text-center text-[14px] text-ink-4">Nothing planned.</p>
        )}

        {!shownDay.past && (
          <button
            type="button"
            onClick={() => onNewPost(shownDay.n)}
            className="flex h-12 items-center justify-center gap-2 rounded-[14px] border border-dashed border-(--cal-ghost) text-[13px] font-medium text-ink-3"
          >
            <PlusIcon size={12} />
            Add a post
          </button>
        )}

        {items.posts.some((p) => p.stage !== 'posted') && (
          <p className="text-center text-[12px] text-ink-4">
            Press and hold a post, then drop it on a day.
          </p>
        )}
      </div>
    </div>
  )
}

function PostRow({
  post,
  dim,
  landed,
  onOpen,
  onPointerDown,
}: {
  post: Post
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
      <span className="relative block aspect-[4/5] w-[68px] shrink-0 overflow-hidden rounded-[10px] bg-tile">
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
        <span className="line-clamp-2 font-display text-[16px] leading-[1.2]">{post.hook}</span>
        <span className="flex items-center gap-1.5 text-ink-4">
          {channelsOf(post).map((c) => (
            <PlatformLogo key={c} platform={c} size={12} />
          ))}
        </span>
        {failed && post.error && (
          <span className="text-[12px] leading-[1.35] font-medium text-fail-ink">{post.error}</span>
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
