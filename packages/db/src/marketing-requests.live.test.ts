import { MarketingRequestSchema } from '@brandfactory/shared'
import type {
  BrandId,
  MarketingRequestId,
  OutletId,
  UserId,
  WorkspaceId,
} from '@brandfactory/shared'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { pool } from './client'
import { createBrand, deleteBrand } from './queries/brands'
import {
  AssigneeNotFoundError,
  OutletNotInBrandError,
  createMarketingRequest,
  getMarketingRequest,
  listMarketingRequestsByWorkspace,
  softDeleteMarketingRequest,
  updateMarketingRequest,
} from './queries/marketing-requests'
import { BrandNotInWorkspaceError, createOutlet } from './queries/outlets'
import { createWorkspace, deleteWorkspace } from './queries/workspaces'
import { seed } from './seed'

// Live-DB test — only runs when DATABASE_URL is set, like every other
// `*.live.test.ts`. What only real Postgres can prove here: the per-workspace
// number under concurrent creates (the row lock, not the unique key, is what
// keeps two submits apart), the two left joins on `users`, the outlet-in-brand
// gate against real rows, and `resolved_at` following the status.
const hasDb = !!process.env.DATABASE_URL

describe.skipIf(!hasDb)('marketing requests (live DB)', () => {
  let userId: UserId
  let workspaceId: WorkspaceId
  let otherWorkspaceId: WorkspaceId
  let brandId: BrandId
  let otherBrandId: BrandId
  let outletId: OutletId
  let otherOutletId: OutletId
  const createdBrands: BrandId[] = []

  beforeAll(async () => {
    const ids = await seed()
    userId = ids.userId as UserId
    // Scratch workspaces of their own: `seed.test.ts` counts the demo one.
    workspaceId = (await createWorkspace({ name: 'MR scratch', ownerUserId: userId })).id
    otherWorkspaceId = (await createWorkspace({ name: 'MR scratch 2', ownerUserId: userId })).id
    brandId = (await createBrand({ workspaceId, name: 'Casa Vostra' })).id
    otherBrandId = (await createBrand({ workspaceId, name: 'Willow' })).id
    createdBrands.push(brandId, otherBrandId)
    outletId = (
      await createOutlet(workspaceId, {
        name: 'Casa Vostra Tanjong Pagar',
        outletType: 'restaurant',
        status: 'open',
        brandId,
      })
    ).id
    otherOutletId = (
      await createOutlet(workspaceId, {
        name: 'Willow Dempsey',
        outletType: 'restaurant',
        status: 'open',
        brandId: otherBrandId,
      })
    ).id
  })

  afterAll(async () => {
    // Cascades every request and outlet written below.
    await deleteWorkspace(workspaceId)
    await deleteWorkspace(otherWorkspaceId)
    for (const id of createdBrands) await deleteBrand(id).catch(() => undefined)
    await pool.end()
  })

  const base = {
    type: 'social_post' as const,
    priority: 'medium' as const,
    summary: 'Teasers for the set menu',
  }

  it('numbers from 1001, joins the requester, and parses as the wire shape', async () => {
    const row = await createMarketingRequest(workspaceId, userId, { ...base, brandId, outletId })
    expect(MarketingRequestSchema.parse(row)).toEqual(row)
    expect(row.number).toBe(1001)
    expect(row.reference).toBe('MR-1001')
    expect(row.status).toBe('new')
    expect(row.requestedBy?.id).toBe(userId)
    expect(row.assignee).toBeNull()
  })

  it('gives concurrent creates distinct, consecutive numbers', async () => {
    const before = (await listMarketingRequestsByWorkspace(workspaceId)).length
    const rows = await Promise.all(
      Array.from({ length: 6 }, () =>
        createMarketingRequest(workspaceId, userId, { ...base, brandId }),
      ),
    )
    const numbers = rows.map((r) => r.number).sort((a, b) => a - b)
    expect(new Set(numbers).size).toBe(6)
    expect(numbers[5]! - numbers[0]!).toBe(5)
    expect((await listMarketingRequestsByWorkspace(workspaceId)).length).toBe(before + 6)
  })

  it('numbers each workspace on its own', async () => {
    const brand = await createBrand({ workspaceId: otherWorkspaceId, name: 'Elsewhere' })
    createdBrands.push(brand.id)
    const row = await createMarketingRequest(otherWorkspaceId, userId, {
      ...base,
      brandId: brand.id,
    })
    expect(row.number).toBe(1001)
  })

  it('refuses another brand’s outlet, and a brand from another workspace', async () => {
    await expect(
      createMarketingRequest(workspaceId, userId, { ...base, brandId, outletId: otherOutletId }),
    ).rejects.toBeInstanceOf(OutletNotInBrandError)
    const foreign = await createBrand({ workspaceId: otherWorkspaceId, name: 'Foreign' })
    createdBrands.push(foreign.id)
    await expect(
      createMarketingRequest(workspaceId, userId, { ...base, brandId: foreign.id }),
    ).rejects.toBeInstanceOf(BrandNotInWorkspaceError)
  })

  it('checks a kept outlet against a new brand', async () => {
    const row = await createMarketingRequest(workspaceId, userId, { ...base, brandId, outletId })
    await expect(
      updateMarketingRequest(workspaceId, row.id, { brandId: otherBrandId }),
    ).rejects.toBeInstanceOf(OutletNotInBrandError)
    const moved = await updateMarketingRequest(workspaceId, row.id, {
      brandId: otherBrandId,
      outletId: null,
    })
    expect(moved?.brandId).toBe(otherBrandId)
    expect(moved?.outletId).toBeNull()
  })

  it('sets resolved_at on close, keeps it across closed states, clears it on reopen', async () => {
    const row = await createMarketingRequest(workspaceId, userId, { ...base, brandId })
    const resolved = await updateMarketingRequest(workspaceId, row.id, { status: 'resolved' })
    expect(resolved?.resolvedAt).not.toBeNull()
    const declined = await updateMarketingRequest(workspaceId, row.id, { status: 'declined' })
    expect(declined?.resolvedAt).toBe(resolved?.resolvedAt)
    const reopened = await updateMarketingRequest(workspaceId, row.id, { status: 'in_review' })
    expect(reopened?.resolvedAt).toBeNull()
  })

  it('assigns a real user and refuses an unknown one', async () => {
    const row = await createMarketingRequest(workspaceId, userId, { ...base, brandId })
    const assigned = await updateMarketingRequest(workspaceId, row.id, { assigneeUserId: userId })
    expect(assigned?.assignee?.id).toBe(userId)
    await expect(
      updateMarketingRequest(workspaceId, row.id, {
        assigneeUserId: '00000000-0000-4000-8000-000000000000' as UserId,
      }),
    ).rejects.toBeInstanceOf(AssigneeNotFoundError)
  })

  it('soft-deletes once, hides the row, and never reissues its number', async () => {
    const row = await createMarketingRequest(workspaceId, userId, { ...base, brandId })
    expect(await softDeleteMarketingRequest(workspaceId, row.id)).not.toBeNull()
    expect(await softDeleteMarketingRequest(workspaceId, row.id)).toBeNull()
    expect(await getMarketingRequest(workspaceId, row.id)).toBeNull()
    expect(await updateMarketingRequest(workspaceId, row.id, { status: 'resolved' })).toBeNull()
    const next = await createMarketingRequest(workspaceId, userId, { ...base, brandId })
    expect(next.number).toBe(row.number + 1)
  })

  it('misses an id from another workspace', async () => {
    const row = await createMarketingRequest(workspaceId, userId, { ...base, brandId })
    expect(await getMarketingRequest(otherWorkspaceId, row.id as MarketingRequestId)).toBeNull()
  })
})
