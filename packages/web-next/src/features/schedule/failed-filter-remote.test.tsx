import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import type * as Remote from '@/lib/remote'

import { ALL_STAGES } from './calendar-items'
import { setCalendarPlace } from './calendar-view'
import { BrandProvider, useBrand } from './posts-store'
import { SchedulePage } from './schedule-page'

// The failed filter on the core: the pasta draft on Tue 13 Oct failed. The demo's today is
// Tue 6 Oct, so the calendar opens on 5 – 11 Oct, a week with no failed post in it.
const core = vi.hoisted(() => ({ loaded: false }))
vi.mock('@/lib/remote', async (original) => {
  const { demoAsCore } = await import('@/test-core-state')
  return {
    ...(await original<typeof Remote>()),
    remote: true,
    request: async () => ({}),
    onState: (hydrate: (id: string, state: unknown) => void) => {
      if (!core.loaded) return () => undefined
      const state = demoAsCore('casa-vostra')
      const pasta = state.posts.find((p) => p.id === 'pasta')!
      pasta.stage = 'failed'
      pasta.jobs = [{ channel: 'ig', status: 'failed', error: 'Instagram refused it' }]
      hydrate('casa-vostra', state)
      return () => undefined
    },
  }
})
vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
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

function Loaded({ children }: { children: React.ReactNode }) {
  return useBrand().posts.length > 0 ? children : null
}
const show = () =>
  render(
    <BrandProvider>
      <Loaded>
        <SchedulePage />
      </Loaded>
    </BrandProvider>,
  )
const titles = () => screen.getAllByRole('heading', { level: 1 }).map((h) => h.textContent)
const pill = () => screen.getAllByRole('button', { name: /^1 failed/ })[0]!

describe('the failed filter on the core', () => {
  it('goes to the failed post’s week when the week in view has none', () => {
    show()
    act(() => setCalendarPlace({ view: 'week', offset: 0, week: 0, day: 1, stages: ALL_STAGES }))
    expect(titles()).toContain('5 – 11 Oct')
    fireEvent.click(pill())
    expect(titles()).toContain('12 – 18 Oct')
    expect(pill()).toHaveAttribute('aria-pressed', 'true')
    // Pressed again, everything shows and the calendar stays where it went.
    fireEvent.click(pill())
    expect(titles()).toContain('12 – 18 Oct')
  })

  it('goes to the failed post’s day in the day view', () => {
    show()
    act(() => setCalendarPlace({ view: 'day', offset: 0, week: 0, day: 1, stages: ALL_STAGES }))
    fireEvent.click(pill())
    expect(titles()).toContain('Tue 13 Oct')
  })

  it('stays where it is when the failed post is in view already', () => {
    show()
    act(() => setCalendarPlace({ view: 'month', offset: 0, week: 0, day: 1, stages: ALL_STAGES }))
    fireEvent.click(pill())
    expect(titles()).toContain('October')
  })
})
