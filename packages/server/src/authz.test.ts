import type { BrandId, BrandRole, ProjectId, UserId, WorkspaceId } from '@brandfactory/shared'
import { describe, expect, it } from 'vitest'
import {
  requireActiveUser,
  requireBrandAccess,
  requireProjectAccess,
  requireWorkspaceAccess,
} from './authz'
import { AccountDeactivatedError, ForbiddenError, NoAccountError, NotFoundError } from './errors'
import { createFakeDb } from './test-helpers'

const NOW = '2026-10-05T00:00:00.000Z'

/**
 * Four people against one workspace, one brand and one project:
 *
 * - `admin`   — an active workspace admin, no grants
 * - `member`  — role null, holding a `manager` grant on the brand
 * - `outsider`— role null, no grants: a real `users` row with no access
 * - `gone`    — an admin with `deactivated_at` set
 * - `stranger`— no `users` row at all, which is the Phase C case
 */
async function seed() {
  const { db, state } = createFakeDb()
  const admin = 'user-admin' as UserId
  const workspace = await db.createWorkspace({ name: 'w', ownerUserId: admin })
  const brand = await db.createBrand({ workspaceId: workspace.id, name: 'b' })
  const { project } = await db.createProjectWithCanvas({
    kind: 'freeform',
    brandId: brand.id,
    name: 'p',
  })

  const row = (id: string, over: { role?: 'admin' | null; deactivatedAt?: string | null }) => {
    state.users.set(id, {
      id,
      email: `${id}@example.com`,
      displayName: null,
      role: null,
      mustSetPassword: false,
      deactivatedAt: null,
      createdAt: NOW,
      updatedAt: NOW,
      ...over,
    })
  }
  row(admin, { role: 'admin' })
  row('user-member', {})
  row('user-outsider', {})
  row('user-gone', { role: 'admin', deactivatedAt: NOW })

  const grant = (userId: string, role: BrandRole) =>
    state.userBrands.set(`${userId}:${brand.id}`, { userId, brandId: brand.id, role })
  grant('user-member', 'manager')

  return { db, state, admin, workspace, brand, project }
}

describe('requireActiveUser', () => {
  it('refuses a token with no `users` row — the door Phase C closed', async () => {
    // Until Phase C this id would have been provisioned a row on first verify
    // and then admitted to every brand in the estate.
    const { db } = await seed()
    await expect(requireActiveUser('stranger', db)).rejects.toBeInstanceOf(NoAccountError)
  })

  it('refuses a deactivated account, separately so the message can differ', async () => {
    // *You were never added* and *your access was withdrawn* are different
    // news, and an administrator reading a support message needs to know which.
    const { db } = await seed()
    await expect(requireActiveUser('user-gone', db)).rejects.toBeInstanceOf(AccountDeactivatedError)
  })

  it('returns the row for an active account', async () => {
    const { db, admin } = await seed()
    expect((await requireActiveUser(admin, db)).id).toBe(admin)
  })
})

describe('requireWorkspaceAccess', () => {
  it('admits any active account — per-brand is the dimension that narrows', async () => {
    // A member has to reach the workspace to reach the brands granted to them
    // through the aggregate chain.
    const { db, workspace } = await seed()
    expect((await requireWorkspaceAccess('user-outsider', workspace.id, db)).id).toBe(workspace.id)
  })

  it('refuses a stranger and a deactivated account', async () => {
    const { db, workspace } = await seed()
    await expect(requireWorkspaceAccess('stranger', workspace.id, db)).rejects.toBeInstanceOf(
      NoAccountError,
    )
    await expect(requireWorkspaceAccess('user-gone', workspace.id, db)).rejects.toBeInstanceOf(
      AccountDeactivatedError,
    )
  })

  it('throws NotFoundError for a missing workspace', async () => {
    const { db, admin } = await seed()
    await expect(requireWorkspaceAccess(admin, 'ghost' as WorkspaceId, db)).rejects.toBeInstanceOf(
      NotFoundError,
    )
  })
})

describe('requireBrandAccess', () => {
  it('admits an admin with no grant at all', async () => {
    const { db, admin, brand } = await seed()
    const got = await requireBrandAccess(admin, brand.id, db)
    expect(got.brand.id).toBe(brand.id)
    // No grant was read, and none exists — `isAdmin` short-circuits ahead of
    // the table, which is why an admin needs no row per brand.
    expect(got.grant).toBeNull()
  })

  it('admits a member holding a grant, and reports the role', async () => {
    const { db, brand } = await seed()
    const got = await requireBrandAccess('user-member', brand.id, db)
    expect(got.grant).toBe('manager')
  })

  it('refuses a member with no grant — this is what 1.29.0 could not do', async () => {
    const { db, brand } = await seed()
    await expect(requireBrandAccess('user-outsider', brand.id, db)).rejects.toBeInstanceOf(
      ForbiddenError,
    )
  })

  it('404s a missing brand before it checks access', async () => {
    // Not-found before forbidden, so a member cannot learn which brand ids
    // exist by comparing the two refusals.
    const { db, brand } = await seed()
    await expect(
      requireBrandAccess('user-outsider', 'ghost' as BrandId, db),
    ).rejects.toBeInstanceOf(NotFoundError)
    // And the same id the outsider *can* see the existence of still refuses.
    await expect(requireBrandAccess('user-outsider', brand.id, db)).rejects.toBeInstanceOf(
      ForbiddenError,
    )
  })

  it('refuses a stranger before anything else', async () => {
    const { db, brand } = await seed()
    await expect(requireBrandAccess('stranger', brand.id, db)).rejects.toBeInstanceOf(
      NoAccountError,
    )
  })
})

describe('requireProjectAccess', () => {
  it('walks project → brand → workspace for a granted member', async () => {
    const { db, project } = await seed()
    expect((await requireProjectAccess('user-member', project.id, db)).project.id).toBe(project.id)
  })

  it('refuses a member with no grant on the project’s brand', async () => {
    // The chain is the point: nothing on the project itself says who may read
    // it, so the brand answers for it.
    const { db, project } = await seed()
    await expect(requireProjectAccess('user-outsider', project.id, db)).rejects.toBeInstanceOf(
      ForbiddenError,
    )
  })

  it('404s a missing project', async () => {
    const { db, admin } = await seed()
    await expect(requireProjectAccess(admin, 'ghost' as ProjectId, db)).rejects.toBeInstanceOf(
      NotFoundError,
    )
  })
})
