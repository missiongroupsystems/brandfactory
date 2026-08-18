import { CreateVendorInputSchema, VendorSchema } from '@brandfactory/shared'
import type {
  BrandId,
  CreateVendorInput,
  UserId,
  VendorContact,
  VendorId,
  WorkspaceId,
} from '@brandfactory/shared'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db, pool } from './client'
import { createBrand, deleteBrand } from './queries/brands'
import { BrandNotInWorkspaceError } from './queries/outlets'
import {
  createVendor,
  deleteVendor,
  getVendorByRef,
  listVendorsByWorkspace,
  updateVendor,
  VendorUenTakenError,
} from './queries/vendors'
import { createWorkspace, deleteWorkspace } from './queries/workspaces'
import { vendorContacts } from './schema'
import { seed } from './seed'

// Live-DB test — only runs when DATABASE_URL is set, matching the other
// `*.live.test.ts` files, and its own file for the same reason as theirs: each
// owns the `pg` pool for its worker and ends it in `afterAll`.
//
// What is only provable against real Postgres here:
//
//   - **`unique (workspace_id, uen)` on data that is mostly NULL.** Postgres
//     treats NULLs as distinct, which is the entire reason no partial index is
//     needed — and it is untestable through the screen, because almost nothing
//     carries a UEN. The plan named this risk and asked for the test first.
//   - The 409's narrowing on the **constraint name**. Only real Postgres puts
//     that name on the error, so this is the test that fails if the index is ever
//     renamed — at which point the route would quietly go back to answering 500.
//   - The slug suffix, on a `name` column that is deliberately not unique.
//   - `ON DELETE CASCADE` on `vendor_brands.brand_id` — a deleted brand must take
//     the **link** and leave the vendor — and on `vendor_contacts.vendor_id`.
//   - `brandIds` sorted and `contacts` in `position` order, from both reads.
//   - The workspace scoping that makes `getVendorByRef` an access gate rather
//     than a convenience.
const hasDb = !!process.env.DATABASE_URL

describe.skipIf(!hasDb)('vendors (live DB)', () => {
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
      name: 'Vendor round-trip scratch workspace',
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
    // Cascades every vendor written below, and their link and contact rows.
    await deleteWorkspace(workspaceId)
    await pool.end()
  })

  function input(overrides: Partial<CreateVendorInput> & { name: string }): CreateVendorInput {
    // Through the schema so `status`' default is applied exactly as a route would
    // apply it, rather than being written out a second time here.
    return CreateVendorInputSchema.parse(overrides)
  }

  function contact(overrides: Partial<VendorContact> & { name: string }): VendorContact {
    return { role: null, email: null, phone: null, isPrimary: false, ...overrides }
  }

  it('round-trips a full record, and the response satisfies the wire schema', async () => {
    const created = await createVendor(
      workspaceId,
      input({
        name: 'Northlight Talent',
        category: 'talent_agency',
        status: 'active',
        uen: '201812345K',
        website: 'https://northlight.sg',
        brandIds: [brandB, brandA],
        contacts: [
          contact({
            name: 'Mei Tan',
            role: 'Account director',
            email: 'mei@northlight.sg',
            isPrimary: true,
          }),
          contact({ name: 'Raj Kumar', phone: '+65 9123 4567' }),
        ],
        notes: 'Two-week booking lead time.',
      }),
    )

    expect(VendorSchema.safeParse(created).success).toBe(true)
    expect(created.slug).toBe('northlight-talent')
    // Sorted, not in the order the body listed them, so two reads are identical.
    expect(created.brandIds).toEqual([brandA, brandB].sort((x, y) => x.localeCompare(y)))
    // **Not** sorted, unlike the brands beside them: the contacts are a list
    // somebody arranged, and `position` is that arrangement.
    expect(created.contacts.map((c) => c.name)).toEqual(['Mei Tan', 'Raj Kumar'])
    expect(created.contacts[0]?.isPrimary).toBe(true)
  })

  it('defaults the unset columns rather than leaving them undefined', async () => {
    // A company you have just heard of has a name and nothing else confirmed.
    const created = await createVendor(workspaceId, input({ name: 'Bare Minimum Co' }))
    // A vendor somebody enters is one the business is already buying from.
    expect(created.status).toBe('active')
    expect(created.category).toBeNull()
    expect(created.uen).toBeNull()
    expect(created.website).toBeNull()
    expect(created.notes).toBeNull()
    // Empty is a fact — "not assigned yet", "nobody named yet" — and both are
    // arrays, never undefined.
    expect(created.brandIds).toEqual([])
    expect(created.contacts).toEqual([])
  })

  it('lets many rows carry no UEN at all, because Postgres treats NULLs as distinct', async () => {
    // **The property the unique index rests on**, and the one the screen can
    // never exercise: almost nothing carries a UEN, so a naive unique index would
    // have to be partial. It does not, and this is the proof.
    const scratch = await createWorkspace({ name: 'Null UEN workspace', ownerUserId })
    try {
      await createVendor(scratch.id, input({ name: 'No paperwork one' }))
      await createVendor(scratch.id, input({ name: 'No paperwork two' }))
      await createVendor(scratch.id, input({ name: 'No paperwork three', uen: null }))
      expect((await listVendorsByWorkspace(scratch.id)).map((v) => v.uen)).toEqual([
        null,
        null,
        null,
      ])
    } finally {
      await deleteWorkspace(scratch.id)
    }
  })

  it('refuses the same UEN twice in one workspace, by name', async () => {
    // **Typed, not merely thrown.** `isUenUniqueViolation` narrows on the
    // constraint *name*, so this is the test that fails if the index is ever
    // renamed. Only real Postgres carries that name.
    await createVendor(workspaceId, input({ name: 'Registered once', uen: 'T05LL1103N' }))
    await expect(
      createVendor(workspaceId, input({ name: 'Registered again', uen: 'T05LL1103N' })),
    ).rejects.toBeInstanceOf(VendorUenTakenError)
  })

  it('names the UEN it refused, because a person reads it on a form', async () => {
    await createVendor(workspaceId, input({ name: 'Named UEN one', uen: '199912345A' }))
    await expect(
      createVendor(workspaceId, input({ name: 'Named UEN two', uen: '199912345A' })),
    ).rejects.toMatchObject({ uen: '199912345A' })
  })

  it('lets the same UEN exist in another workspace', async () => {
    // The key is `(workspace_id, uen)`. Two workspaces are two books.
    const scratch = await createWorkspace({ name: 'Second book workspace', ownerUserId })
    try {
      await createVendor(workspaceId, input({ name: 'Shared registration', uen: '200011111B' }))
      const elsewhere = await createVendor(
        scratch.id,
        input({ name: 'Shared registration', uen: '200011111B' }),
      )
      expect(elsewhere.uen).toBe('200011111B')
    } finally {
      await deleteWorkspace(scratch.id)
    }
  })

  it('writes nothing when the UEN is taken, links and contacts included', async () => {
    // The throw is inside the transaction, so the brand gate's work rolls back
    // with it. A duplicate must not leave child rows behind for a row that does
    // not exist.
    await createVendor(
      workspaceId,
      input({ name: 'Rolls back first', uen: '201700001C', brandIds: [brandA] }),
    )
    await expect(
      createVendor(
        workspaceId,
        input({
          name: 'Rolls back second',
          uen: '201700001C',
          brandIds: [brandA, brandB],
          contacts: [contact({ name: 'Nobody' })],
        }),
      ),
    ).rejects.toBeInstanceOf(VendorUenTakenError)
    // The original is untouched, and the refused row left nothing behind.
    expect((await getVendorByRef(workspaceId, 'rolls-back-first'))?.brandIds).toEqual([brandA])
    expect(await getVendorByRef(workspaceId, 'rolls-back-second')).toBeNull()
  })

  it('refuses a patch that moves a UEN onto an occupied one', async () => {
    // Correcting a number into somebody else's is the same mistake as entering
    // the company twice.
    await createVendor(workspaceId, input({ name: 'Sitting on it', uen: '201600002D' }))
    const mover = await createVendor(workspaceId, input({ name: 'Moving onto it' }))
    await expect(updateVendor(workspaceId, mover.id, { uen: '201600002D' })).rejects.toMatchObject({
      uen: '201600002D',
    })
  })

  it('lets a vendor keep its own UEN through a patch', async () => {
    // The row is compared against itself here, so re-sending the form's own
    // values must not refuse.
    const created = await createVendor(
      workspaceId,
      input({ name: 'Unchanged registration', uen: '201500003E' }),
    )
    const patched = await updateVendor(workspaceId, created.id, {
      uen: '201500003E',
      status: 'inactive',
    })
    expect(patched?.status).toBe('inactive')
  })

  it('suffixes a slug that is already taken, because a name is not unique', async () => {
    // Two companies may legitimately carry one name — trading names, legal
    // suffixes, abbreviations. The slug takes a `-2` and the row lands.
    const first = await createVendor(workspaceId, input({ name: 'Sunbeam Social' }))
    const second = await createVendor(workspaceId, input({ name: 'Sunbeam Social' }))
    expect(first.slug).toBe('sunbeam-social')
    expect(second.slug).toBe('sunbeam-social-2')
    // And a genuinely different name is not suffixed at all.
    const third = await createVendor(workspaceId, input({ name: 'Sunbeam Social Pte Ltd' }))
    expect(third.slug).toBe('sunbeam-social-pte-ltd')
  })

  it('resolves by slug or by id, and only inside the workspace', async () => {
    const created = await createVendor(workspaceId, input({ name: 'Findable Studio' }))

    expect((await getVendorByRef(workspaceId, 'findable-studio'))?.id).toBe(created.id)
    expect((await getVendorByRef(workspaceId, created.id))?.id).toBe(created.id)
    // The access gate: the same id from the seeded workspace misses.
    expect(await getVendorByRef(seededWorkspaceId, created.id)).toBeNull()
  })

  it('answers null for a ref that is neither a slug nor a uuid', async () => {
    // The branch that exists so Postgres is never handed a non-uuid string to
    // compare against a `uuid` column — that raises, and a 500 is the wrong
    // answer to "no such vendor".
    expect(await getVendorByRef(workspaceId, 'no-such-vendor')).toBeNull()
    expect(await getVendorByRef(workspaceId, 'not a uuid at all')).toBeNull()
  })

  it('lists a workspace alphabetically — this screen is a directory', async () => {
    const scratch = await createWorkspace({ name: 'Directory order workspace', ownerUserId })
    try {
      await createVendor(scratch.id, input({ name: 'Zephyr Studio' }))
      await createVendor(scratch.id, input({ name: 'anvil films' }))
      await createVendor(scratch.id, input({ name: 'Meridian Media' }))

      const rows = await listVendorsByWorkspace(scratch.id)
      // Postgres' default collation folds case here, so a lowercase name does not
      // sort ahead of every capitalised one — which is what a person reading a
      // directory expects.
      expect(rows.map((r) => r.name)).toEqual(['anvil films', 'Meridian Media', 'Zephyr Studio'])
    } finally {
      await deleteWorkspace(scratch.id)
    }
  })

  it('lists both relations per row, not smeared across the set', async () => {
    // The three-query-plus-two-maps read. A grouping bug here shows as one vendor
    // carrying another's contacts, which nothing on screen would flag.
    const scratch = await createWorkspace({ name: 'Relation grouping workspace', ownerUserId })
    try {
      const brand = await createBrand({ workspaceId: scratch.id, name: 'Only brand' })
      await createVendor(
        scratch.id,
        input({
          name: 'Alpha Agency',
          brandIds: [brand.id],
          contacts: [contact({ name: 'First' }), contact({ name: 'Second' })],
        }),
      )
      await createVendor(scratch.id, input({ name: 'Beta Agency' }))

      const rows = await listVendorsByWorkspace(scratch.id)
      expect(rows.map((r) => [r.name, r.brandIds, r.contacts.map((c) => c.name)])).toEqual([
        ['Alpha Agency', [brand.id], ['First', 'Second']],
        ['Beta Agency', [], []],
      ])
    } finally {
      await deleteWorkspace(scratch.id)
    }
  })

  it('patches only the keys it is given, and clears on an explicit null', async () => {
    const created = await createVendor(
      workspaceId,
      input({ name: 'Patchable Co', category: 'production', notes: 'Keep me' }),
    )

    const patched = await updateVendor(workspaceId, created.id, { category: null })
    expect(patched?.category).toBeNull()
    expect(patched?.notes).toBe('Keep me')
    expect(patched?.name).toBe('Patchable Co')
  })

  it('leaves the slug alone when the name changes', async () => {
    const created = await createVendor(workspaceId, input({ name: 'Old Name Studio' }))
    const patched = await updateVendor(workspaceId, created.id, { name: 'New Name Studio' })
    // The point of the slug: a link written before the correction still resolves.
    expect(patched?.slug).toBe('old-name-studio')
    expect((await getVendorByRef(workspaceId, 'old-name-studio'))?.name).toBe('New Name Studio')
  })

  it('replaces contacts wholesale, and swaps the primary in one request', async () => {
    // The reason `is_primary` is a zod refinement rather than a partial unique
    // index: a full-replacement write can move the flag without a moment where
    // two rows hold it.
    const created = await createVendor(
      workspaceId,
      input({
        name: 'Swappable Contacts',
        contacts: [
          contact({ name: 'Was primary', isPrimary: true }),
          contact({ name: 'Was second' }),
        ],
      }),
    )
    const patched = await updateVendor(workspaceId, created.id, {
      contacts: [
        contact({ name: 'Was second', isPrimary: true }),
        contact({ name: 'Was primary' }),
      ],
    })
    expect(patched?.contacts.map((c) => [c.name, c.isPrimary])).toEqual([
      ['Was second', true],
      ['Was primary', false],
    ])
    // An empty array is a write — "nobody named any more" — not an omission.
    expect((await updateVendor(workspaceId, created.id, { contacts: [] }))?.contacts).toEqual([])
  })

  it('renumbers position densely, so a removed contact leaves no gap', async () => {
    const created = await createVendor(
      workspaceId,
      input({
        name: 'Dense Positions',
        contacts: [contact({ name: 'A' }), contact({ name: 'B' }), contact({ name: 'C' })],
      }),
    )
    await updateVendor(workspaceId, created.id, {
      contacts: [contact({ name: 'A' }), contact({ name: 'C' })],
    })
    const rows = await db
      .select()
      .from(vendorContacts)
      .where(eq(vendorContacts.vendorId, created.id))
      .orderBy(vendorContacts.position)
    expect(rows.map((r) => [r.position, r.name])).toEqual([
      [0, 'A'],
      [1, 'C'],
    ])
  })

  it('replaces brandIds wholesale, and clears them on an empty array', async () => {
    const created = await createVendor(
      workspaceId,
      input({ name: 'Retagged Agency', brandIds: [brandA] }),
    )
    expect((await updateVendor(workspaceId, created.id, { brandIds: [brandB] }))?.brandIds).toEqual(
      [brandB],
    )
    expect((await updateVendor(workspaceId, created.id, { brandIds: [] }))?.brandIds).toEqual([])
  })

  it('leaves both relations alone on a patch that names neither', async () => {
    const created = await createVendor(
      workspaceId,
      input({
        name: 'Keeps Its Relations',
        brandIds: [brandA],
        contacts: [contact({ name: 'Still here' })],
      }),
    )
    const patched = await updateVendor(workspaceId, created.id, { status: 'inactive' })
    expect(patched?.brandIds).toEqual([brandA])
    expect(patched?.contacts.map((c) => c.name)).toEqual(['Still here'])
  })

  it('misses a patch aimed at another workspace, rather than writing across it', async () => {
    const created = await createVendor(workspaceId, input({ name: 'Not Yours Ltd' }))
    expect(await updateVendor(seededWorkspaceId, created.id, { status: 'inactive' })).toBeNull()
  })

  it('refuses a brand from another workspace, on create and on patch', async () => {
    const foreign = await createBrand({ workspaceId: seededWorkspaceId, name: 'Foreign brand' })
    createdBrands.push(foreign.id)

    await expect(
      createVendor(workspaceId, input({ name: 'Crosswired Agency', brandIds: [foreign.id] })),
    ).rejects.toBeInstanceOf(BrandNotInWorkspaceError)

    const created = await createVendor(workspaceId, input({ name: 'Later Crosswired' }))
    await expect(
      updateVendor(workspaceId, created.id, { brandIds: [brandA, foreign.id] }),
    ).rejects.toBeInstanceOf(BrandNotInWorkspaceError)

    // The create rolled back rather than leaving a vendor with no brands on it.
    expect(await getVendorByRef(workspaceId, 'crosswired-agency')).toBeNull()
    // And the patch rolled back rather than leaving the valid half written.
    expect((await getVendorByRef(workspaceId, created.id))?.brandIds).toEqual([])
  })

  it('keeps the vendor when its brand is deleted, and drops the link', async () => {
    const brand = await createBrand({ workspaceId, name: 'Doomed brand' })
    const created = await createVendor(
      workspaceId,
      input({ name: 'Outlives Its Brand', brandIds: [brand.id] }),
    )
    expect(created.brandIds).toEqual([brand.id])

    await deleteBrand(brand.id)

    // `ON DELETE CASCADE` on the **link**: the relationship outlives the branding,
    // and the vendor is the record the next brand gets attached to.
    const after = await getVendorByRef(workspaceId, created.id)
    expect(after).not.toBeNull()
    expect(after?.brandIds).toEqual([])
  })

  it('deletes once, and reports the second attempt as a miss', async () => {
    const created = await createVendor(
      workspaceId,
      input({
        name: 'Typo Vendor',
        brandIds: [brandA],
        contacts: [contact({ name: 'Goes too' })],
      }),
    )
    const deleted = await deleteVendor(workspaceId, created.id)
    // The last copy anything will see, so it carries both relations.
    expect(deleted?.id).toBe(created.id)
    expect(deleted?.brandIds).toEqual([brandA])
    expect(deleted?.contacts.map((c) => c.name)).toEqual(['Goes too'])

    expect(await deleteVendor(workspaceId, created.id)).toBeNull()
    expect(await getVendorByRef(workspaceId, created.id)).toBeNull()
    // The contact rows went with it, by cascade. A contact with no company is not
    // a record `vendor_contacts` can describe.
    const orphans = await db
      .select()
      .from(vendorContacts)
      .where(eq(vendorContacts.vendorId, created.id))
    expect(orphans).toEqual([])
  })

  it('will not delete across a workspace boundary', async () => {
    const created = await createVendor(workspaceId, input({ name: 'Safe From Elsewhere' }))
    expect(await deleteVendor(seededWorkspaceId, created.id as VendorId)).toBeNull()
    expect(await getVendorByRef(workspaceId, created.id)).not.toBeNull()
  })
})
