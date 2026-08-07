import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { BrandSummary } from '@brandfactory/shared'
import { BrandRail } from './BrandRail'

const state: { brands: BrandSummary[] | undefined; activeBrandId: string | null } = {
  brands: undefined,
  activeBrandId: null,
}

vi.mock('@tanstack/react-router', () => ({
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
  useWorkspaceBrands: () => ({ data: state.brands }),
}))

vi.mock('@/lib/active-brand', () => ({
  useActiveBrandId: () => state.activeBrandId,
}))

// Each has a suite of its own; the rail's job is to give them a place.
vi.mock('@/components/WorkspaceSwitcher', () => ({
  WorkspaceSwitcher: () => <div data-testid="workspace-switcher" />,
}))

vi.mock('@/components/ThemeToggle', () => ({
  ThemeToggle: () => <div data-testid="theme-toggle" />,
}))

vi.mock('@/components/nav/AccountMenu', () => ({
  AccountMenu: () => <div data-testid="account-menu" />,
}))

vi.mock('@/components/NewBrandDialog', () => ({
  NewBrandDialog: ({ wsId, open }: { wsId: string; open?: boolean }) =>
    open ? <div data-testid="new-brand-dialog">{wsId}</div> : null,
}))

function brandSummary(id: string, name: string): BrandSummary {
  return {
    id: id as BrandSummary['id'],
    workspaceId: 'w-1' as BrandSummary['workspaceId'],
    name,
    description: null,
    websiteUrl: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    sectionCount: 0,
    projectCount: 0,
    tldr: null,
  }
}

const props = { workspaceId: 'w-1', panelCollapsed: false, onTogglePanel: vi.fn() }

describe('BrandRail', () => {
  beforeEach(() => {
    state.brands = [brandSummary('b-1', 'Casa Vostra'), brandSummary('b-2', 'Acme Coffee')]
    state.activeBrandId = null
    props.onTogglePanel = vi.fn()
  })

  // `BrandMark` is `aria-hidden` by construction — it restates the name — so
  // without the `sr-only` text the rail is a column of unlabelled squares.
  it('names every brand it draws, for a reader that cannot see the mark', () => {
    render(<BrandRail {...props} />)
    expect(screen.getByRole('link', { name: 'Casa Vostra' }).getAttribute('href')).toBe(
      '/brands/b-1',
    )
    expect(screen.getByRole('link', { name: 'Acme Coffee' })).toBeTruthy()
  })

  it('gives the pointer the same name as a tooltip', () => {
    render(<BrandRail {...props} />)
    expect(screen.getByRole('link', { name: 'Casa Vostra' }).getAttribute('title')).toBe(
      'Casa Vostra',
    )
  })

  it('rings the brand you are in, and only that one', () => {
    state.activeBrandId = 'b-2'
    render(<BrandRail {...props} />)
    expect(screen.getByRole('link', { name: 'Acme Coffee' }).className).toContain('ring-2')
    expect(screen.getByRole('link', { name: 'Casa Vostra' }).className).not.toContain('ring-2')
  })

  it('opens the new-brand dialog against the active workspace', async () => {
    const user = userEvent.setup()
    render(<BrandRail {...props} />)

    expect(screen.queryByTestId('new-brand-dialog')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'New brand' }))
    expect(screen.getByTestId('new-brand-dialog').textContent).toBe('w-1')
  })

  // No workspace resolved means no POST target — the same gate `BrandSwitcher`
  // puts on its own create item.
  it('cannot create a brand before a workspace resolves', () => {
    render(<BrandRail {...props} workspaceId={null} />)
    expect(screen.getByRole('button', { name: 'New brand' }).hasAttribute('disabled')).toBe(true)
    expect(screen.queryByTestId('new-brand-dialog')).toBeNull()
  })

  // The rail is the only place the account tile is mounted, and the tile is
  // the only way out of the session. A workspace that has not resolved yet
  // must not take it away with it — a first-run user with no workspace has an
  // empty rail and still has to be able to sign out.
  it('carries the account tile whether or not a workspace has resolved', () => {
    const { rerender } = render(<BrandRail {...props} />)
    expect(screen.getByTestId('account-menu')).toBeTruthy()

    rerender(<BrandRail {...props} workspaceId={null} />)
    expect(screen.getByTestId('account-menu')).toBeTruthy()
  })

  it('reports the panel’s folded state on the toggle, and asks the shell to flip it', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<BrandRail {...props} />)

    const toggle = screen.getByRole('button', { name: 'Hide navigation panel' })
    expect(toggle.getAttribute('aria-pressed')).toBe('false')
    await user.click(toggle)
    expect(props.onTogglePanel).toHaveBeenCalledTimes(1)

    rerender(<BrandRail {...props} panelCollapsed />)
    expect(
      screen.getByRole('button', { name: 'Show navigation panel' }).getAttribute('aria-pressed'),
    ).toBe('true')
  })
})
