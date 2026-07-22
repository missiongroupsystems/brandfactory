import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ProjectCard } from './ProjectCard'

vi.mock('@tanstack/react-router', () => ({
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

vi.mock('@/lib/relative-time', () => ({
  formatRelativeTime: () => '2 hours ago',
}))

vi.mock('@/api/queries/projects', () => ({
  useUpdateProject: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteProject: () => ({ mutate: vi.fn(), isPending: false }),
}))

describe('ProjectCard', () => {
  const base = {
    id: 'p-1',
    name: 'Launch naming',
    kind: 'freeform' as const,
    brandId: 'b-1',
    workspaceId: 'ws-1',
    lastActivityAt: '2026-04-20T10:00:00.000Z',
  }

  it('shows brand name when showBrandName is true', () => {
    render(<ProjectCard {...base} brandName="Acme Coffee" showBrandName />)
    expect(screen.getByText('Acme Coffee')).toBeTruthy()
    expect(screen.getByText('Launch naming')).toBeTruthy()
    expect(screen.getByText('2 hours ago')).toBeTruthy()
  })

  it('hides brand name when showBrandName is false', () => {
    render(<ProjectCard {...base} brandName="Acme Coffee" showBrandName={false} />)
    expect(screen.queryByText('Acme Coffee')).toBeNull()
  })

  it('renders the kind badge', () => {
    render(<ProjectCard {...base} kind="standardized" />)
    expect(screen.getByText('standardized')).toBeTruthy()
  })

  it('navigates via a real link so it can be opened in a new tab', () => {
    render(<ProjectCard {...base} />)
    const link = screen.getByRole('link', { name: /Launch naming/ })
    expect(link.getAttribute('href')).toBe('/projects/p-1')
  })
})
