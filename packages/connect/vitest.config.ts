import { defineProject } from 'vitest/config'

export default defineProject({
  test: {
    name: '@brandfactory/connect',
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
})
