import { defineProject } from 'vitest/config'

export default defineProject({
  test: {
    name: '@brandfactory/core',
    include: ['src/**/*.test.ts'],
    environment: 'node',
    // A test that makes or loads a PGlite database takes 5-11 s under heavy machine load.
    testTimeout: 30_000,
  },
})
