'use client'

import * as React from 'react'

import { PlusIcon, SparkIcon } from '@/components/icons'
import { Media } from '@/components/media'
import { PlatformLogo } from '@/components/platform-logos'
import type { CalendarEvent, Day, FeedMark } from '@/data/demo'
import { timeRange } from '@/features/shoot/model'
import { useShoots } from '@/features/shoot/shoots-store'

import { channelsOf, itemsOf, postTime, type StageFilter } from './calendar-items'
import { EventChip } from './event-chip'
import { useBrand } from './posts-store'
import { storiesOf } from './stories'
import { StoryDeck } from './story-panel'
import { IdeaTile, PostTile } from './week-grid'

const FIRST_HOUR = 7
const LAST_HOUR = 24
const HOUR_H = 72
/** A post card: 340px, or what is left before the stories column (about 88px). Set on the hours as `--card-w`. */
const CARD_W = 'var(--card-w)'
/** Posts in the same hour sit side by side; where there is no room for that, 24px apart in a stack. */
const LANE_STEP = `min(${CARD_W} + 12px, max(24px, 100% - 164px - ${CARD_W}))`

const STAGE_LABEL = {
  draft: 'Draft',
  scheduled: 'Scheduled',
  posted: 'Posted',
  failed: 'Failed',
} as const

const hourOf = (h: number) => `${String(h % 24).padStart(2, '0')}:00`

/** The hours' labels, also used for the band above them. */
const GUTTER = 'text-[13px] text-ink-4 tabular-nums'

/**
 * One day by the hour. Each post sits at its time as a thumbnail with its hook, channels and
 * stage; the brand's best two hours from Insights are shaded, so a good slot is visible before
 * anything is planned. A shoot covers its own hours, beside the posts. Stories and ideas without
 * a time sit above the hours. An empty hour starts a new post.
 */

export function DayView({
  day,
  events,
  stages,
  onOpenPost,
  onNewPost,
  onOpenStories,
}: {
  day: Day
  events: CalendarEvent[]
  stages: StageFilter
  onOpenPost: (postId: string) => void
  onNewPost: (date?: string, time?: string) => void
  onOpenStories: () => void
}) {
  const { brand, library, byId, times } = useBrand()
  const items = itemsOf(day, byId, stages)
  // On the core, from the brand's own posts once enough have numbers; none before.
  const bestTime = times?.best
  const best = bestTime ? Number(bestTime.split(':')[0]) : null
  const hours = Array.from({ length: LAST_HOUR - FIRST_HOUR }, (_, i) => FIRST_HOUR + i)
  const top = (time: string) => {
    const [h, m] = time.split(':').map(Number)
    return ((h ?? 12) - FIRST_HOUR + (m ?? 0) / 60) * HOUR_H
  }
  // Posts in the same hour step to the right, so none hides another.
  const placed = items.posts.map((post, i) => {
    const same = items.posts
      .slice(0, i)
      .filter((p) => postTime(p).slice(0, 2) === postTime(post).slice(0, 2))
    return { post, lane: same.length }
  })
  const stories = storiesOf(day.date, items, brand.id, library, byId)
  // A shoot has its hours, so it sits on them; the other events have none and stay above.
  const shoots = useShoots(brand.id)
  const timed = events.flatMap((event) => {
    const shoot = shoots.find((s) => s.id === event.shootId)
    return shoot ? [{ event, shoot }] : []
  })
  const allDay = events.filter((e) => !timed.some((t) => t.event === e))

  return (
    <div className="mx-auto w-full max-w-[1440px] px-10 pb-24">
      {/* A past day fades, but not when a post there failed: it still needs someone. */}
      <div
        className={`flex flex-col gap-6 ${day.past && !items.posts.some((p) => p.stage === 'failed') ? 'opacity-60' : ''}`}
      >
        {(allDay.length > 0 || stories.length > 0 || items.ideas.length > 0) && (
          // The band above the hours keeps the hours' gutter: what has no time, labelled on the left.
          <div className="grid grid-cols-[64px_minmax(0,1fr)] gap-y-3 border-b border-(--cal-line) pb-6">
            {(allDay.length > 0 || stories.length > 0) && (
              <>
                <span className={`${GUTTER} pt-2`}>All day</span>
                <div className="flex flex-wrap items-start gap-3">
                  {allDay.map((e) => (
                    <EventChip
                      key={e.shootId ?? e.eventId ?? e.text}
                      event={e}
                      className="flex h-7 items-center rounded-[6px] px-2.5 text-[13px] font-medium"
                    >
                      {e.text}
                    </EventChip>
                  ))}
                  <StoryDeck stories={stories} onOpen={onOpenStories} size="md" />
                </div>
              </>
            )}
            {items.ideas.length > 0 && (
              <>
                <span className={`${GUTTER} pt-2`}>Ideas</span>
                <IdeaPills key={day.date} ideas={items.ideas} date={day.date} />
              </>
            )}
          </div>
        )}

        <div
          className="relative grid grid-cols-[64px_minmax(0,1fr)] [--card-w:min(340px,100%_-_164px)]"
          style={{ height: hours.length * HOUR_H }}
        >
          {hours.map((h, i) => (
            <React.Fragment key={h}>
              <span
                className={GUTTER}
                style={{ position: 'absolute', top: i * HOUR_H - 7, left: 0 }}
              >
                {hourOf(h)}
              </span>
              <span
                className="absolute right-0 left-16 border-t border-(--cal-line)"
                style={{ top: i * HOUR_H, height: HOUR_H }}
              />
            </React.Fragment>
          ))}
          {best !== null && (
            <div
              className="pointer-events-none absolute right-0 left-16 rounded-[10px] bg-(--insight-wash) shadow-[inset_2px_0_0_var(--insight-4)]"
              style={{ top: (best - FIRST_HOUR) * HOUR_H, height: 2 * HOUR_H }}
            >
              <span className="absolute top-2 right-3 flex items-center gap-1 text-[13px] font-medium text-(--insight-6)">
                <SparkIcon size={8} />
                Best time to post
              </span>
            </div>
          )}
          {/*
            A shoot, over its hours, in the room right of the first post card and left of the best
            time's label and the stories: under a post that shares its hour, never over one.
          */}
          {timed.map(({ event, shoot }) => {
            const from = Math.max(top(shoot.start), 0)
            return (
              <EventChip
                key={shoot.id}
                event={event}
                className="absolute z-10 flex max-w-[300px] flex-col gap-0.5 overflow-hidden rounded-[10px] px-3 py-2.5 text-[12px] shadow-[inset_2px_0_0_var(--layer-shoot-ink)]"
                style={{
                  top: from + 2,
                  height: Math.max(top(shoot.end) - from - 4, 28),
                  left: `calc(76px + ${CARD_W} + 16px)`,
                  right: 148,
                }}
              >
                <span className="text-[13px] tabular-nums opacity-75">
                  Shoot · {timeRange(shoot)}
                </span>
                <span className="truncate text-[14px] font-medium">{shoot.title}</span>
                <span className="truncate opacity-75">{shoot.place}</span>
              </EventChip>
            )
          })}
          {/* Stories, each at its own time, in a narrow column at the rail's right edge. */}
          {stories.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={onOpenStories}
              title={`${s.time} · ${s.title}`}
              className="absolute right-3 z-10 flex items-center gap-2 rounded-[8px] p-1 transition-colors hover:bg-surface"
              style={{ top: top(s.time) + 4 }}
            >
              <span className="text-[13px] text-ink-4 tabular-nums">{s.time}</span>
              <span className="relative block h-[44px] w-[25px] overflow-hidden rounded-[4px] bg-tile shadow-[0_0_0_1px_var(--line)]">
                {s.image && <Media src={s.image} sizes="64px" />}
              </span>
            </button>
          ))}
          {placed.map(({ post, lane }) => (
            <div
              key={post.id}
              className={`absolute z-10 flex items-start gap-3 rounded-[12px] bg-page p-2 ${post.stage === 'failed' ? 'shadow-[0_0_0_1px_var(--fail-line),var(--shadow-soft)]' : 'shadow-[0_0_0_1px_var(--line),var(--shadow-soft)]'}`}
              style={{
                top: top(postTime(post)) + 4,
                width: CARD_W,
                left: `calc(76px + ${lane} * ${LANE_STEP})`,
              }}
            >
              <div className="w-[64px] shrink-0">
                <PostTile post={post} eager onOpen={() => onOpenPost(post.id)} />
              </div>
              <button
                type="button"
                onClick={() => onOpenPost(post.id)}
                className="flex min-w-0 flex-col gap-1.5 pt-0.5 text-left"
              >
                <span className="text-[13px] text-ink-3 tabular-nums">{postTime(post)}</span>
                <span className="line-clamp-2 font-display text-[15px] leading-[1.2]">
                  {post.hook}
                </span>
                <span className="flex items-center gap-2 text-[13px] text-ink-3">
                  <span className="flex items-center gap-1 text-ink-4">
                    {channelsOf(post).map((c) => (
                      <PlatformLogo key={c} platform={c} size={10} />
                    ))}
                  </span>
                  <span className="flex items-center gap-1">
                    <span
                      className="size-1.5 rounded-full"
                      style={{ background: `var(--stage-${post.stage})` }}
                    />
                    {STAGE_LABEL[post.stage]}
                  </span>
                </span>
                {post.stage === 'failed' && post.error && (
                  <span className="text-[13px] leading-[1.35] font-medium text-fail-ink">
                    {post.error}
                  </span>
                )}
              </button>
            </div>
          ))}
          {/* An empty hour starts a post at that hour: "+ 11:00" shows on hover and on focus.
              After the posts in the page, so a keyboard reaches the posts first; under them on
              screen, so a post's card stays on top. */}
          {!day.past &&
            hours.map((h, i) => (
              <button
                key={h}
                type="button"
                aria-label={`New post at ${hourOf(h)}`}
                onClick={() => onNewPost(day.date, hourOf(h))}
                className="group/hour absolute right-0 left-16 flex items-start px-3 pt-2 text-left outline-none transition-colors hover:bg-(--cal-hover) focus-visible:bg-(--cal-hover) focus-visible:shadow-[inset_0_0_0_2px_var(--ink)]"
                style={{ top: i * HOUR_H + 1, height: HOUR_H - 1 }}
              >
                <span className="flex items-center gap-1 text-[13px] text-ink-3 opacity-0 transition-opacity group-hover/hour:opacity-100 group-focus-visible/hour:opacity-100">
                  <PlusIcon size={10} />
                  {hourOf(h)}
                </span>
              </button>
            ))}
        </div>
      </div>
    </div>
  )
}

/** How many idea pills show before the rest fold behind "+N more". */
const PILLS_SHOWN = 6

/** A day's ideas as pills that wrap side by side; past six, the rest wait behind one quiet button. */
export function IdeaPills({
  ideas,
  date,
}: {
  ideas: Array<Extract<FeedMark, { kind: 'idea' }>>
  date: string
}) {
  const [all, setAll] = React.useState(false)
  const shown = all ? ideas : ideas.slice(0, PILLS_SHOWN)
  const more = ideas.length - shown.length
  return (
    <div className="flex flex-wrap items-center gap-2">
      {shown.map((mark) => (
        <IdeaTile key={mark.hook} mark={mark} date={date} row />
      ))}
      {more > 0 && (
        <button
          type="button"
          onClick={() => setAll(true)}
          className="h-8 rounded-full px-2.5 text-[13px] text-ink-3 transition-colors hover:text-ink"
        >
          +{more} more
        </button>
      )}
    </div>
  )
}
