import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { BrandProvider } from '@/features/schedule/posts-store'

import { PostedPage } from './posted-page'

vi.mock('next/navigation', () => ({
  usePathname: () => '/posted',
  useRouter: () => ({ push: vi.fn() }),
}))

const open = (on?: 'ig' | 'fb' | 'tt') =>
  render(
    <BrandProvider>
      <PostedPage on={on} />
    </BrandProvider>,
  )
const rows = () => screen.getAllByRole('listitem')
const row = (hook: string) => rows().find((r) => r.textContent?.includes(hook))!

describe('Posted in the static demo', () => {
  it('opens on Instagram, newest first, the demo’s stories with its posts', () => {
    open()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Instagram')
    // Newest first: the margherita reel (noon on 6 Oct, the demo's today), then that morning's
    // stories (from 09:00), then the archive.
    const order = rows().map((r) => r.textContent ?? '')
    const stories = order.findIndex((t) => t.startsWith('Story'))
    const reel = order.findIndex((t) => t.includes('Margherita, oven to table'))
    const archive = order.findIndex((t) => t.includes('Wine pairing night.'))
    expect(reel).toBe(0)
    expect(stories).toBe(1)
    expect(archive).toBeGreaterThan(stories)
  })

  it('shows a post’s counts with when they were read, and opens its poster with the way back', () => {
    open()
    const ravioli = row('Ravioli, filled by hand.')
    expect(ravioli).toHaveTextContent(/reach/)
    expect(ravioli).toHaveTextContent('as of 6 Oct')
    expect(within(ravioli).getByRole('link')).toHaveAttribute(
      'href',
      expect.stringMatching(/^\/post\/casa-vostra-archive-\d+\?posted=ig$/),
    )
  })

  it('marks a collaboration post with the creators it is shared with', () => {
    open()
    expect(row('Wine pairing night.')).toHaveTextContent('Collab · @danielfooddiary')
    expect(row('Guess the ingredient.')).not.toHaveTextContent('Collab')
  })

  it('ranks the posts by engagement on request, and back to newest', () => {
    open()
    fireEvent.click(screen.getByRole('radio', { name: 'Top' }))
    const region = (name: string) =>
      within(screen.getByRole('region', { name })).getAllByRole('listitem')
    // Every ranked post has numbers; the rest wait apart, in time order, none ranked.
    expect(region('Most engaging').every((r) => /as of/.test(r.textContent ?? ''))).toBe(true)
    const unread = region('No numbers yet')
    expect(unread.length).toBeGreaterThan(0)
    expect(unread.some((r) => /as of/.test(r.textContent ?? ''))).toBe(false)
    fireEvent.click(screen.getByRole('radio', { name: 'Newest' }))
    expect(screen.queryByRole('region', { name: 'Most engaging' })).toBeNull()
  })

  it('switches platform from the rail, and shows no Instagram numbers on Facebook', () => {
    open()
    fireEvent.click(screen.getAllByRole('radio', { name: /Facebook/ })[0]!)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Facebook')
    // The archive's carousels also went to Facebook; their counts are Instagram's, so none show.
    expect(row('Ravioli, filled by hand.')).not.toHaveTextContent('as of')
    // Nothing reads Facebook's stories.
    expect(rows().some((r) => r.textContent?.startsWith('Story'))).toBe(false)
  })

  it('opens on the platform the address names', () => {
    open('tt')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('TikTok')
  })
})
