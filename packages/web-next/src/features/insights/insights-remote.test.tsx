import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { INSIGHTS_BY_BRAND } from '@/data/insights'
import { BrandProvider } from '@/features/schedule/posts-store'
import type * as Remote from '@/lib/remote'

import { InsightsPage } from './insights-page'

// On the core. Production's casa-vostra has the demo brand's id, so a lookup by id alone
// finds the demo's invented figures.
vi.mock('@/lib/remote', async (original) => ({
  ...(await original<typeof Remote>()),
  remote: true,
  onState: () => () => undefined,
  onAccount: () => () => undefined,
}))
vi.mock('next/navigation', () => ({
  usePathname: () => '/insights',
  useRouter: () => ({ push: vi.fn() }),
}))

describe('Insights on the core', () => {
  it('opens on the feed, the one view with something in it, and shows none of the demo figures', () => {
    render(
      <BrandProvider>
        <InsightsPage />
      </BrandProvider>,
    )
    const demo = INSIGHTS_BY_BRAND['casa-vostra']
    // The feed waits for the brand's state; the demo's posts never stand in.
    expect(screen.getByRole('region', { name: 'Feed' })).toBeInTheDocument()
    expect(screen.getByRole('status', { name: 'Loading posts' })).toBeInTheDocument()
    expect(screen.queryByText(demo.period)).toBeNull()
    expect(screen.queryByText(demo.kpis[0]!.value)).toBeNull()
    // The other views say why they are empty.
    fireEvent.click(screen.getByRole('radio', { name: 'Overview' }))
    expect(screen.getByText(/^Insights arrive once/)).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'The month in numbers' })).toBeNull()
  })
})
