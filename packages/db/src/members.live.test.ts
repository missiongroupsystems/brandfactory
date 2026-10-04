import type { BrandId, UserId, WorkspaceId } from '@brandfactory/shared'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { pool } from './client'
import { createBrand, deleteBrand } from './queries/brands'
import { getBrandRoleForUser, setBrandGrants } from './queries/user-brands'
import { countActiveAdmins, insertMember, setMemberDeactivated } from './queries/users'
import { writeAudit } from './queries/credential-audit'
import { createWorkspace, deleteWorkspace } from './queries/workspaces'
import { seed } from './seed'

// Live-DB test — only runs when DATABASE_URL is set, like every other
// `*.live.test.ts`.
//
// What only real Postgres can prove here, and what the fake in
// `packages/server/src/test-helpers.ts` mirrors without evidence:
//
//  - the **`lower(email)` unique index** added in migration 0027. The fake
//    lower-cases and compares in JavaScript, which proves nothing about whether
//    the index exists in the database it is supposed to protect.
//  - `setBrandGrants`' **diff inside one transaction**, including the
//    `unique(user_id, brand_id)` key it relies on.
//  - that `credential_audit` accepts a row with **ids that reference nothing**,
//    which is the whole point of its missing foreign keys.
const hasDb = !!process.env.DATABASE_URL

describe.skipIf(!hasDb)('members (live DB)', () => {
  let workspaceId: WorkspaceId
  let brandA: BrandId
  let brandB: BrandId
  const createdUsers: UserId[] = []

  beforeAll(async () => {
    const ids = await seed()
    workspaceId = (
      await createWorkspace({
        name: 'Members scratch',
        ownerUserId: ids.userId as UserId,
      })
    ).id
    brandA = (await createBrand({ workspaceId, name: 'Grant A' })).id
    brandB = (await createBrand({ workspaceId, name: 'Grant B' })).id
  })

  afterAll(async () => {
    // `user_brands` cascades from `users`, so deleting the people is enough.
    for (const id of createdUsers) {
      await pool.query('delete from users where id = $1', [id])
    }
    await pool.query('delete from credential_audit where actor_email like $1', ['live-test-%'])
    await deleteBrand(brandA)
    await deleteBrand(brandB)
    await deleteWorkspace(workspaceId)
  })

  async function member(email: string, role: 'admin' | null = null) {
    const row = await insertMember({
      id: randomUUID(),
      email,
      displayName: null,
      role,
      mustSetPassword: true,
    })
    createdUsers.push(row.id as UserId)
    return row
  }

  it('refuses a second address differing only in case', async () => {
    // This is migration 0027's `users_email_lower_idx` doing its job. `email`
    // is also `unique`, but case-sensitively — so without the index
    // `Bob@x.com` and `bob@x.com` both exist, and on a path that hands out a
    // session that is a way to authenticate somebody as the wrong person.
    const base = `live-test-case-${randomUUID()}@example.com`
    await member(base)
    await expect(member(base.toUpperCase())).rejects.toThrow()
  })

  it('counts only active admins', async () => {
    const before = await countActiveAdmins()
    const a = await member(`live-test-admin-${randomUUID()}@example.com`, 'admin')
    expect(await countActiveAdmins()).toBe(before + 1)
    // Deactivation withdraws the count too, which is what makes the last-admin
    // guard mean "last *usable* admin".
    await setMemberDeactivated(a.id as UserId, true)
    expect(await countActiveAdmins()).toBe(before)
  })

  it('diffs grants: inserts, changes a role, and removes what is gone', async () => {
    const u = await member(`live-test-grants-${randomUUID()}@example.com`)
    const id = u.id as UserId

    const first = await setBrandGrants(id, [{ brandId: brandA, role: 'editor' }])
    expect(first.granted).toEqual([{ brandId: brandA, role: 'editor' }])
    expect(await getBrandRoleForUser(id, brandA)).toBe('editor')

    // A role change is a change, not a revoke plus a grant — which is what
    // keeps a concurrent request from this person from being refused a brand
    // they are keeping.
    const second = await setBrandGrants(id, [
      { brandId: brandA, role: 'manager' },
      { brandId: brandB, role: 'editor' },
    ])
    expect(second.changed).toEqual([{ brandId: brandA, from: 'editor', to: 'manager' }])
    expect(second.granted).toEqual([{ brandId: brandB, role: 'editor' }])
    expect(second.revoked).toEqual([])

    const third = await setBrandGrants(id, [])
    expect(third.revoked.map((r) => r.brandId).sort()).toEqual([brandA, brandB].sort())
    expect(await getBrandRoleForUser(id, brandA)).toBeNull()
  })

  it('is idempotent: saving the same grants twice changes nothing', async () => {
    const u = await member(`live-test-idem-${randomUUID()}@example.com`)
    const id = u.id as UserId
    const wanted = [{ brandId: brandA, role: 'manager' as const }]
    await setBrandGrants(id, wanted)
    const again = await setBrandGrants(id, wanted)
    expect(again).toEqual({ granted: [], changed: [], revoked: [] })
  })

  it('cascades grants away with the person', async () => {
    const u = await member(`live-test-cascade-${randomUUID()}@example.com`)
    const id = u.id as UserId
    await setBrandGrants(id, [{ brandId: brandA, role: 'editor' }])
    await pool.query('delete from users where id = $1', [id])
    expect(await getBrandRoleForUser(id, brandA)).toBeNull()
  })

  it('accepts an audit row whose ids reference nothing', async () => {
    // The point of the missing foreign keys. Launchpad's audit table held one
    // to `users`, which took `FOR KEY SHARE` on a row the request's own
    // transaction held `FOR UPDATE` — and every user create deadlocked for two
    // months. An audit row is a record of an act, not a relationship, so after
    // a hard delete the ids stand and the stored email still says who it was.
    const ghost = randomUUID() as UserId
    await writeAudit({
      actorId: ghost,
      actorEmail: 'live-test-ghost-actor@example.com',
      subjectId: ghost,
      subjectEmail: 'live-test-ghost-subject@example.com',
      action: 'revoked',
      brandId: randomUUID() as BrandId,
      fromRole: 'manager',
    })
    const { rows } = await pool.query(
      'select action, from_role from credential_audit where subject_email = $1',
      ['live-test-ghost-subject@example.com'],
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ action: 'revoked', from_role: 'manager' })
  })
})
