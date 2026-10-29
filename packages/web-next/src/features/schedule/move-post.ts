import type { FeedMark, Post, Week } from '@/data/demo'
import { feedsOf } from '@/data/demo'
import { clockTime, clockToday, slotOf, todayDate } from '@/lib/dates'
import { remote, timezoneOf } from '@/lib/remote'

/** Where a day sits in the weeks: its week and its column (0 = Monday). */
function locate(weeks: Week[], date: string): { w: number; d: number } | null {
  for (let w = 0; w < weeks.length; w++) {
    const d = weeks[w]!.days.findIndex((day) => day.date === date)
    if (d !== -1) return { w, d }
  }
  return null
}

function holds(marks: FeedMark[], postId: string): boolean {
  return marks.some((m) => m.kind === 'post' && m.postId === postId)
}

/** The day a post sits on, in the feed or in the story row, or null if no day holds it. */
export function dayOf(weeks: Week[], postId: string): string | null {
  for (const week of weeks) {
    for (const day of week.days) {
      if (holds(feedsOf(day), postId)) return day.date
      if (day.story.kind === 'post' && day.story.postId === postId) return day.date
    }
  }
  return null
}

/**
 * True when a day's story row is taken: by a planned story other than this one, or by stories
 * already out that day.
 */
export function storyTaken(weeks: Week[], date: string, postId?: string): boolean {
  const day = weeks.flatMap((w) => w.days).find((d) => d.date === date)
  if (day?.story.kind === 'posted') return true
  return day?.story.kind === 'post' && day.story.postId !== postId
}

/**
 * Moves a story post to a day's story row. The day it leaves shows an open story slot again; a
 * day can hold one planned story, so the caller checks `storyTaken` first.
 */
export function placeStory(weeks: Week[], postId: string, to: string): Week[] {
  return weeks.map((week) => ({
    ...week,
    days: week.days.map((day) => {
      if (day.date === to) return { ...day, story: { kind: 'post', postId } }
      if (day.story.kind === 'post' && day.story.postId === postId) {
        return { ...day, story: { kind: 'open', draftsReady: false } }
      }
      return day
    }),
  }))
}

/** Why a post cannot move to a day, or null if it can. */
export function moveRefusal(
  weeks: Week[],
  post: Post,
  to: string,
): 'posted' | 'past' | 'same-day' | 'no-day' | null {
  if (post.stage === 'posted') return 'posted'
  const at = locate(weeks, to)
  if (!at) return 'no-day'
  if (weeks[at.w]!.days[at.d]!.past) return 'past'
  if (dayOf(weeks, post.id) === to) return 'same-day'
  return null
}

/** The slot in words for a post moved to a day, keeping its time. */
export function slotFor(to: string, slot: string): { slot: string; slotShort: string } {
  return slotOf(to, slot.split(', ')[1] ?? '12:00')
}

/**
 * Moves a post's tile to another day. Posts there stay, in time order, and the day's ideas stay
 * after them: a day holds many plans now, so none gives way to a post. The day it leaves keeps
 * everything else.
 */
export function movePost(weeks: Week[], posts: Post[], postId: string, to: string): Week[] {
  const byTime = (marks: FeedMark[]) =>
    [...marks].sort((a, b) => timeOf(a, posts).localeCompare(timeOf(b, posts)))
  return weeks.map((week) => ({
    ...week,
    days: week.days.map((day) => {
      const marks = feedsOf(day)
      let next: FeedMark[] | null = null
      if (day.date === to) {
        const others = marks.filter((m) => !(m.kind === 'post' && m.postId === postId))
        next = [
          ...byTime([...others.filter((m) => m.kind === 'post'), { kind: 'post', postId }]),
          ...others.filter((m) => m.kind === 'idea'),
        ]
      } else if (holds(marks, postId)) {
        next = marks.filter((m) => !(m.kind === 'post' && m.postId === postId))
      }
      if (!next) return day
      const { feed: _drop, ...rest } = day
      return next.length === 0 ? rest : { ...rest, feed: next.length === 1 ? next[0] : next }
    }),
  }))
}

function timeOf(mark: FeedMark, posts: Post[]): string {
  if (mark.kind !== 'post') return ''
  return posts.find((p) => p.id === mark.postId)?.slot.split(', ')[1] ?? ''
}

/**
 * Today in the brand's own timezone on the core, the same clock `tooSoon` reads; the demo's fixed
 * today otherwise. The app's `todayDate()` is the last brand loaded, which may sit elsewhere.
 */
export const brandToday = (brandId: string) =>
  remote ? clockToday(new Date(), timezoneOf(brandId)) : todayDate()

/**
 * On the core, whether `time` on `date` has gone in the brand's own timezone, or comes within two
 * minutes: it would go out at once. The demo's today is a fixed day, so it never says so.
 */
export function tooSoon(brandId: string, date: string, time: string) {
  if (!remote) return false
  // The brand's own today: the app's today is the last brand loaded, which may sit elsewhere.
  const zone = timezoneOf(brandId)
  if (date !== clockToday(new Date(), zone)) return false
  const soon = clockTime(zone, new Date(Date.now() + 2 * 60_000))
  // Within two minutes of midnight the rest of today has gone.
  return soon < clockTime(zone) || time <= soon
}
