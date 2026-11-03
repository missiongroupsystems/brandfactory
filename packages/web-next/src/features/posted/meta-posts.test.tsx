import { act, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type * as Connections from '@/features/connections/connections-store'
import type * as Make from '@/features/connections/make'
import { BrandProvider } from '@/features/schedule/posts-store'
import type * as Remote from '@/lib/remote'

import { Feed } from './posted-page'
import { takeState } from './posted-store'

// On the core, with the brand's Instagram account linked through our own Meta app. The server's
// answer to the posts route is the test's own.
const answer = vi.hoisted(() => ({
  posts: undefined as unknown,
  refusal: null as null | Error,
  asked: [] as string[],
  via: 'meta',
}))
vi.mock('@/lib/remote', async (original) => {
  const real = await original<typeof Remote>()
  return {
    ...real,
    remote: true,
    demoOf: () => undefined,
    request: async (method: string, path: string) => {
      answer.asked.push(`${method} ${path}`)
      if (method === 'GET' && path === '/brands/casa-vostra/meta/instagram/posts') {
        if (answer.refusal) throw answer.refusal
        return { posts: answer.posts }
      }
      return {}
    },
    onState: () => () => undefined,
    onAccount: () => () => undefined,
  }
})
vi.mock('@/features/connections/make', async (original) => ({
  ...(await original<typeof Make>()),
  useMakeAccount: (_brand: string, key: string) =>
    key === 'ig' ? { name: 'casavostra', accountId: '1784', via: answer.via } : null,
}))
vi.mock('@/features/connections/connections-store', async (original) => ({
  ...(await original<typeof Connections>()),
  useConnections: () => ({ ig: 'connected', fb: 'off', tt: 'off' }),
}))
vi.mock('next/navigation', () => ({
  usePathname: () => '/posted',
  useRouter: () => ({ push: vi.fn() }),
}))

const post = (over: Record<string, unknown>) => ({
  id: '1790',
  title: 'Fresh pasta',
  cover: 'https://scontent.cdninstagram.test/1790.jpg',
  url: 'https://www.instagram.com/p/abc/',
  createdAt: '2026-10-24T10:00:00.000Z',
  duration: null,
  views: 2400,
  likes: 120,
  comments: 8,
  shares: null,
  ...over,
})

function open() {
  render(
    <BrandProvider>
      <Feed on="ig" />
    </BrandProvider>,
  )
  act(() => takeState('casa-vostra', { brand: { id: 'casa-vostra' }, posts: [] }))
}

beforeEach(() => {
  answer.posts = []
  answer.refusal = null
  answer.asked.length = 0
  answer.via = 'meta'
})

describe('the Instagram tab on the core, linked through Meta', () => {
  it('shows the account’s own posts read from Meta, with their counts, each opening on Instagram', async () => {
    answer.posts = [post({})]
    open()
    const list = await screen.findByRole('list', { name: 'Posts' })
    const [first] = within(list).getAllByRole('listitem')
    expect(within(first!).getByRole('link')).toHaveAttribute(
      'href',
      'https://www.instagram.com/p/abc/',
    )
    for (const count of ['2.4k', '120', '8']) expect(first).toHaveTextContent(count)
    expect(answer.asked).toContain('GET /brands/casa-vostra/meta/instagram/posts')
    // A photo has no play mark, and is read as a post.
    expect(within(first!).getByRole('link')).toHaveAccessibleName(
      /^Post · .*Fresh pasta · 2.4k views$/,
    )
  })

  it('keeps what Make read back for an account linked through Make, and asks Meta nothing', async () => {
    answer.via = 'make'
    open()
    await act(async () => undefined)
    expect(screen.queryByRole('list', { name: 'Posts' })).toBeNull()
    expect(answer.asked.filter((a) => a.includes('/meta/'))).toEqual([])
  })

  it('says to connect Instagram again when Meta refuses the token', async () => {
    const { RemoteError } = await vi.importActual<typeof Remote>('@/lib/remote')
    answer.refusal = new RemoteError(409, 'META_RECONNECT', 'connect again')
    open()
    expect(
      await screen.findByText('Connect Instagram again to show its posts here.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Reconnect Instagram' })).toHaveAttribute(
      'href',
      '/brand/connections',
    )
  })
})
