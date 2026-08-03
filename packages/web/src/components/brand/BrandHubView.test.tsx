import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Palette } from 'lucide-react'
import type {
  BrandAsset,
  BrandWithSections,
  ProjectSummary,
  ResearchJobSummary,
} from '@brandfactory/shared'
import { BrandHubView } from './BrandHubView'
import { BRAND_CONTEXT_TEMPLATE_ID, TILE_APPS } from '@/components/brand/miniApps'

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

function thread(
  id: string,
  templateId: string | null,
  lastActivityAt = '2026-07-01T00:00:00.000Z',
): ProjectSummary {
  const base = {
    id: id as ProjectSummary['id'],
    brandId: 'b-1' as ProjectSummary['brandId'],
    name: `Thread ${id}`,
    brandName: 'Casa Vostra',
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    lastActivityAt,
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
    // The summary line the block would render (`1 colour · 1 proposed`), not
    // the word. A bare /colour/ also matched any tile *description* that
    // happened to mention colours — which the `Studio` row now does — so it was
    // asserting something broader than the invariant it is named for.
    expect(screen.queryByText(/\d+ colours?\b/)).toBeNull()
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

  // **The counts left this page for the nav**, which lists the same five
  // categories on every page of the brand — so a tile that also counted would
  // be the same number twice, 200px apart. `MiniAppTile` needed no change: the
  // hub passes the `null` that already meant "say nothing".
  it('puts no count on any tile — the nav row owns it now', () => {
    render(
      <BrandHubView
        brand={brand()}
        projects={[thread('p-1', 'copywriting'), thread('p-2', null), thread('p-3', 'press-kit')]}
        {...handlers}
      />,
    )
    expect(screen.queryByText(/^\d+ threads?$/)).toBeNull()
  })

  // The catch-all heading is gone with the counts — an unregistered thread is
  // listed by the panel's `Other threads` group, and it reaches this page the
  // way every other thread does: by being recent.
  it('resumes the brand’s threads newest first, whatever category they are in', () => {
    render(
      <BrandHubView
        brand={brand()}
        projects={[
          thread('p-1', 'copywriting', '2026-07-01T09:00:00.000Z'),
          thread('p-2', null, '2026-07-03T09:00:00.000Z'),
          thread('p-3', 'press-kit', '2026-07-02T09:00:00.000Z'),
        ]}
        {...handlers}
      />,
    )

    const names = screen
      .getAllByRole('link', { name: /Thread p-/ })
      .map((el) => el.textContent ?? '')
    expect(names[0]).toContain('Thread p-2')
    expect(names[1]).toContain('Thread p-3')
    expect(names[2]).toContain('Thread p-1')
    expect(screen.queryByRole('heading', { name: 'Other threads' })).toBeNull()
  })

  // `undefined` is "not known", not "zero": a brand with forty threads must not
  // be told it has none for the 100ms before the query lands.
  it('says nothing about recent threads until the list is known', () => {
    render(<BrandHubView brand={brand()} {...handlers} />)
    expect(screen.getByRole('heading', { name: 'Recent threads' })).toBeTruthy()
    expect(screen.queryByText(/Nothing yet/)).toBeNull()
  })

  it('reports a failed thread query instead of an empty list', () => {
    render(<BrandHubView brand={brand()} projectsError {...handlers} />)
    expect(screen.getByText(/Failed to load this brand's threads/)).toBeTruthy()
    expect(screen.queryByText(/Nothing yet/)).toBeNull()
  })

  it('invites a first thread once the list is known to be empty', () => {
    render(<BrandHubView brand={brand()} projects={[]} {...handlers} />)
    expect(screen.getByText(/Nothing yet/)).toBeTruthy()
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

// ---------------------------------------------------------------------------
// The finished-run row's one checkable claim
// ---------------------------------------------------------------------------
//
// The rail tells you a finished run's report is a conversation in Brand context,
// inferred from `COMPLETED` alone — and `landReportInThread` swallows its own
// failure, so that inference can be wrong. The hub already holds the project
// list, so it is the layer that can check. Derived here rather than passed as a
// second prop, for the reason the palette is: two props would make "the rail
// thinks the report landed but the tiles disagree" representable.

describe('BrandHubView — does the report exist', () => {
  // Branded in 3B with the types; fixtures state the id, nothing reads it.
  const completed: ResearchJobSummary = {
    id: 'j-1' as ResearchJobSummary['id'],
    status: 'COMPLETED',
    startedAt: '2026-07-30T09:00:00.000Z',
    completedAt: '2026-07-30T09:05:00.000Z',
    error: null,
    drafts: [],
    sourceCount: 3,
  }

  it('says nothing about a missing conversation when a context thread is there', () => {
    render(
      <BrandHubView
        brand={brand()}
        projects={[thread('p-1', BRAND_CONTEXT_TEMPLATE_ID)]}
        research={completed}
        onStartResearch={vi.fn()}
        {...handlers}
      />,
    )
    expect(screen.getByRole('button', { name: /read the report/ })).toBeTruthy()
    expect(screen.queryByText(/failed to land or has been deleted/)).toBeNull()
  })

  // A thread under a *different* template does not count: the report lands as a
  // brand-context thread specifically, and the copy names that surface.
  //
  // **The report still opens.** 1.13.2 suppressed the row here; the report is on
  // the job row rather than in the thread, so what is missing is the conversation.
  it('names the missing conversation when none of the brand’s threads are context', () => {
    render(
      <BrandHubView
        brand={brand()}
        projects={[thread('p-1', 'copywriting')]}
        research={completed}
        onStartResearch={vi.fn()}
        {...handlers}
      />,
    )
    expect(screen.getByRole('button', { name: /read the report/ })).toBeTruthy()
    expect(screen.getByText(/either failed to land or has been deleted/)).toBeTruthy()
  })

  // Pending, not empty. Claiming an anomaly here would put a missing-conversation
  // notice on a healthy brand on every navigation.
  it('stays quiet while the project list is unknown', () => {
    render(
      <BrandHubView brand={brand()} research={completed} onStartResearch={vi.fn()} {...handlers} />,
    )
    expect(screen.getByRole('button', { name: /read the report/ })).toBeTruthy()
    expect(screen.queryByText(/failed to land or has been deleted/)).toBeNull()
  })
})
