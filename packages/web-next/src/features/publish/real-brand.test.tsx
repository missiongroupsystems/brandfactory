import { fireEvent, render, screen, within } from '@testing-library/react'
import * as React from 'react'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { connect } from '@/features/connections/connections-store'
import { BrandProvider, useBrand } from '@/features/schedule/posts-store'
import type * as Remote from '@/lib/remote'

import { Composer } from './composer'

// The composer on the core for a brand the demo's data does not hold, as four of the six
// production brands are: the core lists it, and the static tables have no row for it.
vi.mock('@/lib/remote', async (original) => ({
  ...(await original<typeof Remote>()),
  remote: true,
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
          linked: ['ig', 'tt'],
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
  usePathname: () => '/post/new',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}))
vi.stubGlobal('matchMedia', () => ({
  matches: false,
  addEventListener() {},
  removeEventListener() {},
}))
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn()
  Element.prototype.scrollTo = vi.fn()
})

/** Switches the provider to the real brand once the core has listed it. */
function RealBrand({ children }: { children: React.ReactNode }) {
  const { brand, setBrandId } = useBrand()
  React.useEffect(
    () => setBrandId('chin-mee-chin' as Parameters<typeof setBrandId>[0]),
    [setBrandId],
  )
  return (brand.id as string) === 'chin-mee-chin' ? <>{children}</> : null
}

describe('the composer for a brand outside the demo', () => {
  it('opens with no made-up location, and its linked Drive opens empty', () => {
    connect('chin-mee-chin' as Parameters<typeof connect>[0], 'drive')
    render(
      <BrandProvider>
        <RealBrand>
          <Composer start={{ format: 'carousel' }} />
        </RealBrand>
      </BrandProvider>,
    )
    expect(screen.queryByDisplayValue(/Raffles City|Duxton|Joo Chiat/)).toBeNull()
    const opener = screen.getByRole('button', { name: 'Google Drive' })
    // A click focuses its button; jsdom's does not.
    opener.focus()
    fireEvent.click(opener)
    const picker = screen.getByRole('dialog', { name: 'Google Drive' })
    expect(within(picker).queryAllByRole('checkbox')).toEqual([])
  })
})
