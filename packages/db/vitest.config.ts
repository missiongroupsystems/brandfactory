import { defineProject } from 'vitest/config'

export default defineProject({
  test: {
    name: '@brandfactory/db',
    include: ['src/**/*.test.ts'],
    environment: 'node',
    // `seed.test.ts`, `queries.live.test.ts` and `guidelines.live.test.ts` all
    // work the same seeded rows in the same live database, and two of them
    // assert exact row counts while a third deletes and re-inserts sections.
    // Running those files in parallel races the transactions against each
    // other, so this package's files run one at a time. The pure-unit files
    // here are fast enough that the lost parallelism costs nothing.
    //
    // **This is `singleFork`, not `fileParallelism: false`, and the difference
    // is that one of them works.** `fileParallelism` is a root-level option:
    // set in a project config it is silently ignored, which is how it sat here
    // since 0.9.1 reading as a guarantee while the files kept racing — `pnpm
    // test` passed or failed depending on which worker got there first, and
    // "0 skipped, all green" was luck rather than evidence. One fork for this
    // project is the same intent expressed where vitest reads it.
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
  },
})
