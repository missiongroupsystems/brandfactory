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
  toResearchReport,
  type ResearchServiceDeps,
} from '../research/service'

export interface ResearchRoutesDeps extends ResearchServiceDeps {
  db: ResearchServiceDeps['db'] &
    Pick<Db, 'getBrandById' | 'getWorkspaceById' | 'clearResearchJobDrafts'>
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

  return (
    new Hono<AppEnv>()
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
          // The third fact the same component reads in the same breath: *when
          // does a run that never finishes get closed*. `abandonIfStale` has
          // enforced this since 1.11.2 and nothing ever told the user it
          // existed, which is what made a stuck run indistinguishable from a
          // slow one all the way to the ceiling.
          maxMinutes: deps.env.RESEARCH_JOB_MAX_MINUTES,
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

      /**
       * The report itself — **the read the wire has refused since 3C.**
       *
       * `toResearchJobSummary` leaves the report off because the hub polls that
       * shape every 5 seconds and 3A's came back at 67,780 characters. The
       * consequence, unintended and shipped for three releases: the *only* way to
       * read a $0.40 artefact was to leave the hub for the list of every
       * conversation the brand has, recognise which card was the research by its
       * date, open it, and scroll one enormous assistant bubble. Nothing was
       * broken, and nobody could find it.
       *
       * A separate route rather than a field, because the two reads have opposite
       * shapes: the summary is small and asked for constantly, this is large and
       * asked for once. **A terminal job's report never changes**, so the client
       * caches it indefinitely and the size stops mattering.
       *
       * **Any state, not just `COMPLETED`.** The route reports what is on the row;
       * deciding that an empty report is not worth showing is the client's call,
       * and 1.13.1 is a whole release about a state the UI had no drawing for.
       * `NO_FINDINGS` in particular has a real report — the finder saying plainly
       * that the site gave it too little — and a 404 there would be this repo
       * withholding an answer it has.
       *
       * `report` is the literal at a position no sibling route parameterises, the
       * same 1.11.1 check `drafts` below passes: `RegExpRouter` still compiles, and
       * `app.test.ts` asserts that directly.
       */
      .get('/:id/research/:jobId/report', zValidator('param', JobParam), async (c) => {
        const userId = c.var.userId
        if (!userId) throw new UnauthorizedError()
        const { id, jobId } = c.req.valid('param')
        await requireBrandAccess(userId, id, deps.db)

        // `readResearchJob` rather than a bare read, for consistency with the
        // sibling above — reconciling is a no-op on every job this route is
        // usefully called for, since `reconcileResearchJob` returns immediately
        // for anything that is not `IN_PROGRESS`.
        const job = await readResearchJob(deps, id, jobId)
        if (!job) throw new NotFoundError('research job not found', 'RESEARCH_JOB_NOT_FOUND')
        return c.json(toResearchReport(job))
      })

      /**
       * The drafts have landed — stop offering them.
       *
       * **The route the rail's `N drafts ready — Review` row was always missing.**
       * That row reads `status === 'COMPLETED' && drafts.length > 0`, nothing ever
       * emptied `drafts`, and so a brand that had already taken its drafts went on
       * advertising them forever; accepting a second time wrote a second copy of
       * every section. `clearResearchJobDrafts` existed from 3E under another name
       * with no caller at all.
       *
       * `DELETE` on the sub-collection rather than a status field, because that is
       * what it is — and it takes **no body**, which is the point of a narrow verb
       * here: a `PATCH … { drafts }` would hand a client the ability to write
       * section bodies attributed to `createdBy: 'agent'` that no shaping pass ever
       * produced.
       *
       * **Idempotent, and a second call is a success rather than a 404.** The
       * client calls this after a save it has already been told succeeded, so the
       * ordinary way to arrive twice is a retry — and failing that would put an
       * error toast on a screen where everything worked. A job that is not this
       * brand's, or not finished, still 404s: those are wrong, not repeated.
       *
       * Spelling checked against 1.11.1's lesson: the literal `drafts` sits at a
       * position no sibling route parameterises, so `RegExpRouter` still compiles
       * and the app is not silently downgraded to `TrieRouter`. `app.test.ts`
       * asserts the router choice directly, and the blob read-url test remains the
       * canary that caught it last time.
       */
      .delete('/:id/research/:jobId/drafts', zValidator('param', JobParam), async (c) => {
        const userId = c.var.userId
        if (!userId) throw new UnauthorizedError()
        const { id, jobId } = c.req.valid('param')
        await requireBrandAccess(userId, id, deps.db)

        const cleared = await deps.db.clearResearchJobDrafts(id, jobId)
        if (cleared) return c.json(toResearchJobSummary(cleared))

        // Tell "already cleared" apart from "never existed here". Only the first
        // is allowed to look like success.
        const job = await deps.db.getResearchJob(id, jobId)
        if (!job || job.status !== 'COMPLETED') {
          throw new NotFoundError('research job not found', 'RESEARCH_JOB_NOT_FOUND')
        }
        return c.json(toResearchJobSummary(job))
      })
  )
}
