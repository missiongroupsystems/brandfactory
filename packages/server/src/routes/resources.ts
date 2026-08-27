import {
  BrandIdSchema,
  BrandResourceIdSchema,
  CreateBrandResourceInputSchema,
  UpdateBrandResourceInputSchema,
} from '@brandfactory/shared'
import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'
import { requireBrandAccess } from '../authz'
import type { AppEnv } from '../context'
import type { Db } from '../db'
import { NotFoundError, UnauthorizedError } from '../errors'

export interface ResourcesDeps {
  db: Db
}

/**
 * Brand resources — a named external link a team member has to find fast (a
 * font shop, a stock library, an icon set). Mounted at `/brands` alongside
 * `createBrandAssetsRouter`.
 *
 * **Four handlers, not six.** `routes/assets.ts`' reorder and restore routes
 * both exist for columns `brand_resources` deliberately does not have: no
 * `position` (grouping by type is the ask, ordering inside a group is not —
 * title order does that), and no `deleted_at` (a link to a font shop is not a
 * discarded idea, per `brand_resources.ts`). `deleteResource` is a hard
 * delete, so there is nothing here to restore.
 */
export function createBrandResourcesRouter(deps: ResourcesDeps) {
  const BrandParam = z.object({ id: BrandIdSchema })
  const ResourceParam = z.object({ id: BrandIdSchema, resourceId: BrandResourceIdSchema })

  return new Hono<AppEnv>()
    .get('/:id/resources', zValidator('param', BrandParam), async (c) => {
      const userId = c.var.userId
      if (!userId) throw new UnauthorizedError()
      const { id } = c.req.valid('param')
      await requireBrandAccess(userId, id, deps.db)
      const rows = await deps.db.listResourcesByBrand(id)
      return c.json(rows)
    })
    .post(
      '/:id/resources',
      zValidator('param', BrandParam),
      zValidator('json', CreateBrandResourceInputSchema),
      async (c) => {
        const userId = c.var.userId
        if (!userId) throw new UnauthorizedError()
        const { id } = c.req.valid('param')
        await requireBrandAccess(userId, id, deps.db)
        const body = c.req.valid('json')
        const row = await deps.db.createResource(id, body)
        return c.json(row, 201)
      },
    )
    .patch(
      '/:id/resources/:resourceId',
      zValidator('param', ResourceParam),
      zValidator('json', UpdateBrandResourceInputSchema),
      async (c) => {
        const userId = c.var.userId
        if (!userId) throw new UnauthorizedError()
        const { id, resourceId } = c.req.valid('param')
        await requireBrandAccess(userId, id, deps.db)
        const body = c.req.valid('json')
        // Scoped by brand as well as id, like `updateAsset` — a resource id
        // from another brand misses rather than being patched across the
        // boundary `requireBrandAccess` just checked.
        const row = await deps.db.updateResource(id, resourceId, body)
        if (!row) throw new NotFoundError('resource not found', 'RESOURCE_NOT_FOUND')
        return c.json(row)
      },
    )
    .delete('/:id/resources/:resourceId', zValidator('param', ResourceParam), async (c) => {
      const userId = c.var.userId
      if (!userId) throw new UnauthorizedError()
      const { id, resourceId } = c.req.valid('param')
      await requireBrandAccess(userId, id, deps.db)
      // Hard delete — no `deleted_at` to set, and nothing to sweep: a
      // resource holds a URL on somebody else's host, never a blob key.
      const row = await deps.db.deleteResource(id, resourceId)
      if (!row) throw new NotFoundError('resource not found', 'RESOURCE_NOT_FOUND')
      return c.json(row)
    })
}
