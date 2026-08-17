import {
  CreateOutletInputSchema,
  OutletIdSchema,
  UpdateOutletInputSchema,
  WorkspaceIdSchema,
} from '@brandfactory/shared'
import { BrandNotInWorkspaceError } from '@brandfactory/db'
import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'
import { requireWorkspaceAccess } from '../authz'
import type { AppEnv } from '../context'
import type { Db } from '../db'
import { HttpError, NotFoundError, UnauthorizedError } from '../errors'

export interface OutletsDeps {
  db: Db
}

/**
 * Outlets — the places the brand trades from.
 *
 * **One router under `/workspaces`, not two.** Every other aggregate here splits
 * into a workspace-scoped list/create and an id-scoped read/patch, because a
 * brand or a project id is globally unique and carries its own parent. An outlet
 * is reachable by **slug**, and a slug is unique per workspace only — so every
 * handler needs the workspace anyway, and putting the id-scoped half at `/outlets`
 * would mean a second prefix in the auth gate for no gain.
 *
 * That also removes the need for a `requireOutletAccess` in `authz.ts`. The gate
 * is `requireWorkspaceAccess` plus a query layer that is workspace-scoped
 * throughout: an outlet id from another workspace *misses* rather than being read
 * or written across the boundary. `updateSocialPost(brandId, id, …)` has the same
 * property one aggregate down.
 *
 * **Router-degradation check** (the trap `routes/assets.ts` documents at its
 * reorder handler): under `/workspaces` the siblings of `:workspaceId/outlets`
 * are `brands`, `projects`, `settings` and `research` — all literal segments at
 * the same position, none of them a param — and below it `:outletRef` is the only
 * child. Nothing here puts a literal where a sibling has a param, so
 * `RegExpRouter` still compiles and `/blob-urls/:key{.+}/read-url` stays alive.
 */
export function createWorkspaceOutletsRouter(deps: OutletsDeps) {
  const WorkspaceParam = z.object({ workspaceId: WorkspaceIdSchema })
  /**
   * A slug **or** an id — `/outlets/casa-vostra` and `/outlets/<uuid>` are the
   * same record, which is what lets a link degrade: a row that fetched the whole
   * outlet emits the readable form, and anything holding only an id still
   * resolves. `getOutletByRef` decides which by shape.
   */
  const RefParam = WorkspaceParam.extend({ outletRef: z.string().min(1).max(200) })
  const IdParam = WorkspaceParam.extend({ outletRef: OutletIdSchema })

  // The brand gate cannot tell a brand in another workspace from one that does
  // not exist — both are ids the caller's brand list never showed it — so one
  // code covers both. 400 rather than 404: the *outlet* route is fine; the body
  // named a brand this workspace does not have.
  function rethrowBrandMiss(err: unknown): never {
    if (err instanceof BrandNotInWorkspaceError) {
      throw new HttpError(400, 'BRAND_NOT_IN_WORKSPACE', err.message)
    }
    throw err
  }

  return new Hono<AppEnv>()
    .get('/:workspaceId/outlets', zValidator('param', WorkspaceParam), async (c) => {
      const userId = c.var.userId
      if (!userId) throw new UnauthorizedError()
      const { workspaceId } = c.req.valid('param')
      await requireWorkspaceAccess(userId, workspaceId, deps.db)
      // Exhaustive and unfiltered, in name order — the screen groups by brand
      // and counts each group, and neither is answerable from a page. See
      // `listOutletsByWorkspace` for when that stops being the right trade.
      const rows = await deps.db.listOutletsByWorkspace(workspaceId)
      return c.json(rows)
    })
    .post(
      '/:workspaceId/outlets',
      zValidator('param', WorkspaceParam),
      zValidator('json', CreateOutletInputSchema),
      async (c) => {
        const userId = c.var.userId
        if (!userId) throw new UnauthorizedError()
        const { workspaceId } = c.req.valid('param')
        await requireWorkspaceAccess(userId, workspaceId, deps.db)
        const body = c.req.valid('json')
        try {
          // The slug is chosen here, not sent — see `uniqueOutletSlug`.
          const row = await deps.db.createOutlet(workspaceId, body)
          return c.json(row, 201)
        } catch (err) {
          rethrowBrandMiss(err)
        }
      },
    )
    .get('/:workspaceId/outlets/:outletRef', zValidator('param', RefParam), async (c) => {
      const userId = c.var.userId
      if (!userId) throw new UnauthorizedError()
      const { workspaceId, outletRef } = c.req.valid('param')
      await requireWorkspaceAccess(userId, workspaceId, deps.db)
      const row = await deps.db.getOutletByRef(workspaceId, outletRef)
      if (!row) throw new NotFoundError('outlet not found', 'OUTLET_NOT_FOUND')
      return c.json(row)
    })
    .patch(
      '/:workspaceId/outlets/:outletRef',
      // Strictly an id here, unlike the GET. A patch is aimed at one record and
      // a caller that holds a slug has already read the row it is patching, so
      // accepting both would only widen the surface.
      zValidator('param', IdParam),
      zValidator('json', UpdateOutletInputSchema),
      async (c) => {
        const userId = c.var.userId
        if (!userId) throw new UnauthorizedError()
        const { workspaceId, outletRef } = c.req.valid('param')
        await requireWorkspaceAccess(userId, workspaceId, deps.db)
        const body = c.req.valid('json')
        try {
          const row = await deps.db.updateOutlet(workspaceId, outletRef, body)
          if (!row) throw new NotFoundError('outlet not found', 'OUTLET_NOT_FOUND')
          return c.json(row)
        } catch (err) {
          rethrowBrandMiss(err)
        }
      },
    )
    .delete('/:workspaceId/outlets/:outletRef', zValidator('param', IdParam), async (c) => {
      const userId = c.var.userId
      if (!userId) throw new UnauthorizedError()
      const { workspaceId, outletRef } = c.req.valid('param')
      await requireWorkspaceAccess(userId, workspaceId, deps.db)
      // A hard delete, and it holds no blob keys — nothing to sweep. A second
      // delete misses, so it 404s rather than reporting success twice. The row
      // comes back with 200, matching brand and workspace delete: it is the last
      // copy of the record anything will ever see.
      const row = await deps.db.deleteOutlet(workspaceId, outletRef)
      if (!row) throw new NotFoundError('outlet not found', 'OUTLET_NOT_FOUND')
      return c.json(row)
    })
}
