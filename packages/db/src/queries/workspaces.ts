import type { UserId, Workspace, WorkspaceId } from '@brandfactory/shared'
import { and, eq, isNotNull, sql } from 'drizzle-orm'
import { db } from '../client'
import { rowToWorkspace } from '../mappers'
import { brandAssets, brands, canvasBlocks, canvases, projects, workspaces } from '../schema'

export async function getWorkspaceById(id: WorkspaceId): Promise<Workspace | null> {
  const [row] = await db.select().from(workspaces).where(eq(workspaces.id, id))
  return row ? rowToWorkspace(row) : null
}

export async function listWorkspacesByOwner(ownerUserId: UserId): Promise<Workspace[]> {
  const rows = await db.select().from(workspaces).where(eq(workspaces.ownerUserId, ownerUserId))
  return rows.map(rowToWorkspace)
}

// Every workspace, regardless of owner. The interim shared-access model (see
// `authz.ts`) shows all users all workspaces; `listWorkspacesByOwner` is kept
// for the Passport migration, which will scope the list by org membership.
export async function listAllWorkspaces(): Promise<Workspace[]> {
  const rows = await db.select().from(workspaces)
  return rows.map(rowToWorkspace)
}

export async function createWorkspace(input: {
  name: string
  ownerUserId: UserId
}): Promise<Workspace> {
  const [row] = await db
    .insert(workspaces)
    .values({ name: input.name, ownerUserId: input.ownerUserId })
    .returning()
  if (!row) throw new Error('createWorkspace returned no row')
  return rowToWorkspace(row)
}

export async function updateWorkspace(
  id: WorkspaceId,
  input: { name: string },
): Promise<Workspace | null> {
  const [row] = await db
    .update(workspaces)
    .set({ name: input.name, updatedAt: sql`now()` })
    .where(eq(workspaces.id, id))
    .returning()
  return row ? rowToWorkspace(row) : null
}

// Cascades brands → projects → canvases → blocks / messages, plus assets, posts,
// sections, research and `workspace_settings`, all via FK `onDelete: 'cascade'`.
// Blobs held by those rows live in object storage, outside the FK graph — the
// caller must collect `listBlobKeysByWorkspace` *before* this delete and sweep
// them, or the bytes orphan forever. This mirrors `deleteBrand` one level up.
export async function deleteWorkspace(id: WorkspaceId): Promise<Workspace | null> {
  const [row] = await db.delete(workspaces).where(eq(workspaces.id, id)).returning()
  return row ? rowToWorkspace(row) : null
}

/**
 * Storage keys held by everything under this workspace. Read before the row
 * delete cascades them away. Same two arms as `listBlobKeysByBrand`, each with
 * one more join up to `brands.workspaceId`:
 *
 * - **canvas blocks**, via project → canvas → project.brandId → brand.
 * - **brand assets**, filtered to `source = 'blob'` — a `link` row's `url` is
 *   someone else's host, and its `blobKey` is null anyway.
 *
 * Soft-deleted rows are included on purpose: the workspace is going away, so
 * every byte it ever owned goes with it. The final sweep still subtracts keys a
 * surviving row outside this workspace still names (see `listStillReferencedBlobKeys`).
 */
export async function listBlobKeysByWorkspace(workspaceId: WorkspaceId): Promise<string[]> {
  const blockRows = await db
    .select({ blobKey: canvasBlocks.blobKey })
    .from(canvasBlocks)
    .innerJoin(canvases, eq(canvases.id, canvasBlocks.canvasId))
    .innerJoin(projects, eq(projects.id, canvases.projectId))
    .innerJoin(brands, eq(brands.id, projects.brandId))
    .where(and(eq(brands.workspaceId, workspaceId), isNotNull(canvasBlocks.blobKey)))

  const assetRows = await db
    .select({ blobKey: brandAssets.blobKey })
    .from(brandAssets)
    .innerJoin(brands, eq(brands.id, brandAssets.brandId))
    .where(
      and(
        eq(brands.workspaceId, workspaceId),
        eq(brandAssets.source, 'blob'),
        isNotNull(brandAssets.blobKey),
      ),
    )

  return [...blockRows, ...assetRows].map((r) => r.blobKey).filter((k): k is string => k !== null)
}
