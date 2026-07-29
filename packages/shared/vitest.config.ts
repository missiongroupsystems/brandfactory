import { defineProject } from 'vitest/config'

// `shared` was schemas-only until 2A and had no suite. It now exports
// behaviour — the `BrandAsset` accessors — and a package that ships functions
// earns its own tests rather than being covered incidentally by its consumers.
export default defineProject({
  test: {
    name: '@brandfactory/shared',
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
})
