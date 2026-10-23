import { fireEvent, render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { NoImageDrag } from './no-image-drag'

describe("the browser's own drag of a photo", () => {
  it('is stopped for a photo on its own, so a press on it pans or clicks instead', () => {
    const { container } = render(
      <div>
        <NoImageDrag />
        <img src="/demo/pasta.jpg" alt="" />
      </div>,
    )
    expect(fireEvent.dragStart(container.querySelector('img')!)).toBe(false)
  })

  it('still lets a calendar tile with a photo in it move to another day', () => {
    const { container } = render(
      <div>
        <NoImageDrag />
        <div draggable="true" data-tile="">
          <img src="/demo/pasta.jpg" alt="" />
        </div>
      </div>,
    )
    // Pressed on the photo or on the tile, the tile's own drag goes ahead.
    expect(fireEvent.dragStart(container.querySelector('img')!)).toBe(true)
    expect(fireEvent.dragStart(container.querySelector('[data-tile]')!)).toBe(true)
  })
})
