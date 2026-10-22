/**
 * A brand's own posts from Apify's scrapers, as `post.import` takes them. One item of
 * `apify/instagram-post-scraper` (detailed data) or `clockworks/tiktok-scraper` (a profile's
 * videos) becomes one post: its id there, its format, its first line as the hook, the time it went
 * out, its address, its counts and the address of its cover image. Pure: nothing here reaches the
 * network.
 */

export interface Imported {
  channel: 'ig' | 'tt'
  externalId: string
  format: 'reel' | 'carousel'
  hook: string
  caption: string
  at: string
  permalink: string
  metrics: { likes?: number; comments?: number; views?: number; shares?: number; saves?: number }
  /** The image the calendar shows: a photo, a carousel's first image, a video's cover. */
  cover: string
  /** A video's length as the calendar prints it, `0:24`. */
  duration?: string
}

/** An item the scraper could not read (a private account, a missing post) carries `error`. */
type Item = Record<string, unknown>

// `post.import` takes a post id (`<brand>-ig-<id>`) of at most 71 characters, so its cover's id
// fits in 80 beside it. Real ids are 11 (Instagram) to 19 (TikTok) characters.
const ID = /^[A-Za-z0-9_-]{1,71}$/

const text = (v: unknown) => (typeof v === 'string' ? v : '')
/** A count the platform shows; Instagram answers -1 for likes a post hides. */
const count = (v: unknown) =>
  typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : undefined

/** The caption's first line, cut at a word to 120 characters. */
export function hookOf(caption: string, fallback: string): string {
  const line =
    caption
      .split('\n')
      .map((l) => l.trim())
      .find((l) => l !== '') ?? ''
  if (line === '') return fallback
  // By code points, so an emoji is never cut in half.
  const points = Array.from(line)
  if (points.length <= 120) return line
  const cut = points.slice(0, 120).join('')
  const space = cut.lastIndexOf(' ')
  return `${(space > 60 ? cut.slice(0, space) : cut).trimEnd()}…`
}

export function durationOf(seconds: unknown): string | undefined {
  if (typeof seconds !== 'number' || !(seconds > 0)) return undefined
  const s = Math.round(seconds)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

const metricsOf = (m: Imported['metrics']) =>
  Object.fromEntries(Object.entries(m).filter(([, v]) => v !== undefined)) as Imported['metrics']

/** One Instagram post, or null for an item that is no post of this account. */
export function fromInstagram(item: Item, handle: string): Imported | null {
  const shortCode = text(item.shortCode)
  if (item.error || !ID.test(shortCode) || !text(item.timestamp) || !text(item.displayUrl))
    return null
  if (text(item.ownerUsername).toLowerCase() !== handle.toLowerCase()) return null
  const video = item.type === 'Video'
  const caption = text(item.caption)
  return {
    channel: 'ig',
    externalId: shortCode,
    format: video ? 'reel' : 'carousel',
    hook: hookOf(caption, video ? 'Instagram reel' : 'Instagram post'),
    caption,
    at: text(item.timestamp),
    permalink: text(item.url) || `https://www.instagram.com/p/${shortCode}/`,
    metrics: metricsOf({
      likes: count(item.likesCount),
      comments: count(item.commentsCount),
      views: video ? (count(item.videoPlayCount) ?? count(item.videoViewCount)) : undefined,
    }),
    cover: text(item.displayUrl),
    duration: video ? durationOf(item.videoDuration) : undefined,
  }
}

/** One TikTok video or slideshow, or null for an item that is no video of this account. */
export function fromTikTok(item: Item, handle: string): Imported | null {
  const id = text(item.id)
  const author = (item.authorMeta ?? {}) as Item
  const meta = (item.videoMeta ?? {}) as Item
  const cover = text(meta.coverUrl) || text(meta.originalCoverUrl)
  if (item.error || !/^[0-9]{1,71}$/.test(id) || !text(item.createTimeISO) || !cover) return null
  if (text(author.name).toLowerCase() !== handle.toLowerCase()) return null
  const slideshow = item.isSlideshow === true
  const caption = text(item.text)
  return {
    channel: 'tt',
    externalId: id,
    format: slideshow ? 'carousel' : 'reel',
    hook: hookOf(caption, 'TikTok video'),
    caption,
    at: text(item.createTimeISO),
    permalink: text(item.webVideoUrl) || `https://www.tiktok.com/@${handle}/video/${id}`,
    metrics: metricsOf({
      likes: count(item.diggCount),
      comments: count(item.commentCount),
      views: count(item.playCount),
      shares: count(item.shareCount),
      saves: count(item.collectCount),
    }),
    cover,
    duration: slideshow ? undefined : durationOf(meta.duration),
  }
}

/** Every post of a scrape, newest first, each once. */
export function postsOf(items: Item[], channel: 'ig' | 'tt', handle: string): Imported[] {
  const read = channel === 'ig' ? fromInstagram : fromTikTok
  const seen = new Set<string>()
  return items
    .map((i) => read(i, handle))
    .filter((p): p is Imported => p !== null && !seen.has(p.externalId) && !!seen.add(p.externalId))
    .sort((a, b) => b.at.localeCompare(a.at))
}
