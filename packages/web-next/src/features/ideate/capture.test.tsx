import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type * as Remote from '@/lib/remote'

import { CaptureLink } from './capture'

vi.hoisted(() => {
  process.env.NEXT_PUBLIC_CORE_URL = 'https://core.test'
})
const calls = vi.hoisted(() => [] as string[])
vi.mock('@/lib/remote', async (original) => ({
  ...(await original<typeof Remote>()),
  remote: true,
  request: async (method: string, path: string) => {
    calls.push(`${method} ${path}`)
    return { handle: 'brandbase.capture' }
  },
}))

describe('the capture line on Shared', () => {
  it('names the capture account, with no code to make', async () => {
    render(<CaptureLink />)
    expect(await screen.findByText('@brandbase.capture')).toBeVisible()
    expect(screen.queryByRole('button')).toBeNull()
    expect(calls).toEqual(['GET /capture'])
  })
})
