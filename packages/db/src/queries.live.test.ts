import { BrandSummarySchema, ProjectSummarySchema } from '@brandfactory/shared'
import type { BrandId, ProjectId, WorkspaceId } from '@brandfactory/shared'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db, pool } from './client'
import { listBlobKeysByBrand, listBrandSummariesByWorkspace } from './queries/brands'
import {
  listBlobKeysByProject,
  listProjectSummariesByBrand,
  listRecentProjectsByWorkspace,
} from './queries/projects'
import { agentMessages } from './schema'
import { seed, type SeedResult } from './seed'

// Live-DB test — only runs when DATABASE_URL is set (dev compose or CI's
// Postgres service container), matching the convention in `seed.test.ts`.
//
// These four queries are the only ones in the package built from raw `sql`
// fragments (`greatest`, correlated `max()` subqueries, `count(distinct …)::int`).
// The server route tests exercise them through an in-memory fake that
// *reimplements* the semantics in TypeScript, so without this file the actual
// SQL would never execute anywhere — including CI. Everything the workspace
// home and brand hub render depends on it.
const hasDb = !!process.env.DATABASE_URL

// A timestamp comfortably after the seed transaction, so ordering assertions
// are deterministic. Every seed row shares one `now()` (single transaction),
// which means the seed alone cannot prove `lastActivityAt` ordering.
//
// The marker hangs off project *1* deliberately: `seed.test.ts` asserts an
// exact message count on project 2, and this row must never be visible to it.
const ACTIVITY_MARKER_ID = '00000000-0000-4000-8000-0000000000f1'

describe.skipIf(!hasDb)('list queries (live DB)', () => {
  let ids: SeedResult

  beforeAll(async () => {
    ids = await seed()
    // Deterministic: drop any marker from a previous run, then re-insert with
    // a timestamp relative to *this* run.
    await db.delete(agentMessages).where(eq(agentMessages.id, ACTIVITY_MARKER_ID))
    await db.insert(agentMessages).values({
      id: ACTIVITY_MARKER_ID,
      projectId: ids.projectId,
      role: 'user',
      content: 'activity marker',
      userId: ids.userId,
      createdAt: new Date(Date.now() + 60_000).toISOString(),
    })
  })

  afterAll(async () => {
    await db.delete(agentMessages).where(eq(agentMessages.id, ACTIVITY_MARKER_ID))
    await pool.end()
  })

  it('listBrandSummariesByWorkspace returns schema-valid rows with numeric counts', async () => {
    const rows = await listBrandSummariesByWorkspace(ids.workspaceId as WorkspaceId)

    // Parsing with the wire schema proves the `::int` cast: without it node-pg
    // hands back bigint counts as strings and this throws.
    for (const row of rows) BrandSummarySchema.parse(row)

    const brand1 = rows.find((b) => b.id === ids.brandId)
    const brand2 = rows.find((b) => b.id === ids.brand2Id)
    expect(brand1).toBeDefined()
    expect(brand2).toBeDefined()

    // Seed: brand 1 has three guideline sections and one project; brand 2 has
    // no sections (zero-state meter) and one project.
    expect(brand1?.sectionCount).toBe(3)
    expect(brand1?.projectCount).toBe(1)
    expect(brand2?.sectionCount).toBe(0)
    expect(brand2?.projectCount).toBe(1)
    expect(typeof brand1?.sectionCount).toBe('number')

    // Ordered by created_at ascending — brand 1 seeded before brand 2.
    const ordered: string[] = rows.map((b) => b.id)
    expect(ordered.indexOf(ids.brandId)).toBeLessThan(ordered.indexOf(ids.brand2Id))
  })

  it('listRecentProjectsByWorkspace computes lastActivityAt and orders by it', async () => {
    const rows = await listRecentProjectsByWorkspace(ids.workspaceId as WorkspaceId, 10)

    // Proves the raw `greatest(...)` expression survives the mapper as an ISO
    // string the wire schema accepts (node-pg returns a Date for it, not the
    // drizzle `mode: 'string'` value the bound columns produce).
    for (const row of rows) ProjectSummarySchema.parse(row)

    // Spans both brands in the workspace — the property the per-brand endpoint
    // cannot provide, and the reason this endpoint exists.
    expect(rows.map((p) => p.id)).toContain(ids.projectId)
    expect(rows.map((p) => p.id)).toContain(ids.project2Id)
    expect(new Set(rows.map((p) => p.brandId)).size).toBe(2)

    // Project 1 carries the future-dated agent message, so it must sort first
    // even though both projects were created in the same seed transaction.
    expect(rows[0]?.id).toBe(ids.projectId)

    const p1 = rows.find((p) => p.id === ids.projectId)
    const p2 = rows.find((p) => p.id === ids.project2Id)
    expect(p1?.brandName).toBeTruthy()
    expect(p2?.brandName).toBeTruthy()
    // Agent activity beats the untouched project row.
    expect(new Date(p1!.lastActivityAt).getTime()).toBeGreaterThan(
      new Date(p1!.updatedAt).getTime(),
    )
    // An idle project falls back to its own updated_at via the coalesce.
    expect(new Date(p2!.lastActivityAt).getTime()).toBe(new Date(p2!.updatedAt).getTime())
  })

  it('listRecentProjectsByWorkspace honours limit and scopes to the workspace', async () => {
    const capped = await listRecentProjectsByWorkspace(ids.workspaceId as WorkspaceId, 1)
    expect(capped).toHaveLength(1)
    expect(capped[0]?.id).toBe(ids.projectId)

    const foreign = await listRecentProjectsByWorkspace(
      '00000000-0000-4000-8000-0000000000ff' as WorkspaceId,
      10,
    )
    expect(foreign).toEqual([])
  })

  it('listProjectSummariesByBrand returns the same shape scoped to one brand', async () => {
    const rows = await listProjectSummariesByBrand(ids.brandId as BrandId)
    for (const row of rows) ProjectSummarySchema.parse(row)

    expect(rows.map((p) => p.id)).toEqual([ids.projectId])
    // Same activity definition as the workspace strip — not `updatedAt`. This
    // is the regression guard for the brand hub rendering creation time under
    // an "activity" label.
    expect(new Date(rows[0]!.lastActivityAt).getTime()).toBeGreaterThan(
      new Date(rows[0]!.updatedAt).getTime(),
    )

    // Scoped: brand 2's project must not appear.
    expect(rows.map((p) => p.id)).not.toContain(ids.project2Id)
  })

  it('blob-key lookups return an empty list when no blocks carry blobs', async () => {
    // The seed creates canvases but no image/file blocks. The joins still have
    // to execute cleanly — this is the query that runs immediately before a
    // cascade delete, so a failure here would abort the delete.
    expect(await listBlobKeysByBrand(ids.brandId as BrandId)).toEqual([])
    expect(await listBlobKeysByProject(ids.projectId as ProjectId)).toEqual([])
  })
})
