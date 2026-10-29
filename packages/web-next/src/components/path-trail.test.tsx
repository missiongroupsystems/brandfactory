import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const at = vi.hoisted(() => ({ path: '/shoot/cv-shoot-raffles' }))
vi.mock('next/navigation', () => ({ usePathname: () => at.path }))

import { cameFromApp, PathTrail } from './path-trail'

// A Back link must not leave the app: router.back() from a page opened by an outside link would.
describe('the path trail', () => {
  it('knows no page before the first one, and one after an in-app move', () => {
    const { rerender } = render(<PathTrail />)
    expect(cameFromApp()).toBe(false)
    rerender(<PathTrail />)
    expect(cameFromApp()).toBe(false)
    at.path = '/ideate'
    rerender(<PathTrail />)
    expect(cameFromApp()).toBe(true)
  })
})
