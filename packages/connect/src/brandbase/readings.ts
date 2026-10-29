import { createHash, randomUUID, timingSafeEqual } from 'node:crypto'
import { Refused } from '@brandfactory/core/src/errors'
import { call, type CoreDeps } from '@brandfactory/core/src/run'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { PACK } from './accounts'

/**
 * Make's read-back (docs/executing/posted-page-plan.md, phase 3): every hour a Make scenario reads
 * each linked brand's Instagram and Facebook posts and stories with their counts, and posts them
 * here, one brand and one account per request. Make has no person's session, so the request
 * carries a key of its own, and the moves run as the one principal the server's settings name:
 * an agent of an owner of the company (`<owner>/make`). The pack's walls still apply to it, and
 * `post.sync` takes readings only for the account the brand linked through Make.
 */
export interface MakeReadings {
  /** The key Make sends in `x-make-apikey`; only this route takes it. */
  secret: string
  /** The principal the moves run as. */
  as: string
  /** For tests: how covers are read and stored. */
  fetch?: typeof fetch
}

/** What `post.sync` answers. */
interface Synced {
  made: number
  updated: number
  readings: number
  covers: { externalId: string; post: string }[]
}

interface Item {
  externalId: string
  kind: string
  postedAt: string
  expiresAt?: string | null
  mediaUrl?: string | null
  thumbnailUrl?: string | null
}

/** Meta's image hosts: a cover is read from nowhere else. */
const META_CDN = /(^|\.)(fbcdn\.net|cdninstagram\.com)$/
const IMAGES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}
const MAX_COVER_BYTES = 8 * 1024 * 1024
const COVER_WAIT_MS = 15_000
/** Covers copied at once. */
const AT_ONCE = 4
/**
 * Covers copied per request: two rounds of four, well inside Make's 300 s wait even when each
 * takes its full 15 s twice (read and upload). The rest wait for the next run.
 */
export const MAX_COVERS = 8
/** The pattern of a post's and a file record's id in the pack's moves. */
const ID = /^[A-Za-z0-9_-]{1,80}$/
const STORY_MS = 24 * 60 * 60 * 1000
/** 50 readings with long captions fit. */
const MAX_BODY_BYTES = 2 * 1024 * 1024

/** The image type the bytes themselves say: JPEG, PNG or WebP, else null. */
function typeOfBytes(b: Uint8Array): string | null {
  const at = (i: number, ...bytes: number[]) => bytes.every((x, j) => b[i + j] === x)
  if (at(0, 0xff, 0xd8, 0xff)) return 'image/jpeg'
  if (at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'image/png'
  if (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return 'image/webp'
  return null
}

/** The body, read as it streams, refused once it passes `max` bytes. */
async function readAtMost(res: Response, max: number): Promise<Uint8Array> {
  const reader = res.body?.getReader()
  if (!reader) return new Uint8Array()
  const parts: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.length
    if (size > max) {
      await reader.cancel()
      throw new Error('cover too large')
    }
    parts.push(value)
  }
  return Buffer.concat(parts)
}

/** The keys compared in constant time, whatever their lengths. */
function sameKey(given: string | undefined, want: string): boolean {
  const digest = (s: string) => createHash('sha256').update(s).digest()
  return given !== undefined && timingSafeEqual(digest(given), digest(want))
}

export function readingsRoutes(core: CoreDeps, readings: MakeReadings | undefined) {
  const move = (as: string, op: string, input: Record<string, unknown>) =>
    call(core, { authorization: undefined, as, internal: true, pack: PACK, op, input })

  /** The image to copy for an item, or null: none given, or a story Meta has taken down. */
  function imageOf(item: Item): string | null {
    if (item.kind === 'story') {
      const ends = item.expiresAt
        ? Date.parse(item.expiresAt)
        : Date.parse(item.postedAt) + STORY_MS
      if (ends <= core.now().getTime()) return null
    }
    return item.thumbnailUrl || item.mediaUrl || null
  }

  /**
   * Copies one cover into the brand's files and gives it to the post. Meta's image addresses
   * expire within days; the copy does not.
   */
  async function copyCover(r: MakeReadings, brand: string, post: string, address: string) {
    // The file record's id is the post's and 9 characters: it must fit the moves' pattern.
    const mediaId = `${post}-${randomUUID().slice(0, 8)}`
    if (!ID.test(post) || !ID.test(mediaId)) throw new Error('the post id is too long for a cover')
    const url = new URL(address)
    if (url.protocol !== 'https:' || url.port !== '' || !META_CDN.test(url.hostname)) {
      throw new Error(`not a Meta image host: ${url.host}`)
    }
    const get = r.fetch ?? fetch
    const got = await get(address, {
      redirect: 'error',
      signal: AbortSignal.timeout(COVER_WAIT_MS),
    })
    // A body left unread holds its connection: let it go before giving up.
    const drop = (why: string) => {
      void got.body?.cancel().catch(() => undefined)
      return new Error(why)
    }
    if (!got.ok) throw drop(`cover ${got.status}`)
    const mime = (got.headers.get('content-type') ?? '').split(';')[0]!.trim()
    const ext = IMAGES[mime]
    if (!ext) throw drop(`cover is ${mime || 'of no type'}`)
    if (Number(got.headers.get('content-length') ?? 0) > MAX_COVER_BYTES) {
      throw drop('cover too large')
    }
    const bytes = await readAtMost(got, MAX_COVER_BYTES)
    if (typeOfBytes(bytes) !== mime) throw new Error(`cover is not the ${mime} it says`)
    // Only now, with the image in hand, is its record made. A new id each try: storage never
    // overwrites a key, so an upload or a give that fails after this leaves an unused record.
    const made = (await move(r.as, 'media.create', {
      brand,
      id: mediaId,
      mime,
      name: `${post}.${ext}`,
      bytes: bytes.length,
    })) as { src: string; upload: { url: string; headers: Record<string, string> } }
    const put = await get(made.upload.url, {
      method: 'PUT',
      headers: made.upload.headers,
      body: bytes,
      signal: AbortSignal.timeout(COVER_WAIT_MS),
    })
    if (!put.ok) throw new Error(`upload ${put.status}`)
    await move(r.as, 'post.sync_cover', {
      brand,
      id: post,
      media: [{ src: `${made.src}#photo`, kind: 'photo', mediaId }],
    })
  }

  return new Hono().post(
    '/brands/:brand/make/readings',
    bodyLimit({
      maxSize: MAX_BODY_BYTES,
      onError: () => {
        throw new Refused(413, 'TOO_LARGE', 'send at most 2 MB')
      },
    }),
    async (c) => {
      if (!readings) throw new Refused(503, 'PLATFORM_OFF', 'readings from Make are not set up')
      if (!sameKey(c.req.header('x-make-apikey'), readings.secret)) {
        throw new Refused(401, 'UNAUTHORIZED', 'wrong or missing key')
      }
      // A body past the limit is refused while it is read; anything else that is not JSON is null.
      const body = (await c.req.json().catch((err: unknown) => {
        if ((err as Error).name === 'BodyLimitError') throw err
        return null
      })) as Record<string, unknown> | null
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        throw new Refused(400, 'VALIDATION', 'send a JSON object')
      }
      const brand = c.req.param('brand')
      // The move checks every field and the brand's linked account; the brand is the path's.
      const synced = (await move(readings.as, 'post.sync', { ...body, brand })) as Synced
      const items = body.items as Item[]
      // Only covers there is an image for take a place, newest first: a text post or a story
      // that has gone would otherwise hold one every run. A cover that does not copy leaves the
      // post as it was, and the next run tries again; so do the covers past this request's share.
      const wanted = synced.covers
        .flatMap((cover) => {
          const item = items.find((i) => i.externalId === cover.externalId)
          const address = item && imageOf(item)
          return address ? [{ ...cover, address, at: Date.parse(item.postedAt) }] : []
        })
        .sort((a, b) => b.at - a.at)
      const queue = wanted.slice(0, MAX_COVERS)
      const tally = { copied: 0, failed: 0, left: wanted.length - queue.length }
      const worker = async () => {
        for (let next = queue.shift(); next; next = queue.shift()) {
          try {
            await copyCover(readings, brand, next.post, next.address)
            tally.copied++
          } catch (err) {
            tally.failed++
            console.error(
              'make readings: cover not copied',
              brand,
              next.post,
              (err as Error).message,
            )
          }
        }
      }
      await Promise.all(Array.from({ length: AT_ONCE }, worker))
      return c.json({
        made: synced.made,
        updated: synced.updated,
        readings: synced.readings,
        covers: tally,
      })
    },
  )
}
