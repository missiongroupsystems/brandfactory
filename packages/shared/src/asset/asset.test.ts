import { describe, expect, it } from 'vitest'
import {
  BrandAssetSchema,
  activeAssets,
  assetsOfKind,
  byPosition,
  colorValue,
  logoAsset,
  type BrandAsset,
  type BrandAssetId,
  type BrandId,
} from '../index'

const BRAND = 'b-1' as BrandId
const T0 = '2026-07-01T09:00:00.000Z'

function base(id: string, position: number) {
  return {
    id: id as BrandAssetId,
    brandId: BRAND,
    role: null,
    status: 'active' as const,
    library: 'identity' as const,
    label: id,
    position,
    deletedAt: null,
    createdAt: T0,
    updatedAt: T0,
  }
}

function color(id: string, value: string, position = 100, over: Partial<BrandAsset> = {}) {
  return {
    ...base(id, position),
    kind: 'color',
    source: 'inline',
    value,
    ...over,
  } as BrandAsset
}

function image(id: string, position = 100, over: Partial<BrandAsset> = {}) {
  return {
    ...base(id, position),
    kind: 'image',
    source: 'blob',
    blobKey: `k/${id}`,
    ...over,
  } as BrandAsset
}

describe('BrandAssetSchema', () => {
  it('accepts one arm per source', () => {
    expect(BrandAssetSchema.safeParse(color('c', '#b5573c')).success).toBe(true)
    expect(BrandAssetSchema.safeParse(image('i')).success).toBe(true)
    expect(
      BrandAssetSchema.safeParse({
        ...base('l', 100),
        kind: 'image',
        source: 'link',
        url: 'https://cdn.example.com/mark.svg',
      }).success,
    ).toBe(true)
  })

  // The union is the app-layer half of the exactly-one-of rule that
  // `brand_assets_source_exactly_one` enforces in SQL. A row that names one
  // source and carries another source's column is the shape the CHECK exists
  // to make unrepresentable, and it has to be unrepresentable here too.
  it('rejects a source that carries no value of its own', () => {
    const orphan = { ...base('x', 100), kind: 'color', source: 'inline' }
    expect(BrandAssetSchema.safeParse(orphan).success).toBe(false)
  })

  it('rejects an unknown source outright', () => {
    const bad = { ...base('x', 100), kind: 'color', source: 'ipfs', value: '#fff' }
    expect(BrandAssetSchema.safeParse(bad).success).toBe(false)
  })

  // Same rule and same reason as `BrandWebsiteUrlSchema`. `javascript:` and
  // `data:` are syntactically valid URLs, so a bare `z.url()` would let a
  // user-supplied string into a `src` / `href` unchallenged.
  it.each([
    ['https://cdn.example.com/a.png', true],
    ['http://cdn.example.com/a.png', true],
    ['javascript:alert(1)', false],
    ['data:text/html,<script>', false],
    ['ftp://cdn.example.com/a.png', false],
    ['/relative/a.png', false],
  ])('link url %s → valid: %s', (url, valid) => {
    const asset = { ...base('l', 100), kind: 'image', source: 'link', url }
    expect(BrandAssetSchema.safeParse(asset).success).toBe(valid)
  })

  it('carries the two fields the mockup found missing', () => {
    const parsed = BrandAssetSchema.parse(
      image('i', 100, { alt: 'The back room at 7pm', sizeBytes: 842_100 } as Partial<BrandAsset>),
    )
    expect(parsed.alt).toBe('The back room at 7pm')
    expect(parsed.sizeBytes).toBe(842_100)
  })

  it('leaves the metadata columns optional, so a colour states none of them', () => {
    const parsed = BrandAssetSchema.parse(color('c', '#b5573c'))
    expect(parsed.sizeBytes).toBeUndefined()
    expect(parsed.mime).toBeUndefined()
  })
})

describe('colorValue', () => {
  it('returns the value for an inline colour', () => {
    expect(colorValue(color('c', '#b5573c'))).toBe('#b5573c')
  })

  it('returns null for an image, which never had one', () => {
    expect(colorValue(image('i'))).toBeNull()
  })
})

describe('activeAssets', () => {
  it('drops proposed and soft-deleted rows', () => {
    const assets = [
      color('a', '#111'),
      color('b', '#222', 200, { status: 'proposed' }),
      color('c', '#333', 300, { deletedAt: T0 }),
    ]
    expect(activeAssets(assets).map((a) => a.id)).toEqual(['a'])
  })
})

describe('assetsOfKind', () => {
  it('keeps proposed rows — status is not this filter’s job', () => {
    const assets = [color('a', '#111'), color('b', '#222', 200, { status: 'proposed' })]
    expect(assetsOfKind(assets, 'color')).toHaveLength(2)
  })

  it('excludes soft-deleted rows and sorts by position', () => {
    const assets = [
      color('late', '#111', 900),
      color('gone', '#222', 200, { deletedAt: T0 }),
      color('early', '#333', 100),
    ]
    expect(assetsOfKind(assets, 'color').map((a) => a.id)).toEqual(['early', 'late'])
  })

  it('does not mix kinds', () => {
    expect(assetsOfKind([color('c', '#111'), image('i')], 'image').map((a) => a.id)).toEqual(['i'])
  })
})

describe('logoAsset', () => {
  it('returns null when the brand has no logo', () => {
    expect(logoAsset([color('c', '#111'), image('i', 100, { role: null })])).toBeNull()
  })

  // The resolution rule for every non-unique role: first by position among
  // active. `role: 'logo'` is no more unique than `role: 'primary'` is.
  it('takes the first logo by position when there is more than one', () => {
    const assets = [image('second', 200, { role: 'logo' }), image('first', 100, { role: 'logo' })]
    expect(logoAsset(assets)?.id).toBe('first')
  })

  it('will not return a proposed logo', () => {
    const assets = [image('floated', 100, { role: 'logo', status: 'proposed' })]
    expect(logoAsset(assets)).toBeNull()
  })

  it('will not return a soft-deleted logo', () => {
    expect(logoAsset([image('gone', 100, { role: 'logo', deletedAt: T0 })])).toBeNull()
  })

  // `role: 'mark'` is a separate role and `BrandMark` asks for `'logo'`.
  it('does not treat a mark as a logo', () => {
    expect(logoAsset([image('m', 100, { role: 'mark' })])).toBeNull()
  })

  it('does not treat a colour with a role as a logo', () => {
    expect(logoAsset([color('c', '#111', 100, { role: 'primary' })])).toBeNull()
  })
})

describe('byPosition', () => {
  it('orders ascending', () => {
    const sorted = [color('b', '#111', 200), color('a', '#222', 100)].sort(byPosition)
    expect(sorted.map((a) => a.id)).toEqual(['a', 'b'])
  })
})
