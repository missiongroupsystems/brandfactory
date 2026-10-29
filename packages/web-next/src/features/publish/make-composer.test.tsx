import { act, fireEvent, render, screen } from '@testing-library/react'
import * as React from 'react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { POSTS } from '@/data/demo'
import { DEMO_TODAY, setToday } from '@/lib/dates'
import { resetConnections } from '@/features/connections/connections-store'
import { resetIdeas } from '@/features/ideate/ideas-store'
import { BrandProvider, useBrand } from '@/features/schedule/posts-store'
import type * as Remote from '@/lib/remote'

import { Composer } from './composer'
import { saveTikTokDefault } from './use-publish-draft'

// The composer on the core once the server posts to Instagram and Facebook through Make: TikTok
// stays planned only. The accounts are the demo's (the stores listen before the state comes in).
let answer: (refusal: string | null) => void = () => undefined
const sent = vi.fn(
  (_brandId: string, _send: () => Promise<unknown>) =>
    new Promise<string | null>((resolve) => (answer = resolve)),
)
const requests: Array<{ call: string; body?: unknown }> = []
const core = vi.hoisted(() => ({ loaded: false }))
vi.mock('@/lib/remote', async (original) => {
  const { demoAsCore } = await import('@/test-core-state')
  return {
    ...(await original<typeof Remote>()),
    remote: true,
    platformOn: (p: string) => p === 'instagram' || p === 'facebook',
    sent: (brandId: string, send: () => Promise<unknown>) => sent(brandId, send),
    request: async (method: string, path: string, body?: unknown) => {
      requests.push({ call: `${method} ${path}`, body })
      return {}
    },
    push: vi.fn(),
    // A file goes to storage and comes back as its stable address.
    upload: async (_brandId: string, file: File) => `https://media.test/${file.name}#photo`,
    onState: (hydrate: (id: string, state: unknown) => void) => {
      if (core.loaded) hydrate('casa-vostra', demoAsCore('casa-vostra'))
      return () => undefined
    },
  }
})
vi.mock('next/navigation', () => ({
  usePathname: () => '/post/ravioli',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}))
vi.stubGlobal('matchMedia', () => ({
  matches: false,
  addEventListener() {},
  removeEventListener() {},
}))
beforeAll(() => {
  core.loaded = true
  URL.createObjectURL = () => `blob:${Math.random()}`
  URL.revokeObjectURL = () => undefined
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
  resetConnections()
  resetIdeas()
  sent.mockClear()
  requests.length = 0
})

function Loaded({ children }: { children: React.ReactNode }) {
  return useBrand().posts.length > 0 ? children : null
}

const ravioli = POSTS.find((p) => p.id === 'ravioli')!
const open = () =>
  render(
    <BrandProvider>
      <Loaded>
        <Composer post={ravioli} />
      </Loaded>
    </BrandProvider>,
  )
afterEach(() => vi.useRealTimers())

/** Moves the post to tomorrow and presses Reschedule: a save that keeps the day sends nothing. */
function reschedule() {
  fireEvent.click(screen.getByRole('button', { name: /^\w{3} \d+ \w{3}, \d\d:\d\d$/ }))
  fireEvent.click(screen.getByRole('button', { name: /^Tomorrow / }))
  fireEvent.click(screen.getAllByRole('button', { name: /^Reschedule/ })[0]!)
}

/** Ticks an account on, or off. */
const tick = (name: string, on = true) => {
  const box = screen.getAllByRole('checkbox', { name: new RegExp(name) })[0]!
  if ((box.getAttribute('aria-checked') === 'true') !== on) fireEvent.click(box)
}

async function land() {
  await sent.mock.calls.at(-1)![1]()
  await act(async () => answer(null))
}

describe('the composer with Instagram through Make', () => {
  it('sends only Instagram, keeps TikTok planned on the post, and never offers Publish now', async () => {
    open()
    tick('Instagram')
    tick('TikTok')
    tick('Facebook', false)
    expect(screen.queryByRole('radio', { name: 'Publish now' })).toBeNull()
    expect(screen.queryByText('Publish now')).toBeNull()
    reschedule()
    await land()
    const patch = requests.find((r) => r.call === 'PATCH /brands/casa-vostra/posts/ravioli')
    expect((patch!.body as { channels: string[] }).channels).toEqual(['ig', 'tt'])
    expect(requests.find((r) => r.call.endsWith('/send'))?.body).toEqual({
      when: 'slot',
      channels: ['ig'],
    })
    expect(requests.some((r) => r.call.endsWith('/mark'))).toBe(false)
  })

  it('plans a Story without sending it, and says Make cannot post Stories', async () => {
    // A new Story: an existing post keeps the format it has.
    render(
      <BrandProvider>
        <Loaded>
          <Composer />
        </Loaded>
      </BrandProvider>,
    )
    fireEvent.click(screen.getAllByRole('radio', { name: 'Story' })[0]!)
    fireEvent.change(document.querySelector<HTMLInputElement>('input[type="file"]')!, {
      target: { files: [new File(['x'], 'story.jpg', { type: 'image/jpeg' })] },
    })
    await act(async () => undefined)
    tick('Instagram')
    tick('TikTok', false)
    tick('Facebook', false)
    expect(screen.getAllByText('Not available yet').length).toBeGreaterThan(0)
    fireEvent.click(screen.getAllByRole('button', { name: /^Schedule/ })[0]!)
    await land()
    expect(requests.some((r) => r.call.endsWith('/send'))).toBe(false)
    expect(requests.find((r) => r.call.endsWith('/mark'))?.body).toEqual({ stage: 'scheduled' })
  })

  it('starts a new post on the accounts that post, with TikTok offered and no library', () => {
    render(
      <BrandProvider>
        <Loaded>
          <Composer />
        </Loaded>
      </BrandProvider>,
    )
    const on = (name: string) =>
      screen.getAllByRole('checkbox', { name: new RegExp(name) })[0]!.getAttribute('aria-checked')
    expect(on('Instagram')).toBe('true')
    expect(on('Facebook')).toBe('true')
    expect(on('TikTok')).toBe('false')
    // A photo post, not a reel: nothing to fix before a photo goes in.
    expect(screen.getAllByRole('radio', { name: 'Post' })[0]).toHaveAttribute(
      'aria-checked',
      'true',
    )
    expect(screen.queryByRole('button', { name: 'Library' })).toBeNull()
    expect(screen.queryByRole('button', { name: /^Add .+\.(jpg|mp4)$/ })).toBeNull()
  })

  it('starts today at the best time, or tomorrow once today has gone', () => {
    setToday('2026-10-30')
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      // 17:00 in Singapore: 18:00 is still ahead.
      vi.setSystemTime(new Date('2026-10-30T09:00:00Z'))
      const { unmount } = render(
        <BrandProvider>
          <Loaded>
            <Composer />
          </Loaded>
        </BrandProvider>,
      )
      expect(screen.getByRole('button', { name: /^Fri 30 Oct, 18:00/ })).toBeInTheDocument()
      unmount()
      // 23:30: nothing is left of today.
      vi.setSystemTime(new Date('2026-10-30T15:30:00Z'))
      render(
        <BrandProvider>
          <Loaded>
            <Composer />
          </Loaded>
        </BrandProvider>,
      )
      expect(screen.getByRole('button', { name: /^Sat 31 Oct, 18:00/ })).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
      setToday(DEMO_TODAY)
    }
  })

  it('opens More options and the TikTok row when TikTok is ticked with no answer saved', () => {
    saveTikTokDefault('casa-vostra', {
      privacy: null,
      interactions: { comments: true, duet: false, stitch: false },
      promo: { on: false, own: false, paid: false },
      sound: 'own',
    })
    render(
      <BrandProvider>
        <Loaded>
          <Composer />
        </Loaded>
      </BrandProvider>,
    )
    const more = () =>
      screen
        .getAllByRole('button', { name: /^More options/ })
        .find((b) => b.hasAttribute('aria-expanded'))!
    expect(more()).toHaveAttribute('aria-expanded', 'false')
    tick('TikTok')
    expect(more()).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('button', { name: /Who can watch\?/ })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
  })
})
