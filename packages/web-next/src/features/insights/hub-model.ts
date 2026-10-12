import { dayOf, type BrandHub, type Split } from '@/data/insights-hub'
import type { PostStat } from '@/data/insights'

/**
 * The insights hub model: the sums behind the Sources chart and the Sentiment view, as pure
 * functions. The page only reads these, so a finding always says what the chart shows.
 */

/** The days after a post that count as its effect: the next two. Bookings lag a scroll by a day. */
export const AFTER = 2
const mean = (xs: number[]) => xs.reduce((n, v) => n + v, 0) / xs.length
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2
}

/** The days a post can have moved: the two after each one. The rest of the month is quiet. */
export function busyDays(postDays: number[]): Set<number> {
  return new Set(postDays.flatMap((p) => Array.from({ length: AFTER }, (_, i) => p + 1 + i)))
}

/**
 * How far a measure ran above its usual level in the two days after `day`: 1.4 is 40% above.
 * The usual level for each of those days is the median of the same weekday on quiet days, the
 * ones no post could have moved: a Thursday post is not credited with every Friday's crowd, and
 * a big Friday after another post does not raise the bar. A weekday with no quiet day falls back
 * to that weekday across the rest of the month.
 */
export function liftAfter(values: number[], day: number, postDays: number[]): number {
  const after = Array.from({ length: AFTER }, (_, i) => day + 1 + i).filter(
    (d) => d < values.length,
  )
  if (after.length === 0) return 1
  const busy = busyDays(postDays)
  const usual = after.map((d) => {
    const same = values.filter((_, i) => i % 7 === d % 7 && !after.includes(i))
    const quiet = values.filter((_, i) => i % 7 === d % 7 && !busy.has(i))
    return median(quiet.length > 0 ? quiet : same)
  })
  return mean(after.map((d) => values[d]!)) / mean(usual)
}

export interface OffSocialFinding {
  post: PostStat
  day: number
  /** Bookings in the two days after it, against the same weekdays as usual. */
  bookings: number
}

/** The post that bookings rose most after: the one finding the Sources chart leads with. */
export function bestOffSocial(posts: PostStat[], hub: BrandHub): OffSocialFinding {
  const days = posts.map((p) => dayOf(p.date))
  const all = posts.map((post, i) => ({
    post,
    day: days[i]!,
    bookings: liftAfter(hub.daily.bookings, days[i]!, days),
  }))
  return all.reduce((a, b) => (b.bookings > a.bookings ? b : a))
}

/**
 * How far bookings ran above a usual day after each kind of post, as a whole percent, most
 * first: David's "after which post type did we get reservations?". A format that did nothing
 * reads 0, never below: a dip is the week, not the post.
 */
export function bookingsByFormat(
  posts: PostStat[],
  bookings: number[],
): Array<{ format: PostStat['format']; percent: number; posts: number }> {
  const days = posts.map((p) => dayOf(p.date))
  const groups = new Map<PostStat['format'], number[]>()
  posts.forEach((p, i) => {
    groups.set(p.format, [...(groups.get(p.format) ?? []), liftAfter(bookings, days[i]!, days)])
  })
  return [...groups]
    .map(([format, lifts]) => ({
      format,
      percent: Math.max(0, Math.round((mean(lifts) - 1) * 100)),
      posts: lifts.length,
    }))
    .sort((a, b) => b.percent - a.percent)
}

export const sum = (s: Split) => s.pos + s.neu + s.neg

/** Splits added together: a month of weeks, or comments and mentions. */
export function addSplits(splits: Split[]): Split {
  return splits.reduce((a, s) => ({ pos: a.pos + s.pos, neu: a.neu + s.neu, neg: a.neg + s.neg }), {
    pos: 0,
    neu: 0,
    neg: 0,
  })
}

/**
 * A split as whole percentages that always add up to 100, by largest remainder: rounding each
 * on its own can print 73 + 19 + 9 = 101 under a bar that is plainly full.
 */
export function percents(s: Split): Split {
  const n = sum(s)
  if (n === 0) return { pos: 0, neu: 0, neg: 0 }
  const keys = ['pos', 'neu', 'neg'] as const
  const exact = keys.map((key) => (s[key] / n) * 100)
  const out = exact.map(Math.floor)
  const order = exact.map((v, i) => [v - out[i]!, i] as const).sort((a, b) => b[0] - a[0])
  const short = 100 - out.reduce((a, b) => a + b, 0)
  for (let i = 0; i < short; i++) out[order[i]![1]]! += 1
  return { pos: out[0]!, neu: out[1]!, neg: out[2]! }
}
