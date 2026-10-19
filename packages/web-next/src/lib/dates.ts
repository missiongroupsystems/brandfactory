/**
 * Days are `YYYY-MM-DD` strings, the brand's local date, as the server keeps them. Each helper
 * reads the string as a date in UTC, so the browser's own zone never shifts a day.
 *
 * Today has one source: Tuesday 6 October 2026 in the demo, the server's `today` (the brand's
 * zone) once a brand loads from the API.
 */

export const WEEKDAY = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
export const MONTH_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]

const asUtc = (date: string) => new Date(`${date}T00:00:00Z`)
const isoOf = (d: Date) => d.toISOString().slice(0, 10)

export function addDays(date: string, n: number): string {
  const d = asUtc(date)
  d.setUTCDate(d.getUTCDate() + n)
  return isoOf(d)
}

/** 0 for Monday … 6 for Sunday: weeks run Monday to Sunday. */
export const weekdayOf = (date: string) => (asUtc(date).getUTCDay() + 6) % 7

/** The Monday of the week holding a day. */
export const mondayOf = (date: string) => addDays(date, -weekdayOf(date))

/** The number a day prints: "8". */
export const dayNumber = (date: string) => String(Number(date.slice(8, 10)))

/** The year and the month (0-based) of a day. */
export const monthOf = (date: string) => ({
  year: Number(date.slice(0, 4)),
  month: Number(date.slice(5, 7)) - 1,
})

/** The first day of a month, any number of months away: `firstOf(2026, 9 + 3)` is 1 Jan 2027. */
export function firstOf(year: number, month: number): string {
  return isoOf(new Date(Date.UTC(year, month, 1)))
}

/** A day in words: "Tue 20 Oct". */
export function dayLabel(date: string): string {
  const { month } = monthOf(date)
  return `${WEEKDAY[weekdayOf(date)]} ${dayNumber(date)} ${MONTH_SHORT[month]}`
}

/** The slot in words, as the calendar prints it: "Thu 8 Oct, 18:00" and "Thu, 18:00". */
export function slotOf(date: string | null, time: string | null) {
  const t = time ?? '12:00'
  if (!date) return { slot: `, ${t}`, slotShort: `, ${t}` }
  return { slot: `${dayLabel(date)}, ${t}`, slotShort: `${WEEKDAY[weekdayOf(date)]}, ${t}` }
}

// ── Today ────────────────────────────────────────────────────────────────────────────────────

/** The demo's today. */
export const DEMO_TODAY = '2026-10-06'

let today = DEMO_TODAY
const listeners = new Set<() => void>()

export const todayDate = () => today

/** The server's today, from a brand's state. Listeners hear only a real change. */
export function setToday(date: string) {
  if (date === today) return
  today = date
  listeners.forEach((l) => l())
}

export function onToday(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
