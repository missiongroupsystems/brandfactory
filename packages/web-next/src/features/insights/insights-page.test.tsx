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
    // The numbers name their period: the last 30 days as their heading, and its dates.
    const month = within(screen.getByRole('region', { name: 'The month in numbers' }))
    expect(month.getByRole('heading', { name: 'Last 30 days' })).toBeInTheDocument()
    expect(month.getByText('7 Sep – 6 Oct')).toBeInTheDocument()
    expect(month.getByText(demo.kpis[0]!.value)).toBeInTheDocument()
    // The change says, to a screen reader too, what it is measured against.
    expect(month.getByTitle(/on the 30 days before$/)).toHaveTextContent(
      /^\+[\d.]+% on the 30 days before$/,
    )
    expect(screen.queryByText(/^Nothing yet\./)).toBeNull()
  })

  // Posts and Creators count the same 30 days: the period stays in sight in every view.
  it('names the period in every view', () => {
    render(
      <BrandProvider>
        <InsightsPage />
      </BrandProvider>,
    )
    for (const view of ['Posts', 'Creators']) {
      fireEvent.click(screen.getByRole('radio', { name: view }))
      expect(screen.getByText('Last 30 days · 7 Sep – 6 Oct')).toBeInTheDocument()
    }
  })
})

describe('planning an idea from a finding', () => {
  it('opens the idea on its own page, one step from the open finding', () => {
    render(
      <BrandProvider>
        <InsightsPage />
      </BrandProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: /Hand-made reels hold viewers/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Plan it' }))
    expect(push).toHaveBeenCalledTimes(1)
    expect(push.mock.calls[0]![0]).toMatch(/^\/ideate\/[\w-]+$/)
  })
})

describe('this week', () => {
  const open = () =>
    render(
      <BrandProvider>
        <InsightsPage />
      </BrandProvider>,
    )
  const card = () => within(screen.getByRole('region', { name: 'This week' }))

  it('answers first: the week’s reach against last week’s, and its best post', () => {
    open()
    const demo = INSIGHTS_BY_BRAND['casa-vostra']
    const reach = demo.kpis[0]!.points
    // 12,600 this week against 12,100 the week before.
    expect(reach.slice(-2)).toEqual([12100, 12600])
    expect(card().getByText('12.6k')).toBeInTheDocument()
    expect(card().getByText('Up 4%')).toBeInTheDocument()
    // The post of the last seven days with the most reach, opening on its own page.
    const best = card().getByRole('link', { name: /Pasta by hand in 30 seconds\./ })
    expect(best).toHaveAttribute('href', '/post/casa-vostra-archive-6?posted=ig')
    expect(best).toHaveTextContent('6.1k reach')
    // The card is the first thing under the title.
    const main = screen.getByRole('main')
    expect(main.querySelector('section')).toBe(screen.getByRole('region', { name: 'This week' }))
  })

  it('names the week by its dates', () => {
    open()
    expect(card().getByText('This week · 30 Sep – 6 Oct')).toBeInTheDocument()
  })

  it('leads to every post of the 30 days, as its link says, ranked by reach with the same counts on each row', () => {
    open()
    fireEvent.click(card().getByRole('button', { name: 'All posts, last 30 days' }))
    expect(screen.getByRole('radio', { name: 'Posts', checked: true })).toBeInTheDocument()
    expect(screen.getByText('Last 30 days · 7 Sep – 6 Oct')).toBeInTheDocument()
    const rows = within(screen.getByRole('region', { name: 'Posts' })).getAllByRole('link')
    expect(rows[0]).toHaveTextContent('Ravioli, filled by hand.')
    expect(rows[0]).toHaveTextContent('11.2k reach')
    for (const row of rows) expect(row).toHaveTextContent(/\d(k|\.\dk)? reach.*\d saves/)
  })
})

describe('the views', () => {
  it('are the overview, the posts and the creators; the rest folds inside the overview', () => {
    render(
      <BrandProvider>
        <InsightsPage />
      </BrandProvider>,
    )
    const views = within(screen.getByRole('radiogroup', { name: 'View' }))
      .getAllByRole('radio')
      .map((r) => r.textContent)
    expect(views).toEqual(['Overview', 'Posts', 'Creators'])
    // One finding at first; the others are one click away.
    expect(screen.queryByRole('button', { name: /A chef in frame/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '2 more' }))
    expect(screen.getByRole('button', { name: /A chef in frame/ })).toBeInTheDocument()
    for (const fold of ['Sentiment', 'Visits and bookings', 'Best time to post'])
      expect(screen.getByRole('button', { name: new RegExp(`^${fold}`) })).toHaveAttribute(
        'aria-expanded',
        'false',
      )
  })
})

describe('the marketing hub', () => {
  it('names what to work on, from the complaints people raise most', () => {
    render(
      <BrandProvider>
        <InsightsPage />
      </BrandProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: /^Sentiment/ }))
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
    fireEvent.click(screen.getByRole('button', { name: /^Visits and bookings/ }))
    // The marker in green is the post bookings rose most after; its label says so, not only its colour.
    expect(
      within(screen.getByRole('region', { name: 'Visits and bookings' })).getByRole('img', {
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
    fireEvent.click(screen.getByRole('button', { name: /^Best time to post/ }))
    const fold = screen.getByRole('button', { name: /By time of day/ })
    expect(fold).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(fold)
    expect(fold).toHaveAttribute('aria-expanded', 'false')
  })
})
