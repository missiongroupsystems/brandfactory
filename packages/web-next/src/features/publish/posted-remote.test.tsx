import { act, render, screen, within } from '@testing-library/react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Post } from '@/data/demo'
import { disconnect } from '@/features/connections/connections-store'
import { BrandProvider, useBrand } from '@/features/schedule/posts-store'
import type * as Remote from '@/lib/remote'

import { Composer } from './composer'
import { DrivePicker } from './drive-picker'

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
/** The posted page's title block: the accounts it went out on, the format and the day. */
const header = () => document.querySelector('header')!

describe('a posted post on the core', () => {
  it('shows the account it went out on and its own counts, with nothing connected', () => {
    open(posted)
    expect(within(header()).getByText('Instagram')).toBeInTheDocument()
    expect(screen.getByText('214')).toBeInTheDocument()
    expect(screen.getByText('Likes')).toBeInTheDocument()
    expect(screen.getByText('9')).toBeInTheDocument()
  })

  it('shows a TikTok post on TikTok', () => {
    open({ ...posted, format: 'reel', channels: ['tt'] })
    expect(within(header()).getByText('TikTok')).toBeInTheDocument()
    expect(within(header()).queryByText('Instagram')).toBeNull()
  })

  it('is read-only: the post page with nothing to edit, schedule or send', () => {
    open(posted)
    expect(screen.getByText('Post · Fri 16 Oct, 19:12')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'When' })).toBeNull()
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.queryByRole('checkbox')).toBeNull()
    expect(screen.queryByRole('radiogroup', { name: 'Format' })).toBeNull()
    expect(
      screen.queryByRole('button', { name: /Upload|Google Drive|Library|Draft with AI/ }),
    ).toBeNull()
    expect(screen.queryByRole('button', { name: /^(Schedule|Post on|Save|Save draft)/ })).toBeNull()
    expect(screen.queryByText('Pick a channel.')).toBeNull()
    expect(screen.queryByText('Pick a day ahead.')).toBeNull()
  })

  it('shows the cover of a video with "Cover only" and why, on its own platform', () => {
    open({ ...posted, format: 'reel', channels: ['tt'] })
    const [pill] = screen.getAllByRole('button', { name: 'Cover only' })
    expect(pill).toHaveAccessibleDescription('Video plays once TikTok is connected.')
  })

  it('says nothing about playing on a reel that has its video', () => {
    open({ ...posted, format: 'reel', images: ['/demo/casa-vostra/margherita-reel.mp4#video'] })
    expect(screen.queryByRole('button', { name: 'Cover only' })).toBeNull()
  })

  it('claims no cover on a video brought in with no picture at all', () => {
    open({ ...posted, format: 'reel', images: [] })
    expect(screen.queryByRole('button', { name: 'Cover only' })).toBeNull()
  })

  it('lists no facts when it went out with none', () => {
    open(posted)
    expect(screen.queryByText(/^(Collaborators|Tagged|Location|Labels)$/)).toBeNull()
  })

  it('says nothing about playing on a photo or a carousel', () => {
    open(posted)
    expect(screen.queryByRole('button', { name: 'Cover only' })).toBeNull()
  })
})

describe('a posted post, whatever it holds', () => {
  it('prints no invented count when it has none: a missing count shows nothing', () => {
    open({ ...posted, metrics: undefined })
    expect(screen.queryByText(/^(Views|Likes|Comments|Shares|Saves)$/)).toBeNull()
    expect(screen.queryByText(/2,418|86/)).toBeNull()
  })

  it('prints only the counts it has, on any account', () => {
    open({ ...posted, channels: ['fb'], metrics: { likes: 5 } })
    expect(screen.getByText('5')).toBeInTheDocument()
    expect(screen.getByText('Likes')).toBeInTheDocument()
    expect(screen.queryByText('Comments')).toBeNull()
  })

  it('shows no picture when it has none, and asks for none', () => {
    open({ ...posted, images: [] })
    expect(document.querySelector('img')).toBeNull()
    expect(screen.queryByRole('button', { name: /photo|video|Upload/ })).toBeNull()
  })

  it('names its accounts in its own order', () => {
    open({ ...posted, format: 'reel', channels: ['tt', 'ig'] })
    const chips = within(header())
      .getAllByText(/^(TikTok|Instagram)$/)
      .map((e) => e.textContent)
    expect(chips).toEqual(['TikTok', 'Instagram'])
  })

  it('shows no account it never went to when none is recorded', () => {
    open({ ...posted, channels: undefined })
    expect(within(header()).queryByText(/^(Instagram|TikTok|Facebook)$/)).toBeNull()
    expect(screen.getByText('Post · Fri 16 Oct, 19:12')).toBeInTheDocument()
  })
})

describe('a draft on the core', () => {
  const draft: Post = { ...posted, id: 'd1', stage: 'draft', metrics: undefined }

  it('numbers no single tile: one cover is not slide 1 of more', () => {
    open(draft)
    const strip = screen.getByRole('region', { name: 'Content' })
    expect(within(strip).queryByText('1')).toBeNull()
  })

  it('says it will not publish yet, promises no connect, and offers no demo labels', () => {
    open(draft)
    const accounts = screen.getByRole('region', { name: 'Accounts' })
    expect(within(accounts).getByRole('button', { name: 'Not available yet' })).toBeTruthy()
    expect(within(accounts).getByRole('tooltip').textContent).toBe('Publishing isn’t set up yet.')
    expect(screen.queryByRole('link', { name: 'Connect an account' })).toBeNull()
    expect(screen.queryByText('Tick an account to preview it.')).toBeNull()
    expect(screen.queryByText('Pick an account')).toBeNull()
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

describe('a posted post from the calendar, on the core', () => {
  /** The post as the calendar holds it once the brand's state has loaded. */
  function Opened({ id }: { id: string }) {
    const { byId } = useBrand()
    const post = byId(id)
    return post ? <Composer post={post} /> : null
  }
  const served: Record<string, unknown> = {
    format: 'carousel',
    day: '2026-10-16',
    time: '19:00',
    channels: ['ig'],
    media: [{ src: '/demo/crust.jpg', kind: 'photo' }],
    fromIdea: null,
    stage: 'posted',
    jobs: [],
    caption: '',
    draft: {},
    metrics: null,
  }
  const load = (id: string, post: Record<string, unknown>) => {
    render(
      <BrandProvider>
        <Opened id={id} />
      </BrandProvider>,
    )
    act(() =>
      loads.at(-1)!('casa-vostra', {
        brand: { id: 'casa-vostra' },
        posts: [{ ...served, id, ...post }],
        ideas: [],
      }),
    )
  }

  it('opens as the full page: every field it went out with, as text, and none empty', () => {
    load('casa-vostra-ig-full', {
      hook: 'Friday is for the wood oven',
      caption: 'Friday is for the wood oven.\nBook a table.',
      draft: {
        details: { location: 'Club Street', comment: '', collab: ['@giulia.cooks'], aiLabel: true },
        labels: ['F1 weekend'],
      },
      metrics: { likes: 3 },
      permalink: 'https://www.instagram.com/p/C1/',
      // 1 am on the 22nd in Singapore: the counts are as of the 22nd, not the UTC day.
      measuredAt: '2026-10-21T17:00:00.000Z',
    })
    expect(screen.getByText('as of 22 Oct')).toBeInTheDocument()
    expect(within(header()).getByText('Instagram')).toBeInTheDocument()
    expect(screen.getByText('Post · Fri 16 Oct, 19:00')).toBeInTheDocument()
    expect(screen.getByText(/Book a table\./)).toBeInTheDocument()
    expect(screen.getByText('Collaborators').nextSibling).toHaveTextContent('@giulia.cooks')
    expect(screen.getByText('Location').nextSibling).toHaveTextContent('Club Street')
    expect(screen.getByText('Labels').nextSibling).toHaveTextContent('F1 weekend')
    expect(screen.queryByText('Tagged')).toBeNull()
    const link = screen.getByRole('link', { name: 'Open on Instagram' })
    expect(link).toHaveAttribute('href', 'https://www.instagram.com/p/C1/')
    expect(link).toHaveAttribute('target', '_blank')
    // The collaborator reaches the analytics preview too.
    expect(screen.getByText('Reach by account')).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.queryByRole('switch')).toBeNull()
    expect(screen.queryByRole('combobox')).toBeNull()
  })

  it('lists the people tagged on its photos, once each', () => {
    load('casa-vostra-ig-tagged', {
      hook: 'Two photos, three tags',
      media: [
        { src: '/demo/crust.jpg', kind: 'photo' },
        { src: '/demo/pasta.jpg', kind: 'photo' },
      ],
      draft: {
        shots: [
          { crop: null, tags: [{ handle: '@nonna.rosa', at: { x: 0.4, y: 0.5 } }] },
          {
            crop: null,
            tags: [
              { handle: '@nonna.rosa', at: null },
              { handle: '@giulia.cooks', at: null },
            ],
          },
        ],
      },
    })
    expect(screen.getByText('Tagged').nextSibling).toHaveTextContent('@nonna.rosa, @giulia.cooks')
  })

  it('names the year it went out on', () => {
    load('casa-vostra-ig-old', {
      format: 'reel',
      hook: 'The first wood oven',
      day: '2025-03-14',
      metrics: { likes: 12 },
    })
    expect(screen.getByText('Reel · Fri 14 Mar 2025, 19:00')).toBeInTheDocument()
  })

  it('shows no caption when it went out with none: the title does not stand in for one', () => {
    load('casa-vostra-ig-bare', { hook: 'A title with no caption', metrics: { likes: 3 } })
    expect(screen.getAllByText('A title with no caption')).toHaveLength(1)
    expect(screen.getByText('A title with no caption').tagName).toBe('H1')
  })
})

describe('Google Drive on the core', () => {
  it("opens empty for casa-vostra, never the demo brand's folders", () => {
    render(
      <BrandProvider>
        <DrivePicker phone={false} room={10} onClose={vi.fn()} onPick={vi.fn()} />
      </BrandProvider>,
    )
    const picker = screen.getByRole('dialog', { name: 'Google Drive' })
    expect(within(picker).queryAllByRole('checkbox')).toEqual([])
  })
})
