import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { BrandWithSections } from '@brandfactory/shared'
import { SUGGESTED_SECTIONS } from '@brandfactory/shared'
import { BrandContextRail } from './BrandContextRail'

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

  it('counts written sections against the suggested total', () => {
    render(
      <BrandContextRail
        brand={brand([section('s-1', 'Voice & tone'), section('s-2', 'Target audience')])}
        onEdit={vi.fn()}
      />,
    )
    expect(screen.getByText(`2 of ${SUGGESTED_SECTIONS.length} suggested sections`)).toBeTruthy()
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
