import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Palette } from 'lucide-react'
import type { BrandAsset, BrandWithSections, ProjectSummary } from '@brandfactory/shared'
import { BrandHubView } from './BrandHubView'
import { TILE_APPS } from '@/components/brand/miniApps'

// `BrandAsset` moved to `@brandfactory/shared` in 2A, where — like every other
// domain entity — it carries branded ids and the two timestamp columns the DB
// writes. Fixtures state them; nothing in this file reads them.
const ASSET_STAMPS = {
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
} as const

// Same `Link` stub the rail's and the mini-app route's tests use: this view is
// rendered from props alone, which is the whole point of extracting it, so it
// must not need a router context to be tested.
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
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

// The view takes no query of its own — but `ProjectCard`, which it renders for
// the "Other threads" catch-all, still owns two mutation hooks. So the seam is
// query-free at *this* level and not all the way down; the same stub
// `ProjectCard`'s own tests use keeps that honest rather than papering over it
// with a QueryClientProvider.
vi.mock('@/api/queries/projects', () => ({
  useUpdateProject: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteProject: () => ({ mutate: vi.fn(), isPending: false }),
}))

function brand(overrides: Partial<BrandWithSections> = {}): BrandWithSections {
  return {
    id: 'b-1' as BrandWithSections['id'],
    workspaceId: 'w-1' as BrandWithSections['workspaceId'],
    name: 'Casa Vostra',
    description: 'Neighbourhood trattoria.',
    websiteUrl: null,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    sections: [],
    ...overrides,
  }
}

function thread(id: string, templateId: string | null): ProjectSummary {
  const base = {
    id: id as ProjectSummary['id'],
    brandId: 'b-1' as ProjectSummary['brandId'],
    name: `Thread ${id}`,
    brandName: 'Casa Vostra',
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    lastActivityAt: '2026-07-01T00:00:00.000Z',
  }
  return templateId === null
    ? { ...base, kind: 'freeform' }
    : { ...base, kind: 'standardized', templateId }
}

const color: BrandAsset = {
  id: 'c-1' as BrandAsset['id'],
  brandId: 'b-1' as BrandAsset['brandId'],
  kind: 'color',
  source: 'inline',
  role: 'primary',
  status: 'proposed',
  label: 'Terracotta',
  value: '#b5573c',
  position: 100,
  deletedAt: null,
  ...ASSET_STAMPS,
}

const handlers = { onRename: vi.fn(), onDelete: vi.fn(), onEdit: vi.fn() }

describe('BrandHubView — the absent-prop invariant', () => {
  // This is the acceptance criterion the whole front-end mockup pass hangs on.
  // `BrandHubView` is *shared* with `/brands/$brandId`, so "it's only the demo
  // route" is not what protects the shipped hub — this is. A prop that cannot
  // be absent is a prop that has changed the real page.
  it('renders no website link, no palette and no research row when given none', () => {
    render(<BrandHubView brand={brand()} projects={[]} {...handlers} />)

    expect(screen.queryByRole('link', { name: /casavostra/i })).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Palette' })).toBeNull()
    expect(screen.queryByRole('button', { name: /Research this brand/ })).toBeNull()
  })

  // 2C: `railVariant` is gone and the rail block is the survivor, so a brand
  // with colours gets exactly one palette — in the rail, never under the mark.
  it('puts the palette in the rail and nowhere else', () => {
    render(<BrandHubView brand={brand()} projects={[]} assets={[color]} {...handlers} />)
    expect(screen.getAllByRole('heading', { name: 'Palette' })).toHaveLength(1)
    expect(screen.getAllByText('1 colour · 1 proposed')).toHaveLength(1)
  })

  // Both halves of the surviving invariant, and they are different states:
  // `undefined` is "not known" (pending or failed), `[]` is "no colours". A
  // block that flashes empty on every navigation is worse than one that appears
  // 100ms late, and a "no colours yet" placeholder is the scolding 1.7.0 spent
  // a pass removing.
  it.each([
    ['pending', undefined],
    ['empty', []],
  ])('renders no palette block when colors are %s', (_name, colors) => {
    render(<BrandHubView brand={brand()} projects={[]} assets={colors} {...handlers} />)
    expect(screen.queryByRole('heading', { name: 'Palette' })).toBeNull()
    expect(screen.queryByText(/colour/)).toBeNull()
  })

  /**
   * The heading links only when the surface that owns colours exists — gated on
   * the registry, not on a second flag.
   *
   * **2E flipped `visual.enabled`, so the default is now the linked case.** The
   * gate itself is still live and still worth a test: a registry where the tile
   * is off must produce plain text, because a link to a page that says "later"
   * is the dead affordance 1.7.0 spent a pass removing. That is the state this
   * asserts, by passing a tile list with it off.
   */
  it('links the Palette heading, because Visual identity is enabled', () => {
    render(<BrandHubView brand={brand()} projects={[]} assets={[color]} {...handlers} />)
    expect(screen.getByRole('link', { name: 'Palette' }).getAttribute('href')).toBe(
      '/brands/b-1/apps/visual',
    )
  })

  it('leaves it unlinked for a registry where Visual identity is off', () => {
    const tiles = TILE_APPS.map((a) => (a.id === 'visual' ? { ...a, enabled: false } : a))
    render(
      <BrandHubView brand={brand()} projects={[]} assets={[color]} tiles={tiles} {...handlers} />,
    )
    expect(screen.queryByRole('link', { name: 'Palette' })).toBeNull()
    expect(screen.getByRole('heading', { name: 'Palette' })).toBeTruthy()
  })
})

describe('BrandHubView', () => {
  // Stage 1A: the first mockup prop the real route feeds. The invariant test
  // above proves the absent half; this proves the prop is still wired through
  // the view to the identity band and did not become decorative.
  it('renders the website link when the route supplies one', () => {
    render(
      <BrandHubView
        brand={brand()}
        projects={[]}
        websiteUrl="https://casavostra.com"
        {...handlers}
      />,
    )
    const link = screen.getByRole('link', { name: /casavostra\.com/ })
    expect(link.getAttribute('href')).toBe('https://casavostra.com')
  })

  it('counts threads per tile and files an unregistered one under the catch-all', () => {
    render(
      <BrandHubView
        brand={brand()}
        projects={[thread('p-1', 'copywriting'), thread('p-2', null), thread('p-3', 'press-kit')]}
        {...handlers}
      />,
    )

    // Copywriting and Open canvas take one each; the third belongs to neither.
    expect(screen.getAllByText('1 thread')).toHaveLength(2)
    expect(screen.getByRole('heading', { name: 'Other threads' })).toBeTruthy()
    expect(screen.getByRole('link', { name: /Thread p-3/ })).toBeTruthy()
  })

  // `undefined` is "not known", not "zero" — a tile that claims zero threads
  // while the query is in flight is worse than a tile that says nothing.
  it('stays silent about counts when threads are not known', () => {
    render(<BrandHubView brand={brand()} projectsError {...handlers} />)
    expect(screen.queryByText(/^\d+ threads?$/)).toBeNull()
    expect(screen.getByText(/Thread counts are unavailable/)).toBeTruthy()
  })

  // The tile list is a prop so the demo can enable `Visual identity` without
  // `miniApps.ts` knowing there is a demo — flipping `enabled` in the registry
  // would turn the tile on for every real brand.
  it('takes its tile list and destinations as props', () => {
    render(
      <BrandHubView
        brand={brand()}
        projects={[]}
        tiles={[
          {
            id: 'visual',
            title: 'Visual identity',
            description: 'Colour, type, logo.',
            icon: Palette,
            create: { kind: 'standardized', templateId: 'visual' },
            match: () => false,
            enabled: true,
            unit: 'asset',
            surface: 'tile',
          },
        ]}
        // An arbitrary override, not a route: `tileHref` exists so a caller can
        // redirect one tile, and 3G deleted the only caller that ever did.
        tileHref={(app) => (app.id === 'visual' ? '/elsewhere' : undefined)}
        {...handlers}
      />,
    )

    const tile = screen.getByRole('link', { name: /Visual identity/ })
    expect(tile.getAttribute('href')).toBe('/elsewhere')
    expect(screen.queryByText('Soon')).toBeNull()
  })
})
