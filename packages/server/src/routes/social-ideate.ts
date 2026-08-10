import { BrandIdSchema, IdeateCopyInputSchema, IdeateThemesInputSchema } from '@brandfactory/shared'
import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'
import { requireBrandAccess } from '../authz'
import type { AppEnv } from '../context'
import type { Db } from '../db'
import { UnauthorizedError } from '../errors'
import type { IdeateCopyFn, IdeateThemesFn } from '../social/ideate'

export interface SocialIdeateDeps {
  db: Db
  ideateThemes: IdeateThemesFn
  ideateCopy: IdeateCopyFn
}

/**
 * The Post Planner's two calls. Mounted at `/brands` beside
 * `createSocialPostsRouter`, and shaped like every handler in this repo:
 * `c.var.userId` guard → `requireBrandAccess` → validated params and body →
 * the injected function.
 *
 * **It writes nothing and persists nothing.** No row, no job, no draft. The
 * ideas go back to the client, whose accept-and-commit is the write — through
 * `POST /brands/:id/social-posts`, which is the only writer this table has.
 * That is what makes both handlers safe to retry and what makes the whole
 * feature testable: a run that changed the database would need a lifecycle, and
 * this has none.
 *
 * **No spend cap, deliberately.** This runs on the workspace's own configured
 * LLM tokens, which `env.ts` already records as ungated for chat and for
 * guideline shaping. `RESEARCH_*`'s caps exist because deep research is metered
 * per click against a vendor bill at roughly $0.38 a run; this is not that, and
 * a cap invented here would be a second policy answering one question.
 *
 * **Router-degradation check** (the trap `routes/social-posts.ts` documents):
 * under `/brands` the literal `ideate` sits at the same position as
 * `social-posts`, `assets`, `guidelines` and `research`, and no sibling
 * parameterises that slot. `RegExpRouter` compiles, so `/blob-urls/:key{.+}`
 * keeps matching — `app.test.ts` states the property.
 */
export function createSocialIdeateRouter(deps: SocialIdeateDeps) {
  const BrandParam = z.object({ id: BrandIdSchema })

  return new Hono<AppEnv>()
    .post(
      '/:id/ideate/themes',
      zValidator('param', BrandParam),
      zValidator('json', IdeateThemesInputSchema),
      async (c) => {
        const userId = c.var.userId
        if (!userId) throw new UnauthorizedError()
        const { id } = c.req.valid('param')
        await requireBrandAccess(userId, id, deps.db)
        const result = await deps.ideateThemes({ ...c.req.valid('json'), brandId: id })
        // 200, not 201: nothing was created. The honest outcomes — a fully
        // booked window, a model that answered off-schema — ride in the body as
        // `outcome` rather than as a status code, because neither is a fault
        // the client can act on by retrying.
        return c.json(result)
      },
    )
    .post(
      '/:id/ideate/copy',
      zValidator('param', BrandParam),
      zValidator('json', IdeateCopyInputSchema),
      async (c) => {
        const userId = c.var.userId
        if (!userId) throw new UnauthorizedError()
        const { id } = c.req.valid('param')
        await requireBrandAccess(userId, id, deps.db)
        const result = await deps.ideateCopy({ ...c.req.valid('json'), brandId: id })
        return c.json(result)
      },
    )
}
