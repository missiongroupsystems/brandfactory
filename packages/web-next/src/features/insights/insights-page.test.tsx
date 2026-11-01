import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { INSIGHTS_BY_BRAND } from '@/data/insights'
import { resetIdeas } from '@/features/ideate/ideas-store'
import { BrandProvider } from '@/features/schedule/posts-store'

import { InsightsPage } from './insights-page'

const push = vi.fn()
vi.mock('next/navigation', () => ({
  usePathname: () => '/feed',
  useRouter: () => ({ push }),
  useSearchParams: () => new URLSearchParams(window.location.search),
}))

beforeEach(() => {
  resetIdeas()
  push.mockClear()
  window.history.replaceState(null, '', '/feed')
})

describe('the static demo', () => {
  it("shows casa-vostra's demo figures", () => {
    render(
      <BrandProvider>
        <InsightsPage />
      </BrandProvider>,
    )
    const demo = INSIGHTS_BY_BRAND['casa-vostra']
    // The period sits inside the Overview row, not above the feed.
    expect(screen.queryByText(demo.period)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /^Overview/ }))
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
    fireEvent.click(screen.getByRole('button', { name: /^Overview/ }))
    fireEvent.click(screen.getByRole('button', { name: /Hand-made reels hold viewers/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Turn into idea' }))
    fireEvent.click(screen.getByRole('button', { name: 'Plan it' }))
    expect(push).toHaveBeenCalledTimes(1)
    expect(push.mock.calls[0]![0]).toMatch(/^\/ideate\/[\w-]+$/)
  })
})

const row = (name: string) => screen.getByRole('button', { name: new RegExp(`^${name}`) })
const stack = () => within(screen.getByRole('radiogroup', { name: 'Platform' }))

describe('the feed and its rows', () => {
  it('open on the feed, the platforms a stack of logos by the name, the rows shut under the grid', () => {
    render(
      <BrandProvider>
        <InsightsPage />
      </BrandProvider>,
    )
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Feed')
    expect(screen.getByRole('region', { name: 'Feed' })).toBeInTheDocument()
    expect(
      stack()
        .getAllByRole('radio')
        .map((r) => r.getAttribute('aria-label')),
    ).toEqual(['Instagram', 'Facebook', 'TikTok'])
    expect(stack().getByRole('radio', { name: 'Instagram' })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    for (const name of ['Overview', 'Sentiment', 'Creators'])
      expect(row(name)).toHaveAttribute('aria-expanded', 'false')
    // Each shut row says its one figure.
    expect(row('Overview')).toHaveTextContent(/49\.1k ?reached/)
    expect(row('Sentiment')).toHaveTextContent(/\d+% ?positive/)
    expect(row('Creators')).toHaveTextContent(/views/)
    expect(screen.queryByRole('region', { name: 'The month in numbers' })).toBeNull()
  })

  it('switch the platform from the stack, and keep it in the address', () => {
    render(
      <BrandProvider>
        <InsightsPage />
      </BrandProvider>,
    )
    fireEvent.click(stack().getByRole('radio', { name: 'TikTok' }))
    expect(stack().getByRole('radio', { name: 'TikTok' })).toHaveAttribute('aria-checked', 'true')
    expect(window.location.pathname + window.location.search).toBe('/feed?on=tt')
    // The grid is TikTok's: a reel with its views, none of Instagram's stories.
    expect(screen.queryByRole('list', { name: 'Stories' })).toBeNull()
    fireEvent.click(stack().getByRole('radio', { name: 'Facebook' }))
    expect(window.location.search).toBe('?on=fb')
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(/^Casa Vostra$/)
  })

  it('open on the platform the address names, old links included', () => {
    window.history.replaceState(null, '', '/feed?on=fb')
    const { unmount } = render(
      <BrandProvider>
        <InsightsPage on="fb" />
      </BrandProvider>,
    )
    expect(stack().getByRole('radio', { name: 'Facebook' })).toHaveAttribute('aria-checked', 'true')
    unmount()
    // Before 2.50.0 the feed was a view of its own: `?view=feed&on=fb` still lands on it.
    window.history.replaceState(null, '', '/feed?view=feed&on=fb')
    render(
      <BrandProvider>
        <InsightsPage view="feed" on="fb" />
      </BrandProvider>,
    )
    expect(stack().getByRole('radio', { name: 'Facebook' })).toHaveAttribute('aria-checked', 'true')
    for (const name of ['Overview', 'Sentiment', 'Creators'])
      expect(row(name)).toHaveAttribute('aria-expanded', 'false')
  })

  it('fold a row open in place, one at a time, and name it in the address with the platform', () => {
    window.history.replaceState(null, '', '/feed?on=fb')
    render(
      <BrandProvider>
        <InsightsPage on="fb" />
      </BrandProvider>,
    )
    fireEvent.click(row('Overview'))
    expect(row('Overview')).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('region', { name: 'The month in numbers' })).toBeInTheDocument()
    // The feed stays above it.
    expect(screen.getByRole('region', { name: 'Feed' })).toBeInTheDocument()
    expect(window.location.search).toBe('?view=overview&on=fb')
    fireEvent.click(row('Sentiment'))
    expect(row('Overview')).toHaveAttribute('aria-expanded', 'false')
    expect(row('Sentiment')).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('region', { name: 'What to work on' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'The month in numbers' })).toBeNull()
    expect(window.location.search).toBe('?view=sentiment&on=fb')
    fireEvent.click(row('Creators'))
    expect(screen.getByRole('region', { name: 'Creators' })).toBeInTheDocument()
    // The open row shuts on a second click, and the address is the feed's again.
    fireEvent.click(row('Creators'))
    expect(row('Creators')).toHaveAttribute('aria-expanded', 'false')
    expect(window.location.search).toBe('?on=fb')
    // A platform picked while a row is open keeps the row open.
    fireEvent.click(row('Sentiment'))
    fireEvent.click(stack().getByRole('radio', { name: 'TikTok' }))
    expect(row('Sentiment')).toHaveAttribute('aria-expanded', 'true')
    expect(window.location.search).toBe('?view=sentiment&on=tt')
  })

  it('open the row the address names', () => {
    window.history.replaceState(null, '', '/feed?view=creators')
    render(
      <BrandProvider>
        <InsightsPage view="creators" />
      </BrandProvider>,
    )
    expect(row('Creators')).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('region', { name: 'Creators' })).toBeInTheDocument()
    expect(row('Overview')).toHaveAttribute('aria-expanded', 'false')
  })

  it('shut the rows when the nav links to /feed from an open one', () => {
    const page = () => (
      <BrandProvider>
        <InsightsPage />
      </BrandProvider>
    )
    const { rerender } = render(page())
    fireEvent.click(row('Overview'))
    expect(screen.getByRole('region', { name: 'The month in numbers' })).toBeInTheDocument()
    // The nav's link changes only the address; Next renders the page again with the same props.
    window.history.pushState(null, '', '/feed')
    rerender(page())
    expect(row('Overview')).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('region', { name: 'The month in numbers' })).toBeNull()
    expect(screen.getByRole('region', { name: 'Feed' })).toBeInTheDocument()
  })
})

describe('an opened row', () => {
  it('rises to the top of the window, unless the reader scrolled in the meantime', () => {
    vi.useFakeTimers()
    const rise = vi.fn()
    Element.prototype.scrollIntoView = rise
    try {
      render(
        <BrandProvider>
          <InsightsPage />
        </BrandProvider>,
      )
      fireEvent.click(screen.getByRole('button', { name: /^Overview/ }))
      act(() => {
        vi.advanceTimersByTime(400)
      })
      expect(rise).toHaveBeenCalledTimes(1)

      fireEvent.click(screen.getByRole('button', { name: /^Sentiment/ }))
      window.scrollY = 300
      fireEvent.scroll(window)
      act(() => {
        vi.advanceTimersByTime(400)
      })
      expect(rise).toHaveBeenCalledTimes(1)
    } finally {
      window.scrollY = 0
      vi.useRealTimers()
    }
  })
})

describe('the platform stack', () => {
  it('is one Tab stop, and the arrows move the pick and the focus round the ends', () => {
    render(
      <BrandProvider>
        <InsightsPage />
      </BrandProvider>,
    )
    const group = screen.getByRole('radiogroup', { name: 'Platform' })
    const radio = (name: string) => within(group).getByRole('radio', { name })
    expect(radio('Instagram')).toHaveAttribute('tabindex', '0')
    expect(radio('Facebook')).toHaveAttribute('tabindex', '-1')
    radio('Instagram').focus()
    fireEvent.keyDown(radio('Instagram'), { key: 'ArrowLeft' })
    expect(radio('TikTok')).toHaveAttribute('aria-checked', 'true')
    expect(radio('TikTok')).toHaveFocus()
    expect(window.location.search).toBe('?on=tt')
    fireEvent.keyDown(radio('TikTok'), { key: 'ArrowRight' })
    expect(radio('Instagram')).toHaveFocus()
  })
})

describe('the feed on a phone', () => {
  // Below 768px a chip with a menu of the platforms stands in for the stack of logos. The split
  // is CSS, so the server's first paint is right on a phone too; jsdom has both in the page.
  it('switch the platform from the menu on the name, by a tap or by the keys, and keep it in the address', () => {
    render(
      <BrandProvider>
        <InsightsPage />
      </BrandProvider>,
    )
    expect(screen.getByRole('radiogroup', { name: 'Platform' }).parentElement).toHaveClass(
      'max-md:hidden',
    )
    const opener = screen.getByRole('button', { name: 'Instagram. Switch platform' })
    expect(opener.closest('.md\\:hidden')).not.toBeNull()
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(/^Casa Vostra$/)
    fireEvent.click(opener)
    const menu = within(screen.getByRole('menu', { name: 'Platform' }))
    expect(menu.getAllByRole('menuitemradio').map((r) => r.textContent)).toEqual([
      'Instagram9',
      'Facebook4',
      'TikTok5',
    ])
    expect(menu.getByRole('menuitemradio', { name: /Instagram/ })).toHaveFocus()
    fireEvent.click(menu.getByRole('menuitemradio', { name: /TikTok/ }))
    expect(screen.queryByRole('menu')).toBeNull()
    expect(window.location.search).toBe('?on=tt')
    expect(screen.getByRole('button', { name: 'TikTok. Switch platform' })).toBeInTheDocument()
    // The keys: Down from TikTok wraps to Instagram, Escape shuts it and the focus goes back.
    const again = screen.getByRole('button', { name: /Switch platform$/ })
    fireEvent.click(again)
    expect(screen.getByRole('menuitemradio', { name: /TikTok/ })).toHaveFocus()
    fireEvent.keyDown(window, { key: 'ArrowDown' })
    expect(screen.getByRole('menuitemradio', { name: /Instagram/ })).toHaveFocus()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
    expect(again).toHaveFocus()
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
    fireEvent.click(screen.getByRole('button', { name: /^Overview/ }))
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
    fireEvent.click(screen.getByRole('button', { name: /^Overview/ }))
    const fold = screen.getByRole('button', { name: /By time of day/ })
    expect(fold).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(fold)
    expect(fold).toHaveAttribute('aria-expanded', 'false')
  })
})
