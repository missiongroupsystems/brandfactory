import {
  BrandIdSchema,
  CreateFunnelActivityInputSchema,
  CreateFunnelStageInputSchema,
  CreatePlatformInputSchema,
  FunnelActivityIdSchema,
  FunnelStageIdSchema,
  PlatformIdSchema,
  UpdateFunnelActivityInputSchema,
  UpdateFunnelStageInputSchema,
} from '@brandfactory/shared'
import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'
import { requireBrandAccess } from '../authz'
import type { AppEnv } from '../context'
import type { Db } from '../db'
import { NotFoundError, UnauthorizedError } from '../errors'

export interface FunnelDeps {
  db: Db
}

/**
 * A brand's marketing funnel — stages, the platforms serving each, and the
 * activities running there. Mounted at `/brands`.
 *
 * **One view of what a brand runs and where in the journey**, which is what the
 * request asks for: planning, alignment and simple tracking. Not measurement —
 * `status` is a lifecycle, and the deep platforms measure performance.
 *
 * **A stage's id is not a capability.** Activities and platform links are keyed
 * on `stageId` alone in the query layer, so every route below resolves the
 * brand's own stage list first. Without that, anyone holding a stage id could
 * write into another brand's funnel — the same gate `POST .../decks/:deckId/versions`
 * needs and for the same reason.
 */
export function createBrandFunnelRouter(deps: FunnelDeps) {
  const BrandParam = z.object({ id: BrandIdSchema })
  const StageParam = z.object({ id: BrandIdSchema, stageId: FunnelStageIdSchema })
  const ActivityParam = z.object({
    id: BrandIdSchema,
    stageId: FunnelStageIdSchema,
    activityId: FunnelActivityIdSchema,
  })
  const LinkParam = z.object({
    id: BrandIdSchema,
    stageId: FunnelStageIdSchema,
    platformId: PlatformIdSchema,
  })

  /** Throws unless the stage belongs to this brand. Every write below opens with it. */
  async function requireStage(brandId: z.infer<typeof BrandIdSchema>, stageId: string) {
    const stages = await deps.db.listFunnelByBrand(brandId)
    const stage = stages.find((s) => s.id === stageId)
    if (!stage) throw new NotFoundError('stage not found', 'FUNNEL_STAGE_NOT_FOUND')
    return stage
  }

  return new Hono<AppEnv>()
    .get('/:id/funnel', zValidator('param', BrandParam), async (c) => {
      const userId = c.var.userId
      if (!userId) throw new UnauthorizedError()
      const { id } = c.req.valid('param')
      await requireBrandAccess(userId, id, deps.db)
      return c.json(await deps.db.listFunnelByBrand(id))
    })
    .post(
      '/:id/funnel/stages',
      zValidator('param', BrandParam),
      zValidator('json', CreateFunnelStageInputSchema),
      async (c) => {
        const userId = c.var.userId
        if (!userId) throw new UnauthorizedError()
        const { id } = c.req.valid('param')
        await requireBrandAccess(userId, id, deps.db)
        return c.json(await deps.db.createFunnelStage(id, c.req.valid('json')), 201)
      },
    )
    .patch(
      '/:id/funnel/stages/:stageId',
      zValidator('param', StageParam),
      zValidator('json', UpdateFunnelStageInputSchema),
      async (c) => {
        const userId = c.var.userId
        if (!userId) throw new UnauthorizedError()
        const { id, stageId } = c.req.valid('param')
        await requireBrandAccess(userId, id, deps.db)
        const row = await deps.db.updateFunnelStage(id, stageId, c.req.valid('json'))
        if (!row) throw new NotFoundError('stage not found', 'FUNNEL_STAGE_NOT_FOUND')
        return c.json(row)
      },
    )
    .delete('/:id/funnel/stages/:stageId', zValidator('param', StageParam), async (c) => {
      const userId = c.var.userId
      if (!userId) throw new UnauthorizedError()
      const { id, stageId } = c.req.valid('param')
      await requireBrandAccess(userId, id, deps.db)
      const row = await deps.db.deleteFunnelStage(id, stageId)
      if (!row) throw new NotFoundError('stage not found', 'FUNNEL_STAGE_NOT_FOUND')
      return c.json(row)
    })
    .get('/:id/funnel/platforms', zValidator('param', BrandParam), async (c) => {
      const userId = c.var.userId
      if (!userId) throw new UnauthorizedError()
      const { id } = c.req.valid('param')
      await requireBrandAccess(userId, id, deps.db)
      return c.json(await deps.db.listPlatformsByBrand(id))
    })
    .post(
      '/:id/funnel/platforms',
      zValidator('param', BrandParam),
      zValidator('json', CreatePlatformInputSchema),
      async (c) => {
        const userId = c.var.userId
        if (!userId) throw new UnauthorizedError()
        const { id } = c.req.valid('param')
        await requireBrandAccess(userId, id, deps.db)
        return c.json(await deps.db.createPlatform(id, c.req.valid('json')), 201)
      },
    )
    .delete(
      '/:id/funnel/platforms/:platformId',
      zValidator('param', z.object({ id: BrandIdSchema, platformId: PlatformIdSchema })),
      async (c) => {
        const userId = c.var.userId
        if (!userId) throw new UnauthorizedError()
        const { id, platformId } = c.req.valid('param')
        await requireBrandAccess(userId, id, deps.db)
        // **`ON DELETE RESTRICT` on the activity FK will refuse this** if any
        // activity still names the platform. That is the point: an activity whose
        // platform vanished is an activity that ran nowhere, and platforms are
        // cheap to keep. The 409 tells the screen to ask rather than to guess.
        try {
          const row = await deps.db.deletePlatform(id, platformId)
          if (!row) throw new NotFoundError('platform not found', 'PLATFORM_NOT_FOUND')
          return c.json(row)
        } catch (err) {
          if (err instanceof NotFoundError) throw err
          return c.json(
            {
              code: 'PLATFORM_IN_USE',
              message: 'This platform is still named by an activity. Move or remove those first.',
            },
            409,
          )
        }
      },
    )
    .post(
      '/:id/funnel/stages/:stageId/platforms/:platformId',
      zValidator('param', LinkParam),
      async (c) => {
        const userId = c.var.userId
        if (!userId) throw new UnauthorizedError()
        const { id, stageId, platformId } = c.req.valid('param')
        await requireBrandAccess(userId, id, deps.db)
        await requireStage(id, stageId)
        // Idempotent: the pair is the primary key, so a second attach is a no-op
        // rather than a duplicate row or a 409.
        await deps.db.attachPlatformToStage(stageId, platformId)
        return c.json(await requireStage(id, stageId))
      },
    )
    .delete(
      '/:id/funnel/stages/:stageId/platforms/:platformId',
      zValidator('param', LinkParam),
      async (c) => {
        const userId = c.var.userId
        if (!userId) throw new UnauthorizedError()
        const { id, stageId, platformId } = c.req.valid('param')
        await requireBrandAccess(userId, id, deps.db)
        await requireStage(id, stageId)
        // Drops the *link*. The platform survives — it may serve other stages, and
        // that is the whole reason it is a row rather than a field on a stage.
        await deps.db.detachPlatformFromStage(stageId, platformId)
        return c.json(await requireStage(id, stageId))
      },
    )
    .post(
      '/:id/funnel/stages/:stageId/activities',
      zValidator('param', StageParam),
      zValidator('json', CreateFunnelActivityInputSchema),
      async (c) => {
        const userId = c.var.userId
        if (!userId) throw new UnauthorizedError()
        const { id, stageId } = c.req.valid('param')
        await requireBrandAccess(userId, id, deps.db)
        await requireStage(id, stageId)
        return c.json(await deps.db.createFunnelActivity(stageId, c.req.valid('json')), 201)
      },
    )
    .patch(
      '/:id/funnel/stages/:stageId/activities/:activityId',
      zValidator('param', ActivityParam),
      zValidator('json', UpdateFunnelActivityInputSchema),
      async (c) => {
        const userId = c.var.userId
        if (!userId) throw new UnauthorizedError()
        const { id, stageId, activityId } = c.req.valid('param')
        await requireBrandAccess(userId, id, deps.db)
        await requireStage(id, stageId)
        const row = await deps.db.updateFunnelActivity(stageId, activityId, c.req.valid('json'))
        if (!row) throw new NotFoundError('activity not found', 'FUNNEL_ACTIVITY_NOT_FOUND')
        return c.json(row)
      },
    )
    .delete(
      '/:id/funnel/stages/:stageId/activities/:activityId',
      zValidator('param', ActivityParam),
      async (c) => {
        const userId = c.var.userId
        if (!userId) throw new UnauthorizedError()
        const { id, stageId, activityId } = c.req.valid('param')
        await requireBrandAccess(userId, id, deps.db)
        await requireStage(id, stageId)
        const row = await deps.db.deleteFunnelActivity(stageId, activityId)
        if (!row) throw new NotFoundError('activity not found', 'FUNNEL_ACTIVITY_NOT_FOUND')
        return c.json(row)
      },
    )
}
