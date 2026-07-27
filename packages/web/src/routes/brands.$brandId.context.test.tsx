import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { ProjectSummary } from '@brandfactory/shared'
import { brandContextRoute } from './brands.$brandId.context'

const BRAND = { id: 'b-1', workspaceId: 'ws-1', name: 'Acme', description: null, sections: [] }

const h = vi.hoisted(() => ({
  params: { brandId: 'b-1' },
  projects: [] as unknown[],
  // Swapped per test so the brand query's pending / error states are reachable;
  // the page gates its list on the brand (ProjectCard needs workspaceId).
  brand: { data: undefined as unknown, isPending: false, isError: false },
}))

vi.mock('@tanstack/react-router', () => ({
  // The real createRoute needs a router context; this keeps the options object
  // (including `component`) reachable so the page can be rendered directly.
  createRoute: (opts: Record<string, unknown>) => ({ ...opts, useParams: () => h.params }),
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

// Stubbed so the templateId this page creates with is assertable. The dialog's
// own behaviour (including that templateId reaches the mutation) is covered in
// NewProjectDialog.test.tsx; what matters here is that the page creates under
// the same template it filters by, or a new conversation would vanish from the
// very list that made it.
vi.mock('@/components/project/NewProjectDialog', () => ({
  NewProjectDialog: ({
    templateId,
    trigger,
  }: {
    templateId?: string
    trigger?: React.ReactNode
  }) => (
    <div data-testid="new-conversation" data-template-id={templateId}>
      {trigger}
    </div>
  ),
}))

const BrandContextPage = (brandContextRoute as unknown as { component: () => React.ReactElement })
  .component

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

const CONVERSATION: ProjectSummary = {
  ...base('Who is this for'),
  kind: 'standardized',
  templateId: 'brand-context',
}
const COPY_THREAD: ProjectSummary = {
  ...base('Tagline round 1'),
  kind: 'standardized',
  templateId: 'copywriting',
}
const FREEFORM_THREAD: ProjectSummary = { ...base('Scratch canvas'), kind: 'freeform' }

describe('brand context route', () => {
  beforeEach(() => {
    h.params = { brandId: 'b-1' }
    h.projects = []
    h.brand = { data: BRAND, isPending: false, isError: false }
  })

  it('lists only this brand’s conversations', () => {
    h.projects = [CONVERSATION, COPY_THREAD, FREEFORM_THREAD]
    render(<BrandContextPage />)

    expect(screen.getByText('Who is this for')).toBeTruthy()
    expect(screen.queryByText('Tagline round 1')).toBeNull()
    expect(screen.queryByText('Scratch canvas')).toBeNull()
    expect(screen.getByRole('button', { name: 'New conversation' })).toBeTruthy()
  })

  it('creates under the same template it lists by', () => {
    h.projects = [CONVERSATION]
    render(<BrandContextPage />)

    // The listed thread carries this templateId (it is the CONVERSATION
    // fixture the filter above claimed), so create and list agree.
    expect(screen.getByTestId('new-conversation').getAttribute('data-template-id')).toBe(
      CONVERSATION.kind === 'standardized' ? CONVERSATION.templateId : undefined,
    )
  })

  // An empty brand context is the normal starting state, not a failure.
  it('invites a first conversation when there are none', () => {
    render(<BrandContextPage />)

    expect(screen.getByText(/No conversations yet/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'New conversation' })).toBeTruthy()
  })

  // The 1.4.0 I2 regression, one route out: the list needs the brand for
  // `workspaceId`, so a failed brand fetch must say so rather than render blank.
  it('explains a failed brand fetch instead of rendering a blank page', () => {
    h.brand = { data: undefined, isPending: false, isError: true }
    h.projects = [CONVERSATION]
    render(<BrandContextPage />)

    expect(screen.getByText('Failed to load this brand.')).toBeTruthy()
    expect(screen.queryByText(/No conversations yet/)).toBeNull()
    expect(screen.queryByText('Who is this for')).toBeNull()
  })

  it('shows a loading state while the brand resolves', () => {
    h.brand = { data: undefined, isPending: true, isError: false }
    h.projects = [CONVERSATION]
    render(<BrandContextPage />)

    expect(screen.getByText('Loading conversations…')).toBeTruthy()
    expect(screen.queryByText(/No conversations yet/)).toBeNull()
  })
})
