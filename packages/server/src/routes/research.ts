import { BrandIdSchema, ResearchJobIdSchema, type UserId } from '@brandfactory/shared'
import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'
import { requireBrandAccess } from '../authz'
import type { AppEnv } from '../context'
import type { Db } from '../db'
import { NotFoundError, UnauthorizedError } from '../errors'
import {
  readLatestResearchJob,
  readResearchJob,
  startResearch,
  toResearchJobSummary,
  type ResearchServiceDeps,
} from '../research/service'

export interface ResearchRoutesDeps extends ResearchServiceDeps {
  db: ResearchServiceDeps['db'] & Pick<Db, 'getBrandById' | 'getWorkspaceById'>
}

/**
 * Brand research. Mounted at `/brands`, beside the other brand routers.
 *
 * **Three routes for two entry points.** `POST` serves both halves of decision
 * 1 — the create dialog's "research this brand" and the rail's re-run — from one
 * handler, which is why re-run costs nothing extra to build. The two `GET`s are
 * the same job read two ways: by id (what a client that started a run holds) and
 * latest (what the hub asks about a brand it just opened).
 *
 * **No `DELETE`, and no cancel.** `CANCELLED` exists in the status enum because
 * the locked document names it, but nothing here produces it: the vendor bills
 * for work already done, so "cancel" would stop us *reading* a report we have
 * already paid for. That is worse than letting it land.
 */
export function createResearchRouter(deps: ResearchRoutesDeps) {
  const BrandParam = z.object({ id: BrandIdSchema })
  const JobParam = z.object({ id: BrandIdSchema, jobId: ResearchJobIdSchema })

  return new Hono<AppEnv>()
    .post('/:id/research', zValidator('param', BrandParam), async (c) => {
      const userId = c.var.userId
      if (!userId) throw new UnauthorizedError()
      const { id } = c.req.valid('param')
      const { brand, workspace } = await requireBrandAccess(userId, id, deps.db)

      // No body. Everything the run needs is on the brand — which is decision
      // 3's point: one new column, and everything else is job input derived
      // from the row, so there is nothing for a client to get wrong or to
      // tamper with.
      const job = await startResearch(deps, {
        brandId: brand.id,
        workspaceId: workspace.id,
        brandName: brand.name,
        websiteUrl: brand.websiteUrl,
        // `c.var.userId` is the auth middleware's string; every other route
        // takes it the same way.
        userId: userId as UserId,
      })
      return c.json(toResearchJobSummary(job), 201)
    })

    .get('/:id/research', zValidator('param', BrandParam), async (c) => {
      const userId = c.var.userId
      if (!userId) throw new UnauthorizedError()
      const { id } = c.req.valid('param')
      await requireBrandAccess(userId, id, deps.db)

      // An envelope, because two facts are read together and by the same
      // component: *can this deployment research at all*, and *where did this
      // brand's last run get to*. `enabled` is what the hub turns into the
      // presence of a callback — which is what makes the rail's research row
      // not exist on a deployment with no key, rather than exist and fail.
      //
      // `job: null` is the ordinary state of almost every brand, and it renders
      // as silence rather than as an empty state.
      const job = await readLatestResearchJob(deps, id)
      return c.json({
        enabled: deps.env.RESEARCH_PROVIDER !== 'none',
        job: job ? toResearchJobSummary(job) : null,
      })
    })

    .get('/:id/research/:jobId', zValidator('param', JobParam), async (c) => {
      const userId = c.var.userId
      if (!userId) throw new UnauthorizedError()
      const { id, jobId } = c.req.valid('param')
      await requireBrandAccess(userId, id, deps.db)

      const job = await readResearchJob(deps, id, jobId)
      if (!job) throw new NotFoundError('research job not found', 'RESEARCH_JOB_NOT_FOUND')
      return c.json(toResearchJobSummary(job))
    })
}
