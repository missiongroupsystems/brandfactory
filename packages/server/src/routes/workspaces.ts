import {
  CreateWorkspaceInputSchema,
  UpdateWorkspaceInputSchema,
  WorkspaceIdSchema,
  type UserId,
} from '@brandfactory/shared'
import type { BlobStore } from '@brandfactory/adapter-storage'
import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'
import { requireWorkspaceAccess } from '../authz'
import { sweepBlobs } from '../blob-sweep'
import type { AppEnv } from '../context'
import type { Db } from '../db'
import { NotFoundError, UnauthorizedError } from '../errors'

export interface WorkspacesDeps {
  db: Db
  storage: BlobStore
}

const IdParam = z.object({ id: WorkspaceIdSchema })

export function createWorkspacesRouter(deps: WorkspacesDeps) {
  return new Hono<AppEnv>()
    .get('/', async (c) => {
      const userId = c.var.userId
      if (!userId) throw new UnauthorizedError()
      // Interim shared-access model (see `authz.ts`): every authenticated user
      // sees every workspace. Passport will scope this list by org membership.
      const rows = await deps.db.listAllWorkspaces()
      return c.json(rows)
    })
    .post('/', zValidator('json', CreateWorkspaceInputSchema), async (c) => {
      const userId = c.var.userId
      if (!userId) throw new UnauthorizedError()
      const body = c.req.valid('json')
      const row = await deps.db.createWorkspace({ name: body.name, ownerUserId: userId as UserId })
      return c.json(row, 201)
    })
    .get('/:id', zValidator('param', IdParam), async (c) => {
      const userId = c.var.userId
      if (!userId) throw new UnauthorizedError()
      const { id } = c.req.valid('param')
      const workspace = await requireWorkspaceAccess(userId, id, deps.db)
      return c.json(workspace)
    })
    .patch(
      '/:id',
      zValidator('param', IdParam),
      zValidator('json', UpdateWorkspaceInputSchema),
      async (c) => {
        const userId = c.var.userId
        if (!userId) throw new UnauthorizedError()
        const { id } = c.req.valid('param')
        await requireWorkspaceAccess(userId, id, deps.db)
        const body = c.req.valid('json')
        const row = await deps.db.updateWorkspace(id, body)
        if (!row) throw new NotFoundError('workspace not found', 'WORKSPACE_NOT_FOUND')
        return c.json(row)
      },
    )
    .delete('/:id', zValidator('param', IdParam), async (c) => {
      const userId = c.var.userId
      if (!userId) throw new UnauthorizedError()
      const { id } = c.req.valid('param')
      await requireWorkspaceAccess(userId, id, deps.db)
      // Read the blob keys first — the row cascade destroys the only pointer.
      const blobKeys = await deps.db.listBlobKeysByWorkspace(id)
      // Cascades brands → projects → canvases → blocks, plus assets, posts,
      // sections, research and settings, via FK onDelete. One level up from
      // `deleteBrand`, the same idiom.
      const row = await deps.db.deleteWorkspace(id)
      if (!row) throw new NotFoundError('workspace not found', 'WORKSPACE_NOT_FOUND')
      // Asked *after* the cascade, so anything still pointing at one of these
      // keys is a row outside the workspace just deleted — bytes this delete
      // does not own.
      const stillReferenced = await deps.db.listStillReferencedBlobKeys(blobKeys)
      await sweepBlobs(
        deps.storage,
        blobKeys,
        c.var.log,
        { resource: 'workspace', id },
        stillReferenced,
      )
      return c.json(row)
    })
}
