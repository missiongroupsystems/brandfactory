import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { BrandSummary } from '@brandfactory/shared'
import { BrandCard } from './BrandCard'

// Same `Link` stub `ProjectCard`'s tests use — the card renders from props and
// two mutation hooks, and neither needs a router context to be exercised.
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

vi.mock('@/api/queries/brands', () => ({
  useUpdateBrand: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteBrand: () => ({ mutate: vi.fn(), isPending: false }),
}))

function summary(overrides: Partial<BrandSummary> = {}): BrandSummary {
  return {
    id: 'b-1' as BrandSummary['id'],
    workspaceId: 'w-1' as BrandSummary['workspaceId'],
    name: 'Casa Vostra',
    description: 'Neighbourhood trattoria.',
    websiteUrl: null,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    sectionCount: 2,
    projectCount: 1,
    ...overrides,
  }
}

describe('BrandCard — website', () => {
  it('renders nothing for a brand without one', () => {
    render(<BrandCard brand={summary()} />)
    expect(screen.queryByText(/casavostra\.com/)).toBeNull()
  })

  it('renders the host rather than the full URL', () => {
    render(<BrandCard brand={summary({ websiteUrl: 'https://www.casavostra.com/menu' })} />)
    expect(screen.getByText('casavostra.com/menu')).toBeTruthy()
    expect(screen.queryByText('https://www.casavostra.com/menu')).toBeNull()
  })

  // The card is one big link to the brand. A nested `<a>` to the website would
  // be invalid HTML and would sit under the card's own click overlay — present
  // to a screen reader, unreachable with a mouse.
  it('is not itself a link to the website', () => {
    render(<BrandCard brand={summary({ websiteUrl: 'https://casavostra.com' })} />)

    const host = screen.getByText('casavostra.com')
    expect(host.closest('a')?.getAttribute('href')).toBe('/brands/b-1')
    for (const link of screen.getAllByRole('link')) {
      expect(link.getAttribute('href')).not.toContain('casavostra.com')
    }
  })
})
