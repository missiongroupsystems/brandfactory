import { defineProject } from 'vitest/config'

export default defineProject({
  test: {
    name: '@brandfactory/db',
    include: ['src/**/*.test.ts'],
    environment: 'node',
    // `seed.test.ts` and `queries.live.test.ts` both run `seed()` against the
    // same live database and assert on row counts. Running the files in
    // parallel races those transactions against each other, so this package's
    // files run one at a time. The pure-unit files here are fast enough that
    // the lost parallelism costs nothing.
    fileParallelism: false,
  },
})
