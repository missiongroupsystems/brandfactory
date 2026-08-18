import { describe, expect, it } from 'vitest'
import { CreateInfluencerInputSchema } from './create'
import {
  InfluencerAccountSchema,
  InfluencerAccountsSchema,
  InfluencerBrandIdsSchema,
  InfluencerEngagementRateSchema,
  InfluencerFollowersSchema,
  InfluencerHandleSchema,
  InfluencerPlatformSchema,
  InfluencerStatusSchema,
  InfluencerVerticalSchema,
  MAX_INFLUENCER_ACCOUNTS,
} from './influencer'
import { INFLUENCER_SLUG_FALLBACK, influencerSlug, uniqueInfluencerSlug } from './slug'
import { UpdateInfluencerInputSchema } from './update'

/** One valid account, spread into whatever a case is actually about. */
function account(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    platform: 'instagram',
    handle: 'priyaskin',
    followers: 124_000,
    engagementRate: 3.8,
    url: null,
    ...overrides,
  }
}

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

describe('InfluencerAccountSchema', () => {
  it('accepts an account and keeps the unmeasured rate as null', () => {
    const parsed = InfluencerAccountSchema.parse(account({ engagementRate: null }))
    expect(parsed.platform).toBe('instagram')
    expect(parsed.engagementRate).toBeNull()
  })

  it('carries the four fields that used to sit on the creator', () => {
    // The move is the whole change: nothing about an account is on the person.
    expect(Object.keys(InfluencerAccountSchema.shape).sort()).toEqual([
      'engagementRate',
      'followers',
      'handle',
      'platform',
      'url',
    ])
  })

  it('rejects a leading @, a negative follower count and a rate over 100', () => {
    expect(InfluencerAccountSchema.safeParse(account({ handle: '@priyaskin' })).success).toBe(false)
    expect(InfluencerAccountSchema.safeParse(account({ followers: -1 })).success).toBe(false)
    expect(InfluencerAccountSchema.safeParse(account({ engagementRate: 120 })).success).toBe(false)
  })

  it('accepts an http profile URL and refuses a javascript: one', () => {
    // The value reaches an `href`, so it takes `WebsiteUrlSchema` rather than a
    // bare `z.url()` — zod parses `javascript:alert(1)` as a valid URL.
    expect(
      InfluencerAccountSchema.safeParse(account({ url: 'https://xiaohongshu.com/user/6123' }))
        .success,
    ).toBe(true)
    expect(InfluencerAccountSchema.safeParse(account({ url: 'javascript:alert(1)' })).success).toBe(
      false,
    )
  })
})

describe('InfluencerAccountsSchema', () => {
  it('rejects an empty list — a creator with no account has no reach and no tier', () => {
    expect(InfluencerAccountsSchema.safeParse([]).success).toBe(false)
  })

  it('accepts ten accounts and refuses the eleventh', () => {
    const ten = Array.from({ length: MAX_INFLUENCER_ACCOUNTS }, (_, i) =>
      account({ handle: `handle${i}` }),
    )
    expect(InfluencerAccountsSchema.safeParse(ten).success).toBe(true)
    expect(
      InfluencerAccountsSchema.safeParse([...ten, account({ handle: 'eleven' })]).success,
    ).toBe(false)
    expect(MAX_INFLUENCER_ACCOUNTS).toBe(10)
  })

  it('rejects a repeated platform-and-handle pair, and names it on the row', () => {
    // A repeated pair would take the unique violation inside the write
    // transaction and surface as a 409 about another creator — the wrong
    // sentence for a malformed body.
    const result = InfluencerAccountsSchema.safeParse([account(), account()])
    expect(result.success).toBe(false)
    const issue = result.error?.issues[0]
    expect(issue?.path).toEqual([1, 'handle'])
    expect(issue?.message).toContain('@priyaskin on instagram')
  })

  it('accepts two accounts on one platform with different handles', () => {
    // Three Instagram accounts is a real creator, and the unique key permits it.
    expect(
      InfluencerAccountsSchema.safeParse([
        account({ handle: 'priyaskin' }),
        account({ handle: 'priyaskin.archive' }),
      ]).success,
    ).toBe(true)
  })

  it('accepts one handle on two platforms — the case that started this', () => {
    expect(
      InfluencerAccountsSchema.safeParse([
        account({ platform: 'instagram' }),
        account({ platform: 'tiktok' }),
      ]).success,
    ).toBe(true)
  })

  it('keeps the order it was sent in — position 0 is the primary account', () => {
    const parsed = InfluencerAccountsSchema.parse([
      account({ platform: 'tiktok', handle: 'second' }),
      account({ platform: 'instagram', handle: 'first' }),
    ])
    expect(parsed.map((a) => a.handle)).toEqual(['second', 'first'])
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
  it('is the name, lowercased and separated', () => {
    // The source is the name since accounts landed: a person carries up to ten
    // handles and picking one for the URL is the choice this change removed.
    expect(influencerSlug('Priya Raman')).toBe('priya-raman')
  })

  it('separates on the punctuation a name carries', () => {
    expect(influencerSlug("Nur A'in Rahman")).toBe('nur-a-in-rahman')
  })

  it('falls back to "creator", not to "outlet"', () => {
    // The fallback word is a parameter for exactly this: a name written in
    // Chinese survives `slugify` as nothing.
    expect(influencerSlug('小红书美食')).toBe(INFLUENCER_SLUG_FALLBACK)
    expect(INFLUENCER_SLUG_FALLBACK).toBe('creator')
  })
})

describe('uniqueInfluencerSlug', () => {
  it('suffixes the second creator who genuinely shares a name', () => {
    // This used to be the path one person on two platforms took. It is now the
    // rarer case it should always have been.
    expect(uniqueInfluencerSlug('Priya Raman', ['priya-raman'])).toBe('priya-raman-2')
  })
})

describe('CreateInfluencerInputSchema', () => {
  const minimal = { name: 'Priya Nair', accounts: [account()] }

  it('needs a name and at least one account', () => {
    const parsed = CreateInfluencerInputSchema.parse(minimal)
    // Somebody just entered is on a shortlist, not booked.
    expect(parsed.status).toBe('prospect')
    expect(parsed.brandIds).toBeUndefined()
    expect(parsed.accounts).toHaveLength(1)
  })

  it('rejects a body with no accounts key at all', () => {
    const { accounts: _accounts, ...rest } = minimal
    expect(CreateInfluencerInputSchema.safeParse(rest).success).toBe(false)
  })

  it('rejects an empty account list', () => {
    // A row with no reach would fall out of the tier grouping, which is the one
    // thing a total grouping may not do.
    expect(CreateInfluencerInputSchema.safeParse({ ...minimal, accounts: [] }).success).toBe(false)
  })

  it('has no top-level handle, platform, followers or engagement rate', () => {
    // The four moved down. A client still sending them is talking to the old
    // contract and should not be silently half-understood.
    expect(Object.keys(CreateInfluencerInputSchema.shape).sort()).toEqual([
      'accounts',
      'brandIds',
      'name',
      'notes',
      'status',
      'vertical',
    ])
  })

  it('rejects a blank name', () => {
    expect(CreateInfluencerInputSchema.safeParse({ ...minimal, name: '   ' }).success).toBe(false)
  })

  it('accepts an explicit null vertical and an unmeasured account', () => {
    const parsed = CreateInfluencerInputSchema.parse({
      ...minimal,
      accounts: [account({ engagementRate: null })],
      vertical: null,
    })
    expect(parsed.accounts[0]?.engagementRate).toBeNull()
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

  it('accepts an explicit null to clear the vertical', () => {
    expect(UpdateInfluencerInputSchema.parse({ vertical: null }).vertical).toBeNull()
  })

  it('has no slug key — the URL survives a corrected name', () => {
    const parsed = UpdateInfluencerInputSchema.parse({
      name: 'Priya Raman',
      slug: 'something-else',
    })
    expect(parsed).not.toHaveProperty('slug')
    expect(parsed.name).toBe('Priya Raman')
  })

  it('replaces the account list wholesale and never empties it', () => {
    const parsed = UpdateInfluencerInputSchema.parse({ accounts: [account()] })
    expect(parsed.accounts).toHaveLength(1)
    // The patch that removes every account is a delete of the creator.
    expect(UpdateInfluencerInputSchema.safeParse({ accounts: [] }).success).toBe(false)
  })

  it('replaces brandIds wholesale, empty array included', () => {
    // An empty array is "no longer engaged for anything", which is a write, not
    // an omission — so it must survive the patch rather than being dropped.
    expect(UpdateInfluencerInputSchema.parse({ brandIds: [] }).brandIds).toEqual([])
  })
})
