import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const at = vi.hoisted(() => ({ path: '/' }))
vi.mock('next/navigation', () => ({ usePathname: () => at.path }))

afterEach(() => {
  vi.unstubAllEnvs()
  at.path = '/'
})

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

describe('the Posted link', () => {
  it('is current on Posted, where the tab bar stays: Posted is a page, not a post', async () => {
    at.path = '/posted'
    await nav('')
    const links = screen.getAllByRole('link', { name: 'Posted' })
    expect(links).toHaveLength(2)
    for (const l of links) expect(l).toHaveAttribute('aria-current', 'page')
    for (const l of screen.getAllByRole('link', { name: 'Schedule' }))
      expect(l).not.toHaveAttribute('aria-current')
  })
})

describe('a post’s own page', () => {
  it.each(['/post/new', '/post/casa-vostra-archive-0'])(
    'belongs to Schedule, with no tab bar: %s',
    async (path) => {
      at.path = path
      await nav('')
      // The header's links only: the tab bar is gone.
      expect(screen.getAllByRole('link', { name: 'Schedule' })).toHaveLength(1)
      expect(screen.getByRole('link', { name: 'Schedule' })).toHaveAttribute('aria-current', 'page')
      expect(screen.getByRole('link', { name: 'Posted' })).not.toHaveAttribute('aria-current')
    },
  )
})
