import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type * as Remote from '@/lib/remote'

import { TikTokReturn } from './tiktok-return'

// The server links the account; the brand's reload then fails, as on a flaky network.
const replace = vi.hoisted(() => vi.fn())
const requests = vi.hoisted(() => [] as string[])
vi.mock('@/lib/remote', async (original) => ({
  ...(await original<typeof Remote>()),
  remote: true,
  request: async (method: string, path: string) => {
    requests.push(`${method} ${path}`)
    return { brandId: 'casa', name: 'Casa Vostra' }
  },
  loadBrand: async () => {
    throw new Error('network')
  },
}))
vi.mock('@/features/schedule/posts-store', () => ({ useBrand: () => ({ setBrandId: vi.fn() }) }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }))

describe('the page TikTok returns to', () => {
  it('opens Connections once the account is linked, even when the brand does not reload', async () => {
    render(<TikTokReturn code="c" state="s" declined={null} />)
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/brand/connections'))
    expect(requests).toEqual(['POST /tiktok/callback'])
  })

  it('says the person did not allow access, and sends no code', () => {
    requests.length = 0
    render(<TikTokReturn code={null} state="s" declined="access_denied" />)
    expect(
      screen.getByText('TikTok was not connected. Access was not allowed on TikTok.'),
    ).toBeInTheDocument()
    expect(requests).toEqual([])
  })

  it("shows TikTok's own reason, such as a Sandbox account that is not a test user", () => {
    render(<TikTokReturn code={null} state="s" declined="This account cannot use the app." />)
    expect(
      screen.getByText('TikTok was not connected. TikTok said: This account cannot use the app.'),
    ).toBeInTheDocument()
  })
})
