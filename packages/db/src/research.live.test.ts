import type { BrandId, WorkspaceId } from '@brandfactory/shared'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { pool } from './client'
import { createBrand, deleteBrand } from './queries/brands'
import {
  countActiveResearchJobsForWorkspace,
  countResearchJobsTodayForWorkspace,
  createResearchJob,
  finishResearchJob,
  getLatestResearchJob,
  getResearchJob,
  hasActiveResearchJob,
  listInFlightResearchJobs,
  setResearchJobDrafts,
  setResearchJobExternalId,
} from './queries/research'
import { seed } from './seed'

// Live-DB test, in its own file for the same reason as the others: each owns
// the `pg` pool for its worker and ends it in `afterAll`.
//
// Four things here are only provable against real Postgres:
//
//   - `numeric(12,6)` round-tripping through a JS number — pg hands back a
//     string, and a float that quietly rounded would misreport a bill;
//   - the "terminal states are terminal" `WHERE`, which is what makes two
//     racing finishers safe;
//   - `now() - interval '24 hours'`, which is SQL and not TypeScript;
//   - the FK cascade, so a deleted brand takes its jobs with it.
const hasDb = !!process.env.DATABASE_URL

describe.skipIf(!hasDb)('brand_research_jobs (live DB)', () => {
  let workspaceId: WorkspaceId
  const created: BrandId[] = []

  beforeAll(async () => {
    const ids = await seed()
    workspaceId = ids.workspaceId as WorkspaceId
  })

  // `seed.test.ts` asserts exact row counts, so nothing here may outlive the
  // suite. Jobs cascade with their brand.
  afterAll(async () => {
    for (const id of created) await deleteBrand(id)
    await pool.end()
  })

  async function scratchBrand(name = 'Research round-trip scratch brand') {
    const brand = await createBrand({ workspaceId, name, websiteUrl: 'https://scratch.example' })
    created.push(brand.id)
    return brand
  }

  const input = { brandName: 'Casa Vostra', websiteUrl: 'https://casavostra.example' }

  it('round-trips a job through its whole life', async () => {
    const brand = await scratchBrand()
    const job = await createResearchJob({
      brandId: brand.id,
      provider: 'perplexity',
      model: 'sonar-deep-research',
      input,
      createdBy: null,
    })

    expect(job.status).toBe('IN_PROGRESS')
    expect(job.externalId).toBeNull()
    expect(job.startedAt).not.toBeNull()
    expect(job.completedAt).toBeNull()
    // The snapshot of what was researched, read back off jsonb.
    expect(job.input).toEqual(input)
    // Empty arrays, not null — every reader treats them as lists.
    expect(job.citations).toEqual([])
    expect(job.drafts).toEqual([])

    await setResearchJobExternalId(job.id, 'ext-live-1')
    const finished = await finishResearchJob(job.id, {
      status: 'COMPLETED',
      report: '# Brand Profile\n\nA report.',
      citations: [{ title: 'About', url: 'https://casavostra.example/about' }],
      costUsd: 0.377,
    })

    expect(finished?.status).toBe('COMPLETED')
    expect(finished?.externalId).toBe('ext-live-1')
    expect(finished?.completedAt).not.toBeNull()
    expect(finished?.citations).toHaveLength(1)
    // `numeric` arrives as a string from pg; the mapper is what makes this a
    // number, and a float that rounded would misreport what a run cost.
    expect(finished?.costUsd).toBe(0.377)

    const read = await getResearchJob(brand.id, job.id)
    expect(read?.costUsd).toBe(0.377)
  })

  it('records six decimal places, because a cheap run is fractions of a cent', async () => {
    const brand = await scratchBrand()
    const job = await createResearchJob({
      brandId: brand.id,
      provider: 'perplexity',
      model: 'm',
      input,
      createdBy: null,
    })
    const done = await finishResearchJob(job.id, { status: 'COMPLETED', costUsd: 0.001234 })
    expect(done?.costUsd).toBe(0.001234)
  })

  // The `WHERE status = 'IN_PROGRESS'` that makes the ticker and a
  // reconcile-on-read safe to run against the same row at the same time.
  it('refuses to move a job that has already finished', async () => {
    const brand = await scratchBrand()
    const job = await createResearchJob({
      brandId: brand.id,
      provider: 'perplexity',
      model: 'm',
      input,
      createdBy: null,
    })

    expect(await finishResearchJob(job.id, { status: 'COMPLETED', report: 'first' })).not.toBeNull()
    expect(await finishResearchJob(job.id, { status: 'FAILED', error: 'second' })).toBeNull()

    const read = await getResearchJob(brand.id, job.id)
    expect(read?.status).toBe('COMPLETED')
    expect(read?.report).toBe('first')
  })

  it('scopes a job read by brand as well as by id', async () => {
    const mine = await scratchBrand()
    const other = await scratchBrand()
    const job = await createResearchJob({
      brandId: mine.id,
      provider: 'perplexity',
      model: 'm',
      input,
      createdBy: null,
    })
    expect(await getResearchJob(other.id, job.id)).toBeNull()
  })

  it('answers the three guards against real rows', async () => {
    const brand = await scratchBrand()
    expect(await hasActiveResearchJob(brand.id)).toBe(false)

    const job = await createResearchJob({
      brandId: brand.id,
      provider: 'perplexity',
      model: 'm',
      input,
      createdBy: null,
    })
    expect(await hasActiveResearchJob(brand.id)).toBe(true)
    expect(await countActiveResearchJobsForWorkspace(workspaceId)).toBeGreaterThan(0)
    const before = await countResearchJobsTodayForWorkspace(workspaceId)
    expect(before).toBeGreaterThan(0)

    await finishResearchJob(job.id, { status: 'FAILED', error: 'nope' })
    expect(await hasActiveResearchJob(brand.id)).toBe(false)
    // The money guard counts a failed run too: it may still have been billed.
    expect(await countResearchJobsTodayForWorkspace(workspaceId)).toBe(before)
  })

  it('lists in-flight jobs for the ticker, and drops them as they finish', async () => {
    const brand = await scratchBrand()
    const job = await createResearchJob({
      brandId: brand.id,
      provider: 'perplexity',
      model: 'm',
      input,
      createdBy: null,
    })

    expect((await listInFlightResearchJobs()).map((j) => j.id)).toContain(job.id)
    await finishResearchJob(job.id, { status: 'NO_FINDINGS', report: 'one page, one email' })
    expect((await listInFlightResearchJobs()).map((j) => j.id)).not.toContain(job.id)
  })

  it('returns the newest job for a brand that has been researched twice', async () => {
    const brand = await scratchBrand()
    const first = await createResearchJob({
      brandId: brand.id,
      provider: 'perplexity',
      model: 'm',
      input,
      createdBy: null,
    })
    await finishResearchJob(first.id, { status: 'FAILED', error: 'first' })
    const second = await createResearchJob({
      brandId: brand.id,
      provider: 'perplexity',
      model: 'm',
      input,
      createdBy: null,
    })

    expect((await getLatestResearchJob(brand.id))?.id).toBe(second.id)
  })

  it('stores drafts as jsonb, for 3E to land', async () => {
    const brand = await scratchBrand()
    const job = await createResearchJob({
      brandId: brand.id,
      provider: 'perplexity',
      model: 'm',
      input,
      createdBy: null,
    })
    const drafts = [
      {
        label: 'Voice & tone',
        html: '<p>Warm, direct.</p>',
        text: 'Warm, direct.',
        sources: [{ title: 'About', url: 'https://casavostra.example/about' }],
      },
    ]
    const updated = await setResearchJobDrafts(job.id, drafts)
    expect(updated?.drafts).toEqual(drafts)
  })

  it('takes its jobs with it when the brand is deleted', async () => {
    const brand = await createBrand({ workspaceId, name: 'Cascade scratch brand' })
    const job = await createResearchJob({
      brandId: brand.id,
      provider: 'perplexity',
      model: 'm',
      input,
      createdBy: null,
    })
    await deleteBrand(brand.id)
    expect(await getResearchJob(brand.id, job.id)).toBeNull()
  })
})
