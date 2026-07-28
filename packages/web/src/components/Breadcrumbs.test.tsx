import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BreadcrumbProvider, Breadcrumbs, useBreadcrumbTrail } from './Breadcrumbs'

function TrailSetter({
  project,
  leaf,
}: {
  project?: { id: string; name: string }
  leaf?: { name: string }
}) {
  useBreadcrumbTrail({ project, leaf })
  return null
}

function renderWithTrail(trail: {
  project?: { id: string; name: string }
  leaf?: { name: string }
}) {
  return render(
    <BreadcrumbProvider>
      <TrailSetter {...trail} />
      <Breadcrumbs />
    </BreadcrumbProvider>,
  )
}

describe('Breadcrumbs', () => {
  it('renders nothing when there is no tail', () => {
    const { container } = renderWithTrail({})
    expect(container.querySelector('nav')).toBeNull()
  })

  it('renders a project tail', () => {
    renderWithTrail({ project: { id: 'p-1', name: 'Q3 campaign' } })
    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' })
    expect(nav.textContent).toContain('Q3 campaign')
  })

  it('renders a leaf tail when there is no project', () => {
    renderWithTrail({ leaf: { name: 'Copywriting' } })
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' }).textContent).toContain(
      'Copywriting',
    )
  })

  it('prefers the project over the leaf — a project is always the deeper crumb', () => {
    renderWithTrail({ project: { id: 'p-1', name: 'Q3 campaign' }, leaf: { name: 'Copywriting' } })
    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' })
    expect(nav.textContent).toContain('Q3 campaign')
    expect(nav.textContent).not.toContain('Copywriting')
  })

  // The brand moved into `BrandSwitcher`. A crumb that still rendered it would
  // print the same name twice in the header, beside the pill.
  it('never renders a brand segment', () => {
    renderWithTrail({ project: { id: 'p-1', name: 'Q3 campaign' } })
    expect(screen.queryByRole('link')).toBeNull()
  })
})
