import { act, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { BrandProvider } from '@/features/schedule/posts-store'
import type * as Remote from '@/lib/remote'

import { Feed } from './posted-page'
import { takeState } from './posted-store'

// On the core, as production runs: no account connected, and the demo's posts never stand in.
// The test hands the posted store a brand's state through its own way in, as a load would.
vi.mock('@/lib/remote', async (original) => ({
  ...(await original<typeof Remote>()),
  remote: true,
  demoOf: () => undefined,
  request: async () => ({}),
  onState: () => () => undefined,
  onAccount: () => () => undefined,
}))
vi.mock('next/navigation', () => ({
  usePathname: () => '/posted',
  useRouter: () => ({ push: vi.fn() }),
}))

const post = (id: string, over: Record<string, unknown>) => ({
  id,
  format: 'carousel',
  hook: id,
  day: '2026-10-20',
  time: '18:00',
  channels: ['ig'],
  media: [{ src: '/demo/crust.jpg', kind: 'photo' }],
  fromIdea: null,
  stage: 'posted',
  jobs: [],
  caption: '',
  draft: {},
  ...over,
})

describe('the feed on the core', () => {
  it('waits with the loading dots, then lists what went out with no number invented, and only what the core read back', () => {
    render(
      <BrandProvider>
        <Feed />
      </BrandProvider>,
    )
    expect(screen.getByRole('status', { name: 'Loading posts' })).toBeInTheDocument()
    act(() =>
      takeState('casa-vostra', {
        brand: { id: 'casa-vostra' },
        posts: [
          // Imported, then found by the read-back: the counts are the platform's own.
          post('Imported, with counts', {
            permalink: 'https://www.instagram.com/p/D1/',
            syncedAt: '2026-10-22T02:00:00Z',
            metrics: { likes: 214, comments: 9 },
            measuredAt: '2026-10-22T02:00:00Z',
          }),
          // Imported and never read back: nothing checks it is really there, so it stays out.
          post('Scraped only', { permalink: 'https://www.instagram.com/p/D2/' }),
          // Sent through Make: its Instagram job went live, and nothing read its counts yet.
          post('Sent from Brand Base', {
            day: '2026-10-21',
            jobs: [{ channel: 'ig', status: 'live', error: null }],
          }),
          post('Still planned', { stage: 'scheduled' }),
        ],
      }),
    )
    expect(screen.queryByRole('status', { name: 'Loading posts' })).toBeNull()
    const items = within(screen.getByRole('list', { name: 'Posts' })).getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(screen.queryByText(/Scraped only/)).toBeNull()
    expect(items.map((r) => r.textContent?.includes('Sent from Brand Base'))).toEqual([true, false])
    expect(items[0]).not.toHaveTextContent(/\d(k|m)?(views|reach|likes|comments|shares|saves)/)
    expect(items[1]).toHaveTextContent('214')
    expect(screen.queryByText(/as of/)).toBeNull()
    expect(screen.getByText('posts').parentElement).toHaveAttribute(
      'title',
      expect.stringMatching(/as of 22 Oct$/),
    )
    // Only Instagram has anything, and nothing is linked: the rail holds Instagram alone.
    expect(screen.queryAllByRole('radio', { name: /TikTok|Facebook/ })).toEqual([])
  })
})
