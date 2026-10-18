import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { Card as Model } from './model'
import { LinkCard } from './other-cards'

vi.hoisted(() => {
  // On the core, a link's token comes only from asking for it, and asking makes the link.
  process.env.NEXT_PUBLIC_CORE_URL = 'http://core.test'
})

const fetchSpy = vi.spyOn(globalThis, 'fetch')
afterEach(() => fetchSpy.mockClear())

const link = (id: string): Model => ({
  key: `link:${id}`,
  kind: 'link',
  id,
  brand: 'cv',
  verb: 'Link',
  removed: false,
  tool: 'share.set',
  input: { brand: 'cv', kind: 'idea', id, who: 'team', can: 'view' },
})

describe('the share link card', () => {
  it('asks the core for nothing, so drawing the card never makes a link', () => {
    render(<LinkCard model={link('cv-dough')} index={0} />)
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Copy link' })).toBeNull()
  })

  it('opens the shared thing by an encoded id, so a model-made id cannot change the route', () => {
    render(<LinkCard model={link('../x?y')} index={0} />)
    expect(screen.getByRole('link').getAttribute('href')).toBe('/ideate/..%2Fx%3Fy')
  })
})
