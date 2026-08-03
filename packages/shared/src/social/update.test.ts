import { describe, expect, it } from 'vitest'
import { UpdateSocialPostInputSchema } from '../index'

describe('UpdateSocialPostInputSchema', () => {
  it('rejects an empty patch', () => {
    expect(UpdateSocialPostInputSchema.safeParse({}).success).toBe(false)
  })

  it('accepts a single-key patch', () => {
    expect(UpdateSocialPostInputSchema.safeParse({ status: 'posted' }).success).toBe(true)
    expect(UpdateSocialPostInputSchema.safeParse({ body: '' }).success).toBe(true)
  })

  // The one nullable patch key: null moves the post to the unscheduled tray.
  it('accepts scheduledAt: null as an unschedule', () => {
    const parsed = UpdateSocialPostInputSchema.parse({ scheduledAt: null })
    expect(parsed.scheduledAt).toBeNull()
  })

  it('accepts assetIds: [] as a full clear', () => {
    const parsed = UpdateSocialPostInputSchema.parse({ assetIds: [] })
    expect(parsed.assetIds).toEqual([])
  })

  // Deletion is its own verb (DELETE / restore); zod strips the unknown key,
  // which leaves the patch empty — so the shape is rejected, not silently
  // half-honoured.
  it('does not accept deletedAt as a patch key', () => {
    expect(UpdateSocialPostInputSchema.safeParse({ deletedAt: null }).success).toBe(false)
    expect(
      UpdateSocialPostInputSchema.safeParse({ deletedAt: '2026-08-01T00:00:00.000Z' }).success,
    ).toBe(false)
  })

  it('rejects nulls on the non-nullable keys', () => {
    expect(UpdateSocialPostInputSchema.safeParse({ platform: null }).success).toBe(false)
    expect(UpdateSocialPostInputSchema.safeParse({ body: null }).success).toBe(false)
    expect(UpdateSocialPostInputSchema.safeParse({ status: null }).success).toBe(false)
    expect(UpdateSocialPostInputSchema.safeParse({ assetIds: null }).success).toBe(false)
  })

  it('enforces the shared maxes', () => {
    expect(UpdateSocialPostInputSchema.safeParse({ body: 'x'.repeat(5001) }).success).toBe(false)
    expect(
      UpdateSocialPostInputSchema.safeParse({
        assetIds: Array.from({ length: 21 }, (_, i) => `a-${i}`),
      }).success,
    ).toBe(false)
  })
})
