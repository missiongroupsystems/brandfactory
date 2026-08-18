import { describe, expect, it } from 'vitest'
import { CreateInfluencerInputSchema } from './create'
import {
  InfluencerBrandIdsSchema,
  InfluencerEngagementRateSchema,
  InfluencerFollowersSchema,
  InfluencerHandleSchema,
  InfluencerPlatformSchema,
  InfluencerStatusSchema,
  InfluencerVerticalSchema,
  byInfluencerReach,
  type Influencer,
} from './influencer'
import { INFLUENCER_SLUG_FALLBACK, influencerSlug, uniqueInfluencerSlug } from './slug'
import { UpdateInfluencerInputSchema } from './update'

// The enum member lists are duplicated with the pgEnums in `@brandfactory/db`,
// per the zod-⇄-pgEnum convention. These three tests are the pin: a member added
// to one side and not the other fails here, which is the only place that reads
// both as data.
describe('the enums', () => {
  it('holds six platforms, xiaohongshu among them', () => {
    expect(InfluencerPlatformSchema.options).toEqual([
      'instagram',
      'tiktok',
      'youtube',
      'xiaohongshu',
      'facebook',
      'linkedin',
    ])
  })

  it('holds ten verticals and no "other" — a generalist is null instead', () => {
    expect(InfluencerVerticalSchema.options).toEqual([
      'beauty',
      'fashion',
      'food',
      'fitness',
      'travel',
      'home',
      'tech',
      'parenting',
      'motoring',
      'family',
    ])
    expect(InfluencerVerticalSchema.options).not.toContain('other')
  })

  it('holds three statuses and no "archived" — a past creator is looked up', () => {
    expect(InfluencerStatusSchema.options).toEqual(['active', 'prospect', 'past'])
  })
})

describe('InfluencerHandleSchema', () => {
  it('accepts a bare handle', () => {
    expect(InfluencerHandleSchema.parse('  priyaskin  ')).toBe('priyaskin')
  })

  it('rejects a leading @ rather than stripping it', () => {
    // Stripping would accept two spellings of one handle, and both would pass the
    // unique key on `(workspace_id, platform, handle)`.
    expect(InfluencerHandleSchema.safeParse('@priyaskin').success).toBe(false)
  })

  it('accepts a handle that is not latin at all', () => {
    // A xiaohongshu handle. Refusing an import over a character class is the
    // failure `OutletAttributesSchema` already argues against; the slug falls back.
    expect(InfluencerHandleSchema.safeParse('小红书美食').success).toBe(true)
  })
})

describe('InfluencerFollowersSchema', () => {
  it('accepts zero — a new account is a row this table has to hold', () => {
    expect(InfluencerFollowersSchema.safeParse(0).success).toBe(true)
  })

  it('rejects a negative count and a fractional one', () => {
    expect(InfluencerFollowersSchema.safeParse(-1).success).toBe(false)
    expect(InfluencerFollowersSchema.safeParse(1240.5).success).toBe(false)
  })
})

describe('InfluencerEngagementRateSchema', () => {
  it('accepts a percent', () => {
    expect(InfluencerEngagementRateSchema.parse(3.8)).toBe(3.8)
  })

  it('rejects a figure above 100 — it is a percentage of an audience', () => {
    expect(InfluencerEngagementRateSchema.safeParse(120).success).toBe(false)
  })
})

describe('InfluencerBrandIdsSchema', () => {
  it('accepts an empty array — "not engaged yet" is a fact', () => {
    expect(InfluencerBrandIdsSchema.parse([])).toEqual([])
  })

  it('rejects duplicates, because the join table is keyed on the pair', () => {
    // A repeated id would take a unique violation inside the write transaction,
    // which reaches the client as a 500 for what is really a malformed body.
    expect(InfluencerBrandIdsSchema.safeParse(['b1', 'b1']).success).toBe(false)
  })
})

describe('influencerSlug', () => {
  it('is the handle, lowercased', () => {
    expect(influencerSlug('PriyaSkin')).toBe('priyaskin')
  })

  it('separates on the punctuation a handle carries', () => {
    expect(influencerSlug('priya.skin_sg')).toBe('priya-skin-sg')
  })

  it('falls back to "creator", not to "outlet"', () => {
    // The fallback word is a parameter for exactly this: a xiaohongshu handle
    // survives `slugify` as nothing.
    expect(influencerSlug('小红书美食')).toBe(INFLUENCER_SLUG_FALLBACK)
    expect(INFLUENCER_SLUG_FALLBACK).toBe('creator')
  })
})

describe('uniqueInfluencerSlug', () => {
  it('suffixes the second row for one person on two platforms', () => {
    // The known cost of slugging from the handle, stated in `InfluencerSlugSchema`.
    expect(uniqueInfluencerSlug('priyaskin', ['priyaskin'])).toBe('priyaskin-2')
  })
})

describe('byInfluencerReach', () => {
  // The comparator reads three fields, so the fixture states three. The cast is
  // what keeps a branded id out of a sort test.
  function creator(followers: number, id: string, name = 'Somebody'): Influencer {
    return { followers, id, name } as unknown as Influencer
  }

  it('puts the largest reach first — the order a budget conversation happens in', () => {
    const rows = [creator(10_000, 'a'), creator(1_200_000, 'b'), creator(480_000, 'c')]
    expect([...rows].sort(byInfluencerReach).map((r) => r.id)).toEqual(['b', 'c', 'a'])
  })

  it('breaks a tie on the name, not on the id', () => {
    // 10,000 followers is a common round number, and ordering by id there would
    // reorder the table on every read.
    const rows = [creator(10_000, 'a', 'Zoe'), creator(10_000, 'b', 'Adam')]
    expect([...rows].sort(byInfluencerReach).map((r) => r.name)).toEqual(['Adam', 'Zoe'])
  })
})

describe('CreateInfluencerInputSchema', () => {
  const minimal = {
    name: 'Priya Nair',
    handle: 'priyaskin',
    platform: 'instagram',
    followers: 124_000,
  }

  it('needs a name, a handle, a platform and a reach figure', () => {
    const parsed = CreateInfluencerInputSchema.parse(minimal)
    // Somebody just entered is on a shortlist, not booked.
    expect(parsed.status).toBe('prospect')
    expect(parsed.brandIds).toBeUndefined()
  })

  it('rejects a body with no follower count', () => {
    // A row with no reach would fall out of the tier grouping, which is the one
    // thing a total grouping may not do.
    const { followers: _followers, ...rest } = minimal
    expect(CreateInfluencerInputSchema.safeParse(rest).success).toBe(false)
  })

  it('rejects a blank name', () => {
    expect(CreateInfluencerInputSchema.safeParse({ ...minimal, name: '   ' }).success).toBe(false)
  })

  it('accepts an explicit null for the two unmeasured fields', () => {
    const parsed = CreateInfluencerInputSchema.parse({
      ...minimal,
      engagementRate: null,
      vertical: null,
    })
    expect(parsed.engagementRate).toBeNull()
    expect(parsed.vertical).toBeNull()
  })
})

describe('UpdateInfluencerInputSchema', () => {
  it('rejects an empty patch rather than performing a no-op write', () => {
    expect(UpdateInfluencerInputSchema.safeParse({}).success).toBe(false)
  })

  it('accepts a single key', () => {
    expect(UpdateInfluencerInputSchema.safeParse({ status: 'active' }).success).toBe(true)
  })

  it('accepts an explicit null to clear a measured field', () => {
    expect(UpdateInfluencerInputSchema.parse({ engagementRate: null }).engagementRate).toBeNull()
  })

  it('has no slug key — the URL survives a corrected handle', () => {
    const parsed = UpdateInfluencerInputSchema.parse({
      handle: 'priyaskincare',
      slug: 'something-else',
    })
    expect(parsed).not.toHaveProperty('slug')
    expect(parsed.handle).toBe('priyaskincare')
  })

  it('replaces brandIds wholesale, empty array included', () => {
    // An empty array is "no longer engaged for anything", which is a write, not
    // an omission — so it must survive the patch rather than being dropped.
    expect(UpdateInfluencerInputSchema.parse({ brandIds: [] }).brandIds).toEqual([])
  })
})
