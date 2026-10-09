'use client'

import Image from 'next/image'
import * as React from 'react'

import { CarouselIcon, PlusIcon, ReelIcon } from '@/components/icons'
import type { CalendarEvent, Day, FeedMark, LayerKey, Post, Stage, Week } from '@/data/demo'
import { feedsOf } from '@/data/demo'
import { useCoverOfHook, useCoverOfPost } from '@/features/ideate/ideas-store'

import { ideaLabel, useOpenIdea } from './open-idea'

import { Media } from '@/components/media'
import { PlatformLogo } from '@/components/platform-logos'
import { startTouchDrag, touchDragPending } from '@/components/touch-drag'

import {
  channelsOf,
  countsOf,
  failedOf,
  itemsOf,
  postTime,
  storyCount,
  type StageFilter,
} from './calendar-items'
import { storiesOf } from './stories'
import { StoryDeck } from './story-panel'
import { useBrand } from './posts-store'

const DAY_NAMES = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']

const CHANNEL_NAME = {
  ig: 'Instagram',
  tt: 'TikTok',
  yt: 'YouTube',
  fb: 'Facebook',
  li: 'LinkedIn',
}

const STAGE_LABEL: Record<Stage, string> = {
  draft: 'Draft',
  scheduled: 'Scheduled',
  posted: 'Posted',
  failed: 'Failed',
}

/**
 * A post being dragged between days, shared by every cell. Native drag and drop: the data on the
 * drag cannot be read until the drop, so the cells learn which post is moving from here.
 */
interface DragValue {
  postId: string | null
  /** The post that just landed, so its tile can settle in. */
  landed: string | null
  start: (postId: string) => void
  end: () => void
  /** A touch drag names its post: it began before `postId` was set. */
  drop: (dayN: string, postId?: string) => void
  /** The day under a finger that drags a post. */
  touchOver: string | null
  setTouchOver: (dayN: string | null) => void
}

const DragContext = React.createContext<DragValue>({
  postId: null,
  landed: null,
  start: () => {},
  end: () => {},
  drop: () => {},
  touchOver: null,
  setTouchOver: () => {},
})

/**
 * Seven days. No week-number column: the team plans by dates, as Google, Apple and Brandwatch show
 * them. The lane overlay reuses the grid so bars meet the cells.
 */
const GRID = 'grid grid-cols-[repeat(7,minmax(0,1fr))]'

/** Cell top padding (10) + the date row (24) + a gap (8): where the first lane starts. */
const LANE_TOP = 42
const LANE_H = 18
const LANE_GAP = 3

/** First-fit packing: each event takes the first lane that is free across its days. */
export function packLanes(events: CalendarEvent[]): { event: CalendarEvent; lane: number }[] {
  const ends: number[] = []
  return [...events]
    .sort((a, b) => a.col - b.col || b.span - a.span)
    .map((event) => {
      let lane = ends.findIndex((end) => end < event.col)
      if (lane === -1) lane = ends.length
      ends[lane] = event.col + event.span - 1
      return { event, lane }
    })
}

/**
 * The month and week views. Month: every week, each day a count per platform, no thumbnails (a day
 * can hold 28 stories); a day opens in the day view. Week: one week, each day its posts as
 * thumbnails by time, with drag between days.
 */

/**
 * The width a tile asks next/image for. A tile is about 175 px wide, and a wide photo that covers
 * a tall tile needs about 1.6 times that: "124px" loaded a blurry 256 px image on a 2x screen.
 */
const TILE_SIZES = '280px'

export function WeekGrid({
  weeks,
  layers,
  stages,
  mode,
  onOpenPost,
  onNewPost,
  onOpenDay,
  onOpenStories,
}: {
  weeks: Week[]
  layers: Record<LayerKey, boolean>
  stages: StageFilter
  mode: 'month' | 'week'
  onOpenPost: (postId: string) => void
  onNewPost: (dayN?: string, time?: string) => void
  onOpenDay: (week: number, day: number) => void
  /** Opens a day's stories in the side panel. */
  onOpenStories: (dayN: string) => void
}) {
  const todayCol = weeks.flatMap((w) => w.days).findIndex((d) => d.today) % 7
  const { movePost } = useBrand()
  const [postId, setPostId] = React.useState<string | null>(null)
  const [landed, setLanded] = React.useState<string | null>(null)
  const [touchOver, setTouchOver] = React.useState<string | null>(null)
  const drag = React.useMemo<DragValue>(
    () => ({
      postId,
      landed,
      // A frame later, so the browser takes the drag image before the tile fades.
      start: (id) => {
        setLanded(null)
        requestAnimationFrame(() => setPostId(id))
      },
      end: () => setPostId(null),
      drop: (dayN, id = postId ?? undefined) => {
        if (id && movePost(id, dayN)) setLanded(id)
        setPostId(null)
      },
      touchOver,
      setTouchOver,
    }),
    [postId, landed, touchOver, movePost],
  )
  return (
    <DragContext.Provider value={drag}>
      <WideTiles.Provider value={mode === 'week'}>
        <div className="mx-auto w-full max-w-[1440px] px-10 pb-24">
          <div className="overflow-x-auto">
            <div className="flex min-w-[760px] flex-col">
              <div className={`${GRID} pb-2`}>
                {DAY_NAMES.map((d, i) => (
                  <span
                    key={d}
                    className={`px-2.5 font-mono text-[10px] tracking-[0.08em] ${i === todayCol ? 'text-ink' : 'text-ink-5'}`}
                  >
                    {d}
                  </span>
                ))}
              </div>
              <div className="border-b border-(--cal-line)">
                {weeks.map((week, w) => (
                  <WeekRow
                    key={week.label}
                    week={week}
                    layers={layers}
                    stages={stages}
                    mode={mode}
                    onOpenDay={(d) => onOpenDay(w, d)}
                    onOpenStories={onOpenStories}
                    // The first two weeks fill the first screen: their photos load first.
                    eager={w <= 1}
                    onOpenPost={onOpenPost}
                    onNewPost={onNewPost}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </WideTiles.Provider>
    </DragContext.Provider>
  )
}

function WeekRow({
  week,
  layers,
  stages,
  mode,
  eager,
  onOpenPost,
  onNewPost,
  onOpenDay,
  onOpenStories,
}: {
  week: Week
  layers: Record<LayerKey, boolean>
  stages: StageFilter
  mode: 'month' | 'week'
  eager: boolean
  onOpenPost: (postId: string) => void
  onNewPost: (dayN?: string, time?: string) => void
  onOpenDay: (day: number) => void
  onOpenStories: (dayN: string) => void
}) {
  const lanes = packLanes(week.events.filter((e) => layers[e.layer]))
  const laneCount = lanes.reduce((n, l) => Math.max(n, l.lane + 1), 0)
  const laneSpace = laneCount ? laneCount * LANE_H + (laneCount - 1) * LANE_GAP + 6 : 0
  return (
    <div className={`${GRID} relative border-t border-(--cal-line)`}>
      {week.days.map((day, i) => (
        <DayCell
          key={day.n}
          day={day}
          stages={stages}
          mode={mode}
          onOpen={() => onOpenDay(i)}
          onOpenStories={() => onOpenStories(day.n)}
          name={DAY_NAMES[i]}
          first={i === 0}
          laneSpace={laneSpace}
          eager={eager}
          onOpenPost={onOpenPost}
          onNewPost={onNewPost}
        />
      ))}
      <div
        className={`${GRID} pointer-events-none absolute inset-x-0`}
        style={{ top: LANE_TOP, gridAutoRows: LANE_H, rowGap: LANE_GAP }}
      >
        {lanes.map(({ event, lane }) => (
          <span
            key={event.text}
            title={event.text}
            className="bb-lane pointer-events-auto mx-1 flex min-w-0 items-center rounded-[4px] px-2 text-[10.5px] leading-none font-medium"
            style={{
              gridColumn: `${event.col} / span ${event.span}`,
              gridRow: lane + 1,
              background: `var(--layer-${event.layer})`,
              color: `var(--layer-${event.layer}-ink)`,
            }}
          >
            <span className="truncate">{event.text}</span>
          </span>
        ))}
      </div>
    </div>
  )
}

function DayCell({
  day,
  stages,
  mode,
  onOpen,
  onOpenStories,
  name,
  first,
  laneSpace,
  eager,
  onOpenPost,
  onNewPost,
}: {
  day: Day
  stages: StageFilter
  mode: 'month' | 'week'
  onOpen: () => void
  onOpenStories: () => void
  name: string
  first: boolean
  laneSpace: number
  eager: boolean
  onOpenPost: (postId: string) => void
  onNewPost: (dayN?: string, time?: string) => void
}) {
  // A busy day can hold several feed posts; most hold one or none.
  const feeds = feedsOf(day)
  const items = itemsOf(day, useBrand().byId, stages)
  const drag = React.useContext(DragContext)
  const [over, setOver] = React.useState(false)
  // A day of the month around: its number, dimmed, and nothing to press or drop on.
  if (day.outside) {
    return (
      <div
        aria-hidden="true"
        className={`px-2.5 pt-2.5 pb-5 ${first ? '' : 'border-l border-(--cal-line)'}`}
      >
        <span className="flex size-[22px] items-center justify-center text-[12px] font-medium text-ink-5 tabular-nums opacity-40">
          {day.n}
        </span>
      </div>
    )
  }
  // A past day takes nothing, and the day a post is on is not a move.
  const canDrop =
    drag.postId !== null &&
    !day.past &&
    !feeds.some((m) => m.kind === 'post' && m.postId === drag.postId)
  return (
    <div
      className={`group relative flex min-w-0 flex-col px-2.5 pt-2.5 pb-5 transition-colors ${first ? '' : 'border-l border-(--cal-line)'} ${day.past ? '' : 'hover:bg-(--cal-hover)'}`}
      aria-label={`${name} ${day.n}`}
      role="group"
      data-drop={day.n}
      onDragOver={(e) => {
        if (!canDrop) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        if (!over) setOver(true)
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false)
      }}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        if (canDrop) drag.drop(day.n)
      }}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-1.5 rounded-[10px] bg-(--cal-drop) shadow-[inset_0_0_0_1px_var(--cal-ghost)] transition-opacity duration-200"
        style={{ opacity: (over || drag.touchOver === day.n) && canDrop ? 1 : 0 }}
      />
      <div
        className={`flex h-6 items-center justify-between gap-1 ${day.past ? 'opacity-40' : ''}`}
      >
        <span
          className={`flex size-[22px] items-center justify-center rounded-full text-[12px] font-medium tabular-nums ${day.today ? 'bg-ink text-page' : day.past ? 'text-ink-4' : 'text-ink-2'}`}
        >
          {day.n}
        </span>
      </div>
      <div
        aria-hidden="true"
        className="shrink-0 transition-[height] duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)]"
        style={{ height: laneSpace }}
      />
      {/* A past day fades, but a post that failed there stays in full: it still needs someone. */}
      <div
        className={`mt-2.5 ${day.past && !items.posts.some((p) => p.stage === 'failed') ? 'opacity-40' : ''}`}
      >
        {mode === 'month' ? (
          <DaySummary day={day} stages={stages} onOpen={onOpen} />
        ) : (
          <WeekDay
            day={day}
            stages={stages}
            onOpenStories={onOpenStories}
            eager={eager}
            onOpenPost={onOpenPost}
            onNewPost={onNewPost}
          />
        )}
      </div>
    </div>
  )
}

/**
 * A month day: one chip per platform with its count, stories counted on Instagram, and the ideas
 * still to make. No thumbnails: the day opens in the day view for those.
 */
function DaySummary({
  day,
  stages,
  onOpen,
}: {
  day: Day
  stages: StageFilter
  onOpen: () => void
}) {
  const { brand, byId } = useBrand()
  const items = itemsOf(day, byId, stages)
  const counts = countsOf(items)
  // Plans in the tiles' language: a dashed mark, the team's ideas apart from suggestions.
  const plans = [
    {
      n: items.ideas.filter((m) => !m.suggested).length,
      word: 'idea',
      tint: `var(${brand.colour})`,
    },
    { n: items.ideas.filter((m) => m.suggested).length, word: 'suggested', tint: 'var(--insight)' },
  ].filter((p) => p.n > 0)
  const failed = failedOf(items)
  const stories = storyCount(items)
  const empty =
    counts.length === 0 && failed.length === 0 && items.ideas.length === 0 && stories === 0
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Open ${day.n} in the day view`}
      className="flex min-h-[64px] w-full flex-wrap content-start items-start gap-1 rounded-[8px] text-left"
    >
      {failed.map(({ channel, n }) => (
        <span
          key={channel ?? 'none'}
          title={`${n} post${n > 1 ? 's' : ''} did not go out${channel ? ` on ${CHANNEL_NAME[channel]}` : ''}`}
          className="flex h-[22px] items-center gap-1.5 rounded-full bg-(--fail-soft) px-2 text-[11px] font-medium text-fail-ink tabular-nums shadow-[inset_0_0_0_1px_var(--fail-line)]"
        >
          <span className="size-1.5 rounded-full bg-fail" />
          {channel && <PlatformLogo platform={channel} size={11} />}
          {n}
        </span>
      ))}
      {counts.map(({ channel, n }) => (
        <span
          key={channel}
          title={`${n} on ${CHANNEL_NAME[channel]}`}
          className="flex h-[22px] items-center gap-1 rounded-full bg-surface px-1.5 text-[11px] font-medium text-ink-2 tabular-nums"
        >
          <PlatformLogo platform={channel} size={11} />
          {n}
        </span>
      ))}
      {stories > 0 && (
        <span
          title={`${stories} ${stories > 1 ? 'stories' : 'story'}`}
          className="flex h-[22px] items-center gap-1 rounded-full bg-surface px-1.5 text-[11px] font-medium text-ink-2 tabular-nums"
        >
          <StoriesIcon />
          {stories}
        </span>
      )}
      {plans.map(({ n, word, tint }) => (
        <span
          key={word}
          title={`${n} ${word === 'idea' && n > 1 ? 'ideas' : word}`}
          className="flex h-[22px] items-center gap-1 rounded-full bg-surface px-1.5 text-[11px] font-medium text-ink-2 tabular-nums"
        >
          {/* A plan's mark: the idea card's dashed outline, small. */}
          <span
            aria-hidden="true"
            className="size-[10px] rounded-[3px] border border-dashed"
            style={{ borderColor: tint }}
          />
          <span className="sr-only">{word === 'idea' ? 'Ideas:' : 'Suggested:'}</span>
          {n}
        </span>
      ))}
      {empty && <span className="sr-only">Nothing on this day</span>}
    </button>
  )
}

/** Two story frames, for the Month view's story count. */
function StoriesIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <rect x="1.5" y="1.5" width="5" height="9" rx="1.2" fill="currentColor" />
      <rect x="7.6" y="2.5" width="3" height="7" rx="1" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  )
}

/** A week day: its stories as a deck that opens them, then each post with its time and channels. */
function WeekDay({
  day,
  stages,
  eager,
  onOpenPost,
  onNewPost,
  onOpenStories,
}: {
  day: Day
  stages: StageFilter
  eager: boolean
  onOpenPost: (postId: string) => void
  onNewPost: (dayN?: string, time?: string) => void
  onOpenStories: () => void
}) {
  const { brand, library, byId } = useBrand()
  const items = itemsOf(day, byId, stages)
  const stories = storiesOf(day.n, items, brand.id, library, byId)
  return (
    <div className="flex flex-col gap-3">
      {/* The story row keeps its height on an empty day, so every day's posts start level. */}
      <div className="flex h-[34px] items-center">
        <StoryDeck stories={stories} onOpen={onOpenStories} />
      </div>
      {items.posts.map((post) => (
        <div key={post.id} className="flex flex-col gap-1.5">
          <PostTile post={post} eager={eager} onOpen={() => onOpenPost(post.id)} />
          <span
            className={`flex items-center gap-1.5 text-[11px] tabular-nums ${post.stage === 'failed' ? 'font-medium text-fail-ink' : 'text-ink-3'}`}
          >
            {postTime(post)}
            {post.stage === 'failed' && <span>· Fix it</span>}
            <span className="flex items-center gap-1 text-ink-4">
              {channelsOf(post).map((c) => (
                <PlatformLogo key={c} platform={c} size={10} />
              ))}
            </span>
          </span>
        </div>
      ))}
      {items.ideas.map((mark) => (
        <IdeaTile key={mark.hook} mark={mark} dayN={day.n} />
      ))}
      {!day.past && (
        <button
          type="button"
          onClick={() => onNewPost(day.n)}
          aria-label={`New post on ${day.n}`}
          className="flex h-9 max-w-[200px] items-center justify-center rounded-[8px] border border-dashed border-(--cal-ghost) text-ink-4 opacity-0 transition-opacity duration-200 group-hover:opacity-100 hover:text-ink focus-visible:opacity-100"
        >
          <PlusIcon size={12} />
        </button>
      )}
    </div>
  )
}

const TILE_BASE = 'relative block aspect-[4/5] w-full overflow-hidden rounded-[8px]'
const TILE = `${TILE_BASE} max-w-[124px]`

/** The week view's tiles fill their day column; the month's stay small. */
const WideTiles = React.createContext(false)
function useTile(): string {
  return React.useContext(WideTiles) ? `${TILE_BASE} max-w-[200px]` : TILE
}

/** The idea's colour: the brand's for the team's own, the insights' green for a suggestion. */
const tintOf = (mark: Extract<FeedMark, { kind: 'idea' }>, brandColour: string) =>
  mark.suggested ? 'var(--insight)' : `var(${brandColour})`

/**
 * A plan, not a post: a short card with the words first, outlined with a dashed hairline where a
 * post is a filled photo. "Idea" (or "Suggested") stands where a post shows its time, with why it
 * sits on this day; the idea's cover is a thumbnail at most. It opens the idea's own page in
 * Ideate, never the composer. A suggestion carries the insights' green and its wash.
 */
export function IdeaTile({
  mark,
  dayN,
  row = false,
}: {
  mark: Extract<FeedMark, { kind: 'idea' }>
  /** The day it sits on: an idea made from the tile keeps it. */
  dayN?: string
  /** A compact pill, for the day view's band above the hours, where many can sit side by side. */
  row?: boolean
}) {
  const { brand } = useBrand()
  const open = useOpenIdea()
  const wide = React.useContext(WideTiles)
  const tint = tintOf(mark, brand.colour)
  const kind = mark.format === 'reel' ? 'Reel' : 'Carousel'
  // The calendar knows an idea by its hook, the same words the ideas page keeps.
  const cover = useCoverOfHook(brand.id, mark.hook)
  if (row) {
    return (
      <button
        type="button"
        onClick={() => open(mark, dayN)}
        aria-label={ideaLabel(mark, mark.why)}
        title={mark.why}
        className={`group/idea flex h-8 max-w-[360px] min-w-0 items-center gap-2 rounded-full border border-dashed pr-3 pl-1.5 text-left transition-colors ${mark.suggested ? 'bg-(--insight-wash)' : 'bg-page hover:bg-surface'}`}
        style={{ borderColor: `color-mix(in oklab, ${tint} 55%, transparent)` }}
      >
        <span className="relative size-5 shrink-0 overflow-hidden rounded-full bg-tile">
          {cover && (
            <Image
              src={cover}
              alt=""
              fill
              sizes="20px"
              draggable={false}
              className="object-cover"
            />
          )}
        </span>
        <span
          className="shrink-0 font-mono text-[9px] tracking-[0.08em] uppercase"
          style={{ color: tint }}
        >
          {mark.suggested ? 'Suggested' : 'Idea'}
        </span>
        <span className="min-w-0 truncate text-[13px] text-ink">{mark.hook}</span>
      </button>
    )
  }
  return (
    <button
      type="button"
      onClick={() => open(mark, dayN)}
      aria-label={ideaLabel(mark, mark.why)}
      className={`group/idea flex w-full flex-col gap-1 rounded-[10px] border border-dashed p-2.5 text-left transition-[border-color,background-color] ${wide ? 'max-w-[200px]' : 'max-w-[124px]'} ${mark.suggested ? 'bg-(--insight-wash)' : 'bg-page hover:bg-surface'}`}
      style={{ borderColor: `color-mix(in oklab, ${tint} 55%, transparent)` }}
    >
      <span
        className="flex items-center gap-1 font-mono text-[9px] tracking-[0.08em] uppercase"
        style={{ color: tint }}
      >
        {mark.suggested ? 'Suggested' : 'Idea'}
      </span>
      <span className="font-display text-[13.5px] leading-[1.15] text-ink">{mark.hook}</span>
      <span className="line-clamp-2 text-[10.5px] leading-[1.3] text-ink-3">{mark.why}</span>
      <span className="mt-1 flex items-center gap-1.5 text-[10px] text-ink-4">
        {cover && (
          <span className="relative size-4 shrink-0 overflow-hidden rounded-[4px] bg-tile">
            <Image
              src={cover}
              alt=""
              fill
              sizes="16px"
              draggable={false}
              className="object-cover"
            />
          </span>
        )}
        {kind}
        <span className="ml-auto text-ink-3 opacity-0 transition-opacity group-hover/idea:opacity-100">
          <ArrowIcon />
        </span>
      </span>
    </button>
  )
}

function ArrowIcon() {
  return (
    <svg width="9" height="9" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path
        d="M2.5 6h7M6.5 3l3 3-3 3"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function PostTile({
  post,
  eager,
  onOpen,
}: {
  post: Post
  eager: boolean
  onOpen: () => void
}) {
  const drag = React.useContext(DragContext)
  const tile = useTile()
  const isDraft = post.stage === 'draft'
  const failed = post.stage === 'failed'
  // A post that is live stays on its day.
  const movable = post.stage !== 'posted'
  const image = post.images[0]
  // A post planned from an idea before anything was shot has no media: its idea's cover stands
  // in, faded and labelled, so the tile reads as the post it will be, not as finished content.
  const standIn = useCoverOfPost(useBrand().brand.id, post)
  return (
    <button
      type="button"
      onClick={onOpen}
      draggable={movable}
      onPointerDown={(e) => {
        if (!movable) return
        startTouchDrag(e, {
          start: () => drag.start(post.id),
          over: drag.setTouchOver,
          drop: (dayN) => (dayN ? drag.drop(dayN, post.id) : drag.end()),
          end: drag.end,
        })
      }}
      onDragStart={(e) => {
        // A finger drags by `startTouchDrag`: a phone's own drag would run beside it.
        if (touchDragPending()) return e.preventDefault()
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/plain', post.id)
        drag.start(post.id)
      }}
      onDragEnd={drag.end}
      aria-label={`${post.format === 'reel' ? 'Reel' : 'Carousel'}: ${post.hook}, ${STAGE_LABEL[post.stage].toLowerCase()}`}
      className={`${tile} group/tile bb-tile @container bg-tile text-left ${movable ? 'bb-touch-drag cursor-grab active:cursor-grabbing' : ''} ${drag.landed === post.id ? 'bb-land' : ''} ${failed ? 'shadow-[0_0_0_2px_var(--page),0_0_0_3.5px_var(--fail-line)]' : ''}`}
      style={{ opacity: drag.postId === post.id ? 0.35 : 1 }}
    >
      {image?.startsWith('blob:') ? (
        // A file dropped in the composer, possibly a video: drawn as it is, not through next/image.
        <Media src={image} sizes={TILE_SIZES} />
      ) : (
        image && (
          <Image
            src={image}
            alt=""
            fill
            sizes={TILE_SIZES}
            draggable={false}
            loading={eager ? 'eager' : undefined}
            className="object-cover"
          />
        )
      )}
      {!image && standIn && (
        <>
          <Image
            src={standIn}
            alt=""
            fill
            sizes={TILE_SIZES}
            draggable={false}
            className="object-cover opacity-40 grayscale-[0.4]"
          />
          <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-page/90 px-2 py-1 font-mono text-[9px] tracking-[0.08em] whitespace-nowrap text-ink-2 uppercase">
            No media yet
          </span>
        </>
      )}
      {isDraft && (
        <span className="pointer-events-none absolute inset-[3px] rounded-[6px] border border-dashed border-(--tile-dash)" />
      )}
      {failed ? <FailedBadge /> : <StageChip stage={post.stage} />}
      <span className="absolute top-2 right-2 text-page drop-shadow-[0_1px_2px_var(--tile-glyph-shadow)]">
        {post.format === 'reel' ? <ReelIcon size={12} /> : <CarouselIcon size={12} />}
      </span>
    </button>
  )
}

/**
 * A post that did not go out: a red badge with its words always showing, never only on hover,
 * so nobody scrolls past it.
 */
function FailedBadge() {
  return (
    // A frosted pill like the other stage chips, but always open, with the red kept to a dot.
    // On a small tile (the Day view's) only the dot shows.
    <span className="bb-pop absolute bottom-1.5 left-1.5 flex h-[20px] items-center gap-1.5 rounded-full bg-white/90 pr-2 pl-1.5 text-[10.5px] font-medium text-fail-ink shadow-[0_1px_4px_rgba(0,0,0,0.14)] backdrop-blur-sm @max-[100px]:size-[20px] @max-[100px]:justify-center @max-[100px]:p-0">
      <span className="size-[7px] rounded-full bg-fail shadow-[0_0_0_2.5px_var(--fail-soft)]" />
      <span className="@max-[100px]:hidden">Not posted</span>
    </span>
  )
}

/**
 * The stage as a glyph that says what is happening: a pencil while it is drafted, a person while it
 * waits on someone's OK, a clock once scheduled, and a paper plane once it is out. The word opens beside
 * it when the pointer is on the tile, so the calendar stays quiet until asked.
 */
function StageChip({ stage }: { stage: Stage }) {
  return (
    <span
      key={stage}
      className="bb-pop absolute bottom-1.5 left-1.5 flex h-[18px] items-center rounded-full bg-(--tile-pill) px-[5px] text-[9.5px] leading-none font-medium whitespace-nowrap text-ink shadow-[0_1px_3px_rgba(0,0,0,0.12)]"
    >
      <span style={{ color: `var(--stage-${stage})` }}>
        <StageGlyph stage={stage} />
      </span>
      <span className="grid grid-cols-[0fr] opacity-0 transition-[grid-template-columns,opacity,padding] duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)] group-hover/tile:grid-cols-[1fr] group-hover/tile:pl-1 group-hover/tile:opacity-100 group-focus-visible/tile:grid-cols-[1fr] group-focus-visible/tile:pl-1 group-focus-visible/tile:opacity-100">
        <span className="overflow-hidden">{STAGE_LABEL[stage]}</span>
      </span>
    </span>
  )
}

const STAGE_PATH: Record<Stage, React.ReactNode> = {
  draft: <path d="M8.4 1.9l1.7 1.7-5.9 5.9-2.3.6.6-2.3z" />,
  scheduled: (
    <>
      <circle cx="6" cy="6" r="4.6" />
      <path d="M6 3.7V6l1.6 1" />
    </>
  ),
  posted: <path d="M10.6 1.4L1.4 5.2l3.9 1.5 1.5 3.9zM10.6 1.4L5.3 6.7" />,
  failed: <path d="M6 2.6v4.2M6 9.2v.1" strokeWidth="2" />,
}

export function StageGlyph({ stage }: { stage: Stage }) {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="block"
    >
      {STAGE_PATH[stage]}
    </svg>
  )
}
