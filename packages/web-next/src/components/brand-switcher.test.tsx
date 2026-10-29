import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({ usePathname: () => '/' }))

// The core is on, with the demo's brands and one company; each case says the person's role.
const mocks = vi.hoisted(() => ({
  role: 'owner' as 'owner' | 'admin' | 'member',
  // When set, the account arrives only once a case calls `arrive`, as `/me` answers late.
  late: false,
  arrive: (() => {}) as () => void,
}))
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
      const send = () =>
        listener({
          brands: [
            brand('casa-vostra', 'Casa Vostra', 0),
            brand('temper', 'Temper', 1),
            // A brand only the core holds, in the late cases.
            ...(mocks.late ? [brand('chin-mee-chin', 'Chin Mee Chin', 2)] : []),
          ],
          companies: [{ id: 'demo', name: 'Demo', role: mocks.role }],
        })
      if (mocks.late) mocks.arrive = send
      else send()
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

// The judge picked Temper, reloaded, and was back on Casa Vostra, editing the wrong brand.
describe('the brand chosen last', () => {
  afterEach(() => {
    localStorage.clear()
    mocks.late = false
  })
  const checked = () =>
    screen.getAllByRole('menuitemradio').find((el) => el.getAttribute('aria-checked') === 'true')

  it('opens again after a reload, in this browser', async () => {
    await openMenu('owner')
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Temper' }))
    cleanup()
    await openMenu('owner')
    expect(checked()).toHaveTextContent('Temper')
  })

  // On the core the brands come from the account: the kept one waits for them, then opens.
  it('opens on the core once the account’s brands arrive, and not before', async () => {
    localStorage.setItem('brandbase.brand', 'chin-mee-chin')
    mocks.late = true
    const { BrandSwitcher } = await import('./brand-switcher')
    const { BrandProvider } = await import('@/features/schedule/posts-store')
    render(
      <BrandProvider>
        <BrandSwitcher />
      </BrandProvider>,
    )
    // Not reachable yet: the first brand opens meanwhile.
    expect(screen.getByRole('button', { name: /Switch brand/ })).toHaveTextContent('Casa Vostra')
    act(() => mocks.arrive())
    expect(screen.getByRole('button', { name: /Switch brand/ })).toHaveTextContent('Chin Mee Chin')
  })

  // A pick in another tab must not swap this tab's brand, and its open drafts, from under it.
  it('is read once: another tab’s pick leaves this tab as it is', async () => {
    await openMenu('owner')
    localStorage.setItem('brandbase.brand', 'temper')
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'brandbase.brand' }))
    })
    // Any render after it, as the menu's own, still shows the brand this tab opened on.
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'ArrowDown' })
    expect(checked()).toHaveTextContent('Casa Vostra')
  })

  it('is ignored once the person no longer reaches it', async () => {
    localStorage.setItem('brandbase.brand', 'gone-brand')
    await openMenu('owner')
    expect(checked()).toHaveTextContent('Casa Vostra')
  })
})
