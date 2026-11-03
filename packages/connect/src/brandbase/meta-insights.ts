import { Refused } from '@brandfactory/core/src/errors'
import { type CoreDeps } from '@brandfactory/core/src/run'
import { type Context, Hono } from 'hono'
import { bound, readAccount, type Who } from './accounts'
import { type MetaApp, MetaError, MetaReconnect } from './meta'
import { viaMeta } from './meta-routes'

/** How many of the newest posts the Feed shows. */
const LIMIT = 20
/** Meta's rate-limit codes: app, user, Page, and business use case. */
const RATE_LIMITED = [4, 17, 32, 613, 80001, 80002]

/**
 * One of the account's posts as the Feed shows it: the same shape as a TikTok video
 * (`tiktok.ts`), so one grid shows both. A count Meta did not give is null.
 */
export interface MetaPost {
  id: string
  title: string
  /** https only, else null. Meta's image links expire after some days. */
  cover: string | null
  /** The post on Instagram or Facebook; https only, else null. */
  url: string | null
  createdAt: string | null
  /** Seconds; Meta gives none here. */
  duration: null
  views: number | null
  likes: number | null
  comments: number | null
  shares: number | null
}

/** A link we may put on the page: https only. */
function https(value: unknown): string | null {
  if (typeof value !== 'string') return null
  try {
    return new URL(value).protocol === 'https:' ? value : null
  } catch {
    return null
  }
}

const count = (value: unknown) => (typeof value === 'number' ? value : null)
const iso = (value: unknown) => {
  const t = typeof value === 'string' ? Date.parse(value) : NaN
  return Number.isNaN(t) ? null : new Date(t).toISOString()
}

type Json = Record<string, unknown>

/**
 * The newest posts of the brand's Instagram account or Facebook Page linked through our own Meta
 * app, with their counts, read from Meta each time the Feed asks and never stored. Instagram:
 * likes and comments from the media, and views from its insights (`views`, the metric that
 * replaced the deprecated `impressions` and `plays`; needs `instagram_manage_insights`). Facebook:
 * reactions, comments and shares from the post; Meta's post impressions are deprecated above
 * v25, so a Page post has no views here. Every read is run as the person, within the brand walls.
 */
export function metaInsightsRoutes(core: CoreDeps, meta: MetaApp | undefined) {
  const who = (c: Context): Who => ({ authorization: c.req.header('authorization') })

  return new Hono().get('/brands/:brand/meta/:platform/posts', async (c) => {
    if (!meta) throw new Refused(503, 'PLATFORM_OFF', 'Facebook and Instagram are not set up')
    const platform = c.req.param('platform')
    if (platform !== 'instagram' && platform !== 'facebook') {
      throw new Refused(404, 'NOT_FOUND', 'no such platform')
    }
    const brand = c.req.param('brand')
    const account = await readAccount(core, who(c), brand, platform)
    if (!viaMeta(account)) {
      throw new Refused(409, 'META_NOT_LINKED', 'connect the account on Connections first')
    }
    let token: string
    try {
      token = meta.openToken(account.tokens, bound(platform, brand, account.accountId))
    } catch {
      throw new Refused(409, 'META_RECONNECT', 'Facebook needs connecting again')
    }
    const get = <T>(path: string, params: Record<string, string>) =>
      meta.graph<T>(path, { ...params, access_token: token })
    let posts: MetaPost[]
    try {
      posts =
        platform === 'instagram'
          ? await instagramPosts(get, account.accountId)
          : await pagePosts(get, account.accountId)
    } catch (err) {
      if (err instanceof MetaReconnect) {
        throw new Refused(409, 'META_RECONNECT', 'Facebook needs connecting again')
      }
      if (err instanceof MetaError) throw new Refused(502, 'PLATFORM', err.message)
      console.error('meta posts', (err as Error).message)
      throw new Refused(502, 'PLATFORM', 'Meta did not answer')
    }
    // Read live, kept by no cache on the way: brand base stores none of it.
    c.header('cache-control', 'no-store')
    return c.json({ posts })
  })
}

type Get = <T>(path: string, params: Record<string, string>) => Promise<T>

async function instagramPosts(get: Get, ig: string): Promise<MetaPost[]> {
  const got = await get<{ data?: Json[] }>(`/${ig}/media`, {
    fields:
      'id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count',
    limit: String(LIMIT),
  })
  const media = (got.data ?? []).filter((m) => typeof m.id === 'string')
  // One read of insights per post, side by side; a post whose views do not load keeps its other
  // counts.
  const views = await Promise.all(
    media.map((m) =>
      get<{ data?: { name?: string; values?: { value?: unknown }[] }[] }>(`/${m.id}/insights`, {
        metric: 'views',
      }).then(
        (r) => count(r.data?.find((d) => d.name === 'views')?.values?.[0]?.value),
        (err: unknown) => {
          // A dead token or Meta's rate limits stop the read; any other refusal leaves the views
          // out of that post.
          if (err instanceof MetaReconnect) throw err
          if (err instanceof MetaError && RATE_LIMITED.includes(err.code ?? 0)) throw err
          return null
        },
      ),
    ),
  )
  return media.map((m, i) => ({
    id: String(m.id),
    title: String(m.caption ?? '').trim(),
    cover: https(m.media_type === 'VIDEO' ? m.thumbnail_url : m.media_url),
    url: https(m.permalink),
    createdAt: iso(m.timestamp),
    duration: null,
    views: views[i] ?? null,
    likes: count(m.like_count),
    comments: count(m.comments_count),
    shares: null,
  }))
}

async function pagePosts(get: Get, page: string): Promise<MetaPost[]> {
  const got = await get<{ data?: Json[] }>(`/${page}/posts`, {
    fields:
      'id,message,created_time,permalink_url,full_picture,reactions.summary(total_count).limit(0),comments.summary(total_count).limit(0),shares',
    limit: String(LIMIT),
  })
  const total = (v: unknown) =>
    count((v as { summary?: { total_count?: unknown } })?.summary?.total_count)
  return (got.data ?? [])
    .filter((p) => typeof p.id === 'string')
    .map((p) => ({
      id: String(p.id),
      title: String(p.message ?? '').trim(),
      cover: https(p.full_picture),
      url: https(p.permalink_url),
      createdAt: iso(p.created_time),
      duration: null,
      views: null,
      likes: total(p.reactions),
      comments: total(p.comments),
      shares: count((p.shares as { count?: unknown } | undefined)?.count),
    }))
}
