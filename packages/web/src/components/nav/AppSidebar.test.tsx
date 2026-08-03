import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AppSidebar } from './AppSidebar'

const state: {
  token: string | null
  workspaceId: string | null
  brandId: string | null
  pathname: string
  stored: boolean
} = {
  token: 't-1',
  workspaceId: 'w-1',
  brandId: null,
  pathname: '/workspaces/w-1',
  stored: false,
}

const setPanelCollapsed = vi.fn()

vi.mock('@tanstack/react-router', () => ({
  useLocation: (opts?: { select?: (l: { pathname: string }) => unknown }) =>
    opts?.select ? opts.select({ pathname: state.pathname }) : { pathname: state.pathname },
}))

vi.mock('@/auth/store', () => ({
  useAuthStore: (sel: (s: { token: string | null }) => unknown) => sel({ token: state.token }),
}))

vi.mock('@/lib/workspace-context', () => ({
  useActiveWorkspaceId: () => state.workspaceId,
}))

vi.mock('@/lib/active-brand', () => ({
  useActiveBrandId: () => state.brandId,
}))

vi.mock('@/lib/sidebar-prefs', () => ({
  getPanelCollapsed: () => state.stored,
  setPanelCollapsed: (v: boolean) => setPanelCollapsed(v),
}))

// The three children have suites of their own. What this file is about is which
// of them is on screen, and when.
vi.mock('@/components/nav/BrandRail', () => ({
  BrandRail: ({
    workspaceId,
    panelCollapsed,
    onTogglePanel,
  }: {
    workspaceId: string | null
    panelCollapsed: boolean
    onTogglePanel: () => void
  }) => (
    <div
      data-testid="rail"
      data-workspace={workspaceId ?? ''}
      data-collapsed={String(panelCollapsed)}
    >
      <button type="button" onClick={onTogglePanel}>
        toggle
      </button>
    </div>
  ),
}))

vi.mock('@/components/nav/BrandNavPanel', () => ({
  BrandNavPanel: ({ brandId }: { brandId: string }) => (
    <div data-testid="brand-panel">{brandId}</div>
  ),
}))

vi.mock('@/components/nav/WorkspaceNavPanel', () => ({
  WorkspaceNavPanel: ({ workspaceId }: { workspaceId: string }) => (
    <div data-testid="workspace-panel">{workspaceId}</div>
  ),
}))

const props = { mobileOpen: false, onCloseMobile: vi.fn() }

describe('AppSidebar', () => {
  beforeEach(() => {
    state.token = 't-1'
    state.workspaceId = 'w-1'
    state.brandId = null
    state.pathname = '/workspaces/w-1'
    state.stored = false
    setPanelCollapsed.mockReset()
    props.onCloseMobile = vi.fn()
  })

  // The login route mounts the same shell, and a sidebar there would be a
  // column of queries that 401 behind a form.
  it('renders nothing without a token', () => {
    state.token = null
    const { container } = render(<AppSidebar {...props} />)
    expect(container.innerHTML).toBe('')
  })

  it('shows the workspace panel outside a brand', () => {
    render(<AppSidebar {...props} />)
    expect(screen.getByTestId('workspace-panel').textContent).toBe('w-1')
    expect(screen.queryByTestId('brand-panel')).toBeNull()
  })

  // `useActiveBrandId` resolves a brand from a *project* route too, which is
  // the case that matters: a thread has no `brandId` in its path, and dropping
  // to the workspace panel there would empty the nav on the page a persistent
  // one is most worth having.
  it('shows the brand panel whenever a brand resolves, including inside a thread', () => {
    state.brandId = 'b-1'
    state.pathname = '/projects/p-1'
    render(<AppSidebar {...props} />)
    expect(screen.getByTestId('brand-panel').textContent).toBe('b-1')
    expect(screen.queryByTestId('workspace-panel')).toBeNull()
  })

  it('draws the rail with no panel at all when neither scope has resolved', () => {
    state.workspaceId = null
    render(<AppSidebar {...props} />)
    expect(screen.getByTestId('rail')).toBeTruthy()
    expect(screen.queryByTestId('workspace-panel')).toBeNull()
    expect(screen.queryByTestId('brand-panel')).toBeNull()
  })

  it('starts folded when that is what was stored, and persists every flip', async () => {
    state.stored = true
    const user = userEvent.setup()
    render(<AppSidebar {...props} />)

    expect(screen.getByTestId('rail').getAttribute('data-collapsed')).toBe('true')
    await user.click(screen.getByRole('button', { name: 'toggle' }))
    expect(screen.getByTestId('rail').getAttribute('data-collapsed')).toBe('false')
    expect(setPanelCollapsed).toHaveBeenCalledWith(false)
  })

  // Navigating from inside the drawer must dismiss it, or the page you asked
  // for arrives underneath the thing you asked for it from.
  it('closes the mobile drawer when the path changes', () => {
    const { rerender } = render(<AppSidebar {...props} mobileOpen />)
    expect(props.onCloseMobile).not.toHaveBeenCalled()

    state.pathname = '/brands/b-1'
    rerender(<AppSidebar {...props} mobileOpen />)
    expect(props.onCloseMobile).toHaveBeenCalledTimes(1)
  })

  it('offers a backdrop only while the drawer is open', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<AppSidebar {...props} />)
    expect(screen.queryByRole('button', { name: 'Close navigation' })).toBeNull()

    rerender(<AppSidebar {...props} mobileOpen />)
    await user.click(screen.getByRole('button', { name: 'Close navigation' }))
    expect(props.onCloseMobile).toHaveBeenCalled()
  })
})
