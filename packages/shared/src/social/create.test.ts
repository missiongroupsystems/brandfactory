import { describe, expect, it } from 'vitest'
import { CreateSocialPostInputSchema } from '../index'

describe('CreateSocialPostInputSchema', () => {
  // A post can be claimed with nothing but a destination; the server owns
  // the defaults, so omitted keys must stay omitted rather than parse to
  // values the route would then have to distinguish from client intent.
  //
  // `createdBy` is the one exception, and it is deliberate: an absent author
  // has exactly one honest meaning, so it is decided here rather than in the
  // query layer, the fake and the route each guessing separately.
  it('accepts platform alone and leaves the defaults to the server', () => {
    const parsed = CreateSocialPostInputSchema.parse({ platform: 'tiktok' })
    expect(parsed).toEqual({ platform: 'tiktok', createdBy: 'user' })
    expect(parsed.body).toBeUndefined()
    expect(parsed.scheduledAt).toBeUndefined()
  })

  it('defaults the author to the person — the meaning every older client had', () => {
    expect(CreateSocialPostInputSchema.parse({ platform: 'tiktok' }).createdBy).toBe('user')
  })

  it('carries an explicit agent author through', () => {
    expect(
      CreateSocialPostInputSchema.parse({ platform: 'tiktok', createdBy: 'agent' }).createdBy,
    ).toBe('agent')
  })

  it('rejects an author outside the enum', () => {
    expect(
      CreateSocialPostInputSchema.safeParse({ platform: 'tiktok', createdBy: 'planner' }).success,
    ).toBe(false)
  })

  it('rejects a body without a platform', () => {
    expect(CreateSocialPostInputSchema.safeParse({ body: 'Launch day.' }).success).toBe(false)
  })

  // "Create unscheduled" spelled explicitly is the same statement as omitting
  // the field — two client shapes, one server meaning.
  it('accepts an explicit null scheduledAt', () => {
    const parsed = CreateSocialPostInputSchema.parse({ platform: 'x', scheduledAt: null })
    expect(parsed.scheduledAt).toBeNull()
  })

  it('accepts the full shape', () => {
    const parsed = CreateSocialPostInputSchema.parse({
      platform: 'instagram',
      scheduledAt: '2026-08-14T10:30:00.000Z',
      body: 'Launch day.',
      status: 'ready',
      assetIds: ['a-1'],
    })
    expect(parsed.status).toBe('ready')
    expect(parsed.assetIds).toEqual(['a-1'])
  })

  it('enforces the shared maxes', () => {
    expect(
      CreateSocialPostInputSchema.safeParse({ platform: 'other', body: 'x'.repeat(5001) }).success,
    ).toBe(false)
    expect(
      CreateSocialPostInputSchema.safeParse({
        platform: 'other',
        assetIds: Array.from({ length: 21 }, (_, i) => `a-${i}`),
      }).success,
    ).toBe(false)
  })
})
