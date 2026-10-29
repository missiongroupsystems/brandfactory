import { fireEvent, render, screen } from '@testing-library/react'
import * as React from 'react'
import { describe, expect, it, vi } from 'vitest'

import { BrandProvider, useBrand } from '@/features/schedule/posts-store'
import type * as Remote from '@/lib/remote'

vi.mock('next/navigation', () => ({ usePathname: () => '/' }))
vi.mock('@/lib/remote', async (original) => ({
  ...(await original<typeof Remote>()),
  remote: false,
}))

import { AccountMenu } from './account-menu'

/** Opens the page on another of the demo's brands, as the switcher would. */
function On({ brand }: { brand: 'temper' }) {
  const { setBrandId } = useBrand()
  React.useEffect(() => setBrandId(brand), [brand, setBrandId])
  return null
}

const open = (on?: React.ReactNode) => {
  render(
    <BrandProvider>
      {on}
      <AccountMenu />
    </BrandProvider>,
  )
  fireEvent.click(screen.getByRole('button', { name: /^Account/ }))
}

// Settings live under the person: the brand's kit and connections open from the avatar on every
// page, and the demo, with no account to edit or leave, offers nothing else.
describe('the account menu in the demo', () => {
  it('opens on the demo initials and offers the brand kit and connections', () => {
    open()
    const kit = screen.getByRole('menuitem', { name: 'Brand kit' })
    expect(kit).toHaveAttribute('href', '/brand')
    // The switcher beside the avatar names the brand; the item does not say it a second time.
    expect(kit).not.toHaveTextContent('Casa Vostra')
    expect(screen.getByRole('menuitem', { name: 'Connections' })).toHaveAttribute(
      'href',
      '/brand/connections',
    )
    expect(screen.queryByRole('menuitem', { name: 'Edit profile' })).toBeNull()
    expect(screen.queryByRole('menuitem', { name: 'Sign out' })).toBeNull()
  })

  it('shows a dot on the avatar and on Connections when one needs signing in again', () => {
    // Temper's website connection is signed out in the demo.
    open(<On brand="temper" />)
    expect(
      screen.getByRole('button', { name: 'Account, a connection needs attention' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /Connections/ })).toHaveTextContent('Connections')
    expect(screen.getByLabelText('Needs attention')).toBeInTheDocument()
  })
})
