import { Fragment } from 'react'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import type { SocialPost } from '@brandfactory/shared'
import { KeyDateStrip } from '@/components/brand/KeyDateStrip'
import { Button } from '@/components/ui/button'
import {
  formatDayHeading,
  formatTimeOfDay,
  groupByDay,
  localDayKey,
  monthGridDays,
  monthLabel,
  WEEKDAY_LABELS,
} from '@/lib/calendar'
import {
  curatedThroughLabel,
  keyDatesByDay,
  KEY_DATE_APPEARANCE,
  KEY_DATE_SET_LABELS,
  seasonsInMonth,
  splitByShape,
  type KeyDate,
  type KeyDateSet,
} from '@/lib/key-dates'
import { PLATFORM_LABELS, postExcerpt } from '@/lib/social-copy'
import { cn } from '@/lib/utils'

/**
 * How many key-date markers one cell will draw.
 *
 * A cell is roughly 130px wide and already carries a date number and its post
 * chips; a third marker crowds out the day's actual plan, which is what the
 * grid is for. **Nothing is silently lost** — the strip above carries every
 * season, the list view carries every entry, and the cell's `aria-label` names
 * all of them however many there are. Two is the drawn cap, not the known one.
 */
const MAX_CELL_MARKERS = 2

// ---------------------------------------------------------------------------
// CalendarMonthGrid — what the month is shaped like
// ---------------------------------------------------------------------------
//
// Monday-start, padded to whole weeks, every cell a local calendar day. All of
// the arithmetic is `lib/calendar.ts`'s; this file is layout and callbacks.
//
// **Only scheduled posts appear here, and that is the grid's one blind spot.**
// A post with no slot has no cell it could honestly occupy, so the header
// counts them and hands them to the list view rather than inventing a place —
// the number is the pointer, and without it an idea in the tray would be
// invisible on the surface people actually open.
//
// Pure, like every view in this folder: no queries, and every affordance
// renders only when its callback prop does.

export interface CalendarMonthGridProps {
  /** 0-based, like `Date.prototype.getMonth` — see `monthGridDays`. */
  year: number
  month: number
  /** Every post the brand has; the grid takes the scheduled ones. */
  posts: SocialPost[]
  /** Injectable clock, for the today ring. The `formatRelativeTime` precedent. */
  now?: Date
  onPrevMonth: () => void
  onNextMonth: () => void
  onToday: () => void
  onEditPost?: (post: SocialPost) => void
  /** The day whose empty space was clicked, as a `localDayKey`. */
  onNewPost?: (dayKey: string) => void
  /** Where "N unscheduled" goes — the list view, which is the only surface
   * that can show them. Absent = the count is stated but not a link. */
  onShowUnscheduled?: () => void
  /**
   * The enabled sets' dates, already filtered and deduped by
   * `keyDatesForSets`. Empty renders exactly what this grid rendered before
   * the feature existed, which is the house rule for every prop here.
   */
  keyDates?: KeyDate[]
  /** Enabled sets whose data stops before the visible month — see `staleSets`. */
  staleSets?: KeyDateSet[]
}

export function CalendarMonthGrid({
  year,
  month,
  posts,
  now = new Date(),
  onPrevMonth,
  onNextMonth,
  onToday,
  onEditPost,
  onNewPost,
  onShowUnscheduled,
  keyDates = [],
  staleSets = [],
}: CalendarMonthGridProps) {
  const days = monthGridDays(year, month)
  const byDay = groupByDay(posts)
  const todayKey = localDayKey(now)
  const unscheduled = posts.filter((p) => p.scheduledAt === null).length

  // Split by shape, not by set: a season goes in the strip, a day goes in its
  // cell. `seasonsInMonth` is what stops a June festival banding across August.
  const { days: keyDays, seasons } = splitByShape(keyDates)
  const keyDatesForDay = keyDatesByDay(keyDays)
  const visibleSeasons = seasonsInMonth(seasons, year, month)

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label="Previous month"
            onClick={onPrevMonth}
          >
            <ChevronLeft className="size-4" />
          </Button>
          {/* `aria-live` so a month change is announced: the arrows move a
              whole grid whose only label is this line. */}
          <h2 aria-live="polite" className="min-w-40 text-center text-sm font-medium">
            {monthLabel(year, month)}
          </h2>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label="Next month"
            onClick={onNextMonth}
          >
            <ChevronRight className="size-4" />
          </Button>
          <Button variant="ghost" size="sm" className="ml-1" onClick={onToday}>
            Today
          </Button>
        </div>

        {unscheduled > 0 &&
          (onShowUnscheduled ? (
            <Button variant="ghost" size="sm" className="text-xs" onClick={onShowUnscheduled}>
              {unscheduledLabel(unscheduled)} — show the list
            </Button>
          ) : (
            <span className="text-xs text-muted-foreground">{unscheduledLabel(unscheduled)}</span>
          ))}
      </div>

      <KeyDateStrip seasons={visibleSeasons} />

      {/* The data running out is a fact, not a fault, so this is muted rather
          than a warning colour. It exists because an empty November 2027 that
          looks identical to a November with nothing scheduled is the dishonest
          empty state this repo has removed twice already — the line is the
          feature's shelf life, made visible. */}
      {staleSets.length > 0 && (
        <p className="mt-3 text-xs text-muted-foreground">
          {staleSets.map((set, i) => (
            <Fragment key={set}>
              {/* A real space, not `mr-1`. Three stale sets in one paragraph
                  read as `December 2027.Singapore holidays` to anything that
                  takes the text content — the same margin-instead-of-text bug
                  `SocialPostList`'s day heading documents at length, one file
                  over. The margin is what the eye sees; this is what the DOM
                  says, and both have to be right. */}
              {i > 0 && ' '}
              {/* A colon rather than `{label} are curated through …`: the
                  labels do not share a grammatical number, so the sentence form
                  read *"Global are curated through December 2027"* for the one
                  set whose label is not plural. A colon is agnostic to every
                  label this map will ever hold, including a future
                  `us-events`. */}
              {KEY_DATE_SET_LABELS[set]}: curated through {curatedThroughLabel(set)}.
            </Fragment>
          ))}
        </p>
      )}

      <div className="mt-4 grid grid-cols-7 gap-px overflow-hidden rounded-xl border bg-border">
        {WEEKDAY_LABELS.map((label) => (
          <div
            key={label}
            className="bg-card px-2 py-1.5 text-center text-xs text-muted-foreground"
          >
            {label}
          </div>
        ))}
        {days.map((day) => {
          const dayKey = localDayKey(day)
          return (
            <DayCell
              key={dayKey}
              day={day}
              dayKey={dayKey}
              posts={byDay.get(dayKey) ?? []}
              keyDates={keyDatesForDay.get(dayKey) ?? []}
              inMonth={day.getMonth() === ((month % 12) + 12) % 12}
              isToday={dayKey === todayKey}
              now={now}
              onEditPost={onEditPost}
              onNewPost={onNewPost}
            />
          )
        })}
      </div>
    </div>
  )
}

function unscheduledLabel(count: number): string {
  return `${count} unscheduled`
}

function DayCell({
  day,
  dayKey,
  posts,
  keyDates,
  inMonth,
  isToday,
  now,
  onEditPost,
  onNewPost,
}: {
  day: Date
  dayKey: string
  posts: SocialPost[]
  keyDates: KeyDate[]
  inMonth: boolean
  isToday: boolean
  now: Date
  onEditPost?: (post: SocialPost) => void
  onNewPost?: (dayKey: string) => void
}) {
  const addable = inMonth && Boolean(onNewPost)
  // Every key date on this day, however many are drawn: the label is what
  // carries the full name a truncated marker loses, and the third one the cell
  // does not draw at all.
  const heading = formatDayHeading(dayKey, now)
  const label =
    keyDates.length > 0
      ? `New post on ${heading} — ${keyDates.map((d) => d.name).join(', ')}`
      : `New post on ${heading}`
  return (
    <div
      className={cn(
        'group relative flex min-h-24 flex-col gap-1 bg-card p-1.5',
        !inMonth && 'bg-surface-sunken',
      )}
    >
      {/* The add affordance is the **whole cell**, not the space the chips
          leave: it is laid under the day's contents rather than after them, so
          the date number and the gaps between chips all mean what the cell as
          a whole means. Everything above it is `pointer-events-none` except
          the chips, which have their own click and keep it. Only inside the
          month: a padding day belongs to a month this grid is not showing, and
          creating there would silently write into a view nobody is looking at.
          The focus ring is inset — offset outwards it would be clipped by the
          neighbouring cells, which butt right up against this one. */}
      {addable && onNewPost && (
        <button
          type="button"
          onClick={() => onNewPost(dayKey)}
          aria-label={label}
          className="absolute inset-0 transition-colors duration-150 hover:bg-accent focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--border-focus)]"
        />
      )}

      <span
        className={cn(
          'pointer-events-none relative self-start rounded-full px-1.5 text-xs tabular-nums',
          !inMonth && 'text-tertiary',
          isToday && 'bg-primary font-medium text-primary-foreground',
        )}
      >
        {day.getDate()}
      </span>

      {/* Above the chips and below the date number: a key date is context for
          the day, not something you scheduled, so it reads before the plan
          rather than among it.

          `pointer-events-none` is what makes this cost no interaction at all —
          the cell's full-bleed add button keeps the click, so pressing a cell
          marked *Deepavali* opens "new post on 8 November", which is exactly
          what a marketer clicking it wants. The name is in the button's
          `aria-label` above, so the fall-through is announced rather than
          merely convenient.

          The visible label is `aria-hidden` for that reason: it would otherwise
          be read twice, once here and once inside the button's name.

          **Only while that button exists.** A padding cell has no add button —
          it belongs to a month this grid is not showing — so nothing else
          carries the name, and hiding the marker there put it on screen and
          nowhere in the accessibility tree. Ten days in the curated range land
          in a neighbouring month's grid this way, New Year's Day 2027 in the
          December 2026 view among them. Each is announced properly in its own
          month; this is what closes the other eleven-twelfths. */}
      {keyDates.slice(0, MAX_CELL_MARKERS).map((keyDate) => (
        <span
          key={keyDate.id}
          aria-hidden={addable ? 'true' : undefined}
          className={cn(
            'pointer-events-none relative truncate rounded px-1 text-[10px] leading-4 font-medium',
            KEY_DATE_APPEARANCE[keyDate.set].label,
          )}
        >
          {keyDate.name}
        </span>
      ))}

      {posts.map((post) => (
        <Chip key={post.id} post={post} onEditPost={onEditPost} />
      ))}

      {/* The `+` still sits in flow below the chips, where it was — it marks
          what the hover means without covering anything. Invisible until the
          cell is hovered or something inside it is focused: 31 permanent `+`
          glyphs is clutter, but a keyboard user has to be told the cell is
          live once they arrive on it. */}
      {addable && (
        <span className="pointer-events-none relative flex min-h-6 flex-1 items-center justify-center text-muted-foreground opacity-0 transition-opacity duration-150 group-focus-within:opacity-100 group-hover:opacity-100">
          <Plus className="size-3.5" aria-hidden="true" />
        </span>
      )}
    </div>
  )
}

/**
 * One post in a cell roughly 130px wide, which is why the platform and the
 * time share a line above the copy rather than sitting beside it.
 *
 * A `posted` chip is dimmed: the month's job is to show what is *coming*, and
 * something already out is context rather than work. It is dimmed and not
 * struck through — it happened, it was not cancelled.
 */
function Chip({ post, onEditPost }: { post: SocialPost; onEditPost?: (post: SocialPost) => void }) {
  const time = post.scheduledAt ? formatTimeOfDay(post.scheduledAt) : ''
  const excerpt = postExcerpt(post, 40)
  const content = (
    <>
      <span className="block truncate text-[10px] text-muted-foreground">
        {time} · {PLATFORM_LABELS[post.platform]}
      </span>
      <span className={cn('block truncate', !post.body && 'text-muted-foreground italic')}>
        {excerpt}
      </span>
    </>
  )
  // `relative` so the chip paints above the cell's full-bleed add button and
  // keeps its own click — an absolutely positioned sibling otherwise wins
  // regardless of source order.
  const className = cn(
    'relative w-full rounded-md border bg-card px-1.5 py-1 text-left text-xs',
    post.status === 'posted' && 'opacity-60',
  )
  if (!onEditPost) {
    return <div className={className}>{content}</div>
  }
  return (
    <button
      type="button"
      onClick={() => onEditPost(post)}
      aria-label={`Edit ${excerpt}`}
      className={cn(className, 'transition-colors duration-150 hover:bg-accent')}
    >
      {content}
    </button>
  )
}
