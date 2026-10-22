import { act, fireEvent, render, screen, within } from '@testing-library/react'
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

  it('is read-only: the post page with nothing to edit, schedule or send', () => {
    open(posted)
    expect(screen.getByText('Posted on Fri 16 Oct')).toBeInTheDocument()
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
    const pill = screen.getByRole('button', { name: 'Cover only' })
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

  it('shows no Details card when it went out with none', () => {
    open(posted)
    expect(screen.queryByRole('region', { name: 'Details' })).toBeNull()
  })

  it('says nothing about playing on a photo or a carousel', () => {
    open(posted)
    expect(screen.queryByRole('button', { name: 'Cover only' })).toBeNull()
    expect(screen.queryByRole('tooltip')).toBeNull()
  })
})

describe('a posted post, whatever it holds', () => {
  it('prints no invented count when it has none: a missing count shows nothing', () => {
    open({ ...posted, metrics: undefined })
    const preview = screen.getByRole('region', { name: 'Preview' })
    expect(within(preview).queryByText(/likes|comments/)).toBeNull()
    expect(within(preview).queryByText(/2,418|86/)).toBeNull()
  })

  it("prints none of TikTok's invented counts either", () => {
    open({ ...posted, format: 'reel', channels: ['tt'], metrics: undefined })
    const preview = screen.getByRole('region', { name: 'Preview' })
    expect(within(preview).queryByText(/24\.8K|312|1,204|418/)).toBeNull()
  })

  it("prints no invented count on Facebook's screen either", () => {
    open({ ...posted, channels: ['fb'], metrics: { likes: 5 } })
    const preview = screen.getByRole('region', { name: 'Preview' })
    expect(within(preview).getByText('5')).toBeInTheDocument()
    expect(within(preview).queryByText(/64 comments|27 shares|1\.2K/)).toBeNull()
  })

  it('asks for no photo when it has none: nothing can be added to it', () => {
    open({ ...posted, images: [] })
    const preview = screen.getByRole('region', { name: 'Preview' })
    expect(within(preview).queryByText('Add a photo or video')).toBeNull()
    expect(within(preview).queryByText('or drop it here')).toBeNull()
  })

  it('opens on the first account it went out on, in its own order', () => {
    open({ ...posted, format: 'reel', channels: ['tt', 'ig'] })
    expect(screen.getByRole('button', { name: 'Preview on TikTok' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('shows no account it never went to when none is recorded', () => {
    open({ ...posted, channels: undefined })
    expect(screen.queryByRole('region', { name: 'Preview' })).toBeNull()
    expect(screen.queryByRole('region', { name: 'Accounts' })).toBeNull()
    expect(screen.getByText('Posted on Fri 16 Oct')).toBeInTheDocument()
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
    expect(within(accounts).getByRole('button', { name: 'Won’t publish' })).toBeTruthy()
    expect(within(accounts).getByRole('tooltip').textContent).toBe(
      'Posts go out once accounts are connected.',
    )
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

describe('a posted post from an earlier year, on the calendar', () => {
  /** The post as the calendar holds it once the brand's state has loaded. */
  function Opened({ id }: { id: string }) {
    const { byId } = useBrand()
    const post = byId(id)
    return post ? <Composer post={post} /> : null
  }

  it("draws itself once in Instagram's grid", () => {
    render(
      <BrandProvider>
        <Opened id="casa-vostra-ig-grid" />
      </BrandProvider>,
    )
    act(() =>
      loads.at(-1)!('casa-vostra', {
        brand: { id: 'casa-vostra' },
        posts: [
          {
            id: 'casa-vostra-ig-grid',
            format: 'carousel',
            hook: 'Friday is for the wood oven',
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
          },
        ],
        ideas: [],
      }),
    )
    fireEvent.click(screen.getByRole('radio', { name: 'Grid' }))
    const preview = screen.getByRole('region', { name: 'Preview' })
    expect(preview.querySelectorAll('.grid-cols-3 > span')).toHaveLength(1)
  })

  it('opens as the full post page, every field filled in as text and none empty', () => {
    render(
      <BrandProvider>
        <Opened id="casa-vostra-ig-full" />
      </BrandProvider>,
    )
    act(() =>
      loads.at(-1)!('casa-vostra', {
        brand: { id: 'casa-vostra' },
        posts: [
          {
            id: 'casa-vostra-ig-full',
            format: 'carousel',
            hook: 'Friday is for the wood oven',
            day: '2026-10-16',
            time: '19:00',
            channels: ['ig'],
            media: [{ src: '/demo/crust.jpg', kind: 'photo' }],
            fromIdea: null,
            stage: 'posted',
            jobs: [],
            caption: 'Friday is for the wood oven.\nBook a table.',
            draft: {
              details: { location: 'Club Street', comment: '', collab: [], aiLabel: true },
              labels: ['F1 weekend'],
            },
            metrics: { likes: 3 },
          },
        ],
        ideas: [],
      }),
    )
    const accounts = screen.getByRole('region', { name: 'Accounts' })
    expect(within(accounts).getByText('Instagram')).toBeInTheDocument()
    expect(within(accounts).getByText('Post')).toBeInTheDocument()
    const content = screen.getByRole('region', { name: 'Content' })
    expect(within(content).getByText(/Book a table\./)).toBeInTheDocument()
    expect(content.querySelectorAll('img')).toHaveLength(1)
    const details = screen.getByRole('region', { name: 'Details' })
    expect(within(details).getByText('Club Street')).toBeInTheDocument()
    expect(within(details).getByText('AI-generated label')).toBeInTheDocument()
    expect(within(details).getByText('F1 weekend')).toBeInTheDocument()
    // An empty field is left out, not shown as an empty input.
    expect(within(details).queryByText('First comment')).toBeNull()
    expect(within(details).queryByText('Collaborators')).toBeNull()
    expect(screen.getByRole('region', { name: 'Preview' })).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.queryByRole('switch')).toBeNull()
    expect(screen.queryByRole('combobox')).toBeNull()
  })

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
