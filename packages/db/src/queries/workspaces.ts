import type { UserId, Workspace, WorkspaceId } from '@brandfactory/shared'
import { eq, sql } from 'drizzle-orm'
import { db } from '../client'
import { rowToWorkspace } from '../mappers'
import { workspaces } from '../schema'

export async function getWorkspaceById(id: WorkspaceId): Promise<Workspace | null> {
  const [row] = await db.select().from(workspaces).where(eq(workspaces.id, id))
  return row ? rowToWorkspace(row) : null
}

export async function listWorkspacesByOwner(ownerUserId: UserId): Promise<Workspace[]> {
  const rows = await db.select().from(workspaces).where(eq(workspaces.ownerUserId, ownerUserId))
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
