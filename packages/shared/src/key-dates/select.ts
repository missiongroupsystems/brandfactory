import { dayKeyToDate, localDayKey, monthLabel } from '../date/day-key'
import { ALL_KEY_DATES } from './all'
import { CURATED_THROUGH, KEY_DATE_SETS, type KeyDate, type KeyDateSet } from './types'

// ---------------------------------------------------------------------------
// select — every question a consumer has about the dataset, answered once
// ---------------------------------------------------------------------------
//
// Pure functions over static data, no memoisation. The whole dataset is under a
// hundred entries and these are O(n) filters run once per render — the same
// budget `groupByDay` already spends on every post on the page.
//
// **Day keys are compared as strings, never as `Date`s.** `YYYY-MM-DD` sorts
// lexicographically exactly the way it sorts chronologically, which is the same
// property `SocialPostList` already relies on for its Upcoming/Past split.
// Parsing to `Date` to compare would add a timezone to a question that has none.

/**
 * The enabled sets' dates, with shared observances collapsed.
 *
 * Christmas Day, New Year's Day, Good Friday, Labour Day and Chinese New Year
 * exist in both `global` and `sg-holidays` by design — each set has to stand
 * alone for a brand that enables only that one — so with both on they would
 * render twice. Entries sharing `start` **and** `name` collapse to one.
 *
 * **The survivor is whichever set comes first in `KEY_DATE_SETS`**, and the
 * mechanism is that `ALL_KEY_DATES` is concatenated in that order and this
 * keeps the first match. So `global` wins Christmas, and the precedence rule
 * lives in the tuple rather than here.
 *
 * Names that genuinely differ are genuinely different entries: 9 August 2026
 * keeps both *National Day* and *National Day Parade*, which is two facts, not
 * one repeated.
 *
 * Sorted by `start` afterwards, so the strip and the list read chronologically.
 * The sort is stable, so same-day entries keep set order — the holiday above
 * the event, not the other way round.
 */
export function keyDatesForSets(enabled: readonly KeyDateSet[]): KeyDate[] {
  const seen = new Set<string>()
  const kept: KeyDate[] = []
  for (const date of ALL_KEY_DATES) {
    if (!enabled.includes(date.set)) continue
    // `\0` rather than a dash: no name contains it, so no pair of entries
    // can collide by having the separator inside one of the halves.
    const identity = `${date.start}\0${date.name}`
    if (seen.has(identity)) continue
    seen.add(identity)
    kept.push(date)
  }
  return kept.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0))
}

/**
 * The dataset split by **shape, not by set** — the decision the whole render
 * layer turns on.
 *
 * A single day gets a marker in its own cell; a season gets a band above the
 * grid. Painting a pill into every covered cell would put a marker on 29 of
 * August's 31 days — the Hungry Ghost month and the Night Festival overlap
 * there — and bury the posts the grid exists to show.
 *
 * The discriminator is the presence of `end`, which is why a single day is
 * `start` alone rather than `start === end`.
 */
export function splitByShape(dates: KeyDate[]): { days: KeyDate[]; seasons: KeyDate[] } {
  const days: KeyDate[] = []
  const seasons: KeyDate[] = []
  for (const date of dates) {
    if (date.end === undefined) days.push(date)
    else seasons.push(date)
  }
  return { days, seasons }
}

/**
 * Single-day entries bucketed by day key, mirroring `groupByDay`.
 *
 * Takes `days` — `splitByShape`'s first half — **not the whole dataset**. A
 * season handed in here would land on its start day only and vanish for the
 * rest of its run, which is the failure mode the strip exists to avoid.
 *
 * Insertion order is preserved, so a list already sorted by `start` comes back
 * with its keys in chronological order.
 */
export function keyDatesByDay(days: KeyDate[]): Map<string, KeyDate[]> {
  const byDay = new Map<string, KeyDate[]>()
  for (const date of days) {
    const bucket = byDay.get(date.start)
    if (bucket) bucket.push(date)
    else byDay.set(date.start, [date])
  }
  return byDay
}

/**
 * The seasons overlapping a visible month — `month` **0-based**, like
 * `Date.prototype.getMonth` and `monthGridDays`.
 *
 * Overlap, not containment: a season counts when it starts on or before the
 * month's last day **and** ends on or after its first. Testing only whether
 * `start` falls in the month misses every season you are standing in the middle
 * of — and mid-season is exactly when you are most likely to be planning inside
 * it. i Light sits inside a single June; the Hungry Ghost month does not, and
 * neither does GrillFest.
 */
export function seasonsInMonth(seasons: KeyDate[], year: number, month: number): KeyDate[] {
  const firstDay = localDayKey(new Date(year, month, 1))
  // Day 0 of the next month is the last day of this one — `monthGridDays`'
  // trick, same reason.
  const lastDay = localDayKey(new Date(year, month + 1, 0))
  return seasons.filter((s) => s.start <= lastDay && (s.end ?? s.start) >= firstDay)
}

/**
 * Everything the dataset has to say about **one day** — the single days that
 * land on it, and the seasons running through it.
 *
 * Split rather than concatenated, because the two are different claims: *today
 * is Deepavali* and *today is inside the Hungry Ghost month* are not the same
 * sentence, and a caller that wants to render them alike can still concatenate
 * what it gets back. `splitByShape` is what decides which is which, so this
 * function and the grid cannot disagree about a shape.
 *
 * **Not `seasonsInMonth` with a narrower range.** That function answers a
 * month-shaped question — *does this season overlap the visible grid* — and its
 * answer is `true` for a season that ends three weeks before the day being
 * asked about. Containment and overlap are the same test only when the window
 * is one day long, and writing it that way would leave the next caller to
 * discover which of the two it got.
 *
 * An empty or unparseable `dayKey` matches nothing, which is what an empty date
 * field in a form should show: no chips, rather than every season in the set.
 * Day keys compare as strings — the invariant this whole file rests on.
 */
export function keyDatesOnDay(
  dates: KeyDate[],
  dayKey: string,
): { days: KeyDate[]; seasons: KeyDate[] } {
  const { days, seasons } = splitByShape(dates)
  return {
    days: days.filter((d) => d.start === dayKey),
    seasons: seasons.filter((s) => s.start <= dayKey && (s.end ?? s.start) >= dayKey),
  }
}

/**
 * The next `limit` entries, for the list view's **Key dates** block.
 *
 * This block is the part that earns the feature: day-heading suffixes only
 * appear on days that already have posts, so without it a Deepavali nobody has
 * planned for is invisible on the one surface whose job is to say what is
 * coming.
 *
 * An entry counts while it is still **running**, not only before it starts —
 * the test is `end ?? start`, so a season you are three days into is still
 * listed rather than dropping off the moment it begins. For a single day that
 * reduces to "today is included, yesterday is not".
 *
 * `now` is injectable, the `formatDayHeading` precedent: this is the one
 * function here whose answer changes without any data changing, and a test
 * cannot pin it otherwise.
 */
export function upcomingKeyDates(dates: KeyDate[], now: Date, limit: number): KeyDate[] {
  const todayKey = localDayKey(now)
  if (!todayKey) return []
  return dates
    .filter((d) => (d.end ?? d.start) >= todayKey)
    .sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0))
    .slice(0, Math.max(0, limit))
}

/**
 * Which enabled sets the visible month has outrun — `month` **0-based**.
 *
 * Compared against the month's **first** day, not its last. Against the last,
 * a December whose data stops on the 25th would nag about a month it very
 * nearly covers; against the first, the line appears only once the whole month
 * is past the horizon.
 *
 * Returned in `KEY_DATE_SETS` order rather than `enabled` order, so the
 * sentence under the header reads the same however the user toggled the menu.
 */
export function staleSets(
  enabled: readonly KeyDateSet[],
  year: number,
  month: number,
): KeyDateSet[] {
  const firstDay = localDayKey(new Date(year, month, 1))
  return KEY_DATE_SETS.filter((set) => enabled.includes(set) && CURATED_THROUGH[set] < firstDay)
}

/**
 * The month a set's data runs out in, for the beyond-horizon line:
 * `December 2026`.
 *
 * Month precision rather than the exact day, because the sentence it lands in
 * is about a month you are looking at. *"Curated through 25 December 2027"*
 * invites the reader to wonder what happens on the 26th, when the honest answer
 * is that the set simply has no more rows — `sg-holidays` ends on Christmas Day
 * because that is the last gazetted holiday, not because the 26th is missing.
 *
 * Reuses `monthLabel`, so this line and the grid's own `‹ August 2026 ›` header
 * cannot render the month two different ways.
 */
export function curatedThroughLabel(set: KeyDateSet): string {
  const through = dayKeyToDate(CURATED_THROUGH[set])
  if (!through) return ''
  return monthLabel(through.getFullYear(), through.getMonth())
}

const DAY_MONTH = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' })

/**
 * A key date's dates, as the strip and the list block render them:
 * `8 Nov` · `5–28 Jun` · `23 Jul – 16 Aug` · `18 Dec 2026 – 3 Jan 2027`.
 *
 * Four shapes because the shortest honest one differs. Within a month only the
 * first day number is needed; across months both need their month; across years
 * both need their year, and nothing in the dataset does that today — but a
 * range that silently dropped the year would be a lie the moment one did.
 *
 * The tight dash in `5–28 Jun` versus the spaced one in `23 Jul – 16 Aug` is
 * deliberate: an unspaced dash between two multi-word dates reads as a single
 * mangled date.
 *
 * An unparseable key yields `''`, `formatDayHeading`'s answer to the same
 * question — a band with no dates is recoverable, a band reading `NaN` is not.
 */
export function formatKeyDateRange(date: KeyDate): string {
  const start = dayKeyToDate(date.start)
  if (!start) return ''
  if (date.end === undefined) return DAY_MONTH.format(start)
  const end = dayKeyToDate(date.end)
  if (!end) return DAY_MONTH.format(start)

  if (start.getFullYear() !== end.getFullYear()) {
    return `${DAY_MONTH.format(start)} ${start.getFullYear()} – ${DAY_MONTH.format(end)} ${end.getFullYear()}`
  }
  if (start.getMonth() !== end.getMonth()) {
    return `${DAY_MONTH.format(start)} – ${DAY_MONTH.format(end)}`
  }
  return `${start.getDate()}–${DAY_MONTH.format(end)}`
}
