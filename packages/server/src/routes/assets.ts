import {
  BrandAssetIdSchema,
  BrandIdSchema,
  CreateBrandAssetInputSchema,
  ReorderBrandAssetsInputSchema,
  UpdateBrandAssetInputSchema,
  defaultLibraryFor,
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

  return (
    new Hono<AppEnv>()
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

          // **The second of `defaultLibraryFor`'s two callers**; the other is
          // migration 0010's backfill. `library` is optional at the wire and
          // required on the row, and this line is the whole of that asymmetry —
          // it is what lets every client written before the column keep posting
          // unchanged.
          const library =
            body.library ?? defaultLibraryFor({ kind: body.kind, role: body.role ?? null })

          // Append when the client did not choose a position. Scoped to the
          // asset's own `library` *and* `kind`, because the surfaces order
          // within a kind on one shelf — a palette is a list of colours, a grid
          // is a list of images — so a new colour landing after the twelfth
          // photo would sort to the front of a list it was meant to join the end
          // of. Adding `library` is cosmetic rather than a correctness fix
          // (positions are only ever compared within a rendered section), but
          // without it the first photograph filed on a brand takes its number
          // from the collateral shelf, which is an ordering nobody chose.
          let position = body.position
          if (position === undefined) {
            const existing = await deps.db.listAssetsByBrand(id)
            const sameShelf = existing.filter((a) => a.library === library && a.kind === body.kind)
            position =
              sameShelf.length === 0
                ? POSITION_STEP
                : Math.max(...sameShelf.map((a) => a.position)) + POSITION_STEP
          }

          const row = await deps.db.createAsset({
            ...body,
            brandId: id,
            position,
            library,
            role: body.role ?? null,
          })
          return c.json(row, 201)
        },
      )
      /**
       * Batch re-position — a `PATCH` on the **collection**, not a `/reorder`
       * verb under it.
       *
       * The obvious spelling was `POST /:id/assets/reorder`, and it cost an
       * afternoon: a literal segment sitting where a sibling route has a
       * parameter (`/:id/assets/:assetId/restore`) is a shape Hono's
       * `RegExpRouter` refuses to compile, so `SmartRouter` silently falls back to
       * `TrieRouter` **for the whole app** — and `TrieRouter` cannot match a
       * multi-segment `:key{.+}`. The visible symptom was
       * `GET /blob-urls/:key/read-url` returning 404, in a module this change
       * never touched. Its test caught it.
       *
       * Patching the collection has no literal-versus-parameter collision at any
       * position, and it is the more honest verb anyway: the body is a partial
       * update of many rows, which is what `PATCH` on a collection means.
       */
      .patch(
        '/:id/assets',
        zValidator('param', BrandParam),
        zValidator('json', ReorderBrandAssetsInputSchema),
        async (c) => {
          const userId = c.var.userId
          if (!userId) throw new UnauthorizedError()
          const { id } = c.req.valid('param')
          await requireBrandAccess(userId, id, deps.db)
          const { updates } = c.req.valid('json')
          // One transaction, and it either lands whole or not at all — the
          // property the N-patches client had no way to get. `reorderAssets`
          // throws on an id that is not this brand's (or is soft-deleted), which
          // rolls the whole batch back; that is a 404 rather than a 500 because
          // the only way to reach it is a stale client sending a row that has
          // since moved or gone.
          try {
            const rows = await deps.db.reorderAssets(id, updates)
            return c.json(rows)
          } catch {
            throw new NotFoundError('asset not found in this brand', 'ASSET_NOT_FOUND')
          }
        },
      )
      .post('/:id/assets/:assetId/restore', zValidator('param', AssetParam), async (c) => {
        const userId = c.var.userId
        if (!userId) throw new UnauthorizedError()
        const { id, assetId } = c.req.valid('param')
        await requireBrandAccess(userId, id, deps.db)
        // The other half of the soft delete, and what lets the library offer an
        // Undo instead of a confirmation dialog — 1.10.0 named that as the right
        // fix and shipped neither. Only matches a row that is actually hidden, so
        // a replayed Undo 404s rather than silently touching a live asset.
        const row = await deps.db.restoreAsset(id, assetId)
        if (!row) throw new NotFoundError('asset not found', 'ASSET_NOT_FOUND')
        return c.json(row)
      })
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
          // **`{ library }` alone is Move to…** — the whole feature, and the
          // reason `UpdateBrandAssetInputSchema` grew a sixth `.refine` clause
          // rather than just a sixth key. Nothing here branches on it; it is
          // named so the next reader knows the one-key patch is a product
          // feature and not a stray column that leaked into the wire.
          //
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
  )
}
