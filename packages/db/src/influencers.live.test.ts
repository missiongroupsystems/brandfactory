import { CreateInfluencerInputSchema, InfluencerSchema } from '@brandfactory/shared'
import type {
  BrandId,
  CreateInfluencerInput,
  InfluencerId,
  UserId,
  WorkspaceId,
} from '@brandfactory/shared'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { pool } from './client'
import { createBrand, deleteBrand } from './queries/brands'
import {
  createInfluencer,
  deleteInfluencer,
  getInfluencerByRef,
  InfluencerHandleTakenError,
  listInfluencersByWorkspace,
  updateInfluencer,
} from './queries/influencers'
import { BrandNotInWorkspaceError } from './queries/outlets'
import { createWorkspace, deleteWorkspace } from './queries/workspaces'
import { seed } from './seed'

// Live-DB test — only runs when DATABASE_URL is set, matching the other
// `*.live.test.ts` files, and its own file for the same reason as theirs: each
// owns the `pg` pool for its worker and ends it in `afterAll`.
//
// What is only provable against real Postgres here:
//
//   - **`numeric` round-tripping as a number.** The driver returns
//     `engagement_rate` as the string `'3.80'`; nothing in a unit test can prove
//     the mapper is on that path, because a hand-written row is whatever the test
//     typed. This is the one risk the plan named twice.
//   - The two unique keys, and the slug suffix that dodges the first one.
//   - `ON DELETE CASCADE` on `influencer_brands.brand_id` — a deleted brand must
//     take the **link** and leave the creator.
//   - `brandIds` coming back sorted, from both the list and the detail read.
//   - The workspace scoping that makes `getInfluencerByRef` an access gate rather
//     than a convenience.
const hasDb = !!process.env.DATABASE_URL

describe.skipIf(!hasDb)('influencers (live DB)', () => {
  let seededWorkspaceId: WorkspaceId
  let workspaceId: WorkspaceId
  let ownerUserId: UserId
  let brandA: BrandId
  let brandB: BrandId
  const createdBrands: BrandId[] = []

  beforeAll(async () => {
    const ids = await seed()
    seededWorkspaceId = ids.workspaceId as WorkspaceId
    ownerUserId = ids.userId as UserId
    // Every write below lands in a workspace of its own. `seed.test.ts` asserts
    // exact counts against the demo workspace, so nothing may add a row to it.
    const scratch = await createWorkspace({
      name: 'Influencer round-trip scratch workspace',
      ownerUserId,
    })
    workspaceId = scratch.id

    const a = await createBrand({ workspaceId, name: 'Scratch brand A' })
    const b = await createBrand({ workspaceId, name: 'Scratch brand B' })
    brandA = a.id
    brandB = b.id
    createdBrands.push(a.id, b.id)
  })

  afterAll(async () => {
    for (const id of createdBrands) await deleteBrand(id)
    // Cascades every influencer written below, and their link rows with them.
    await deleteWorkspace(workspaceId)
    await pool.end()
  })

  function input(
    overrides: Partial<CreateInfluencerInput> & { handle: string },
  ): CreateInfluencerInput {
    // Through the schema so `status`' default is applied exactly as a route would
    // apply it, rather than being written out a second time here.
    return CreateInfluencerInputSchema.parse({
      name: 'Somebody Creator',
      platform: 'instagram',
      followers: 12_000,
      ...overrides,
    })
  }

  it('round-trips a full record, and the response satisfies the wire schema', async () => {
    const created = await createInfluencer(
      workspaceId,
      input({
        name: 'Priya Nair',
        handle: 'priyaskin',
        platform: 'instagram',
        followers: 124_000,
        engagementRate: 3.8,
        vertical: 'beauty',
        status: 'active',
        brandIds: [brandB, brandA],
        notes: 'Two-post minimum.',
      }),
    )

    expect(InfluencerSchema.safeParse(created).success).toBe(true)
    expect(created.slug).toBe('priyaskin')
    // **The trap.** The column is `numeric(5,2)` and pg hands back `'3.80'`; if
    // the mapper stopped converting, this would be the string and the screen
    // would read `3.80%` in a column of `3.8%`.
    expect(created.engagementRate).toBe(3.8)
    expect(typeof created.engagementRate).toBe('number')
    // Sorted, not in the order the body listed them, so two reads are identical.
    expect(created.brandIds).toEqual([brandA, brandB].sort((x, y) => x.localeCompare(y)))
  })

  it('defaults the unset columns rather than leaving them undefined', async () => {
    const created = await createInfluencer(workspaceId, input({ handle: 'bareminimum' }))
    // A creator somebody has just entered is on a shortlist, not booked.
    expect(created.status).toBe('prospect')
    expect(created.engagementRate).toBeNull()
    expect(created.vertical).toBeNull()
    expect(created.notes).toBeNull()
    // Empty is a fact — "not engaged yet" — and it is an array, never undefined.
    expect(created.brandIds).toEqual([])
  })

  it('rounds an over-precise rate to the column scale rather than refusing it', async () => {
    // `numeric(5,2)`. A measurement is an estimate, so the third decimal is lost
    // on write instead of the figure being lost altogether.
    const created = await createInfluencer(
      workspaceId,
      input({ handle: 'overprecise', engagementRate: 3.456 }),
    )
    expect(created.engagementRate).toBe(3.46)
  })

  it('suffixes a slug that is already taken in the workspace', async () => {
    // The known cost of slugging from the handle: one person on two platforms.
    const first = await createInfluencer(
      workspaceId,
      input({ handle: 'twiceover', platform: 'instagram' }),
    )
    const second = await createInfluencer(
      workspaceId,
      input({ handle: 'twiceover', platform: 'tiktok' }),
    )
    expect(first.slug).toBe('twiceover')
    expect(second.slug).toBe('twiceover-2')
  })

  it('refuses the same handle twice on one platform, by name', async () => {
    // One row per creator per platform. The same handle on one platform is a
    // duplicate import, not a second creator.
    //
    // **Typed, not merely thrown.** `isHandleUniqueViolation` narrows on the
    // constraint *name*, so this is the test that fails if the index is ever
    // renamed — at which point the route would quietly go back to answering 500.
    // Only real Postgres carries that name.
    await createInfluencer(workspaceId, input({ handle: 'onlyonce', platform: 'youtube' }))
    await expect(
      createInfluencer(workspaceId, input({ handle: 'onlyonce', platform: 'youtube' })),
    ).rejects.toBeInstanceOf(InfluencerHandleTakenError)
  })

  it('names the pair it refused, because a person reads it on a form', async () => {
    await createInfluencer(workspaceId, input({ handle: 'namedpair', platform: 'facebook' }))
    await expect(
      createInfluencer(workspaceId, input({ handle: 'namedpair', platform: 'facebook' })),
    ).rejects.toMatchObject({ handle: 'namedpair', platform: 'facebook' })
  })

  it('writes nothing when the handle is taken, links included', async () => {
    // The throw is inside the transaction, so the brand gate's work rolls back
    // with it. A duplicate must not leave link rows behind for a row that does
    // not exist.
    await createInfluencer(
      workspaceId,
      input({ handle: 'rollsback', platform: 'linkedin', brandIds: [brandA] }),
    )
    await expect(
      createInfluencer(
        workspaceId,
        input({ handle: 'rollsback', platform: 'linkedin', brandIds: [brandA, brandB] }),
      ),
    ).rejects.toBeInstanceOf(InfluencerHandleTakenError)
    // The original is untouched — one brand, not three, and not two rows.
    expect((await getInfluencerByRef(workspaceId, 'rollsback'))?.brandIds).toEqual([brandA])
  })

  it('refuses a patch that moves a handle onto an occupied pair', async () => {
    // Correcting a typo into somebody else's handle is the same mistake as
    // entering them twice.
    await createInfluencer(workspaceId, input({ handle: 'sitting', platform: 'tiktok' }))
    const mover = await createInfluencer(
      workspaceId,
      input({ handle: 'moving', platform: 'tiktok' }),
    )
    await expect(
      updateInfluencer(workspaceId, mover.id, { handle: 'sitting' }),
    ).rejects.toBeInstanceOf(InfluencerHandleTakenError)
  })

  it('refuses a patch that moves only the platform onto an occupied pair', async () => {
    // The key is the pair, so the error has to name the half the patch left
    // alone — which is why `updateInfluencer` reads the row before it writes.
    await createInfluencer(workspaceId, input({ handle: 'twoplaces', platform: 'instagram' }))
    const other = await createInfluencer(
      workspaceId,
      input({ handle: 'twoplaces', platform: 'youtube' }),
    )
    await expect(
      updateInfluencer(workspaceId, other.id, { platform: 'instagram' }),
    ).rejects.toMatchObject({ handle: 'twoplaces', platform: 'instagram' })
  })

  it('lets a creator keep their own handle through a patch', async () => {
    // The row is compared against itself here, so re-sending the form's own
    // values must not refuse. Postgres excludes the row being updated on its
    // own; this pins that it does.
    const created = await createInfluencer(workspaceId, input({ handle: 'unchanged' }))
    const patched = await updateInfluencer(workspaceId, created.id, {
      handle: 'unchanged',
      platform: 'instagram',
      followers: 22_000,
    })
    expect(patched?.followers).toBe(22_000)
  })

  it('resolves by slug or by id, and only inside the workspace', async () => {
    const created = await createInfluencer(workspaceId, input({ handle: 'findable' }))

    expect((await getInfluencerByRef(workspaceId, 'findable'))?.id).toBe(created.id)
    expect((await getInfluencerByRef(workspaceId, created.id))?.id).toBe(created.id)
    // The access gate: the same id from the seeded workspace misses.
    expect(await getInfluencerByRef(seededWorkspaceId, created.id)).toBeNull()
  })

  it('answers null for a ref that is neither a slug nor a uuid', async () => {
    // The branch that exists so Postgres is never handed a non-uuid string to
    // compare against a `uuid` column — that raises, and a 500 is the wrong
    // answer to "no such creator".
    expect(await getInfluencerByRef(workspaceId, 'no-such-creator')).toBeNull()
    expect(await getInfluencerByRef(workspaceId, 'not a uuid at all')).toBeNull()
  })

  it('lists a workspace biggest reach first, with the name breaking a tie', async () => {
    const scratch = await createWorkspace({
      name: 'Reach order workspace',
      ownerUserId,
    })
    try {
      await createInfluencer(scratch.id, input({ handle: 'small', followers: 900 }))
      await createInfluencer(scratch.id, input({ handle: 'huge', followers: 2_000_000 }))
      await createInfluencer(scratch.id, input({ handle: 'zoe', name: 'Zoe', followers: 10_000 }))
      await createInfluencer(scratch.id, input({ handle: 'adam', name: 'Adam', followers: 10_000 }))

      const rows = await listInfluencersByWorkspace(scratch.id)
      expect(rows.map((r) => r.handle)).toEqual(['huge', 'adam', 'zoe', 'small'])
    } finally {
      await deleteWorkspace(scratch.id)
    }
  })

  it('lists the brand links per row, not smeared across the set', async () => {
    // The two-query-plus-map read. A grouping bug here shows as one creator
    // carrying another's brands, which nothing on screen would flag.
    const scratch = await createWorkspace({
      name: 'Brand link grouping workspace',
      ownerUserId,
    })
    try {
      const brand = await createBrand({ workspaceId: scratch.id, name: 'Only brand' })
      await createInfluencer(
        scratch.id,
        input({ handle: 'linked', followers: 5_000, brandIds: [brand.id] }),
      )
      await createInfluencer(scratch.id, input({ handle: 'unlinked', followers: 4_000 }))

      const rows = await listInfluencersByWorkspace(scratch.id)
      expect(rows.map((r) => [r.handle, r.brandIds])).toEqual([
        ['linked', [brand.id]],
        ['unlinked', []],
      ])
    } finally {
      await deleteWorkspace(scratch.id)
    }
  })

  it('patches only the keys it is given, and clears on an explicit null', async () => {
    const created = await createInfluencer(
      workspaceId,
      input({ handle: 'patchable', engagementRate: 4.2, notes: 'Keep me' }),
    )

    const patched = await updateInfluencer(workspaceId, created.id, { engagementRate: null })
    expect(patched?.engagementRate).toBeNull()
    expect(patched?.notes).toBe('Keep me')
    expect(patched?.followers).toBe(12_000)
  })

  it('leaves the slug alone when the handle changes', async () => {
    const created = await createInfluencer(workspaceId, input({ handle: 'oldhandle' }))
    const patched = await updateInfluencer(workspaceId, created.id, { handle: 'newhandle' })
    // The point of the slug: a link written before the correction still resolves.
    expect(patched?.slug).toBe('oldhandle')
    expect((await getInfluencerByRef(workspaceId, 'oldhandle'))?.handle).toBe('newhandle')
  })

  it('replaces brandIds wholesale, and clears them on an empty array', async () => {
    const created = await createInfluencer(
      workspaceId,
      input({ handle: 'retagged', brandIds: [brandA] }),
    )
    expect(
      (await updateInfluencer(workspaceId, created.id, { brandIds: [brandB] }))?.brandIds,
    ).toEqual([brandB])
    // An empty array is a write — "no longer engaged for anything" — not an
    // omission, so it must actually delete the link rows.
    expect((await updateInfluencer(workspaceId, created.id, { brandIds: [] }))?.brandIds).toEqual(
      [],
    )
  })

  it('leaves the brand links alone on a patch that does not name them', async () => {
    const created = await createInfluencer(
      workspaceId,
      input({ handle: 'keepslinks', brandIds: [brandA] }),
    )
    const patched = await updateInfluencer(workspaceId, created.id, { status: 'active' })
    expect(patched?.brandIds).toEqual([brandA])
  })

  it('misses a patch aimed at another workspace, rather than writing across it', async () => {
    const created = await createInfluencer(workspaceId, input({ handle: 'notyours' }))
    expect(await updateInfluencer(seededWorkspaceId, created.id, { status: 'active' })).toBeNull()
  })

  it('refuses a brand from another workspace, on create and on patch', async () => {
    const foreign = await createBrand({ workspaceId: seededWorkspaceId, name: 'Foreign brand' })
    createdBrands.push(foreign.id)

    await expect(
      createInfluencer(workspaceId, input({ handle: 'crosswired', brandIds: [foreign.id] })),
    ).rejects.toBeInstanceOf(BrandNotInWorkspaceError)

    const created = await createInfluencer(workspaceId, input({ handle: 'latercrosswired' }))
    await expect(
      updateInfluencer(workspaceId, created.id, { brandIds: [brandA, foreign.id] }),
    ).rejects.toBeInstanceOf(BrandNotInWorkspaceError)

    // The create rolled back rather than leaving a creator with no brands on them.
    expect(await getInfluencerByRef(workspaceId, 'crosswired')).toBeNull()
    // And the patch rolled back rather than leaving the valid half written.
    expect((await getInfluencerByRef(workspaceId, created.id))?.brandIds).toEqual([])
  })

  it('keeps the creator when their brand is deleted, and drops the link', async () => {
    const brand = await createBrand({ workspaceId, name: 'Doomed brand' })
    const created = await createInfluencer(
      workspaceId,
      input({ handle: 'outliveshisbrand', brandIds: [brand.id] }),
    )
    expect(created.brandIds).toEqual([brand.id])

    await deleteBrand(brand.id)

    // `ON DELETE CASCADE` on the **link**, which is the many-to-many equivalent of
    // the `SET NULL` outlets chose: the relationship outlives the branding.
    const after = await getInfluencerByRef(workspaceId, created.id)
    expect(after).not.toBeNull()
    expect(after?.brandIds).toEqual([])
  })

  it('deletes once, and reports the second attempt as a miss', async () => {
    const created = await createInfluencer(
      workspaceId,
      input({ handle: 'typocreator', brandIds: [brandA] }),
    )
    const deleted = await deleteInfluencer(workspaceId, created.id)
    // The last copy anything will see, so it carries the brand ids too.
    expect(deleted?.id).toBe(created.id)
    expect(deleted?.brandIds).toEqual([brandA])

    expect(await deleteInfluencer(workspaceId, created.id)).toBeNull()
    expect(await getInfluencerByRef(workspaceId, created.id)).toBeNull()
  })

  it('will not delete across a workspace boundary', async () => {
    const created = await createInfluencer(workspaceId, input({ handle: 'safefromelsewhere' }))
    expect(await deleteInfluencer(seededWorkspaceId, created.id as InfluencerId)).toBeNull()
    expect(await getInfluencerByRef(workspaceId, created.id)).not.toBeNull()
  })
})
