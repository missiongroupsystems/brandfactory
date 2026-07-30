import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { BrandAsset, BrandWithSections, ResearchJobSummary } from '@brandfactory/shared'
import { SUGGESTED_SECTIONS } from '@brandfactory/shared'
import { BrandContextRail } from './BrandContextRail'

// `BrandAsset` moved to `@brandfactory/shared` in 2A, where — like every other
// domain entity — it carries branded ids and the two timestamp columns the DB
// writes. Fixtures state them; nothing in this file reads them.
const ASSET_STAMPS = {
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
} as const

// The rail's conversation entry point is a real `<Link>`, which needs a router
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
    websiteUrl: null,
    createdAt: '2026-07-24T00:00:00.000Z',
    updatedAt: '2026-07-24T00:00:00.000Z',
    sections,
  }
}

describe('BrandContextRail', () => {
  // Written and unwritten are one list — that is the whole design. A brand at
  // zero still shows five rows, so the rail describes the shape of a brand
  // rather than showing an empty box.
  it('lists every suggested section on a brand with none written', () => {
    render(<BrandContextRail brand={brand([])} onEdit={vi.fn()} />)

    for (const sg of SUGGESTED_SECTIONS) {
      expect(screen.getByRole('button', { name: `Add ${sg.label}` })).toBeTruthy()
    }
  })

  it('shows a written section as a row and stops offering it as unwritten', () => {
    render(<BrandContextRail brand={brand([section('s-1', 'Voice & tone')])} onEdit={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Voice & tone' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Add Voice & tone' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Add Target audience' })).toBeTruthy()
  })

  // Label matching is the same trimmed/case-insensitive comparison the editor's
  // quick-add chips use, so the rail and the dialog never disagree about what
  // is already covered.
  it('matches a written label case- and whitespace-insensitively', () => {
    render(<BrandContextRail brand={brand([section('s-1', '  voice & TONE ')])} onEdit={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'Add Voice & tone' })).toBeNull()
  })

  it('counts what the list below it actually shows', () => {
    render(
      <BrandContextRail
        brand={brand([section('s-1', 'Voice & tone'), section('s-2', 'Target audience')])}
        onEdit={vi.fn()}
      />,
    )
    const remaining = SUGGESTED_SECTIONS.length - 2
    expect(screen.getByText(`2 written · ${remaining} suggested`)).toBeTruthy()
  })

  /**
   * The regression the Stage 1–2 review found. The old copy was
   * `${sections.length} of ${SUGGESTED_SECTIONS.length} suggested sections` — a
   * denominator the numerator can exceed, because a brand may write as many
   * sections of its own as it likes. Six custom sections announced
   * "6 of 5 suggested sections", and every one of them was a section the
   * suggestions had never proposed.
   */
  it('does not claim more suggested sections than exist', () => {
    const custom = ['Tone in email', 'Photography', 'Legal', 'Naming', 'Partners', 'Events'].map(
      (label, i) => section(`s-${i}`, label),
    )
    render(<BrandContextRail brand={brand(custom)} onEdit={vi.fn()} />)
    expect(screen.queryByText(/of \d+ suggested sections/)).toBeNull()
    // All five suggestions are still unwritten — none of these labels match one.
    expect(screen.getByText(`6 written · ${SUGGESTED_SECTIONS.length} suggested`)).toBeTruthy()
  })

  it('drops the suggestion half once every suggestion is written', () => {
    const all = SUGGESTED_SECTIONS.map((s, i) => section(`s-${i}`, s.label))
    render(<BrandContextRail brand={brand(all)} onEdit={vi.fn()} />)
    expect(screen.getByText(`${SUGGESTED_SECTIONS.length} written`)).toBeTruthy()
  })

  // No percentage, no bar, no scolding — zero sections is a legitimate brand
  // state (the D2 decision recorded on GuidelineMeter).
  it('does not report a count of zero', () => {
    render(<BrandContextRail brand={brand([])} onEdit={vi.fn()} />)
    expect(screen.queryByText(/^0 of/)).toBeNull()
    expect(screen.getByText('Rides along into every thread')).toBeTruthy()
  })

  it('discloses a section body and hides it again', async () => {
    render(
      <BrandContextRail
        brand={brand([section('s-1', 'Voice & tone'), section('s-2', 'Target audience')])}
        onEdit={vi.fn()}
      />,
    )

    const row = screen.getByRole('button', { name: 'Voice & tone' })
    expect(row.getAttribute('aria-expanded')).toBe('false')

    await userEvent.click(row)
    expect(row.getAttribute('aria-expanded')).toBe('true')
    expect(await screen.findByText('Voice & tone body')).toBeTruthy()

    // Opening another swaps the panel.
    await userEvent.click(screen.getByRole('button', { name: 'Target audience' }))
    expect(await screen.findByText('Target audience body')).toBeTruthy()
    expect(screen.queryByText('Voice & tone body')).toBeNull()

    // And clicking the open one closes it.
    await userEvent.click(screen.getByRole('button', { name: 'Target audience' }))
    expect(screen.queryByText('Target audience body')).toBeNull()
  })

  // The body genuinely hides, so this is a disclosure. The 1.4.0 chip row used
  // aria-pressed for the opposite reason: nothing there was ever hidden.
  it('points the open row at the panel it controls', async () => {
    render(<BrandContextRail brand={brand([section('s-1', 'Voice & tone')])} onEdit={vi.fn()} />)

    const row = screen.getByRole('button', { name: 'Voice & tone' })
    expect(row.getAttribute('aria-controls')).toBeNull()

    await userEvent.click(row)
    const controlled = row.getAttribute('aria-controls')
    expect(controlled).toBeTruthy()
    expect(document.getElementById(controlled as string)).toBeTruthy()
  })

  // A save from EditGuidelinesDialog repoints the cached brand while section
  // ids stay put, so the read panel's key does not change. Without an explicit
  // content sync the seeded editor keeps rendering the pre-edit body.
  it('re-renders the open panel when the section body is edited', async () => {
    const { rerender } = render(
      <BrandContextRail
        brand={brand([section('s-1', 'Voice & tone', 'Dry and clinical')])}
        onEdit={vi.fn()}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Voice & tone' }))
    expect(await screen.findByText('Dry and clinical')).toBeTruthy()

    rerender(
      <BrandContextRail
        brand={brand([section('s-1', 'Voice & tone', 'Warm and playful')])}
        onEdit={vi.fn()}
      />,
    )

    expect(await screen.findByText('Warm and playful')).toBeTruthy()
    expect(screen.queryByText('Dry and clinical')).toBeNull()
  })

  it('routes both Edit and an unwritten row to the editor', async () => {
    const onEdit = vi.fn()
    render(<BrandContextRail brand={brand([])} onEdit={onEdit} />)

    await userEvent.click(screen.getByRole('button', { name: 'Edit' }))
    expect(onEdit).toHaveBeenCalledTimes(1)

    await userEvent.click(screen.getByRole('button', { name: 'Add Visual guidelines' }))
    expect(onEdit).toHaveBeenCalledTimes(2)
  })

  // Typing context and talking it out build the same thing, so the
  // conversation hangs off the rail rather than the app grid.
  it('offers the conversation', () => {
    render(<BrandContextRail brand={brand([])} onEdit={vi.fn()} />)
    const link = screen.getByRole('link', { name: 'Talk it through' })
    expect(link.getAttribute('href')).toBe('/brands/b-1/context')
  })

  it('labels the rail as a region', () => {
    render(<BrandContextRail brand={brand([])} onEdit={vi.fn()} />)
    expect(screen.getByRole('complementary', { name: 'Brand context' })).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// The front-end mockup's additions — structure A and the research footer row
// ---------------------------------------------------------------------------

function color(id: string, status: BrandAsset['status'] = 'active'): BrandAsset {
  return {
    id: id as BrandAsset['id'],
    brandId: 'b-1' as BrandAsset['brandId'],
    kind: 'color',
    source: 'inline',
    role: null,
    status,
    label: `Colour ${id}`,
    value: '#b5573c',
    position: 100,
    deletedAt: null,
    ...ASSET_STAMPS,
  }
}

function researchJob(
  status: ResearchJobSummary['status'],
  overrides: Partial<ResearchJobSummary> = {},
): ResearchJobSummary {
  return {
    // Branded in 3B, with the types. Fixture constructors state it; nothing
    // reads it.
    id: 'j-1' as ResearchJobSummary['id'],
    status,
    startedAt: '2026-07-29T09:00:00.000Z',
    completedAt: null,
    error: null,
    drafts: [],
    sourceCount: 0,
    ...overrides,
  }
}

describe('BrandContextRail — the palette block (structure A)', () => {
  // The invariant. Absent → the rail is 1.7.0 exactly, which is what the real
  // route renders and what structures B and C render here.
  it('renders no palette block when given no colours', () => {
    render(<BrandContextRail brand={brand([])} onEdit={vi.fn()} />)
    expect(screen.queryByRole('heading', { name: 'Palette' })).toBeNull()
  })

  it('renders one when given some', () => {
    render(
      <BrandContextRail brand={brand([])} onEdit={vi.fn()} colors={[color('c-1', 'proposed')]} />,
    )
    expect(screen.getByRole('heading', { name: 'Palette' })).toBeTruthy()
    expect(screen.getByText('1 colour · 1 proposed')).toBeTruthy()
  })

  // The section list has a stated meaning — written sections and unwritten
  // suggestions, one list, which *is* the meter. A swatch row inside it would
  // be neither, and would break the one rule the rail promises.
  it('keeps the palette out of the section list', () => {
    render(<BrandContextRail brand={brand([])} onEdit={vi.fn()} colors={[color('c-1')]} />)
    const rows = screen.getAllByRole('listitem')
    expect(rows.some((r) => r.textContent?.includes('Palette'))).toBe(false)
  })
})

describe('BrandContextRail — the research row', () => {
  // A rail that offers to research a brand against a backend with no research
  // route is a dead affordance, which is the class of thing 1.7.0 removed. The
  // row exists only when its callback does.
  it('renders no research row without a handler', () => {
    render(<BrandContextRail brand={brand([])} onEdit={vi.fn()} research={researchJob('FAILED')} />)
    expect(screen.queryByText(/Research/)).toBeNull()
  })

  it('offers the entry point when there is no job', () => {
    const onStartResearch = vi.fn()
    render(
      <BrandContextRail brand={brand([])} onEdit={vi.fn()} onStartResearch={onStartResearch} />,
    )
    expect(screen.getByRole('button', { name: 'Research this brand' })).toBeTruthy()
  })

  it('reports an in-flight job and offers nothing to click', () => {
    render(
      <BrandContextRail
        brand={brand([])}
        onEdit={vi.fn()}
        research={researchJob('IN_PROGRESS')}
        onStartResearch={vi.fn()}
      />,
    )
    expect(screen.getByText(/^Researching…/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Research/ })).toBeNull()
  })

  it('offers the review sheet when drafts are ready', async () => {
    const onReviewDrafts = vi.fn()
    render(
      <BrandContextRail
        brand={brand([])}
        onEdit={vi.fn()}
        research={researchJob('COMPLETED', {
          drafts: [{ label: 'Voice & tone', html: '<p>x</p>', text: 'x', sources: [] }],
        })}
        onStartResearch={vi.fn()}
        onReviewDrafts={onReviewDrafts}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: '1 draft ready — Review' }))
    expect(onReviewDrafts).toHaveBeenCalledOnce()
  })

  // Failure in a column that is on screen the whole time you are choosing what
  // to work on. It has to be legible without being a red banner.
  it('offers a retry on failure and shows the reason without alarm', async () => {
    const onStartResearch = vi.fn()
    render(
      <BrandContextRail
        brand={brand([])}
        onEdit={vi.fn()}
        research={researchJob('FAILED', { error: 'The provider timed out.' })}
        onStartResearch={onStartResearch}
      />,
    )

    expect(screen.getByText('The provider timed out.')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Research failed — Try again' }))
    expect(onStartResearch).toHaveBeenCalledOnce()
  })

  // The state the locked document names as terminal and never draws. A website
  // that is a one-page holding site is the ordinary way to reach it.
  it('draws the no-findings terminal state', () => {
    render(
      <BrandContextRail
        brand={brand([])}
        onEdit={vi.fn()}
        research={researchJob('NO_FINDINGS')}
        onStartResearch={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: 'Nothing found — Try again' })).toBeTruthy()
    expect(screen.getByText('The site gave us too little to work with.')).toBeTruthy()
  })

  // Research joins `Talk it through` in the footer because they are the same
  // kind of thing — the ways of finding out more. It does not replace it.
  it('sits beside the conversation rather than instead of it', () => {
    render(<BrandContextRail brand={brand([])} onEdit={vi.fn()} onStartResearch={vi.fn()} />)
    expect(screen.getByRole('link', { name: 'Talk it through' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Research this brand' })).toBeTruthy()
  })

  // Nothing in the cache changes until the POST resolves, so in that window the
  // row still invites a click — and a second click was a second $0.40 run.
  // Migration 0006's unique index is what makes it impossible; this is what keeps
  // an ordinary user from meeting it.
  it('refuses a second click while a start is in flight', async () => {
    const onStartResearch = vi.fn()
    render(
      <BrandContextRail
        brand={brand([])}
        onEdit={vi.fn()}
        onStartResearch={onStartResearch}
        researchStarting
      />,
    )

    const row = screen.getByRole('button', { name: 'Research this brand' })
    expect(row.hasAttribute('disabled')).toBe(true)
    await userEvent.click(row)
    expect(onStartResearch).not.toHaveBeenCalled()
  })

  // **Every row that can start a run, not just the idle one.** `Try again` after a
  // failure is reached with the *old* job still in the cache, so it invites a
  // double click exactly as readily.
  it.each([
    ['FAILED' as const, 'Research failed — Try again'],
    ['NO_FINDINGS' as const, 'Nothing found — Try again'],
  ])('disables the %s retry while a start is in flight', (status, name) => {
    render(
      <BrandContextRail
        brand={brand([])}
        onEdit={vi.fn()}
        research={researchJob(status)}
        onStartResearch={vi.fn()}
        researchStarting
      />,
    )

    expect(screen.getByRole('button', { name }).hasAttribute('disabled')).toBe(true)
  })
})
