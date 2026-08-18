import { eq } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'
import { db, pool } from './client'
import {
  agentMessages,
  brands,
  canvases,
  guidelineSections,
  influencerBrands,
  influencers,
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
      proj1Rows,
      proj2Rows,
      canvas1Rows,
      canvas2Rows,
      sectionRows,
      messageRows,
      influencerRows,
      linkRows,
      vendorRows,
      vendorLinkRows,
      vendorContactRows,
    ] = await Promise.all([
      db.select().from(users).where(eq(users.id, first.userId)),
      db.select().from(workspaces).where(eq(workspaces.id, first.workspaceId)),
      db.select().from(brands).where(eq(brands.id, first.brandId)),
      db.select().from(brands).where(eq(brands.id, first.brand2Id)),
      db.select().from(projects).where(eq(projects.id, first.projectId)),
      db.select().from(projects).where(eq(projects.id, first.project2Id)),
      db.select().from(canvases).where(eq(canvases.projectId, first.projectId)),
      db.select().from(canvases).where(eq(canvases.projectId, first.project2Id)),
      db.select().from(guidelineSections).where(eq(guidelineSections.brandId, first.brandId)),
      db.select().from(agentMessages).where(eq(agentMessages.projectId, first.project2Id)),
      db.select().from(influencers).where(eq(influencers.workspaceId, first.workspaceId)),
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
    expect(proj1Rows).toHaveLength(1)
    expect(proj2Rows).toHaveLength(1)
    expect(canvas1Rows).toHaveLength(1)
    expect(canvas2Rows).toHaveLength(1)
    expect(sectionRows).toHaveLength(3)
    expect(messageRows).toHaveLength(2)
    expect(influencerRows).toHaveLength(19)
    // 14 creators hold a brand and three of those hold two — so 17 link rows, and
    // the number is asserted rather than described because **this is the one
    // insert in the seed whose conflict target is a composite key.** A reseed
    // re-offers every pair; `ON CONFLICT DO NOTHING` on the wrong target would
    // either raise or double the count, and nothing on screen would say so.
    expect(linkRows).toHaveLength(17)
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
