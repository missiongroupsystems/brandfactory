import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import type { BrandAsset, ProjectSummary, SocialPost } from '@brandfactory/shared'
import { BrandNavPanel } from './BrandNavPanel'

// The panel is queries + `useLocation` and nothing else, so both are mocked and
// the *derivation* is what is under test: which row is lit, which category
// expands, and what each row claims to count.
const state: {
  pathname: string
  projects: ProjectSummary[] | undefined
  assets: BrandAsset[] | undefined
  socialPosts: SocialPost[] | undefined
} = {
  pathname: '/brands/b-1',
  projects: undefined,
  assets: undefined,
  socialPosts: undefined,
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

vi.mock('@/api/queries/social-posts', () => ({
  useBrandSocialPosts: () => ({ data: state.socialPosts }),
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

const socialPost = (id: string): SocialPost =>
  ({
    id: id as SocialPost['id'],
    brandId: 'b-1' as SocialPost['brandId'],
    platform: 'instagram',
    scheduledAt: null,
    body: '',
    status: 'draft',
    assetIds: [],
    deletedAt: null,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
  }) as SocialPost

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

    for (const title of [
      'Copywriting',
      'Visual identity',
      'Studio',
      'Social calendar',
      'Open canvas',
    ]) {
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
  it('counts threads per category, assets for the library, posts for the calendar', () => {
    state.projects = [
      thread('p-1', 'copywriting'),
      thread('p-2', 'copywriting'),
      thread('p-3', null),
    ]
    state.assets = [asset('a-1'), asset('a-2')]
    state.socialPosts = [socialPost('s-1'), socialPost('s-2'), socialPost('s-3')]
    render(<BrandNavPanel brandId="b-1" />)

    expect(screen.getByRole('link', { name: /Copywriting/ }).textContent).toBe('Copywriting2')
    expect(screen.getByRole('link', { name: /Open canvas/ }).textContent).toBe('Open canvas1')
    expect(screen.getByRole('link', { name: /Visual identity/ }).textContent).toBe(
      'Visual identity2',
    )
    // The fourth `unit`, and the reason it exists: counting the calendar's
    // threads would say `0` for a brand with a full month planned.
    expect(screen.getByRole('link', { name: /Social calendar/ }).textContent).toBe(
      'Social calendar3',
    )
  })

  // The third `unit`. `Studio` is one surface, not a collection, so there is no
  // number that would mean anything beside it — and `0` would actively mislead,
  // since the canvas is never "empty" in the way a category with no threads is.
  // Asserted against the loaded state, because the `null`-while-pending test
  // below would pass on this row for the wrong reason.
  it('renders no count for the canvas app, even with everything loaded', () => {
    state.projects = [thread('p-1', 'copywriting')]
    state.assets = [asset('a-1')]
    render(<BrandNavPanel brandId="b-1" />)

    expect(screen.getByRole('link', { name: /Studio/ }).textContent).toBe('Studio')
  })

  // `null` is "not known", and it must not render as `0`: a nav that tells a
  // brand it has no threads while the request is in flight is wrong in the one
  // direction that makes people stop looking.
  it('claims no count while the queries are unresolved', () => {
    render(<BrandNavPanel brandId="b-1" />)
    expect(screen.queryByText('0')).toBeNull()
  })

  // The `Soon` badge outlived every app that wore it. `Social calendar` was
  // the last one, and 1.4.0's placeholder pill leaves the nav with it — the
  // machinery stays (`NavItem` still takes a `badge`, and `enabled: false`
  // still suppresses the count), but no registered tile app is disabled, so
  // asserting the badge's absence is the only honest version of this test.
  it('badges nothing, now that no tile app is still coming', () => {
    state.projects = []
    render(<BrandNavPanel brandId="b-1" />)
    expect(screen.queryByText('Soon')).toBeNull()
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

  // The child pill is inset by margin, not padding: padding moves the text but
  // leaves the fill spanning the full nav width, which is exactly what made a
  // lit thread read as a stray top-level row rather than a child of its
  // category.
  it('insets a nested thread as a child pill, not a full-width row', () => {
    state.projects = [thread('p-1', 'copywriting')]
    state.pathname = '/projects/p-1'
    render(<BrandNavPanel brandId="b-1" />)

    expect(screen.getByRole('link', { name: 'Thread p-1' }).className).toContain('ml-6')
    expect(screen.getByRole('link', { name: /^Copywriting/ }).className).not.toContain('ml-6')
  })

  // With a thread open, its category row anchors the lit child: primary ink,
  // but no fill and no `aria-current` — the child owns the state, the parent
  // just stops looking unrelated to it.
  it('inks the parent row while one of its threads is open', () => {
    state.projects = [thread('p-1', 'copywriting'), thread('p-2', null)]
    state.pathname = '/projects/p-1'
    render(<BrandNavPanel brandId="b-1" />)

    // `text-muted-foreground` is the discriminator: every rest-state row has
    // it, and the muted variant also carries `hover:text-foreground`, so
    // asserting the presence of `text-foreground` alone would pass everywhere.
    const parent = screen.getByRole('link', { name: /^Copywriting/ })
    expect(parent.className).not.toContain('text-muted-foreground')
    expect(parent.className).not.toContain('bg-surface-selected')
    // An unrelated category stays muted — the anchor is the open thread's
    // parent, not every row.
    expect(screen.getByRole('link', { name: /^Open canvas/ }).className).toContain(
      'text-muted-foreground',
    )
  })

  it('inks the Brand context row while a context thread is open', () => {
    state.projects = [thread('p-8', 'brand-context')]
    state.pathname = '/projects/p-8'
    render(<BrandNavPanel brandId="b-1" />)

    const parent = screen.getByRole('link', { name: /^Brand context/ })
    expect(parent.className).not.toContain('text-muted-foreground')
    expect(parent.className).not.toContain('bg-surface-selected')
    expect(screen.getByRole('link', { name: 'Thread p-8' }).getAttribute('aria-current')).toBe(
      'page',
    )
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
