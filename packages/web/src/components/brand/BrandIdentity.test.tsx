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
    websiteUrl: null,
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
// `websiteUrl` is fed by the real route from Stage 1A. The palette is *not*
// here at all from 2C — structure B was one of three arrangements 1.8.0 built
// so that two could be deleted, and this band is one of the deletions.
// ---------------------------------------------------------------------------

describe('BrandIdentity — website and palette', () => {
  // The surviving half of 1.8.0's invariant: neither renders anything when
  // absent. A brand with no website must be byte-identical to 1.7.0 even though
  // the route now passes the prop for real.
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

  // Found by the live pass, not by this suite: both the `Add a description`
  // affordance and the website link are inline-level, so before the wrapper
  // they rendered as one run of text — `Add a descriptioncasavostra.com`. A
  // brand with a description never showed it, because a `<p>` is a block.
  it('keeps the website link off the "Add a description" line', () => {
    render(
      <BrandIdentity
        brand={brand({ description: null })}
        onRename={vi.fn()}
        onDelete={vi.fn()}
        websiteUrl="https://casavostra.com"
      />,
    )

    const button = screen.getByRole('button', { name: 'Add a description' })
    const link = screen.getByRole('link', { name: /casavostra\.com/ })
    // Not siblings in the same inline run: the link sits inside its own block.
    expect(link.parentElement).not.toBe(button.parentElement)
    expect(link.parentElement?.tagName).toBe('DIV')
  })

  // Structure B is deleted in 2C: the screenshots settled the palette into the
  // rail, and the band goes back to one fact — *whose page is this*. The band
  // must not grow swatches again by accident.
  it('renders no palette under the mark', () => {
    render(<BrandIdentity brand={brand()} onRename={vi.fn()} onDelete={vi.fn()} />)
    expect(screen.queryByText(/colour/)).toBeNull()
    expect(screen.queryByRole('list', { name: /palette/i })).toBeNull()
  })
})

// `displayHost`'s own tests moved to `lib/website-url.test.ts` with the
// function, which `BrandCard` now shares.
