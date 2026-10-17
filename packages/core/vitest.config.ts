import { defineProject } from 'vitest/config'

export default defineProject({
  test: {
    name: '@brandfactory/core',
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
})
