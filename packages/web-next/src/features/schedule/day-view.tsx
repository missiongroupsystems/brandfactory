'use client'

import * as React from 'react'

import { SparkIcon } from '@/components/icons'
import { Media } from '@/components/media'
import { PlatformLogo } from '@/components/platform-logos'
import type { CalendarEvent, Day } from '@/data/demo'
import { INSIGHTS_BY_BRAND } from '@/data/insights'

import { channelsOf, itemsOf, postTime, type StageFilter } from './calendar-items'
import { useBrand } from './posts-store'
import { storiesOf } from './stories'
import { StoryDeck } from './story-panel'
import { IdeaTile, PostTile } from './week-grid'

const FIRST_HOUR = 7
const LAST_HOUR = 24
const HOUR_H = 72

const STAGE_LABEL = {
  draft: 'Draft',
  awaiting: 'Awaiting approval',
  scheduled: 'Scheduled',
  posted: 'Posted',
  failed: 'Failed',
} as const

/**
 * One day by the hour. Each post sits at its time as a thumbnail with its hook, channels and
 * stage; the brand's best two hours from Insights are shaded, so a good slot is visible before
 * anything is planned. Stories and ideas without a time sit above the hours. An empty hour starts
 * a new post.
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
  onNewPost: (dayN?: string, time?: string) => void
  onOpenStories: () => void
}) {
  const { brand, library, byId } = useBrand()
  const items = itemsOf(day, byId, stages)
  const best = Number(INSIGHTS_BY_BRAND[brand.id].best.split(':')[0])
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
  const stories = storiesOf(day.n, items, brand.id, library, byId)

  return (
    <div className="mx-auto w-full max-w-[1440px] px-10 pb-24 max-md:px-4">
      {/* A past day fades, but not when a post there failed: it still needs someone. */}
      <div
        className={`flex flex-col gap-6 ${day.past && !items.posts.some((p) => p.stage === 'failed') ? 'opacity-60' : ''}`}
      >
        {(events.length > 0 || stories.length > 0 || items.ideas.length > 0) && (
          <div className="flex flex-wrap items-start gap-6 border-b border-(--cal-line) pb-6">
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
            <StoryDeck stories={stories} onOpen={onOpenStories} size="md" />
            {items.ideas.length > 0 && (
              <div className="flex flex-col gap-2">
                <span className="flex items-center gap-1.5 font-mono text-[10px] tracking-[0.08em] text-(--insight-6) uppercase">
                  <SparkIcon size={9} />
                  Ideas for this day
                </span>
                <div className="flex gap-3">
                  {items.ideas.map((mark) => (
                    <div key={mark.hook} className="w-[124px]">
                      <IdeaTile mark={mark} onNewPost={() => onNewPost(day.n)} />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <div
          className="relative grid grid-cols-[64px_minmax(0,1fr)]"
          style={{ height: hours.length * HOUR_H }}
        >
          {hours.map((h, i) => (
            <React.Fragment key={h}>
              <span
                className="font-mono text-[10px] text-ink-4 tabular-nums"
                style={{ position: 'absolute', top: i * HOUR_H - 6, left: 0 }}
              >
                {String(h % 24).padStart(2, '0')}:00
              </span>
              <button
                type="button"
                tabIndex={-1}
                aria-hidden="true"
                onClick={
                  day.past ? undefined : () => onNewPost(day.n, `${String(h).padStart(2, '0')}:00`)
                }
                className="absolute right-0 left-16 border-t border-(--cal-line) transition-colors hover:bg-(--cal-hover)"
                style={{ top: i * HOUR_H, height: HOUR_H }}
              />
            </React.Fragment>
          ))}
          <div
            className="pointer-events-none absolute right-0 left-16 rounded-[10px] bg-(--insight-wash) shadow-[inset_2px_0_0_var(--insight-4)]"
            style={{ top: (best - FIRST_HOUR) * HOUR_H, height: 2 * HOUR_H }}
          >
            <span className="absolute top-2 right-3 flex items-center gap-1 text-[11px] font-medium text-(--insight-6)">
              <SparkIcon size={8} />
              Best time to post
            </span>
          </div>
          {/* Stories, each at its own time, in a narrow column at the rail's right edge. */}
          {stories.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={onOpenStories}
              title={`${s.time} · ${s.title}`}
              className="absolute right-3 flex items-center gap-2 rounded-[8px] p-1 transition-colors hover:bg-surface"
              style={{ top: top(s.time) + 4 }}
            >
              <span className="font-mono text-[10px] text-ink-4 tabular-nums">{s.time}</span>
              <span className="relative block h-[44px] w-[25px] overflow-hidden rounded-[4px] bg-tile shadow-[0_0_0_1px_var(--line)]">
                {s.image && <Media src={s.image} sizes="64px" />}
              </span>
            </button>
          ))}
          {placed.map(({ post, lane }) => (
            <div
              key={post.id}
              className={`absolute flex w-[340px] items-start gap-3 rounded-[12px] bg-page p-2 ${post.stage === 'failed' ? 'shadow-[0_0_0_1px_var(--fail-line),var(--shadow-soft)]' : 'shadow-[0_0_0_1px_var(--line),var(--shadow-soft)]'}`}
              style={{ top: top(postTime(post)) + 4, left: 76 + lane * 352 }}
            >
              <div className="w-[64px] shrink-0">
                <PostTile post={post} eager onOpen={() => onOpenPost(post.id)} />
              </div>
              <button
                type="button"
                onClick={() => onOpenPost(post.id)}
                className="flex min-w-0 flex-col gap-1.5 pt-0.5 text-left"
              >
                <span className="font-mono text-[10.5px] text-ink-3 tabular-nums">
                  {postTime(post)}
                </span>
                <span className="line-clamp-2 font-display text-[15px] leading-[1.2]">
                  {post.hook}
                </span>
                <span className="flex items-center gap-2 text-[11px] text-ink-3">
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
                  <span className="text-[11.5px] leading-[1.35] font-medium text-fail-ink">
                    {post.error}
                  </span>
                )}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
