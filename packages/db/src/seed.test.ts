import { eq } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'
import { db, pool } from './client'
import {
  agentMessages,
  brands,
  canvases,
  guidelineSections,
  projects,
  users,
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
  })
})
