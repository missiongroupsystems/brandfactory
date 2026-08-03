import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// @testing-library/react's automatic cleanup only runs when `globals: true` is
// set on the test runner. It is — but be explicit anyway: cleanup unmounts
// every rendered component after each test, so the jsdom DOM is empty going
// into the next one. Without this, tests rendering similarly-named buttons
// clash on `getByRole`.
afterEach(() => {
  cleanup()
})

// ---------------------------------------------------------------------------
// The three DOM APIs jsdom does not implement and Radix's Select requires
// ---------------------------------------------------------------------------
//
// `PostEditorDialog` is the first component under test to open a Radix
// `Select` (the workspace settings page renders one, but nothing exercised
// it), and opening one in jsdom throws `target.hasPointerCapture is not a
// function` before a single assertion runs.
//
// None of these is a behaviour worth faking cleverly: pointer capture is a
// routing detail for pointer events that never fire in jsdom anyway, and
// scrolling has no meaning in a layout engine that does not lay anything out.
// They are stubbed to the least surprising answer — capture is never held,
// scrolling is a no-op, nothing ever resizes — and each is installed only when
// absent, so a future jsdom that implements them wins.
const proto = window.Element.prototype as unknown as Record<string, unknown>
proto.hasPointerCapture ??= () => false
proto.setPointerCapture ??= () => {}
proto.releasePointerCapture ??= () => {}
proto.scrollIntoView ??= () => {}

globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
}
