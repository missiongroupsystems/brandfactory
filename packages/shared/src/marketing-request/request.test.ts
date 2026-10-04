import { describe, expect, it } from 'vitest'
import {
  CreateMarketingRequestInputSchema,
  UpdateMarketingRequestInputSchema,
  isClosedStatus,
  marketingRequestReference,
} from './request'

const MINIMAL = { brandId: 'b-1', type: 'social_post', summary: 'Teasers for the set menu' }

describe('CreateMarketingRequestInputSchema', () => {
  it('needs only a brand, a type and a summary, and defaults the priority', () => {
    const parsed = CreateMarketingRequestInputSchema.parse(MINIMAL)
    expect(parsed.priority).toBe('medium')
  })

  it('takes no status and no requester — both are the server’s', () => {
    const parsed = CreateMarketingRequestInputSchema.parse({
      ...MINIMAL,
      status: 'resolved',
      requestedByUserId: 'u-2',
    })
    expect(parsed).not.toHaveProperty('status')
    expect(parsed).not.toHaveProperty('requestedByUserId')
  })

  it('rejects a blank summary after trimming', () => {
    expect(
      CreateMarketingRequestInputSchema.safeParse({ ...MINIMAL, summary: '   ' }).success,
    ).toBe(false)
  })

  it('rejects a needed-by date that is really a timestamp', () => {
    const result = CreateMarketingRequestInputSchema.safeParse({
      ...MINIMAL,
      neededBy: '2026-10-09T00:00:00Z',
    })
    expect(result.success).toBe(false)
  })

  it('rejects a type the form does not offer', () => {
    expect(
      CreateMarketingRequestInputSchema.safeParse({ ...MINIMAL, type: 'poster' }).success,
    ).toBe(false)
  })
})

describe('UpdateMarketingRequestInputSchema', () => {
  it('accepts null to clear the outlet, the date and the assignee', () => {
    const parsed = UpdateMarketingRequestInputSchema.parse({
      outletId: null,
      neededBy: null,
      assigneeUserId: null,
    })
    expect(parsed).toEqual({ outletId: null, neededBy: null, assigneeUserId: null })
  })

  it('does not accept a brand of null — a request always has one', () => {
    expect(UpdateMarketingRequestInputSchema.safeParse({ brandId: null }).success).toBe(false)
  })
})

describe('the reference and the closing states', () => {
  it('formats the number as MR-<n>', () => {
    expect(marketingRequestReference(1001)).toBe('MR-1001')
  })

  it('counts declined as closed, as resolved is', () => {
    expect(isClosedStatus('resolved')).toBe(true)
    expect(isClosedStatus('declined')).toBe(true)
    expect(isClosedStatus('new')).toBe(false)
    expect(isClosedStatus('in_review')).toBe(false)
  })
})
