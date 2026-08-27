import {
  BrandIdSchema,
  CreatePhotoCategoryInputSchema,
  PhotoCategoryIdSchema,
  UpdatePhotoCategoryInputSchema,
} from '@brandfactory/shared'
import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'
import { requireBrandAccess } from '../authz'
import type { AppEnv } from '../context'
import type { Db } from '../db'
import { NotFoundError, UnauthorizedError } from '../errors'

export interface PhotoCategoriesDeps {
  db: Db
}

/**
 * A brand's photography subject buckets — interior, food, people, product.
 * Mounted at `/brands`.
 *
 * **The set is editable per brand**, which is why these are rows rather than a
 * pgEnum. `resources.ts` next door made the opposite call for its own type
 * field, and the request is what separates them: the shapes of link a brand
 * keeps are the same for every brand, and the subjects it photographs are not.
 *
 * Filing a photo *into* a category is not here — that is a `PATCH` on the asset
 * itself, since it is a field of the photo rather than of the category.
 */
export function createBrandPhotoCategoriesRouter(deps: PhotoCategoriesDeps) {
  const BrandParam = z.object({ id: BrandIdSchema })
  const CategoryParam = z.object({ id: BrandIdSchema, categoryId: PhotoCategoryIdSchema })

  return new Hono<AppEnv>()
    .get('/:id/photo-categories', zValidator('param', BrandParam), async (c) => {
      const userId = c.var.userId
      if (!userId) throw new UnauthorizedError()
      const { id } = c.req.valid('param')
      await requireBrandAccess(userId, id, deps.db)
      return c.json(await deps.db.listPhotoCategoriesByBrand(id))
    })
    .post(
      '/:id/photo-categories',
      zValidator('param', BrandParam),
      zValidator('json', CreatePhotoCategoryInputSchema),
      async (c) => {
        const userId = c.var.userId
        if (!userId) throw new UnauthorizedError()
        const { id } = c.req.valid('param')
        await requireBrandAccess(userId, id, deps.db)
        return c.json(await deps.db.createPhotoCategory(id, c.req.valid('json')), 201)
      },
    )
    .patch(
      '/:id/photo-categories/:categoryId',
      zValidator('param', CategoryParam),
      zValidator('json', UpdatePhotoCategoryInputSchema),
      async (c) => {
        const userId = c.var.userId
        if (!userId) throw new UnauthorizedError()
        const { id, categoryId } = c.req.valid('param')
        await requireBrandAccess(userId, id, deps.db)
        const row = await deps.db.updatePhotoCategory(id, categoryId, c.req.valid('json'))
        if (!row) throw new NotFoundError('category not found', 'PHOTO_CATEGORY_NOT_FOUND')
        return c.json(row)
      },
    )
    .delete('/:id/photo-categories/:categoryId', zValidator('param', CategoryParam), async (c) => {
      const userId = c.var.userId
      if (!userId) throw new UnauthorizedError()
      const { id, categoryId } = c.req.valid('param')
      await requireBrandAccess(userId, id, deps.db)
      // **The photos survive.** `ON DELETE SET NULL` uncategorises them rather
      // than deleting them — a subject bucket is a filing decision, and undoing
      // one must not destroy what was filed. The screen owes the reader a count
      // first, because the effect lands somewhere they are not looking.
      const row = await deps.db.deletePhotoCategory(id, categoryId)
      if (!row) throw new NotFoundError('category not found', 'PHOTO_CATEGORY_NOT_FOUND')
      return c.json(row)
    })
}
