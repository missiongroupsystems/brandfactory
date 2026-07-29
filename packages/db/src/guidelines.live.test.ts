import type { BrandGuidelineSection, BrandId } from '@brandfactory/shared'
import { eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { db, pool } from './client'
import { listSectionsByBrand, updateBrandGuidelines } from './queries/brands'
import { guidelineSections } from './schema'
import { seed } from './seed'

// Live-DB test — only runs when DATABASE_URL is set, matching `seed.test.ts`
// and `queries.live.test.ts`. Its own file (rather than a describe inside
// `queries.live.test.ts`) because each live file owns the `pg` pool for its
// worker and ends it in `afterAll`; the package sets `fileParallelism: false`
// so these seeds never race each other.
//
// `updateBrandGuidelines` treats its payload as the brand's complete desired
// state. The upsert half was always correct; the delete half was missing, so
// removing a section in the editor was a no-op — the row survived, came back
// in the response, and the editor's own success handler reseeded it into the
// form. The semantics live in the transaction, and the server's in-memory fake
// reimplements them, so only a real Postgres proves the two agree.
const hasDb = !!process.env.DATABASE_URL

describe.skipIf(!hasDb)('updateBrandGuidelines (live DB)', () => {
  let brandId: BrandId
  let brand2Id: BrandId

  // Re-seeded per test: every case here mutates the section list.
  beforeEach(async () => {
    const ids = await seed()
    brandId = ids.brandId as BrandId
    brand2Id = ids.brand2Id as BrandId
  })

  // These tests both insert and delete sections, and `seed()` only fills gaps
  // (`onConflictDoNothing` on fixed ids) — so a section this file created would
  // survive into `seed.test.ts`, which asserts an exact row count for the same
  // brand. Reset to the seeded three before handing the database on.
  afterAll(async () => {
    await db.delete(guidelineSections).where(eq(guidelineSections.brandId, brandId))
    await db.delete(guidelineSections).where(eq(guidelineSections.brandId, brand2Id))
    await seed()
    await pool.end()
  })

  const body = (text: string) => ({
    type: 'doc' as const,
    content: [{ type: 'paragraph' as const, content: [{ type: 'text' as const, text }] }],
  })

  // Mirrors what `BrandGuidelinesEditor` sends since Stage 1B: a section goes
  // back with the author it arrived with, rather than with a literal the caller
  // chose. Carrying `s.createdBy` here is what makes the provenance case below
  // exercise the same shape as the client.
  const asInput = (s: BrandGuidelineSection) => ({
    id: s.id,
    label: s.label,
    body: s.body,
    priority: s.priority,
    createdBy: s.createdBy,
  })

  it('deletes sections the payload omits', async () => {
    const before = await listSectionsByBrand(brandId)
    expect(before.length).toBe(3)

    const kept = before.slice(0, 2)
    const after = await updateBrandGuidelines(brandId, kept.map(asInput))

    expect(after.map((s) => s.id)).toEqual(kept.map((s) => s.id))
    // The response is a select over the table, so re-reading proves the row is
    // actually gone rather than merely filtered out of the reply.
    expect((await listSectionsByBrand(brandId)).map((s) => s.id)).toEqual(kept.map((s) => s.id))
  })

  it('clears every section when the payload is empty', async () => {
    // `notInArray` on an empty list is invalid SQL, so this is the branch that
    // deletes by brand alone.
    expect(await updateBrandGuidelines(brandId, [])).toEqual([])
    expect(await listSectionsByBrand(brandId)).toEqual([])
  })

  it('updates, inserts and deletes in one pass', async () => {
    const before = await listSectionsByBrand(brandId)
    const [first, , third] = before

    const after = await updateBrandGuidelines(brandId, [
      { ...asInput(first!), label: 'Renamed', body: body('rewritten'), priority: 1000 },
      { label: 'Brand new', body: body('fresh'), priority: 2000, createdBy: 'user' },
    ])

    expect(after.map((s) => s.label)).toEqual(['Renamed', 'Brand new'])
    expect(after[0]!.id).toBe(first!.id) // updated in place, not re-created
    expect(after.map((s) => s.id)).not.toContain(third!.id) // dropped
  })

  // Stage 1B. `guideline_section_created_by` has carried `'agent'` since 0.3.0
  // with no producer, so this is the first time the enum's second value goes
  // through the transaction and comes back out of a real column.
  it('writes and preserves per-section provenance across an unrelated edit', async () => {
    const seeded = await updateBrandGuidelines(brandId, [
      { label: 'Voice', body: body('dry'), priority: 1000, createdBy: 'user' },
      { label: 'Audience', body: body('from research'), priority: 2000, createdBy: 'agent' },
    ])
    expect(seeded.map((s) => s.createdBy)).toEqual(['user', 'agent'])

    // Edit the user-written one and re-send both, as the editor does. The row
    // stored as `'agent'` must survive a save it was merely carried along by.
    const [voice, audience] = seeded
    const after = await updateBrandGuidelines(brandId, [
      { ...asInput(voice!), label: 'Voice & tone' },
      asInput(audience!),
    ])

    expect(after.map((s) => [s.label, s.createdBy])).toEqual([
      ['Voice & tone', 'user'],
      ['Audience', 'agent'],
    ])
    // Re-read, because the return value is a select over the table but within
    // the same transaction's snapshot — this proves what is actually stored.
    expect((await listSectionsByBrand(brandId)).map((s) => s.createdBy)).toEqual(['user', 'agent'])
  })

  it('scopes the delete to one brand', async () => {
    // The seed only gives brand 1 sections, so brand 2 gets one here — an
    // unscoped `delete ... where id not in (...)` would take it with the rest.
    await updateBrandGuidelines(brand2Id, [
      { label: 'Other brand', body: body('untouched'), priority: 1000, createdBy: 'user' },
    ])
    const otherBefore = await listSectionsByBrand(brand2Id)
    expect(otherBefore.length).toBe(1)

    await updateBrandGuidelines(brandId, [])

    expect(await listSectionsByBrand(brandId)).toEqual([])
    expect(await listSectionsByBrand(brand2Id)).toEqual(otherBefore)
  })
})
