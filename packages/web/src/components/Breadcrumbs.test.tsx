import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BreadcrumbProvider, Breadcrumbs, useBreadcrumbTrail } from './Breadcrumbs'

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    to,
    params,
  }: {
    children: React.ReactNode
    to: string
    params?: Record<string, string>
  }) => (
    <a href={`${to}?${new URLSearchParams(params).toString()}`} data-to={to}>
      {children}
    </a>
  ),
}))

function TrailSetter({
  brand,
  project,
}: {
  brand?: { id: string; name: string }
  project?: { id: string; name: string }
}) {
  useBreadcrumbTrail({ brand, project })
  return null
}

function renderWithTrail(trail: {
  brand?: { id: string; name: string }
  project?: { id: string; name: string }
}) {
  return render(
    <BreadcrumbProvider>
      <TrailSetter {...trail} />
      <Breadcrumbs />
    </BreadcrumbProvider>,
  )
}

describe('Breadcrumbs', () => {
  it('renders nothing when there is no brand segment', () => {
    const { container } = renderWithTrail({})
    expect(container.querySelector('nav')).toBeNull()
  })

  it('renders a brand-only tail', () => {
    renderWithTrail({ brand: { id: 'b-1', name: 'Acme Coffee' } })
    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' })
    expect(nav.textContent).toContain('Acme Coffee')
    expect(nav.querySelector('a')).toBeNull()
  })

  it('renders brand + project tail with a brand link', () => {
    renderWithTrail({
      brand: { id: 'b-1', name: 'Acme Coffee' },
      project: { id: 'p-1', name: 'Q3 campaign' },
    })
    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' })
    expect(nav.textContent).toContain('Acme Coffee')
    expect(nav.textContent).toContain('Q3 campaign')
    const link = screen.getByRole('link', { name: 'Acme Coffee' })
    expect(link.getAttribute('href')).toContain('b-1')
  })
})
