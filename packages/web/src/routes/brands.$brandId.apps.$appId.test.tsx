import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
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

vi.mock('@/api/queries/brands', () => ({
  useBrand: () => h.brand,
  useBrandProjects: () => ({ data: h.projects, isPending: false, isError: false }),
}))

vi.mock('@/api/queries/projects', () => ({
  useCreateProject: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateProject: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteProject: () => ({ mutate: vi.fn(), isPending: false }),
}))

vi.mock('@/components/Breadcrumbs', () => ({
  useBreadcrumbTrail: () => undefined,
}))

const MiniAppPage = (miniAppRoute as unknown as { component: () => React.ReactElement }).component

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
const VISUAL_THREAD: ProjectSummary = {
  ...base('Logo directions'),
  kind: 'standardized',
  templateId: 'visual',
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
    h.params = { brandId: 'b-1', appId: 'visual' }
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
    h.params = { brandId: 'b-1', appId: 'visual' }
    h.projects = [VISUAL_THREAD, COPY_THREAD]
    render(<MiniAppPage />)

    expect(screen.getByText('Coming soon')).toBeTruthy()
    expect(screen.getByText('Logo directions')).toBeTruthy()
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

  it('handles an unregistered appId', () => {
    h.params = { brandId: 'b-1', appId: 'nope' }
    render(<MiniAppPage />)

    expect(screen.getByText('Unknown mini-app')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'New thread' })).toBeNull()
  })
})
