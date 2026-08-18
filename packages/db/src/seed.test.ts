import { eq } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'
import { db, pool } from './client'
import {
  agentMessages,
  brands,
  canvases,
  guidelineSections,
  influencerAccounts,
  influencerBrands,
  influencers,
  outlets,
  projects,
  users,
  vendorBrands,
  vendorContacts,
  vendors,
  workspaces,
} from './schema'
import { seed } from './seed'

// Live-DB test — only runs when DATABASE_URL is set (dev compose or CI's
// `postgres:16` service). Skipped locally for contributors who haven't set
// up Postgres yet; CI's workflow exports `DATABASE_URL` before `pnpm test`.
const hasDb = !!process.env.DATABASE_URL

describe.skipIf(!hasDb)('seed()', () => {
  afterAll(async () => {
    await pool.end()
  })

  // **It clears the two fixture tables first, and that is what makes it a test
  // rather than a coincidence.** Every insert is `ON CONFLICT DO NOTHING`, so a
  // creator written by any earlier `seed()` stays written and a later run with
  // the flag off cannot take them away. Declaration order used to be the whole
  // defence, and it is not one: `influencers.live.test.ts` and
  // `vendors.live.test.ts` both call `seed()` in a `beforeAll`, the `db` project
  // is `singleFork`, and whichever file the runner reaches first decides whether
  // this assertion reads 0 or 19. Deleting the rows here makes the case hermetic
  // in any order, and the delete cascades to the accounts, the links and the
  // contacts.
  //
  // What it is really pinning is the **placement** of the guard: written one loop
  // too high it would skip the brands and the outlets too, and the seed would
  // report success over an empty gallery.
  it('SEED_FIXTURES=false writes the brands and the outlets and nothing invented', async () => {
    const previous = process.env.SEED_FIXTURES
    process.env.SEED_FIXTURES = 'false'
    try {
      const before = await seed()
      await db.delete(influencers).where(eq(influencers.workspaceId, before.workspaceId))
      await db.delete(vendors).where(eq(vendors.workspaceId, before.workspaceId))

      const result = await seed()
      const [brandRows, outletRows, influencerRows, accountRows, vendorRows] = await Promise.all([
        db.select().from(brands).where(eq(brands.workspaceId, result.workspaceId)),
        db.select().from(outlets).where(eq(outlets.workspaceId, result.workspaceId)),
        db.select().from(influencers).where(eq(influencers.workspaceId, result.workspaceId)),
        db
          .select()
          .from(influencerAccounts)
          .where(eq(influencerAccounts.workspaceId, result.workspaceId)),
        db.select().from(vendors).where(eq(vendors.workspaceId, result.workspaceId)),
      ])

      expect(brandRows).toHaveLength(7)
      expect(outletRows).toHaveLength(10)
      expect(influencerRows).toHaveLength(0)
      // No creator, so no account. The guard sits above the parent loop, and the
      // accounts are written inside it — an account row here would mean the
      // fixture had been split across the switch.
      expect(accountRows).toHaveLength(0)
      expect(vendorRows).toHaveLength(0)
    } finally {
      if (previous === undefined) delete process.env.SEED_FIXTURES
      else process.env.SEED_FIXTURES = previous
    }
  })

  it('is idempotent — running twice yields one row per seeded aggregate', async () => {
    const first = await seed()
    const second = await seed()

    // Deterministic ids — the two runs must return identical references.
    expect(second).toEqual(first)

    const [
      userRows,
      wsRows,
      brand1Rows,
      brand2Rows,
      allBrandRows,
      outletRows,
      proj1Rows,
      proj2Rows,
      canvas1Rows,
      canvas2Rows,
      sectionRows,
      messageRows,
      influencerRows,
      accountRows,
      linkRows,
      vendorRows,
      vendorLinkRows,
      vendorContactRows,
    ] = await Promise.all([
      db.select().from(users).where(eq(users.id, first.userId)),
      db.select().from(workspaces).where(eq(workspaces.id, first.workspaceId)),
      db.select().from(brands).where(eq(brands.id, first.brandId)),
      db.select().from(brands).where(eq(brands.id, first.brand2Id)),
      db.select().from(brands).where(eq(brands.workspaceId, first.workspaceId)),
      db.select().from(outlets).where(eq(outlets.workspaceId, first.workspaceId)),
      db.select().from(projects).where(eq(projects.id, first.projectId)),
      db.select().from(projects).where(eq(projects.id, first.project2Id)),
      db.select().from(canvases).where(eq(canvases.projectId, first.projectId)),
      db.select().from(canvases).where(eq(canvases.projectId, first.project2Id)),
      db.select().from(guidelineSections).where(eq(guidelineSections.brandId, first.brandId)),
      db.select().from(agentMessages).where(eq(agentMessages.projectId, first.project2Id)),
      db.select().from(influencers).where(eq(influencers.workspaceId, first.workspaceId)),
      // Scoped by the account's own `workspace_id` — the denormalised column that
      // exists to hold `influencer_accounts_workspace_platform_handle_key`. It is
      // written by the seed rather than derived, so reading through it is also
      // what pins that the seed sets it.
      db
        .select({ position: influencerAccounts.position })
        .from(influencerAccounts)
        .where(eq(influencerAccounts.workspaceId, first.workspaceId)),
      // Joined up to the workspace, because `influencer_brands` carries no
      // workspace of its own — the creator is what scopes a link.
      db
        .select({ brandId: influencerBrands.brandId })
        .from(influencerBrands)
        .innerJoin(influencers, eq(influencers.id, influencerBrands.influencerId))
        .where(eq(influencers.workspaceId, first.workspaceId)),
      db.select().from(vendors).where(eq(vendors.workspaceId, first.workspaceId)),
      // Joined up to the workspace for the same reason: `vendor_brands` carries no
      // workspace of its own — the vendor is what scopes a link.
      db
        .select({ brandId: vendorBrands.brandId })
        .from(vendorBrands)
        .innerJoin(vendors, eq(vendors.id, vendorBrands.vendorId))
        .where(eq(vendors.workspaceId, first.workspaceId)),
      db
        .select({ position: vendorContacts.position })
        .from(vendorContacts)
        .innerJoin(vendors, eq(vendors.id, vendorContacts.vendorId))
        .where(eq(vendors.workspaceId, first.workspaceId)),
    ])

    expect(userRows).toHaveLength(1)
    expect(wsRows).toHaveLength(1)
    expect(brand1Rows).toHaveLength(1)
    expect(brand2Rows).toHaveLength(1)
    // The seven concepts and the ten premises. Asserted rather than described
    // because both lists are **real records**: a brand quietly dropped by a bad
    // merge, or an outlet whose id collided with a neighbour's and was skipped by
    // `ON CONFLICT DO NOTHING`, reads on screen as a shop the group does not have
    // rather than as an error.
    expect(allBrandRows).toHaveLength(7)
    expect(outletRows).toHaveLength(10)
    // Ungrafted Vines trades online and holds no premises. Pinned because an
    // outlet accidentally attached to it would look ordinary in a table of nine
    // real ones.
    const ungrafted = allBrandRows.find((b) => b.name === 'Ungrafted Vines')
    expect(ungrafted).toBeDefined()
    expect(outletRows.filter((o) => o.brandId === ungrafted?.id)).toHaveLength(0)
    expect(proj1Rows).toHaveLength(1)
    expect(proj2Rows).toHaveLength(1)
    expect(canvas1Rows).toHaveLength(1)
    expect(canvas2Rows).toHaveLength(1)
    expect(sectionRows).toHaveLength(3)
    expect(messageRows).toHaveLength(2)
    expect(influencerRows).toHaveLength(146)
    // 80 creators post from one platform, 62 from two and 4 from three — so 216
    // accounts, and the **positions** are asserted rather than the total alone.
    // `influencer_accounts` is the third composite-key insert in this seed, its
    // target is `(influencer_id, position)`, and a reseed re-offers every row: a
    // wrong target would either raise or double the count with nothing on screen
    // to say so. Counting by position is what catches a list written in the wrong
    // order as well, which a bare total cannot.
    expect(accountRows).toHaveLength(216)
    const byPosition = accountRows.reduce<Record<number, number>>((counts, account) => {
      counts[account.position] = (counts[account.position] ?? 0) + 1
      return counts
    }, {})
    expect(byPosition).toEqual({ 0: 146, 1: 66, 2: 4 })
    // **No creator holds a brand.** There is no Curly's brand in this workspace,
    // and the media list is a Curly's list — see `SEED_INFLUENCERS`. Zero is
    // asserted rather than assumed because it is the one number here that a
    // future brand is expected to change, and the assertion is where that change
    // announces itself.
    expect(linkRows).toHaveLength(0)
    expect(vendorRows).toHaveLength(9)
    // Seven vendors hold a brand and one of those holds two — so 8 link rows.
    // Asserted rather than described for the reason above: the conflict target is
    // a composite key, and a reseed re-offers every pair.
    expect(vendorLinkRows).toHaveLength(8)
    // Three vendors carry contacts — two, one and one. **`vendor_contacts` is the
    // second composite-key insert in this seed**, and its target is
    // `(vendor_id, position)` rather than an id, because the row has no id at all.
    // A reseed that doubled these would go unnoticed on any screen.
    expect(vendorContactRows).toHaveLength(4)
  })
})
