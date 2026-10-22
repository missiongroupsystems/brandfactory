import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type * as Remote from '@/lib/remote'

import { ALL_STAGES } from './calendar-items'
import { DayView } from './day-view'
import { BrandProvider } from './posts-store'

// On the core. Production's casa-vostra has the demo brand's id, so a lookup by id alone finds
// the demo's invented best hour.
vi.mock('@/lib/remote', async (original) => ({
  ...(await original<typeof Remote>()),
  remote: true,
  // The original reads the original flag: on the core it answers nothing.
  demoOf: () => undefined,
  onState: () => () => undefined,
  onAccount: () => () => undefined,
}))
vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: vi.fn() }),
}))

describe('the day view on the core', () => {
  it('marks no best time: no brand has insights yet', () => {
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
    expect(screen.queryByText('Best time to post')).toBeNull()
  })
})
