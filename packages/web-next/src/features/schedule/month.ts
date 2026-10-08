import type { BrandId } from '@/data/brands'
import type { CalendarEvent, Day, FeedMark, LayerKey, Post, Week } from '@/data/demo'
import { INSIGHTS_BY_BRAND } from '@/data/insights'

/**
 * Months other than the demo's October, built from real dates. A month shows the weeks whose
 * Monday falls in it, which is how the October data already runs (5 Oct – 1 Nov), so months
 * never overlap. Today is Tuesday 6 October 2026. The past shows what each brand really posted
 * (the posts on the insights page); the future is open days and the public holidays a
 * Singapore restaurant plans around.
 */

export const TODAY = new Date(2026, 9, 6)
/** The month the demo's own data covers. */
export const DEMO_MONTH = { year: 2026, month: 9 }

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
const WEEKDAY = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

/** Dates the month view marks, by month (0-based) and day. */
const HOLIDAYS: Array<{ m: number; d: number; text: string; layer: LayerKey; span?: number }> = [
  { m: 7, d: 9, text: 'National Day', layer: 'holiday' },
  { m: 8, d: 25, text: 'Mid-Autumn Festival', layer: 'holiday' },
  { m: 10, d: 8, text: 'Deepavali', layer: 'holiday' },
  { m: 10, d: 11, text: '11.11 sales', layer: 'city' },
  { m: 10, d: 27, text: 'Black Friday', layer: 'city', span: 3 },
  { m: 11, d: 24, text: 'Christmas Eve', layer: 'holiday', span: 2 },
  { m: 11, d: 31, text: "New Year's Eve", layer: 'holiday' },
]

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate()

/** The ISO week number, as the October data prints it ("WK 41"). */
function isoWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const day = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - day)
  const start = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil(((d.getTime() - start.getTime()) / 86400000 + 1) / 7)
}

/** The Mondays that fall in a month. */
function mondays(year: number, month: number): Date[] {
  const out: Date[] = []
  const d = new Date(year, month, 1)
  while (d.getDay() !== 1) d.setDate(d.getDate() + 1)
  while (d.getMonth() === month) {
    out.push(new Date(d))
    d.setDate(d.getDate() + 7)
  }
  return out
}

/** "16 SEP" → a date in 2026. */
function parseShort(date: string): Date | null {
  const [d, m] = date.split(' ')
  const month = SHORT.indexOf(m ?? '')
  return month < 0 ? null : new Date(2026, month, Number(d))
}

/**
 * What each brand posted before today, as posts the calendar can draw: the month's posts from the
 * insights page, posted at 18:00, with the date each went out. Posted, so nothing can drag them.
 */
function archive(brandId: BrandId): Array<{ post: Post; date: Date }> {
  return INSIGHTS_BY_BRAND[brandId].posts.flatMap((p, i) => {
    const date = parseShort(p.date)
    if (!date) return []
    const weekday = WEEKDAY[(date.getDay() + 6) % 7]!
    const post: Post = {
      id: `${brandId}-archive-${i}`,
      format: p.format === 'photo' ? 'carousel' : p.format,
      hook: p.hook,
      images: [p.image],
      stage: 'posted',
      slot: `${weekday} ${date.getDate()} ${MONTHS[date.getMonth()]!.slice(0, 3)}, 18:00`,
      slotShort: `${weekday}, 18:00`,
    }
    return [{ post, date }]
  })
}

/** The archive's posts, for the posts store, so the calendar can find each one by id. */
export function archiveFor(brandId: BrandId): Post[] {
  return archive(brandId).map((a) => a.post)
}

/** A month's title and weeks, for any month but the demo's own. */
export function monthView(
  brandId: BrandId,
  year: number,
  month: number,
): { title: string; range: string; weeks: Week[] } {
  const posted = archive(brandId)
  const starts = mondays(year, month)
  const weeks: Week[] = starts.map((monday) => {
    const days: Day[] = Array.from({ length: 7 }, (_, i) => {
      const date = new Date(monday)
      date.setDate(monday.getDate() + i)
      const feed: FeedMark[] = posted
        .filter((a) => sameDay(a.date, date))
        .map((a) => ({ kind: 'post', postId: a.post.id }))
      return {
        n: String(date.getDate()),
        past: date < TODAY && !sameDay(date, TODAY),
        today: sameDay(date, TODAY),
        story: { kind: 'open', draftsReady: false },
        ...(feed.length ? { feed: feed.length === 1 ? feed[0] : feed } : {}),
      }
    })
    const events: CalendarEvent[] = HOLIDAYS.flatMap((h) => {
      const date = new Date(year, h.m, h.d)
      const col = Math.round((date.getTime() - monday.getTime()) / 86400000)
      if (col < 0 || col > 6) return []
      return [{ layer: h.layer, text: h.text, col: col + 1, span: Math.min(h.span ?? 1, 7 - col) }]
    })
    return { label: `WK ${isoWeek(monday)}`, days, events }
  })
  const first = starts[0]!
  const last = new Date(starts.at(-1)!)
  last.setDate(last.getDate() + 6)
  const fmt = (d: Date) => `${d.getDate()} ${SHORT[d.getMonth()]}`
  return {
    title: MONTHS[month]!,
    range: `${fmt(first)} – ${fmt(last)} · WK ${isoWeek(first)}–${isoWeek(starts.at(-1)!)}`,
    weeks,
  }
}

/** The real date of a place on the calendar: the month's first Monday, then weeks and days. */
export function dateOf(offset: number, week: number, day: number): Date {
  const m = new Date(DEMO_MONTH.year, DEMO_MONTH.month + offset, 1)
  const first = mondays(m.getFullYear(), m.getMonth())[0]!
  const d = new Date(first)
  d.setDate(first.getDate() + week * 7 + day)
  return d
}

/** How many weeks a month shows. */
export function weekCount(offset: number): number {
  const m = new Date(DEMO_MONTH.year, DEMO_MONTH.month + offset, 1)
  return mondays(m.getFullYear(), m.getMonth()).length
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
  const m = new Date(DEMO_MONTH.year, DEMO_MONTH.month + offset, 1).getMonth()
  const mark = (week: Week, w: number): Week => {
    const inside = week.days.map((_, i) => dateOf(offset, w, i).getMonth() === m)
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
    lead: dateOf(offset, 0, 0).getDate() === 1 || !last ? undefined : mark(last, -1),
    weeks: weeks.map(mark),
  }
}
