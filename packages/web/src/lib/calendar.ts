import type { SocialPost } from '@brandfactory/shared'

// ---------------------------------------------------------------------------
// calendar — the local-time arithmetic behind the month grid and the list
// ---------------------------------------------------------------------------
//
// **No date library.** None exists in this monorepo, and a month grid plus two
// converters do not earn one. Native `Date` + `Intl` only, the same budget
// `formatRelativeTime` works within.
//
// The one invariant every function here serves: **wire timestamps are UTC ISO,
// but a calendar is local.** A post at `2026-08-03T23:30:00.000Z` belongs to
// 4 August for a reader in Berlin and to 3 August for one in London, and the
// cell it lands in has to be the reader's. That is why no key in this file is
// ever derived from `toISOString().slice(0, 10)` — the shortest way to write
// the bug, and the reason `localDayKey` exists at all.
//
// The second invariant is that **days are added by day, never by 86 400 000
// milliseconds.** `new Date(y, m, d + i)` walks the local calendar and is
// correct across a DST boundary; adding a day's worth of milliseconds silently
// produces a 23- or 25-hour day twice a year and duplicates or skips a cell.

/**
 * Monday-first, matching the grid's weekday row.
 *
 * Hard-coded rather than derived from `Intl`: the week's *start* is a locale
 * fact (`Intl.Locale.prototype.getWeekInfo` is not in every runtime this ships
 * to), and the calendar is Monday-start by decision, not by locale. Deriving
 * the labels while hard-coding the order would let the two disagree.
 */
export const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const

/**
 * The slot a new post lands in when the user picked a day but not a time —
 * "New post" in the header, or a click on an empty cell.
 *
 * 09:00 rather than 00:00 because midnight is a guess nobody makes on purpose:
 * a post typed into Thursday means Thursday morning far more often than it
 * means the first second of Thursday.
 */
export const DEFAULT_POST_TIME = '09:00'

const pad = (n: number) => String(n).padStart(2, '0')

/**
 * `YYYY-MM-DD` for a `Date`, read in the **browser's** timezone.
 *
 * The grouping key for everything: grid cells, list day headings, and the
 * `onNewPost(dayKey)` seed all speak this string. It is also exactly what an
 * `<input type="date">` takes and returns, so the dialog needs no second
 * format.
 */
export function localDayKey(date: Date): string {
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** `YYYY-MM-DD` back to local midnight, or `null` if it is not a day key. */
export function dayKeyToDate(dayKey: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey.trim())
  if (!m) return null
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const date = new Date(year, month - 1, day)
  // `new Date(2026, 12, 40)` is a valid `Date` in February — the constructor
  // normalises out-of-range components rather than refusing them. Round-trip
  // the parts to tell a real date from a normalised one.
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null
  }
  return date
}

/**
 * The days a month's grid renders: the 1st back to the preceding Monday, the
 * last day forward to the following Sunday, always a whole number of weeks.
 *
 * `month` is **0-based**, like `Date.prototype.getMonth`, because every caller
 * gets its value from a `Date` and a 1-based parameter would mean two
 * conventions in one component. Out-of-range months wrap the way the `Date`
 * constructor wraps them, which is what makes `shiftMonth` free.
 *
 * Each cell is local midnight of its day. In the handful of zones that spring
 * forward *at* midnight (América/Santiago, say) that instant is 01:00 instead —
 * the same calendar day, which is all any caller reads off it.
 */
export function monthGridDays(year: number, month: number): Date[] {
  const first = new Date(year, month, 1)
  // `getDay()` is Sunday-0; rotate to Monday-0.
  const leading = (first.getDay() + 6) % 7
  // Day 0 of the next month is the last day of this one.
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells = Math.ceil((leading + daysInMonth) / 7) * 7
  return Array.from({ length: cells }, (_, i) => new Date(year, month, 1 - leading + i))
}

/** `{year, month}` moved by whole months, normalised across the year boundary. */
export function shiftMonth(
  cursor: { year: number; month: number },
  delta: number,
): { year: number; month: number } {
  const moved = new Date(cursor.year, cursor.month + delta, 1)
  return { year: moved.getFullYear(), month: moved.getMonth() }
}

/**
 * Scheduled posts bucketed by local day key.
 *
 * Unscheduled posts are **absent, not grouped under a key** — they are the
 * list view's tray and the grid's header count, two renderings neither of
 * which wants them mixed into a day. A post whose `scheduledAt` will not parse
 * is dropped for the same reason a broken thumbnail is not rendered: there is
 * no honest cell for it.
 *
 * Insertion order is preserved, so a list already in `bySchedule` order comes
 * back with its keys in chronological order and its rows in order within each.
 */
export function groupByDay(posts: SocialPost[]): Map<string, SocialPost[]> {
  const byDay = new Map<string, SocialPost[]>()
  for (const post of posts) {
    if (post.scheduledAt === null) continue
    const key = localDayKey(new Date(post.scheduledAt))
    if (!key) continue
    const bucket = byDay.get(key)
    if (bucket) bucket.push(post)
    else byDay.set(key, [post])
  }
  return byDay
}

/**
 * A UTC ISO timestamp split into the two local strings the dialog's
 * `<input type="date">` and `<input type="time">` hold.
 *
 * An unparseable timestamp yields two empty strings, which the dialog reads as
 * "unscheduled" — the one interpretation that cannot corrupt a post.
 */
export function isoToLocalParts(iso: string): { date: string; time: string } {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return { date: '', time: '' }
  return { date: localDayKey(d), time: `${pad(d.getHours())}:${pad(d.getMinutes())}` }
}

/**
 * The inverse: local `YYYY-MM-DD` + `HH:mm` back to a UTC ISO instant.
 *
 * Returns `null` for a blank or malformed date — **the dialog's entire
 * unschedule gesture is clearing the date field**, so "no date" has to be a
 * value this function returns rather than an error it throws.
 *
 * A blank *time* beside a real date is not a refusal either: it means the day
 * without an opinion about the hour, and `DEFAULT_POST_TIME` supplies the
 * opinion. Seconds and milliseconds are always zeroed — nobody schedules a
 * post at 09:00:37.
 */
export function localPartsToIso(date: string, time: string): string | null {
  const day = dayKeyToDate(date)
  if (!day) return null
  const t = /^(\d{1,2}):(\d{2})/.exec(time.trim() || DEFAULT_POST_TIME)
  if (!t) return null
  const [hours, minutes] = [Number(t[1]), Number(t[2])]
  if (hours > 23 || minutes > 59) return null
  const at = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hours, minutes, 0, 0)
  if (Number.isNaN(at.getTime())) return null
  return at.toISOString()
}

/** `August 2026` — the grid's header. */
export function monthLabel(year: number, month: number): string {
  return new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' }).format(
    new Date(year, month, 1),
  )
}

/**
 * `09:00` — a scheduled post's local time, on chips and list rows.
 *
 * Deliberately the same string `isoToLocalParts` puts in the dialog's time
 * field, from the same code path: a row that reads 23:30 and an editor that
 * opens on 23:30 is not a coincidence worth risking to a second formatter.
 */
export function formatTimeOfDay(iso: string): string {
  return isoToLocalParts(iso).time
}

const DAY_HEADING = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
})

/**
 * A day group's heading in the list view: `Today`, `Tomorrow`, `Yesterday`, or
 * `Mon 3 Aug` — with the year appended only when it is not the current one,
 * because "2026" on every row of a 2026 calendar is noise, and its absence on a
 * 2027 row would be a lie.
 *
 * `now` is injectable, the `formatRelativeTime` precedent: a heading that reads
 * "Today" is the one thing in this file that changes without any data changing,
 * and a test cannot pin it otherwise.
 */
export function formatDayHeading(dayKey: string, now: Date = new Date()): string {
  const day = dayKeyToDate(dayKey)
  if (!day) return ''
  const todayKey = localDayKey(now)
  if (dayKey === todayKey) return 'Today'
  const shift = (delta: number) =>
    localDayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() + delta))
  if (dayKey === shift(1)) return 'Tomorrow'
  if (dayKey === shift(-1)) return 'Yesterday'
  // The year is appended rather than asked of `Intl`: `en-GB` punctuates the
  // two forms differently ("Mon 4 Jan" but "Mon, 4 Jan 2027"), so letting the
  // formatter add it would give the list two heading shapes depending on how
  // far ahead you scroll. One shape, one comma-free line.
  const heading = DAY_HEADING.format(day)
  return day.getFullYear() === now.getFullYear() ? heading : `${heading} ${day.getFullYear()}`
}
