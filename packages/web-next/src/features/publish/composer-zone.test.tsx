import { fireEvent, render, screen, within } from '@testing-library/react'
import * as React from 'react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { BrandProvider, useBrand } from '@/features/schedule/posts-store'
import { DEMO_TODAY, setToday } from '@/lib/dates'
import type * as Remote from '@/lib/remote'

import { Composer } from './composer'

// A brand in Sydney on the core, opened just after its midnight while the app's today, from the
// last brand loaded, still says the day before: the post must start on the brand's own day.
const core = vi.hoisted(() => ({ loaded: false }))
vi.mock('@/lib/remote', async (original) => {
  const { demoAsCore } = await import('@/test-core-state')
  return {
    ...(await original<typeof Remote>()),
    remote: true,
    timezoneOf: () => 'Australia/Sydney',
    request: async () => ({}),
    push: vi.fn(),
    onState: (hydrate: (id: string, state: unknown) => void) => {
      if (core.loaded) hydrate('casa-vostra', demoAsCore('casa-vostra'))
      return () => undefined
    },
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
beforeAll(() => {
  core.loaded = true
  Element.prototype.scrollIntoView = vi.fn()
  Element.prototype.scrollTo = vi.fn()
})
afterEach(() => {
  vi.useRealTimers()
  setToday(DEMO_TODAY)
})

function Loaded({ children }: { children: React.ReactNode }) {
  return useBrand().posts.length > 0 ? children : null
}

describe('a new post for a brand in another timezone', () => {
  it('starts on the brand’s own today, never on a day that has gone there', () => {
    // 01:30 on Sat 31 Oct in Sydney (UTC+11); the app's today still says Fri 30 Oct.
    setToday('2026-10-30')
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-30T14:30:00Z'))
    render(
      <BrandProvider>
        <Loaded>
          <Composer />
        </Loaded>
      </BrandProvider>,
    )
    expect(screen.getByRole('button', { name: /^Sat 31 Oct, 18:00/ })).toBeInTheDocument()
    expect(screen.queryByText('Pick a day ahead.')).toBeNull()
    expect(screen.queryByText('Pick a time ahead.')).toBeNull()
    // The grid greys by the brand's clock too: its today is open, the day before is not.
    fireEvent.click(screen.getByRole('button', { name: /^Sat 31 Oct, 18:00/ }))
    const grid = screen.getByRole('dialog', { name: 'When' })
    expect(within(grid).getAllByRole('button', { name: '31' }).at(-1)).not.toBeDisabled()
    within(grid)
      .getAllByRole('button', { name: '30' })
      .forEach((b) => expect(b).toBeDisabled())
  })
})
