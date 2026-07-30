import { defineProject } from 'vitest/config'

export default defineProject({
  test: {
    name: '@brandfactory/adapter-research',
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
})
