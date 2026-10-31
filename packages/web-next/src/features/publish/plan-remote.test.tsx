import { act, fireEvent, render, screen, within } from '@testing-library/react'
import * as React from 'react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Post } from '@/data/demo'
import { BrandProvider, useBrand } from '@/features/schedule/posts-store'
import type * as Remote from '@/lib/remote'

import { Composer } from './composer'

// On the core, as production runs: no account can connect yet. A post is still planned: it takes
// a day and the brand's own platforms, and Schedule puts it on the calendar without sending it.
const requests = vi.hoisted(() => [] as Array<{ call: string; body: unknown }>)
const account = vi.hoisted(() => ({ platforms: undefined as string[] | undefined }))
// The brand's state, as the core sends it, once the test begins.
const core = vi.hoisted(() => ({ loaded: false }))
vi.mock('@/lib/remote', async (original) => {
  const { demoAsCore } = await import('@/test-core-state')
  return {
    ...(await original<typeof Remote>()),
    remote: true,
    demoOf: () => undefined,
    // The server answers at once: each queued change runs, then counts as stored.
    sent: async (_brandId: string, send: () => Promise<unknown>) => {
      await send()
      return null
    },
    request: async (method: string, path: string, body?: unknown) => {
      requests.push({ call: `${method} ${path}`, body })
      return {}
    },
    push: vi.fn(),
    // The demo brand's posts, as the core sends them: on the core no store starts with the demo's.
    onState: (hydrate: (id: string, state: unknown) => void) => {
      // Once the modules are in: the stores that listen from their first line hear nothing.
      if (core.loaded) hydrate('casa-vostra', demoAsCore('casa-vostra'))
      return () => undefined
    },
    // The brand as brand.list answers it, with its own platforms, when a test names them.
    onAccount: (listener: (a: unknown) => void) => {
      if (account.platforms)
        listener({
          brands: [
            {
              id: 'casa-vostra',
              orgId: 'mission-group',
              name: 'Casa Vostra',
              handle: '@casavostrasg',
              line: '',
              linked: account.platforms,
              timezone: 'Asia/Singapore',
              position: 0,
            },
          ],
          companies: [],
        })
      return () => undefined
    },
  }
})
vi.mock('next/navigation', () => ({
  usePathname: () => '/post/d1',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}))
vi.stubGlobal('matchMedia', () => ({
  matches: false,
  addEventListener() {},
  removeEventListener() {},
}))
beforeAll(() => {
  core.loaded = true
  Element.prototype.scrollIntoView = vi.fn()
  Element.prototype.scrollTo = vi.fn()
  HTMLMediaElement.prototype.play = vi.fn(() => Promise.resolve())
  HTMLMediaElement.prototype.pause = vi.fn()
})
// On the core the composer reads the brand's own clock: the tests set it to the demo's today.
const DEMO_CLOCK = new Date('2026-10-06T02:00:00Z')
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(DEMO_CLOCK)
  requests.length = 0
  account.platforms = undefined
})

// A draft of the demo's own (it sits on the calendar's weeks), one cover, on Instagram.
const draft: Post = {
  id: 'crust',
  format: 'carousel',
  hook: 'Friday is for the wood oven',
  images: ['/demo/crust.jpg'],
  stage: 'draft',
  slot: 'Thu 8 Oct, 18:00',
  slotShort: 'Thu, 18:00',
  channels: ['ig'],
}

afterEach(() => vi.useRealTimers())

/** The composer once the brand is listed, as the app opens it only after the account loads. */
function Listed({ children }: { children: React.ReactNode }) {
  const { brand, byId } = useBrand()
  if (account.platforms && !brand.platforms) return null
  return (
    <>
      {children}
      <span data-testid="channels">{byId('crust')?.channels?.join(' ')}</span>
    </>
  )
}

const open = (post?: Post) =>
  render(
    <BrandProvider>
      <Listed>
        <Composer post={post} />
      </Listed>
    </BrandProvider>,
  )

describe('planning a post on the core, with no account connected', () => {
  it("offers only the brand's own platforms, and keeps a post's others when it saves", async () => {
    account.platforms = ['tt', 'yt']
    open({ ...draft, format: 'reel', channels: ['tt', 'yt'] })
    const accounts = screen.getByRole('region', { name: 'Accounts' })
    expect(within(accounts).queryByRole('checkbox', { name: /Instagram/ })).toBeNull()
    expect(within(accounts).getByRole('checkbox', { name: /TikTok/ })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: /^Schedule/ })[0]!)
    })
    const patch = requests.find((r) => r.call === 'PATCH /brands/casa-vostra/posts/crust')
    expect((patch!.body as { channels: string[] }).channels).toEqual(['tt', 'yt'])
    // The calendar keeps them too, so a second opening in this session saves them again.
    expect(screen.getByTestId('channels').textContent).toBe('tt yt')
  })

  it('drops a platform the brand no longer uses, as the core refuses a save that names it', async () => {
    account.platforms = ['tt']
    open({ ...draft, format: 'reel', channels: ['tt', 'yt'] })
    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: /^Schedule/ })[0]!)
    })
    const patch = requests.find((r) => r.call === 'PATCH /brands/casa-vostra/posts/crust')
    expect((patch!.body as { channels: string[] }).channels).toEqual(['tt'])
  })

  it('says a brand with none of the platforms has nothing to plan on', () => {
    account.platforms = []
    open(draft)
    expect(screen.getByText('This brand has no Instagram, TikTok or Facebook.')).toBeTruthy()
    const accounts = screen.getByRole('region', { name: 'Accounts' })
    expect(within(accounts).queryByRole('button', { name: 'Not available yet' })).toBeNull()
  })

  it('picks the platforms and previews the post on the one picked', () => {
    open(draft)
    const accounts = screen.getByRole('region', { name: 'Accounts' })
    const tiktok = within(accounts).getByRole('checkbox', { name: /TikTok/ })
    expect(tiktok).toHaveAttribute('aria-checked', 'false')
    fireEvent.click(tiktok)
    expect(tiktok).toHaveAttribute('aria-checked', 'true')
    // The note stays: planned, not published.
    expect(within(accounts).getByRole('button', { name: 'Not available yet' })).toBeTruthy()
    const preview = screen.getByRole('region', { name: 'Preview' })
    expect(within(preview).getByRole('button', { name: 'Preview on Instagram' })).toBeTruthy()
    expect(within(preview).getByRole('button', { name: 'Preview on TikTok' })).toBeTruthy()
    expect(within(preview).queryByText(/preview shows once/)).toBeNull()
  })

  it('offers Schedule, not "Publish now": nothing goes out yet', () => {
    open(draft)
    expect(screen.queryByRole('radio', { name: 'Publish now' })).toBeNull()
    const send = screen.getAllByRole('button', { name: /^Schedule/ })[0]!
    expect(send).toHaveAttribute('aria-disabled', 'false')
    expect(send).toHaveTextContent(/^Schedule$/)
  })

  it('schedules on the calendar by marking it, and sends nothing to publish', async () => {
    open(draft)
    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: /^Schedule/ })[0]!)
    })
    const calls = requests.map((r) => r.call)
    // In the order the mark's rules need: the day, then the platforms, then Scheduled.
    const move = calls.indexOf('POST /brands/casa-vostra/posts/crust/move')
    const patch = calls.indexOf('PATCH /brands/casa-vostra/posts/crust')
    const mark = calls.indexOf('POST /brands/casa-vostra/posts/crust/mark')
    expect(move).toBeGreaterThanOrEqual(0)
    expect(patch).toBeGreaterThan(move)
    expect(mark).toBeGreaterThan(patch)
    expect((requests[patch]!.body as { channels: string[] }).channels).toEqual(['ig'])
    expect(requests[mark]!.body).toEqual({ stage: 'scheduled' })
    // No send: no job, so nothing at its time turns it into "Failed" or calls a platform.
    expect(calls.some((c) => c.endsWith('/send'))).toBe(false)
    // The result says plainly that it is planned and that nothing goes out yet.
    expect(screen.getByRole('heading', { name: 'Planned' })).toBeInTheDocument()
    expect(screen.getByText(/^Planned for .+\. Nothing is sent yet\.$/)).toBeInTheDocument()
    expect(screen.getAllByText('Planned only', { selector: 'span' }).length).toBeGreaterThan(0)
    expect(screen.queryByText(/It is on the calendar/)).toBeNull()
    expect(screen.queryByText('Scheduled')).toBeNull()
  })

  it('keeps a scheduled post from losing its last platform: Save and Schedule wait for one', () => {
    open({ ...draft, stage: 'scheduled' })
    const accounts = screen.getByRole('region', { name: 'Accounts' })
    fireEvent.click(within(accounts).getByRole('checkbox', { name: /Instagram/ }))
    expect(screen.getAllByRole('button', { name: 'Save' })[0]).toHaveAttribute(
      'aria-disabled',
      'true',
    )
    fireEvent.click(screen.getAllByRole('button', { name: 'Save' })[0]!)
    expect(requests).toEqual([])
    expect(screen.getAllByText('Pick an account.').length).toBeGreaterThan(0)
  })

  it('plans a failed post again instead of asking for a reconnect that cannot happen', async () => {
    account.platforms = ['ig', 'tt', 'yt']
    open({
      ...draft,
      stage: 'failed',
      channels: ['ig', 'tt', 'yt'],
      failedOn: 'ig',
      error: 'Instagram signed out.',
    })
    expect(screen.queryByRole('button', { name: /^Reconnect/ })).toBeNull()
    expect(screen.getByText('Pick a day and press Schedule to plan it again.')).toBeTruthy()
    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: /^Schedule/ })[0]!)
    })
    expect(requests.find((r) => r.call.endsWith('/mark'))?.body).toEqual({ stage: 'scheduled' })
    expect(requests.some((r) => r.call.endsWith('/send'))).toBe(false)
    // Planned again on all of its accounts, not narrowed to the one it failed on, and the calendar
    // holds the same, once each.
    const patch = requests.find((r) => r.call === 'PATCH /brands/casa-vostra/posts/crust')
    expect((patch!.body as { channels: string[] }).channels).toEqual(['ig', 'tt', 'yt'])
    expect(screen.getByTestId('channels').textContent).toBe('ig tt yt')
  })
})
