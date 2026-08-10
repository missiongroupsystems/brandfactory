import type { SocialPost } from '@brandfactory/shared'
import { formatKeyDateRange, type KeyDate } from '@/lib/key-dates'
import { monthPlanSummary } from '@/lib/social-plan'

// ---------------------------------------------------------------------------
// MonthPlanSummary — the one sentence, and it costs nothing
// ---------------------------------------------------------------------------
//
//   **National Day (9 Aug) has no post.** 31 days · 4 posts planned · 3 key
//   dates unclaimed.
//
// The most useful line the product can say to a marketer opening a month, and
// there is no model behind it: both halves come out of `social-plan.ts`, over
// the two arrays the grid underneath is already rendering.
//
// **Nothing here is a link and nothing here spends anything.** It states the
// month and stops. The panel that acts on it arrives in Phase F; a call to
// action wired in now would be a control that leads nowhere.
//
// Pure, like every view in this folder, and it takes the inputs rather than the
// computed summary — `CalendarMonthGrid` does its own `groupByDay` and
// `seasonsInMonth` from the same props for the same reason. One caller, one set
// of arguments, and no chance of the sentence being handed a summary of a
// different month than the grid below it draws.

export interface MonthPlanSummaryProps {
  /** Every post the brand has. The summary takes the live, scheduled ones. */
  posts: SocialPost[]
  /** The enabled sets' dates, already filtered and deduped by the page. */
  keyDates?: KeyDate[]
  /** 0-based month, like `Date.prototype.getMonth` — see `monthGridDays`. */
  year: number
  month: number
}

export function MonthPlanSummary({ posts, keyDates = [], year, month }: MonthPlanSummaryProps) {
  const { days, planned, keyDays, unclaimed } = monthPlanSummary(posts, keyDates, year, month)
  // The **first** unclaimed date, not a list of them: one thing to act on reads
  // as a prompt, three read as a backlog. The tail carries the count.
  const [first] = unclaimed

  const tail = [
    `${days} days`,
    `${planned} ${planned === 1 ? 'post' : 'posts'} planned`,
    // Dropped entirely when the month holds no single-day key date — with every
    // set switched off, *no key dates unclaimed* is a claim about an empty set,
    // and it reads as reassurance.
    ...(keyDays > 0 ? [unclaimedClause(unclaimed.length)] : []),
  ].join(' · ')

  return (
    <p className="mt-3 text-sm text-muted-foreground">
      {/* The bold clause is absent when every date in the month is claimed, and
          the tail is always there. A month with nothing to fix says what it is
          shaped like and makes no demand. */}
      {first && (
        <span className="font-medium text-foreground">
          {first.name} ({formatKeyDateRange(first)}) has no post.{' '}
        </span>
      )}
      {tail}.
    </p>
  )
}

/**
 * `3 key dates unclaimed` · `1 key date unclaimed` · `no key dates unclaimed`.
 *
 * The zero case is a word rather than a digit: *0 key dates unclaimed* invites
 * the reader to look for the rows it is counting, the same trap
 * `brandContextState` documents for *0 of 0 sections written*.
 */
function unclaimedClause(count: number): string {
  if (count === 0) return 'no key dates unclaimed'
  return `${count} key ${count === 1 ? 'date' : 'dates'} unclaimed`
}
