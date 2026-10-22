import { defineProject } from 'vitest/config'

export default defineProject({
  test: {
    name: '@brandfactory/connect',
    include: ['src/**/*.test.ts'],
    environment: 'node',
    // The brandbase tests make a PGlite database with the pack on it: 5-11 s under heavy load,
    // as in the core.
    testTimeout: 30_000,
  },
})
