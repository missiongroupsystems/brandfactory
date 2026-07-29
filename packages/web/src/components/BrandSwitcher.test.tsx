import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { BrandSummary, BrandWithSections, ProjectDetail } from '@brandfactory/shared'
import { BrandSwitcher } from './BrandSwitcher'

const navigate = vi.fn()

// Route params and the project detail are mocked, but `useActiveBrandId` is
// not: brand resolution is the part of this component worth pinning, and a
// mocked resolver would test the mock.
const state: {
  params: { brandId?: string; projectId?: string }
  project: ProjectDetail | undefined
  brands: BrandSummary[] | undefined
  brand: BrandWithSections | undefined
} = { params: {}, project: undefined, brands: undefined, brand: undefined }

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigate,
  useParams: () => state.params,
}))

vi.mock('@/auth/store', () => ({
  useAuthStore: (sel: (s: { token: string | null }) => unknown) => sel({ token: 't-1' }),
}))

vi.mock('@/api/queries/projects', () => ({
  useProjectDetail: () => ({ data: state.project }),
}))

vi.mock('@/api/queries/brands', () => ({
  useBrand: () => ({ data: state.brand }),
}))

vi.mock('@/api/queries/workspaces', () => ({
  useWorkspaceBrands: () => ({ data: state.brands }),
}))

vi.mock('@/lib/workspace-context', () => ({
  useActiveWorkspaceId: () => 'ws-1',
}))

function brandSummary(id: string, name: string): BrandSummary {
  return {
    id: id as BrandSummary['id'],
    workspaceId: 'ws-1' as BrandSummary['workspaceId'],
    name,
    description: null,
    websiteUrl: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    sectionCount: 0,
    projectCount: 0,
  }
}

const brands = [brandSummary('b-1', 'Casa Vostra'), brandSummary('b-2', 'Acme Coffee')]

describe('BrandSwitcher', () => {
  beforeEach(() => {
    navigate.mockReset()
    state.params = { brandId: 'b-1' }
    state.project = undefined
    state.brands = brands
    state.brand = undefined
  })

  it('names the trigger after the active brand', () => {
    render(<BrandSwitcher />)
    // The accessible name is the brand itself, for the same reason as the
    // workspace switcher: an `aria-label` would hide which one is active.
    expect(screen.getByRole('button', { name: /Casa Vostra/ })).toBeTruthy()
  })

  it('renders nothing outside a brand', () => {
    state.params = {}
    const { container } = render(<BrandSwitcher />)
    expect(container.innerHTML).toBe('')
  })

  it('resolves the brand from a project route, where there is no brandId param', () => {
    state.params = { projectId: 'p-1' }
    state.project = {
      id: 'p-1',
      brand: { id: 'b-2', name: 'Acme Coffee', workspaceId: 'ws-1' },
    } as unknown as ProjectDetail

    render(<BrandSwitcher />)
    expect(screen.getByRole('button', { name: /Acme Coffee/ })).toBeTruthy()
  })

  // Without this the pill flashes an empty or placeholder label on every
  // navigation into a brand, since the workspace-wide list is a second request.
  it('falls back to the brand detail while the workspace brand list is loading', () => {
    state.brands = undefined
    state.brand = { id: 'b-1', name: 'Casa Vostra' } as unknown as BrandWithSections

    render(<BrandSwitcher />)
    expect(screen.getByRole('button', { name: /Casa Vostra/ })).toBeTruthy()
  })

  it('renders no pill at all when no name has resolved yet', () => {
    state.brands = undefined
    const { container } = render(<BrandSwitcher />)
    expect(container.innerHTML).toBe('')
  })

  it('marks the active brand with aria-checked, not styling alone', async () => {
    const user = userEvent.setup()
    render(<BrandSwitcher />)
    await user.click(screen.getByRole('button', { name: /Casa Vostra/ }))

    const current = await screen.findByRole('menuitemradio', { name: /Casa Vostra/ })
    const other = screen.getByRole('menuitemradio', { name: /Acme Coffee/ })
    expect(current.getAttribute('aria-checked')).toBe('true')
    expect(other.getAttribute('aria-checked')).toBe('false')
  })

  // From a project page, specifically: the id in the route belongs to the brand
  // being left, so anything but the hub would be a dead or foreign route.
  it('navigates to the hub of the selected brand', async () => {
    state.params = { projectId: 'p-1' }
    state.project = {
      id: 'p-1',
      brand: { id: 'b-1', name: 'Casa Vostra', workspaceId: 'ws-1' },
    } as unknown as ProjectDetail

    const user = userEvent.setup()
    render(<BrandSwitcher />)
    await user.click(screen.getByRole('button', { name: /Casa Vostra/ }))
    await user.click(screen.getByRole('menuitemradio', { name: /Acme Coffee/ }))

    expect(navigate).toHaveBeenCalledWith({ to: '/brands/$brandId', params: { brandId: 'b-2' } })
  })

  it('offers a way back out to the workspace', async () => {
    const user = userEvent.setup()
    render(<BrandSwitcher />)
    await user.click(screen.getByRole('button', { name: /Casa Vostra/ }))
    await user.click(screen.getByRole('menuitem', { name: 'All brands' }))

    expect(navigate).toHaveBeenCalledWith({ to: '/workspaces/$wsId', params: { wsId: 'ws-1' } })
  })
})
