import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StudioCanvasIntro, studioFitZoom } from './StudioCanvasIntro'
import { studioSchema } from './studioSchema'
import { ToolcraftRoot } from '@/toolcraft/runtime/react'
import type { ToolcraftInitialState } from '@/toolcraft/runtime'

// The opening frame of an untouched canvas. 1.16.0 shipped it as a blank field:
// a transparent artboard, larger than the viewport, with nothing in it. The
// surface is CSS and cannot be asserted here; the zoom that puts it on screen
// and the sentence that says what to do with it can.

describe('studioFitZoom', () => {
  // 1920×1080 at 100% is bigger than any normal content area in both axes,
  // which is why the artboard's edges were off-screen even once it had some.
  it('fits the default artboard into a typical viewport, with a gutter', () => {
    const zoom = studioFitZoom({
      canvas: { height: 1080, width: 1920 },
      viewport: { height: 900, width: 1200 },
    })

    // Width is the binding axis: 1200/1920 = 0.625, and 0.88 of that is 55%.
    expect(zoom).toBe(55)
  })

  it('binds on whichever axis is tighter', () => {
    const zoom = studioFitZoom({
      canvas: { height: 1080, width: 1920 },
      viewport: { height: 300, width: 4000 },
    })

    // Height now: 300/1080 = 0.2777…, times 0.88 → 24, clamped up to the
    // runtime's own floor of 25.
    expect(zoom).toBe(25)
  })

  it('never exceeds the runtime zoom range', () => {
    const zoom = studioFitZoom({
      canvas: { height: 10, width: 10 },
      viewport: { height: 8000, width: 8000 },
    })

    expect(zoom).toBe(400)
  })

  // `null` is "leave the zoom alone". A zero-sized viewport is a canvas that is
  // not laid out yet — a hidden route, or jsdom — and guessing a zoom there
  // would write a persisted value nobody chose.
  it('declines to fit when there is nothing to measure', () => {
    const canvas = { height: 1080, width: 1920 }

    expect(studioFitZoom({ canvas, viewport: { height: 0, width: 0 } })).toBeNull()
    expect(studioFitZoom({ canvas, viewport: { height: 900, width: 0 } })).toBeNull()
    expect(
      studioFitZoom({ canvas: { height: 0, width: 0 }, viewport: { height: 9, width: 9 } }),
    ).toBeNull()
  })
})

function renderIntro(initialState?: ToolcraftInitialState) {
  return render(
    <ToolcraftRoot initialState={initialState} schema={studioSchema('b-1')}>
      <StudioCanvasIntro fitOnMount={false} />
    </ToolcraftRoot>,
  )
}

const anchorOf = (container: HTMLElement) =>
  container.querySelector<HTMLElement>('[data-studio-canvas-anchor]')

const oneImage: ToolcraftInitialState = {
  layers: [{ id: 'layer-1', name: 'Image', visible: true }],
  mediaAssets: [
    {
      dataUrl: 'data:image/png;base64,iVBORw0KGgo=',
      fileName: 'logo.png',
      id: 'media-1',
      layerId: 'layer-1',
      mimeType: 'image/png',
      position: { x: 0, y: 0 },
      size: { height: 100, unit: 'px', width: 100 },
    },
  ],
}

describe('StudioCanvasIntro', () => {
  it('tells an empty canvas what it is for', () => {
    renderIntro()
    expect(screen.getByText('Drop an image here to start.')).toBeTruthy()
  })

  it('stands down once the canvas has something on it', () => {
    renderIntro(oneImage)
    expect(screen.queryByText('Drop an image here to start.')).toBeNull()
  })

  // The anchor is how the fit effect reaches the viewport element, so it has to
  // outlive the hint — a canvas holding media could otherwise never be fitted.
  // Inert in both senses: no hit-testing (upstream stacks the slot above the
  // media layers' select buttons) and no place in the accessible tree.
  it('keeps its anchor mounted and inert either way', () => {
    for (const state of [undefined, oneImage]) {
      const { container, unmount } = renderIntro(state)
      const anchor = anchorOf(container)

      expect(anchor).toBeTruthy()
      expect(anchor?.className).toContain('pointer-events-none')
      expect(anchor?.getAttribute('aria-hidden')).toBe('true')
      unmount()
    }
  })
})
