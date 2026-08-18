import {
  CreateVendorInputSchema,
  UpdateVendorInputSchema,
  VendorIdSchema,
  WorkspaceIdSchema,
} from '@brandfactory/shared'
import { BrandNotInWorkspaceError, VendorUenTakenError } from '@brandfactory/db'
import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'
import { requireWorkspaceAccess } from '../authz'
import type { AppEnv } from '../context'
import type { Db } from '../db'
import { ConflictError, HttpError, NotFoundError, UnauthorizedError } from '../errors'

export interface VendorsDeps {
  db: Db
}

/**
 * Vendors — the companies the workspace buys from.
 *
 * **One router under `/workspaces`**, on `routes/influencers.ts`' shape exactly,
 * and for its reason: a vendor is reachable by **slug**, a slug is unique per
 * workspace only, so every handler needs the workspace anyway. Putting the
 * id-scoped half at `/vendors` would mean a second prefix in the auth gate for no
 * gain.
 *
 * That also removes the need for a `requireVendorAccess` in `authz.ts`. The gate
 * is `requireWorkspaceAccess` plus a query layer that is workspace-scoped
 * throughout: a vendor id from another workspace *misses* rather than being read
 * or written across the boundary.
 *
 * **Router-degradation check** (the trap `routes/assets.ts` documents at its
 * reorder handler): under `/workspaces` the siblings of `:workspaceId/vendors`
 * are `brands`, `projects`, `settings`, `research`, `outlets` and `influencers` —
 * all literal segments at the same position, none of them a param — and below it
 * `:vendorRef` is the only child. Nothing here puts a literal where a sibling has
 * a param, so `RegExpRouter` still compiles and `/blob-urls/:key{.+}/read-url`
 * stays alive. `app.test.ts` is what proves it rather than this comment.
 */
export function createWorkspaceVendorsRouter(deps: VendorsDeps) {
  const WorkspaceParam = z.object({ workspaceId: WorkspaceIdSchema })
  /**
   * A slug **or** an id — `/vendors/northlight-talent` and `/vendors/<uuid>` are
   * the same record, which is what lets a link degrade: a row that fetched the
   * whole vendor emits the readable form, and anything holding only an id still
   * resolves. `getVendorByRef` decides which by shape.
   */
  const RefParam = WorkspaceParam.extend({ vendorRef: z.string().min(1).max(200) })
  const IdParam = WorkspaceParam.extend({ vendorRef: VendorIdSchema })

  /**
   * The two refusals a write here can take that are about the *body* rather than
   * about the path. Both run on the create and on the patch, because both verbs
   * can produce both conditions.
   *
   * **The brand miss is a 400.** The gate cannot tell a brand in another
   * workspace from one that does not exist — both are ids the caller's brand list
   * never showed it — so one code covers both. 400 rather than 404: the *vendor*
   * route is fine; the body named a brand this workspace does not have. Same
   * mapping the outlets and influencers routers make, over the same error class.
   *
   * **The UEN clash is a 409**, and it is a different kind of statement. The body
   * is well-formed and every id in it is real; the workspace simply already holds
   * that company. That is a conflict with existing state rather than a fault in
   * the request, which is the distinction 409 exists for and the one
   * `INFLUENCER_HANDLE_TAKEN` already uses.
   *
   * The message names the UEN, because this is the one refusal on this aggregate
   * that a person reads while looking at the box they just typed into —
   * `useSubmit` puts an `AppError`'s message straight on the form. It also gives a
   * way forward, since the useful action is almost always to open the row that
   * already holds the number rather than to invent a second one.
   *
   * **A duplicate *name* cannot reach here**, and that is a decision rather than a
   * gap: a company name is not an identifier, so the slug takes a `-2` and the row
   * lands. See `VendorNameSchema`.
   */
  function rethrowWriteConflict(err: unknown): never {
    if (err instanceof BrandNotInWorkspaceError) {
      throw new HttpError(400, 'BRAND_NOT_IN_WORKSPACE', err.message)
    }
    if (err instanceof VendorUenTakenError) {
      throw new ConflictError(
        `UEN ${err.uen} is already on a vendor in this workspace. One company, one registration number — open that record instead, or clear the UEN if this is a different company.`,
        'VENDOR_UEN_TAKEN',
      )
    }
    throw err
  }

  return new Hono<AppEnv>()
    .get('/:workspaceId/vendors', zValidator('param', WorkspaceParam), async (c) => {
      const userId = c.var.userId
      if (!userId) throw new UnauthorizedError()
      const { workspaceId } = c.req.valid('param')
      await requireWorkspaceAccess(userId, workspaceId, deps.db)
      // Exhaustive and unfiltered, in directory order. The screen's search box
      // and its two selects narrow an array the client holds completely — see
      // `listVendorsByWorkspace` for when that stops being the right trade.
      const rows = await deps.db.listVendorsByWorkspace(workspaceId)
      return c.json(rows)
    })
    .post(
      '/:workspaceId/vendors',
      zValidator('param', WorkspaceParam),
      zValidator('json', CreateVendorInputSchema),
      async (c) => {
        const userId = c.var.userId
        if (!userId) throw new UnauthorizedError()
        const { workspaceId } = c.req.valid('param')
        await requireWorkspaceAccess(userId, workspaceId, deps.db)
        const body = c.req.valid('json')
        try {
          // The slug is chosen here, not sent — see `uniqueVendorSlug`.
          const row = await deps.db.createVendor(workspaceId, body)
          return c.json(row, 201)
        } catch (err) {
          rethrowWriteConflict(err)
        }
      },
    )
    .get('/:workspaceId/vendors/:vendorRef', zValidator('param', RefParam), async (c) => {
      const userId = c.var.userId
      if (!userId) throw new UnauthorizedError()
      const { workspaceId, vendorRef } = c.req.valid('param')
      await requireWorkspaceAccess(userId, workspaceId, deps.db)
      const row = await deps.db.getVendorByRef(workspaceId, vendorRef)
      if (!row) throw new NotFoundError('vendor not found', 'VENDOR_NOT_FOUND')
      return c.json(row)
    })
    .patch(
      '/:workspaceId/vendors/:vendorRef',
      // Strictly an id here, unlike the GET. A patch is aimed at one record and a
      // caller that holds a slug has already read the row it is patching, so
      // accepting both would only widen the surface.
      zValidator('param', IdParam),
      zValidator('json', UpdateVendorInputSchema),
      async (c) => {
        const userId = c.var.userId
        if (!userId) throw new UnauthorizedError()
        const { workspaceId, vendorRef } = c.req.valid('param')
        await requireWorkspaceAccess(userId, workspaceId, deps.db)
        const body = c.req.valid('json')
        try {
          const row = await deps.db.updateVendor(workspaceId, vendorRef, body)
          if (!row) throw new NotFoundError('vendor not found', 'VENDOR_NOT_FOUND')
          return c.json(row)
        } catch (err) {
          rethrowWriteConflict(err)
        }
      },
    )
    .delete('/:workspaceId/vendors/:vendorRef', zValidator('param', IdParam), async (c) => {
      const userId = c.var.userId
      if (!userId) throw new UnauthorizedError()
      const { workspaceId, vendorRef } = c.req.valid('param')
      await requireWorkspaceAccess(userId, workspaceId, deps.db)
      // A hard delete, and it holds no blob keys — nothing to sweep. A second
      // delete misses, so it 404s rather than reporting success twice. The row
      // comes back with 200, matching outlet, influencer, brand and workspace
      // delete: it is the last copy of the record anything will ever see, and it
      // carries the brand ids and the contacts the cascade is about to remove.
      const row = await deps.db.deleteVendor(workspaceId, vendorRef)
      if (!row) throw new NotFoundError('vendor not found', 'VENDOR_NOT_FOUND')
      return c.json(row)
    })
}
