import { act, cleanup, render, screen } from '@testing-library/react'
import * as React from 'react'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { BrandProvider, useBrand } from '@/features/schedule/posts-store'
import type * as Remote from '@/lib/remote'

import { shotOf } from './model'
import { PhoneMock } from './phone-mocks'

// On the core the brand was made with the handle @casavostrasg, and its Instagram account and
// Facebook Page were linked later under other names: the preview shows where the post goes.
const core = vi.hoisted(() => ({
  loaded: false,
  linked: true,
  waiting: [] as Array<(id: string, state: unknown) => void>,
}))
vi.mock('@/lib/remote', async (original) => {
  const { demoAsCore } = await import('@/test-core-state')
  const state = () => ({
    ...demoAsCore('casa-vostra'),
    ...(core.linked
      ? {
          instagram: { name: '@testbrandbase', accountId: '178414', via: 'meta' },
          facebook: { name: 'Test Brand Base Page', accountId: '1000', via: 'meta' },
        }
      : {}),
  })
  return {
    ...(await original<typeof Remote>()),
    remote: true,
    request: async () => ({}),
    onState: (hydrate: (id: string, state: unknown) => void) => {
      // The accounts' store listens as its module loads, before the test begins: it hears the
      // state once the test hands it in.
      core.waiting.push(hydrate)
      if (core.loaded) hydrate('casa-vostra', state())
      return () => undefined
    },
    state,
  }
})
vi.mock('next/navigation', () => ({
  usePathname: () => '/post/new',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}))
vi.stubGlobal('matchMedia', () => ({
  matches: false,
  addEventListener() {},
  removeEventListener() {},
}))
/** Hands the brand's state, as it now is, to every store that listens. */
const hydrateAll = async () => {
  const { state } = (await import('@/lib/remote')) as unknown as { state: () => unknown }
  act(() => core.waiting.forEach((hydrate) => hydrate('casa-vostra', state())))
}
beforeAll(async () => {
  core.loaded = true
  await hydrateAll()
  HTMLMediaElement.prototype.play = vi.fn(() => Promise.resolve())
  HTMLMediaElement.prototype.pause = vi.fn()
})

function Loaded({ children }: { children: React.ReactNode }) {
  return useBrand().posts.length > 0 ? children : null
}
const photo = [shotOf('/demo/crust.jpg')]
const mock = (channel: 'ig' | 'fb', format: 'carousel' | 'story') =>
  render(
    <BrandProvider>
      <Loaded>
        <PhoneMock channel={channel} format={format} shots={photo} text="Tonight" />
      </Loaded>
    </BrandProvider>,
  )

describe('a preview on the core', () => {
  it('names the linked Instagram account and Facebook Page, never the typed handle', () => {
    for (const format of ['carousel', 'story'] as const) {
      mock('ig', format)
      expect(screen.getAllByText(/testbrandbase/).length).toBeGreaterThan(0)
      expect(screen.queryByText(/casavostrasg/)).toBeNull()
      // One @ only, however the account's name was stored.
      expect(screen.queryByText(/@@/)).toBeNull()
      cleanup()
      mock('fb', format)
      expect(screen.getAllByText('Test Brand Base Page').length).toBeGreaterThan(0)
      cleanup()
    }
  })

  it('keeps the brand’s own handle and name with nothing linked', async () => {
    core.linked = false
    await hydrateAll()
    try {
      mock('ig', 'carousel')
      expect(screen.getAllByText(/casavostrasg/).length).toBeGreaterThan(0)
      cleanup()
      mock('fb', 'carousel')
      expect(screen.getAllByText('Casa Vostra').length).toBeGreaterThan(0)
    } finally {
      core.linked = true
      await hydrateAll()
    }
  })
})
