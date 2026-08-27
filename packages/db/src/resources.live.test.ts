import { CreateBrandResourceInputSchema } from '@brandfactory/shared'
import type { BrandId, CreateBrandResourceInput, UserId, WorkspaceId } from '@brandfactory/shared'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { pool } from './client'
import { createBrand, deleteBrand } from './queries/brands'
import {
  createResource,
  deleteResource,
  listResourcesByBrand,
  updateResource,
} from './queries/resources'
import { createWorkspace, deleteWorkspace } from './queries/workspaces'
import { seed } from './seed'

// Live-DB test — only runs when DATABASE_URL is set, matching the other
// `*.live.test.ts` files, and its own file for the same reason as theirs: it
// owns the `pg` pool for its worker and ends it in `afterAll`.
//
// What is only provable against real Postgres here: the `brand_id` cascade —
// deleting the brand row must take its resources with it rather than raise a
// foreign key violation — and that a patch or a delete scoped to the wrong
// brand misses rather than reaching across the boundary.
const hasDb = !!process.env.DATABASE_URL

describe.skipIf(!hasDb)('brand resources (live DB)', () => {
  let workspaceId: WorkspaceId
  let brandId: BrandId

  beforeAll(async () => {
    const ids = await seed()
    const scratch = await createWorkspace({
      name: 'Resources round-trip scratch workspace',
      ownerUserId: ids.userId as UserId,
    })
    workspaceId = scratch.id
    const brand = await createBrand({ workspaceId, name: 'Resources Scratch Brand' })
    brandId = brand.id
  })

  afterAll(async () => {
    // Cascades every brand (and every resource on it) written below.
    await deleteWorkspace(workspaceId)
    await pool.end()
  })

  function input(overrides: Partial<CreateBrandResourceInput> & { title: string }) {
    // Through the schema so a caller gets exactly what a route would send —
    // the same idiom `outlets.live.test.ts`'s `input` helper uses.
    return CreateBrandResourceInputSchema.parse({
      type: 'font',
      url: 'https://klim.co.nz',
      note: null,
      ...overrides,
    })
  }

  it('round-trips a resource', async () => {
    const created = await createResource(
      brandId,
      input({ title: 'Klim Type Foundry', type: 'font', note: 'Buy the licence here' }),
    )
    expect(created.brandId).toBe(brandId)
    expect(created.type).toBe('font')
    expect(created.title).toBe('Klim Type Foundry')
    expect(created.url).toBe('https://klim.co.nz')
    expect(created.note).toBe('Buy the licence here')
  })

  it('lists a brand grouped by type, then title', async () => {
    const scratchBrand = await createBrand({ workspaceId, name: 'Listing Scratch Brand' })
    await createResource(scratchBrand.id, input({ title: 'Unsplash', type: 'image' }))
    await createResource(scratchBrand.id, input({ title: 'Klim', type: 'font' }))
    await createResource(scratchBrand.id, input({ title: 'Adobe Fonts', type: 'font' }))

    const rows = await listResourcesByBrand(scratchBrand.id)
    expect(rows.map((r) => [r.type, r.title])).toEqual([
      ['font', 'Adobe Fonts'],
      ['font', 'Klim'],
      ['image', 'Unsplash'],
    ])
  })

  it('patches only the keys it is given, and clears note on an explicit null', async () => {
    const created = await createResource(
      brandId,
      input({ title: 'Patchable', note: 'Keep me for now' }),
    )

    const patched = await updateResource(brandId, created.id, { title: 'Patched Title' })
    expect(patched?.title).toBe('Patched Title')
    expect(patched?.note).toBe('Keep me for now')

    const cleared = await updateResource(brandId, created.id, { note: null })
    expect(cleared?.note).toBeNull()
    expect(cleared?.title).toBe('Patched Title')
  })

  it('misses a patch or a delete aimed at another brand, rather than writing across it', async () => {
    const foreignBrand = await createBrand({ workspaceId, name: 'Foreign Brand' })
    const created = await createResource(brandId, input({ title: 'Not Yours' }))

    expect(await updateResource(foreignBrand.id, created.id, { title: 'Hijacked' })).toBeNull()
    expect(await deleteResource(foreignBrand.id, created.id)).toBeNull()

    // Untouched by either cross-brand attempt.
    const stillThere = await listResourcesByBrand(brandId)
    expect(stillThere.find((r) => r.id === created.id)?.title).toBe('Not Yours')
  })

  it('deletes once, and reports the second attempt as a miss', async () => {
    const created = await createResource(brandId, input({ title: 'Typo Resource' }))
    expect((await deleteResource(brandId, created.id))?.id).toBe(created.id)
    expect(await deleteResource(brandId, created.id)).toBeNull()
  })

  it('takes its resources with the brand', async () => {
    const doomed = await createBrand({ workspaceId, name: 'Doomed Brand' })
    const first = await createResource(doomed.id, input({ title: 'Font Shop' }))
    const second = await createResource(doomed.id, input({ title: 'Icon Set', type: 'icon' }))
    expect(await listResourcesByBrand(doomed.id)).toHaveLength(2)

    // The FK is the thing under test, not the query helper: without
    // `onDelete: 'cascade'` this delete raises a foreign key violation instead
    // of succeeding, because two resource rows still reference the brand.
    await deleteBrand(doomed.id)

    const after = await listResourcesByBrand(doomed.id)
    expect(after).toHaveLength(0)
    expect(after.find((r) => r.id === first.id || r.id === second.id)).toBeUndefined()
  })
})
