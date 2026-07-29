import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { BrandMark, brandHue, brandInitials } from './BrandMark'

describe('brandInitials', () => {
  it('takes the first letter of the first two words', () => {
    expect(brandInitials('Mission Group')).toBe('MG')
    expect(brandInitials('Casa Vostra Trattoria')).toBe('CV')
  })

  // "BR" for "BrandFactory" reads as an abbreviation of nothing.
  it('takes a single letter for a single-word name', () => {
    expect(brandInitials('BrandFactory')).toBe('B')
  })

  it('tolerates padding and repeated whitespace', () => {
    expect(brandInitials('  mission   group  ')).toBe('MG')
  })

  // Indexing a string by position splits a surrogate pair in half and renders
  // a replacement character.
  it('splits by code point, not by index', () => {
    expect(brandInitials('🌱 Sprout')).toBe('🌱S')
  })

  it('falls back rather than rendering an empty mark', () => {
    expect(brandInitials('   ')).toBe('?')
  })
})

describe('brandHue', () => {
  it('is stable for the same seed', () => {
    expect(brandHue('b-1')).toBe(brandHue('b-1'))
  })

  it('lands in range', () => {
    for (const seed of ['b-1', 'b-2', 'x', '', 'a-very-long-uuid-like-string-0000']) {
      const h = brandHue(seed)
      expect(h).toBeGreaterThanOrEqual(0)
      expect(h).toBeLessThan(360)
    }
  })

  // A plain charCode sum collides on ids sharing characters, which is exactly
  // the case for sibling brands in one workspace.
  it('separates seeds that differ only by a transposition', () => {
    expect(brandHue('ab')).not.toBe(brandHue('ba'))
  })
})

describe('BrandMark', () => {
  it('renders the monogram and hands the hue to CSS', () => {
    render(<BrandMark name="Mission Group" seed="b-1" />)
    const mark = screen.getByText('MG')
    expect(mark.style.getPropertyValue('--brand-hue')).toBe(String(brandHue('b-1')))
  })

  // Seeded by id, not name: a rename must not recolour a mark the user has
  // learned to recognise.
  it('keeps its hue across a rename', () => {
    const { rerender } = render(<BrandMark name="Mission Group" seed="b-1" />)
    const before = screen.getByText('MG').style.getPropertyValue('--brand-hue')

    rerender(<BrandMark name="Mission Systems Group" seed="b-1" />)
    expect(screen.getByText('MSG'.slice(0, 2)).style.getPropertyValue('--brand-hue')).toBe(before)
  })

  // The name is always rendered as text beside the mark, so announcing the
  // initials first is noise.
  it('is hidden from assistive tech', () => {
    render(<BrandMark name="Mission Group" seed="b-1" />)
    expect(screen.getByText('MG').getAttribute('aria-hidden')).toBe('true')
  })
})

// ---------------------------------------------------------------------------
// A declared mark — absent on every real call site today
// ---------------------------------------------------------------------------

describe('BrandMark — a declared src', () => {
  it('renders the monogram when no src is given', () => {
    const { container } = render(<BrandMark name="Mission Group" seed="b-1" />)
    expect(screen.getByText('MG')).toBeTruthy()
    expect(container.querySelector('img')).toBeNull()
  })

  // The box, its size class and its hue stay put; only the fill changes from
  // derived to declared. That is what `logo-blob` exists to screenshot, and it
  // is cheap to assert here rather than only look at.
  it('keeps its geometry when the fill becomes an image', () => {
    const { container, rerender } = render(<BrandMark name="Mission Group" seed="b-1" size="lg" />)
    const before = container.firstElementChild?.className

    rerender(<BrandMark name="Mission Group" seed="b-1" size="lg" src="/logo.svg" />)
    expect(container.firstElementChild?.className).toBe(before)
    expect(container.querySelector('img')?.getAttribute('src')).toBe('/logo.svg')
    expect(screen.queryByText('MG')).toBeNull()
  })

  // A Drive share URL serves an HTML viewer page and Dropbox needs `?raw=1`, so
  // "clickable but not renderable" is the expected outcome of the link path.
  it('falls back to the monogram when the image fails to load', () => {
    const { container } = render(<BrandMark name="Mission Group" seed="b-1" src="/dead.png" />)

    const img = container.querySelector('img')
    expect(img).toBeTruthy()
    fireEvent.error(img as HTMLImageElement)

    expect(screen.getByText('MG')).toBeTruthy()
    expect(container.querySelector('img')).toBeNull()
  })

  // Keyed on the src: one dead link must not poison the slot for the next
  // brand rendered through the same element.
  it('gives a new src a fresh attempt after a failure', () => {
    const { container, rerender } = render(
      <BrandMark name="Mission Group" seed="b-1" src="/dead.png" />,
    )
    fireEvent.error(container.querySelector('img') as HTMLImageElement)
    expect(screen.getByText('MG')).toBeTruthy()

    rerender(<BrandMark name="Mission Group" seed="b-1" src="/good.svg" />)
    expect(container.querySelector('img')?.getAttribute('src')).toBe('/good.svg')
  })

  // The name is still the accessible text beside it; an alt here would announce
  // the brand twice.
  it('keeps the image out of the accessibility tree', () => {
    const { container } = render(<BrandMark name="Mission Group" seed="b-1" src="/logo.svg" />)
    expect(container.firstElementChild?.getAttribute('aria-hidden')).toBe('true')
    expect(container.querySelector('img')?.getAttribute('alt')).toBe('')
  })
})
