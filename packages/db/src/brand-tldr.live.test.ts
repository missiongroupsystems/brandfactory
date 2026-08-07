import { BrandSummarySchema } from '@brandfactory/shared'
import type { BrandId, ProseMirrorDoc, WorkspaceId } from '@brandfactory/shared'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { pool } from './client'
import {
  createBrand,
  deleteBrand,
  listBrandSummariesByWorkspace,
  upsertSection,
} from './queries/brands'
import { seed } from './seed'

// Live-DB test — only runs when DATABASE_URL is set, and its own file for the
// same reason as its siblings: each live file owns the `pg` pool for its worker
// and ends it in `afterAll`.
//
// **This file is not optional coverage.** `BrandSummary.tldr` is resolved by a
// filtered `jsonb_agg` inside `listBrandSummariesByWorkspace` — raw SQL that no
// type checks, no lint reads and no unit test executes. `mappers.test.ts`
// covers the half that runs in TypeScript by handing `rowToBrandSummary` a row
// it made up; a typo in the aggregate, a wrong `->` vs `->>`, or a
// `regexp_replace` Postgres rejects would leave that suite green and every
// workspace grid returning a 500. Only real Postgres executes the string.
const hasDb = !!process.env.DATABASE_URL

// Created and destroyed by this file. `seed.test.ts` asserts exact row counts
// for the seeded brands, so nothing here may outlive the suite.
const SCRATCH_BRAND_NAME = 'TL;DR round-trip scratch brand'

const doc = (...paragraphs: string[]): ProseMirrorDoc => ({
  type: 'doc',
  content: paragraphs.map((text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })),
})

describe.skipIf(!hasDb)('BrandSummary.tldr (live DB)', () => {
  let workspaceId: WorkspaceId
  const created: BrandId[] = []

  beforeAll(async () => {
    const ids = await seed()
    workspaceId = ids.workspaceId as WorkspaceId
  })

  afterAll(async () => {
    // Sections cascade with the brand (FK onDelete), so the brand delete is
    // enough to leave `seed.test.ts`'s counts where it found them.
    for (const id of created) await deleteBrand(id)
    await pool.end()
  })

  async function scratchBrand(sections: Array<{ label: string; body: ProseMirrorDoc }> = []) {
    const brand = await createBrand({ workspaceId, name: SCRATCH_BRAND_NAME })
    created.push(brand.id)
    let priority = 0
    for (const s of sections) {
      await upsertSection({
        brandId: brand.id,
        label: s.label,
        body: s.body,
        priority: priority++,
        createdBy: 'user',
      })
    }
    return brand
  }

  async function summaryFor(id: BrandId) {
    const rows = await listBrandSummariesByWorkspace(workspaceId)
    return rows.find((b) => b.id === id)
  }

  it('resolves the TL;DR section to one line', async () => {
    const brand = await scratchBrand([
      { label: 'Voice & tone', body: doc('Warm, never precious.') },
      { label: 'TL;DR', body: doc('A wine bar in Tiong Bahru.') },
    ])

    const row = await summaryFor(brand.id)
    expect(row?.tldr).toBe('A wine bar in Tiong Bahru.')
    // Parsing with the wire schema is the point: it proves the value survives
    // as something the API contract will accept back.
    expect(() => BrandSummarySchema.parse(row)).not.toThrow()
  })

  it('collapses a multi-paragraph TL;DR onto one line', async () => {
    const brand = await scratchBrand([
      { label: 'TL;DR', body: doc('A wine bar.', 'Warm, never precious.') },
    ])
    expect((await summaryFor(brand.id))?.tldr).toBe('A wine bar. Warm, never precious.')
  })

  // The `filter (where …)` arm. A brand with sections but no TL;DR must come
  // back with `null` rather than whichever section the aggregate saw first.
  it('is null for a brand with sections but no TL;DR', async () => {
    const brand = await scratchBrand([{ label: 'Voice & tone', body: doc('Warm.') }])
    const row = await summaryFor(brand.id)
    expect(row?.tldr).toBeNull()
    expect(row?.sectionCount).toBe(1)
  })

  // The `jsonb_agg(…) -> 0` on an all-filtered-out aggregate is SQL `null`, not
  // an empty array — the case a `[0]` subscript would have got wrong.
  it('is null for a brand with no sections at all', async () => {
    const brand = await scratchBrand()
    const row = await summaryFor(brand.id)
    expect(row?.tldr).toBeNull()
    expect(row?.sectionCount).toBe(0)
  })

  // The `regexp_replace(… '[^[:alnum:]]' …)` prefilter, executed rather than
  // reasoned about. This is the assertion that a Postgres-side rejection of the
  // bracket expression could not hide from.
  it('finds the TL;DR however its label was punctuated', async () => {
    for (const spelling of ['TLDR', 'tl;dr', 'TL-DR']) {
      const brand = await scratchBrand([{ label: spelling, body: doc('A wine bar.') }])
      expect((await summaryFor(brand.id))?.tldr).toBe('A wine bar.')
    }
  })

  // `order by priority` inside the aggregate, matching what `brandTldrSection`
  // documents: nothing stops a brand holding two rows labelled TL;DR, and the
  // one nearest the top of the user's own ordering is *the* one.
  it('takes the first TL;DR by priority when a brand holds two', async () => {
    const brand = await scratchBrand([
      { label: 'TL;DR', body: doc('The first one.') },
      { label: 'TLDR', body: doc('The second one.') },
    ])
    expect((await summaryFor(brand.id))?.tldr).toBe('The first one.')
  })

  // The section counts share the join the aggregate filters over. A `filter`
  // clause must not narrow them.
  it('leaves the section and project counts alone', async () => {
    const brand = await scratchBrand([
      { label: 'TL;DR', body: doc('A wine bar.') },
      { label: 'Voice & tone', body: doc('Warm.') },
      { label: 'Target audience', body: doc('Locals.') },
    ])
    const row = await summaryFor(brand.id)
    expect(row?.sectionCount).toBe(3)
    expect(row?.projectCount).toBe(0)
  })
})
