import { act, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type * as TikTok from '@/features/connections/tiktok'
import { BrandProvider } from '@/features/schedule/posts-store'
import type * as Remote from '@/lib/remote'

import { Feed } from './posted-page'
import { takeState } from './posted-store'

// On the core, with the brand's TikTok account connected. The server's answer to the videos
// route is the test's own.
const answer = vi.hoisted(() => ({ videos: undefined as unknown, refusal: null as null | Error }))
vi.mock('@/lib/remote', async (original) => {
  const real = await original<typeof Remote>()
  return {
    ...real,
    remote: true,
    demoOf: () => undefined,
    request: async (method: string, path: string) => {
      if (method === 'GET' && path === '/brands/casa-vostra/tiktok/videos') {
        if (answer.refusal) throw answer.refusal
        return { videos: answer.videos }
      }
      return {}
    },
    onState: () => () => undefined,
    onAccount: () => () => undefined,
  }
})
vi.mock('@/features/connections/tiktok', async (original) => ({
  ...(await original<typeof TikTok>()),
  useTikTokAccount: () => ({ name: 'Casa Vostra', avatar: null }),
}))
vi.mock('next/navigation', () => ({
  usePathname: () => '/posted',
  useRouter: () => ({ push: vi.fn() }),
}))

const video = (over: Record<string, unknown>) => ({
  id: 'v1',
  title: 'Fresh pasta, rolled by hand',
  cover: 'https://p16.tiktokcdn.test/v1.jpeg',
  url: 'https://www.tiktok.com/@casavostra/video/v1',
  createdAt: '2026-10-24T10:00:00.000Z',
  duration: 21,
  views: 18420,
  likes: 1204,
  comments: 64,
  shares: 27,
  ...over,
})

function open() {
  render(
    <BrandProvider>
      <Feed on="tt" />
    </BrandProvider>,
  )
  act(() => takeState('casa-vostra', { brand: { id: 'casa-vostra' }, posts: [] }))
}

beforeEach(() => {
  answer.videos = []
  answer.refusal = null
})

describe('the TikTok tab on the core', () => {
  it('shows the connected account’s videos with their counts, each opening on TikTok', async () => {
    answer.videos = [video({}), video({ id: 'v2', title: 'Sunday roast', likes: 0, url: null })]
    open()
    const list = await screen.findByRole('list', { name: 'Videos' })
    const [first, second] = within(list).getAllByRole('listitem')
    // TikTok is in the rail beside the name, and on show.
    expect(screen.getByRole('radio', { name: 'TikTok', checked: true })).toBeInTheDocument()
    const link = within(first!).getByRole('link')
    expect(link).toHaveAttribute('href', 'https://www.tiktok.com/@casavostra/video/v1')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAccessibleName(/Fresh pasta, rolled by hand · 18.4k views$/)
    expect(first).toHaveTextContent('0:21')
    for (const count of ['18.4k', '1.2k', '64', '27']) expect(first).toHaveTextContent(count)
    // A count of 0 says nothing and is left out.
    expect(second).toHaveTextContent('Sunday roast')
    expect(second).not.toHaveTextContent(/likes/)
  })

  it('says to connect TikTok again when the account lacks the grant to read its videos', async () => {
    const { RemoteError } = await vi.importActual<typeof Remote>('@/lib/remote')
    answer.refusal = new RemoteError(409, 'TIKTOK_RECONNECT', 'connect again')
    open()
    expect(
      await screen.findByText('Connect TikTok again to show its videos here.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Reconnect TikTok' })).toHaveAttribute(
      'href',
      '/brand/connections',
    )
    expect(screen.queryByRole('list', { name: 'Videos' })).toBeNull()
  })
})
