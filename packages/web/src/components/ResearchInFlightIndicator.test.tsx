import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { BrandResearchState, ResearchJobSummary } from '@brandfactory/shared'
import { ResearchInFlightIndicator } from './ResearchInFlightIndicator'

const brandId = vi.fn<() => string | null>()
const research = vi.fn<() => { data: BrandResearchState | undefined }>()

vi.mock('@/lib/active-brand', () => ({
  useActiveBrandId: () => brandId(),
}))

vi.mock('@/api/queries/research', () => ({
  useBrandResearch: () => research(),
}))

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
    title?: string
    className?: string
  }) => (
    <a
      href={Object.entries(params ?? {}).reduce((p, [k, v]) => p.replace(`$${k}`, v), to)}
      {...props}
    >
      {children}
    </a>
  ),
}))

function state(status: ResearchJobSummary['status']): BrandResearchState {
  return {
    enabled: true,
    job: {
      id: 'j-1' as ResearchJobSummary['id'],
      status,
      startedAt: '2026-07-30T12:00:00.000Z',
      completedAt: null,
      error: null,
      drafts: [],
      sourceCount: 0,
    },
  }
}

describe('ResearchInFlightIndicator', () => {
  it('renders nothing without an active brand', () => {
    brandId.mockReturnValue(null)
    research.mockReturnValue({ data: undefined })
    const { container } = render(<ResearchInFlightIndicator />)
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing when the active brand has no in-flight job', () => {
    brandId.mockReturnValue('b-1')
    research.mockReturnValue({ data: { enabled: true, job: null } })
    const { container } = render(<ResearchInFlightIndicator />)
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing for terminal states', () => {
    brandId.mockReturnValue('b-1')
    research.mockReturnValue({ data: state('COMPLETED') })
    const { container } = render(<ResearchInFlightIndicator />)
    expect(container.firstChild).toBeNull()
  })

  it('links to the brand hub while a run is in progress', () => {
    brandId.mockReturnValue('b-1')
    research.mockReturnValue({ data: state('IN_PROGRESS') })
    render(<ResearchInFlightIndicator />)

    const link = screen.getByRole('link', { name: /Researching/ })
    expect(link.getAttribute('href')).toBe('/brands/b-1')
    expect(link.getAttribute('title')).toMatch(/3–15 minutes/)
  })
})
