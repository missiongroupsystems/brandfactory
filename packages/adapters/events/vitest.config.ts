import { defineProject } from 'vitest/config'

export default defineProject({
  test: {
    name: '@brandfactory/adapter-events',
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
})
