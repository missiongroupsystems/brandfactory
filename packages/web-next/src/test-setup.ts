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
