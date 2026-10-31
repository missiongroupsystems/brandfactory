import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { connect, disconnect } from '@/features/connections/connections-store'
import { BrandProvider } from '@/features/schedule/posts-store'
import type * as Remote from '@/lib/remote'

import { NewMenu } from './new-menu'

// On the core with Instagram and Facebook through Make: TikTok is planned only, and Make posts no Story.
vi.mock('@/lib/remote', async (original) => ({
  ...(await original<typeof Remote>()),
  remote: true,
  platformOn: (p: string) => p === 'instagram' || p === 'facebook',
  onState: () => () => undefined,
  onAccount: () => () => undefined,
}))
vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))

describe('the New menu on the core', () => {
  it('lists the accounts that really post each format, and greys a Story as plan only', () => {
    connect('casa-vostra', 'ig')
    disconnect('casa-vostra', 'fb')
    render(
      <BrandProvider>
        <NewMenu onPost={vi.fn()} />
      </BrandProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'New' }))
    const rows = within(screen.getByRole('menu', { name: 'New' })).getAllByRole('menuitem')
    // Instagram is linked through Make; Facebook is not yet, and TikTok never posts.
    expect(rows[0]!.querySelectorAll('svg')).toHaveLength(1)
    expect(rows[1]!.querySelectorAll('svg')).toHaveLength(1)
    expect(rows[2]).toHaveTextContent('StoryPlan only')
    expect(rows[2]!.querySelectorAll('svg')).toHaveLength(0)
  })
})
