import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { BrandWithSections } from '@brandfactory/shared'
import { BrandIdentity } from './BrandIdentity'

function brand(overrides: Partial<BrandWithSections> = {}): BrandWithSections {
  return {
    id: 'b-1' as BrandWithSections['id'],
    workspaceId: 'w-1' as BrandWithSections['workspaceId'],
    name: 'Mission Group',
    description: 'This is the core Mission Group brand.',
    createdAt: '2026-07-24T00:00:00.000Z',
    updatedAt: '2026-07-24T00:00:00.000Z',
    sections: [],
    ...overrides,
  }
}

describe('BrandIdentity', () => {
  it('renders the mark, the name and the description', () => {
    render(<BrandIdentity brand={brand()} onRename={vi.fn()} onDelete={vi.fn()} />)

    expect(screen.getByRole('heading', { name: 'Mission Group' })).toBeTruthy()
    expect(screen.getByText('This is the core Mission Group brand.')).toBeTruthy()
    expect(screen.getByText('MG')).toBeTruthy()
  })

  // The description is the brand's TL;DR, so its absence is offered as an
  // action rather than rendered as a gap.
  it('offers to add a description when there is none', async () => {
    const onRename = vi.fn()
    render(
      <BrandIdentity brand={brand({ description: null })} onRename={onRename} onDelete={vi.fn()} />,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Add a description' }))
    expect(onRename).toHaveBeenCalledOnce()
  })

  it('does not offer it when a description exists', () => {
    render(<BrandIdentity brand={brand()} onRename={vi.fn()} onDelete={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'Add a description' })).toBeNull()
  })

  // Counts live where they can be acted on — sections in the rail, threads on
  // the tiles. A stats strip here would restate both a scroll earlier.
  it('carries no counts', () => {
    render(<BrandIdentity brand={brand({ sections: [] })} onRename={vi.fn()} onDelete={vi.fn()} />)
    expect(screen.queryByText(/section/i)).toBeNull()
    expect(screen.queryByText(/thread/i)).toBeNull()
  })

  it('names the ⋯ menu after the brand', () => {
    render(<BrandIdentity brand={brand()} onRename={vi.fn()} onDelete={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Actions for Mission Group' })).toBeTruthy()
  })
})
