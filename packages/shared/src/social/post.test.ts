import { describe, expect, it } from 'vitest'
import {
  SocialPlatformSchema,
  SocialPostCreatedBySchema,
  SocialPostSchema,
  SocialPostStatusSchema,
  bySchedule,
  type BrandAssetId,
  type BrandId,
  type SocialPost,
  type SocialPostId,
} from '../index'

const BRAND = 'b-1' as BrandId
const T0 = '2026-08-01T09:00:00.000Z'

function post(id: string, over: Partial<SocialPost> = {}): SocialPost {
  return {
    id: id as SocialPostId,
    brandId: BRAND,
    platform: 'instagram',
    scheduledAt: null,
    body: '',
    status: 'draft',
    createdBy: 'user',
    assetIds: [],
    deletedAt: null,
    createdAt: T0,
    updatedAt: T0,
    ...over,
  } as SocialPost
}

describe('SocialPlatformSchema', () => {
  it('carries exactly the eight platforms', () => {
    expect(SocialPlatformSchema.options).toEqual([
      'instagram',
      'facebook',
      'tiktok',
      'linkedin',
      'x',
      'youtube',
      'pinterest',
      'other',
    ])
  })
})

describe('SocialPostStatusSchema', () => {
  it('carries exactly the three manual states', () => {
    expect(SocialPostStatusSchema.options).toEqual(['draft', 'ready', 'posted'])
  })
})

describe('SocialPostCreatedBySchema', () => {
  it('spells the writer `agent`, matching the guideline and canvas enums', () => {
    // One word for one meaning, across three tables. The product name for this
    // particular writer is the Post Planner, and it does not appear here.
    expect(SocialPostCreatedBySchema.options).toEqual(['user', 'agent'])
  })
})

describe('SocialPostSchema', () => {
  it('accepts a scheduled post with attachments', () => {
    const parsed = SocialPostSchema.parse(
      post('p', {
        scheduledAt: '2026-08-14T10:30:00.000Z',
        body: 'Launch day.',
        status: 'ready',
        assetIds: ['a-1', 'a-2'] as BrandAssetId[],
      }),
    )
    expect(parsed.scheduledAt).toBe('2026-08-14T10:30:00.000Z')
    expect(parsed.assetIds).toEqual(['a-1', 'a-2'])
  })

  // null = the unscheduled tray, a first-class state, not a missing field.
  it('round-trips a null scheduledAt', () => {
    const parsed = SocialPostSchema.parse(post('p'))
    expect(parsed.scheduledAt).toBeNull()
  })

  it('accepts the empty body — slot claimed, copy pending', () => {
    expect(SocialPostSchema.safeParse(post('p', { body: '' })).success).toBe(true)
  })

  it('rejects a body over 5000 characters', () => {
    expect(SocialPostSchema.safeParse(post('p', { body: 'x'.repeat(5001) })).success).toBe(false)
    expect(SocialPostSchema.safeParse(post('p', { body: 'x'.repeat(5000) })).success).toBe(true)
  })

  it('rejects more than 20 attachments', () => {
    const ids = Array.from({ length: 21 }, (_, i) => `a-${i}`) as BrandAssetId[]
    expect(SocialPostSchema.safeParse(post('p', { assetIds: ids })).success).toBe(false)
    expect(SocialPostSchema.safeParse(post('p', { assetIds: ids.slice(0, 20) })).success).toBe(true)
  })

  // The join table's PK is (post_id, asset_id): a duplicate attachment is
  // unrepresentable, so it must die here as a 400, not as a unique-violation
  // 500 from the insert.
  it('rejects duplicate assetIds', () => {
    const dup = ['a-1', 'a-2', 'a-1'] as BrandAssetId[]
    expect(SocialPostSchema.safeParse(post('p', { assetIds: dup })).success).toBe(false)
  })

  it('rejects a platform outside the enum', () => {
    expect(SocialPostSchema.safeParse({ ...post('p'), platform: 'threads' }).success).toBe(false)
  })

  it('rejects a non-ISO scheduledAt', () => {
    expect(SocialPostSchema.safeParse({ ...post('p'), scheduledAt: '2026-08-14' }).success).toBe(
      false,
    )
  })
})

describe('bySchedule', () => {
  // Mirrors the SQL: scheduled_at asc nulls first, created_at asc.
  it('puts the unscheduled group first', () => {
    const sorted = [
      post('scheduled', { scheduledAt: '2026-08-10T08:00:00.000Z' }),
      post('tray'),
    ].sort(bySchedule)
    expect(sorted.map((p) => p.id)).toEqual(['tray', 'scheduled'])
  })

  it('orders scheduled posts chronologically', () => {
    const sorted = [
      post('late', { scheduledAt: '2026-08-20T08:00:00.000Z' }),
      post('early', { scheduledAt: '2026-08-05T08:00:00.000Z' }),
      post('mid', { scheduledAt: '2026-08-10T08:00:00.000Z' }),
    ].sort(bySchedule)
    expect(sorted.map((p) => p.id)).toEqual(['early', 'mid', 'late'])
  })

  it('breaks ties — same slot, and within the tray — by createdAt', () => {
    const slot = '2026-08-10T08:00:00.000Z'
    const sorted = [
      post('second', { scheduledAt: slot, createdAt: '2026-08-02T00:00:00.000Z' }),
      post('first', { scheduledAt: slot, createdAt: '2026-08-01T00:00:00.000Z' }),
      post('tray-second', { createdAt: '2026-08-02T00:00:00.000Z' }),
      post('tray-first', { createdAt: '2026-08-01T00:00:00.000Z' }),
    ].sort(bySchedule)
    expect(sorted.map((p) => p.id)).toEqual(['tray-first', 'tray-second', 'first', 'second'])
  })
})
