import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Palette } from 'lucide-react'
import type { BrandWithSections, ProjectSummary } from '@brandfactory/shared'
import { BrandHubView } from './BrandHubView'
import type { BrandAsset } from '@/demo/assetTypes'

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
  id: 'c-1',
  brandId: 'b-1',
  kind: 'color',
  source: 'inline',
  role: 'primary',
  status: 'proposed',
  label: 'Terracotta',
  value: '#b5573c',
  position: 100,
  deletedAt: null,
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

  // C is the default because C *is* 1.7.0: neither the rail nor the identity
  // band moves. B reflows the band, so defaulting to it would shift the real
  // hub's mark and nobody would notice until the live pass.
  it('defaults to rail structure C, so colours reach neither the rail nor the band', () => {
    render(<BrandHubView brand={brand()} projects={[]} colors={[color]} {...handlers} />)
    expect(screen.queryByRole('heading', { name: 'Palette' })).toBeNull()
    expect(screen.queryByText(/1 colour/)).toBeNull()
  })

  it('puts the palette in the rail for A and in the identity band for B', () => {
    const { rerender } = render(
      <BrandHubView brand={brand()} projects={[]} colors={[color]} railVariant="A" {...handlers} />,
    )
    expect(screen.getByRole('heading', { name: 'Palette' })).toBeTruthy()

    rerender(
      <BrandHubView brand={brand()} projects={[]} colors={[color]} railVariant="B" {...handlers} />,
    )
    expect(screen.queryByRole('heading', { name: 'Palette' })).toBeNull()
    expect(screen.getByText('1 colour · 1 proposed')).toBeTruthy()
  })
})

describe('BrandHubView', () => {
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
            surface: 'tile',
          },
        ]}
        tileHref={(app) => (app.id === 'visual' ? '/demo/brand/assets' : undefined)}
        {...handlers}
      />,
    )

    const tile = screen.getByRole('link', { name: /Visual identity/ })
    expect(tile.getAttribute('href')).toBe('/demo/brand/assets')
    expect(screen.queryByText('Soon')).toBeNull()
  })
})
