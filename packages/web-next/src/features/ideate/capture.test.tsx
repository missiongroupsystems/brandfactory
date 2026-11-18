import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type * as Remote from '@/lib/remote'

import { CaptureLink } from './capture'

vi.hoisted(() => {
  process.env.NEXT_PUBLIC_CORE_URL = 'https://core.test'
})
const calls = vi.hoisted(() => [] as string[])
const answers = vi.hoisted(() => ({ handle: 'brandbase.capture' as string | null }))
vi.mock('@/lib/remote', async (original) => ({
  ...(await original<typeof Remote>()),
  remote: true,
  request: async (method: string, path: string) => {
    calls.push(`${method} ${path}`)
    if (path === '/capture') return { handle: answers.handle }
    return { code: 'ABCD2345', expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString() }
  },
}))

describe('Add from Instagram', () => {
  it('names the capture account, and shows a code to DM for ten minutes', async () => {
    render(<CaptureLink />)
    expect(await screen.findByText('@brandbase.capture')).toBeVisible()
    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: 'Add from Instagram' })),
    )
    const card = screen.getByRole('region', { name: 'Add from Instagram' })
    expect(card).toHaveTextContent('DM this to @brandbase.capture')
    expect(card).toHaveTextContent('LINK ABCD2345')
    expect(card).toHaveTextContent(/Expires in (10:00|9:5\d)/)
    expect(calls).toEqual(['GET /capture', 'POST /capture/code'])
  })
})
