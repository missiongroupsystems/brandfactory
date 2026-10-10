import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

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
    expect(screen.getByRole('region', { name: 'Beyond social' })).toHaveTextContent(
      /two days after “Ravioli, filled by hand”/,
    )
  })
})
