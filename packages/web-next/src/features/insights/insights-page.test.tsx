import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { INSIGHTS_BY_BRAND } from '@/data/insights'
import { resetIdeas } from '@/features/ideate/ideas-store'
import { BrandProvider } from '@/features/schedule/posts-store'

import { InsightsPage } from './insights-page'

const push = vi.fn()
vi.mock('next/navigation', () => ({
  usePathname: () => '/insights',
  useRouter: () => ({ push }),
}))

beforeEach(() => {
  resetIdeas()
  push.mockClear()
})

describe('the static demo', () => {
  it("shows casa-vostra's demo figures", () => {
    render(
      <BrandProvider>
        <InsightsPage />
      </BrandProvider>,
    )
    const demo = INSIGHTS_BY_BRAND['casa-vostra']
    expect(screen.getByText(demo.period)).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'The month in numbers' })).toHaveTextContent(
      demo.kpis[0]!.value,
    )
    expect(screen.queryByText(/^Nothing yet\./)).toBeNull()
  })
})

describe('planning an idea from a finding', () => {
  it('opens the idea on its own page', () => {
    render(
      <BrandProvider>
        <InsightsPage />
      </BrandProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: /Hand-made reels hold viewers/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Turn into idea' }))
    fireEvent.click(screen.getByRole('button', { name: 'Plan it' }))
    expect(push).toHaveBeenCalledTimes(1)
    expect(push.mock.calls[0]![0]).toMatch(/^\/ideate\/[\w-]+$/)
  })
})

describe('the views', () => {
  it('keep the brand’s story and leave each post’s numbers to Posted', () => {
    render(
      <BrandProvider>
        <InsightsPage />
      </BrandProvider>,
    )
    const views = within(screen.getByRole('radiogroup', { name: 'View' }))
      .getAllByRole('radio')
      .map((r) => r.textContent)
    expect(views).toEqual(['Overview', 'Sentiment', 'Creators'])
  })
})

describe('the marketing hub', () => {
  it('names what to work on, from the complaints people raise most', () => {
    render(
      <BrandProvider>
        <InsightsPage />
      </BrandProvider>,
    )
    fireEvent.click(screen.getByRole('radio', { name: 'Sentiment' }))
    // Nat's ask: "so we know what areas we need to work on".
    expect(screen.getByRole('region', { name: 'What to work on' })).toHaveTextContent(
      'Wait for a table',
    )
  })

  it('leads the off-social chart with the post bookings rose after', () => {
    render(
      <BrandProvider>
        <InsightsPage />
      </BrandProvider>,
    )
    // The marker in green is the post bookings rose most after; its label says so, not only its colour.
    expect(
      within(screen.getByRole('region', { name: 'Beyond social' })).getByRole('img', {
        name: /Ravioli, filled by hand\.?, bookings rose most after it$/,
      }),
    ).toBeInTheDocument()
  })

  it('shows the best time by hour from the start, and the fold still closes', () => {
    render(
      <BrandProvider>
        <InsightsPage />
      </BrandProvider>,
    )
    const fold = screen.getByRole('button', { name: /By time of day/ })
    expect(fold).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(fold)
    expect(fold).toHaveAttribute('aria-expanded', 'false')
  })
})
