import type { Week } from '@/data/demo'
import { feedsOf } from '@/data/demo'
import { dayLabel } from '@/lib/dates'

export { dayLabel }

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
      if (placed) return day.date
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
  const date = dayOfHook(weeks, hook, hookOfPost)
  return date ? dayLabel(date) : null
}

/**
 * The day an idea lands on. The day asked for, if it is ahead and holds no post; else the first
 * empty day after this week, since a shoot needs lead time. Null when the month is full.
 */
export function landingDay(weeks: Week[], prefer?: string): string | null {
  const ahead = weeks.flatMap((w) => w.days).filter((d) => !d.past && !d.today)
  const asked = prefer ? ahead.find((d) => d.date === prefer) : undefined
  if (asked && feedsOf(asked).every((m) => m.kind !== 'post')) return asked.date
  const thisWeek = weeks.findIndex((w) => w.days.some((d) => d.today))
  const later = weeks.slice(thisWeek + 1).flatMap((w) => w.days)
  return later.find((d) => feedsOf(d).length === 0)?.date ?? null
}
