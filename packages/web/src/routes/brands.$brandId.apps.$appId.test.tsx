import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { redirect } from '@tanstack/react-router'
import type { ProjectSummary } from '@brandfactory/shared'
import { miniAppRoute } from './brands.$brandId.apps.$appId'

// Route params and the brand-projects payload are swapped per test. `vi.hoisted`
// because vi.mock factories are lifted above the imports.
const BRAND = { id: 'b-1', workspaceId: 'ws-1', name: 'Acme', description: null, sections: [] }

const h = vi.hoisted(() => ({
  params: { brandId: 'b-1', appId: 'copywriting' },
  projects: [] as unknown[],
  // Swapped per test so the brand query's pending / error states are reachable;
  // the page gates its thread grid on the brand (ProjectCard needs workspaceId).
  brand: { data: undefined as unknown, isPending: false, isError: false },
}))

vi.mock('@tanstack/react-router', () => ({
  // The real createRoute needs a router context; this keeps the options object
  // (including `component`) reachable so the page can be rendered directly.
  createRoute: (opts: Record<string, unknown>) => ({ ...opts, useParams: () => h.params }),
  // Reached transitively: the route module imports rootRoute from ./__root.
  createRootRoute: (opts: Record<string, unknown>) => ({ ...opts }),
  Outlet: () => null,
  redirect: vi.fn(),
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

// beforeLoad's auth gate runs before the surface check; a token keeps the
// redirect under test the only one that can fire.
vi.mock('@/auth/store', () => ({ getAuthToken: () => 'tok' }))

vi.mock('@/api/queries/brands', () => ({
  useBrand: () => h.brand,
  useBrandProjects: () => ({ data: h.projects, isPending: false, isError: false }),
}))

// The `unit: 'canvas'` branch's lazy chunk. Stubbed rather than loaded: the
// real module pulls the whole vendored runtime — every control widget and a
// canvas element jsdom has no 2D context for — to prove a dispatch this file is
// the only place that makes. `studioSchema.test.ts` covers what it configures.
vi.mock('@/components/brand/StudioSurface', () => ({
  default: ({ brandId }: { brandId: string }) => <div data-testid="studio-surface">{brandId}</div>,
}))

vi.mock('@/api/queries/projects', () => ({
  useCreateProject: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateProject: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteProject: () => ({ mutate: vi.fn(), isPending: false }),
}))

const MiniAppPage = (miniAppRoute as unknown as { component: () => React.ReactElement }).component
const beforeLoad = (
  miniAppRoute as unknown as {
    beforeLoad: (ctx: { params: { brandId: string; appId: string } }) => void
  }
).beforeLoad

function base(id: string) {
  return {
    id: id as ProjectSummary['id'],
    brandId: 'b-1' as ProjectSummary['brandId'],
    name: id,
    createdAt: '2026-07-24T00:00:00.000Z',
    updatedAt: '2026-07-24T00:00:00.000Z',
    brandName: 'Acme',
    lastActivityAt: '2026-07-24T00:00:00.000Z',
  }
}

const COPY_THREAD: ProjectSummary = {
  ...base('Tagline round 1'),
  kind: 'standardized',
  templateId: 'copywriting',
}
const FREEFORM_THREAD: ProjectSummary = { ...base('Scratch canvas'), kind: 'freeform' }
// `social` is the not-yet-live example. It was `visual` until 2E turned that
// tile on and gave it an asset library instead of a thread list.
const SOCIAL_THREAD: ProjectSummary = {
  ...base('Launch week posts'),
  kind: 'standardized',
  templateId: 'social',
}

describe('mini-app route', () => {
  beforeEach(() => {
    h.params = { brandId: 'b-1', appId: 'copywriting' }
    h.projects = []
    h.brand = { data: BRAND, isPending: false, isError: false }
  })

  it('lists only the threads belonging to this mini-app', () => {
    h.projects = [COPY_THREAD, FREEFORM_THREAD]
    render(<MiniAppPage />)

    expect(screen.getByText('Tagline round 1')).toBeTruthy()
    expect(screen.queryByText('Scratch canvas')).toBeNull()
    expect(screen.getByRole('button', { name: 'New thread' })).toBeTruthy()
  })

  it('offers a start prompt when the category is empty', () => {
    render(<MiniAppPage />)
    expect(screen.getByText(/Start your first copywriting thread/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'New thread' })).toBeTruthy()
  })

  it('renders the stub for a not-yet-live mini-app', () => {
    h.params = { brandId: 'b-1', appId: 'social' }
    h.projects = [COPY_THREAD, FREEFORM_THREAD]
    render(<MiniAppPage />)

    expect(screen.getByText('Coming soon')).toBeTruthy()
    // No create affordance, and no other category's threads leak in.
    expect(screen.queryByRole('button', { name: 'New thread' })).toBeNull()
    expect(screen.queryByText('Tagline round 1')).toBeNull()
    expect(screen.queryByText('Scratch canvas')).toBeNull()
  })

  // The hub tile advertises a count for a Soon app that has threads, so this
  // page has to list them — otherwise the count points at unreachable data.
  it('still lists existing threads under a not-yet-live mini-app', () => {
    h.params = { brandId: 'b-1', appId: 'social' }
    h.projects = [SOCIAL_THREAD, COPY_THREAD]
    render(<MiniAppPage />)

    expect(screen.getByText('Coming soon')).toBeTruthy()
    expect(screen.getByText('Launch week posts')).toBeTruthy()
    expect(screen.queryByText('Tagline round 1')).toBeNull()
    // Listing them is not the same as letting you make more.
    expect(screen.queryByRole('button', { name: 'New thread' })).toBeNull()
  })

  it('explains a failed brand fetch instead of rendering a blank page', () => {
    h.brand = { data: undefined, isPending: false, isError: true }
    h.projects = [COPY_THREAD]
    render(<MiniAppPage />)

    // The threads query succeeded, but the grid needs the brand's workspaceId,
    // so the page must say why it is showing nothing.
    expect(screen.getByText('Failed to load this brand.')).toBeTruthy()
    expect(screen.queryByText(/No threads yet/)).toBeNull()
  })

  it('shows a loading state while the brand resolves', () => {
    h.brand = { data: undefined, isPending: true, isError: false }
    h.projects = [COPY_THREAD]
    render(<MiniAppPage />)

    expect(screen.getByText('Loading threads…')).toBeTruthy()
    expect(screen.queryByText(/No threads yet/)).toBeNull()
  })

  // The third shape. It is the only branch that renders no thread list, offers
  // no `New thread`, and asks for no query at all — the header plus the lazy
  // surface, and nothing else.
  it('renders the canvas surface for a unit-canvas app, with no thread affordances', async () => {
    h.params = { brandId: 'b-1', appId: 'studio' }
    h.projects = [COPY_THREAD, FREEFORM_THREAD]
    render(<MiniAppPage />)

    expect(screen.getByRole('heading', { name: 'Studio' })).toBeTruthy()
    expect((await screen.findByTestId('studio-surface')).textContent).toBe('b-1')
    expect(screen.queryByRole('button', { name: 'New thread' })).toBeNull()
    expect(screen.queryByText('Tagline round 1')).toBeNull()
  })

  it('handles an unregistered appId', () => {
    h.params = { brandId: 'b-1', appId: 'nope' }
    render(<MiniAppPage />)

    expect(screen.getByText('Unknown mini-app')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'New thread' })).toBeNull()
  })
})

// `miniAppById` resolves by id with no surface check, so without the guard this
// route would render a second surface for a hidden category's threads.
describe('mini-app route beforeLoad', () => {
  beforeEach(() => {
    vi.mocked(redirect).mockClear()
  })

  it('redirects a hidden-surface app to the surface it actually lives on', () => {
    try {
      beforeLoad({ params: { brandId: 'b-1', appId: 'context' } })
    } catch {
      // The real `redirect` return value is thrown, not returned; the mock's is
      // `undefined`. The call itself is what we assert on.
    }
    expect(vi.mocked(redirect)).toHaveBeenCalledWith({
      to: '/brands/$brandId/context',
      params: { brandId: 'b-1' },
    })
  })

  it('lets a tile app through', () => {
    beforeLoad({ params: { brandId: 'b-1', appId: 'copywriting' } })
    expect(vi.mocked(redirect)).not.toHaveBeenCalled()
  })

  // An id no row claims is not a hidden row — it still belongs to the page's
  // unknown-app branch, which explains itself rather than bouncing elsewhere.
  it('leaves an unregistered id to the unknown-app branch', () => {
    beforeLoad({ params: { brandId: 'b-1', appId: 'nope' } })
    expect(vi.mocked(redirect)).not.toHaveBeenCalled()
  })
})
