import { and, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import { type Deps } from '../app'
import { media } from '../db/schema'
import { notFound } from '../errors'
import { body, Id } from '../http'
import { sign, verify } from '../storage'
import { assertSameBrand, type BrandEnv } from './shared'

/** Kinds by type; anything else is a file (brand kit documents). */
function kindOf(mime: string): 'photo' | 'video' | 'file' {
  if (mime.startsWith('image/')) return 'photo'
  if (mime.startsWith('video/')) return 'video'
  return 'file'
}

const EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
  'application/pdf': 'pdf',
}

/** The most a single upload may be: a 90-second reel at a high bitrate fits. */
export const MAX_UPLOAD_BYTES = 500 * 1024 * 1024

/** The type a stored file is served as, from the extension its key was given. */
export function typeOfKey(key: string): string {
  const ext = key.split('.').pop() ?? ''
  const found = Object.entries(EXT).find(([, e]) => e === ext)
  // SVG can carry script; it is served as a download type, never as an image document.
  if (!found || found[0] === 'image/svg+xml') return 'application/octet-stream'
  return found[0]
}

const NewMedia = z.object({
  id: Id,
  mime: z.string().min(3).max(100),
  name: z.string().max(300).default(''),
  bytes: z.number().int().min(1).max(MAX_UPLOAD_BYTES),
  /** Read in the browser; the server makes no poster and reads no duration yet. */
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  durationS: z.number().int().min(0).optional(),
})

/**
 * The stable address of a file: the API checks the signature and sends the browser on to a
 * short-lived storage URL. It survives a reload, unlike a `blob:` URL, and cannot be guessed.
 */
export function mediaSrc(deps: Pick<Deps, 'publicUrl' | 'mediaSecret'>, id: string) {
  return `${deps.publicUrl}/media/${id}/${sign(deps.mediaSecret, `media:${id}`)}`
}

export function mediaRoutes(deps: Deps) {
  const { db } = deps
  return new Hono<BrandEnv>().post('/', async (c) => {
    const brand = c.var.brand
    const input = await body(c, NewMedia)
    const [existing] = await db.select().from(media).where(eq(media.id, input.id))
    if (existing) assertSameBrand(existing, brand.id)
    const row =
      existing ??
      (
        await db
          .insert(media)
          .values({
            ...input,
            brandId: brand.id,
            kind: kindOf(input.mime),
            storageKey: `${brand.id}/${input.id}.${EXT[input.mime] ?? 'bin'}`,
          })
          .returning()
      )[0]!
    const upload = await deps.storage.signedWriteUrl(row.storageKey, row.mime)
    return c.json({ media: row, src: mediaSrc(deps, row.id), upload }, existing ? 200 : 201)
  })
}

/** `GET /media/:id/:sig`: outside the sign-in, since an `<img>` sends no token. */
export function mediaReadRoute(deps: Deps) {
  return new Hono().get('/:id/:sig', async (c) => {
    const id = c.req.param('id')
    if (!verify(deps.mediaSecret, `media:${id}`, c.req.param('sig'))) throw notFound()
    const [row] = await deps.db
      .select()
      .from(media)
      .where(and(eq(media.id, id)))
    if (!row) throw notFound()
    c.header('cache-control', 'private, max-age=300')
    return c.redirect(await deps.storage.signedReadUrl(row.storageKey, 3600), 302)
  })
}
