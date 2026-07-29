import { beforeEach, describe, expect, it } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import type { BrandAsset } from '@brandfactory/shared'
import { applyAssetToCache } from './assets'
import { brandKeys } from './brands'

const BRAND_ID = '22222222-2222-4222-8222-222222222222'
const T0 = '2026-07-29T00:00:00.000Z'

function color(id: string, label: string, position: number, over: Partial<BrandAsset> = {}) {
  return {
    id: id as BrandAsset['id'],
    brandId: BRAND_ID as BrandAsset['brandId'],
    kind: 'color',
    source: 'inline',
    value: '#b5573c',
    role: null,
    status: 'active',
    label,
    position,
    deletedAt: null,
    createdAt: T0,
    updatedAt: T0,
    ...over,
  } as BrandAsset
}

const TERRACOTTA = color('a-1', 'Terracotta', 100)
const OLIVE = color('a-2', 'Olive', 200)

let qc: QueryClient

beforeEach(() => {
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
})

function seed(assets: BrandAsset[]) {
  qc.setQueryData(brandKeys.assets(BRAND_ID), assets)
}

function read() {
  return qc.getQueryData<BrandAsset[]>(brandKeys.assets(BRAND_ID))
}

describe('applyAssetToCache', () => {
  it('appends a newly created asset in the order the server gave it', () => {
    seed([TERRACOTTA])
    applyAssetToCache(qc, BRAND_ID, OLIVE)
    expect(read()?.map((a) => a.label)).toEqual(['Terracotta', 'Olive'])
  })

  // Patched in rather than invalidated, so a create must not be able to
  // duplicate a row it is really replacing.
  it('replaces in place rather than appending a second copy', () => {
    seed([TERRACOTTA, OLIVE])
    applyAssetToCache(qc, BRAND_ID, { ...TERRACOTTA, label: 'Terracotta 500' })
    const rows = read()
    expect(rows).toHaveLength(2)
    expect(rows?.map((a) => a.label)).toEqual(['Terracotta 500', 'Olive'])
  })

  /**
   * A soft-deleted row leaves the list rather than sitting in it with a
   * `deletedAt` every renderer would have to remember to filter. The server's
   * own read path drops it, so this is what makes the cache agree with a
   * refetch instead of diverging until one happens.
   */
  it('drops a soft-deleted asset out of the list', () => {
    seed([TERRACOTTA, OLIVE])
    applyAssetToCache(qc, BRAND_ID, { ...TERRACOTTA, deletedAt: T0 })
    expect(read()?.map((a) => a.label)).toEqual(['Olive'])
  })

  it('is a no-op when the soft-deleted asset was not cached', () => {
    seed([OLIVE])
    applyAssetToCache(qc, BRAND_ID, { ...TERRACOTTA, deletedAt: T0 })
    expect(read()?.map((a) => a.label)).toEqual(['Olive'])
  })

  /**
   * The pending/empty distinction, at the cache layer.
   *
   * `undefined` means the query has never resolved, and seeding a one-row list
   * into it would make the rail render a palette block for a brand whose real
   * palette is still unknown — then swap it for the true list a moment later.
   * The mutation's own response is not a substitute for the query.
   */
  it('leaves an unseeded cache untouched rather than inventing a list', () => {
    applyAssetToCache(qc, BRAND_ID, TERRACOTTA)
    expect(read()).toBeUndefined()
  })

  it('writes into an empty list, which is a real state and not an absent one', () => {
    seed([])
    applyAssetToCache(qc, BRAND_ID, TERRACOTTA)
    expect(read()?.map((a) => a.label)).toEqual(['Terracotta'])
  })

  it('does not touch another brand’s list', () => {
    const OTHER = '55555555-5555-4555-8555-555555555555'
    seed([TERRACOTTA])
    qc.setQueryData(brandKeys.assets(OTHER), [OLIVE])
    applyAssetToCache(qc, BRAND_ID, { ...TERRACOTTA, label: 'Renamed' })
    expect(qc.getQueryData<BrandAsset[]>(brandKeys.assets(OTHER))?.map((a) => a.label)).toEqual([
      'Olive',
    ])
  })

  it('does not mutate the array it was given', () => {
    const before = [TERRACOTTA, OLIVE]
    seed(before)
    applyAssetToCache(qc, BRAND_ID, { ...OLIVE, label: 'Olive 500' })
    expect(before.map((a) => a.label)).toEqual(['Terracotta', 'Olive'])
  })
})

describe('brandKeys.assets', () => {
  /**
   * `['brands', id]` is a prefix of `['brands', id, 'assets']`, which is what
   * makes `useDeleteBrand`'s `removeQueries({ queryKey: brandKeys.detail(id) })`
   * take the asset list with it. Deleting a brand and landing on a new one that
   * reuses a cached asset list would be a cross-brand leak; this is the reason
   * it cannot happen, and it is a property of the key shape rather than of any
   * code that could be edited to preserve it.
   */
  it('nests under the brand detail key so a brand delete sweeps it', () => {
    seed([TERRACOTTA])
    qc.removeQueries({ queryKey: brandKeys.detail(BRAND_ID) })
    expect(read()).toBeUndefined()
  })
})
