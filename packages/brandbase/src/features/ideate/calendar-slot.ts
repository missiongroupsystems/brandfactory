import type { Week } from '@/data/demo'
import { feedsOf } from '@/data/demo'

const WEEKDAY = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

/** A day in words, "Tue 20 Oct". The month runs 5 Oct – 1 Nov, so a day below 5 is November. */
export function dayLabel(weeks: Week[], dayN: string): string | null {
  for (const week of weeks) {
    const d = week.days.findIndex((day) => day.n === dayN)
    if (d !== -1) return `${WEEKDAY[d]} ${dayN} ${Number(dayN) < 5 ? 'Nov' : 'Oct'}`
  }
  return null
}

/** Where a day sits in the month, for sorting: 0 for the first day, -1 if absent. */
export function dayIndex(weeks: Week[], dayN: string): number {
  return weeks.flatMap((w) => w.days).findIndex((d) => d.n === dayN)
}

/**
 * The day an idea already sits on, by its hook, or null. An idea tile and a post are both a
 * match, so a hook that became a post reads as placed too.
 */
export function dayOfHook(
  weeks: Week[],
  hook: string,
  hookOfPost: (postId: string) => string | undefined,
): string | null {
  for (const week of weeks) {
    for (const day of week.days) {
      const placed = feedsOf(day).some(
        (m) =>
          (m.kind === 'idea' && m.hook === hook) ||
          (m.kind === 'post' && hookOfPost(m.postId) === hook),
      )
      if (placed) return day.n
    }
  }
  return null
}

/** `dayOfHook`, in words. */
export function slotOfHook(
  weeks: Week[],
  hook: string,
  hookOfPost: (postId: string) => string | undefined,
): string | null {
  const n = dayOfHook(weeks, hook, hookOfPost)
  return n ? dayLabel(weeks, n) : null
}

/**
 * The day an idea lands on. The day asked for, if it is ahead and holds no post; else the first
 * empty day after this week, since a shoot needs lead time. Null when the month is full.
 */
export function landingDay(weeks: Week[], preferDayN?: string): string | null {
  const ahead = weeks.flatMap((w) => w.days).filter((d) => !d.past && !d.today)
  const asked = preferDayN ? ahead.find((d) => d.n === preferDayN) : undefined
  if (asked && feedsOf(asked).every((m) => m.kind !== 'post')) return asked.n
  const thisWeek = weeks.findIndex((w) => w.days.some((d) => d.today))
  const later = weeks.slice(thisWeek + 1).flatMap((w) => w.days)
  return later.find((d) => feedsOf(d).length === 0)?.n ?? null
}
