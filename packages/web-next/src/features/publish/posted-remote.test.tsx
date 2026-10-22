import { act, render, screen, within } from '@testing-library/react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Post } from '@/data/demo'
import { disconnect } from '@/features/connections/connections-store'
import { BrandProvider, useBrand } from '@/features/schedule/posts-store'
import type * as Remote from '@/lib/remote'

import { Composer } from './composer'

// The posts store's way in: the test hands it a brand's state, as a load would.
const loads = vi.hoisted(() => [] as Array<(brandId: string, state: Remote.BrandState) => void>)

// On the core, as production runs: no account is connected for any brand, and the brands' own
// posts were brought in as posted, with their counts and only their cover.
vi.mock('@/lib/remote', async (original) => ({
  ...(await original<typeof Remote>()),
  remote: true,
  // The original reads the original flag: on the core it answers nothing.
  demoOf: () => undefined,
  request: async () => ({}),
  push: vi.fn(),
  onState: (h: (brandId: string, state: Remote.BrandState) => void) => {
    if (new Error().stack?.includes('posts-store')) loads.push(h)
    return () => undefined
  },
  onAccount: () => () => undefined,
}))
vi.mock('next/navigation', () => ({
  usePathname: () => '/post/x',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}))
vi.stubGlobal('matchMedia', () => ({
  matches: false,
  addEventListener() {},
  removeEventListener() {},
}))
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn()
  Element.prototype.scrollTo = vi.fn()
  HTMLMediaElement.prototype.play = vi.fn(() => Promise.resolve())
  HTMLMediaElement.prototype.pause = vi.fn()
})
// As in production: no account connected.
beforeEach(() => {
  for (const k of ['ig', 'tt', 'fb'] as const) disconnect('casa-vostra', k)
})

// Not on the calendar's weeks, so the page reads its day from the slot.
const posted: Post = {
  id: 'casa-vostra-ig-C1',
  format: 'carousel',
  hook: 'Friday is for the wood oven',
  images: ['/demo/crust.jpg'],
  stage: 'posted',
  slot: 'Fri 16 Oct, 19:12',
  slotShort: 'Fri, 19:12',
  channels: ['ig'],
  metrics: { likes: 214, comments: 9 },
}

const open = (post: Post) =>
  render(
    <BrandProvider>
      <Composer post={post} />
    </BrandProvider>,
  )

describe('a posted post on the core', () => {
  it('previews on the account it went out on, with its own counts, with nothing connected', () => {
    open(posted)
    const preview = screen.getByRole('region', { name: 'Preview' })
    expect(within(preview).queryByText('Tick an account to preview it.')).toBeNull()
    expect(within(preview).getByRole('button', { name: 'Preview on Instagram' })).toBeTruthy()
    expect(within(preview).getByText('214 likes')).toBeInTheDocument()
  })

  it('previews a TikTok post on TikTok', () => {
    open({ ...posted, format: 'reel', channels: ['tt'] })
    const preview = screen.getByRole('region', { name: 'Preview' })
    expect(within(preview).getByRole('button', { name: 'Preview on TikTok' })).toBeTruthy()
    expect(within(preview).queryByRole('button', { name: 'Preview on Instagram' })).toBeNull()
  })

  it('is read-only: one "Posted on" line, and nothing to edit, schedule or send', () => {
    open(posted)
    expect(screen.getByText('Posted on Fri 16 Oct')).toBeInTheDocument()
    for (const name of ['Accounts', 'When', 'Details']) {
      expect(screen.queryByRole('region', { name })).toBeNull()
    }
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(
      screen.queryByRole('button', { name: /^(Schedule on|Post on|Save|Save draft)/ }),
    ).toBeNull()
    expect(screen.queryByText('Pick a channel.')).toBeNull()
    expect(screen.queryByText('Pick a day ahead.')).toBeNull()
  })
})

describe('a draft on the core', () => {
  const draft: Post = { ...posted, id: 'd1', stage: 'draft', metrics: undefined }

  it('numbers no single tile: one cover is not slide 1 of more', () => {
    open(draft)
    const strip = screen.getByRole('region', { name: 'Content' })
    expect(within(strip).queryByText('1')).toBeNull()
  })

  it('links to Connections when no account is linked, and offers no demo labels', () => {
    open(draft)
    expect(screen.getAllByRole('link', { name: 'Connect an account' })[0]).toHaveAttribute(
      'href',
      '/brand/connections',
    )
    expect(screen.queryByPlaceholderText(/TMP_Wine/)).toBeNull()
  })
})

describe('a new post on the core', () => {
  it("offers none of the demo brand's ideas as a start", () => {
    render(
      <BrandProvider>
        <Composer />
      </BrandProvider>,
    )
    expect(screen.queryByText('Start from an idea')).toBeNull()
    expect(screen.queryByRole('button', { name: /Watch the crust/ })).toBeNull()
  })
})

describe('a posted post from an earlier year, on the calendar', () => {
  /** The post as the calendar holds it once the brand's state has loaded. */
  function Opened({ id }: { id: string }) {
    const { byId } = useBrand()
    const post = byId(id)
    return post ? <Composer post={post} /> : null
  }

  it('names the year it went out on', () => {
    render(
      <BrandProvider>
        <Opened id="casa-vostra-ig-old" />
      </BrandProvider>,
    )
    act(() =>
      loads.at(-1)!('casa-vostra', {
        brand: { id: 'casa-vostra' },
        posts: [
          {
            id: 'casa-vostra-ig-old',
            format: 'reel',
            hook: 'The first wood oven',
            day: '2025-03-14',
            time: '19:00',
            channels: ['ig'],
            media: [{ src: '/demo/crust.jpg', kind: 'photo' }],
            fromIdea: null,
            stage: 'posted',
            jobs: [],
            caption: '',
            draft: {},
            metrics: { likes: 12 },
          },
        ],
        ideas: [],
      }),
    )
    expect(screen.getByText('Posted on Fri 14 Mar 2025')).toBeInTheDocument()
  })
})
