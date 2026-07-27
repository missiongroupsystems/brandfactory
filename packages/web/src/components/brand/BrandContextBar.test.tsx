import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { BrandWithSections } from '@brandfactory/shared'
import { BrandContextBar } from './BrandContextBar'

// The bar's conversation entry points are real `<Link>`s, which need a router
// context this component test does not stand up. Same stub the mini-app route
// test uses: interpolate params into `to` so the href is assertable.
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

function section(
  id: string,
  label: string,
  text = `${label} body`,
): BrandWithSections['sections'][number] {
  return {
    id: id as BrandWithSections['sections'][number]['id'],
    brandId: 'b-1' as BrandWithSections['id'],
    label,
    body: {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
    },
    priority: 1000,
    createdBy: 'user',
    createdAt: '2026-07-24T00:00:00.000Z',
    updatedAt: '2026-07-24T00:00:00.000Z',
  }
}

function brand(sections: BrandWithSections['sections']): BrandWithSections {
  return {
    id: 'b-1' as BrandWithSections['id'],
    workspaceId: 'w-1' as BrandWithSections['workspaceId'],
    name: 'Acme',
    description: null,
    createdAt: '2026-07-24T00:00:00.000Z',
    updatedAt: '2026-07-24T00:00:00.000Z',
    sections,
  }
}

describe('BrandContextBar', () => {
  it('empty state calls onEdit', async () => {
    const onEdit = vi.fn()
    render(<BrandContextBar brand={brand([])} onEdit={onEdit} />)
    await userEvent.click(screen.getByRole('button', { name: 'Add brand context' }))
    expect(onEdit).toHaveBeenCalledOnce()
  })

  // Two entry points, because the bar has two shapes. A brand that starts as a
  // rough idea only ever sees the empty state, so the conversation has to be
  // offered there — that is the intended first-run path.
  it('offers the conversation from the empty state', () => {
    render(<BrandContextBar brand={brand([])} onEdit={vi.fn()} />)
    const link = screen.getByRole('link', { name: '…or talk it through' })
    expect(link.getAttribute('href')).toBe('/brands/b-1/context')
  })

  it('offers the conversation beside Edit once sections exist', () => {
    render(<BrandContextBar brand={brand([section('s-1', 'Voice & tone')])} onEdit={vi.fn()} />)
    const link = screen.getByRole('link', { name: 'Talk it through' })
    expect(link.getAttribute('href')).toBe('/brands/b-1/context')
  })

  it('chip reveals a read-only body; collapse hides labels; Edit fires', async () => {
    const onEdit = vi.fn()
    render(
      <BrandContextBar
        brand={brand([section('s-1', 'Voice & tone'), section('s-2', 'Target audience')])}
        onEdit={onEdit}
      />,
    )

    const chip = screen.getByRole('button', { name: 'Voice & tone' })
    expect(chip.textContent).toContain('Voice & tone')
    await userEvent.click(chip)
    expect(await screen.findByText('Voice & tone body')).toBeTruthy()

    // Selecting a different chip swaps the panel body.
    await userEvent.click(screen.getByRole('button', { name: 'Target audience' }))
    expect(await screen.findByText('Target audience body')).toBeTruthy()
    expect(screen.queryByText('Voice & tone body')).toBeNull()

    // Collapse: chips lose their labels but stay reachable by accessible name.
    await userEvent.click(screen.getByRole('button', { name: 'Brand context' }))
    expect(screen.getByRole('button', { name: 'Voice & tone' }).textContent).toBe('')
    // Panel survives collapse.
    expect(screen.getByText('Target audience body')).toBeTruthy()

    await userEvent.click(screen.getByRole('button', { name: 'Edit' }))
    expect(onEdit).toHaveBeenCalledOnce()
  })

  // A save from EditGuidelinesDialog repoints the cached brand while section
  // ids stay put, so the read panel's key does not change. Without an explicit
  // content sync the seeded editor keeps rendering the pre-edit body.
  it('re-renders the open panel when the section body is edited', async () => {
    const { rerender } = render(
      <BrandContextBar
        brand={brand([section('s-1', 'Voice & tone', 'Dry and clinical')])}
        onEdit={vi.fn()}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Voice & tone' }))
    expect(await screen.findByText('Dry and clinical')).toBeTruthy()

    rerender(
      <BrandContextBar
        brand={brand([section('s-1', 'Voice & tone', 'Warm and playful')])}
        onEdit={vi.fn()}
      />,
    )

    expect(await screen.findByText('Warm and playful')).toBeTruthy()
    expect(screen.queryByText('Dry and clinical')).toBeNull()
  })

  it('points the collapse toggle at the region it controls', () => {
    render(<BrandContextBar brand={brand([section('s-1', 'Voice & tone')])} onEdit={vi.fn()} />)

    const toggle = screen.getByRole('button', { name: 'Brand context' })
    const controlled = toggle.getAttribute('aria-controls')
    expect(controlled).toBeTruthy()
    expect(document.getElementById(controlled as string)).toBeTruthy()
  })

  // The chip row never hides, so the toggle is a toggle button, not a
  // disclosure: it reports pressed state, not a (false) hidden-region state.
  it('reports collapse via aria-pressed, not aria-expanded', async () => {
    render(<BrandContextBar brand={brand([section('s-1', 'Voice & tone')])} onEdit={vi.fn()} />)

    const toggle = screen.getByRole('button', { name: 'Brand context' })
    expect(toggle.getAttribute('aria-expanded')).toBeNull()
    expect(toggle.getAttribute('aria-pressed')).toBe('false')

    await userEvent.click(toggle)
    expect(toggle.getAttribute('aria-pressed')).toBe('true')
  })
})
