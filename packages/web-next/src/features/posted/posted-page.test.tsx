import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { BrandProvider } from '@/features/schedule/posts-store'

import { Feed } from './posted-page'

vi.mock('next/navigation', () => ({
  usePathname: () => '/posted',
  useRouter: () => ({ push: vi.fn() }),
}))

const onPick = vi.fn()
const open = (on?: 'ig' | 'fb' | 'tt') =>
  render(
    <BrandProvider>
      <Feed on={on} onPick={onPick} />
    </BrandProvider>,
  )
const tiles = () => within(screen.getByRole('list', { name: 'Posts' })).getAllByRole('listitem')
const tile = (hook: string) => tiles().find((t) => t.textContent?.includes(hook))!
const rings = () => within(screen.getByRole('list', { name: 'Stories' })).getAllByRole('listitem')
/** A tile with counts names them in its hover: "662likes". */
const counted = (t: HTMLElement) =>
  /\d(k|m)?(views|reach|likes|comments|shares|saves)/.test(t.textContent ?? '')
const platform = () =>
  screen.getAllByRole('radio', { checked: true }).find((r) => r.closest('[aria-label="Platform"]'))

// A story's "Live, n h left" counts from the real clock: noon keeps the demo's stories where the
// tests expect them, whatever time the suite runs.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 29, 12, 0))
  onPick.mockClear()
})
afterEach(() => vi.useRealTimers())

describe('the feed in the static demo', () => {
  it('opens on Instagram as the brand’s profile: its stories as rings, its posts newest first', () => {
    open()
    // Nothing is linked in the demo: the brand's name, never a handle it may not own there.
    // A heading under Insights' own title, never a second h1.
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(/^Casa Vostra$/)
    expect(platform()).toHaveAccessibleName('Instagram')
    // The morning's stories (from 09:00 on 6 Oct, the demo's today) are up; the 5th's have gone.
    expect(rings().map((r) => r.getAttribute('aria-label'))).toEqual([
      expect.stringMatching(/^Story · \d frames · Today · Live, \d+ h left$/),
      expect.stringMatching(/^Story · \d frames · Mon 5 · Gone$/),
    ])
    // Newest first, stories not in the grid: the margherita reel (noon today), then the archive.
    expect(tiles()[0]).toHaveTextContent('Margherita, oven to table')
    expect(tiles().some((t) => t.textContent?.startsWith('Story'))).toBe(false)
    expect(
      tiles().findIndex((t) => t.textContent?.includes('Wine pairing night.')),
    ).toBeGreaterThan(0)
  })

  it('shows a post’s counts on its tile, says when they were read once, and opens its poster with the way back', () => {
    open()
    const ravioli = tile('Ravioli, filled by hand.')
    expect(counted(ravioli)).toBe(true)
    expect(within(ravioli).getByRole('link')).toHaveAttribute(
      'href',
      expect.stringMatching(/^\/post\/casa-vostra-archive-\d+\?posted=ig$/),
    )
    // When the totals were read is on their hover only, never written on the page or a post.
    expect(screen.queryAllByText(/as of/)).toEqual([])
    expect(screen.getByText('posts').parentElement).toHaveAttribute(
      'title',
      expect.stringMatching(/^Last 30 days.*as of 6 Oct$/),
    )
  })

  it('names each tile for a reader from the post itself, not from the hover a phone never shows', () => {
    open()
    // The name is the link's own label: the hover layer, hidden on a phone, plays no part in it.
    const ravioli = screen.getByRole('link', {
      name: /^(Post|Carousel) · .+: Ravioli, filled by hand\. · [\d.]+k? (likes|reach)$/,
    })
    expect(ravioli).toHaveAttribute('href', expect.stringMatching(/\?posted=ig$/))
    // A post with no numbers is named with none.
    expect(
      screen.getByRole('link', {
        name: /^Reel · Today, \d\d:\d\d: Margherita, oven to table in 90 seconds\.$/,
      }),
    ).toBeInTheDocument()
  })

  it('marks a collaboration post with the creators it is shared with', () => {
    open()
    expect(tile('Wine pairing night.')).toHaveTextContent('with @danielfooddiary')
    expect(tile('Guess the ingredient.')).not.toHaveTextContent('with @')
  })

  it('ranks the posts by engagement from a sort menu that names its orders, the ones without numbers last, and back to newest', () => {
    open()
    const newest = tiles().map((t) => t.textContent)
    // One sort icon, no words on it; the menu says what each order is.
    const sort = screen.getByRole('button', { name: 'Sort' })
    expect(sort).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(sort)
    const menu = screen.getByRole('menu', { name: 'Sort' })
    expect(
      within(menu)
        .getAllByRole('menuitemradio')
        .map((m) => m.textContent),
    ).toEqual(['Newest', 'Most engaging'])
    expect(within(menu).getByRole('menuitemradio', { name: 'Newest' })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    fireEvent.click(within(menu).getByRole('menuitemradio', { name: 'Most engaging' }))
    // Picked: the menu shuts.
    expect(screen.queryByRole('menu', { name: 'Sort' })).toBeNull()
    const ranked = tiles().map(counted)
    const first = ranked.indexOf(false)
    expect(first).toBeGreaterThan(0)
    // Every post with numbers comes before every post without; none of those is ranked.
    expect(ranked.slice(first).every((c) => !c)).toBe(true)
    expect(tiles().map((t) => t.textContent)).not.toEqual(newest)
    fireEvent.click(sort)
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Newest' }))
    expect(tiles().map((t) => t.textContent)).toEqual(newest)
  })

  it('switches platform from the pills, tells its page which, and shows no Instagram numbers on Facebook', () => {
    open()
    fireEvent.click(screen.getAllByRole('radio', { name: /Facebook/ })[0]!)
    expect(platform()).toHaveAccessibleName('Facebook')
    // The page keeps the platform in the address, so a post's way back lands on it.
    expect(onPick).toHaveBeenCalledWith('fb')
    // The archive's carousels also went to Facebook; their counts are Instagram's, so none show.
    expect(counted(tile('Ravioli, filled by hand.'))).toBe(false)
    // Nothing reads Facebook's stories.
    expect(screen.queryByRole('list', { name: 'Stories' })).toBeNull()
  })

  it('opens on the platform the address names', () => {
    open('tt')
    expect(platform()).toHaveAccessibleName('TikTok')
  })
})
