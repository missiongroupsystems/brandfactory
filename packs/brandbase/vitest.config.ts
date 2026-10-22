import { defineProject } from 'vitest/config'

export default defineProject({
  test: {
    name: '@brandfactory/pack-brandbase',
    include: ['*.test.ts'],
    environment: 'node',
    // Each case migrates a PGlite database twice; slow under machine load, as in core.
    testTimeout: 60_000,
  },
})
