import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type * as Remote from '@/lib/remote'

import { ALL_STAGES } from './calendar-items'
import { DayView } from './day-view'
import { BrandProvider } from './posts-store'

// The brand's state as the core sends it; null sends none.
const core = vi.hoisted(() => ({ state: null as null | Record<string, unknown> }))

// On the core. Production's casa-vostra has the demo brand's id, so a lookup by id alone finds
// the demo's invented best hour.
vi.mock('@/lib/remote', async (original) => ({
  ...(await original<typeof Remote>()),
  remote: true,
  // The original reads the original flag: on the core it answers nothing.
  demoOf: () => undefined,
  onState: (hydrate: (id: string, state: unknown) => void) => {
    if (core.state) hydrate('casa-vostra', core.state)
    return () => undefined
  },
  onAccount: () => () => undefined,
}))
vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: vi.fn() }),
}))

afterEach(() => {
  core.state = null
})

const dayView = () =>
  render(
    <BrandProvider>
      <DayView
        day={{ date: '2026-10-23', story: { kind: 'open', draftsReady: false } }}
        events={[]}
        stages={ALL_STAGES}
        onOpenPost={vi.fn()}
        onNewPost={vi.fn()}
        onOpenStories={vi.fn()}
      />
    </BrandProvider>,
  )

/** Imported posts that went out at a time, with numbers. */
const out = (n: number, time: string, likes: number) =>
  Array.from({ length: n }, (_, i) => ({
    id: `${time}-${i}`,
    format: 'reel',
    hook: 'x',
    day: '2026-09-1' + (i % 7),
    time,
    channels: ['ig'],
    media: [],
    fromIdea: null,
    stage: 'posted',
    jobs: [],
    caption: '',
    draft: {},
    metrics: { likes },
  }))

describe('the day view on the core', () => {
  it('marks no best time while the brand has too few posts with numbers', () => {
    core.state = { brand: { id: 'casa-vostra' }, posts: out(5, '12:00', 50), ideas: [] }
    dayView()
    expect(screen.queryByText('Best time to post')).toBeNull()
  })

  it('shades the best hour the brand’s own posts show', () => {
    core.state = {
      brand: { id: 'casa-vostra' },
      posts: [...out(12, '12:00', 90), ...out(10, '18:00', 10)],
      ideas: [],
    }
    dayView()
    const band = screen.getByText('Best time to post').parentElement!
    // The hours start at 07:00, 72px each: the band sits on noon's row, not the demo's 18:00.
    expect(band.style.top).toBe(`${(12 - 7) * 72}px`)
  })
})
