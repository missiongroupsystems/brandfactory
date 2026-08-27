import { describe, expect, it } from 'vitest'
import {
  BrandAssetSchema,
  CreateBrandAssetInputSchema,
  UpdateBrandAssetInputSchema,
  assetsOfLibrary,
  defaultLibraryFor,
  type BrandAsset,
  type BrandAssetId,
  type BrandId,
} from '../index'

const BRAND = 'b-1' as BrandId
const T0 = '2026-07-01T09:00:00.000Z'

function asset(id: string, over: Partial<BrandAsset> = {}) {
  return {
    id: id as BrandAssetId,
    brandId: BRAND,
    kind: 'image',
    source: 'blob',
    blobKey: `k/${id}`,
    role: null,
    status: 'active',
    library: 'photography',
    label: id,
    position: 100,
    isPinned: false,
    pinnedAt: null,
    deletedAt: null,
    createdAt: T0,
    updatedAt: T0,
    ...over,
  } as BrandAsset
}

describe('defaultLibraryFor', () => {
  it('files a colour as identity, whatever role it carries', () => {
    expect(defaultLibraryFor({ kind: 'color', role: null })).toBe('identity')
    expect(defaultLibraryFor({ kind: 'color', role: 'primary' })).toBe('identity')
  })

  it('files a roleless image as photography and a roleless file as collateral', () => {
    expect(defaultLibraryFor({ kind: 'image', role: null })).toBe('photography')
    expect(defaultLibraryFor({ kind: 'file', role: null })).toBe('collateral')
  })

  // The one rule 0010's `CASE` can get wrong, and the reason its `role` branch
  // is written above its `kind` branch. Inverted, every brand mark in the table
  // backfills as a photograph.
  it.each(['logo', 'mark'] as const)('files an image with role %s as identity', (role) => {
    expect(defaultLibraryFor({ kind: 'image', role })).toBe('identity')
  })

  // The one place this rule and 0010's `CASE` deliberately disagree. A font is
  // a `file`, so without this branch the brand's own typeface would default to
  // the collateral shelf — in the very pass that builds Typefaces. The SQL does
  // not carry it because 0010 runs before 0011 adds the value, so no row can
  // hold it at backfill time.
  it('files a typeface as identity, though 0010’s CASE does not', () => {
    expect(defaultLibraryFor({ kind: 'file', role: 'typeface' })).toBe('identity')
  })

  // The logo lockup delivered as a PDF — a `file` that is nonetheless part of
  // the brand's identity. `role` decides it, not `kind`.
  it('files a file with a mark role as identity, not collateral', () => {
    expect(defaultLibraryFor({ kind: 'file', role: 'logo' })).toBe('identity')
  })

  // `primary` is a colour's role. It reaches the `role` branch on an image only
  // if someone sets it there, and it must not divert one off photography.
  it('does not treat role primary as an identity signal on an image', () => {
    expect(defaultLibraryFor({ kind: 'image', role: 'primary' })).toBe('photography')
  })
})

describe('assetsOfLibrary', () => {
  it('does not mix shelves', () => {
    const assets = [asset('photo'), asset('menu', { library: 'collateral' })]
    expect(assetsOfLibrary(assets, 'collateral').map((a) => a.id)).toEqual(['menu'])
  })

  it('excludes soft-deleted rows and sorts by position', () => {
    const assets = [
      asset('late', { position: 900 }),
      asset('gone', { position: 200, deletedAt: T0 }),
      asset('early', { position: 100 }),
    ]
    expect(assetsOfLibrary(assets, 'photography').map((a) => a.id)).toEqual(['early', 'late'])
  })

  // `assetsOfKind`'s rule, deliberately mirrored: status is `activeAssets`' job,
  // and a proposed asset is still filed somewhere.
  it('keeps proposed rows', () => {
    const assets = [asset('a'), asset('b', { status: 'proposed' })]
    expect(assetsOfLibrary(assets, 'photography')).toHaveLength(2)
  })
})

describe('library at the wire', () => {
  it('is required on the row', () => {
    const { library: _dropped, ...rest } = asset('i') as BrandAsset & { library: string }
    expect(BrandAssetSchema.safeParse(rest).success).toBe(false)
  })

  it('rejects a shelf that does not exist', () => {
    expect(BrandAssetSchema.safeParse(asset('i', { library: 'moodboard' } as never)).success).toBe(
      false,
    )
  })

  // The asymmetry that let the column ship without a wire break: the create
  // body may omit it, and the route resolves `defaultLibraryFor`.
  it('is optional on create, and still validated when present', () => {
    const body = { kind: 'image', source: 'blob', label: 'Storefront', blobKey: 'k/1' }
    expect(CreateBrandAssetInputSchema.safeParse(body).success).toBe(true)
    expect(CreateBrandAssetInputSchema.safeParse({ ...body, library: 'collateral' }).success).toBe(
      true,
    )
    expect(CreateBrandAssetInputSchema.safeParse({ ...body, library: 'nope' }).success).toBe(false)
  })

  // Move to… sends exactly this and nothing else. Without its clause in the
  // refine it would be rejected as an empty patch.
  it('satisfies the patch refine on its own', () => {
    expect(UpdateBrandAssetInputSchema.safeParse({ library: 'photography' }).success).toBe(true)
    expect(UpdateBrandAssetInputSchema.safeParse({}).success).toBe(false)
  })
})
