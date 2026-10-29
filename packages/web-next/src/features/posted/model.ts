import type { Post } from '@/data/demo'
import { FORMAT_LABEL, kindOn, type ChannelKey } from '@/features/publish/model'
import { postOf, type ServerPost } from '@/features/schedule/remote-calendar'
import { addDays, clockTime, clockToday, dayLabel, MONTH_SHORT, todayDate } from '@/lib/dates'

/**
 * The Posted page's model, as pure functions the page only reads: what went out on each platform,
 * newest first, with its counts as last read, and the platform's last 30 days in one line. A count
 * a post does not have is left out, never shown as 0: until the core reads the platforms back, a
 * post Brand Base sent has no counts at all.
 */

/** The platforms the page lists, in the rail's order. */
export type Platform = Extract<ChannelKey, 'ig' | 'fb' | 'tt'>
export const PLATFORMS: Platform[] = ['ig', 'fb', 'tt']
export const PLATFORM_NAME: Record<Platform, string> = {
  ig: 'Instagram',
  fb: 'Facebook',
  tt: 'TikTok',
}

/** One thing that went out: a post, or a story with its frames. */
export interface PostedItem {
  post: Post
  /** The accounts it went out on; its counts are the first one's. */
  went: ChannelKey[]
  /** The day and the time it went out, in the brand's own zone. */
  day: string
  time: string
  caption: string
  collabs: string[]
}

/** A day and a time in the brand's zone: now, or when something went out. */
export interface Moment {
  day: string
  time: string
  /** Now as an instant, to read a story's end the core keeps against. */
  at?: Date
}

const minutesOf = (m: Moment) => Date.parse(`${m.day}T${m.time}:00Z`) / 60_000

/**
 * Now in the brand's own zone, the day and the time read from one instant. The static demo keeps
 * its fixed today (`demoDay`) with the clock's time, as its calendar does.
 */
export function nowIn(at: Date, zone: string, demoDay?: string): Moment {
  return { day: demoDay ?? clockToday(at, zone), time: clockTime(zone, at), at }
}

/**
 * What went out from the core's posts, on the accounts it went out on. A post with jobs went out
 * on the accounts whose job is live, in its own order: a planned-only account (TikTok beside
 * Instagram) stays on `channels` but never went. A post with no job that reads posted (imported,
 * or marked posted by hand) went out on all its accounts. The rest never went out.
 */
export function fromServer(posts: ServerPost[]): PostedItem[] {
  return posts.flatMap((p) => {
    const live = new Set(p.jobs.filter((j) => j.status === 'live').map((j) => j.channel))
    const went =
      p.jobs.length > 0
        ? p.channels.filter((c) => live.has(c))
        : p.stage === 'posted'
          ? p.channels
          : []
    if (went.length === 0 || !p.day) return []
    const details = (p.draft as { details?: { collab?: string[] } }).details
    return [
      {
        post: postOf(p),
        went,
        day: p.day,
        time: p.time ?? '12:00',
        caption: p.caption,
        collabs: details?.collab ?? [],
      },
    ]
  })
}

/**
 * What went out on one platform, newest first. Stories are Instagram's only: TikTok has none, and
 * nothing reads Facebook's yet.
 */
export function ledgerOf(items: PostedItem[], platform: Platform): PostedItem[] {
  return items
    .filter((i) => i.went.includes(platform) && (i.post.format !== 'story' || platform === 'ig'))
    .sort((a, b) => minutesOf(b) - minutesOf(a))
}

/**
 * The rail: each platform with something on it or an account linked. With neither anywhere,
 * every platform shows, each with its way to connect.
 */
export function railOf(items: PostedItem[], linked: (p: Platform) => boolean): Platform[] {
  const found = PLATFORMS.filter((p) => linked(p) || ledgerOf(items, p).length > 0)
  return found.length > 0 ? found : PLATFORMS
}

/**
 * The platform on show: the one picked (or named in the address) while it is in the rail, else
 * the first with something on it, else the rail's first.
 */
export function platformOf(rail: Platform[], items: PostedItem[], picked?: Platform): Platform {
  if (picked && rail.includes(picked)) return picked
  return rail.find((p) => ledgerOf(items, p).length > 0) ?? rail[0]!
}

// ── Counts ───────────────────────────────────────────────────────────────────────────────────

export type CountKey = keyof NonNullable<Post['metrics']>
const COUNT_ORDER: Array<[CountKey, string]> = [
  ['views', 'Views'],
  ['reach', 'Reach'],
  ['likes', 'Likes'],
  ['comments', 'Comments'],
  ['shares', 'Shares'],
  ['saves', 'Saves'],
]

/** The real counts a post has, biggest story first: views, reach, then the reactions. */
export function countsOf(post: Post): Array<{ key: CountKey; label: string; value: number }> {
  const m = post.metrics ?? {}
  return COUNT_ORDER.flatMap(([key, label]) =>
    typeof m[key] === 'number' ? [{ key, label, value: m[key] }] : [],
  )
}

/**
 * The counts on one platform: a post's counts are its first account's, as the poster shows them,
 * so a post that also went to Facebook does not repeat Instagram's numbers there.
 */
export function countsOn(item: PostedItem, platform: Platform) {
  return item.went[0] === platform ? countsOf(item.post) : []
}

/** 18420 → 18.4k; 480 → 480. */
export function k(n: number): string {
  if (n >= 999_500) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}m`
  return n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k` : String(n)
}

/** When the counts were read, in Singapore: "22 Oct", with the year only when it is not this one. */
export function asOf(measuredAt: string): string {
  const day = clockToday(new Date(measuredAt))
  const [year, month, date] = day.split('-').map(Number)
  const words = `${date} ${MONTH_SHORT[month! - 1]}`
  return day.slice(0, 4) === todayDate().slice(0, 4) ? words : `${words} ${year}`
}

/** The days the summary covers, today included. */
export const WINDOW = 30

export interface Summary {
  posts: number
  stories: number
  /**
   * Reach (views where no post has reach: an import reads none) and likes, added up over the
   * posts that have them; none when no post in the window has numbers.
   */
  totals: Array<{ label: string; value: number }>
  /** How many in the window have numbers, of how many: the totals cover those only. */
  counted: number
  of: number
  /** The latest reading behind the totals. */
  measuredAt?: string
}

/** The platform's last 30 days: how much went out, and what the ones with numbers reached. */
export function summaryOf(ledger: PostedItem[], platform: Platform, today: string): Summary {
  const from = addDays(today, -(WINDOW - 1))
  const recent = ledger.filter((i) => i.day >= from && i.day <= today)
  const read = recent.map((i) => countsOn(i, platform))
  const total = (key: CountKey) => {
    const has = read.flatMap((cs) => cs.filter((c) => c.key === key))
    return has.length > 0 ? [{ label: key, value: has.reduce((n, c) => n + c.value, 0) }] : []
  }
  const reach = total('reach')
  const totals = [...(reach.length > 0 ? reach : total('views')), ...total('likes')]
  const measuredAt = recent
    .filter((_, i) => read[i]!.length > 0)
    .flatMap((i) => (i.post.measuredAt ? [i.post.measuredAt] : []))
    .sort()
    .at(-1)
  return {
    posts: recent.filter((i) => i.post.format !== 'story').length,
    stories: recent.filter((i) => i.post.format === 'story').length,
    totals,
    counted: read.filter((cs) => cs.length > 0).length,
    of: recent.length,
    ...(measuredAt && { measuredAt }),
  }
}

/**
 * The summary's figures: what went out (stories on Instagram only), then the totals. A figure that
 * is 0 says nothing ("0 stories") and is left out.
 */
export function figuresOf(
  sum: Summary,
  platform: Platform,
): Array<{ label: string; value: number }> {
  return [
    { label: sum.posts === 1 ? 'post' : 'posts', value: sum.posts },
    ...(platform === 'ig'
      ? [{ label: sum.stories === 1 ? 'story' : 'stories', value: sum.stories }]
      : []),
    ...sum.totals,
  ].filter((f) => f.value !== 0)
}

/**
 * The line after the figures: the window and, when only some have numbers, how many the totals
 * cover: "Last 30 days · 3 of 20 with numbers · as of 28 Oct".
 */
export function windowLine(sum: Summary): string {
  return [
    'Last 30 days',
    sum.counted > 0 && sum.counted < sum.of ? `${sum.counted} of ${sum.of} with numbers` : '',
    sum.measuredAt ? `as of ${asOf(sum.measuredAt)}` : '',
  ]
    .filter(Boolean)
    .join(' · ')
}

// ── Ranking ──────────────────────────────────────────────────────────────────────────────────

/** Likes, comments, shares and saves together, as the best time to post weighs a post. */
function engagement(item: PostedItem, platform: Platform): number | undefined {
  const cs = countsOn(item, platform).filter((c) =>
    ['likes', 'comments', 'shares', 'saves'].includes(c.key),
  )
  return cs.length > 0 ? cs.reduce((n, c) => n + c.value, 0) : undefined
}

/** Ranking says something only when two posts or more have counts to compare. */
export function canRank(ledger: PostedItem[], platform: Platform): boolean {
  return ledger.filter((i) => engagement(i, platform) !== undefined).length >= 2
}

/**
 * The ledger ranked, most engaging first; a tie goes to the bigger reach (or views). What has no
 * counts is its own group after, newest first, never ranked as if it had none.
 */
export function rankedOf(
  ledger: PostedItem[],
  platform: Platform,
): { ranked: PostedItem[]; unread: PostedItem[] } {
  const seen = (i: PostedItem) => i.post.metrics?.reach ?? i.post.metrics?.views ?? 0
  return {
    ranked: ledger
      .filter((i) => engagement(i, platform) !== undefined)
      .sort((a, b) => engagement(b, platform)! - engagement(a, platform)! || seen(b) - seen(a)),
    unread: ledger.filter((i) => engagement(i, platform) === undefined),
  }
}

// ── Words ────────────────────────────────────────────────────────────────────────────────────

/** What the platform calls it: "Reel", "Carousel", "Photos"; one photo is a "Post" ("Photo" on Facebook). */
export function kindOf(post: Post, platform: Platform): string {
  if (post.format === 'carousel' && post.images.length < 2)
    return platform === 'fb' ? 'Photo' : 'Post'
  return kindOn(post.format, platform) ?? FORMAT_LABEL[post.format]
}

/** "Story", or "Story · 3 frames". */
export function storyKind(post: Post): string {
  return post.images.length > 1 ? `Story · ${post.images.length} frames` : 'Story'
}

/** "Today, 11:40", "Sun 26 Oct, 12:40", with the year only when it is not this one. */
export function whenOf(item: PostedItem, today: string): string {
  const day =
    item.day === today
      ? 'Today'
      : `${dayLabel(item.day)}${item.day.slice(0, 4) !== today.slice(0, 4) ? ` ${item.day.slice(0, 4)}` : ''}`
  return `${day}, ${item.time}`
}

/** The caption's first line under the hook; nothing when it only says the hook again. */
export function firstLine(item: PostedItem): string {
  const line =
    item.caption
      .split('\n')
      .find((l) => l.trim() !== '')
      ?.trim() ?? ''
  return line === item.post.hook.trim() ? '' : line
}

/** How long a story stays up. */
export const STORY_HOURS = 24

/**
 * The hours a story has left while it is up, rounded up; null once it has gone. A story the core
 * read back ends when the platform said (`expiresAt`); any other, 24 hours after it went out.
 */
export function hoursLeft(item: PostedItem, now: Moment): number | null {
  const ends = item.post.expiresAt ? Date.parse(item.post.expiresAt) : NaN
  const left =
    now.at && !Number.isNaN(ends)
      ? (ends - now.at.getTime()) / 60_000
      : STORY_HOURS * 60 - (minutesOf(now) - minutesOf(item))
  return left > 0 ? Math.min(STORY_HOURS, Math.ceil(left / 60)) : null
}

/** The ledger in months, newest first: "October", with the year when it is not this one. */
export function monthsOf(
  ledger: PostedItem[],
  today: string,
): Array<{ key: string; title: string; items: PostedItem[] }> {
  const out: Array<{ key: string; title: string; items: PostedItem[] }> = []
  for (const item of ledger) {
    const key = item.day.slice(0, 7)
    const last = out.at(-1)
    if (last?.key === key) {
      last.items.push(item)
      continue
    }
    const name = new Date(`${key}-01T00:00:00Z`).toLocaleString('en-GB', {
      month: 'long',
      timeZone: 'UTC',
    })
    out.push({
      key,
      title: key.slice(0, 4) === today.slice(0, 4) ? name : `${name} ${key.slice(0, 4)}`,
      items: [item],
    })
  }
  return out
}
