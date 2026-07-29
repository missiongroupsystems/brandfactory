import { BrandSchema, BrandSummarySchema } from '@brandfactory/shared'
import type { BrandId, WorkspaceId } from '@brandfactory/shared'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { pool } from './client'
import {
  createBrand,
  deleteBrand,
  getBrandById,
  listBrandSummariesByWorkspace,
  updateBrand,
} from './queries/brands'
import { seed } from './seed'

// Live-DB test — only runs when DATABASE_URL is set, matching `seed.test.ts`,
// `queries.live.test.ts` and `guidelines.live.test.ts`. Its own file for the
// same reason as theirs: each live file owns the `pg` pool for its worker and
// ends it in `afterAll`, and the package sets `fileParallelism: false`.
//
// `website_url` (migration 0003) is nullable and additive, which is exactly the
// kind of column that can be dropped on the way through and leave every unit
// test green: `listBrandSummariesByWorkspace` enumerates its columns by hand,
// `updateBrand` builds its `set()` conditionally, and the server route tests run
// against an in-memory fake that could agree with a mistake. Only real Postgres
// proves the round trip.
const hasDb = !!process.env.DATABASE_URL

// Created and destroyed by this file. `seed.test.ts` asserts exact row counts
// for the seeded brands, so nothing here may outlive the suite.
const SCRATCH_BRAND_NAME = 'Website round-trip scratch brand'

describe.skipIf(!hasDb)('brands.website_url (live DB)', () => {
  let workspaceId: WorkspaceId
  const created: BrandId[] = []

  beforeAll(async () => {
    const ids = await seed()
    workspaceId = ids.workspaceId as WorkspaceId
  })

  afterAll(async () => {
    for (const id of created) await deleteBrand(id)
    await pool.end()
  })

  async function scratchBrand(websiteUrl?: string | null) {
    const brand = await createBrand({
      workspaceId,
      name: SCRATCH_BRAND_NAME,
      ...(websiteUrl !== undefined ? { websiteUrl } : {}),
    })
    created.push(brand.id)
    return brand
  }

  it('round-trips a website through create and read', async () => {
    const brand = await scratchBrand('https://casavostra.com/menu')
    expect(brand.websiteUrl).toBe('https://casavostra.com/menu')

    const read = await getBrandById(brand.id)
    expect(read?.websiteUrl).toBe('https://casavostra.com/menu')
    // Parsing with the wire schema is the point: it proves the column survives
    // as an `http(s)` URL the API contract will accept back.
    expect(() => BrandSchema.parse(read)).not.toThrow()
  })

  it('defaults to null when a brand is created without one', async () => {
    const brand = await scratchBrand()
    expect(brand.websiteUrl).toBeNull()
    expect((await getBrandById(brand.id))?.websiteUrl).toBeNull()
  })

  // The regression this file exists for. `updateBrand` distinguishes `undefined`
  // (leave alone) from `null` (clear); a `?? null` anywhere in that chain turns
  // every rename into a silent website delete, and nothing else would fail.
  it('leaves the website alone on a name-only patch, and clears it on an explicit null', async () => {
    const brand = await scratchBrand('https://casavostra.com')

    const renamed = await updateBrand(brand.id, { name: 'Renamed' })
    expect(renamed?.name).toBe('Renamed')
    expect(renamed?.websiteUrl).toBe('https://casavostra.com')

    const cleared = await updateBrand(brand.id, { websiteUrl: null })
    expect(cleared?.websiteUrl).toBeNull()
    // …and the rest of the row is untouched by a website-only patch.
    expect(cleared?.name).toBe('Renamed')
  })

  // `listBrandSummariesByWorkspace` is the one brand read built from an explicit
  // select list rather than `select()`, so it is the one that can silently omit
  // a new column. The workspace grid renders from it.
  it('carries the website into the workspace summary projection', async () => {
    const brand = await scratchBrand('https://casavostra.com')

    const rows = await listBrandSummariesByWorkspace(workspaceId)
    const row = rows.find((b) => b.id === brand.id)
    expect(row?.websiteUrl).toBe('https://casavostra.com')
    expect(() => BrandSummarySchema.parse(row)).not.toThrow()
  })
})
