import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ProjectSummary } from '@brandfactory/shared'
import { brandContextRoute } from './brands.$brandId.context'

const BRAND = { id: 'b-1', workspaceId: 'ws-1', name: 'Acme', description: null, sections: [] }

// A written section, so the rail's written/unwritten split is assertable from
// the page. The body is never disclosed here, so a minimal doc suffices.
const SECTION = {
  id: 's-1',
  brandId: 'b-1',
  label: 'Voice & tone',
  body: { type: 'doc', content: [] },
  priority: 1000,
  createdBy: 'user',
  createdAt: '2026-07-24T00:00:00.000Z',
  updatedAt: '2026-07-24T00:00:00.000Z',
}

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

// Stubbed for the same reason as NewProjectDialog: the editor's behaviour is
// covered in its own tests, and mounting the real one drags in dnd-kit and a
// live TipTap instance. What matters here is the wiring — that the rail's
// `onEdit` reaches this dialog's `open`.
vi.mock('@/components/brand/EditGuidelinesDialog', () => ({
  EditGuidelinesDialog: ({ open }: { open: boolean }) => (
    <div data-testid="edit-guidelines" data-open={String(open)} />
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

  // The blocks overview beside the conversations: the same rail the hub shows,
  // written sections and unwritten suggestions in one list, so arriving here
  // answers "what do we know?" without a detour back to Overview.
  it('shows the brand context blocks beside the conversations', () => {
    h.brand = { data: { ...BRAND, sections: [SECTION] }, isPending: false, isError: false }
    h.projects = [CONVERSATION]
    render(<BrandContextPage />)

    expect(screen.getByRole('complementary', { name: 'Brand context' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Voice & tone' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Add Target audience' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Add Voice & tone' })).toBeNull()
  })

  it('routes the rail’s Edit to the guidelines dialog', async () => {
    render(<BrandContextPage />)

    expect(screen.getByTestId('edit-guidelines').getAttribute('data-open')).toBe('false')
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }))
    expect(screen.getByTestId('edit-guidelines').getAttribute('data-open')).toBe('true')
  })

  // The rail's footer link points at /brands/:id/context — this page. A
  // self-link reads as an affordance and goes nowhere, so the page turns it off.
  it('does not offer a link to itself', () => {
    render(<BrandContextPage />)
    expect(screen.queryByRole('link', { name: 'Talk it through' })).toBeNull()
  })

  // The rail needs the brand's sections, so it is gated with the list: a
  // failed brand fetch shows the error line and nothing else.
  it('shows no rail on a failed brand fetch', () => {
    h.brand = { data: undefined, isPending: false, isError: true }
    render(<BrandContextPage />)
    expect(screen.queryByRole('complementary', { name: 'Brand context' })).toBeNull()
  })
})
