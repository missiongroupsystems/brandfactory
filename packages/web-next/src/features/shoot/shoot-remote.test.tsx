import { fireEvent, render, renderHook, screen } from '@testing-library/react'
import * as React from 'react'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import type { BrandId } from '@/data/brands'
import { WEEKS } from '@/data/demo'
import { PAST_PLACES } from '@/data/suggestions'
import { BrandProvider, useBrand } from '@/features/schedule/posts-store'
import type * as Remote from '@/lib/remote'

import { NewShootForm } from './new-shoot'
import { Details, ShootPage } from './shoot-page'
import { planShoot, useShoots } from './shoots-store'

// On the core, as production runs: four brands the demo's tables do not hold, and casa-vostra
// and temper, which share ids with demo brands whose outlets and crew are invented.
vi.mock('@/lib/remote', async (original) => ({
  ...(await original<typeof Remote>()),
  remote: true,
  // The original reads the original flag: on the core it answers nothing.
  demoOf: () => undefined,
  request: async () => ({}),
  push: vi.fn(),
  onState: () => () => undefined,
  onAccount: (listener: (account: unknown) => void) => {
    listener({
      brands: [
        {
          id: 'chin-mee-chin',
          orgId: 'mission-group',
          name: 'Chin Mee Chin',
          handle: '@chinmeechin.sg',
          line: '',
          linked: ['ig'],
          timezone: 'Asia/Singapore',
          position: 1,
        },
      ],
      companies: [],
    })
    return () => undefined
  },
}))
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
  Element.prototype.scrollIntoView = vi.fn()
})

/** Switches the provider to a brand the core listed. */
function On({ id, children }: { id: string; children: React.ReactNode }) {
  const { brand, setBrandId } = useBrand()
  React.useEffect(() => setBrandId(id as BrandId), [setBrandId, id])
  return (brand.id as string) === id ? <>{children}</> : null
}

describe('a shoot on the core', () => {
  it('opens New shoot for a brand the demo does not hold, with no place filled in', () => {
    render(
      <BrandProvider>
        <On id="chin-mee-chin">
          <NewShootForm />
        </On>
      </BrandProvider>,
    )
    expect(screen.getByLabelText('Address')).toHaveValue('')
  })

  it("plans a shoot from ideas with none of the demo's crew or outlets", () => {
    const id = 'casa-vostra' as BrandId
    const shootId = planShoot(id, WEEKS, [])
    const shoot = renderHook(() => useShoots(id)).result.current.find((s) => s.id === shootId)!
    expect(shoot.crew).toEqual([])
    expect(shoot.place).toBe('')
  })

  it("offers none of the demo's past places on the call sheet", () => {
    const id = planShoot('casa-vostra' as BrandId, WEEKS, [])
    render(
      <BrandProvider>
        <Sheet id={id} />
      </BrandProvider>,
    )
    fireEvent.focus(screen.getByLabelText('Address'))
    // The demo's outlets are offered as "Outlet"; its earlier places as "Past shoot".
    expect(screen.queryByText('Outlet')).toBeNull()
    for (const place of PAST_PLACES['casa-vostra']) expect(screen.queryByText(place)).toBeNull()
  })
})

describe('a call sheet on the core with no place and nobody yet', () => {
  it('says only its hours, and claims no invites sent', () => {
    const id = planShoot('casa-vostra' as BrandId, WEEKS, [])
    render(
      <BrandProvider>
        <ShootPage id={id} />
      </BrandProvider>,
    )
    expect(screen.getByText('12:00–17:00').parentElement!.textContent).toBe('12:00–17:00')
    expect(screen.queryByText('Invites sent')).toBeNull()
  })
})

function Sheet({ id }: { id: string }) {
  const shoot = useShoots('casa-vostra' as BrandId).find((s) => s.id === id)!
  return <Details shoot={shoot} edit={() => undefined} />
}
