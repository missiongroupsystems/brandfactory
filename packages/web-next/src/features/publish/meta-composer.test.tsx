import { act, fireEvent, render, screen } from '@testing-library/react'
import * as React from 'react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { resetConnections } from '@/features/connections/connections-store'
import { resetIdeas } from '@/features/ideate/ideas-store'
import { BrandProvider, useBrand } from '@/features/schedule/posts-store'
import type * as Remote from '@/lib/remote'

import { Composer } from './composer'

// The composer on the core with our own Meta app: Instagram linked by its sign-in posts Stories;
// Facebook, still linked through Make, posts none.
let answer: (refusal: string | null) => void = () => undefined
const sent = vi.fn(
  (_brandId: string, _send: () => Promise<unknown>) =>
    new Promise<string | null>((resolve) => (answer = resolve)),
)
const requests: Array<{ call: string; body?: unknown }> = []
const core = vi.hoisted(() => ({
  loaded: false,
  waiting: [] as Array<(id: string, state: unknown) => void>,
  state: (() => ({})) as () => unknown,
}))
vi.mock('@/lib/remote', async (original) => {
  const { demoAsCore } = await import('@/test-core-state')
  core.state = () => ({
    ...demoAsCore('casa-vostra'),
    instagram: { name: 'casavostra', accountId: '17841400000000001', via: 'meta' },
    facebook: { name: 'Casa Vostra', accountId: '100000000000001', via: 'make' },
  })
  return {
    ...(await original<typeof Remote>()),
    remote: true,
    platformOn: (p: string) => ['instagram', 'facebook', 'meta'].includes(p),
    sent: (brandId: string, send: () => Promise<unknown>) => sent(brandId, send),
    request: async (method: string, path: string, body?: unknown) => {
      requests.push({ call: `${method} ${path}`, body })
      return {}
    },
    push: vi.fn(),
    // A file goes to storage and comes back as its stable address.
    upload: async (_brandId: string, file: File) => `https://media.test/${file.name}#photo`,
    onState: (hydrate: (id: string, state: unknown) => void) => {
      if (core.loaded) hydrate('casa-vostra', core.state())
      // A store that listens before the state comes in (the accounts' store) gets it then.
      else core.waiting.push(hydrate)
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
  for (const hydrate of core.waiting) hydrate('casa-vostra', core.state())
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

afterEach(() => vi.useRealTimers())

/** Ticks an account on, or off. */
const tick = (name: string, on = true) => {
  const box = screen.getAllByRole('checkbox', { name: new RegExp(name) })[0]!
  if ((box.getAttribute('aria-checked') === 'true') !== on) fireEvent.click(box)
}

async function land() {
  await sent.mock.calls.at(-1)![1]()
  await act(async () => answer(null))
}

describe('the composer with Instagram through our own Meta app', () => {
  it('schedules a Story to Instagram, and only plans it on Facebook, which Make posts no Story to', async () => {
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
    // Facebook, ticked from the last post, shows so it can be unticked: Make posts no Story.
    expect(screen.getAllByRole('checkbox', { name: /Facebook/ }).length).toBeGreaterThan(0)
    expect(screen.queryByText('Not available yet')).toBeNull()
    fireEvent.click(screen.getAllByRole('button', { name: /^Schedule/ })[0]!)
    await land()
    expect(requests.find((r) => r.call.endsWith('/send'))?.body).toEqual({
      when: 'slot',
      channels: ['ig'],
    })
    expect(requests.some((r) => r.call.endsWith('/mark'))).toBe(false)
    // Facebook stays on the post as planned.
    const patch = requests.find((r) => r.call.startsWith('PATCH '))
    expect((patch!.body as { channels: string[] }).channels).toEqual(['ig', 'fb'])
  })
})
