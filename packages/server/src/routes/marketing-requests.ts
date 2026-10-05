import {
  CreateMarketingRequestInputSchema,
  MarketingRequestIdSchema,
  UpdateMarketingRequestInputSchema,
  WorkspaceIdSchema,
  type UserId,
} from '@brandfactory/shared'
import {
  AssigneeNotFoundError,
  BrandNotInWorkspaceError,
  OutletNotInBrandError,
} from '@brandfactory/db'
import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'
import { requireWorkspaceAccess } from '../authz'
import type { AppEnv } from '../context'
import type { Db } from '../db'
import { HttpError, NotFoundError, UnauthorizedError } from '../errors'

export interface MarketingRequestsDeps {
  db: Db
}

/**
 * Marketing requests — what the business asks marketing for (MKT-5, Phase 1).
 * The plan is `docs/completions/marketing-request-form-plan.md`.
 *
 * **One router under `/workspaces`**, the outlets shape: every handler needs
 * the workspace, and the query layer is workspace-scoped throughout, so an id
 * from another workspace *misses* rather than being read or written across the
 * boundary. That is the whole access rule; there is no
 * `requireMarketingRequestAccess`.
 *
 * **Signed-in users only.** The requester is `c.var.userId`, never a body
 * field. A public form would be the first unauthenticated write on this server
 * and needs a rate limit it does not have; it is its own phase if it comes.
 *
 * **Router-degradation check** (`routes/assets.ts`): `:workspaceId/marketing-requests`
 * sits beside the other literal segments under `/workspaces`, and below it
 * `:requestId` is the only child. No literal sits where a sibling has a param.
 */
export function createWorkspaceMarketingRequestsRouter(deps: MarketingRequestsDeps) {
  const WorkspaceParam = z.object({ workspaceId: WorkspaceIdSchema })
  const IdParam = WorkspaceParam.extend({ requestId: MarketingRequestIdSchema })

  // Three typed misses from the query layer, each a 400: the request route is
  // fine; the body named something this workspace cannot accept.
  function rethrowMiss(err: unknown): never {
    if (err instanceof BrandNotInWorkspaceError) {
      throw new HttpError(400, 'BRAND_NOT_IN_WORKSPACE', err.message)
    }
    if (err instanceof OutletNotInBrandError) {
      throw new HttpError(400, 'OUTLET_NOT_IN_BRAND', err.message)
    }
    if (err instanceof AssigneeNotFoundError) {
      throw new HttpError(400, 'ASSIGNEE_NOT_FOUND', err.message)
    }
    throw err
  }

  return new Hono<AppEnv>()
    .get('/:workspaceId/marketing-requests', zValidator('param', WorkspaceParam), async (c) => {
      const userId = c.var.userId
      if (!userId) throw new UnauthorizedError()
      const { workspaceId } = c.req.valid('param')
      await requireWorkspaceAccess(userId, workspaceId, deps.db)
      // Exhaustive, newest first — the inbox counts each status rung.
      return c.json(await deps.db.listMarketingRequestsByWorkspace(workspaceId))
    })
    .post(
      '/:workspaceId/marketing-requests',
      zValidator('param', WorkspaceParam),
      zValidator('json', CreateMarketingRequestInputSchema),
      async (c) => {
        const userId = c.var.userId
        if (!userId) throw new UnauthorizedError()
        const { workspaceId } = c.req.valid('param')
        await requireWorkspaceAccess(userId, workspaceId, deps.db)
        try {
          const row = await deps.db.createMarketingRequest(
            workspaceId,
            userId as UserId,
            c.req.valid('json'),
          )
          return c.json(row, 201)
        } catch (err) {
          rethrowMiss(err)
        }
      },
    )
    .get('/:workspaceId/marketing-requests/:requestId', zValidator('param', IdParam), async (c) => {
      const userId = c.var.userId
      if (!userId) throw new UnauthorizedError()
      const { workspaceId, requestId } = c.req.valid('param')
      await requireWorkspaceAccess(userId, workspaceId, deps.db)
      const row = await deps.db.getMarketingRequest(workspaceId, requestId)
      if (!row) throw new NotFoundError('request not found', 'MARKETING_REQUEST_NOT_FOUND')
      return c.json(row)
    })
    .patch(
      '/:workspaceId/marketing-requests/:requestId',
      zValidator('param', IdParam),
      zValidator('json', UpdateMarketingRequestInputSchema),
      async (c) => {
        const userId = c.var.userId
        if (!userId) throw new UnauthorizedError()
        const { workspaceId, requestId } = c.req.valid('param')
        await requireWorkspaceAccess(userId, workspaceId, deps.db)
        try {
          const row = await deps.db.updateMarketingRequest(
            workspaceId,
            requestId,
            c.req.valid('json'),
          )
          if (!row) throw new NotFoundError('request not found', 'MARKETING_REQUEST_NOT_FOUND')
          return c.json(row)
        } catch (err) {
          rethrowMiss(err)
        }
      },
    )
    .delete(
      '/:workspaceId/marketing-requests/:requestId',
      zValidator('param', IdParam),
      async (c) => {
        const userId = c.var.userId
        if (!userId) throw new UnauthorizedError()
        const { workspaceId, requestId } = c.req.valid('param')
        await requireWorkspaceAccess(userId, workspaceId, deps.db)
        // Soft. A second delete misses and 404s rather than succeeding twice.
        const row = await deps.db.softDeleteMarketingRequest(workspaceId, requestId)
        if (!row) throw new NotFoundError('request not found', 'MARKETING_REQUEST_NOT_FOUND')
        return c.json(row)
      },
    )
}
