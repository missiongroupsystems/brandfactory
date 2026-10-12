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
