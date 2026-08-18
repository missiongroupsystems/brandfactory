import { CreateInfluencerInputSchema, InfluencerSchema, totalReach } from '@brandfactory/shared'
import type {
  BrandId,
  CreateInfluencerInput,
  Influencer,
  InfluencerAccount,
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
//   - The two unique keys — one of them now on `influencer_accounts` — and the
//     slug suffix that dodges the first.
//   - **The account list as a child collection**: positions written densely, a
//     patch replacing the whole list, and `ON DELETE CASCADE` taking the accounts
//     with the creator.
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
    // Cascades every influencer written below, their accounts and their link rows.
    await deleteWorkspace(workspaceId)
    await pool.end()
  })

  /**
   * One account, spread into whatever a case is actually about.
   *
   * Keys whose value is `undefined` are dropped rather than spread, so a caller
   * that passes an optional it never set — `input`'s destructured `platform`,
   * for instance — gets the default rather than an `undefined` the schema then
   * refuses.
   */
  function account(overrides: Partial<InfluencerAccount> = {}): InfluencerAccount {
    const set = Object.fromEntries(
      Object.entries(overrides).filter(([, value]) => value !== undefined),
    )
    return {
      platform: 'instagram',
      handle: 'somebody',
      followers: 12_000,
      engagementRate: null,
      url: null,
      ...set,
    }
  }

  /**
   * A create body. The four account fields are accepted at the top level and
   * folded into a single account, because most cases here are about one creator
   * with one account and say so more clearly that way. `accounts` overrides the
   * lot for the cases that are about the list itself.
   */
  function input({
    handle,
    platform,
    followers,
    engagementRate,
    accounts,
    ...rest
  }: Omit<Partial<CreateInfluencerInput>, 'accounts'> &
    Partial<InfluencerAccount> & {
      handle: string
      accounts?: InfluencerAccount[]
    }): CreateInfluencerInput {
    // Through the schema so `status`' default is applied exactly as a route would
    // apply it, rather than being written out a second time here.
    return CreateInfluencerInputSchema.parse({
      name: 'Somebody Creator',
      accounts: accounts ?? [account({ handle, platform, followers, engagementRate })],
      ...rest,
    })
  }

  /** The account a creator is known by — position 0. */
  function primary(creator: Influencer | null | undefined): InfluencerAccount | undefined {
    return creator?.accounts[0]
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
    // The slug comes from the **name** now, not from the handle.
    expect(created.slug).toBe('priya-nair')
    // **The trap.** The column is `numeric(5,2)` and pg hands back `'3.80'`; if
    // the mapper stopped converting, this would be the string and the screen
    // would read `3.80%` in a column of `3.8%`.
    expect(primary(created)?.engagementRate).toBe(3.8)
    expect(typeof primary(created)?.engagementRate).toBe('number')
    // Sorted, not in the order the body listed them, so two reads are identical.
    expect(created.brandIds).toEqual([brandA, brandB].sort((x, y) => x.localeCompare(y)))
  })

  it('writes three accounts and reads them back in the order they were sent', async () => {
    // The case the whole change exists for: one person, three platforms, one row
    // in the roster. Position 0 is the account they are known by, so the order is
    // a fact rather than a detail.
    const created = await createInfluencer(
      workspaceId,
      input({
        name: 'Three Places',
        handle: 'unused',
        accounts: [
          account({ platform: 'instagram', handle: 'threeplaces', followers: 60_000 }),
          account({ platform: 'tiktok', handle: 'threeplaces', followers: 50_000 }),
          account({
            platform: 'xiaohongshu',
            handle: '普莉娅',
            followers: 30_000,
            url: 'https://www.xiaohongshu.com/user/profile/6123',
          }),
        ],
      }),
    )

    expect(InfluencerSchema.safeParse(created).success).toBe(true)
    expect(created.accounts.map((a) => a.platform)).toEqual(['instagram', 'tiktok', 'xiaohongshu'])
    expect(totalReach(created.accounts)).toBe(140_000)
    // The one platform a handle does not resolve to a URL on.
    expect(created.accounts[2]?.url).toBe('https://www.xiaohongshu.com/user/profile/6123')
    // And it survives the read path as well as the write path.
    const read = await getInfluencerByRef(workspaceId, created.id)
    expect(read?.accounts.map((a) => a.handle)).toEqual(['threeplaces', 'threeplaces', '普莉娅'])
  })

  it('accepts two accounts on one platform with different handles', async () => {
    // Three Instagram accounts is a real creator, and the unique key permits it.
    const created = await createInfluencer(
      workspaceId,
      input({
        name: 'Two Grids',
        handle: 'unused',
        accounts: [
          account({ platform: 'instagram', handle: 'twogrids' }),
          account({ platform: 'instagram', handle: 'twogrids.archive' }),
        ],
      }),
    )
    expect(created.accounts).toHaveLength(2)
  })

  it('refuses one creator carrying the same pair twice, at the constraint', async () => {
    // `InfluencerAccountsSchema` catches this at the route boundary, so the body
    // below bypasses zod on purpose: this asserts the database refuses it too,
    // which is what makes the zod rule a better message rather than the only
    // defence.
    const body = {
      name: 'Doubled Up',
      accounts: [account({ handle: 'doubledup' }), account({ handle: 'doubledup' })],
      status: 'prospect',
    } as unknown as CreateInfluencerInput
    // **And it names nobody**, which is the honest answer: the pair collides with the row
    // this same body is writing, so no other creator holds it and the pre-flight read
    // correctly saw nothing. Naming `accounts[0]` here — what the three-field shape did —
    // would have blamed a creator who does not exist.
    await expect(createInfluencer(workspaceId, body)).rejects.toMatchObject({
      name: 'InfluencerHandleTakenError',
      holder: null,
    })
  })

  it('defaults the unset columns rather than leaving them undefined', async () => {
    const created = await createInfluencer(workspaceId, input({ handle: 'bareminimum' }))
    // A creator somebody has just entered is on a shortlist, not booked.
    expect(created.status).toBe('prospect')
    expect(primary(created)?.engagementRate).toBeNull()
    expect(primary(created)?.url).toBeNull()
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
    expect(primary(created)?.engagementRate).toBe(3.46)
  })

  it('suffixes a slug when two creators genuinely share a name', async () => {
    // The `-2` used to be the cost of slugging from the handle — one person on
    // two platforms. It is now the rarer case it should always have been.
    const first = await createInfluencer(
      workspaceId,
      input({ name: 'Same Name', handle: 'samename.one' }),
    )
    const second = await createInfluencer(
      workspaceId,
      input({ name: 'Same Name', handle: 'samename.two' }),
    )
    expect(first.slug).toBe('same-name')
    expect(second.slug).toBe('same-name-2')
  })

  it('refuses the same handle on the same platform for a second creator', async () => {
    // **Typed, not merely thrown.** `isHandleUniqueViolation` narrows on the
    // constraint *name*, so this is the test that fails if the index is ever
    // renamed — at which point the route would quietly go back to answering 500.
    // Only real Postgres carries that name.
    await createInfluencer(workspaceId, input({ handle: 'onlyonce', platform: 'youtube' }))
    await expect(
      createInfluencer(workspaceId, input({ handle: 'onlyonce', platform: 'youtube' })),
    ).rejects.toBeInstanceOf(InfluencerHandleTakenError)
  })

  it('names the pair and the creator who already holds it', async () => {
    // The message a person reads on a form. The holder's name is what the
    // pre-flight `SELECT` buys — the constraint alone can only say "taken".
    await createInfluencer(
      workspaceId,
      input({ name: 'Priya Raman', handle: 'namedpair', platform: 'facebook' }),
    )
    await expect(
      createInfluencer(workspaceId, input({ handle: 'namedpair', platform: 'facebook' })),
    ).rejects.toMatchObject({
      // **One object, not three fields.** The name, the handle and the platform all come
      // from the same pre-flight `SELECT`, so they are known together or not at all — and
      // when they were three nullable fields the call sites filled the gap with
      // `accounts[0]`, which named the wrong account for any creator holding more than one.
      holder: { name: 'Priya Raman', handle: 'namedpair', platform: 'facebook' },
    })
  })

  it('writes nothing when the handle is taken, links included', async () => {
    // The throw is inside the transaction, so the parent row and the brand gate's
    // work roll back with it. A duplicate must not leave a creator behind with no
    // accounts, or link rows for a row that does not exist.
    await createInfluencer(
      workspaceId,
      input({ name: 'Rolls Back', handle: 'rollsback', platform: 'linkedin', brandIds: [brandA] }),
    )
    await expect(
      createInfluencer(
        workspaceId,
        input({
          name: 'Rolls Back Twice',
          handle: 'rollsback',
          platform: 'linkedin',
          brandIds: [brandA, brandB],
        }),
      ),
    ).rejects.toBeInstanceOf(InfluencerHandleTakenError)
    // The original is untouched — one brand, not three, and not two rows.
    expect((await getInfluencerByRef(workspaceId, 'rolls-back'))?.brandIds).toEqual([brandA])
    expect(await getInfluencerByRef(workspaceId, 'rolls-back-twice')).toBeNull()
  })

  it('refuses a patch that moves an account onto an occupied pair', async () => {
    // Correcting a typo into somebody else's handle is the same mistake as
    // entering them twice.
    await createInfluencer(
      workspaceId,
      input({ name: 'Sitting Tenant', handle: 'sitting', platform: 'tiktok' }),
    )
    const mover = await createInfluencer(
      workspaceId,
      input({ name: 'Mover', handle: 'moving', platform: 'tiktok' }),
    )
    await expect(
      updateInfluencer(workspaceId, mover.id, {
        accounts: [account({ handle: 'sitting', platform: 'tiktok' })],
      }),
    ).rejects.toMatchObject({
      holder: { name: 'Sitting Tenant', handle: 'sitting', platform: 'tiktok' },
    })
  })

  it('lets a creator resubmit their own accounts unchanged', async () => {
    // The write is delete-then-insert inside one transaction, and the holder
    // pre-check excludes this creator's own rows. Without either, re-sending the
    // form's own values would refuse as a conflict with itself.
    const created = await createInfluencer(workspaceId, input({ handle: 'unchanged' }))
    const patched = await updateInfluencer(workspaceId, created.id, {
      accounts: [account({ handle: 'unchanged', followers: 22_000 })],
    })
    expect(primary(patched)?.followers).toBe(22_000)
  })

  it('replaces the whole account list, dropping the rows left out', async () => {
    const created = await createInfluencer(
      workspaceId,
      input({
        name: 'Shrinking Roster',
        handle: 'unused',
        accounts: [
          account({ platform: 'instagram', handle: 'shrinking' }),
          account({ platform: 'tiktok', handle: 'shrinking' }),
          account({ platform: 'youtube', handle: 'shrinking' }),
        ],
      }),
    )
    expect(created.accounts).toHaveLength(3)

    const patched = await updateInfluencer(workspaceId, created.id, {
      accounts: [account({ platform: 'tiktok', handle: 'shrinking', followers: 99_000 })],
    })
    expect(patched?.accounts).toHaveLength(1)
    expect(primary(patched)?.platform).toBe('tiktok')
    // Read back, not just returned: the delete has to have reached the table.
    expect((await getInfluencerByRef(workspaceId, created.id))?.accounts).toHaveLength(1)
  })

  it('reorders the accounts on a patch, because position 0 is a fact', async () => {
    const created = await createInfluencer(
      workspaceId,
      input({
        name: 'Reordered',
        handle: 'unused',
        accounts: [
          account({ platform: 'instagram', handle: 'reordered' }),
          account({ platform: 'tiktok', handle: 'reordered' }),
        ],
      }),
    )
    const patched = await updateInfluencer(workspaceId, created.id, {
      accounts: [
        account({ platform: 'tiktok', handle: 'reordered' }),
        account({ platform: 'instagram', handle: 'reordered' }),
      ],
    })
    expect(patched?.accounts.map((a) => a.platform)).toEqual(['tiktok', 'instagram'])
  })

  it('leaves the accounts alone on a patch that does not name them', async () => {
    const created = await createInfluencer(workspaceId, input({ handle: 'keepsaccounts' }))
    const patched = await updateInfluencer(workspaceId, created.id, { notes: 'Called them' })
    expect(patched?.accounts).toHaveLength(1)
    expect(primary(patched)?.handle).toBe('keepsaccounts')
  })

  it('resolves by slug or by id, and only inside the workspace', async () => {
    const created = await createInfluencer(
      workspaceId,
      input({ name: 'Findable Person', handle: 'findable' }),
    )

    expect((await getInfluencerByRef(workspaceId, 'findable-person'))?.id).toBe(created.id)
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

  it('lists a workspace biggest total reach first, with the name breaking a tie', async () => {
    const scratch = await createWorkspace({ name: 'Reach order workspace', ownerUserId })
    try {
      await createInfluencer(scratch.id, input({ name: 'Small', handle: 'small', followers: 900 }))
      await createInfluencer(
        scratch.id,
        input({ name: 'Huge', handle: 'huge', followers: 2_000_000 }),
      )
      await createInfluencer(scratch.id, input({ name: 'Zoe', handle: 'zoe', followers: 10_000 }))
      await createInfluencer(scratch.id, input({ name: 'Adam', handle: 'adam', followers: 10_000 }))

      const rows = await listInfluencersByWorkspace(scratch.id)
      expect(rows.map((r) => r.name)).toEqual(['Huge', 'Adam', 'Zoe', 'Small'])
    } finally {
      await deleteWorkspace(scratch.id)
    }
  })

  it('orders a multi-account creator by their total, not by their largest account', async () => {
    // The defect that started this change: three accounts of 60k, 50k and 30k is
    // a bigger creator than one account of 100k, and the old `ORDER BY followers`
    // could not say so. The sort is in JavaScript now, over the assembled array.
    const scratch = await createWorkspace({ name: 'Total reach workspace', ownerUserId })
    try {
      await createInfluencer(
        scratch.id,
        input({ name: 'Single', handle: 'single', followers: 100_000 }),
      )
      await createInfluencer(
        scratch.id,
        input({
          name: 'Multi',
          handle: 'unused',
          accounts: [
            account({ platform: 'instagram', handle: 'multi', followers: 60_000 }),
            account({ platform: 'tiktok', handle: 'multi', followers: 50_000 }),
            account({ platform: 'xiaohongshu', handle: 'multi', followers: 30_000 }),
          ],
        }),
      )

      const rows = await listInfluencersByWorkspace(scratch.id)
      expect(rows.map((r) => r.name)).toEqual(['Multi', 'Single'])
      expect(rows.map((r) => totalReach(r.accounts))).toEqual([140_000, 100_000])
    } finally {
      await deleteWorkspace(scratch.id)
    }
  })

  it('lists the accounts and the brand links per row, not smeared across the set', async () => {
    // The three-query-plus-two-map read. A grouping bug here shows as one creator
    // carrying another's accounts, which nothing on screen would flag.
    const scratch = await createWorkspace({ name: 'Child row grouping workspace', ownerUserId })
    try {
      const brand = await createBrand({ workspaceId: scratch.id, name: 'Only brand' })
      await createInfluencer(
        scratch.id,
        input({
          name: 'Linked',
          handle: 'unused',
          brandIds: [brand.id],
          accounts: [
            account({ platform: 'instagram', handle: 'linked', followers: 5_000 }),
            account({ platform: 'tiktok', handle: 'linked', followers: 4_000 }),
          ],
        }),
      )
      await createInfluencer(
        scratch.id,
        input({ name: 'Unlinked', handle: 'unlinked', followers: 1_000 }),
      )

      const rows = await listInfluencersByWorkspace(scratch.id)
      expect(rows.map((r) => [r.name, r.accounts.length, r.brandIds])).toEqual([
        ['Linked', 2, [brand.id]],
        ['Unlinked', 1, []],
      ])
    } finally {
      await deleteWorkspace(scratch.id)
    }
  })

  it('patches only the keys it is given, and clears on an explicit null', async () => {
    const created = await createInfluencer(
      workspaceId,
      input({ handle: 'patchable', vertical: 'beauty', notes: 'Keep me' }),
    )

    const patched = await updateInfluencer(workspaceId, created.id, { vertical: null })
    expect(patched?.vertical).toBeNull()
    expect(patched?.notes).toBe('Keep me')
    expect(primary(patched)?.followers).toBe(12_000)
  })

  it('leaves the slug alone when the name changes', async () => {
    const created = await createInfluencer(
      workspaceId,
      input({ name: 'Old Name', handle: 'oldname' }),
    )
    const patched = await updateInfluencer(workspaceId, created.id, { name: 'New Name' })
    // The point of the slug: a link written before the correction still resolves.
    expect(patched?.slug).toBe('old-name')
    expect((await getInfluencerByRef(workspaceId, 'old-name'))?.name).toBe('New Name')
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
      createInfluencer(
        workspaceId,
        input({ name: 'Crosswired', handle: 'crosswired', brandIds: [foreign.id] }),
      ),
    ).rejects.toBeInstanceOf(BrandNotInWorkspaceError)

    const created = await createInfluencer(
      workspaceId,
      input({ name: 'Later Crosswired', handle: 'latercrosswired' }),
    )
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

  it('deletes once, taking the accounts with it, and reports the second as a miss', async () => {
    const created = await createInfluencer(
      workspaceId,
      input({
        name: 'Typo Creator',
        handle: 'unused',
        brandIds: [brandA],
        accounts: [
          account({ platform: 'instagram', handle: 'typocreator' }),
          account({ platform: 'tiktok', handle: 'typocreator' }),
        ],
      }),
    )
    const deleted = await deleteInfluencer(workspaceId, created.id)
    // The last copy anything will see, so it carries both child collections.
    expect(deleted?.id).toBe(created.id)
    expect(deleted?.brandIds).toEqual([brandA])
    expect(deleted?.accounts).toHaveLength(2)

    expect(await deleteInfluencer(workspaceId, created.id)).toBeNull()
    expect(await getInfluencerByRef(workspaceId, created.id)).toBeNull()

    // The accounts went with the creator by cascade — so the pair is free again,
    // which is the observable half of `ON DELETE CASCADE` here.
    const reused = await createInfluencer(
      workspaceId,
      input({ name: 'Reuser', handle: 'typocreator', platform: 'instagram' }),
    )
    expect(primary(reused)?.handle).toBe('typocreator')
  })

  it('will not delete across a workspace boundary', async () => {
    const created = await createInfluencer(workspaceId, input({ handle: 'safefromelsewhere' }))
    expect(await deleteInfluencer(seededWorkspaceId, created.id as InfluencerId)).toBeNull()
    expect(await getInfluencerByRef(workspaceId, created.id)).not.toBeNull()
  })
})
