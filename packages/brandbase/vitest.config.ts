import { fileURLToPath, URL } from 'node:url'
import { defineProject } from 'vitest/config'

// Mirrors `packages/web-next/vitest.config.ts`: jsdom, globals, the `@` alias and a setup file.
// Listed in the root `vitest.workspace.ts`, the form that keeps `environment` and `alias`.
export default defineProject({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    name: '@brandfactory/brandbase',
    include: ['src/**/*.test.{ts,tsx}'],
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
  },
})
