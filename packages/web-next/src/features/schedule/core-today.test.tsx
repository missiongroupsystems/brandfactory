import { render, screen } from '@testing-library/react'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import type * as Shoots from '@/features/shoot/shoots-store'

import type * as Store from './posts-store'
import type * as Page from './schedule-page'

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))
vi.stubGlobal('matchMedia', () => ({
  matches: false,
  addEventListener() {},
  removeEventListener() {},
}))

// On the core, before the brand's state arrives or when the core cannot be reached. The device
// clock says Fri 23 Oct 2026, 01:30 in Singapore, which is still Thu 22 Oct in UTC: the week is
// Singapore's. The demo's today is Tue 6 Oct, so its week is 5 – 11 Oct.
let store: typeof Store
let page: typeof Page
let shoots: typeof Shoots
beforeAll(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-22T17:30:00Z'))
  vi.stubEnv('NEXT_PUBLIC_CORE_URL', 'https://core.test')
  vi.stubGlobal('fetch', () => new Promise(() => undefined))
  Element.prototype.scrollIntoView = vi.fn()
  Element.prototype.scrollTo = vi.fn()
  vi.resetModules()
  store = await import('./posts-store')
  page = await import('./schedule-page')
  shoots = await import('@/features/shoot/shoots-store')
})
afterAll(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('the calendar on the core before the brand loads', () => {
  it("opens on this week by the device's clock in Singapore, with no demo posts", () => {
    let seen: ReturnType<typeof Store.useBrand> | undefined
    let shot: unknown[] = []
    function Probe() {
      seen = store.useBrand()
      shot = shoots.useShoots(seen.brand.id)
      return null
    }
    render(
      <store.BrandProvider>
        <Probe />
        <page.SchedulePage />
      </store.BrandProvider>,
    )
    const titles = screen.getAllByRole('heading', { level: 1 }).map((h) => h.textContent)
    expect(titles).toContain('19 – 25 Oct')
    expect(titles.join()).not.toContain('5 – 11 Oct')
    expect(seen!.posts).toEqual([])
    expect(shot).toEqual([])
    const days = seen!.weeks.flatMap((w) => w.days)
    expect(days.find((d) => d.today)?.date).toBe('2026-10-23')
    expect(days.some((d) => d.feed !== undefined || d.story.kind !== 'open')).toBe(false)
  })
})
