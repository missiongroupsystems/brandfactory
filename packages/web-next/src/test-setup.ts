import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

// Unmount after each test so the jsdom DOM is empty going into the next one.
afterEach(() => {
  cleanup()
})

// jsdom has no ResizeObserver. This one never reports; a test that needs a report stubs its own.
vi.stubGlobal(
  'ResizeObserver',
  class {
    observe() {}
    disconnect() {}
  },
)

// jsdom loads no image and never says so. A browser reports an image it cannot load: an `Image`
// here fails at once, so code that waits for one (a photo's shape, `ratioOf`) goes on. jsdom's
// `Image` makes a plain <img>, so the failing `src` is set on each one; on the window itself,
// which jsdom's code reads, as well as on the test's globals.
const DomImage = window.Image
function FailingImage(width?: number, height?: number) {
  const img = new DomImage(width, height)
  Object.defineProperty(img, 'src', {
    get: () => img.getAttribute('src') ?? '',
    set: (value: string) => {
      img.setAttribute('src', value)
      queueMicrotask(() => img.onerror?.(new Event('error')))
    },
  })
  return img
}
window.Image = FailingImage as unknown as typeof window.Image
globalThis.Image = FailingImage as unknown as typeof window.Image
