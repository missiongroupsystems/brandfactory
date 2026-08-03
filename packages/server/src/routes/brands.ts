import {
  AutofillSectionInputSchema,
  BrandIdSchema,
  CreateBrandInputSchema,
  UpdateBrandGuidelinesInputSchema,
  UpdateBrandInputSchema,
  WorkspaceIdSchema,
  type BrandWithSections,
  type UserId,
} from '@brandfactory/shared'
import type { BlobStore } from '@brandfactory/adapter-storage'
import type { ResearchProvider } from '@brandfactory/adapter-research'
import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'
import { requireBrandAccess, requireWorkspaceAccess } from '../authz'
import { sweepBlobs } from '../blob-sweep'
import type { AppEnv } from '../context'
import type { Db } from '../db'
import { NotFoundError, UnauthorizedError } from '../errors'
import { autofillSection, type AutofillEnv } from '../research/autofill'
import type { ShapeSectionFn } from '../research/shape'

export interface BrandsDeps {
  db: Db
  storage: BlobStore
}

/**
 * The brand-scoped router's wider deps: the guidelines auto-fill lives here (it
 * is a guidelines concern; the research router stays about jobs), and its Path
 * S can spend vendor money — cents, not the deep run's $0.40, but the same
 * rule: the provider and the guards ride in as deps, never reached for.
 */
export interface BrandRoutesDeps extends BrandsDeps {
  research: ResearchProvider
  env: AutofillEnv
  shapeSection: ShapeSectionFn
}

// Two mounted shapes — workspace-scoped list/create and brand-scoped
// read/patch — live in the same module so the guideline-upsert stays near
// its siblings. `app.ts` mounts each router under its own prefix.
export function createWorkspaceBrandsRouter(deps: BrandsDeps) {
  const WorkspaceParam = z.object({ workspaceId: WorkspaceIdSchema })

  return new Hono<AppEnv>()
    .get('/:workspaceId/brands', zValidator('param', WorkspaceParam), async (c) => {
      const userId = c.var.userId
      if (!userId) throw new UnauthorizedError()
      const { workspaceId } = c.req.valid('param')
      await requireWorkspaceAccess(userId, workspaceId, deps.db)
      // BrandSummary: brand row + section/project counts for the workspace home.
      const rows = await deps.db.listBrandSummariesByWorkspace(workspaceId)
      return c.json(rows)
    })
    .post(
      '/:workspaceId/brands',
      zValidator('param', WorkspaceParam),
      zValidator('json', CreateBrandInputSchema),
      async (c) => {
        const userId = c.var.userId
        if (!userId) throw new UnauthorizedError()
        const { workspaceId } = c.req.valid('param')
        await requireWorkspaceAccess(userId, workspaceId, deps.db)
        const body = c.req.valid('json')
        const row = await deps.db.createBrand({
          workspaceId,
          name: body.name,
          description: body.description ?? null,
          websiteUrl: body.websiteUrl ?? null,
        })
        return c.json(row, 201)
      },
    )
}

export function createBrandsRouter(deps: BrandRoutesDeps) {
  const BrandParam = z.object({ id: BrandIdSchema })

  return (
    new Hono<AppEnv>()
      .get('/:id', zValidator('param', BrandParam), async (c) => {
        const userId = c.var.userId
        if (!userId) throw new UnauthorizedError()
        const { id } = c.req.valid('param')
        const { brand } = await requireBrandAccess(userId, id, deps.db)
        const sections = await deps.db.listSectionsByBrand(id)
        const body: BrandWithSections = { ...brand, sections }
        return c.json(body)
      })
      .patch(
        '/:id',
        zValidator('param', BrandParam),
        zValidator('json', UpdateBrandInputSchema),
        async (c) => {
          const userId = c.var.userId
          if (!userId) throw new UnauthorizedError()
          const { id } = c.req.valid('param')
          await requireBrandAccess(userId, id, deps.db)
          const body = c.req.valid('json')
          const row = await deps.db.updateBrand(id, body)
          if (!row) throw new NotFoundError('brand not found', 'BRAND_NOT_FOUND')
          return c.json(row)
        },
      )
      .delete('/:id', zValidator('param', BrandParam), async (c) => {
        const userId = c.var.userId
        if (!userId) throw new UnauthorizedError()
        const { id } = c.req.valid('param')
        await requireBrandAccess(userId, id, deps.db)
        // Read the blob keys first — the row cascade destroys the only pointer.
        const blobKeys = await deps.db.listBlobKeysByBrand(id)
        // Cascades projects → canvases → blocks / messages via FK onDelete.
        const row = await deps.db.deleteBrand(id)
        if (!row) throw new NotFoundError('brand not found', 'BRAND_NOT_FOUND')
        // Asked *after* the cascade, so anything still pointing at one of these
        // keys is by definition a row outside the brand just deleted — an asset
        // that named a key it did not mint, or a canvas block sharing one.
        // Sweeping those would destroy bytes this delete does not own.
        const stillReferenced = await deps.db.listStillReferencedBlobKeys(blobKeys)
        await sweepBlobs(
          deps.storage,
          blobKeys,
          c.var.log,
          { resource: 'brand', id },
          stillReferenced,
        )
        return c.json(row)
      })
      .patch(
        '/:id/guidelines',
        zValidator('param', BrandParam),
        zValidator('json', UpdateBrandGuidelinesInputSchema),
        async (c) => {
          const userId = c.var.userId
          if (!userId) throw new UnauthorizedError()
          const { id } = c.req.valid('param')
          await requireBrandAccess(userId, id, deps.db)
          const body = c.req.valid('json')
          // The payload is the brand's COMPLETE section list, not a patch: the
          // single-tx upsert + reorder + delete-omitted lives in
          // `@brandfactory/db` so a mid-list failure rolls back instead of
          // leaving the brand half updated.
          //
          // `createdBy` comes off the wire (Stage 1B). It used to be synthesised
          // as `'user'` here, which — because the payload is the complete list —
          // meant every save rewrote the author of every section the client sent
          // back, not just the one being edited. The schema defaults it to
          // `'user'`, so a client that does not know about the field is unchanged.
          const sections = await deps.db.updateBrandGuidelines(
            id,
            body.sections.map((s) => ({
              id: s.id,
              label: s.label,
              body: s.body,
              priority: s.priority,
              createdBy: s.createdBy,
            })),
          )
          return c.json(sections)
        },
      )
      /**
       * Auto-fill one guideline section — returns a **draft**, never writes it.
       *
       * The body is one label; everything else the fill needs (the brand's name,
       * its website, its existing labels, whether a report exists) comes off the
       * brand the URL names — the same nothing-for-a-client-to-tamper-with
       * posture as `POST /brands/:id/research`. Path selection, the 3C guard
       * order and the per-day cap all live in `autofillSection`, above the money
       * line.
       *
       * The literal `autofill` sits at a position no sibling parameterises
       * (`/:id/guidelines` has no parameterised children), so `RegExpRouter`
       * still compiles — `app.test.ts` asserts that directly, the 1.11.1 lesson.
       */
      .post(
        '/:id/guidelines/autofill',
        zValidator('param', BrandParam),
        zValidator('json', AutofillSectionInputSchema),
        async (c) => {
          const userId = c.var.userId
          if (!userId) throw new UnauthorizedError()
          const { id } = c.req.valid('param')
          const { brand, workspace } = await requireBrandAccess(userId, id, deps.db)
          const { label } = c.req.valid('json')
          const result = await autofillSection(
            {
              db: deps.db,
              research: deps.research,
              env: deps.env,
              shapeSection: deps.shapeSection,
              // Request-scoped, so an upstream failure is findable by request
              // id. The user gets `AutofillUpstreamError`'s sentence; the cause
              // only ever goes here.
              logger: c.var.log,
            },
            {
              brandId: brand.id,
              workspaceId: workspace.id,
              brandName: brand.name,
              websiteUrl: brand.websiteUrl,
              label,
              userId: userId as UserId,
            },
          )
          return c.json(result)
        },
      )
  )
}
