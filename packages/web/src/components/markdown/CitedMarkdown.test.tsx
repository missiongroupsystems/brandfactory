import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CitedMarkdown } from './CitedMarkdown'

const SOURCES = [
  { title: 'Temper — About', url: 'https://temper.example/about' },
  { title: 'Star Wine List — Temper', url: 'https://starwinelist.example/temper' },
]

describe('CitedMarkdown citations', () => {
  it('turns a marker into a chip linking its source, opened away from the page', () => {
    render(<CitedMarkdown markdown={'Wine pours deep.[2]'} sources={SOURCES} />)

    const chip = screen.getByRole('link', { name: '2' })
    expect(chip.getAttribute('href')).toBe('https://starwinelist.example/temper')
    // The tooltip is the source's title — the hover answer to "says who?".
    expect(chip.getAttribute('title')).toBe('Star Wine List — Temper')
    expect(chip.getAttribute('target')).toBe('_blank')
    expect(chip.getAttribute('rel')).toContain('noopener')
    // The raw bracket is gone from the prose.
    expect(screen.getByText(/Wine pours deep\./)).toBeTruthy()
    expect(screen.queryByText(/\[2\]/)).toBeNull()
  })

  it('splits a run of markers into individual chips', () => {
    render(<CitedMarkdown markdown={'sound lingers.[2][1]'} sources={SOURCES} />)

    expect(screen.getByRole('link', { name: '2' }).getAttribute('href')).toBe(
      'https://starwinelist.example/temper',
    )
    expect(screen.getByRole('link', { name: '1' }).getAttribute('href')).toBe(
      'https://temper.example/about',
    )
  })

  // A marker past the list (or a thread whose run predates migration 0007 and
  // has no sources at all) keeps the chip and loses the link — a styled marker
  // that goes nowhere is honest, a link to '#' is not.
  it('renders a marker with no source as an unlinked chip', () => {
    render(<CitedMarkdown markdown={'craft and restraint.[7]'} sources={SOURCES} />)

    expect(screen.queryByRole('link', { name: '7' })).toBeNull()
    const chip = screen.getByText('7')
    expect(chip.tagName).toBe('SPAN')
    expect(chip.getAttribute('data-citation')).toBe('7')
  })

  it('leaves ordinary links and non-numeric brackets alone', () => {
    render(
      <CitedMarkdown
        markdown={'See [the site](https://temper.example) — [TBD] items.'}
        sources={SOURCES}
      />,
    )

    const link = screen.getByRole('link', { name: 'the site' })
    expect(link.getAttribute('href')).toBe('https://temper.example')
    expect(link.getAttribute('data-citation')).toBeNull()
    expect(screen.getByText(/\[TBD\] items\./)).toBeTruthy()
  })

  it('does not reach inside inline code', () => {
    render(<CitedMarkdown markdown={'run `pick[1]` locally'} sources={SOURCES} />)

    expect(screen.queryByRole('link', { name: '1' })).toBeNull()
    expect(screen.getByText('pick[1]')).toBeTruthy()
  })
})
