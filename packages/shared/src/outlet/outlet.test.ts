import { describe, expect, it } from 'vitest'
import { OUTLET_ATTRIBUTES, orderOutletAttributes, outletAttributeLabel } from './attributes'
import { CreateOutletInputSchema } from './create'
import { OutletAttributesSchema, outletDateOnShow } from './outlet'
import { UpdateOutletInputSchema } from './update'

describe('OUTLET_ATTRIBUTES', () => {
  it('has no duplicate keys — the picker would render two boxes for one fact', () => {
    const keys = OUTLET_ATTRIBUTES.map((a) => a.key)
    expect(new Set(keys).size).toBe(keys.length)
  })
})

describe('outletAttributeLabel', () => {
  it('labels a known key', () => {
    expect(outletAttributeLabel('serves_alcohol')).toBe('Serves alcohol')
  })

  it('returns an unknown key as itself, never "Unknown"', () => {
    // An imported tag is a fact about the outlet. Hiding it would state something
    // about this file as though it were something about the record.
    expect(outletAttributeLabel('halal_certified')).toBe('halal_certified')
  })
})

describe('orderOutletAttributes', () => {
  it('rebuilds the selection in catalogue order, whatever order it arrived in', () => {
    expect(orderOutletAttributes(['outdoor_seating', 'serves_alcohol'])).toEqual([
      'serves_alcohol',
      'outdoor_seating',
    ])
  })

  it('drops duplicates', () => {
    expect(orderOutletAttributes(['serves_alcohol', 'serves_alcohol'])).toEqual(['serves_alcohol'])
  })

  it('keeps unknown keys, after the known ones', () => {
    expect(orderOutletAttributes(['halal_certified', 'serves_alcohol'])).toEqual([
      'serves_alcohol',
      'halal_certified',
    ])
  })
})

describe('OutletAttributesSchema', () => {
  it('accepts a key the catalogue has never heard of', () => {
    // An import must not be refused over a tag it happens to spell differently.
    expect(OutletAttributesSchema.safeParse(['halal_certified']).success).toBe(true)
  })

  it('rejects duplicates', () => {
    expect(OutletAttributesSchema.safeParse(['a', 'a']).success).toBe(false)
  })
})

describe('outletDateOnShow', () => {
  it('shows the target while the site is still a plan', () => {
    for (const status of ['pipeline', 'fitting_out'] as const) {
      expect(
        outletDateOnShow({ status, openingDate: '2020-01-01', targetOpeningDate: '2027-02-15' }),
      ).toEqual({ date: '2027-02-15', label: 'Target' })
    }
  })

  it('shows what happened once it is trading, or has stopped', () => {
    for (const status of ['open', 'temporarily_closed', 'closed'] as const) {
      expect(
        outletDateOnShow({ status, openingDate: '2024-03-01', targetOpeningDate: '2027-02-15' }),
      ).toEqual({ date: '2024-03-01', label: 'Opened' })
    }
  })
})

describe('CreateOutletInputSchema', () => {
  it('needs only a name and a type', () => {
    const parsed = CreateOutletInputSchema.parse({ name: 'Casa Vostra', outletType: 'restaurant' })
    // The default is what a hand-entered outlet almost always is.
    expect(parsed.status).toBe('pipeline')
  })

  it('rejects a date that is really a timestamp', () => {
    // A business date, not an instant — see OutletDateSchema.
    const result = CreateOutletInputSchema.safeParse({
      name: 'Casa Vostra',
      outletType: 'restaurant',
      openingDate: '2024-03-01T00:00:00Z',
    })
    expect(result.success).toBe(false)
  })

  it('rejects a blank name', () => {
    expect(
      CreateOutletInputSchema.safeParse({ name: '   ', outletType: 'restaurant' }).success,
    ).toBe(false)
  })
})

describe('UpdateOutletInputSchema', () => {
  it('rejects an empty patch rather than performing a no-op write', () => {
    expect(UpdateOutletInputSchema.safeParse({}).success).toBe(false)
  })

  it('accepts a single key', () => {
    expect(UpdateOutletInputSchema.safeParse({ status: 'open' }).success).toBe(true)
  })

  it('accepts an explicit null to clear a nullable field', () => {
    const parsed = UpdateOutletInputSchema.parse({ brandId: null })
    expect(parsed.brandId).toBeNull()
  })

  it('has no slug key — the URL survives a rename', () => {
    const parsed = UpdateOutletInputSchema.parse({ name: 'Renamed', slug: 'something-else' })
    expect(parsed).not.toHaveProperty('slug')
  })
})
