import { BlobNotFoundError, verifySignature, type BlobStore } from '@brandfactory/adapter-storage'
import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'
import type { AppEnv } from '../context'
import { contentTypeForKey } from '../content-type'
import { ForbiddenError, HttpError } from '../errors'

export interface BlobsDeps {
  storage: BlobStore
  signingSecret: string
  maxBytes: number
}

const KeyParam = z.object({ key: z.string().min(1) })

// `contentTypeForKey` moved to `../content-type` in the Stage 1–2 review, so
// the mint path can use it too — the key's extension and the type this server
// authorises now have to agree, or the two storage providers answer the same
// question differently. Re-exported because this module was its home and the
// tests that pin it live next door.
export { contentTypeForKey } from '../content-type'

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
