import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({ usePathname: () => '/' }))

// The core is on, with the demo's brands and one company; each case says the person's role.
const mocks = vi.hoisted(() => ({ role: 'owner' as 'owner' | 'admin' | 'member' }))
vi.mock('@/lib/remote', async (orig) => {
  const real = (await orig()) as Record<string, unknown>
  const brand = (id: string, name: string, position: number) => ({
    id,
    orgId: 'demo',
    name,
    handle: `@${id}`,
    line: '',
    linked: [],
    timezone: 'Asia/Singapore',
    position,
  })
  return {
    ...real,
    remote: true,
    onState: () => () => {},
    onAccount: (listener: (account: object) => void) => {
      listener({
        brands: [brand('casa-vostra', 'Casa Vostra', 0), brand('temper', 'Temper', 1)],
        companies: [{ id: 'demo', name: 'Demo', role: mocks.role }],
      })
      return () => {}
    },
  }
})

async function openMenu(role: typeof mocks.role) {
  mocks.role = role
  const { BrandSwitcher } = await import('./brand-switcher')
  const { BrandProvider } = await import('@/features/schedule/posts-store')
  render(
    <BrandProvider>
      <BrandSwitcher />
    </BrandProvider>,
  )
  fireEvent.click(screen.getByRole('button', { name: /Switch brand/ }))
  return screen.getByRole('menu', { name: 'Switch brand' })
}

describe('adding a brand from the switcher', () => {
  it('is offered to an owner, and opens the new brand room', async () => {
    await openMenu('owner')
    expect(screen.getAllByRole('menuitemradio').map((el) => el.textContent)).toEqual([
      'Casa Vostra',
      'Temper',
    ])
    fireEvent.click(screen.getByRole('menuitem', { name: 'Add brand' }))
    expect(screen.getByRole('dialog', { name: 'New brand' })).toBeInTheDocument()
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('is not offered to a plain member', async () => {
    await openMenu('member')
    expect(screen.queryByRole('menuitem', { name: 'Add brand' })).toBeNull()
  })

  // The switcher has one job: the kit and the connections live under the avatar instead.
  it('holds only the brands', async () => {
    await openMenu('owner')
    expect(screen.queryByRole('menuitem', { name: /Brand kit|Connections/ })).toBeNull()
  })
})
