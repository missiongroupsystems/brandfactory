import { BlobNotFoundError, verifySignature, type BlobStore } from '@brandfactory/adapter-storage'
import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'
import type { AppEnv } from '../context'
import { ForbiddenError, HttpError } from '../errors'

export interface BlobsDeps {
  storage: BlobStore
  signingSecret: string
  maxBytes: number
}

const KeyParam = z.object({ key: z.string().min(1) })

/**
 * Content type for a stored blob, from its key's extension.
 *
 * Phase 4 hardcoded `application/octet-stream` here and deferred the real thing
 * to a "Phase 8 polish" that never landed. **Stage 2D is what made the gap
 * visible**, because it is the first feature to render a stored image: browsers
 * content-sniff PNG/JPEG/GIF/WebP for an `<img>` regardless of the declared
 * type, so canvas image blocks have always worked — but **SVG is never
 * sniffed**. An uploaded SVG logo fired `onError` and fell back to the
 * monogram, which is pixel-identical to a brand with no logo. The feature
 * failed silently for the single most likely logo format.
 *
 * From the extension rather than from a persisted value, because the value was
 * never persisted: `local-disk`'s `put` takes a `contentType` option and
 * discards it, so there is nothing to read for any blob written before today.
 * The upload path already appends the original filename to the key, so the
 * extension is present and server-minted.
 *
 * **An allowlist, not a lookup table.** Anything unrecognised stays
 * `application/octet-stream` — a default that cannot become a vector — and the
 * list is deliberately a subset of `ALLOWED_UPLOAD_MIMES` rather than derived
 * from it: `text/plain` and the Word types are downloads, not things a browser
 * should render inline from user bytes.
 */
const CONTENT_TYPE_BY_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  pdf: 'application/pdf',
}

export function contentTypeForKey(key: string): string {
  const ext = key.split('.').pop()?.toLowerCase() ?? ''
  return CONTENT_TYPE_BY_EXTENSION[ext] ?? 'application/octet-stream'
}
const SigQuery = z.object({
  exp: z.coerce.number().int().positive(),
  sig: z.string().min(1),
})

// Mounted only when `STORAGE_PROVIDER === 'local-disk'`. Supabase Storage
// serves signed URLs directly, so the server never sees those bytes.
export function createBlobsRouter(deps: BlobsDeps) {
  return new Hono<AppEnv>()
    .get('/:key{.+}', zValidator('param', KeyParam), zValidator('query', SigQuery), async (c) => {
      const { key } = c.req.valid('param')
      const { exp, sig } = c.req.valid('query')
      try {
        verifySignature({ method: 'GET', key, exp, sig, signingSecret: deps.signingSecret })
      } catch {
        throw new ForbiddenError('invalid signature')
      }
      let bytes: Uint8Array
      try {
        bytes = await deps.storage.get(key)
      } catch (err) {
        // Callers with a valid signature against a missing key get a 404;
        // any other error bubbles to onError's 500 branch.
        if (err instanceof BlobNotFoundError) {
          throw new HttpError(404, 'BLOB_NOT_FOUND', 'blob not found')
        }
        throw err
      }
      return new Response(bytes as Uint8Array<ArrayBuffer>, {
        headers: {
          'content-type': contentTypeForKey(key),
          // These two are what make declaring a real content type safe, and
          // they are the reason this is not simply "the Phase 8 polish, late".
          //
          // `/blobs` is same-origin with the app in the single-origin dev and
          // minimal-deploy setups, and **an SVG is a document**: served as
          // `image/svg+xml` and *navigated to directly*, a `<script>` inside
          // user-uploaded bytes would run in the app's origin. It cannot run
          // inside the `<img>` that BrandMark renders — but the URL is one
          // click away from being pasted into a tab.
          //
          //   sandbox + default-src 'none'  → no script, no fetch, no origin
          //   nosniff                       → and no type confusion the other way
          'content-security-policy': "default-src 'none'; sandbox",
          'x-content-type-options': 'nosniff',
        },
      })
    })
    .put('/:key{.+}', zValidator('param', KeyParam), zValidator('query', SigQuery), async (c) => {
      const { key } = c.req.valid('param')
      const { exp, sig } = c.req.valid('query')
      try {
        verifySignature({ method: 'PUT', key, exp, sig, signingSecret: deps.signingSecret })
      } catch {
        throw new ForbiddenError('invalid signature')
      }
      // Reject obviously oversized uploads before reading any bytes. A
      // signed-URL holder is authenticated, so the realistic risk is OOM
      // rather than abuse, but the check is one line.
      const declared = c.req.header('content-length')
      if (declared !== undefined) {
        const n = Number(declared)
        if (Number.isFinite(n) && n > deps.maxBytes) {
          throw new HttpError(413, 'BLOB_TOO_LARGE', `blob exceeds ${deps.maxBytes} bytes`)
        }
      }
      const buf = await c.req.arrayBuffer()
      // Belt + suspenders for clients that omit / lie about `content-length`.
      if (buf.byteLength > deps.maxBytes) {
        throw new HttpError(413, 'BLOB_TOO_LARGE', `blob exceeds ${deps.maxBytes} bytes`)
      }
      const bytes = new Uint8Array(buf)
      const contentType = c.req.header('content-type') ?? undefined
      await deps.storage.put(key, bytes, contentType ? { contentType } : undefined)
      return c.json({ key })
    })
}
