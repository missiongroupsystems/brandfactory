import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
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

const START = '2026-07-30T12:00:00.000Z'
const at = (minutes: number) => Date.parse(START) + minutes * 60_000

function state(
  status: ResearchJobSummary['status'],
  extra: Partial<BrandResearchState> = {},
): BrandResearchState {
  return {
    enabled: true,
    job: {
      id: 'j-1' as ResearchJobSummary['id'],
      status,
      startedAt: START,
      completedAt: null,
      error: null,
      drafts: [],
      sourceCount: 0,
    },
    ...extra,
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(at(4))
})

afterEach(() => {
  vi.useRealTimers()
})

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

  // The point of a chip that survives navigation is knowing where the run got
  // to. A bare spinner says something is running and not whether it is going
  // normally, which is the question you actually leave the hub with.
  it('carries the clock, and it advances', () => {
    brandId.mockReturnValue('b-1')
    research.mockReturnValue({ data: state('IN_PROGRESS') })
    render(<ResearchInFlightIndicator />)

    expect(screen.getByRole('link', { name: /Researching… 4m 00s/ })).toBeTruthy()
    act(() => void vi.advanceTimersByTime(30_000))
    expect(screen.getByRole('link', { name: /Researching… 4m 30s/ })).toBeTruthy()
  })

  // The pace copy itself stays on the hub — a header chip is not the place to
  // explain an automatic close — but the tooltip stops promising the usual
  // window once the run is past it.
  it('stops promising the usual window once the run is overdue', () => {
    brandId.mockReturnValue('b-1')
    vi.setSystemTime(at(20))
    research.mockReturnValue({ data: state('IN_PROGRESS', { maxMinutes: 60 }) })
    render(<ResearchInFlightIndicator />)

    const link = screen.getByRole('link', { name: /Researching… 20m 00s/ })
    expect(link.getAttribute('title')).toMatch(/taking longer than the usual 3–15 minutes/)
  })
})
