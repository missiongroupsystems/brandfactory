import type { FeedMark, Post, Week } from '@/data/demo'
import { feedsOf } from '@/data/demo'

const WEEKDAY = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

/** Where a day sits in the month: its week, its column (0 = Monday) and its printed number. */
function locate(weeks: Week[], dayN: string): { w: number; d: number } | null {
  for (let w = 0; w < weeks.length; w++) {
    const d = weeks[w]!.days.findIndex((day) => day.n === dayN)
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
      if (holds(feedsOf(day), postId)) return day.n
      if (day.story.kind === 'post' && day.story.postId === postId) return day.n
    }
  }
  return null
}

/** True when a day's story row already holds a planned story other than this one. */
export function storyTaken(weeks: Week[], dayN: string, postId?: string): boolean {
  const day = weeks.flatMap((w) => w.days).find((d) => d.n === dayN)
  return day?.story.kind === 'post' && day.story.postId !== postId
}

/**
 * Moves a story post to a day's story row. The day it leaves shows an open story slot again; a
 * day can hold one planned story, so the caller checks `storyTaken` first.
 */
export function placeStory(weeks: Week[], postId: string, toN: string): Week[] {
  return weeks.map((week) => ({
    ...week,
    days: week.days.map((day) => {
      if (day.n === toN) return { ...day, story: { kind: 'post', postId } }
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
  toN: string,
): 'posted' | 'past' | 'same-day' | 'no-day' | null {
  if (post.stage === 'posted') return 'posted'
  const to = locate(weeks, toN)
  if (!to) return 'no-day'
  if (weeks[to.w]!.days[to.d]!.past) return 'past'
  if (dayOf(weeks, post.id) === toN) return 'same-day'
  return null
}

/**
 * The slot in words for a post moved to a day, keeping its time. The month runs 5 Oct – 1 Nov,
 * so a day printed below 5 is in November.
 */
export function slotFor(
  weeks: Week[],
  toN: string,
  slot: string,
): { slot: string; slotShort: string } {
  const to = locate(weeks, toN)!
  const time = slot.split(', ')[1] ?? '12:00'
  const weekday = WEEKDAY[to.d]!
  const month = Number(toN) < 5 ? 'Nov' : 'Oct'
  return { slot: `${weekday} ${toN} ${month}, ${time}`, slotShort: `${weekday}, ${time}` }
}

/**
 * Moves a post's tile to another day. The post takes the day's feed slot: an idea or an open slot
 * there gives way, and other posts stay, in time order. The day it leaves keeps any other posts.
 */
export function movePost(weeks: Week[], posts: Post[], postId: string, toN: string): Week[] {
  const byTime = (marks: FeedMark[]) =>
    [...marks].sort((a, b) => timeOf(a, posts).localeCompare(timeOf(b, posts)))
  return weeks.map((week) => ({
    ...week,
    days: week.days.map((day) => {
      const marks = feedsOf(day)
      let next: FeedMark[] | null = null
      if (day.n === toN) {
        next = byTime([...marks.filter((m) => m.kind === 'post'), { kind: 'post', postId }])
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
