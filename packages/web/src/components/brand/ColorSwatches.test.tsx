import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ColorSwatches, paletteSummary } from './ColorSwatches'
import type { BrandAsset } from '@brandfactory/shared'

// `BrandAsset` moved to `@brandfactory/shared` in 2A, where — like every other
// domain entity — it carries branded ids and the two timestamp columns the DB
// writes. Fixtures state them; nothing in this file reads them.
const ASSET_STAMPS = {
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
} as const

function color(
  id: string,
  label: string,
  value: string,
  status: BrandAsset['status'] = 'active',
  position = 100,
): BrandAsset {
  return {
    id: id as BrandAsset['id'],
    brandId: 'b-1' as BrandAsset['brandId'],
    kind: 'color',
    source: 'inline',
    role: null,
    status,
    label,
    value,
    position,
    deletedAt: null,
    ...ASSET_STAMPS,
  }
}

describe('ColorSwatches', () => {
  it('renders nothing for an empty palette', () => {
    const { container } = render(<ColorSwatches colors={[]} />)
    expect(container.firstChild).toBeNull()
  })

  // Colour is the *content* here, so the settled/floated distinction cannot be
  // carried by colour — a swatch tinted to say "unsettled" is unreadable on a
  // swatch whose job is to show its own value. It is carried by geometry, and
  // the value is in the accessible description either way.
  it('names every swatch with its label, its value and its status', () => {
    render(<ColorSwatches colors={[color('c-1', 'Terracotta', '#b5573c', 'proposed')]} />)
    expect(screen.getByText('Terracotta — #b5573c, proposed')).toBeTruthy()
  })

  it('does not call an active colour proposed', () => {
    render(<ColorSwatches colors={[color('c-1', 'Olive', '#6b7248')]} />)
    expect(screen.getByText('Olive — #6b7248')).toBeTruthy()
    expect(screen.queryByText(/proposed/)).toBeNull()
  })

  it('orders by position, not by array order', () => {
    render(
      <ColorSwatches
        colors={[
          color('c-2', 'Second', '#222', 'active', 200),
          color('c-1', 'First', '#111', 'active', 100),
        ]}
      />,
    )
    const items = screen.getAllByRole('listitem')
    expect(items[0]?.textContent).toContain('First')
    expect(items[1]?.textContent).toContain('Second')
  })

  // Non-colour assets share the table, so a caller handing the whole asset list
  // to a swatch row must not get an empty box per photo.
  it('ignores anything that is not an inline colour', () => {
    const photo: BrandAsset = {
      id: 'a-1' as BrandAsset['id'],
      brandId: 'b-1' as BrandAsset['brandId'],
      kind: 'image',
      source: 'blob',
      role: null,
      status: 'active',
      label: 'Photo',
      blobKey: 'k',
      position: 100,
      deletedAt: null,
      ...ASSET_STAMPS,
    }
    render(<ColorSwatches colors={[color('c-1', 'Olive', '#6b7248'), photo]} />)
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
  })
})

describe('paletteSummary', () => {
  // The dashed outline is legible at a glance but not countable, and the count
  // is what says whether a palette is settled.
  it('counts the proposed ones separately', () => {
    expect(paletteSummary([color('c-1', 'A', '#111'), color('c-2', 'B', '#222', 'proposed')])).toBe(
      '2 colours · 1 proposed',
    )
  })

  it('says nothing about proposals when there are none', () => {
    expect(paletteSummary([color('c-1', 'A', '#111')])).toBe('1 colour')
  })
})
