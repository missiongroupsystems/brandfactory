/** Days are brand-local `YYYY-MM-DD` strings; every rule about "today" reads the brand's zone. */

export type Day = string

export const DAY = /^\d{4}-\d{2}-\d{2}$/
export const TIME = /^([01]\d|2[0-3]):[0-5]\d$/

/** Today in a zone, as `YYYY-MM-DD`. */
export function todayIn(timezone: string, now: Date): Day {
  // en-CA prints dates as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

function asUtc(day: Day): Date {
  return new Date(`${day}T00:00:00Z`)
}

export function addDays(day: Day, n: number): Day {
  const d = asUtc(day)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** 0 for Monday … 6 for Sunday: weeks run Monday to Sunday. */
export function weekdayOf(day: Day): number {
  return (asUtc(day).getUTCDay() + 6) % 7
}

/** The Sunday that ends the week holding `day`. */
export function endOfWeek(day: Day): Day {
  return addDays(day, 6 - weekdayOf(day))
}

/** True for a real calendar date in `YYYY-MM-DD` form. */
export function isDay(value: string): boolean {
  return DAY.test(value) && asUtc(value).toISOString().slice(0, 10) === value
}

/**
 * The instant a brand-local day and time fall on. Computed from the zone's offset at that moment,
 * so it holds for zones with daylight saving as well as for Singapore.
 */
export function instantOf(day: Day, time: string, timezone: string): Date {
  const guess = new Date(`${day}T${time}:00Z`)
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(guess)
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value)
  const shown = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'))
  return new Date(guess.getTime() - (shown - guess.getTime()))
}
