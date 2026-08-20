import {
  CreateInfluencerInputSchema,
  InfluencerIdSchema,
  LookupInfluencerInputSchema,
  UpdateInfluencerInputSchema,
  WorkspaceIdSchema,
} from '@brandfactory/shared'
import { BrandNotInWorkspaceError, InfluencerHandleTakenError } from '@brandfactory/db'
import { GroundedNotSupportedError } from '@brandfactory/adapter-llm'
import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'
import { requireWorkspaceAccess } from '../authz'
import type { AppEnv } from '../context'
import type { Db } from '../db'
import { ConflictError, HttpError, NotFoundError, UnauthorizedError } from '../errors'
import type { LookupCreatorFn } from '../influencer/lookup'

export interface InfluencersDeps {
  db: Db
  /**
   * Quick add's lookup. **Optional**, and the route answers 503 without it.
   *
   * Absent rather than always-present because the feature genuinely is absent on
   * some deployments: only `LLM_PROVIDER=openrouter` has a grounded endpoint
   * behind this adapter. `RESEARCH_PROVIDER=none`'s precedent — a feature nobody
   * has configured should be *explained*, not broken — with the mount kept
   * unconditional so `AppType` stays honest about what the server can serve.
   */
  lookupCreator?: LookupCreatorFn
}

/**
 * The 503 the lookup answers when this deployment cannot ground a query.
 *
 * A function rather than a constant because `HttpError` carries state and one
 * shared instance would accumulate a stack trace from whichever request threw it
 * first.
 */
function lookupUnavailable(): HttpError {
  return new HttpError(
    503,
    'LOOKUP_NOT_AVAILABLE',
    'Creator lookup needs a search-grounded model. Set LLM_PROVIDER=openrouter and INFLUENCER_LOOKUP_MODEL, or add creators with the full form.',
  )
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
   * holds that account on somebody's record. That is a conflict with existing
   * state rather than a fault in the request, which is the distinction 409 exists
   * for and the one `RESEARCH_ALREADY_RUNNING` already uses.
   *
   * The message is built here rather than taken from the error, because it names
   * a **creator** now and the sentence changes with them. A person reads it while
   * looking at the box they just typed into — `useSubmit` puts an `AppError`'s
   * message straight on the form — and "already on Priya Raman's record" tells
   * them what to do next where "handle already used" leaves them guessing. Before
   * this mapping existed the unique index answered `500 Internal Server Error`,
   * and that sentence was what the form showed.
   *
   * **`holder` is optional and the second sentence is what an absent one gets.**
   * The name, the handle and the platform all come from one best-effort read
   * before the write, so they arrive together or not at all. A concurrent writer
   * can still take the violation with nothing read, and the fallback then names
   * **no pair at all** rather than the first account in the body — that guess was
   * right only for a creator with one account, and pointed a reader at a handle
   * that was never in conflict for anybody else.
   *
   * A repeated pair *inside one body* never reaches here — `InfluencerAccounts`
   * refuses it at the zod boundary with the row's own path, because a 409 about
   * another creator is the wrong sentence for a malformed body.
   */
  function rethrowWriteConflict(err: unknown): never {
    if (err instanceof BrandNotInWorkspaceError) {
      throw new HttpError(400, 'BRAND_NOT_IN_WORKSPACE', err.message)
    }
    if (err instanceof InfluencerHandleTakenError) {
      throw new ConflictError(
        err.holder
          ? `@${err.holder.handle} on ${err.holder.platform} is already on ${err.holder.name}'s record. Open that creator and add the account there, or use a different handle.`
          : 'One of these accounts is already on the roster in this workspace. Refresh the list and check which handle is taken.',
        'INFLUENCER_HANDLE_TAKEN',
      )
    }
    throw err
  }

  return (
    new Hono<AppEnv>()
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
      /**
       * Quick add's lookup — a platform and a handle in, a draft out.
       *
       * **It writes nothing**, which is `routes/social-ideate.ts`' property and the
       * reason both are safe to retry. The draft goes back to the client, whose
       * confirm-and-create is the write, through `POST /:workspaceId/influencers`
       * above — so every rule that route enforces still applies, unchanged.
       *
       * **200, not 201**: nothing was created. `not-found` and `invalid-shape` ride
       * in the body as `outcome` rather than as status codes, because neither is a
       * fault the client can act on by retrying — the first is an answer about a
       * creator, the second is an answer about the model.
       *
       * **Mounted here rather than at `/workspaces/:workspaceId/influencer-lookup`.**
       * The plan reserved that fallback because `lookup` is a literal sitting where
       * `:influencerRef` is a param, which is exactly the shape `routes/assets.ts`
       * documents as the trap that downgraded `RegExpRouter` to `TrieRouter` in
       * 1.11.1 and broke `/blob-urls/:key{.+}/read-url` in a module that change
       * never opened.
       *
       * **It does not degrade here, and the reason is the verb.** The assets case
       * put `POST .../assets/reorder` beside `GET .../assets/:assetId/restore` —
       * the same method tree holding a literal and a param at one position, with
       * the param branch continuing past it. There is no `POST` on
       * `:influencerRef`: the three handlers below it are `GET`, `PATCH` and
       * `DELETE`. Within the POST tree this literal has no parameterised sibling at
       * all, so the shape `RegExpRouter` refuses never forms. `app.test.ts` proves
       * that rather than this paragraph — and it is asserted there precisely
       * because "the verb saves it" is a claim about a router internal.
       *
       * One consequence worth stating: a creator whose slug really is `lookup` is
       * still reachable. `GET`, `PATCH` and `DELETE` on that path resolve to the
       * ref handlers as they always did; only `POST` means the lookup. The two do
       * not collide because they never share a method.
       */
      .post(
        '/:workspaceId/influencers/lookup',
        zValidator('param', WorkspaceParam),
        zValidator('json', LookupInfluencerInputSchema),
        async (c) => {
          const userId = c.var.userId
          if (!userId) throw new UnauthorizedError()
          const { workspaceId } = c.req.valid('param')
          await requireWorkspaceAccess(userId, workspaceId, deps.db)
          if (!deps.lookupCreator) throw lookupUnavailable()
          try {
            return c.json(await deps.lookupCreator(c.req.valid('json')))
          } catch (err) {
            // **A deployment whose LLM provider has no grounded endpoint is a
            // configuration state, not a server fault**, so it gets a 503 that
            // names the fix rather than a 500 that names nothing. Every other
            // provider failure — a refused key, a rate limit, a timeout — falls
            // through to the generic mapping, which is right: those are transient
            // and the client's answer to them is to try again.
            if (err instanceof GroundedNotSupportedError) throw lookupUnavailable()
            throw err
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
      .delete(
        '/:workspaceId/influencers/:influencerRef',
        zValidator('param', IdParam),
        async (c) => {
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
        },
      )
  )
}
