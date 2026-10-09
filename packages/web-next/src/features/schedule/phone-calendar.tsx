'use client'

import Image from 'next/image'
import * as React from 'react'

import { CheckIcon, ChevronIcon, PlusIcon, SparkIcon } from '@/components/icons'
import { Media } from '@/components/media'
import { PlatformLogo } from '@/components/platform-logos'
import { startTouchDrag } from '@/components/touch-drag'
import type { Day, FeedMark, LayerKey, Post, Week } from '@/data/demo'
import { INSIGHTS_BY_BRAND } from '@/data/insights'
import { useCoverOfHook, useCoverOfPost } from '@/features/ideate/ideas-store'

import { ideaLabel, useOpenIdea } from './open-idea'

import type { CalendarMode } from './calendar-view'
import {
  ALL_STAGES,
  channelsOf,
  itemsOf,
  postTime,
  type DayItems,
  type StageFilter,
} from './calendar-items'
import { onlyFailed } from './failed-menu'
import { PhoneFilters } from './phone-filters'
import { useBrand } from './posts-store'
import { storiesOf, type Story } from './stories'
import { StoryDeck } from './story-panel'
import { packLanes } from './week-grid'

const LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
const WEEKDAY = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const STAGE_LABEL = {
  draft: 'Draft',
  scheduled: 'Scheduled',
  posted: 'Posted',
  failed: 'Not posted',
} as const
const VIEWS: Array<{ value: CalendarMode; label: string }> = [
  { value: 'month', label: 'Month' },
  { value: 'week', label: 'Week' },
  { value: 'day', label: 'Day' },
]
/** How many squares a day shows before "+N": a week has room for three, a month for one. */
const LIMIT = { week: 3, month: 1 } as const
/** The photo that follows the finger, in px. */
const LIFT = 56
const FIRST_HOUR = 7
const LAST_HOUR = 23

/** One square in a day's column: a post's photo, an idea, or the day's stories as one ring. */
type Tile =
  | { kind: 'post'; post: Post }
  | { kind: 'idea'; mark: Extract<FeedMark, { kind: 'idea' }> }
  | { kind: 'stories'; stories: Story[] }

/**
 * The schedule on a phone: a calendar of photos. Seven columns of small squares, one per post,
 * under the day numbers; a busy day stacks three and counts the rest. The day picked lists its
 * posts under the grid, with their times and stages. The title opens the view menu; a swipe or
 * the arrows step a week, a month or a day; one filter button holds the layers, the stages and
 * the posts that did not go out. Press and hold a photo to carry it to another day.
 */
export function PhoneCalendar({
  weeks,
  month,
  onOpenLead,
  week,
  day,
  view,
  title,
  layers,
  stages,
  failed,
  atToday,
  onView,
  onSelect,
  onStep,
  onToday,
  onOpenPost,
  onNewPost,
  onOpenStories,
  onStages,
  onLayers,
}: {
  weeks: Week[]
  /** The month grid's rows: the borrowed first week, if any, and the weeks with outside days marked. */
  month: { lead?: Week; weeks: Week[] }
  /** A day in the borrowed first row: it opens in its own month. */
  onOpenLead: (day: number) => void
  week: number
  day: number
  view: CalendarMode
  title: string
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
  onNewPost: (dayN?: string, time?: string) => void
  onOpenStories: (dayN: string) => void
  onStages: (next: StageFilter) => void
  onLayers: (next: Record<LayerKey, boolean>) => void
}) {
  const { brand, library, byId, movePost } = useBrand()
  const [moving, setMoving] = React.useState<string | null>(null)
  const [over, setOver] = React.useState<string | null>(null)
  const [landed, setLanded] = React.useState<string | null>(null)
  const swipe = React.useRef<{ x: number; y: number } | null>(null)

  const shownWeek = weeks[Math.min(week, weeks.length - 1)]!
  const shownDay = shownWeek.days[day]!
  const best = INSIGHTS_BY_BRAND[brand.id].best
  const items = (d: Day) => itemsOf(d, byId, stages)
  const stories = (d: Day, it: DayItems) => storiesOf(d.n, it, brand.id, library, byId)
  const movingFrom = moving
    ? weeks.flatMap((w) => w.days).find((d) => items(d).posts.some((p) => p.id === moving))?.n
    : undefined
  const canTake = (d: Day) => moving !== null && !d.past && d.n !== movingFrom
  const select = (dayN: string) =>
    weeks.forEach((w, wi) => w.days.forEach((d, di) => d.n === dayN && onSelect(wi, di)))

  function drop(postId: string, dayN: string | null) {
    if (!dayN || !movePost(postId, dayN)) return
    setLanded(postId)
    // The list follows the post to its new day.
    select(dayN)
  }

  /** The long press that lifts a post's photo; `selector` names the photo inside the pressed item. */
  const lift = (post: Post, selector?: string) => (e: React.PointerEvent<HTMLElement>) => {
    if (post.stage === 'posted') return
    startTouchDrag(e, {
      lift: { selector, size: LIFT },
      start: () => {
        setLanded(null)
        setMoving(post.id)
      },
      over: setOver,
      drop: (dayN) => drop(post.id, dayN),
      end: () => setMoving(null),
    })
  }

  const tilesOf = (d: Day): Tile[] => {
    const it = items(d)
    const s = stories(d, it)
    return [
      ...it.posts.map((post): Tile => ({ kind: 'post', post })),
      ...it.ideas.map((mark): Tile => ({ kind: 'idea', mark })),
      ...(s.length ? [{ kind: 'stories', stories: s } as Tile] : []),
    ]
  }

  // `wi` is -1 in the month grid's borrowed first row.
  const pick = (wi: number, di: number) => (wi < 0 ? onOpenLead(di) : onSelect(wi, di))

  const number = (d: Day, wi: number, di: number) => {
    if (d.outside) {
      return (
        <span
          key={d.n}
          aria-hidden="true"
          className="flex h-10 items-center justify-center text-[15px] font-medium text-ink-5 tabular-nums opacity-50"
        >
          {d.n}
        </span>
      )
    }
    const picked = wi === week && di === day
    const n = items(d).posts.length
    // In Day the number is the only place to drop, so it lights up under the finger.
    const target = over === d.n && canTake(d)
    return (
      <button
        key={d.n}
        type="button"
        // The borrowed row's days belong to another month: nothing drops there.
        data-drop={wi < 0 ? undefined : d.n}
        onClick={() => pick(wi, di)}
        aria-label={`${WEEKDAY[di]} ${d.n}${d.today ? ', today' : ''}${n ? `, ${n} post${n > 1 ? 's' : ''}` : ''}`}
        aria-pressed={picked}
        className="flex h-10 items-center justify-center"
      >
        <span
          className={`flex size-[30px] items-center justify-center rounded-full text-[15px] font-medium tabular-nums transition-colors ${picked ? 'bg-ink text-page' : target ? 'bg-(--cal-drop) text-ink shadow-[inset_0_0_0_1.5px_var(--ink)]' : d.today ? 'text-ink shadow-[inset_0_0_0_1.5px_var(--ink)]' : d.past ? 'text-ink-5' : 'text-ink-2'}`}
        >
          {d.n}
        </span>
      </button>
    )
  }

  /** The week's events as thin lines under the numbers, each in its layer's colour, across its days. */
  const lanes = (w: Week) => {
    const packed = packLanes(w.events.filter((e) => layers[e.layer]))
    if (packed.length === 0) return null
    return (
      <div aria-hidden="true" className="grid grid-cols-7 gap-x-0.5 gap-y-[3px] pb-1.5">
        {packed.map(({ event, lane }) => (
          <span
            key={event.text}
            className="bb-lane mx-[3px] h-[3px] rounded-full"
            style={{
              gridColumn: `${event.col} / span ${event.span}`,
              gridRow: lane + 1,
              background: `var(--layer-${event.layer}-ink)`,
              opacity: 0.55,
            }}
          />
        ))}
      </div>
    )
  }

  const column = (d: Day, wi: number, di: number, limit: number) => {
    if (d.outside) return <div key={d.n} aria-hidden="true" />
    const tiles = tilesOf(d)
    const more = tiles.length - limit
    const target = canTake(d)
    return (
      <div
        key={d.n}
        data-drop={wi < 0 ? undefined : d.n}
        className={`flex flex-col gap-[3px] rounded-[9px] transition-[background-color,box-shadow] ${over === d.n && target ? 'bg-(--cal-drop) shadow-[inset_0_0_0_1.5px_var(--ink)]' : ''} ${d.past && !tiles.some((t) => t.kind === 'post' && t.post.stage === 'failed') ? 'opacity-60' : ''}`}
      >
        {tiles.slice(0, limit).map((t) =>
          t.kind === 'post' ? (
            <PhotoTile
              key={t.post.id}
              post={t.post}
              dim={moving === t.post.id}
              landed={landed === t.post.id}
              onClick={() => pick(wi, di)}
              // The borrowed row belongs to another month: its posts move from there.
              onPointerDown={wi < 0 ? undefined : lift(t.post)}
            />
          ) : t.kind === 'idea' ? (
            <IdeaSquare key={t.mark.hook} mark={t.mark} dayN={d.n} />
          ) : (
            <StoryRing key="stories" stories={t.stories} onOpen={() => onOpenStories(d.n)} />
          ),
        )}
        {more > 0 && (
          <button
            type="button"
            onClick={() => pick(wi, di)}
            className="font-mono text-[10px] tracking-[0.04em] text-ink-4 tabular-nums"
          >
            +{more}
          </button>
        )}
      </div>
    )
  }

  const row = (w: Week, wi: number, limit: number) => (
    <React.Fragment key={w.label}>
      <div className="grid grid-cols-7 gap-x-0.5">{w.days.map((d, di) => number(d, wi, di))}</div>
      {lanes(w)}
      <div
        className={`grid grid-cols-7 gap-x-0.5 ${limit > 1 ? 'min-h-[104px]' : 'min-h-[48px]'} pb-2`}
      >
        {w.days.map((d, di) => column(d, wi, di, limit))}
      </div>
    </React.Fragment>
  )

  const failedOnly = onlyFailed(stages)

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-0.5 px-4 pt-1 pb-2">
        <ViewMenu title={title} view={view} onView={onView} />
        <StepArrow label={`Previous ${view}`} onClick={() => onStep(-1)} flip />
        <StepArrow label={`Next ${view}`} onClick={() => onStep(1)} />
        <span className="ml-auto flex shrink-0 items-center gap-1.5">
          {!atToday && (
            <button
              type="button"
              onClick={onToday}
              className="bb-pop flex h-9 items-center rounded-full px-2.5 text-[13px] font-medium text-ink-2"
            >
              Today
            </button>
          )}
          <PhoneFilters
            failed={failed}
            stages={stages}
            layers={layers}
            onStages={onStages}
            onLayers={onLayers}
          />
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
      {failedOnly && (
        <button
          type="button"
          onClick={() => onStages(ALL_STAGES)}
          className="bb-pop mx-4 mb-2 flex h-9 items-center justify-between rounded-[10px] bg-(--fail-soft) px-3 text-[12.5px] font-medium text-fail-ink"
        >
          <span className="flex items-center gap-2">
            <span className="size-1.5 rounded-full bg-fail" />
            Only the posts that did not go out
          </span>
          <span className="opacity-80">Show all ×</span>
        </button>
      )}

      {/* The grid: a swipe steps it, and a held photo drags over it. */}
      <div
        className="px-4"
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
            onStep(dx < 0 ? 1 : -1)
        }}
      >
        <div className="grid grid-cols-7 gap-x-0.5">
          {LETTERS.map((l, i) => (
            <span
              key={i}
              className={`py-1 text-center font-mono text-[10px] tracking-[0.06em] ${shownWeek.days[i]?.today && view !== 'month' ? 'text-ink' : 'text-ink-4'}`}
            >
              {l}
            </span>
          ))}
        </div>
        <div
          key={`${view}-${weeks[0]!.label}-${view === 'month' ? '' : week}-${view === 'day' ? day : ''}`}
          className="bb-swap"
        >
          {view === 'month' ? (
            <>
              {month.lead && row(month.lead, -1, LIMIT.month)}
              {month.weeks.map((w, wi) => row(w, wi, LIMIT.month))}
            </>
          ) : view === 'week' ? (
            row(shownWeek, week, LIMIT.week)
          ) : (
            <div className="grid grid-cols-7 gap-x-0.5">
              {shownWeek.days.map((d, di) => number(d, week, di))}
            </div>
          )}
        </div>
      </div>

      <div className="mx-4 border-t border-(--cal-line)" />
      <section
        key={`${view}-${shownDay.n}`}
        aria-label={`${WEEKDAY[day]} ${shownDay.n}`}
        className="bb-swap flex flex-col px-4 pt-4 pb-6"
      >
        <DayHead
          day={shownDay}
          di={day}
          events={shownWeek.events.filter(
            (e) => layers[e.layer] && e.col - 1 <= day && day < e.col - 1 + e.span,
          )}
          best={view === 'day' ? undefined : best}
          onBest={() => onNewPost(shownDay.n, best)}
          stories={stories(shownDay, items(shownDay))}
          onOpenStories={() => onOpenStories(shownDay.n)}
        />
        {view === 'day' ? (
          <Hours
            day={shownDay}
            items={items(shownDay)}
            best={Number(best.split(':')[0])}
            moving={moving}
            landed={landed}
            lift={lift}
            onOpenPost={onOpenPost}
            onNewPost={onNewPost}
          />
        ) : (
          <DayPosts
            day={shownDay}
            items={items(shownDay)}
            moving={moving}
            landed={landed}
            lift={lift}
            onOpenPost={onOpenPost}
            onNewPost={onNewPost}
          />
        )}
      </section>
    </div>
  )
}

/** The title, which names the view and opens the menu of the three. */
function ViewMenu({
  title,
  view,
  onView,
}: {
  title: string
  view: CalendarMode
  onView: (view: CalendarMode) => void
}) {
  const [open, setOpen] = React.useState(false)
  const root = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (!open) return
    function onPointer(e: PointerEvent) {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('pointerdown', onPointer)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onPointer)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={root} className="relative min-w-0">
      {/* The heading holds the button, so the page keeps its heading for a screen reader. */}
      <h1 className="min-w-0 font-display text-[26px] leading-none tracking-[-0.03em] max-[360px]:text-[22px]">
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={`${title}. Change view`}
          onClick={() => setOpen((o) => !o)}
          className="flex h-10 max-w-full items-center gap-1.5 rounded-[10px] pr-1.5 pl-0 text-left"
        >
          <span className="truncate">{title}</span>
          <span className={`shrink-0 text-ink-4 transition-transform ${open ? 'rotate-180' : ''}`}>
            <ChevronIcon size={10} />
          </span>
        </button>
      </h1>
      {open && (
        <div
          role="menu"
          aria-label="View"
          className="bb-menu absolute top-11 left-0 z-30 flex w-[168px] origin-top-left flex-col rounded-[12px] bg-page p-1 shadow-[0_0_0_1px_var(--line),var(--shadow-pop)]"
        >
          {VIEWS.map((v) => (
            <button
              key={v.value}
              type="button"
              role="menuitemradio"
              aria-checked={view === v.value}
              onClick={() => {
                onView(v.value)
                setOpen(false)
              }}
              className={`flex h-10 items-center gap-2.5 rounded-[8px] px-2.5 text-left text-[14px] ${view === v.value ? 'text-ink' : 'text-ink-3'}`}
            >
              <span className="flex-1">{v.label}</span>
              <span className={view === v.value ? 'text-ink' : 'opacity-0'}>
                <CheckIcon size={13} />
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** A post's photo in the grid: the square, and a red dot when the post did not go out. */
function PhotoTile({
  post,
  dim,
  landed,
  onClick,
  onPointerDown,
}: {
  post: Post
  dim: boolean
  landed: boolean
  onClick: () => void
  onPointerDown?: (e: React.PointerEvent<HTMLButtonElement>) => void
}) {
  const standIn = useStandIn(post)
  return (
    <button
      type="button"
      onClick={onClick}
      onPointerDown={onPointerDown}
      aria-label={`${post.hook}, ${postTime(post)}, ${STAGE_LABEL[post.stage].toLowerCase()}`}
      className={`bb-touch-drag relative block aspect-square w-full overflow-hidden rounded-[8px] bg-tile transition-opacity ${landed ? 'bb-land' : ''}`}
      style={{ opacity: dim ? 0.3 : 1 }}
    >
      <Photo src={post.images[0]} standIn={standIn} />
      {post.stage === 'draft' && (
        <span className="pointer-events-none absolute inset-[3px] rounded-[6px] border border-dashed border-(--tile-dash)" />
      )}
      {post.stage === 'failed' && (
        <span className="absolute top-1 right-1 size-2 rounded-full bg-fail shadow-[0_0_0_2px_var(--page)]" />
      )}
    </button>
  )
}

function Photo({ src, standIn }: { src?: string; standIn?: string }) {
  if (!src) {
    // A post with no media yet shows its idea's cover, faded, as the desktop tile does.
    if (!standIn) return null
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
  if (src.startsWith('blob:')) return <Media src={src} sizes="112px" />
  return <Image src={src} alt="" fill sizes="112px" draggable={false} className="object-cover" />
}

/** The cover a post with no media borrows from its idea. */
function useStandIn(post: Post): string | undefined {
  const cover = useCoverOfPost(useBrand().brand.id, post)
  return post.images.length === 0 ? cover : undefined
}

/** The idea's colour: the brand's for the team's own, the insights' green for a suggestion. */
const tintOf = (mark: Extract<FeedMark, { kind: 'idea' }>, brandColour: string) =>
  mark.suggested ? 'var(--insight)' : `var(${brandColour})`

/**
 * A plan in the month's grid: half a photo's height, a dashed outline in its colour and a spark,
 * where a post is a filled square. It opens the idea's page.
 */
function IdeaSquare({ mark, dayN }: { mark: Extract<FeedMark, { kind: 'idea' }>; dayN: string }) {
  const { brand } = useBrand()
  const open = useOpenIdea()
  const tint = tintOf(mark, brand.colour)
  return (
    <button
      type="button"
      onClick={() => open(mark, dayN)}
      aria-label={ideaLabel(mark)}
      className={`flex aspect-[2/1] w-full items-center justify-center rounded-[8px] border border-dashed ${mark.suggested ? 'bg-(--insight-wash)' : 'bg-page'}`}
      style={{ borderColor: `color-mix(in oklab, ${tint} 55%, transparent)`, color: tint }}
    >
      <span className="font-mono text-[8px] tracking-[0.06em] uppercase">Idea</span>
    </button>
  )
}

/** A day's stories as one ring around their first frame, the way a phone shows a story. */
function StoryRing({ stories, onOpen }: { stories: Story[]; onOpen: () => void }) {
  const first = stories.find((s) => s.image)
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${stories.length} ${stories.length > 1 ? 'stories' : 'story'}: open them`}
      className="flex aspect-square w-full items-center justify-center"
    >
      <span className="block size-[84%] rounded-full p-[2.5px] shadow-[inset_0_0_0_1.5px_var(--ink)]">
        <span className="relative block size-full overflow-hidden rounded-full bg-tile">
          {first?.image && <Media src={first.image} sizes="64px" />}
        </span>
      </span>
    </button>
  )
}

/** The picked day's name, its events, its stories and the best hour from Insights. */
function DayHead({
  day,
  di,
  events,
  best,
  onBest,
  stories,
  onOpenStories,
}: {
  day: Day
  di: number
  events: Week['events']
  /** The hour to post, when the view does not show it on the hours. */
  best?: string
  onBest: () => void
  stories: Story[]
  onOpenStories: () => void
}) {
  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <h2
          className={`text-[17px] font-semibold tracking-[-0.01em] ${day.past ? 'text-ink-3' : ''}`}
        >
          {WEEKDAY[di]!.slice(0, 3)} {day.n}
          {day.today && <span className="ml-2 text-[13px] font-medium text-ink-4">Today</span>}
        </h2>
        {best && !day.past && (
          <button
            type="button"
            onClick={onBest}
            className="flex shrink-0 items-center gap-1 text-[12px] font-medium text-(--insight-6)"
          >
            <SparkIcon size={9} />
            Best at {best}
          </button>
        )}
      </div>
      {(events.length > 0 || stories.length > 0) && (
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
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
        </div>
      )}
    </>
  )
}

/** What a picked day holds, in rows: its posts by time, then its ideas. */
function DayPosts({
  day,
  items,
  moving,
  landed,
  lift,
  onOpenPost,
  onNewPost,
}: {
  day: Day
  items: DayItems
  moving: string | null
  landed: string | null
  lift: (post: Post, selector?: string) => (e: React.PointerEvent<HTMLElement>) => void
  onOpenPost: (postId: string) => void
  onNewPost: (dayN?: string, time?: string) => void
}) {
  const empty = items.posts.length === 0 && items.ideas.length === 0
  return (
    <div className="mt-1 flex flex-col">
      {items.posts.map((post) => (
        <PostRow
          key={post.id}
          post={post}
          dim={moving === post.id}
          landed={landed === post.id}
          onOpen={() => onOpenPost(post.id)}
          onPointerDown={lift(post, '[data-photo]')}
        />
      ))}
      {items.ideas.map((mark) => (
        <IdeaRow key={mark.hook} mark={mark} dayN={day.n} />
      ))}
      {empty &&
        (day.past ? (
          <p className="py-3 text-[14px] text-ink-4">Nothing posted.</p>
        ) : (
          <button
            type="button"
            onClick={() => onNewPost(day.n)}
            className="flex items-center gap-1.5 self-start py-3 text-[14px] text-ink-4"
          >
            Nothing planned.
            <span className="font-medium text-ink-2">Add a post</span>
          </button>
        ))}
    </div>
  )
}

/**
 * The Day view: the hours, each post in its hour, the best two hours from Insights shaded, and
 * an empty hour that starts a post at that time. Ideas without a time come first.
 */
function Hours({
  day,
  items,
  best,
  moving,
  landed,
  lift,
  onOpenPost,
  onNewPost,
}: {
  day: Day
  items: DayItems
  best: number
  moving: string | null
  landed: string | null
  lift: (post: Post, selector?: string) => (e: React.PointerEvent<HTMLElement>) => void
  onOpenPost: (postId: string) => void
  onNewPost: (dayN?: string, time?: string) => void
}) {
  const hours = Array.from({ length: LAST_HOUR - FIRST_HOUR + 1 }, (_, i) => FIRST_HOUR + i)
  // A post before the first hour or after the last sits in the nearest one shown.
  const hourOf = (p: Post) =>
    Math.min(Math.max(Number(postTime(p).split(':')[0]), FIRST_HOUR), LAST_HOUR)
  return (
    <div className="mt-3 flex flex-col">
      {items.ideas.map((mark) => (
        <IdeaRow key={mark.hook} mark={mark} dayN={day.n} />
      ))}
      {hours.map((h) => {
        const posts = items.posts.filter((p) => hourOf(p) === h)
        const time = `${String(h).padStart(2, '0')}:00`
        const shaded = h === best || h === best + 1
        return (
          <div
            key={h}
            className={`relative flex min-h-[44px] gap-2 border-t border-(--cal-line) ${shaded ? 'bg-(--insight-wash)' : ''}`}
          >
            <span className="w-11 shrink-0 pt-1.5 font-mono text-[10px] text-ink-4 tabular-nums">
              {time}
            </span>
            <div className="flex min-w-0 flex-1 flex-col">
              {posts.map((post) => (
                <PostRow
                  key={post.id}
                  post={post}
                  dim={moving === post.id}
                  landed={landed === post.id}
                  onOpen={() => onOpenPost(post.id)}
                  onPointerDown={lift(post, '[data-photo]')}
                  bare
                />
              ))}
            </div>
            {h === best && (
              <span className="pointer-events-none absolute top-1.5 right-2 flex items-center gap-1 text-[11px] font-medium text-(--insight-6)">
                <SparkIcon size={8} />
                Best time
              </span>
            )}
            {posts.length === 0 && !day.past && (
              <button
                type="button"
                aria-label={`New post at ${time}`}
                onClick={() => onNewPost(day.n, time)}
                className="absolute inset-0"
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

/** One post in the list: its photo, its hook, then its time, stage and accounts in one grey line. */
function PostRow({
  post,
  dim,
  landed,
  onOpen,
  onPointerDown,
  bare = false,
}: {
  post: Post
  dim: boolean
  landed: boolean
  onOpen: () => void
  onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => void
  /** Inside an hour: no line under it. */
  bare?: boolean
}) {
  const standIn = useStandIn(post)
  const failed = post.stage === 'failed'
  return (
    <button
      type="button"
      onClick={onOpen}
      onPointerDown={onPointerDown}
      className={`bb-touch-drag flex w-full items-center gap-3 py-2.5 text-left transition-opacity ${bare ? '' : 'border-b border-(--cal-line)'} ${landed ? 'bb-land' : ''}`}
      style={{ opacity: dim ? 0.3 : 1 }}
    >
      <span
        data-photo
        className="relative block size-11 shrink-0 overflow-hidden rounded-[8px] bg-tile"
      >
        <Photo src={post.images[0]} standIn={standIn} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-[15px]">{post.hook}</span>
        <span
          className={`flex items-center gap-1.5 text-[12.5px] tabular-nums ${failed ? 'font-medium text-fail-ink' : 'text-ink-3'}`}
        >
          {postTime(post)}
          <span
            className="size-1.5 rounded-full"
            style={{ background: `var(--stage-${post.stage})` }}
          />
          {STAGE_LABEL[post.stage]}
          <span className="ml-1 flex items-center gap-1 text-ink-4">
            {channelsOf(post).map((c) => (
              <PlatformLogo key={c} platform={c} size={11} />
            ))}
          </span>
        </span>
        {failed && post.error && (
          <span className="line-clamp-2 text-[12px] leading-[1.35] text-fail-ink">
            {post.error}
          </span>
        )}
      </span>
    </button>
  )
}

/**
 * A plan in the day's list: a dashed square with a spark where a post shows its photo, then the
 * hook and "Idea · why it sits here". It opens the idea's page.
 */
function IdeaRow({ mark, dayN }: { mark: Extract<FeedMark, { kind: 'idea' }>; dayN: string }) {
  const { brand } = useBrand()
  const open = useOpenIdea()
  const tint = tintOf(mark, brand.colour)
  const cover = useCoverOfHook(brand.id, mark.hook)
  return (
    <button
      type="button"
      onClick={() => open(mark, dayN)}
      className="flex w-full items-center gap-3 border-b border-(--cal-line) py-2.5 text-left"
    >
      <span
        className={`relative flex size-11 shrink-0 items-center justify-center rounded-[8px] border border-dashed ${mark.suggested ? 'bg-(--insight-wash)' : ''}`}
        style={{ borderColor: `color-mix(in oklab, ${tint} 55%, transparent)`, color: tint }}
      >
        {cover && (
          <span className="absolute inset-1.5 overflow-hidden rounded-[5px] bg-tile opacity-80">
            <Image src={cover} alt="" fill sizes="32px" className="object-cover" />
          </span>
        )}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span
          className="truncate font-mono text-[9.5px] tracking-[0.08em] uppercase"
          style={{ color: tint }}
        >
          {mark.suggested ? 'Suggested' : 'Idea'} · {mark.why}
        </span>
        <span className="truncate text-[15px]">{mark.hook}</span>
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
      className="flex size-8 shrink-0 items-center justify-center rounded-full text-ink-4"
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
