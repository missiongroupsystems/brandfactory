import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Workspace } from '@brandfactory/shared'
import { WorkspaceSwitcher } from './WorkspaceSwitcher'

const navigate = vi.fn()
const setLastWorkspaceId = vi.fn()

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigate,
  useParams: () => ({}),
  Link: ({ children, ...props }: { children: React.ReactNode }) => <a {...props}>{children}</a>,
}))

vi.mock('@/auth/store', () => ({
  useAuthStore: (sel: (s: { token: string | null }) => unknown) => sel({ token: 't-1' }),
}))

const workspaces: Workspace[] = [
  {
    id: 'ws-1' as Workspace['id'],
    name: 'Mission Group',
    ownerUserId: 'u-1' as Workspace['ownerUserId'],
    linkedToPassport: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'ws-2' as Workspace['id'],
    name: 'Side Project',
    ownerUserId: 'u-1' as Workspace['ownerUserId'],
    linkedToPassport: false,
    createdAt: '2026-02-01T00:00:00.000Z',
    updatedAt: '2026-02-01T00:00:00.000Z',
  },
]

vi.mock('@/api/queries/workspaces', () => ({
  useWorkspaces: () => ({ data: workspaces }),
  workspaceKeys: { all: () => ['workspaces'] },
}))

vi.mock('@/api/queries/brands', () => ({
  useBrand: () => ({ data: undefined }),
}))

vi.mock('@/api/queries/projects', () => ({
  useProjectDetail: () => ({ data: undefined }),
}))

vi.mock('@/lib/last-workspace', () => ({
  getLastWorkspaceId: () => 'ws-1',
  setLastWorkspaceId: (...args: unknown[]) => setLastWorkspaceId(...args),
}))

vi.mock('@/lib/workspace-context', () => ({
  resolveActiveWorkspaceId: () => 'ws-1',
  resolveLandingWorkspaceId: () => 'ws-1',
  useActiveWorkspaceId: () => 'ws-1',
}))

// New workspace dialog pulls mutation/api — keep it inert.
vi.mock('@/components/NewWorkspaceDialog', () => ({
  NewWorkspaceDialog: () => null,
}))

describe('WorkspaceSwitcher', () => {
  beforeEach(() => {
    navigate.mockReset()
    setLastWorkspaceId.mockReset()
  })

  it('names the trigger after the active workspace', async () => {
    const user = userEvent.setup()
    render(<WorkspaceSwitcher />)

    // The accessible name must be the workspace itself — an `aria-label` of
    // "Switch workspace" would override the text and hide which one is active.
    const trigger = screen.getByRole('button', { name: /Mission Group/ })
    expect(trigger).toBeTruthy()

    await user.click(trigger)
    expect(screen.getByRole('menuitem', { name: 'New workspace…' })).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: 'Workspace settings' })).toBeTruthy()
  })

  it('marks the active workspace with aria-checked, not styling alone', async () => {
    const user = userEvent.setup()
    render(<WorkspaceSwitcher />)
    await user.click(screen.getByRole('button', { name: /Mission Group/ }))

    const current = await screen.findByRole('menuitemradio', { name: /Mission Group/ })
    const other = screen.getByRole('menuitemradio', { name: /Side Project/ })
    expect(current.getAttribute('aria-checked')).toBe('true')
    expect(other.getAttribute('aria-checked')).toBe('false')
  })

  it('navigates and persists last workspace on select', async () => {
    const user = userEvent.setup()
    render(<WorkspaceSwitcher />)
    await user.click(screen.getByRole('button', { name: /Mission Group/ }))
    await user.click(screen.getByRole('menuitemradio', { name: /Side Project/ }))

    expect(setLastWorkspaceId).toHaveBeenCalledWith('ws-2')
    expect(navigate).toHaveBeenCalledWith({
      to: '/workspaces/$wsId',
      params: { wsId: 'ws-2' },
    })
  })
})
