'use client'

import Image from 'next/image'
import Link from 'next/link'
import * as React from 'react'

import { CarouselIcon, PlusIcon, ReelIcon, SparkIcon } from '@/components/icons'
import type {
  CalendarEvent,
  Day,
  FeedMark,
  LayerKey,
  Post,
  Stage,
  StoryMark,
  Week,
} from '@/data/demo'
import { feedsOf } from '@/data/demo'

import { useBrand } from './posts-store'

const DAY_NAMES = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']

const STAGE_LABEL: Record<Stage, string> = {
  draft: 'Draft',
  approved: 'Approved',
  filming: 'Filming',
  editing: 'Editing',
  scheduled: 'Scheduled',
  posted: 'Posted',
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
  drop: (dayN: string) => void
}

const DragContext = React.createContext<DragValue>({
  postId: null,
  landed: null,
  start: () => {},
  end: () => {},
  drop: () => {},
})

/** The week label column, then seven days. The lane overlay reuses it so bars meet the cells. */
const GRID =
  'grid grid-cols-[52px_repeat(7,minmax(0,1fr))] max-md:grid-cols-[40px_repeat(7,minmax(0,1fr))]'

/** Cell top padding (10) + the date row (24) + a gap (8): where the first lane starts. */
const LANE_TOP = 42
const LANE_H = 18
const LANE_GAP = 3

/** First-fit packing: each event takes the first lane that is free across its days. */
function packLanes(events: CalendarEvent[]): { event: CalendarEvent; lane: number }[] {
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

export function WeekGrid({
  weeks,
  layers,
  onOpenPost,
  onNewPost,
}: {
  weeks: Week[]
  layers: Record<LayerKey, boolean>
  onOpenPost: (postId: string) => void
  onNewPost: () => void
}) {
  const todayCol = weeks.flatMap((w) => w.days).findIndex((d) => d.today) % 7
  const { movePost } = useBrand()
  const [postId, setPostId] = React.useState<string | null>(null)
  const [landed, setLanded] = React.useState<string | null>(null)
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
      drop: (dayN) => {
        if (postId && movePost(postId, dayN)) setLanded(postId)
        setPostId(null)
      },
    }),
    [postId, landed, movePost],
  )
  return (
    <DragContext.Provider value={drag}>
      <div className="mx-auto w-full max-w-[1440px] px-10 pb-24 max-md:px-4">
        <div className="overflow-x-auto">
          <div className="flex min-w-[760px] flex-col">
            <div className={`${GRID} pb-2`}>
              <span />
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
    </DragContext.Provider>
  )
}

function WeekRow({
  week,
  layers,
  eager,
  onOpenPost,
  onNewPost,
}: {
  week: Week
  layers: Record<LayerKey, boolean>
  eager: boolean
  onOpenPost: (postId: string) => void
  onNewPost: () => void
}) {
  const lanes = packLanes(week.events.filter((e) => layers[e.layer]))
  const laneCount = lanes.reduce((n, l) => Math.max(n, l.lane + 1), 0)
  const laneSpace = laneCount ? laneCount * LANE_H + (laneCount - 1) * LANE_GAP + 6 : 0
  const current = week.days.some((d) => d.today)
  return (
    <div className={`${GRID} relative border-t border-(--cal-line)`}>
      <span
        className={`pt-[15px] font-mono text-[10px] tracking-[0.08em] ${current ? 'text-ink-2' : 'text-ink-5'}`}
      >
        {week.label}
      </span>
      {week.days.map((day, i) => (
        <DayCell
          key={day.n}
          day={day}
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
              gridColumn: `${event.col + 1} / span ${event.span}`,
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
  name,
  first,
  laneSpace,
  eager,
  onOpenPost,
  onNewPost,
}: {
  day: Day
  name: string
  first: boolean
  laneSpace: number
  eager: boolean
  onOpenPost: (postId: string) => void
  onNewPost: () => void
}) {
  // A busy day can hold several feed posts; most hold one or none.
  const feeds = feedsOf(day)
  const drag = React.useContext(DragContext)
  const [over, setOver] = React.useState(false)
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
        style={{ opacity: over && canDrop ? 1 : 0 }}
      />
      <div
        className={`flex h-6 items-center justify-between gap-1 ${day.past ? 'opacity-40' : ''}`}
      >
        <span
          className={`flex size-[22px] items-center justify-center rounded-full text-[12px] font-medium tabular-nums ${day.today ? 'bg-ink text-page' : day.past ? 'text-ink-4' : 'text-ink-2'}`}
        >
          {day.n}
        </span>
        <StoryRing mark={day.story} eager={eager} />
      </div>
      <div
        aria-hidden="true"
        className="shrink-0 transition-[height] duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)]"
        style={{ height: laneSpace }}
      />
      <div className={`mt-2.5 ${day.past ? 'opacity-40' : ''}`}>
        {feeds.length > 1 ? (
          <FeedStack feeds={feeds} eager={eager} onOpenPost={onOpenPost} onNewPost={onNewPost} />
        ) : feeds[0] ? (
          <FeedTile mark={feeds[0]} eager={eager} onOpenPost={onOpenPost} onNewPost={onNewPost} />
        ) : (
          !day.past && (
            // A pointer shortcut: "Schedule new post" is the keyboard route to the same drawer.
            <button
              type="button"
              tabIndex={-1}
              aria-hidden="true"
              onClick={onNewPost}
              className={`${TILE} flex items-center justify-center border border-dashed border-(--cal-ghost) text-ink-4 opacity-0 transition-opacity duration-200 group-hover:opacity-100 hover:text-ink`}
            >
              <PlusIcon size={13} />
            </button>
          )
        )}
      </div>
    </div>
  )
}

/**
 * A story planned on the shoot brief: one ring in its stage's colour, dashed while it is still an
 * idea, around its picture. The hook and the stage are the tooltip.
 */
function PlannedStory({ postId, eager }: { postId: string; eager: boolean }) {
  const { byId } = useBrand()
  const post = byId(postId)
  if (!post) return null
  const label = `Story · ${STAGE_LABEL[post.stage]}: ${post.hook}`
  const image = post.images[0]
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className="bb-pop relative block size-6 shrink-0"
    >
      <svg
        width="24"
        height="24"
        viewBox="0 0 36 36"
        aria-hidden="true"
        className="absolute inset-0 -rotate-90"
      >
        <circle
          cx="18"
          cy="18"
          r="16.6"
          fill="none"
          stroke={`var(--stage-${post.stage})`}
          strokeWidth="2"
          strokeDasharray={post.stage === 'draft' ? '3 3' : undefined}
        />
      </svg>
      <span className="absolute inset-[3px] overflow-hidden rounded-full bg-tile">
        {image && (
          <Image
            src={image}
            alt=""
            width={18}
            height={18}
            loading={eager ? 'eager' : undefined}
            className="size-full object-cover"
          />
        )}
      </span>
    </span>
  )
}

function ringDash(n: number): string {
  const c = 2 * Math.PI * 16.6
  if (n <= 1) return `${c} 0`
  const gap = 3.6
  return `${c / n - gap} ${gap}`
}

/**
 * The day's Instagram Stories: the first frame in a ring cut into one segment per story, as
 * Instagram draws it. A day without stories shows nothing; the count is a tooltip.
 */
function StoryRing({ mark, eager }: { mark: StoryMark; eager: boolean }) {
  if (mark.kind === 'post') return <PlannedStory postId={mark.postId} eager={eager} />
  if (mark.kind !== 'posted') return null
  const label = `${mark.count} ${mark.count > 1 ? 'stories' : 'story'}`
  return (
    <span role="img" aria-label={label} title={label} className="relative block size-6 shrink-0">
      <svg
        width="24"
        height="24"
        viewBox="0 0 36 36"
        aria-hidden="true"
        className="absolute inset-0 -rotate-90"
      >
        <circle
          cx="18"
          cy="18"
          r="16.6"
          fill="none"
          stroke="var(--ink)"
          strokeWidth="1.5"
          strokeDasharray={ringDash(mark.count)}
        />
      </svg>
      <span className="absolute inset-[3px] overflow-hidden rounded-full bg-tile">
        <Image
          src={mark.image}
          alt=""
          width={18}
          height={18}
          loading={eager ? 'eager' : undefined}
          className="size-full object-cover"
        />
      </span>
    </span>
  )
}

const TILE = 'relative block aspect-[4/5] w-full max-w-[124px] overflow-hidden rounded-[8px]'

function FeedTile({
  mark,
  eager,
  onOpenPost,
  onNewPost,
}: {
  mark: FeedMark
  eager: boolean
  onOpenPost: (postId: string) => void
  onNewPost: () => void
}) {
  const { byId } = useBrand()

  if (mark.kind === 'post') {
    const post = byId(mark.postId)
    if (!post) return null
    return <PostTile post={post} eager={eager} onOpen={() => onOpenPost(post.id)} />
  }

  return <IdeaTile mark={mark} onNewPost={onNewPost} />
}

/**
 * A post that is not made yet. One card for every kind: the hook, and one line on why it sits on
 * this day. The team's own idea carries the brand's colour and starts the post; a suggestion
 * carries the insights' green and leads to the ideas page, so the calendar, the ideas and the
 * insights read as one loop.
 */
function IdeaTile({
  mark,
  onNewPost,
}: {
  mark: Extract<FeedMark, { kind: 'idea' }>
  onNewPost: () => void
}) {
  const { brand } = useBrand()
  const tint = mark.suggested ? 'var(--insight)' : `var(${brand.colour})`
  const kind = mark.format === 'reel' ? 'Reel' : 'Carousel'
  const className = `${TILE} group/idea bb-tile text-left text-ink`
  const style = {
    background: `linear-gradient(165deg, color-mix(in oklab, ${tint} 12%, var(--page)) 0%, var(--page) 78%)`,
  }
  const body = (
    <span className="absolute inset-0 flex flex-col p-2.5">
      <span className="flex items-center justify-between">
        <span style={{ color: tint }}>
          <SparkIcon size={11} />
        </span>
        <span className="relative flex size-5 items-center justify-center text-ink-5">
          <span className="transition-opacity duration-200 group-hover/idea:opacity-0">
            {mark.format === 'reel' ? <ReelIcon size={11} /> : <CarouselIcon size={11} />}
          </span>
          <span className="absolute inset-0 flex scale-75 items-center justify-center rounded-full bg-ink text-page opacity-0 transition-[opacity,transform] duration-200 group-hover/idea:scale-100 group-hover/idea:opacity-100">
            {mark.suggested ? <ArrowIcon /> : <PlusIcon size={9} />}
          </span>
        </span>
      </span>
      <span className="mt-auto font-serif text-[14px] leading-[1.1] tracking-[-0.005em] text-ink-2">
        {mark.hook}
      </span>
      <span
        className="mt-1.5 line-clamp-2 text-[9.5px] leading-[1.25] font-medium"
        style={{ color: `color-mix(in oklab, ${tint} 70%, var(--ink-3))` }}
      >
        {mark.why}
      </span>
    </span>
  )
  if (mark.suggested) {
    return (
      <Link
        href="/ideate"
        aria-label={`Suggested ${kind.toLowerCase()}: ${mark.hook} ${mark.why}`}
        className={className}
        style={style}
      >
        {body}
      </Link>
    )
  }
  return (
    <button
      type="button"
      onClick={onNewPost}
      aria-label={`${kind} idea: ${mark.hook} ${mark.why}`}
      className={className}
      style={style}
    >
      {body}
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

function PostTile({ post, eager, onOpen }: { post: Post; eager: boolean; onOpen: () => void }) {
  const drag = React.useContext(DragContext)
  const isDraft = post.stage === 'draft'
  // A post that is live stays on its day.
  const movable = post.stage !== 'posted'
  const image = post.images[0]
  return (
    <button
      type="button"
      onClick={onOpen}
      draggable={movable}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/plain', post.id)
        drag.start(post.id)
      }}
      onDragEnd={drag.end}
      aria-label={`${post.format === 'reel' ? 'Reel' : 'Carousel'}: ${post.hook}, ${STAGE_LABEL[post.stage].toLowerCase()}`}
      className={`${TILE} group/tile bb-tile bg-tile text-left ${movable ? 'cursor-grab active:cursor-grabbing' : ''} ${drag.landed === post.id ? 'bb-land' : ''}`}
      style={{ opacity: drag.postId === post.id ? 0.35 : 1 }}
    >
      {image && (
        <Image
          src={image}
          alt=""
          fill
          sizes="124px"
          draggable={false}
          loading={eager ? 'eager' : undefined}
          className="object-cover"
        />
      )}
      {isDraft && (
        <span className="pointer-events-none absolute inset-[3px] rounded-[6px] border border-dashed border-(--tile-dash)" />
      )}
      <StageChip stage={post.stage} />
      <span className="absolute top-2 right-2 text-page drop-shadow-[0_1px_2px_var(--tile-glyph-shadow)]">
        {post.format === 'reel' ? <ReelIcon size={12} /> : <CarouselIcon size={12} />}
      </span>
    </button>
  )
}

/**
 * The stage as a glyph that says what is happening: a pencil while it is drafted, a check once
 * approved, a camera, scissors, a clock, and a paper plane once it is out. The word opens beside
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
  approved: <path d="M2.4 6.4L4.9 8.8L9.6 3.4" />,
  filming: (
    <>
      <rect x="1.4" y="3.4" width="6.4" height="5.2" rx="1.2" />
      <path d="M7.8 5.4L10.6 4v4L7.8 6.6" />
    </>
  ),
  editing: (
    <>
      <circle cx="3.1" cy="3.4" r="1.4" />
      <circle cx="3.1" cy="8.6" r="1.4" />
      <path d="M4.3 4.2L10.4 8.9M4.3 7.8L10.4 3.1" />
    </>
  ),
  scheduled: (
    <>
      <circle cx="6" cy="6" r="4.6" />
      <path d="M6 3.7V6l1.6 1" />
    </>
  ),
  posted: <path d="M10.6 1.4L1.4 5.2l3.9 1.5 1.5 3.9zM10.6 1.4L5.3 6.7" />,
}

function StageGlyph({ stage }: { stage: Stage }) {
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

/**
 * Two or more posts on one day: a stack, the first in front and the rest peeking behind its
 * right edge, with a count. Pointing at the stack fans the cards out; the card under the pointer
 * (or with keyboard focus) is the one in front, and it stays in front until another card takes
 * its place, so moving back to the left card brings it back on top.
 *
 * "In front" is state, not `:hover`: with overlapping cards a CSS hover cannot hand the front back
 * to a card whose visible strip the pointer returns to. The swap is smoothed by the front card
 * lifting and scaling while the others ease back; only z-index changes instantly.
 */
function FeedStack({
  feeds,
  eager,
  onOpenPost,
  onNewPost,
}: {
  feeds: FeedMark[]
  eager: boolean
  onOpenPost: (postId: string) => void
  onNewPost: () => void
}) {
  const [open, setOpen] = React.useState(false)
  const [top, setTop] = React.useState(0)
  const last = feeds.length - 1

  function close() {
    setOpen(false)
    setTop(0)
  }

  return (
    <div
      className="relative w-full max-w-[124px]"
      onPointerEnter={() => setOpen(true)}
      onPointerLeave={close}
      onFocus={() => setOpen(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) close()
      }}
    >
      {feeds.map((mark, i) => {
        const front = i === top
        const rest = i === 0 ? 'none' : `translateX(${7 * i}px) scale(${1 - 0.06 * i})`
        const fan = `translateX(${i === 0 ? -4 : (44 * i) / last}%) translateY(${front ? -4 : 0}px) rotate(${-2 + (5 * i) / last}deg) scale(${front ? 1 : 0.95})`
        return (
          <div
            key={i}
            className={i === 0 ? 'relative' : 'absolute inset-0'}
            style={{
              zIndex: open ? 30 - Math.abs(i - top) : 30 - i,
              transform: open ? fan : rest,
              transformOrigin: 'left bottom',
              transition:
                'transform 380ms cubic-bezier(0.2, 0.8, 0.2, 1), filter 380ms cubic-bezier(0.2, 0.8, 0.2, 1)',
              filter: open && !front ? 'saturate(0.85) brightness(0.97)' : 'none',
            }}
            onPointerEnter={() => setTop(i)}
            onFocus={() => setTop(i)}
          >
            <FeedTile mark={mark} eager={eager} onOpenPost={onOpenPost} onNewPost={onNewPost} />
          </div>
        )
      })}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -top-1.5 -left-1.5 z-40 flex size-[18px] items-center justify-center rounded-full bg-ink font-mono text-[9.5px] text-page shadow-soft transition-opacity duration-200"
        style={{ opacity: open ? 0 : 1 }}
      >
        {feeds.length}
      </span>
    </div>
  )
}
