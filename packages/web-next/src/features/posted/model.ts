import type { Post } from '@/data/demo'
import { FORMAT_LABEL, kindOn, type ChannelKey } from '@/features/publish/model'
import { postOf, wentOf, type ServerPost } from '@/features/schedule/remote-calendar'
import { addDays, clockTime, clockToday, dayLabel, MONTH_SHORT, todayDate } from '@/lib/dates'

/**
 * The Posted page's model, as pure functions the page only reads: what went out on each platform,
 * newest first, with its counts as last read; the platform's last 30 days as the profile's totals;
 * its stories as rings and its posts as a grid of covers, each with one count. A count a post does
 * not have is left out, never shown as 0: until the core reads the platforms back, a post Brand
 * Base sent has no counts at all.
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
 * An import the core has not read back from the platform: no job, an address from the import,
 * and no sync. The feed shows only what the core can check, so it stays out until a reading
 * finds it. A post marked posted by hand has no address and stays.
 */
export function unverified(p: ServerPost): boolean {
  return p.jobs.length === 0 && !!p.permalink && !p.syncedAt
}

/**
 * What went out from the core's posts, on the accounts it went out on. A post with jobs went out
 * on the accounts whose job is live, in its own order: a planned-only account (TikTok beside
 * Instagram) stays on `channels` but never went. A post with no job that reads posted (synced,
 * or marked posted by hand) went out on all its accounts. The rest never went out, and an import
 * never read back is left out.
 */
export function fromServer(posts: ServerPost[]): PostedItem[] {
  return posts.flatMap((p) => {
    const went = wentOf(p)
    if (went.length === 0 || !p.day || unverified(p)) return []
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

/** "@casavostra", whether or not the name carries its "@". */
const at = (name: string) => `@${name.trim().replace(/^@+/, '')}`

/**
 * The name over the profile: the account linked on the platform. An Instagram account is a
 * handle; a Facebook Page has none, so its name shows as typed; TikTok shows its account's name,
 * else the brand's handle (its imports are the brand's own). Instagram or Facebook with nothing
 * linked shows the brand's name, never a handle it may not own there.
 */
export function profileName(
  platform: Platform,
  linked: { ig?: string; fb?: string; tt?: string },
  brand: { name: string; handle: string },
): string {
  const name = linked[platform]?.trim()
  if (platform === 'tt') return name || (brand.handle.trim() ? at(brand.handle) : brand.name)
  if (!name) return brand.name
  return platform === 'ig' ? at(name) : name
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

/** The real counts in a reading, biggest story first: views, reach, then the reactions. */
export function countsIn(
  metrics: Post['metrics'],
): Array<{ key: CountKey; label: string; value: number }> {
  const m = metrics ?? {}
  return COUNT_ORDER.flatMap(([key, label]) =>
    typeof m[key] === 'number' ? [{ key, label, value: m[key] }] : [],
  )
}

/** What one account read of a post: its counts, when they were read, and where the post is. */
export interface ReadingOn {
  counts: ReturnType<typeof countsIn>
  measuredAt?: string
  permalink?: string
}

/** Each account's site, by the end of a link's host. */
const SITE: Record<ChannelKey, RegExp> = {
  ig: /(^|\.)instagram\.com$/,
  fb: /(^|\.)(facebook\.com|fb\.com|fb\.watch)$/,
  tt: /(^|\.)tiktok\.com$/,
  yt: /(^|\.)(youtube\.com|youtu\.be)$/,
  li: /(^|\.)linkedin\.com$/,
}

function linksTo(link: string | undefined, channel: ChannelKey): boolean {
  if (!link) return false
  try {
    return SITE[channel].test(new URL(link).hostname)
  } catch {
    return false
  }
}

/**
 * A post on one of the accounts it went out on: that account's own latest reading and address.
 * A post the core read back before it kept each account's (and the demo's) carries only its first
 * account's, so that one stands in for the first account alone: Facebook never repeats
 * Instagram's numbers or link. An account with no reading has no counts; nothing is filled in.
 */
export function readingOn(post: Post, channel: ChannelKey, went: ChannelKey[]): ReadingOn {
  const own = channel === 'ig' || channel === 'fb' ? post.readings?.[channel] : undefined
  const first = went[0] === channel
  const metrics = own?.metrics ?? (first ? post.metrics : undefined)
  const measuredAt = own?.metrics ? own.readAt : first ? post.measuredAt : undefined
  // Before 1.13.1 a post's link came from whichever account answered first, so it stands in only
  // when it points at this account's site: "Open on Instagram" never opens Facebook.
  const permalink =
    own?.permalink ?? (first && linksTo(post.permalink, channel) ? post.permalink : undefined)
  return {
    counts: countsIn(metrics),
    ...(measuredAt && { measuredAt }),
    ...(permalink && { permalink }),
  }
}

/**
 * The account a post opens on: the one asked for (the Posted tab it came from) while the post went
 * there, else the first with counts, else its first.
 */
export function openOn(post: Post, went: ChannelKey[], asked?: ChannelKey): ChannelKey | undefined {
  if (asked && went.includes(asked)) return asked
  return went.find((c) => readingOn(post, c, went).counts.length > 0) ?? went[0]
}

/** The counts on one platform: its own reading, never another account's. */
export function countsOn(item: PostedItem, platform: Platform) {
  return readingOn(item.post, platform, item.went).counts
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
    .flatMap((i) => readingOn(i.post, platform, i.went).measuredAt ?? [])
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
 * is 0 says nothing ("0 stories") and is left out. `compact` (a phone) leaves the stories out,
 * since the rings under the header show them, so the line stays one line.
 */
export function figuresOf(
  sum: Summary,
  platform: Platform,
  compact = false,
): Array<{ label: string; value: number }> {
  return [
    { label: sum.posts === 1 ? 'post' : 'posts', value: sum.posts },
    ...(platform === 'ig' && !compact
      ? [{ label: sum.stories === 1 ? 'story' : 'stories', value: sum.stories }]
      : []),
    ...sum.totals,
  ].filter((f) => f.value !== 0)
}

/**
 * What the totals cover, for the hover on them: the window and, when only some have numbers, how
 * many: "Last 30 days · 3 of 20 with numbers · as of 28 Oct". The page shows only "as of".
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

/** The grid's order: newest first, or ranked. */
export type Order = 'newest' | 'top'

/**
 * The grid: the posts, stories left out (they are the rings). Newest first; ranked when asked and
 * ranking says something, with what has no counts after, newest first.
 */
export function gridOf(ledger: PostedItem[], platform: Platform, order: Order): PostedItem[] {
  const posts = ledger.filter((i) => i.post.format !== 'story')
  if (order === 'newest' || !canRank(posts, platform)) return posts
  const { ranked, unread } = rankedOf(posts, platform)
  return [...ranked, ...unread]
}

/**
 * The counts a tile shows on this platform, in the summary's spirit: a count of 0 says nothing and
 * is left out.
 */
export function tileCountsOf(item: PostedItem, platform: Platform) {
  return countsOn(item, platform).filter((c) => c.value !== 0)
}

/**
 * The one count a tile shows: views on a reel, likes on the rest; the first count it has when
 * that one is missing or 0 (an import with reach only). None when it has no counts on this
 * platform.
 */
export function headlineOf(item: PostedItem, platform: Platform) {
  const counts = tileCountsOf(item, platform)
  const want: CountKey = item.post.format === 'reel' ? 'views' : 'likes'
  return counts.find((c) => c.key === want) ?? counts[0]
}

/**
 * A tile in words, for a reader that cannot see the cover: "Reel · Sun 25 Oct, 12:40: Sunday
 * roast is back · 12.4k views". A collab names its creators; no count when it has none.
 */
export function tileLabel(item: PostedItem, platform: Platform, today: string): string {
  const head = headlineOf(item, platform)
  const collab = item.collabs.length > 0 ? ` · with ${item.collabs.join(', ')}` : ''
  const count = head ? ` · ${k(head.value)} ${head.label.toLowerCase()}` : ''
  return `${kindOf(item.post, platform)} · ${whenOf(item, today)}${collab}: ${item.post.hook}${count}`
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

/** "Today", or the weekday and the date: "Tue 28". */
export function shortDay(item: PostedItem, today: string): string {
  return item.day === today ? 'Today' : dayLabel(item.day).split(' ').slice(0, 2).join(' ')
}

/** The caption under its title: without a first line that only says the title again. */
export function bodyOf(caption: string, hook: string): string {
  const lines = caption.split('\n')
  const first = lines.findIndex((l) => l.trim() !== '')
  if (first < 0) return ''
  return lines[first]!.trim() === hook.trim()
    ? lines
        .slice(first + 1)
        .join('\n')
        .trim()
    : caption.trim()
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

/** How far back a story that has gone keeps its ring. */
export const RING_DAYS = 7

/**
 * The story rings, newest first: every story still up, with its hours left, and the ones gone in
 * the last week, with none.
 */
export function ringsOf(
  ledger: PostedItem[],
  now: Moment,
): Array<{ item: PostedItem; left: number | null }> {
  const from = addDays(now.day, -(RING_DAYS - 1))
  return ledger
    .filter((i) => i.post.format === 'story')
    .map((item) => ({ item, left: hoursLeft(item, now) }))
    .filter((r) => r.left !== null || r.item.day >= from)
}
