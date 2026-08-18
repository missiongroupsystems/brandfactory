import {
  CreateInfluencerInputSchema,
  InfluencerIdSchema,
  UpdateInfluencerInputSchema,
  WorkspaceIdSchema,
} from '@brandfactory/shared'
import { BrandNotInWorkspaceError, InfluencerHandleTakenError } from '@brandfactory/db'
import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'
import { requireWorkspaceAccess } from '../authz'
import type { AppEnv } from '../context'
import type { Db } from '../db'
import { ConflictError, HttpError, NotFoundError, UnauthorizedError } from '../errors'

export interface InfluencersDeps {
  db: Db
}

/**
 * Influencers — the creators the brands engage.
 *
 * **One router under `/workspaces`**, on `routes/outlets.ts`' shape exactly, and
 * for its reason: a creator is reachable by **slug**, a slug is unique per
 * workspace only, so every handler needs the workspace anyway. Putting the
 * id-scoped half at `/influencers` would mean a second prefix in the auth gate for
 * no gain.
 *
 * That also removes the need for a `requireInfluencerAccess` in `authz.ts`. The
 * gate is `requireWorkspaceAccess` plus a query layer that is workspace-scoped
 * throughout: an influencer id from another workspace *misses* rather than being
 * read or written across the boundary.
 *
 * **Router-degradation check** (the trap `routes/assets.ts` documents at its
 * reorder handler): under `/workspaces` the siblings of `:workspaceId/influencers`
 * are `brands`, `projects`, `settings`, `research` and `outlets` — all literal
 * segments at the same position, none of them a param — and below it
 * `:influencerRef` is the only child. Nothing here puts a literal where a sibling
 * has a param, so `RegExpRouter` still compiles and `/blob-urls/:key{.+}/read-url`
 * stays alive. `app.test.ts` is what proves it rather than this comment.
 */
export function createWorkspaceInfluencersRouter(deps: InfluencersDeps) {
  const WorkspaceParam = z.object({ workspaceId: WorkspaceIdSchema })
  /**
   * A slug **or** an id — `/influencers/priyaskin` and `/influencers/<uuid>` are
   * the same record, which is what lets a link degrade: a row that fetched the
   * whole creator emits the readable form, and anything holding only an id still
   * resolves. `getInfluencerByRef` decides which by shape.
   */
  const RefParam = WorkspaceParam.extend({ influencerRef: z.string().min(1).max(200) })
  const IdParam = WorkspaceParam.extend({ influencerRef: InfluencerIdSchema })

  /**
   * The two refusals a write here can take that are about the *body* rather than
   * about the path. Both run on the create and on the patch, because both verbs
   * can produce both conditions.
   *
   * **The brand miss is a 400.** The gate cannot tell a brand in another
   * workspace from one that does not exist — both are ids the caller's brand list
   * never showed it — so one code covers both. 400 rather than 404: the
   * *influencer* route is fine; the body named a brand this workspace does not
   * have. Same mapping the outlets router makes, over the same error class.
   *
   * **The handle clash is a 409**, and it is a different kind of statement. The
   * body is well-formed and every id in it is real; the workspace simply already
   * holds that creator on that platform. That is a conflict with existing state
   * rather than a fault in the request, which is the distinction 409 exists for
   * and the one `RESEARCH_ALREADY_RUNNING` already uses.
   *
   * The message is the error's own and names the pair, because this is the one
   * refusal on this aggregate that a person reads while looking at the box they
   * just typed into — `useSubmit` puts an `AppError`'s message straight on the
   * form. Before this mapping existed the unique index answered `500 Internal
   * Server Error`, and that sentence was what the form showed.
   */
  function rethrowWriteConflict(err: unknown): never {
    if (err instanceof BrandNotInWorkspaceError) {
      throw new HttpError(400, 'BRAND_NOT_IN_WORKSPACE', err.message)
    }
    if (err instanceof InfluencerHandleTakenError) {
      throw new ConflictError(
        `@${err.handle} is already on the roster for ${err.platform}. One row per creator per platform — open that record instead, or add them under the platform they are not on yet.`,
        'INFLUENCER_HANDLE_TAKEN',
      )
    }
    throw err
  }

  return new Hono<AppEnv>()
    .get('/:workspaceId/influencers', zValidator('param', WorkspaceParam), async (c) => {
      const userId = c.var.userId
      if (!userId) throw new UnauthorizedError()
      const { workspaceId } = c.req.valid('param')
      await requireWorkspaceAccess(userId, workspaceId, deps.db)
      // Exhaustive and unfiltered, biggest reach first. The screen groups by
      // reach tier and **counts each band**, and a count over a page states
      // something untrue about the tier. See `listInfluencersByWorkspace` for
      // when that stops being the right trade.
      const rows = await deps.db.listInfluencersByWorkspace(workspaceId)
      return c.json(rows)
    })
    .post(
      '/:workspaceId/influencers',
      zValidator('param', WorkspaceParam),
      zValidator('json', CreateInfluencerInputSchema),
      async (c) => {
        const userId = c.var.userId
        if (!userId) throw new UnauthorizedError()
        const { workspaceId } = c.req.valid('param')
        await requireWorkspaceAccess(userId, workspaceId, deps.db)
        const body = c.req.valid('json')
        try {
          // The slug is chosen here, not sent — see `uniqueInfluencerSlug`.
          const row = await deps.db.createInfluencer(workspaceId, body)
          return c.json(row, 201)
        } catch (err) {
          rethrowWriteConflict(err)
        }
      },
    )
    .get('/:workspaceId/influencers/:influencerRef', zValidator('param', RefParam), async (c) => {
      const userId = c.var.userId
      if (!userId) throw new UnauthorizedError()
      const { workspaceId, influencerRef } = c.req.valid('param')
      await requireWorkspaceAccess(userId, workspaceId, deps.db)
      const row = await deps.db.getInfluencerByRef(workspaceId, influencerRef)
      if (!row) throw new NotFoundError('influencer not found', 'INFLUENCER_NOT_FOUND')
      return c.json(row)
    })
    .patch(
      '/:workspaceId/influencers/:influencerRef',
      // Strictly an id here, unlike the GET. A patch is aimed at one record and a
      // caller that holds a slug has already read the row it is patching, so
      // accepting both would only widen the surface.
      zValidator('param', IdParam),
      zValidator('json', UpdateInfluencerInputSchema),
      async (c) => {
        const userId = c.var.userId
        if (!userId) throw new UnauthorizedError()
        const { workspaceId, influencerRef } = c.req.valid('param')
        await requireWorkspaceAccess(userId, workspaceId, deps.db)
        const body = c.req.valid('json')
        try {
          const row = await deps.db.updateInfluencer(workspaceId, influencerRef, body)
          if (!row) throw new NotFoundError('influencer not found', 'INFLUENCER_NOT_FOUND')
          return c.json(row)
        } catch (err) {
          rethrowWriteConflict(err)
        }
      },
    )
    .delete('/:workspaceId/influencers/:influencerRef', zValidator('param', IdParam), async (c) => {
      const userId = c.var.userId
      if (!userId) throw new UnauthorizedError()
      const { workspaceId, influencerRef } = c.req.valid('param')
      await requireWorkspaceAccess(userId, workspaceId, deps.db)
      // A hard delete, and it holds no blob keys — nothing to sweep. A second
      // delete misses, so it 404s rather than reporting success twice. The row
      // comes back with 200, matching outlet, brand and workspace delete: it is
      // the last copy of the record anything will ever see, and it carries the
      // brand ids the cascade is about to remove.
      const row = await deps.db.deleteInfluencer(workspaceId, influencerRef)
      if (!row) throw new NotFoundError('influencer not found', 'INFLUENCER_NOT_FOUND')
      return c.json(row)
    })
}
