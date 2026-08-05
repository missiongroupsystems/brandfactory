import { SocialPostSchema } from '@brandfactory/shared'
import type { BrandId, SocialPostId, WorkspaceId } from '@brandfactory/shared'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { pool } from './client'
import { createAsset, softDeleteAsset } from './queries/assets'
import { createBrand, deleteBrand } from './queries/brands'
import {
  AssetNotInBrandError,
  createSocialPost,
  listSocialPostsByBrand,
  restoreSocialPost,
  softDeleteSocialPost,
  updateSocialPost,
} from './queries/social-posts'
import { seed } from './seed'

// Live-DB test — only runs when DATABASE_URL is set, matching the other
// `*.live.test.ts` files, and its own file for the same reason as theirs: each
// owns the `pg` pool for its worker and ends it in `afterAll`.
//
// What is only provable against real Postgres here: the `nulls first` read
// ordering, the ownership check and the join-row writes seeing one snapshot
// (a bad assetId rolls the whole create back), and the two cascades — post →
// join rows on hard brand delete, asset → join rows on hard asset delete.
const hasDb = !!process.env.DATABASE_URL

const SCRATCH_BRAND_NAME = 'Social post round-trip scratch brand'

describe.skipIf(!hasDb)('social_posts (live DB)', () => {
  let workspaceId: WorkspaceId
  const created: BrandId[] = []

  beforeAll(async () => {
    const ids = await seed()
    workspaceId = ids.workspaceId as WorkspaceId
  })

  // `seed.test.ts` asserts exact row counts for the seeded brands, so nothing
  // here may outlive the suite. Posts and join rows cascade with their brand.
  afterAll(async () => {
    for (const id of created) await deleteBrand(id)
    await pool.end()
  })

  async function scratchBrand() {
    const brand = await createBrand({ workspaceId, name: SCRATCH_BRAND_NAME })
    created.push(brand.id)
    return brand
  }

  async function scratchAsset(brandId: BrandId, label: string, position: number) {
    return createAsset({
      brandId,
      kind: 'image',
      source: 'blob',
      library: 'photography',
      label,
      blobKey: `brands/${label}.jpg`,
      position,
    })
  }

  it('round-trips scheduled and unscheduled posts, in calendar order, each parsing as the wire shape', async () => {
    const brand = await scratchBrand()
    const late = await createSocialPost(brand.id, {
      platform: 'instagram',
      scheduledAt: '2026-08-20T10:00:00.000Z',
      body: 'Launch day.',
    })
    const tray = await createSocialPost(brand.id, { platform: 'other' })
    const early = await createSocialPost(brand.id, {
      platform: 'linkedin',
      scheduledAt: '2026-08-05T08:00:00.000Z',
      status: 'ready',
    })

    const posts = await listSocialPostsByBrand(brand.id)
    // The SQL ordering `bySchedule` mirrors: nulls first, then chronological.
    expect(posts.map((p) => p.id)).toEqual([tray.id, early.id, late.id])
    for (const post of posts) {
      // The mapper's output is the wire shape. Parsing it here is what proves
      // the ISO-timestamp normalisation and the branded ids survive the trip.
      expect(SocialPostSchema.safeParse(post).success).toBe(true)
    }
    expect(posts[0]?.scheduledAt).toBeNull()
  })

  it('defaults body to empty, status to draft, scheduledAt to null', async () => {
    const brand = await scratchBrand()
    const post = await createSocialPost(brand.id, { platform: 'tiktok' })
    expect(post.body).toBe('')
    expect(post.status).toBe('draft')
    expect(post.scheduledAt).toBeNull()
    expect(post.assetIds).toEqual([])
    expect(post.deletedAt).toBeNull()
  })

  it('attachment order is the array order, and survives the round trip', async () => {
    const brand = await scratchBrand()
    const [a, b, c] = await Promise.all([
      scratchAsset(brand.id, 'first', 100),
      scratchAsset(brand.id, 'second', 200),
      scratchAsset(brand.id, 'third', 300),
    ])
    const post = await createSocialPost(brand.id, {
      platform: 'pinterest',
      assetIds: [c!.id, a!.id, b!.id],
    })
    expect(post.assetIds).toEqual([c!.id, a!.id, b!.id])

    const [listed] = await listSocialPostsByBrand(brand.id)
    expect(listed?.assetIds).toEqual([c!.id, a!.id, b!.id])

    // Sparse positions, (i + 1) * 100 — room to renumber without touching
    // neighbours, as `brand_assets.position` already works.
    const { rows } = await pool.query(
      'select position from social_post_assets where post_id = $1 order by position',
      [post.id],
    )
    expect(rows.map((r) => r.position)).toEqual([100, 200, 300])
  })

  it('rejects a cross-brand assetId and rolls the whole create back', async () => {
    const [owner, other] = [await scratchBrand(), await scratchBrand()]
    const foreign = await scratchAsset(other.id, 'not-yours', 100)
    await expect(
      createSocialPost(owner.id, { platform: 'x', assetIds: [foreign.id] }),
    ).rejects.toThrow(AssetNotInBrandError)
    // The transaction rolled the post back with the join rows.
    expect(await listSocialPostsByBrand(owner.id)).toHaveLength(0)
  })

  it('rejects a soft-deleted assetId on create and on patch', async () => {
    const brand = await scratchBrand()
    const hidden = await scratchAsset(brand.id, 'hidden', 100)
    await softDeleteAsset(brand.id, hidden.id)
    await expect(
      createSocialPost(brand.id, { platform: 'facebook', assetIds: [hidden.id] }),
    ).rejects.toThrow(AssetNotInBrandError)

    const post = await createSocialPost(brand.id, { platform: 'facebook' })
    await expect(updateSocialPost(brand.id, post.id, { assetIds: [hidden.id] })).rejects.toThrow(
      AssetNotInBrandError,
    )
  })

  it('patches with updateAsset semantics: omitted keys stay, assetIds is a full replacement', async () => {
    const brand = await scratchBrand()
    const [a, b] = await Promise.all([
      scratchAsset(brand.id, 'a', 100),
      scratchAsset(brand.id, 'b', 200),
    ])
    const post = await createSocialPost(brand.id, {
      platform: 'youtube',
      scheduledAt: '2026-08-14T10:30:00.000Z',
      body: 'Cut one.',
      assetIds: [a!.id],
    })

    // Omitted `assetIds` leaves the attachments alone.
    const retitled = await updateSocialPost(brand.id, post.id, { body: 'Cut two.' })
    expect(retitled?.body).toBe('Cut two.')
    expect(retitled?.platform).toBe('youtube')
    expect(retitled?.assetIds).toEqual([a!.id])

    // Full replacement is add/remove/reorder in one verb.
    const swapped = await updateSocialPost(brand.id, post.id, { assetIds: [b!.id, a!.id] })
    expect(swapped?.assetIds).toEqual([b!.id, a!.id])
    const cleared = await updateSocialPost(brand.id, post.id, { assetIds: [] })
    expect(cleared?.assetIds).toEqual([])

    // `scheduledAt: null` moves the post to the tray.
    const unscheduled = await updateSocialPost(brand.id, post.id, { scheduledAt: null })
    expect(unscheduled?.scheduledAt).toBeNull()
  })

  it('will not patch or delete a post through the wrong brand', async () => {
    const [owner, other] = [await scratchBrand(), await scratchBrand()]
    const post = await createSocialPost(owner.id, { platform: 'instagram', body: 'Mine.' })
    expect(await updateSocialPost(other.id, post.id, { body: 'Hijacked.' })).toBeNull()
    expect(await softDeleteSocialPost(other.id, post.id)).toBeNull()
    const [still] = await listSocialPostsByBrand(owner.id)
    expect(still?.body).toBe('Mine.')
  })

  it('refuses to patch or re-delete a hidden post, and restores it once, attachments intact', async () => {
    const brand = await scratchBrand()
    const asset = await scratchAsset(brand.id, 'kept', 100)
    const post = await createSocialPost(brand.id, {
      platform: 'linkedin',
      body: 'Misclicked.',
      assetIds: [asset.id],
    })

    const deleted = await softDeleteSocialPost(brand.id, post.id)
    expect(deleted?.deletedAt).not.toBeNull()
    expect(await listSocialPostsByBrand(brand.id)).toHaveLength(0)
    // A second delete misses, so `deletedAt` cannot creep forward under an
    // Undo that is still on screen; a patch cannot land on a hidden row.
    expect(await softDeleteSocialPost(brand.id, post.id)).toBeNull()
    expect(await updateSocialPost(brand.id, post.id, { body: 'Resurrected.' })).toBeNull()

    // Join rows were untouched, so restore brings the attachments back.
    const restored = await restoreSocialPost(brand.id, post.id)
    expect(restored?.deletedAt).toBeNull()
    expect(restored?.body).toBe('Misclicked.')
    expect(restored?.assetIds).toEqual([asset.id])
    // Replaying the Undo is inert rather than a no-op write on a live row.
    expect(await restoreSocialPost(brand.id, post.id)).toBeNull()
    expect(await listSocialPostsByBrand(brand.id)).toHaveLength(1)
  })

  it('cascades posts and join rows when the brand is deleted', async () => {
    const brand = await createBrand({ workspaceId, name: SCRATCH_BRAND_NAME })
    const asset = await scratchAsset(brand.id, 'doomed', 100)
    const post = await createSocialPost(brand.id, {
      platform: 'instagram',
      assetIds: [asset.id],
    })
    await deleteBrand(brand.id)
    const posts = await pool.query('select 1 from social_posts where brand_id = $1', [brand.id])
    expect(posts.rowCount).toBe(0)
    const joins = await pool.query('select 1 from social_post_assets where post_id = $1', [post.id])
    expect(joins.rowCount).toBe(0)
  })

  // The other cascade: a hard-deleted asset takes its join rows with it —
  // distinct from soft-delete, where the rows stay and the client skips
  // unresolved ids. Hard asset deletes only happen via the brand cascade
  // today, but the FK should be observed, not assumed.
  it('cascades join rows when an asset is hard-deleted, leaving the post standing', async () => {
    const brand = await scratchBrand()
    const asset = await scratchAsset(brand.id, 'yanked', 100)
    const post = await createSocialPost(brand.id, { platform: 'x', assetIds: [asset.id] })
    await pool.query('delete from brand_assets where id = $1', [asset.id])
    const [listed] = await listSocialPostsByBrand(brand.id)
    expect(listed?.id).toBe(post.id)
    expect(listed?.assetIds).toEqual([])
  })

  it('misses an unknown postId rather than throwing', async () => {
    const brand = await scratchBrand()
    const stranger = 'ffffffff-ffff-4fff-8fff-ffffffffffff' as SocialPostId
    expect(await updateSocialPost(brand.id, stranger, { body: 'ghost' })).toBeNull()
    expect(await softDeleteSocialPost(brand.id, stranger)).toBeNull()
    expect(await restoreSocialPost(brand.id, stranger)).toBeNull()
  })
})
