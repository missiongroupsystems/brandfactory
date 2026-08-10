import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { BrandGuidelineSection, BrandWithSections } from '@brandfactory/shared'
import { BrandContextStrip } from './BrandContextStrip'
import type { KeyDate } from '@/lib/key-dates'

// The same `Link` stub the rail's, the hub's and the card's tests use: this
// strip renders from props alone, which is the point of it, so it must not need
// a router context to be tested.
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

const STAMPS = {
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
} as const

const doc = (text: string) => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
})
const EMPTY_DOC = { type: 'doc', content: [{ type: 'paragraph' }] }

function section(label: string, body: unknown = doc('Something true.')): BrandGuidelineSection {
  return {
    id: `s-${label}` as BrandGuidelineSection['id'],
    brandId: 'b-1' as BrandGuidelineSection['brandId'],
    label,
    body: body as BrandGuidelineSection['body'],
    priority: 100,
    createdBy: 'user',
    ...STAMPS,
  }
}

function brand(sections: BrandGuidelineSection[] = []): BrandWithSections {
  return {
    id: 'b-1' as BrandWithSections['id'],
    workspaceId: 'w-1' as BrandWithSections['workspaceId'],
    name: 'Casa Vostra',
    description: null,
    websiteUrl: null,
    sections,
    ...STAMPS,
  }
}

const nationalDay: KeyDate = {
  id: 'sg-holidays/2026-national-day',
  set: 'sg-holidays',
  name: 'National Day',
  start: '2026-08-09',
  source: 'test',
}

const hungryGhost: KeyDate = {
  id: 'sg-holidays/2026-hungry-ghost',
  set: 'sg-holidays',
  name: 'Hungry Ghost Festival',
  start: '2026-08-08',
  end: '2026-09-06',
  source: 'test',
}

describe('BrandContextStrip — row 1', () => {
  it('names the brand it is writing for', () => {
    render(<BrandContextStrip brand={brand()} />)
    expect(screen.getByText('Casa Vostra')).toBeTruthy()
  })

  it('reads as loaded when every section holds words', () => {
    render(<BrandContextStrip brand={brand([section('TL;DR'), section('Overview')])} />)
    expect(screen.getByText('Brand context loaded — 2 sections')).toBeTruthy()
    // Nothing to fix, so nothing offering to fix it.
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('reads as thin when some sections are labelled and empty', () => {
    // The state the indicator exists for: the rail's suggestion chips create
    // labelled rows with empty bodies, and a dot that lit up for those would
    // light on precisely the brand that needs the warning.
    render(
      <BrandContextStrip
        brand={brand([section('TL;DR'), section('Overview', EMPTY_DOC), section('Voice', '')])}
      />,
    )
    expect(screen.getByText('Brand context is thin — 1 of 3 sections written')).toBeTruthy()
    const link = screen.getByRole('link', { name: 'Add brand context' })
    expect(link.getAttribute('href')).toBe('/brands/b-1/context')
  })

  it('says a brand with no sections has none, rather than 0 of 0', () => {
    render(<BrandContextStrip brand={brand()} />)
    expect(screen.getByText('No brand context yet')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Add brand context' })).toBeTruthy()
  })

  it('says the same for a brand whose every section is empty', () => {
    render(<BrandContextStrip brand={brand([section('TL;DR', EMPTY_DOC)])} />)
    expect(screen.getByText('No brand context yet')).toBeTruthy()
  })

  it('counts one section in the singular', () => {
    render(<BrandContextStrip brand={brand([section('TL;DR')])} />)
    expect(screen.getByText('Brand context loaded — 1 section')).toBeTruthy()
  })
})

describe('BrandContextStrip — row 2', () => {
  it('renders no second row when the day carries nothing', () => {
    const { container } = render(<BrandContextStrip brand={brand()} />)
    expect(container.querySelector('ul')).toBeNull()
  })

  it('renders one chip per key date, with its dates', () => {
    render(<BrandContextStrip brand={brand()} keyDates={[nationalDay, hungryGhost]} />)
    expect(screen.getByText('National Day')).toBeTruthy()
    expect(screen.getByText('Hungry Ghost Festival')).toBeTruthy()
    expect(screen.getByText('9 Aug')).toBeTruthy()
    // `Sept`, not `Sep` — the en-GB short month, straight from `Intl`.
    expect(screen.getByText('8 Aug – 6 Sept')).toBeTruthy()
  })

  it('carries the set name in text, not in colour alone', () => {
    render(<BrandContextStrip brand={brand()} keyDates={[nationalDay]} />)
    // Visually hidden, but in the accessibility tree — the hue is the fast
    // path and never the only path.
    expect(screen.getByText('Singapore holidays:')).toBeTruthy()
  })
})
