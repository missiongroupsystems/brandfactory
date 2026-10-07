import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// Unmount after each test so the jsdom DOM is empty going into the next one.
afterEach(() => {
  cleanup()
})
