import {
  BrandAssetIdSchema,
  BrandIdSchema,
  CreateBrandAssetInputSchema,
  UpdateBrandAssetInputSchema,
} from '@brandfactory/shared'
import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'
import { requireBrandAccess } from '../authz'
import type { AppEnv } from '../context'
import type { Db } from '../db'
import { NotFoundError, UnauthorizedError } from '../errors'

export interface AssetsDeps {
  db: Db
}

// Sparse integer ordering, as `guideline_sections.priority` already is —
// leaving room to insert between two rows without renumbering the list.
const POSITION_STEP = 100

/**
 * Brand assets. Mounted at `/brands` alongside `createBrandsRouter`.
 *
 * **This module never sees a file.** Uploads reuse the transport that already
 * exists: the client mints a write URL from `POST /blob-urls/upload-url` (which
 * is where `ALLOWED_UPLOAD_MIMES` gates the type), PUTs the bytes straight to
 * storage, and then `POST`s a row here carrying the returned key. The server
 * stays out of the byte path, which is the property the signed-URL design was
 * built for.
 *
 * **Rows go out as stored; nothing is resolved here.** A signed read URL
 * expires in five minutes, so resolving `blob` sources server-side would mint
 * URLs that are stale before the page paints. `useSignedReadUrl` already owns
 * that refresh on a 4-minute interval, so resolution is the client's job (2C).
 * *`docs/plans/brand-assets.md` puts the resolver on the server; this is a
 * deliberate deviation and the refresh interval is the reason.*
 */
export function createBrandAssetsRouter(deps: AssetsDeps) {
  const BrandParam = z.object({ id: BrandIdSchema })
  const AssetParam = z.object({ id: BrandIdSchema, assetId: BrandAssetIdSchema })

  return new Hono<AppEnv>()
    .get('/:id/assets', zValidator('param', BrandParam), async (c) => {
      const userId = c.var.userId
      if (!userId) throw new UnauthorizedError()
      const { id } = c.req.valid('param')
      await requireBrandAccess(userId, id, deps.db)
      // `proposed` rows are included. Filtering by status is the reader's job
      // and the readers disagree — the hub rail exists to show a brand
      // mid-decision, while `logoAsset` applies the active filter itself.
      const rows = await deps.db.listAssetsByBrand(id)
      return c.json(rows)
    })
    .post(
      '/:id/assets',
      zValidator('param', BrandParam),
      zValidator('json', CreateBrandAssetInputSchema),
      async (c) => {
        const userId = c.var.userId
        if (!userId) throw new UnauthorizedError()
        const { id } = c.req.valid('param')
        await requireBrandAccess(userId, id, deps.db)
        const body = c.req.valid('json')

        // Append when the client did not choose a position. Scoped to the
        // asset's own `kind`, because the surfaces order within a kind — a
        // palette is a list of colours, a grid is a list of images — so a new
        // colour landing after the twelfth photo would sort to the front of a
        // list it was meant to join the end of.
        let position = body.position
        if (position === undefined) {
          const existing = await deps.db.listAssetsByBrand(id)
          const sameKind = existing.filter((a) => a.kind === body.kind)
          position =
            sameKind.length === 0
              ? POSITION_STEP
              : Math.max(...sameKind.map((a) => a.position)) + POSITION_STEP
        }

        const row = await deps.db.createAsset({
          ...body,
          brandId: id,
          position,
          role: body.role ?? null,
        })
        return c.json(row, 201)
      },
    )
    .patch(
      '/:id/assets/:assetId',
      zValidator('param', AssetParam),
      zValidator('json', UpdateBrandAssetInputSchema),
      async (c) => {
        const userId = c.var.userId
        if (!userId) throw new UnauthorizedError()
        const { id, assetId } = c.req.valid('param')
        await requireBrandAccess(userId, id, deps.db)
        const body = c.req.valid('json')
        // `updateAsset` is scoped by brand as well as id, so an asset id from
        // another brand misses here rather than being patched across the
        // boundary `requireBrandAccess` just checked.
        const row = await deps.db.updateAsset(id, assetId, body)
        if (!row) throw new NotFoundError('asset not found', 'ASSET_NOT_FOUND')
        return c.json(row)
      },
    )
    .delete('/:id/assets/:assetId', zValidator('param', AssetParam), async (c) => {
      const userId = c.var.userId
      if (!userId) throw new UnauthorizedError()
      const { id, assetId } = c.req.valid('param')
      await requireBrandAccess(userId, id, deps.db)
      // Soft delete. **The bytes are deliberately not swept**, which is the one
      // place this route diverges from `DELETE /brands/:id` and
      // `DELETE /projects/:id`: a soft-deleted asset can come back
      // (`docs/vision.md:51`), and sweeping here would make "hidden" mean
      // "destroyed". Blob cleanup happens on the brand cascade, via
      // `listBlobKeysByBrand`, and nowhere else — so `deps` takes no
      // `BlobStore` at all, which is what stops the next edit from adding one.
      const row = await deps.db.softDeleteAsset(id, assetId)
      if (!row) throw new NotFoundError('asset not found', 'ASSET_NOT_FOUND')
      return c.json(row)
    })
}
