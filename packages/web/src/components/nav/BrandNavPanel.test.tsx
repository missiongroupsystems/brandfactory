import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import type { BrandAsset, ProjectSummary } from '@brandfactory/shared'
import { BrandNavPanel } from './BrandNavPanel'

// The panel is queries + `useLocation` and nothing else, so both are mocked and
// the *derivation* is what is under test: which row is lit, which category
// expands, and what each row claims to count.
const state: {
  pathname: string
  projects: ProjectSummary[] | undefined
  assets: BrandAsset[] | undefined
} = {
  pathname: '/brands/b-1',
  projects: undefined,
  assets: undefined,
}

vi.mock('@tanstack/react-router', () => ({
  useLocation: (opts?: { select?: (l: { pathname: string }) => unknown }) =>
    opts?.select ? opts.select({ pathname: state.pathname }) : { pathname: state.pathname },
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

vi.mock('@/api/queries/brands', () => ({
  useBrandProjects: () => ({ data: state.projects }),
}))

vi.mock('@/api/queries/assets', () => ({
  useBrandAssets: () => ({ data: state.assets }),
}))

// Both pull the api client and their own hooks; each has a suite of its own.
// What matters here is that the header and the footer have a place.
vi.mock('@/components/BrandSwitcher', () => ({
  BrandSwitcher: () => <div data-testid="brand-switcher" />,
}))

vi.mock('@/components/ResearchInFlightIndicator', () => ({
  ResearchInFlightIndicator: () => null,
}))

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

const asset = (id: string): BrandAsset =>
  ({
    id: id as BrandAsset['id'],
    brandId: 'b-1' as BrandAsset['brandId'],
    kind: 'color',
    source: 'inline',
    role: 'primary',
    status: 'active',
    label: 'Terracotta',
    value: '#b5573c',
    position: 100,
    deletedAt: null,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
  }) as BrandAsset

describe('BrandNavPanel', () => {
  beforeEach(() => {
    state.pathname = '/brands/b-1'
    state.projects = undefined
    state.assets = undefined
  })

  // The registry is the nav — a hand-written second list is how a mini-app ends
  // up on a tile and nowhere in the navigation.
  it('renders a row per tile app, plus the hidden brand-context surface', () => {
    render(<BrandNavPanel brandId="b-1" />)

    for (const title of ['Copywriting', 'Visual identity', 'Social calendar', 'Open canvas']) {
      expect(screen.getByRole('link', { name: new RegExp(title) })).toBeTruthy()
    }
    expect(screen.getByRole('link', { name: /Brand context/ }).getAttribute('href')).toBe(
      '/brands/b-1/context',
    )
  })

  it('marks the current page with aria-current, not styling alone', () => {
    state.pathname = '/brands/b-1/apps/copywriting'
    render(<BrandNavPanel brandId="b-1" />)

    expect(screen.getByRole('link', { name: /Copywriting/ }).getAttribute('aria-current')).toBe(
      'page',
    )
    expect(screen.getByRole('link', { name: /Overview/ }).getAttribute('aria-current')).toBeNull()
  })

  // The counts the hub tiles gave up. `Visual identity` counts assets rather
  // than threads (`MiniApp.unit`) — counting threads there would print a number
  // for something the page behind it does not have.
  it('counts threads per category and assets for the library', () => {
    state.projects = [
      thread('p-1', 'copywriting'),
      thread('p-2', 'copywriting'),
      thread('p-3', null),
    ]
    state.assets = [asset('a-1'), asset('a-2')]
    render(<BrandNavPanel brandId="b-1" />)

    expect(screen.getByRole('link', { name: /Copywriting/ }).textContent).toBe('Copywriting2')
    expect(screen.getByRole('link', { name: /Open canvas/ }).textContent).toBe('Open canvas1')
    expect(screen.getByRole('link', { name: /Visual identity/ }).textContent).toBe(
      'Visual identity2',
    )
  })

  // `null` is "not known", and it must not render as `0`: a nav that tells a
  // brand it has no threads while the request is in flight is wrong in the one
  // direction that makes people stop looking.
  it('claims no count while the queries are unresolved', () => {
    render(<BrandNavPanel brandId="b-1" />)
    expect(screen.queryByText('0')).toBeNull()
  })

  // A not-yet-live app says `Soon` rather than a number — `0 threads` on a page
  // that has none to have is false, not merely unhelpful.
  it('badges a disabled app instead of counting it', () => {
    state.projects = []
    render(<BrandNavPanel brandId="b-1" />)
    const soon = screen.getByRole('link', { name: /Social calendar/ })
    expect(soon.textContent).toBe('Social calendarSoon')
  })

  it('nests the threads of the category you are in, and only that one', () => {
    state.projects = [thread('p-1', 'copywriting'), thread('p-2', null)]
    state.pathname = '/brands/b-1/apps/copywriting'
    render(<BrandNavPanel brandId="b-1" />)

    expect(screen.getByRole('link', { name: 'Thread p-1' })).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Thread p-2' })).toBeNull()
  })

  // The payoff over a header: a project path names no brand and no category, so
  // before the sidebar, moving between two sibling threads meant going up to the
  // category page and back down.
  it('keeps a thread’s siblings in reach from inside the thread', () => {
    state.projects = [
      thread('p-1', 'copywriting', '2026-07-01T00:00:00.000Z'),
      thread('p-2', 'copywriting', '2026-07-05T00:00:00.000Z'),
    ]
    state.pathname = '/projects/p-1'
    render(<BrandNavPanel brandId="b-1" />)

    const open = screen.getByRole('link', { name: 'Thread p-1' })
    expect(open.getAttribute('aria-current')).toBe('page')
    // Newest first, so the sibling with later activity leads.
    const nested = screen.getAllByRole('link', { name: /Thread p-/ })
    expect(nested[0]?.textContent).toBe('Thread p-2')
    // The category page itself is not open, so its own row stays unlit.
    expect(
      screen.getByRole('link', { name: /^Copywriting/ }).getAttribute('aria-current'),
    ).toBeNull()
  })

  // `isOrphanThread` consults the whole registry, so a hidden-surface thread
  // (brand context) is classified and never lands here.
  it('files a thread of unknown template under a catch-all group', () => {
    state.projects = [thread('p-9', 'press-kit'), thread('p-8', 'brand-context')]
    render(<BrandNavPanel brandId="b-1" />)

    const group = screen.getByRole('navigation', { name: 'Other threads' })
    expect(within(group).getByRole('link', { name: 'Thread p-9' })).toBeTruthy()
    expect(within(group).queryByRole('link', { name: 'Thread p-8' })).toBeNull()
  })

  it('carries no catch-all heading for a brand that has no orphans', () => {
    state.projects = [thread('p-1', 'copywriting')]
    render(<BrandNavPanel brandId="b-1" />)
    expect(screen.queryByRole('navigation', { name: 'Other threads' })).toBeNull()
  })
})
