import type { BrandId, WorkspaceId } from '@brandfactory/shared'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { pool } from './client'
import { countSectionAutofillsTodayForWorkspace, recordSectionAutofill } from './queries/autofill'
import { createBrand, deleteBrand } from './queries/brands'
import { db } from './client'
import { sectionAutofillEvents } from './schema'
import { eq } from 'drizzle-orm'
import { seed } from './seed'

// Live-DB test, in its own file for the same reason as the others: each owns
// the `pg` pool for its worker and ends it in `afterAll`.
//
// Three things here are only provable against real Postgres:
//
//   - `numeric(12,6)` round-tripping through a JS number — a section search is
//     single-digit cents, so the whole value lives in the decimals;
//   - the count's SQL: `now() - interval '24 hours'` *and* the
//     `source = 'search'` filter, which is what keeps Path R free;
//   - the FK cascade, so a deleted brand takes its ledger with it.
const hasDb = !!process.env.DATABASE_URL

describe.skipIf(!hasDb)('section_autofill_events (live DB)', () => {
  let workspaceId: WorkspaceId
  const created: BrandId[] = []

  beforeAll(async () => {
    const ids = await seed()
    workspaceId = ids.workspaceId as WorkspaceId
  })

  // `seed.test.ts` asserts exact row counts, so nothing here may outlive the
  // suite. Events cascade with their brand.
  afterAll(async () => {
    for (const id of created) await deleteBrand(id)
    await pool.end()
  })

  async function scratchBrand(name = 'Autofill ledger scratch brand') {
    const brand = await createBrand({ workspaceId, name, websiteUrl: 'https://scratch.example' })
    created.push(brand.id)
    return brand
  }

  it('round-trips an event, cost decimals and sources intact', async () => {
    const brand = await scratchBrand()
    const sources = [{ title: 'About', url: 'https://scratch.example/about' }]

    const event = await recordSectionAutofill({
      brandId: brand.id,
      label: 'Voice & tone',
      source: 'search',
      model: 'sonar-pro',
      // A real Path S run is ~$0.01, so the value is *all* decimals — a float
      // that quietly rounded would misreport every bill this table exists for.
      costUsd: 0.011193,
      sources,
      createdBy: null,
    })

    expect(event.source).toBe('search')
    expect(event.costUsd).toBe(0.011193)
    expect(event.sources).toEqual(sources)
    expect(event.createdAt).not.toBeNull()
  })

  it('records unknown cost as null, never zero', async () => {
    const brand = await scratchBrand()
    const event = await recordSectionAutofill({
      brandId: brand.id,
      label: 'Voice & tone',
      source: 'report',
      model: 'claude-sonnet-4-6',
      costUsd: null,
      sources: [],
      createdBy: null,
    })
    expect(event.costUsd).toBeNull()
  })

  it('counts only searches inside the rolling day', async () => {
    const brand = await scratchBrand()
    const before = await countSectionAutofillsTodayForWorkspace(workspaceId)

    const base = {
      brandId: brand.id,
      label: 'Voice & tone',
      model: 'm',
      costUsd: null,
      sources: [],
      createdBy: null,
    }
    // A report fill is free (the user's own LLM tokens) and must not consume
    // the search budget; only the paid path counts.
    await recordSectionAutofill({ ...base, source: 'report' })
    expect(await countSectionAutofillsTodayForWorkspace(workspaceId)).toBe(before)

    await recordSectionAutofill({ ...base, source: 'search' })
    expect(await countSectionAutofillsTodayForWorkspace(workspaceId)).toBe(before + 1)

    // The window is SQL, not TypeScript: a search bought 25 hours ago has
    // rolled out of the budget.
    const stale = await recordSectionAutofill({ ...base, source: 'search' })
    await db
      .update(sectionAutofillEvents)
      .set({ createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString() })
      .where(eq(sectionAutofillEvents.id, stale.id))
    expect(await countSectionAutofillsTodayForWorkspace(workspaceId)).toBe(before + 1)
  })

  it('takes its events with it when the brand is deleted', async () => {
    const brand = await createBrand({ workspaceId, name: 'Cascade scratch brand' })
    const event = await recordSectionAutofill({
      brandId: brand.id,
      label: 'Voice & tone',
      source: 'search',
      model: 'm',
      costUsd: 0.01,
      sources: [],
      createdBy: null,
    })
    await deleteBrand(brand.id)
    const rows = await db
      .select()
      .from(sectionAutofillEvents)
      .where(eq(sectionAutofillEvents.id, event.id))
    expect(rows).toHaveLength(0)
  })
})
