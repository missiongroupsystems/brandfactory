import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { BrandWithSections } from '@brandfactory/shared'
import { BrandIdentity, displayHost } from './BrandIdentity'
import type { BrandAsset } from '@/demo/assetTypes'

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

// ---------------------------------------------------------------------------
// The front-end mockup's additions — all absent on the real route
// ---------------------------------------------------------------------------

function color(id: string, status: BrandAsset['status']): BrandAsset {
  return {
    id,
    brandId: 'b-1',
    kind: 'color',
    source: 'inline',
    role: null,
    status,
    label: `Colour ${id}`,
    value: '#b5573c',
    position: 100,
    deletedAt: null,
  }
}

describe('BrandIdentity — website and palette', () => {
  // The invariant: the real route passes neither, and neither renders anything
  // when absent. A prop that cannot be absent has changed the shipped hub.
  it('renders nothing extra when given no website and no colours', () => {
    render(<BrandIdentity brand={brand()} onRename={vi.fn()} onDelete={vi.fn()} />)
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.queryByText(/colour/)).toBeNull()
  })

  it('renders the website as the host, linking to the full URL', () => {
    render(
      <BrandIdentity
        brand={brand()}
        onRename={vi.fn()}
        onDelete={vi.fn()}
        websiteUrl="https://www.casavostra.com/"
      />,
    )

    const link = screen.getByRole('link', { name: /casavostra\.com/ })
    expect(link.getAttribute('href')).toBe('https://www.casavostra.com/')
    // Opening someone else's site must not navigate away from an unsaved page.
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toContain('noopener')
  })

  it('renders the palette and its count under the mark for structure B', () => {
    render(
      <BrandIdentity
        brand={brand()}
        onRename={vi.fn()}
        onDelete={vi.fn()}
        colors={[color('c-1', 'active'), color('c-2', 'proposed')]}
      />,
    )
    expect(screen.getByText('2 colours · 1 proposed')).toBeTruthy()
  })
})

describe('displayHost', () => {
  it('drops the scheme, the www and a trailing slash', () => {
    expect(displayHost('https://www.casavostra.com/')).toBe('casavostra.com')
    expect(displayHost('https://casavostra.com/about/brand')).toBe('casavostra.com/about/brand')
  })

  // A link someone typed by hand is still worth rendering; swallowing it would
  // be a worse failure than an ugly one.
  it('falls back to the raw string when the URL does not parse', () => {
    expect(displayHost('casavostra')).toBe('casavostra')
  })
})
