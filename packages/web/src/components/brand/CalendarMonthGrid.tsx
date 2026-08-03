import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import type { SocialPost } from '@brandfactory/shared'
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
import { PLATFORM_LABELS, postExcerpt } from '@/lib/social-copy'
import { cn } from '@/lib/utils'

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
}: CalendarMonthGridProps) {
  const days = monthGridDays(year, month)
  const byDay = groupByDay(posts)
  const todayKey = localDayKey(now)
  const unscheduled = posts.filter((p) => p.scheduledAt === null).length

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
  inMonth,
  isToday,
  now,
  onEditPost,
  onNewPost,
}: {
  day: Date
  dayKey: string
  posts: SocialPost[]
  inMonth: boolean
  isToday: boolean
  now: Date
  onEditPost?: (post: SocialPost) => void
  onNewPost?: (dayKey: string) => void
}) {
  return (
    <div
      className={cn('flex min-h-24 flex-col gap-1 bg-card p-1.5', !inMonth && 'bg-surface-sunken')}
    >
      <span
        className={cn(
          'self-start rounded-full px-1.5 text-xs tabular-nums',
          !inMonth && 'text-tertiary',
          isToday && 'bg-primary font-medium text-primary-foreground',
        )}
      >
        {day.getDate()}
      </span>

      {posts.map((post) => (
        <Chip key={post.id} post={post} onEditPost={onEditPost} />
      ))}

      {/* The add affordance fills whatever space the chips leave, so clicking
          an empty cell means what it looks like it means. Only inside the
          month: a padding day belongs to a month this grid is not showing, and
          creating there would silently write into a view nobody is looking at.
          Invisible until hovered or focused — 31 permanent `+` glyphs is
          clutter, but a keyboard user still has to be able to reach it. */}
      {inMonth && onNewPost && (
        <button
          type="button"
          onClick={() => onNewPost(dayKey)}
          aria-label={`New post on ${formatDayHeading(dayKey, now)}`}
          className="flex min-h-6 flex-1 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity duration-150 hover:bg-accent hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--border-focus)]"
        >
          <Plus className="size-3.5" aria-hidden="true" />
        </button>
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
  const className = cn(
    'w-full rounded-md border px-1.5 py-1 text-left text-xs',
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
