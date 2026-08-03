import {
  BrandIdSchema,
  CreateSocialPostInputSchema,
  SocialPostIdSchema,
  UpdateSocialPostInputSchema,
} from '@brandfactory/shared'
import { AssetNotInBrandError } from '@brandfactory/db'
import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'
import { requireBrandAccess } from '../authz'
import type { AppEnv } from '../context'
import type { Db } from '../db'
import { HttpError, NotFoundError, UnauthorizedError } from '../errors'

export interface SocialPostsDeps {
  db: Db
}

/**
 * Social posts — the calendar's rows. Mounted at `/brands` alongside
 * `createBrandAssetsRouter`, and shaped like it: every handler is
 * `c.var.userId` guard → `requireBrandAccess` → validated params/body →
 * a brand-scoped query.
 *
 * **This module never sees a platform.** Nothing here publishes — the
 * calendar is a conceptual scheduling tool and `status` is set by a person
 * (`docs/executing/social-calendar.md`). It never sees a file either:
 * attachments are `assetIds` into the brand's own library, and the library's
 * routes own the byte path.
 *
 * **Router-degradation check** (the trap `routes/assets.ts` documents at its
 * reorder handler): under this prefix the only siblings are `:postId` and
 * `:postId/restore` — no literal segment ever sits where a sibling has a
 * param, so `RegExpRouter` compiles and `/blob-urls/:key{.+}/read-url` stays
 * alive. If a batch op is ever added, it is spelled `PATCH` on the
 * collection.
 */
export function createSocialPostsRouter(deps: SocialPostsDeps) {
  const BrandParam = z.object({ id: BrandIdSchema })
  const PostParam = z.object({ id: BrandIdSchema, postId: SocialPostIdSchema })

  // `assertAssetsInBrand` cannot tell a cross-brand id from a soft-deleted
  // one — both are ids the caller's asset list never showed it — so one code
  // covers both. 400 rather than 404: the *post* route is fine; the body
  // named an attachment this brand does not have.
  function rethrowAssetMiss(err: unknown): never {
    if (err instanceof AssetNotInBrandError) {
      throw new HttpError(400, 'ASSET_NOT_IN_BRAND', err.message)
    }
    throw err
  }

  return new Hono<AppEnv>()
    .get('/:id/social-posts', zValidator('param', BrandParam), async (c) => {
      const userId = c.var.userId
      if (!userId) throw new UnauthorizedError()
      const { id } = c.req.valid('param')
      await requireBrandAccess(userId, id, deps.db)
      // Calendar order — unscheduled tray first, then chronological — comes
      // from the query; the client's cache applier re-sorts with the shared
      // `bySchedule`, which mirrors the same SQL.
      const rows = await deps.db.listSocialPostsByBrand(id)
      return c.json(rows)
    })
    .post(
      '/:id/social-posts',
      zValidator('param', BrandParam),
      zValidator('json', CreateSocialPostInputSchema),
      async (c) => {
        const userId = c.var.userId
        if (!userId) throw new UnauthorizedError()
        const { id } = c.req.valid('param')
        await requireBrandAccess(userId, id, deps.db)
        const body = c.req.valid('json')
        // Server defaults live in the DB columns (`body: ''`,
        // `status: 'draft'`, `scheduledAt: null`) — the schema documents
        // them, the insert omits what the client omitted.
        try {
          const row = await deps.db.createSocialPost(id, body)
          return c.json(row, 201)
        } catch (err) {
          rethrowAssetMiss(err)
        }
      },
    )
    .post('/:id/social-posts/:postId/restore', zValidator('param', PostParam), async (c) => {
      const userId = c.var.userId
      if (!userId) throw new UnauthorizedError()
      const { id, postId } = c.req.valid('param')
      await requireBrandAccess(userId, id, deps.db)
      // The Undo behind the delete, the asset pair's exact shape: only
      // matches a row that is actually hidden, so a replayed Undo 404s
      // rather than silently touching a live post.
      const row = await deps.db.restoreSocialPost(id, postId)
      if (!row) throw new NotFoundError('social post not found', 'SOCIAL_POST_NOT_FOUND')
      return c.json(row)
    })
    .patch(
      '/:id/social-posts/:postId',
      zValidator('param', PostParam),
      zValidator('json', UpdateSocialPostInputSchema),
      async (c) => {
        const userId = c.var.userId
        if (!userId) throw new UnauthorizedError()
        const { id, postId } = c.req.valid('param')
        await requireBrandAccess(userId, id, deps.db)
        const body = c.req.valid('json')
        // `updateSocialPost` is scoped by brand as well as id, so a post id
        // from another brand misses here rather than being patched across
        // the boundary `requireBrandAccess` just checked. `deletedAt` is not
        // a patch key — the schema strips it, which empties such a patch and
        // fails its refine.
        try {
          const row = await deps.db.updateSocialPost(id, postId, body)
          if (!row) throw new NotFoundError('social post not found', 'SOCIAL_POST_NOT_FOUND')
          return c.json(row)
        } catch (err) {
          rethrowAssetMiss(err)
        }
      },
    )
    .delete('/:id/social-posts/:postId', zValidator('param', PostParam), async (c) => {
      const userId = c.var.userId
      if (!userId) throw new UnauthorizedError()
      const { id, postId } = c.req.valid('param')
      await requireBrandAccess(userId, id, deps.db)
      // Soft delete, returning the row with `deletedAt` set. Join rows are
      // untouched, so restore brings the attachments back intact; already-
      // hidden rows miss, so a double delete 404s instead of extending the
      // window an Undo is measured against.
      const row = await deps.db.softDeleteSocialPost(id, postId)
      if (!row) throw new NotFoundError('social post not found', 'SOCIAL_POST_NOT_FOUND')
      return c.json(row)
    })
}
