import { describe, expect, it } from 'vitest'

import { squareOf } from './avatar-crop'

const crop = (o: object = {}) => ({ aspect: '1:1' as const, zoom: 1, x: 0, y: 0, ratio: 2, ...o })

describe('the square a profile picture keeps', () => {
  it('takes the middle square of a wide photo at no zoom', () => {
    expect(squareOf(crop(), 2000, 1000)).toEqual({ sx: 500, sy: 0, sw: 1000, sh: 1000 })
  })

  it('takes a smaller square when zoomed, still centred', () => {
    expect(squareOf(crop({ zoom: 2 }), 2000, 1000)).toEqual({ sx: 750, sy: 250, sw: 500, sh: 500 })
  })

  it('reaches each edge of the photo at the ends of a drag, never past it', () => {
    // As `Framed` draws it: x = 1 slides the photo right, so the frame shows its left edge.
    expect(squareOf(crop({ x: 1 }), 2000, 1000).sx).toBe(0)
    expect(squareOf(crop({ x: -1 }), 2000, 1000).sx).toBe(1000)
    const tall = squareOf(crop({ ratio: 0.5, y: -1 }), 1000, 2000)
    expect(tall.sy + tall.sh).toBe(2000)
  })
})
