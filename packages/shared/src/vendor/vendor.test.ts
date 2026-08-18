import { describe, expect, it } from 'vitest'
import { CreateVendorInputSchema } from './create'
import { VENDOR_SLUG_FALLBACK, uniqueVendorSlug, vendorSlug } from './slug'
import { UpdateVendorInputSchema } from './update'
import {
  VendorBrandIdsSchema,
  VendorCategorySchema,
  VendorContactEmailSchema,
  VendorContactsSchema,
  VendorStatusSchema,
  VendorUenSchema,
  byVendorName,
  type Vendor,
} from './vendor'

// The enum member lists are duplicated with the pgEnums in `@brandfactory/db`,
// per the zod-⇄-pgEnum convention. These two tests are the pin: a member added to
// one side and not the other fails here, which is the only place that reads both
// as data.
describe('the enums', () => {
  it('holds ten categories, and "other" among them', () => {
    expect(VendorCategorySchema.options).toEqual([
      'creative_agency',
      'media_agency',
      'talent_agency',
      'pr_agency',
      'production',
      'events',
      'research',
      'software',
      'freelancer',
      'other',
    ])
    // The opposite of `InfluencerVerticalSchema` on purpose: a creator with no
    // vertical is a genuine generalist, so `other` would file them beside the
    // unclassified. A company is always something, so `other` means the list is
    // short — and `null` still means nobody has said.
    expect(VendorCategorySchema.options).toContain('other')
  })

  it('holds three statuses, and blacklisted is not inactive', () => {
    // One is a company nobody is buying from at the moment; the other is one
    // nobody may buy from. Collapsing them would lose the only fact on this
    // record that is a decision rather than a status.
    expect(VendorStatusSchema.options).toEqual(['active', 'inactive', 'blacklisted'])
  })

  it('carries no counterparty kind at all', () => {
    // 1.38.0 took the control off the screen — marketing buys from no landlords.
    // This aggregate does not carry the column it controlled.
    expect(Object.keys(CreateVendorInputSchema.shape)).not.toContain('kind')
    expect(Object.keys(UpdateVendorInputSchema.shape)).not.toContain('kind')
  })
})

describe('VendorUenSchema', () => {
  it('accepts a Singapore UEN and a foreign registration alike', () => {
    expect(VendorUenSchema.parse('  201812345K  ')).toBe('201812345K')
    expect(VendorUenSchema.safeParse('HRB 123456 B').success).toBe(true)
  })

  it('does not validate the grammar, only the length', () => {
    // UEN grammar has several forms and a foreign agency has none at all.
    // Refusing a whole import over a character class is the failure
    // `InfluencerHandleSchema` already argues against.
    expect(VendorUenSchema.safeParse('T05LL1103N').success).toBe(true)
    expect(VendorUenSchema.safeParse('x'.repeat(51)).success).toBe(false)
  })
})

describe('VendorContactEmailSchema', () => {
  it('validates the address, unlike the UEN beside it', () => {
    // An email has one grammar everywhere and ends up in a `mailto:` href, which
    // is `WebsiteUrlSchema`'s argument one scheme over.
    expect(VendorContactEmailSchema.safeParse('mei@northlight.sg').success).toBe(true)
    expect(VendorContactEmailSchema.safeParse('not an address').success).toBe(false)
  })
})

describe('VendorContactsSchema', () => {
  function contact(overrides: Partial<{ name: string; isPrimary: boolean }> = {}) {
    return { name: 'Mei Tan', role: null, email: null, phone: null, isPrimary: false, ...overrides }
  }

  it('accepts an empty list — "nobody named yet" is a fact', () => {
    expect(VendorContactsSchema.parse([])).toEqual([])
  })

  it('accepts exactly one primary', () => {
    expect(VendorContactsSchema.safeParse([contact({ isPrimary: true }), contact()]).success).toBe(
      true,
    )
  })

  it('rejects two primaries, at the wire rather than at an index', () => {
    // Zod at the route boundary is the single enforcement point. A partial unique
    // index would refuse the second half of a primary swap; a full-replacement
    // write makes that swap one request.
    expect(
      VendorContactsSchema.safeParse([contact({ isPrimary: true }), contact({ isPrimary: true })])
        .success,
    ).toBe(false)
  })

  it('accepts no primary at all', () => {
    // Three named people and nobody appointed is an ordinary state.
    expect(VendorContactsSchema.safeParse([contact(), contact()]).success).toBe(true)
  })
})

describe('VendorBrandIdsSchema', () => {
  it('accepts an empty array — "not assigned yet" is a fact', () => {
    expect(VendorBrandIdsSchema.parse([])).toEqual([])
  })

  it('rejects duplicates, because the join table is keyed on the pair', () => {
    // A repeated id would take a unique violation inside the write transaction,
    // which reaches the client as a 500 for what is really a malformed body.
    expect(VendorBrandIdsSchema.safeParse(['b1', 'b1']).success).toBe(false)
  })
})

describe('vendorSlug', () => {
  it('is the name, lowercased and hyphenated', () => {
    expect(vendorSlug('Northlight Talent Pte Ltd')).toBe('northlight-talent-pte-ltd')
  })

  it('separates on the punctuation a company name carries', () => {
    expect(vendorSlug('Ho & Sons (S) Pte. Ltd.')).toBe('ho-sons-s-pte-ltd')
  })

  it('falls back to "vendor", not to "creator"', () => {
    // The fallback word is a parameter for exactly this: a company written
    // entirely in Chinese survives `slugify` as nothing.
    expect(vendorSlug('翠華')).toBe(VENDOR_SLUG_FALLBACK)
    expect(VENDOR_SLUG_FALLBACK).toBe('vendor')
  })
})

describe('uniqueVendorSlug', () => {
  it('suffixes a repeated name rather than refusing the row', () => {
    // `name` is deliberately not unique: a company name carries legal suffixes,
    // trading names and abbreviations, so refusing the second is wrong.
    expect(uniqueVendorSlug('Sunbeam Social', ['sunbeam-social'])).toBe('sunbeam-social-2')
  })

  it('leaves a legitimately different name unsuffixed', () => {
    expect(uniqueVendorSlug('Sunbeam Social Pte Ltd', ['sunbeam-social'])).toBe(
      'sunbeam-social-pte-ltd',
    )
  })
})

describe('byVendorName', () => {
  // The comparator reads two fields, so the fixture states two. The cast is what
  // keeps a branded id out of a sort test.
  function vendor(name: string, id: string): Vendor {
    return { name, id } as unknown as Vendor
  }

  it('sorts alphabetically — this screen is read as a directory', () => {
    // The opposite of `byInfluencerReach`, which leads with the largest number
    // because that list is read as a budget conversation.
    const rows = [vendor('Zephyr Studio', 'a'), vendor('Anvil Films', 'b')]
    expect([...rows].sort(byVendorName).map((r) => r.name)).toEqual([
      'Anvil Films',
      'Zephyr Studio',
    ])
  })

  it('breaks a tie on the id, because two companies may share a name', () => {
    const rows = [vendor('Same Name', 'b'), vendor('Same Name', 'a')]
    expect([...rows].sort(byVendorName).map((r) => r.id)).toEqual(['a', 'b'])
  })
})

describe('CreateVendorInputSchema', () => {
  it('needs a name and nothing else', () => {
    // A company you have just heard of has a name and nothing else confirmed.
    const parsed = CreateVendorInputSchema.parse({ name: 'Northlight Talent' })
    // A vendor somebody enters is one the business is already buying from — the
    // opposite of a creator, who is a prospect until booked.
    expect(parsed.status).toBe('active')
    expect(parsed.category).toBeUndefined()
    expect(parsed.brandIds).toBeUndefined()
    expect(parsed.contacts).toBeUndefined()
  })

  it('rejects a blank name', () => {
    expect(CreateVendorInputSchema.safeParse({ name: '   ' }).success).toBe(false)
  })

  it('accepts an explicit null for every optional column', () => {
    const parsed = CreateVendorInputSchema.parse({
      name: 'Northlight Talent',
      category: null,
      uen: null,
      website: null,
      notes: null,
    })
    expect(parsed.category).toBeNull()
    expect(parsed.uen).toBeNull()
    expect(parsed.website).toBeNull()
  })

  it('refuses a website that is not http or https', () => {
    // `WebsiteUrlSchema`'s protocol filter, which zod's bare `z.url()` does not
    // apply — it parses `javascript:alert(1)` happily.
    expect(
      CreateVendorInputSchema.safeParse({ name: 'X', website: 'javascript:alert(1)' }).success,
    ).toBe(false)
    expect(
      CreateVendorInputSchema.safeParse({ name: 'X', website: 'https://northlight.sg' }).success,
    ).toBe(true)
  })
})

describe('UpdateVendorInputSchema', () => {
  it('rejects an empty patch rather than performing a no-op write', () => {
    expect(UpdateVendorInputSchema.safeParse({}).success).toBe(false)
  })

  it('accepts a single key', () => {
    expect(UpdateVendorInputSchema.safeParse({ status: 'blacklisted' }).success).toBe(true)
  })

  it('accepts an explicit null to clear a recorded field', () => {
    expect(UpdateVendorInputSchema.parse({ uen: null }).uen).toBeNull()
  })

  it('has no slug key — the URL survives a corrected name', () => {
    const parsed = UpdateVendorInputSchema.parse({
      name: 'Northlight Talent Pte Ltd',
      slug: 'something-else',
    })
    expect(parsed).not.toHaveProperty('slug')
    expect(parsed.name).toBe('Northlight Talent Pte Ltd')
  })

  it('replaces brandIds and contacts wholesale, empty arrays included', () => {
    // An empty array is "no longer assigned to anything" and "nobody named any
    // more", which are writes, not omissions — so they must survive the patch
    // rather than being dropped.
    expect(UpdateVendorInputSchema.parse({ brandIds: [] }).brandIds).toEqual([])
    expect(UpdateVendorInputSchema.parse({ contacts: [] }).contacts).toEqual([])
  })
})
