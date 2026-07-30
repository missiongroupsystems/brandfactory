import { BrandAssetSchema } from '@brandfactory/shared'
import type { BrandAssetId, BrandId, WorkspaceId } from '@brandfactory/shared'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { pool } from './client'
import {
  createAsset,
  listAssetsByBrand,
  reorderAssets,
  restoreAsset,
  softDeleteAsset,
  updateAsset,
} from './queries/assets'
import { listStillReferencedBlobKeys } from './queries/blob-refs'
import { createBrand, deleteBrand, listBlobKeysByBrand } from './queries/brands'
import { seed } from './seed'

// Live-DB test — only runs when DATABASE_URL is set, matching the other
// `*.live.test.ts` files, and its own file for the same reason as theirs: each
// owns the `pg` pool for its worker and ends it in `afterAll`.
//
// Three things in this phase are only provable against real Postgres:
// the `brand_assets_source_exactly_one` CHECK (a constraint nobody has watched
// fire is a constraint that may not exist), the `status` column default, and
// the widened `listBlobKeysByBrand` — which is the difference between deleting
// a brand and leaking every byte it ever uploaded.
const hasDb = !!process.env.DATABASE_URL

const SCRATCH_BRAND_NAME = 'Asset round-trip scratch brand'

describe.skipIf(!hasDb)('brand_assets (live DB)', () => {
  let workspaceId: WorkspaceId
  const created: BrandId[] = []

  beforeAll(async () => {
    const ids = await seed()
    workspaceId = ids.workspaceId as WorkspaceId
  })

  // `seed.test.ts` asserts exact row counts for the seeded brands, so nothing
  // here may outlive the suite. Assets cascade with their brand.
  afterAll(async () => {
    for (const id of created) await deleteBrand(id)
    await pool.end()
  })

  async function scratchBrand() {
    const brand = await createBrand({ workspaceId, name: SCRATCH_BRAND_NAME })
    created.push(brand.id)
    return brand
  }

  it('round-trips one asset of each source, and each parses as the shared union', async () => {
    const brand = await scratchBrand()
    await createAsset({
      brandId: brand.id,
      kind: 'color',
      source: 'inline',
      label: 'Terracotta',
      value: '#b5573c',
      role: 'primary',
      position: 100,
    })
    await createAsset({
      brandId: brand.id,
      kind: 'image',
      source: 'blob',
      label: 'Primary mark',
      blobKey: 'brands/x/mark.svg',
      role: 'logo',
      mime: 'image/svg+xml',
      filename: 'mark.svg',
      width: 96,
      height: 96,
      sizeBytes: 1240,
      alt: 'A house, drawn in one line',
      position: 100,
    })
    await createAsset({
      brandId: brand.id,
      kind: 'image',
      source: 'link',
      label: 'Wordmark on the agency CDN',
      url: 'https://cdn.example.com/wordmark.svg',
      position: 200,
    })

    const assets = await listAssetsByBrand(brand.id)
    expect(assets).toHaveLength(3)
    for (const asset of assets) {
      // The mapper's output is the wire shape. Parsing it here is what proves
      // the ISO-timestamp normalisation and the branded ids survive the trip.
      expect(BrandAssetSchema.safeParse(asset).success).toBe(true)
    }

    const blob = assets.find((a) => a.source === 'blob')
    expect(blob).toBeDefined()
    expect(blob).toMatchObject({
      alt: 'A house, drawn in one line',
      sizeBytes: 1240,
      width: 96,
      height: 96,
    })
  })

  it('defaults status to active and role to null', async () => {
    const brand = await scratchBrand()
    const asset = await createAsset({
      brandId: brand.id,
      kind: 'color',
      source: 'inline',
      label: 'Olive',
      value: '#6b7248',
      position: 100,
    })
    expect(asset.status).toBe('active')
    expect(asset.role).toBeNull()
    expect(asset.deletedAt).toBeNull()
  })

  // The constraint's whole job. Four shapes the union already rejects at the
  // wire, put straight at the table so the second half of the belt-and-braces
  // is observed rather than assumed.
  it.each([
    ['inline with no value', { source: 'inline' as const, value: null }],
    [
      'inline carrying a url',
      { source: 'inline' as const, value: '#fff', url: 'https://x.test/a' },
    ],
    ['blob with no key', { source: 'blob' as const, blobKey: null }],
    [
      'link carrying a blob key',
      { source: 'link' as const, url: 'https://x.test/a', blobKey: 'k/1' },
    ],
  ])('brand_assets_source_exactly_one rejects %s', async (_name, columns) => {
    const brand = await scratchBrand()
    await expect(
      pool.query(
        `insert into brand_assets (brand_id, kind, source, label, position, value, blob_key, url)
         values ($1, 'color', $2, 'violating row', 100, $3, $4, $5)`,
        [
          brand.id,
          columns.source,
          'value' in columns ? columns.value : null,
          'blobKey' in columns ? columns.blobKey : null,
          'url' in columns ? columns.url : null,
        ],
      ),
    ).rejects.toThrow(/brand_assets_source_exactly_one/)
  })

  it('patches label, status, role and alt, and leaves omitted columns alone', async () => {
    const brand = await scratchBrand()
    const asset = await createAsset({
      brandId: brand.id,
      kind: 'color',
      source: 'inline',
      label: 'Vermillion',
      value: '#c4442b',
      status: 'proposed',
      position: 100,
      alt: 'the awning',
    })

    const patched = await updateAsset(brand.id, asset.id, { status: 'active' })
    expect(patched?.status).toBe('active')
    // `undefined` leaves a column alone; the same rule `updateBrand` carries.
    expect(patched?.label).toBe('Vermillion')
    expect(patched?.alt).toBe('the awning')

    const cleared = await updateAsset(brand.id, asset.id, { alt: null, role: 'primary' })
    expect(cleared?.alt).toBeNull()
    expect(cleared?.role).toBe('primary')
  })

  it('will not patch an asset through the wrong brand', async () => {
    const [owner, other] = [await scratchBrand(), await scratchBrand()]
    const asset = await createAsset({
      brandId: owner.id,
      kind: 'color',
      source: 'inline',
      label: 'Ink',
      value: '#231f1c',
      position: 100,
    })
    expect(await updateAsset(other.id, asset.id, { label: 'Hijacked' })).toBeNull()
    expect(await softDeleteAsset(other.id, asset.id)).toBeNull()
    const [still] = await listAssetsByBrand(owner.id)
    expect(still?.label).toBe('Ink')
  })

  it('soft-deletes out of the read path without destroying the row', async () => {
    const brand = await scratchBrand()
    const asset = await createAsset({
      brandId: brand.id,
      kind: 'color',
      source: 'inline',
      label: 'Amber',
      value: '#dda03f',
      position: 100,
    })
    const deleted = await softDeleteAsset(brand.id, asset.id)
    expect(deleted?.deletedAt).not.toBeNull()
    expect(await listAssetsByBrand(brand.id)).toHaveLength(0)

    const { rowCount } = await pool.query('select 1 from brand_assets where id = $1', [asset.id])
    expect(rowCount).toBe(1)
  })

  // The rail shows a brand mid-decision, so a query that dropped `proposed`
  // would make the rail impossible to write without a second query.
  it('includes proposed rows in the read path', async () => {
    const brand = await scratchBrand()
    await createAsset({
      brandId: brand.id,
      kind: 'color',
      source: 'inline',
      label: 'Floated',
      value: '#123456',
      status: 'proposed',
      position: 100,
    })
    const assets = await listAssetsByBrand(brand.id)
    expect(assets.map((a) => a.status)).toEqual(['proposed'])
  })

  it('reorders atomically and rejects an id from another brand', async () => {
    const brand = await scratchBrand()
    const first = await createAsset({
      brandId: brand.id,
      kind: 'color',
      source: 'inline',
      label: 'First',
      value: '#111111',
      position: 100,
    })
    const second = await createAsset({
      brandId: brand.id,
      kind: 'color',
      source: 'inline',
      label: 'Second',
      value: '#222222',
      position: 200,
    })

    const reordered = await reorderAssets(brand.id, [
      { id: first.id, position: 300 },
      { id: second.id, position: 100 },
    ])
    expect(reordered.map((a) => a.label)).toEqual(['Second', 'First'])

    const stranger = 'ffffffff-ffff-4fff-8fff-ffffffffffff' as BrandAssetId
    await expect(
      reorderAssets(brand.id, [
        { id: second.id, position: 999 },
        { id: stranger, position: 1 },
      ]),
    ).rejects.toThrow(/not found in brand/)
    // The transaction rolled the good half back with the bad one.
    const after = await listAssetsByBrand(brand.id)
    expect(after.find((a) => a.label === 'Second')?.position).toBe(100)
  })

  // The leak this phase closes. Without the `brand_assets` arm, deleting a
  // brand orphans every byte it ever uploaded — silently and permanently.
  it('listBlobKeysByBrand returns asset blob keys, and only blob ones', async () => {
    const brand = await scratchBrand()
    await createAsset({
      brandId: brand.id,
      kind: 'image',
      source: 'blob',
      label: 'Uploaded logo',
      blobKey: 'brands/sweep-me.svg',
      position: 100,
    })
    await createAsset({
      brandId: brand.id,
      kind: 'image',
      source: 'link',
      label: 'Somebody else’s host',
      url: 'https://cdn.example.com/not-ours.svg',
      position: 200,
    })
    await createAsset({
      brandId: brand.id,
      kind: 'color',
      source: 'inline',
      label: 'A colour owns no bytes',
      value: '#b5573c',
      position: 100,
    })

    expect(await listBlobKeysByBrand(brand.id)).toEqual(['brands/sweep-me.svg'])
  })

  // A hidden asset's bytes are still the brand's, and the brand is going away.
  it('listBlobKeysByBrand includes soft-deleted assets', async () => {
    const brand = await scratchBrand()
    const asset = await createAsset({
      brandId: brand.id,
      kind: 'file',
      source: 'blob',
      label: 'Brand deck, v3',
      blobKey: 'brands/deck-v3.pdf',
      mime: 'application/pdf',
      filename: 'deck-v3.pdf',
      sizeBytes: 6_815_744,
      position: 100,
    })
    await softDeleteAsset(brand.id, asset.id)
    expect(await listBlobKeysByBrand(brand.id)).toEqual(['brands/deck-v3.pdf'])
  })

  /**
   * The Stage 1–2 review's soft-delete guards and the Undo they enable. Live
   * rather than faked because all four are `where` clauses — the one thing a
   * fake reproduces by restating rather than by executing.
   */
  it('refuses to patch or re-delete a hidden row, and restores it exactly once', async () => {
    const brand = await scratchBrand()
    const asset = await createAsset({
      brandId: brand.id,
      kind: 'color',
      source: 'inline',
      label: 'Misclicked',
      value: '#b5573c',
      position: 100,
    })

    expect(await softDeleteAsset(brand.id, asset.id)).not.toBeNull()
    // A second delete misses, so `deletedAt` cannot creep forward under an Undo
    // that is still on screen.
    expect(await softDeleteAsset(brand.id, asset.id)).toBeNull()
    // And a patch cannot land on a row no read path returns.
    expect(await updateAsset(brand.id, asset.id, { label: 'Resurrected' })).toBeNull()
    expect(await listAssetsByBrand(brand.id)).toHaveLength(0)

    const restored = await restoreAsset(brand.id, asset.id)
    expect(restored?.deletedAt).toBeNull()
    expect(restored?.label).toBe('Misclicked')
    // Back at the position it never lost — a restore is a state change.
    expect(restored?.position).toBe(100)
    // Replaying the Undo is inert rather than a no-op write on a live row.
    expect(await restoreAsset(brand.id, asset.id)).toBeNull()
    expect(await listAssetsByBrand(brand.id)).toHaveLength(1)
  })

  /**
   * The sweep subtraction. `listBlobKeysByBrand` says what a brand *held*;
   * this says what is *still held elsewhere*, and the difference is what the
   * cascade is allowed to destroy.
   */
  it('listStillReferencedBlobKeys finds every surviving reference, hidden ones included', async () => {
    const keeper = await scratchBrand()
    const going = await scratchBrand()
    const shared = 'brands/shared-mark.svg'

    for (const brand of [keeper, going]) {
      await createAsset({
        brandId: brand.id,
        kind: 'image',
        source: 'blob',
        label: 'Mark',
        blobKey: shared,
        position: 100,
      })
    }
    const soleOwner = await createAsset({
      brandId: going.id,
      kind: 'image',
      source: 'blob',
      label: 'Only ours',
      blobKey: 'brands/only-ours.svg',
      position: 200,
    })
    // A link row names somebody else's host and owns no bytes of ours.
    await createAsset({
      brandId: keeper.id,
      kind: 'image',
      source: 'link',
      label: 'Elsewhere',
      url: 'https://cdn.example.com/elsewhere.svg',
      position: 300,
    })

    const held = await listBlobKeysByBrand(going.id)
    await deleteBrand(going.id)
    created.splice(created.indexOf(going.id), 1)

    const stillReferenced = await listStillReferencedBlobKeys(held)
    // The keeper's row survived the cascade and still points at the shared key.
    expect(stillReferenced).toEqual([shared])
    // So the cascade may destroy exactly one of the two keys it held.
    expect(held.filter((k) => !stillReferenced.includes(k))).toEqual(['brands/only-ours.svg'])
    void soleOwner

    // A hidden row is still a reference — it can come back.
    const hidden = await createAsset({
      brandId: keeper.id,
      kind: 'image',
      source: 'blob',
      label: 'Hidden',
      blobKey: 'brands/hidden.svg',
      position: 400,
    })
    await softDeleteAsset(keeper.id, hidden.id)
    expect(await listStillReferencedBlobKeys(['brands/hidden.svg'])).toEqual(['brands/hidden.svg'])
  })

  it('listStillReferencedBlobKeys asks nothing of an empty list', async () => {
    expect(await listStillReferencedBlobKeys([])).toEqual([])
  })

  it('cascades assets when the brand is deleted', async () => {
    const brand = await createBrand({ workspaceId, name: SCRATCH_BRAND_NAME })
    await createAsset({
      brandId: brand.id,
      kind: 'color',
      source: 'inline',
      label: 'Doomed',
      value: '#000000',
      position: 100,
    })
    await deleteBrand(brand.id)
    const { rowCount } = await pool.query('select 1 from brand_assets where brand_id = $1', [
      brand.id,
    ])
    expect(rowCount).toBe(0)
  })
})
