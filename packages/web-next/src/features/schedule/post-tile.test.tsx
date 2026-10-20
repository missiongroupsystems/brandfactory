import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { POSTS } from '@/data/demo'

import { BrandProvider } from './posts-store'
import { PostTile } from './week-grid'

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: vi.fn() }),
}))

if (!window.matchMedia) {
  window.matchMedia = () =>
    ({
      matches: false,
      addEventListener() {},
      removeEventListener() {},
    }) as unknown as MediaQueryList
}

describe('a reel on the calendar', () => {
  it('shows its poster frame and never plays: a grid of moving tiles distracts', () => {
    const reel = POSTS.find((p) => p.id === 'margherita')!
    const { container } = render(
      <BrandProvider>
        <PostTile post={reel} eager={false} onOpen={() => {}} />
      </BrandProvider>,
    )
    expect(container.querySelector('video')).toBeNull()
    expect(container.querySelector('img')?.getAttribute('src')).toContain('margherita-reel.jpg')
  })
})

describe('a post planned from an idea typed on the calendar', () => {
  it('shows its words: with no media and no cover to borrow, an empty tile says nothing', () => {
    const reel = POSTS.find((p) => p.id === 'margherita')!
    const plan = {
      ...reel,
      id: 'typed-idea',
      hook: 'Nonna rates our tiramisu',
      stage: 'draft' as const,
      images: [],
    }
    const { container, getByText } = render(
      <BrandProvider>
        <PostTile post={plan} eager={false} onOpen={() => {}} />
      </BrandProvider>,
    )
    expect(container.querySelector('img')).toBeNull()
    expect(getByText('Nonna rates our tiramisu')).toBeTruthy()
    expect(getByText('No media yet')).toBeTruthy()
  })
})
