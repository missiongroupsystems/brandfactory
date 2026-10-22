import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({ usePathname: () => '/' }))

afterEach(() => vi.unstubAllEnvs())

// The navigation reads the address when it loads, so each case loads it afresh.
async function nav(bubbles: string) {
  vi.resetModules()
  vi.stubEnv('NEXT_PUBLIC_BUBBLES_URL', bubbles)
  const { AppHeader } = await import('./app-header')
  const { TabBar } = await import('./tab-bar')
  const { BrandProvider } = await import('@/features/schedule/posts-store')
  render(
    <BrandProvider>
      <AppHeader />
      <TabBar />
    </BrandProvider>,
  )
  return screen.queryAllByRole('link', { name: 'Bubbles' })
}

describe('the Bubbles link', () => {
  it('is in the header and the tab bar where Bubbles is connected', async () => {
    expect(await nav('http://bubbles.test')).toHaveLength(2)
  })

  it('is gone where it is not, so the demo has no dead tab', async () => {
    expect(await nav('')).toHaveLength(0)
    expect(screen.getAllByRole('link', { name: /Inbox/ })).toHaveLength(2)
    // The static demo keeps its demo avatar, with no account menu.
    expect(screen.getByLabelText('You')).toHaveTextContent('NA')
    expect(screen.queryByRole('button', { name: /Account/ })).not.toBeInTheDocument()
  })
})
