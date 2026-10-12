import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { VIDEO } from '@/data/demo'

import { Media } from './media'

describe('a video in Media', () => {
  it('shows its poster frame unless the preview asks it to play', () => {
    const still = render(<Media src={VIDEO.margherita} sizes="100px" />)
    expect(still.container.querySelector('video')).toBeNull()
    expect(still.container.querySelector('img')?.getAttribute('src')).toContain(
      'margherita-reel.jpg',
    )

    const playing = render(<Media src={VIDEO.margherita} sizes="100px" play />)
    const video = playing.container.querySelector('video')!
    expect(video.autoplay).toBe(true)
    expect(video.loop).toBe(true)
    expect(video.muted).toBe(true)
  })
})
