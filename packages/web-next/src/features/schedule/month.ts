import type { BrandId } from '@/data/brands'
import {
  feedsOf,
  type CalendarEvent,
  type Day,
  type FeedMark,
  type LayerKey,
  type Post,
  type Week,
} from '@/data/demo'
import { INSIGHTS_BY_BRAND } from '@/data/insights'
import {
  addDays,
  dayNumber,
  firstOf,
  mondayOf,
  monthOf,
  slotOf,
  todayDate,
  weekdayOf,
} from '@/lib/dates'
import { remote } from '@/lib/remote'

/**
 * Months on real dates. A month shows the weeks whose Monday falls in it, which is how the demo's
 * October already runs (5 Oct – 1 Nov), so months never overlap. Month offsets count from the
 * month of this week's Monday. In the demo, today is Tuesday 6 October 2026 and the past shows
 * what each brand really posted (the posts on the insights page); the future is open days and the
 * public holidays a Singapore restaurant plans around. On the API the brand's weeks come from the
 * server (`remote-calendar.ts`) and a month they do not reach is open days.
 */

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]
const SHORT = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

/**
 * Dates the month view marks, by month (0-based) and day. A holiday that moves each year carries
 * the one year its date is known for.
 */
const HOLIDAYS: Array<{
  m: number
  d: number
  text: string
  layer: LayerKey
  span?: number
  year?: number
}> = [
  { m: 7, d: 9, text: 'National Day', layer: 'holiday' },
  { m: 8, d: 25, text: 'Mid-Autumn Festival', layer: 'holiday', year: 2026 },
  { m: 10, d: 8, text: 'Deepavali', layer: 'holiday', year: 2026 },
  { m: 10, d: 11, text: '11.11 sales', layer: 'city' },
  { m: 10, d: 27, text: 'Black Friday', layer: 'city', span: 3, year: 2026 },
  { m: 11, d: 24, text: 'Christmas Eve', layer: 'holiday', span: 2 },
  { m: 11, d: 31, text: "New Year's Eve", layer: 'holiday' },
]

/** The ISO week number, as the October data prints it ("WK 41"). */
function isoWeek(monday: string): number {
  const thursday = addDays(monday, 3)
  const jan1 = firstOf(monthOf(thursday).year, 0)
  const days = (Date.parse(thursday) - Date.parse(jan1)) / 86400000
  return Math.floor(days / 7) + 1
}

/** The Mondays that fall in a month. */
function mondays(year: number, month: number): string[] {
  const first = firstOf(year, month)
  const out: string[] = []
  for (let d = addDays(first, (7 - weekdayOf(first)) % 7); monthOf(d).month === month; ) {
    out.push(d)
    d = addDays(d, 7)
  }
  return out
}

/** The month `offset` months from the month of this week's Monday. */
export function monthAt(offset: number, today = todayDate()): { year: number; month: number } {
  const home = monthOf(mondayOf(today))
  return monthOf(firstOf(home.year, home.month + offset))
}

/** A title for the period that ends on `date`, with the year when it is not this year's. */
export function withYear(title: string, date: string, today = todayDate()): string {
  const { year } = monthOf(date)
  return year === monthOf(today).year ? title : `${title} ${year}`
}

/** A month's title and range, as the demo prints October's: "5 OCT – 1 NOV · WK 41–44". */
export function monthTitle(year: number, month: number): { title: string; range: string } {
  const starts = mondays(year, month)
  const first = starts[0]!
  const last = starts.at(-1)!
  const fmt = (d: string) => `${dayNumber(d)} ${SHORT[monthOf(d).month]}`
  return {
    title: MONTHS[month]!,
    range: `${fmt(first)} – ${fmt(addDays(last, 6))} · WK ${isoWeek(first)}–${isoWeek(last)}`,
  }
}

/** The holidays in the week that starts on `monday`. */
function holidayEvents(monday: string): CalendarEvent[] {
  const years = new Set([monthOf(monday).year, monthOf(addDays(monday, 6)).year])
  return [...years].flatMap((year) =>
    HOLIDAYS.flatMap((h) => {
      if (h.year !== undefined && h.year !== year) return []
      const date = addDays(firstOf(year, h.m), h.d - 1)
      const col = (Date.parse(date) - Date.parse(monday)) / 86400000
      if (col < 0 || col > 6) return []
      return [{ layer: h.layer, text: h.text, col: col + 1, span: Math.min(h.span ?? 1, 7 - col) }]
    }),
  )
}

/** An empty week from a Monday: open days, today and the past marked, and its holidays. */
export function blankWeek(monday: string, today = todayDate()): Week {
  return {
    label: `WK ${isoWeek(monday)}`,
    events: holidayEvents(monday),
    days: Array.from({ length: 7 }, (_, i): Day => {
      const date = addDays(monday, i)
      return {
        date,
        ...(date < today ? { past: true } : {}),
        ...(date === today ? { today: true } : {}),
        story: { kind: 'open', draftsReady: false },
      }
    }),
  }
}

/** The Mondays from one to another, both in. */
export function mondaysBetween(from: string, to: string): string[] {
  const out: string[] = []
  for (let d = mondayOf(from); d <= to; d = addDays(d, 7)) out.push(d)
  return out
}

/** The weeks of a month, cut from a run of weeks: the ones whose Monday is in it. */
export function weeksOfMonth(weeks: Week[], year: number, month: number): Week[] {
  return weeks.filter((w) => {
    const m = monthOf(w.days[0]!.date)
    return m.year === year && m.month === month
  })
}

/** The first and last Mondays of the months from `before` months back to `after` ahead. */
export function monthSpan(
  before: number,
  after: number,
  today = todayDate(),
): { from: string; to: string } {
  const a = monthAt(-before, today)
  const b = monthAt(after, today)
  return { from: mondays(a.year, a.month)[0]!, to: mondays(b.year, b.month).at(-1)! }
}

/**
 * Open weeks around today, from two months before to six after, as a brand on the core shows
 * before its state arrives (or when the core cannot be reached): today's real dates, no demo.
 */
export function openWeeks(today = todayDate()): Week[] {
  const { from, to } = monthSpan(2, 6, today)
  return mondaysBetween(from, to).map((monday) => blankWeek(monday, today))
}

/** The first and last Mondays of the month that the week holding `date` belongs to. */
export function monthOfWeek(date: string): { from: string; to: string } {
  const { year, month } = monthOf(mondayOf(date))
  const all = mondays(year, month)
  return { from: all[0]!, to: all.at(-1)! }
}

/** "16 SEP" → a date in 2026. */
function parseShort(date: string): string | null {
  const [d, m] = date.split(' ')
  const month = SHORT.indexOf(m ?? '')
  return month < 0 ? null : addDays(firstOf(2026, month), Number(d) - 1)
}

/**
 * What each brand posted before today, as posts the calendar can draw: the month's posts from the
 * insights page, posted at 18:00, with the date each went out. Posted, so nothing can drag them.
 * The demo's only: on the API the server holds what went out.
 */
function archive(brandId: BrandId): Array<{ post: Post; date: string }> {
  if (remote) return []
  return INSIGHTS_BY_BRAND[brandId].posts.flatMap((p, i) => {
    const date = parseShort(p.date)
    if (!date) return []
    const post: Post = {
      id: `${brandId}-archive-${i}`,
      format: p.format === 'photo' ? 'carousel' : p.format,
      hook: p.hook,
      images: [p.image],
      stage: 'posted',
      ...slotOf(date, '18:00'),
    }
    return [{ post, date }]
  })
}

/** The archive's posts, for the posts store, so the calendar can find each one by id. */
export function archiveFor(brandId: BrandId): Post[] {
  return archive(brandId).map((a) => a.post)
}

/** A month's title and weeks, for a month the brand's own weeks do not reach. */
export function monthView(
  brandId: BrandId,
  year: number,
  month: number,
): { title: string; range: string; weeks: Week[] } {
  const posted = archive(brandId)
  const weeks = mondays(year, month).map((monday) => {
    const week = blankWeek(monday)
    return {
      ...week,
      days: week.days.map((day) => {
        const feed: FeedMark[] = posted
          .filter((a) => a.date === day.date)
          .map((a) => ({ kind: 'post', postId: a.post.id }))
        return feed.length ? { ...day, feed: feed.length === 1 ? feed[0] : feed } : day
      }),
    }
  })
  return { ...monthTitle(year, month), weeks }
}

/** The date of a place on the calendar: the month's first Monday, then weeks and days. */
export function dateOf(offset: number, week: number, day: number): string {
  const { year, month } = monthAt(offset)
  return addDays(mondays(year, month)[0]!, week * 7 + day)
}

/** How many weeks a month shows. */
export function weekCount(offset: number): number {
  const { year, month } = monthAt(offset)
  return mondays(year, month).length
}

/**
 * Where today is: the home month, the week of today's Monday in it, and today's column. The month
 * view shows today's own month instead, which is the next one in the days before a month's first
 * Monday (Thu 1 Oct sits in a week that belongs to September).
 */
export function todayPlace(view?: 'month' | 'week' | 'day'): {
  offset: number
  week: number
  day: number
} {
  const today = todayDate()
  const { year, month } = monthAt(0)
  const day = weekdayOf(today)
  const own = monthOf(today)
  if (view === 'month' && (own.year !== year || own.month !== month)) {
    return { offset: (own.year - year) * 12 + own.month - month, week: 0, day }
  }
  return { offset: 0, week: mondays(year, month).indexOf(mondayOf(today)), day }
}

/**
 * Where a month picked from the title lands: the month view on that month, the week view on its
 * first week, the day view on its 1st (in the week before the first Monday, when the 1st is not
 * a Monday).
 */
export function monthPlace(
  view: 'month' | 'week' | 'day',
  year: number,
  month: number,
): { offset: number; week: number; day?: number } {
  const home = monthAt(0)
  const offsetOf = (m: { year: number; month: number }) =>
    (m.year - home.year) * 12 + m.month - home.month
  if (view !== 'day') return { offset: offsetOf({ year, month }), week: 0 }
  const first = firstOf(year, month)
  const monday = mondayOf(first)
  const own = monthOf(monday)
  return {
    offset: offsetOf(own),
    week: mondays(own.year, own.month).indexOf(monday),
    day: weekdayOf(first),
  }
}

/** The year of the brand's first post in its weeks, or this year's when none is earlier. */
export function firstPostYear(weeks: Week[], today = todayDate()): number {
  const first = weeks
    .flatMap((w) => w.days)
    .find(
      (d) =>
        d.story.kind === 'post' ||
        d.story.kind === 'posted' ||
        feedsOf(d).some((m) => m.kind === 'post'),
    )
  return Math.min(monthOf(first?.date ?? today).year, monthOf(today).year)
}

/**
 * The month grid's rows. Weeks belong to the month their Monday falls in, so the days before the
 * first Monday sit in the month before: the grid adds that week as a first row, `lead`, so the
 * month starts on the 1st. Every day outside the month, in the lead and in the last week, is marked.
 */
export function monthRows(
  offset: number,
  weeks: Week[],
  before: Week[],
): { lead?: Week; weeks: Week[] } {
  const m = monthAt(offset).month
  const mark = (week: Week): Week => {
    const inside = week.days.map((d) => monthOf(d.date).month === m)
    const from = inside.indexOf(true) + 1
    const to = inside.lastIndexOf(true) + 1
    return {
      ...week,
      days: week.days.map((d, i) => (inside[i] ? d : { ...d, outside: true })),
      // An event keeps only its days inside the month; one wholly outside it goes.
      events: week.events.flatMap((e) => {
        const col = Math.max(e.col, from)
        const end = Math.min(e.col + e.span - 1, to)
        return end < col ? [] : [{ ...e, col, span: end - col + 1 }]
      }),
    }
  }
  const last = before.at(-1)
  return {
    lead: dateOf(offset, 0, 0).endsWith('-01') || !last ? undefined : mark(last),
    weeks: weeks.map(mark),
  }
}
