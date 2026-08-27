import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import type { BrandAsset, BrandWithSections } from '@brandfactory/shared'
import { VisualIdentityCard } from './VisualIdentityCard'

// Same `Link` stub the rail's and the hub's tests use: this card is rendered
// from props alone, which is the point of extracting it, so it must not need a
// router context to be tested.
vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    to,
    params,
    ...props
  }: {
    children: React.ReactNode
    to: string
    params?: Record<string, string>
  }) => (
    <a
      href={Object.entries(params ?? {}).reduce((p, [k, v]) => p.replace(`$${k}`, v), to)}
      {...props}
    >
      {children}
    </a>
  ),
}))

const ASSET_STAMPS = {
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
  // The pin, which nothing in this app reads yet: `packages/web` has no
  // photography grid and is not getting one. Stated here so the fixtures are
  // shaped like rows, and stated *once* so the next column added to
  // `BrandAsset` is one edit rather than a hunt through every literal.
  isPinned: false,
  pinnedAt: null,
} as const

function brand(): BrandWithSections {
  return {
    id: 'b-1' as BrandWithSections['id'],
    workspaceId: 'w-1' as BrandWithSections['workspaceId'],
    name: 'Casa Vostra',
    description: null,
    websiteUrl: null,
    sections: [],
    ...ASSET_STAMPS,
  }
}

/**
 * One asset, defaulting to an identity-shelf colour. `over` is loose because the
 * per-source column (`value` / `blobKey`) varies by arm and the union would
 * otherwise need a discriminated fixture per kind — three helpers to build
 * fixtures for a card that reads five fields.
 */
function asset(id: string, over: Record<string, unknown> = {}): BrandAsset {
  return {
    id,
    brandId: 'b-1',
    kind: 'color',
    source: 'inline',
    value: '#b5573c',
    role: null,
    status: 'active',
    library: 'identity',
    label: 'Terracotta',
    position: 100,
    deletedAt: null,
    ...ASSET_STAMPS,
    ...over,
  } as unknown as BrandAsset
}

const COLOR = asset('c-1')
const PROPOSED = asset('c-2', {
  status: 'proposed',
  position: 200,
})
const MARK = asset('m-1', {
  kind: 'image',
  source: 'blob',
  blobKey: 'k/mark.svg',
  role: 'logo',
  label: 'Wordmark',
})
const TYPEFACE = asset('t-1', {
  kind: 'file',
  source: 'blob',
  blobKey: 'k/satoshi.woff2',
  role: 'typeface',
  label: 'Satoshi — headings',
})
const PHOTO = asset('p-1', {
  kind: 'image',
  source: 'blob',
  blobKey: 'k/shop.jpg',
  library: 'photography',
  label: 'Storefront',
})

describe('VisualIdentityCard — the empty-identity invariant', () => {
  /**
   * **A brand with an empty identity is a legitimate brand**
   * (`docs/vision.md:28`), and a card telling it so is the scolding 1.7.0 spent
   * a pass removing. The two shelf links go with it — they are the card's
   * footer, not a fifth block, and a footer with no card is a floating pair of
   * counts.
   */
  it.each([
    ['the assets are not known', undefined],
    ['the brand has none', []],
    ['the brand has only photography and collateral', [PHOTO]],
  ])('renders nothing at all when %s', (_name, assets) => {
    const { container } = render(<VisualIdentityCard brand={brand()} assets={assets} />)
    expect(container.firstChild).toBeNull()
  })

  it('appears as soon as there is one colour', () => {
    render(<VisualIdentityCard brand={brand()} assets={[COLOR]} />)
    expect(screen.getByRole('region', { name: 'Visual identity' })).toBeTruthy()
  })
})

describe('VisualIdentityCard — the palette', () => {
  // Moved from `BrandContextRail.test.tsx` with the block itself, so what they
  // proved is not lost with the move.
  it('renders the swatch row and its summary', () => {
    render(<VisualIdentityCard brand={brand()} assets={[COLOR, PROPOSED]} />)
    expect(screen.getByRole('heading', { name: 'Palette' })).toBeTruthy()
    expect(screen.getByText('2 colours · 1 proposed')).toBeTruthy()
  })

  // Read here, write there — the same split the block already carried. The
  // heading is the way to the surface that owns colours.
  it('links the heading at the identity shelf', () => {
    render(<VisualIdentityCard brand={brand()} assets={[COLOR]} />)
    expect(screen.getByRole('link', { name: 'Palette' }).getAttribute('href')).toBe(
      '/brands/b-1/identity',
    )
  })

  // A colour filed anywhere else is not this brand's palette. Nothing in the UI
  // can produce one today (`handleAddColor` files identity always), which is
  // exactly why the filter is asserted rather than assumed.
  it('ignores a colour that is not on the identity shelf', () => {
    const strayColor = asset('c-9', {
      library: 'collateral',
    })
    render(<VisualIdentityCard brand={brand()} assets={[strayColor]} />)
    expect(screen.queryByRole('region', { name: 'Visual identity' })).toBeNull()
  })
})

describe('VisualIdentityCard — the mark', () => {
  it('names the declared mark when there is one', () => {
    render(<VisualIdentityCard brand={brand()} assets={[MARK]} logoSrc="/signed/mark" />)
    expect(screen.getByText('Wordmark')).toBeTruthy()
  })

  // A brand that has not uploaded one still *has* a mark; it is generated. The
  // same fallback `BrandIdentity` and the nav use.
  it('falls back to the monogram, and still renders the card', () => {
    render(<VisualIdentityCard brand={brand()} assets={[COLOR]} />)
    expect(screen.getByText('Monogram')).toBeTruthy()
  })

  // `logoAsset` applies the active filter itself: a proposed logo is a note to
  // the humans, not the thing a card claims is the brand's mark.
  it('does not claim a proposed logo as the mark', () => {
    const floated = asset('m-9', {
      kind: 'image',
      source: 'blob',
      blobKey: 'k/f.svg',
      role: 'logo',
      status: 'proposed',
      label: 'Maybe',
    })
    render(<VisualIdentityCard brand={brand()} assets={[floated, COLOR]} />)
    expect(screen.getByText('Monogram')).toBeTruthy()
    expect(screen.queryByText('Maybe')).toBeNull()
  })
})

describe('VisualIdentityCard — typefaces', () => {
  it('lists a declared typeface by label', () => {
    render(<VisualIdentityCard brand={brand()} assets={[TYPEFACE]} />)
    expect(screen.getByRole('heading', { name: 'Typefaces' })).toBeTruthy()
    expect(screen.getByText('Satoshi — headings')).toBeTruthy()
    expect(screen.getByText('1 typeface')).toBeTruthy()
  })

  // The role is the declaration. A font file with no role is a file on the
  // identity shelf, and nothing here infers one from a mime type or an
  // extension — which is the same rule migration 0011 states for not
  // backfilling.
  it('claims no typeface for an identity file with no role', () => {
    const deck = asset('f-1', {
      kind: 'file',
      source: 'blob',
      blobKey: 'k/guidelines.pdf',
      label: 'Brand guidelines.pdf',
    })
    render(<VisualIdentityCard brand={brand()} assets={[deck, COLOR]} />)
    expect(screen.queryByRole('heading', { name: 'Typefaces' })).toBeNull()
  })
})

describe('VisualIdentityCard — the two shelf links', () => {
  // The hub's only entrance to the other two shelves. The identity shelf is
  // reached from the Palette heading above; these two have nothing on the card
  // to hang off, so without them the nav group is the only route.
  it('links both, with each shelf’s own count', () => {
    const menu = asset('x-1', {
      kind: 'file',
      source: 'blob',
      blobKey: 'k/menu.pdf',
      library: 'collateral',
      label: 'Menu',
    })
    render(<VisualIdentityCard brand={brand()} assets={[COLOR, PHOTO, menu]} />)

    const photography = screen.getByRole('link', { name: /Photography/ })
    expect(photography.getAttribute('href')).toBe('/brands/b-1/photography')
    expect(within(photography).getByText('1')).toBeTruthy()

    const collateral = screen.getByRole('link', { name: /Collateral/ })
    expect(collateral.getAttribute('href')).toBe('/brands/b-1/collateral')
    expect(within(collateral).getByText('1')).toBeTruthy()
  })

  // Zero is a count, not silence: the query resolved and the shelf is empty.
  it('says zero for an empty shelf rather than nothing', () => {
    render(<VisualIdentityCard brand={brand()} assets={[COLOR]} />)
    expect(within(screen.getByRole('link', { name: /Photography/ })).getByText('0')).toBeTruthy()
  })
})
