import { useLayoutEffect, useRef } from 'react'
import { useToolcraft } from '@/toolcraft/runtime/react'
import { clampToolcraftCanvasZoom } from '@/toolcraft/runtime/state/canvas-zoom'
import type { ToolcraftCanvasSize } from '@/toolcraft/runtime'

// ---------------------------------------------------------------------------
// StudioCanvasIntro — what an untouched canvas looks like
// ---------------------------------------------------------------------------
//
// 1.16.0 mounted the vendored surface and never saw it on a screen, and what it
// produced for a brand that had not uploaded anything was an empty page. Not a
// broken one — three true things compounding:
//
//   1. The artboard has no surface of its own. `canvas-shell.tsx` gives
//      `[data-toolcraft-editable-canvas]` a width, a height and nothing else, so
//      it is a transparent rectangle on the viewport's `--background`. That is
//      upstream's own markup, not something the re-tokenisation dropped —
//      upstream's `styles.css` at `682a159` carries the same two canvas rules we
//      kept. Fixed in `styles/toolcraft.css`, which is where every other
//      difference between toolcraft's tokens and ours already lives.
//   2. Nothing is in it. No media, and `canvasContent` was not passed.
//   3. Zoom opens at 100% (`canvas-zoom.ts`) against a default 1920×1080
//      artboard, so on any normal window the artboard is larger than the
//      viewport and its edges — the only thing 1 would have made visible — sit
//      off-screen in every direction.
//
// So this file is the answer to 2 and 3: it is passed as `canvasContent`, it
// chooses an opening zoom that puts the whole artboard on screen, and it says
// what to do with an empty one.

/** Fraction of the viewport the artboard is fitted into, leaving a workspace
 *  gutter around it — an artboard flush to every edge reads as a background. */
const canvasFitRatio = 0.88

/**
 * The zoom, in percent, at which `canvas` fits inside `viewport`.
 *
 * Pure and exported for its test: the component that calls it can only be
 * exercised against a real layout, and this is the half worth pinning.
 *
 * Returns `null` when there is nothing to fit to — a viewport with no measured
 * size (unmounted, `display:none`, jsdom) or a degenerate artboard. `null` means
 * *leave the zoom alone*, never *fall back to a guess*.
 */
export function studioFitZoom({
  canvas,
  viewport,
}: {
  canvas: Pick<ToolcraftCanvasSize, 'height' | 'width'>
  viewport: { height: number; width: number }
}): number | null {
  const ratios = [viewport.width / canvas.width, viewport.height / canvas.height]

  if (!ratios.every((ratio) => Number.isFinite(ratio) && ratio > 0)) return null

  return clampToolcraftCanvasZoom(Math.round(Math.min(...ratios) * canvasFitRatio * 100))
}

/**
 * `fitOnMount` is decided by the caller from persistence, not from state: a
 * canvas restored at 100% was *put* there, and re-fitting it on every visit
 * would overrule the zoom control every time the page was opened.
 */
export function StudioCanvasIntro({ fitOnMount }: { fitOnMount: boolean }) {
  const { dispatch, state } = useToolcraft()
  const anchorRef = useRef<HTMLDivElement | null>(null)
  const fittedRef = useRef(false)
  const { size, zoom } = state.canvas

  useLayoutEffect(() => {
    // Once per mount even if the effect re-runs: the fit is an opening
    // position, and re-applying it would fight a zoom made in between.
    if (!fitOnMount || fittedRef.current) return

    const viewport = anchorRef.current?.closest<HTMLElement>(
      '[data-slot="toolcraft-runtime-canvas"]',
    )
    if (!viewport) return

    const fitted = studioFitZoom({
      canvas: size,
      viewport: { height: viewport.clientHeight, width: viewport.clientWidth },
    })
    if (fitted === null) return

    fittedRef.current = true

    // Only ever zooms out. A viewport big enough to hold the artboard at 100%
    // should show it at 100% — enlarging past it is a decision for the person,
    // not the opening frame.
    if (fitted >= 100) return

    dispatch({ offset: { x: 0, y: 0 }, type: 'canvas.setViewport', zoom: fitted })
  }, [dispatch, fitOnMount, size])

  // Rendered whether or not the hint is, because the effect measures through
  // this node: an anchor that came and went with the hint would stop being able
  // to find the viewport in exactly the case the fit still has to run.
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 flex items-center justify-center"
      data-studio-canvas-anchor=""
      ref={anchorRef}
    >
      {state.mediaAssets.length === 0 && (
        // Counter-scaled out of the canvas transform. Everything else in here is
        // artboard content and *should* zoom with it; a sentence about how to
        // begin is chrome, and at 25% it would be unreadable.
        <p
          className="max-w-xs text-center text-sm text-muted-foreground"
          style={{ transform: `scale(${100 / zoom})` }}
        >
          Drop an image here to start.
        </p>
      )}
    </div>
  )
}
