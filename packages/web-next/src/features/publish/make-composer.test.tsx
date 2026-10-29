import { act, fireEvent, render, screen } from '@testing-library/react'
import * as React from 'react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { POSTS } from '@/data/demo'
import { resetConnections } from '@/features/connections/connections-store'
import { resetIdeas } from '@/features/ideate/ideas-store'
import { BrandProvider, useBrand } from '@/features/schedule/posts-store'
import type * as Remote from '@/lib/remote'

import { Composer } from './composer'

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
    fireEvent.click(screen.getAllByRole('button', { name: /^Schedule on/ })[0]!)
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
    open()
    tick('Instagram')
    tick('TikTok', false)
    tick('Facebook', false)
    fireEvent.click(screen.getAllByRole('radio', { name: 'Story' })[0]!)
    expect(screen.getAllByText('Not available yet').length).toBeGreaterThan(0)
    fireEvent.click(screen.getAllByRole('button', { name: /^Schedule/ })[0]!)
    await land()
    expect(requests.some((r) => r.call.endsWith('/send'))).toBe(false)
    expect(requests.find((r) => r.call.endsWith('/mark'))?.body).toEqual({ stage: 'scheduled' })
  })
})
