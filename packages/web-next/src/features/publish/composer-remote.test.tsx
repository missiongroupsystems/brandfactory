import { act, fireEvent, render, screen } from '@testing-library/react'
import * as React from 'react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { POSTS } from '@/data/demo'
import { resetConnections } from '@/features/connections/connections-store'
import { resetIdeas } from '@/features/ideate/ideas-store'
import { BrandProvider, useBrand } from '@/features/schedule/posts-store'
import { DEMO_TODAY, setToday } from '@/lib/dates'
import type * as NotAvailable from '@/features/connections/not-available'
import type * as Remote from '@/lib/remote'

import { Composer } from './composer'

// The composer on the API: `sent` stands in for the server's answer, which the test hands back
// when it chooses.
let answer: (refusal: string | null) => void = () => undefined
const sent = vi.fn(
  (_brandId: string, _send: () => Promise<unknown>) =>
    new Promise<string | null>((resolve) => (answer = resolve)),
)
// The requests a change would make, as the server would see them.
const requests: string[] = []
// The brand's state, as the core sends it, once the test begins.
const core = vi.hoisted(() => ({ loaded: false }))
vi.mock('@/lib/remote', async (original) => {
  const { demoAsCore } = await import('@/test-core-state')
  return {
    ...(await original<typeof Remote>()),
    remote: true,
    sent: (brandId: string, send: () => Promise<unknown>) => sent(brandId, send),
    request: async (method: string, path: string, body?: { id?: string }) => {
      requests.push(`${method} ${path}${body?.id ? ` ${body.id}` : ''}`)
      return {}
    },
    push: vi.fn(),
    // The demo brand's posts, as the core sends them: on the core no store starts with the demo's.
    onState: (hydrate: (id: string, state: unknown) => void) => {
      // Once the modules are in: the stores that listen from their first line hear nothing.
      if (core.loaded) hydrate('casa-vostra', demoAsCore('casa-vostra'))
      return () => undefined
    },
  }
})
// The day the platforms are set up on our side: their accounts connect, and posts can go out.
vi.mock('@/features/connections/not-available', async (original) => ({
  ...(await original<typeof NotAvailable>()),
  notAvailable: () => false,
}))
vi.mock('next/navigation', () => ({
  usePathname: () => '/post/crust',
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
beforeEach(() => {
  resetConnections()
  resetIdeas()
  sent.mockClear()
  requests.length = 0
})

/** Runs the change the composer last handed to the queue, and answers it. */
async function land(refusal: string | null) {
  await sent.mock.calls.at(-1)![1]()
  await act(async () => answer(refusal))
}

/** The page once the brand's state is in, as the app opens it only after the brand loads. */
function Loaded({ children }: { children: React.ReactNode }) {
  return useBrand().posts.length > 0 ? children : null
}

const crust = POSTS.find((p) => p.id === 'crust')!
const schedule = () => screen.getAllByRole('button', { name: /^Schedule on/ })[0]!

describe('the composer on the API', () => {
  it('says done only once the server has stored the post', async () => {
    render(
      <BrandProvider>
        <Loaded>
          <Composer post={crust} />
        </Loaded>
      </BrandProvider>,
    )
    fireEvent.click(schedule())
    expect(sent).toHaveBeenCalledTimes(1)
    // Waiting: the button says so, and a second press sends nothing more.
    expect(screen.getAllByText('Sending…').length).toBeGreaterThan(0)
    fireEvent.click(screen.getAllByText('Sending…')[0]!)
    expect(sent).toHaveBeenCalledTimes(1)
    expect(screen.queryByText(/It is on the calendar/)).toBeNull()
    await act(async () => answer(null))
    expect(screen.getByText(/It is on the calendar/)).toBeTruthy()
  })

  it('stays open with everything in it when the server refuses', async () => {
    render(
      <BrandProvider>
        <Loaded>
          <Composer post={crust} />
        </Loaded>
      </BrandProvider>,
    )
    fireEvent.click(schedule())
    await act(async () => answer('A story is already on that day.'))
    expect(screen.queryByText(/It is on the calendar/)).toBeNull()
    // The same post, ready to send again.
    expect(schedule()).toBeTruthy()
    fireEvent.click(schedule())
    expect(sent).toHaveBeenCalledTimes(2)
  })

  it('asks for a day ahead when a draft sits on a day that has passed', () => {
    const pasta = POSTS.find((p) => p.id === 'pasta')!
    // The pasta draft sits on Tue 13 Oct; a week later, that day has passed.
    setToday('2026-10-20')
    try {
      render(
        <BrandProvider>
          <Loaded>
            <Composer post={pasta} />
          </Loaded>
        </BrandProvider>,
      )
      expect(screen.getAllByText('Pick a day ahead.').length).toBeGreaterThan(0)
      fireEvent.click(schedule())
      expect(sent).not.toHaveBeenCalled()
    } finally {
      setToday(DEMO_TODAY)
    }
  })

  it('makes a new post again under the same id when its first save was refused', async () => {
    render(
      <BrandProvider>
        <Loaded>
          <Composer />
        </Loaded>
      </BrandProvider>,
    )
    const save = () => screen.getAllByRole('button', { name: 'Save draft' })[0]!
    fireEvent.click(save())
    await land('The server is busy.')
    const first = requests.find((r) => r.startsWith('POST /brands/casa-vostra/posts '))!
    requests.length = 0
    // Refused, so the next save makes it again: the same id, never a second post.
    fireEvent.click(save())
    await land(null)
    expect(requests).toContain(first)
    // Stored, so from now on a save moves it.
    expect(screen.getByText('Saved as a draft on the calendar')).toBeTruthy()
  })
})
