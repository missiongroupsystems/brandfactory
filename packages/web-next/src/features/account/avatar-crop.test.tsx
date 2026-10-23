import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { nudge } from '@/features/publish/model'

import { AvatarCrop, squareOf } from './avatar-crop'

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

  it('saves the part the circle shows after a pan: the photo moves with the finger, 1:1', () => {
    // A square photo at zoom 2 in a 300 px frame: the frame shows 150 of its 300 px wide.
    const zoomed = crop({ ratio: 1, zoom: 2 })
    const moved = nudge(zoomed, 30, -15, 300, 300)
    const before = squareOf(zoomed, 300, 300)
    const after = squareOf(moved, 300, 300)
    // 30 px right on screen is 15 photo px (the photo is drawn twice its size): the square goes left.
    expect(after.sx).toBeCloseTo(before.sx - 15)
    expect(after.sy).toBeCloseTo(before.sy + 7.5)
    // Far past the edge, the square stops at the photo's edge.
    expect(squareOf(nudge(zoomed, 9999, 0, 300, 300), 300, 300).sx).toBe(0)
  })
})

describe('the crop under the round mask', () => {
  beforeEach(() => {
    URL.createObjectURL = () => 'blob:me'
    URL.revokeObjectURL = () => {}
    // jsdom loads no image: this one is a 1000 px square, loaded at once.
    vi.stubGlobal(
      'Image',
      class {
        naturalWidth = 1000
        naturalHeight = 1000
        onload: (() => void) | null = null
        set src(_: string) {
          queueMicrotask(() => this.onload?.())
        }
      },
    )
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      width: 300,
      height: 300,
    } as DOMRect)
    HTMLElement.prototype.setPointerCapture = () => {}
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  async function open() {
    render(
      <AvatarCrop
        file={new File(['x'], 'me.jpg')}
        busy={false}
        onCancel={() => {}}
        onSave={() => {}}
        onError={() => {}}
      />,
    )
    await act(async () => {})
    const surface = screen.getByRole('img', { name: /Drag to move/ })
    const photo = surface.querySelector('img')!
    return { surface, photo, place: () => photo.parentElement!.style.left }
  }

  it('pans the photo after a zoom, following the pointer', async () => {
    const { surface, place } = await open()
    fireEvent.change(screen.getByRole('slider'), { target: { value: '2' } })
    expect(place()).toBe('calc(50%)')
    fireEvent.pointerDown(surface, { clientX: 100, clientY: 100, pointerId: 1 })
    fireEvent.pointerMove(surface, { clientX: 130, clientY: 100, pointerId: 1 })
    // 30 px of a 300 px frame: the photo moved 10% of it.
    expect(place()).toBe('calc(60%)')
  })

  it("stops the browser's own drag of the photo, which would cancel the pan", async () => {
    const { photo } = await open()
    // fireEvent returns false when a handler prevented the default.
    expect(fireEvent.dragStart(photo)).toBe(false)
  })
})
