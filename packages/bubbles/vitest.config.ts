import { defineProject } from 'vitest/config'

export default defineProject({
  test: {
    name: '@brandfactory/bubbles',
    include: ['src/**/*.test.ts'],
    environment: 'node',
    // Each turn test starts a runtime process; under a busy machine that takes seconds.
    testTimeout: 20_000,
  },
})
