import { CreateOutletInputSchema, OutletSchema } from '@brandfactory/shared'
import type {
  BrandId,
  CreateOutletInput,
  OutletId,
  UserId,
  WorkspaceId,
} from '@brandfactory/shared'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { pool } from './client'
import { createBrand, deleteBrand } from './queries/brands'
import {
  BrandNotInWorkspaceError,
  createOutlet,
  deleteOutlet,
  getOutletByRef,
  listOutletsByWorkspace,
  updateOutlet,
} from './queries/outlets'
import { createWorkspace, deleteWorkspace } from './queries/workspaces'
import { seed } from './seed'

// Live-DB test — only runs when DATABASE_URL is set, matching the other
// `*.live.test.ts` files, and its own file for the same reason as theirs: each
// owns the `pg` pool for its worker and ends it in `afterAll`.
//
// What is only provable against real Postgres here: the `date` columns coming
// back as plain `YYYY-MM-DD` rather than instants, the `text[]` round trip, the
// per-workspace unique slug and the suffix that dodges it, `ON DELETE SET NULL`
// on the brand (a deleted brand must not take its premises with it), and the
// workspace scoping that makes `getOutletByRef` an access gate rather than a
// convenience.
const hasDb = !!process.env.DATABASE_URL

describe.skipIf(!hasDb)('outlets (live DB)', () => {
  let seededWorkspaceId: WorkspaceId
  let workspaceId: WorkspaceId
  const createdBrands: BrandId[] = []

  beforeAll(async () => {
    const ids = await seed()
    seededWorkspaceId = ids.workspaceId as WorkspaceId
    // Every write below lands in a workspace of its own. `seed.test.ts` asserts
    // exact counts against the demo workspace, and the seeded outlets are read
    // from it here — so nothing may add a row to it.
    const scratch = await createWorkspace({
      name: 'Outlet round-trip scratch workspace',
      ownerUserId: ids.userId as UserId,
    })
    workspaceId = scratch.id
  })

  afterAll(async () => {
    for (const id of createdBrands) await deleteBrand(id)
    // Cascades every outlet written below.
    await deleteWorkspace(workspaceId)
    await pool.end()
  })

  function input(overrides: Partial<CreateOutletInput> & { name: string }): CreateOutletInput {
    // Through the schema so `status`' default is applied exactly as a route
    // would apply it, rather than being written out a second time here.
    return CreateOutletInputSchema.parse({ outletType: 'cafe', ...overrides })
  }

  it('round-trips a full record, and the response satisfies the wire schema', async () => {
    const created = await createOutlet(
      workspaceId,
      input({
        name: 'Casa Vostra',
        status: 'open',
        address: '31 Keong Saik Road',
        unit: '#01-02',
        postalCode: '089137',
        attributes: ['serves_alcohol', 'prepares_food'],
        openingDate: '2024-03-01',
        notes: 'Corner unit.',
      }),
    )

    expect(OutletSchema.safeParse(created).success).toBe(true)
    expect(created.slug).toBe('casa-vostra')
    expect(created.attributes).toEqual(['serves_alcohol', 'prepares_food'])
    // The whole reason the column is `date` and not `timestamp`: what went in is
    // what comes out, with no zone in between.
    expect(created.openingDate).toBe('2024-03-01')
  })

  it('defaults the unset columns rather than leaving them undefined', async () => {
    const created = await createOutlet(workspaceId, input({ name: 'Bare Minimum' }))
    expect(created.status).toBe('pipeline')
    expect(created.attributes).toEqual([])
    expect(created.brandId).toBeNull()
    expect(created.address).toBeNull()
    expect(created.openingDate).toBeNull()
  })

  it('suffixes a slug that is already taken in the workspace', async () => {
    const first = await createOutlet(workspaceId, input({ name: 'Twice Over' }))
    const second = await createOutlet(workspaceId, input({ name: 'Twice Over' }))
    expect(first.slug).toBe('twice-over')
    expect(second.slug).toBe('twice-over-2')
  })

  it('resolves by slug or by id, and only inside the workspace', async () => {
    const created = await createOutlet(workspaceId, input({ name: 'Findable' }))

    expect((await getOutletByRef(workspaceId, 'findable'))?.id).toBe(created.id)
    expect((await getOutletByRef(workspaceId, created.id))?.id).toBe(created.id)
    // The access gate: the same id from the seeded workspace misses.
    expect(await getOutletByRef(seededWorkspaceId, created.id)).toBeNull()
  })

  it('answers null for a ref that is neither a slug nor a uuid', async () => {
    // The branch that exists so Postgres is never handed a non-uuid string to
    // compare against a `uuid` column — that raises, and a 500 is the wrong
    // answer to "no such outlet".
    expect(await getOutletByRef(workspaceId, 'no-such-outlet')).toBeNull()
    expect(await getOutletByRef(workspaceId, 'not a uuid at all')).toBeNull()
  })

  it('lists a workspace in name order', async () => {
    const rows = await listOutletsByWorkspace(seededWorkspaceId)
    const names = rows.map((r) => r.name)
    expect(names).toEqual([...names].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)))
    expect(rows.length).toBe(6)
  })

  it('patches only the keys it is given, and clears on an explicit null', async () => {
    const created = await createOutlet(
      workspaceId,
      input({ name: 'Patchable', address: '1 Somewhere', notes: 'Keep me' }),
    )

    const patched = await updateOutlet(workspaceId, created.id, { address: null })
    expect(patched?.address).toBeNull()
    expect(patched?.notes).toBe('Keep me')
    expect(patched?.name).toBe('Patchable')
  })

  it('leaves the slug alone when the name changes', async () => {
    const created = await createOutlet(workspaceId, input({ name: 'Old Name' }))
    const patched = await updateOutlet(workspaceId, created.id, { name: 'New Name' })
    // The point of the slug: a link written before the rename still resolves.
    expect(patched?.slug).toBe('old-name')
    expect((await getOutletByRef(workspaceId, 'old-name'))?.name).toBe('New Name')
  })

  it('replaces attributes wholesale', async () => {
    const created = await createOutlet(
      workspaceId,
      input({ name: 'Retagged', attributes: ['serves_alcohol', 'live_music'] }),
    )
    const patched = await updateOutlet(workspaceId, created.id, { attributes: ['takeaway'] })
    expect(patched?.attributes).toEqual(['takeaway'])
  })

  it('misses a patch aimed at another workspace, rather than writing across it', async () => {
    const created = await createOutlet(workspaceId, input({ name: 'Not Yours' }))
    expect(await updateOutlet(seededWorkspaceId, created.id, { status: 'open' })).toBeNull()
  })

  it('refuses a brand from another workspace, on create and on patch', async () => {
    const foreign = await createBrand({ workspaceId: seededWorkspaceId, name: 'Foreign brand' })
    createdBrands.push(foreign.id)

    await expect(
      createOutlet(workspaceId, input({ name: 'Cross Wired', brandId: foreign.id })),
    ).rejects.toBeInstanceOf(BrandNotInWorkspaceError)

    const created = await createOutlet(workspaceId, input({ name: 'Later Cross Wired' }))
    await expect(
      updateOutlet(workspaceId, created.id, { brandId: foreign.id }),
    ).rejects.toBeInstanceOf(BrandNotInWorkspaceError)
    // The create rolled back rather than leaving a row with no brand on it.
    expect(await getOutletByRef(workspaceId, 'cross-wired')).toBeNull()
  })

  it('keeps the outlet when its brand is deleted, and clears the link', async () => {
    const brand = await createBrand({ workspaceId, name: 'Doomed brand' })
    const created = await createOutlet(
      workspaceId,
      input({ name: 'Outlives Its Brand', brandId: brand.id }),
    )
    expect(created.brandId).toBe(brand.id)

    await deleteBrand(brand.id)

    // `ON DELETE SET NULL`, not cascade. A lease outlives its branding, and the
    // premises is the record the next brand gets attached to.
    const after = await getOutletByRef(workspaceId, created.id)
    expect(after).not.toBeNull()
    expect(after?.brandId).toBeNull()
  })

  it('deletes once, and reports the second attempt as a miss', async () => {
    const created = await createOutlet(workspaceId, input({ name: 'Typo Outlet' }))
    expect((await deleteOutlet(workspaceId, created.id))?.id).toBe(created.id)
    expect(await deleteOutlet(workspaceId, created.id)).toBeNull()
    expect(await getOutletByRef(workspaceId, created.id)).toBeNull()
  })

  it('will not delete across a workspace boundary', async () => {
    const created = await createOutlet(workspaceId, input({ name: 'Safe From Elsewhere' }))
    expect(await deleteOutlet(seededWorkspaceId, created.id as OutletId)).toBeNull()
    expect(await getOutletByRef(workspaceId, created.id)).not.toBeNull()
  })
})
