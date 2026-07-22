import {
  BrandIdSchema,
  CreateProjectInputSchema,
  ProjectIdSchema,
  UpdateProjectInputSchema,
  WorkspaceIdSchema,
  type BrandWithSections,
} from '@brandfactory/shared'
import type { BlobStore } from '@brandfactory/adapter-storage'
import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'
import { requireBrandAccess, requireProjectAccess, requireWorkspaceAccess } from '../authz'
import { sweepBlobs } from '../blob-sweep'
import type { AppEnv } from '../context'
import type { Db } from '../db'
import { NotFoundError, UnauthorizedError } from '../errors'

export interface ProjectsDeps {
  db: Db
  storage: BlobStore
}

// Workspace-scoped recent-work strip. Mounted under `/workspaces` so the
// path is `GET /workspaces/:workspaceId/projects` — not brand-scoped
// `GET /brands/:brandId/projects`, which cannot span brands.
export function createWorkspaceProjectsRouter(deps: ProjectsDeps) {
  const WorkspaceParam = z.object({ workspaceId: WorkspaceIdSchema })
  const ProjectsQuery = z.object({
    limit: z.coerce.number().int().min(1).max(50).default(10),
  })

  return new Hono<AppEnv>().get(
    '/:workspaceId/projects',
    zValidator('param', WorkspaceParam),
    zValidator('query', ProjectsQuery),
    async (c) => {
      const userId = c.var.userId
      if (!userId) throw new UnauthorizedError()
      const { workspaceId } = c.req.valid('param')
      const { limit } = c.req.valid('query')
      await requireWorkspaceAccess(userId, workspaceId, deps.db)
      const rows = await deps.db.listRecentProjectsByWorkspace(workspaceId, limit)
      return c.json(rows)
    },
  )
}

export function createBrandProjectsRouter(deps: ProjectsDeps) {
  const BrandParam = z.object({ brandId: BrandIdSchema })

  return new Hono<AppEnv>()
    .get('/:brandId/projects', zValidator('param', BrandParam), async (c) => {
      const userId = c.var.userId
      if (!userId) throw new UnauthorizedError()
      const { brandId } = c.req.valid('param')
      await requireBrandAccess(userId, brandId, deps.db)
      // ProjectSummary[] — same shape and same D1 activity definition as the
      // workspace-scoped strip, so the shared ProjectCard means one thing.
      const rows = await deps.db.listProjectSummariesByBrand(brandId)
      return c.json(rows)
    })
    .post(
      '/:brandId/projects',
      zValidator('param', BrandParam),
      zValidator('json', CreateProjectInputSchema),
      async (c) => {
        const userId = c.var.userId
        if (!userId) throw new UnauthorizedError()
        const { brandId } = c.req.valid('param')
        await requireBrandAccess(userId, brandId, deps.db)
        const body = c.req.valid('json')
        // 1:1 project↔canvas invariant lives in a single tx in
        // `@brandfactory/db` so a mid-write failure never leaves an orphan.
        const { project } =
          body.kind === 'freeform'
            ? await deps.db.createProjectWithCanvas({
                kind: 'freeform',
                brandId,
                name: body.name,
              })
            : await deps.db.createProjectWithCanvas({
                kind: 'standardized',
                brandId,
                name: body.name,
                templateId: body.templateId,
              })
        return c.json(project, 201)
      },
    )
}

export function createProjectsRouter(deps: ProjectsDeps) {
  const ProjectParam = z.object({ id: ProjectIdSchema })

  return new Hono<AppEnv>()
    .get('/:id', zValidator('param', ProjectParam), async (c) => {
      const userId = c.var.userId
      if (!userId) throw new UnauthorizedError()
      const { id } = c.req.valid('param')
      const { project, brand } = await requireProjectAccess(userId, id, deps.db)
      const canvas = await deps.db.getCanvasByProject(project.id)
      if (!canvas) throw new NotFoundError('canvas not found', 'CANVAS_NOT_FOUND')
      const [blocks, shortlist, sections, recentMessages] = await Promise.all([
        deps.db.listActiveBlocks(canvas.id),
        deps.db.getShortlistView(project.id),
        deps.db.listSectionsByBrand(brand.id),
        deps.db.listAgentMessages(project.id),
      ])
      const brandWithSections: BrandWithSections = { ...brand, sections }
      return c.json({
        ...project,
        canvas,
        blocks,
        shortlistBlockIds: shortlist.blockIds,
        recentMessages,
        brand: brandWithSections,
      })
    })
    .patch(
      '/:id',
      zValidator('param', ProjectParam),
      zValidator('json', UpdateProjectInputSchema),
      async (c) => {
        const userId = c.var.userId
        if (!userId) throw new UnauthorizedError()
        const { id } = c.req.valid('param')
        await requireProjectAccess(userId, id, deps.db)
        const body = c.req.valid('json')
        const row = await deps.db.updateProject(id, body)
        if (!row) throw new NotFoundError('project not found', 'PROJECT_NOT_FOUND')
        return c.json(row)
      },
    )
    .delete('/:id', zValidator('param', ProjectParam), async (c) => {
      const userId = c.var.userId
      if (!userId) throw new UnauthorizedError()
      const { id } = c.req.valid('param')
      await requireProjectAccess(userId, id, deps.db)
      // Read the blob keys first — the row cascade destroys the only pointer.
      const blobKeys = await deps.db.listBlobKeysByProject(id)
      const row = await deps.db.deleteProject(id)
      if (!row) throw new NotFoundError('project not found', 'PROJECT_NOT_FOUND')
      await sweepBlobs(deps.storage, blobKeys, c.var.log, { resource: 'project', id })
      return c.json(row)
    })
}
