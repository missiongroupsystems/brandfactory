import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { BrandSummary, Workspace } from '@brandfactory/shared'
import { WorkspaceNavPanel } from './WorkspaceNavPanel'

const state: {
  pathname: string
  workspace: Workspace | undefined
  brands: BrandSummary[] | undefined
} = {
  pathname: '/workspaces/w-1',
  workspace: undefined,
  brands: undefined,
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

vi.mock('@/api/queries/workspaces', () => ({
  useWorkspace: () => ({ data: state.workspace }),
  useWorkspaceBrands: () => ({ data: state.brands }),
}))

// Stubbed rather than rendered: the real one pulls the api client and a
// mutation, and its own suite covers the form. What matters here is the wiring.
vi.mock('@/components/NewBrandDialog', () => ({
  NewBrandDialog: ({ wsId, open }: { wsId: string; open?: boolean }) =>
    open ? <div data-testid="new-brand-dialog">{wsId}</div> : null,
}))

function brandSummary(id: string, name: string, projectCount = 0): BrandSummary {
  return {
    id: id as BrandSummary['id'],
    workspaceId: 'w-1' as BrandSummary['workspaceId'],
    name,
    description: null,
    websiteUrl: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    sectionCount: 0,
    projectCount,
    tldr: null,
  }
}

describe('WorkspaceNavPanel', () => {
  beforeEach(() => {
    state.pathname = '/workspaces/w-1'
    state.workspace = {
      id: 'w-1' as Workspace['id'],
      name: 'Mission Group',
      ownerUserId: 'u-1' as Workspace['ownerUserId'],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }
    state.brands = [brandSummary('b-1', 'Casa Vostra', 3), brandSummary('b-2', 'Acme Coffee')]
  })

  it('names the workspace and lists its brands by name', () => {
    render(<WorkspaceNavPanel workspaceId="w-1" />)

    expect(screen.getByText('Mission Group')).toBeTruthy()
    expect(screen.getByRole('link', { name: /Casa Vostra/ }).getAttribute('href')).toBe(
      '/brands/b-1',
    )
    expect(screen.getByRole('link', { name: /Acme Coffee/ })).toBeTruthy()
  })

  it('marks workspace home as the current page', () => {
    render(<WorkspaceNavPanel workspaceId="w-1" />)
    expect(screen.getByRole('link', { name: /Overview/ }).getAttribute('aria-current')).toBe('page')
    expect(screen.getByRole('link', { name: /Settings/ }).getAttribute('aria-current')).toBeNull()
  })

  it('marks settings as the current page', () => {
    state.pathname = '/workspaces/w-1/settings'
    render(<WorkspaceNavPanel workspaceId="w-1" />)
    expect(screen.getByRole('link', { name: /Settings/ }).getAttribute('aria-current')).toBe('page')
    expect(screen.getByRole('link', { name: /Overview/ }).getAttribute('aria-current')).toBeNull()
  })

  // The panel never renders inside a brand, so a brand row here can be the
  // destination but never the current page.
  it('never marks a brand row as the current page', () => {
    render(<WorkspaceNavPanel workspaceId="w-1" />)
    expect(
      screen.getByRole('link', { name: /Casa Vostra/ }).getAttribute('aria-current'),
    ).toBeNull()
  })

  // A workspace whose name has not arrived renders the header row empty rather
  // than flashing a placeholder on every page load of the shell.
  it('shows no placeholder name while the workspace is loading', () => {
    state.workspace = undefined
    const { container } = render(<WorkspaceNavPanel workspaceId="w-1" />)
    // The header keeps its height and says nothing. A placeholder here would
    // flash on every load of every page in the shell.
    expect(container.querySelector('header')?.textContent).toBe('')
  })

  it('opens the new-brand dialog against this workspace', async () => {
    const user = userEvent.setup()
    render(<WorkspaceNavPanel workspaceId="w-1" />)

    expect(screen.queryByTestId('new-brand-dialog')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'New brand…' }))
    expect(screen.getByTestId('new-brand-dialog').textContent).toBe('w-1')
  })
})
