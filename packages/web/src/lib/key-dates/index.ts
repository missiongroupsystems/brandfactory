// The dataset's one entry point. Nothing outside this folder imports a data
// file directly — the three sets and their concatenation order are an
// implementation detail, and a consumer reaching past this barrel would be a
// second place that has to know them.
//
// The three per-set arrays are exported for `data.test.ts` alone, which asserts
// each entry's `set` matches the file it came from — a claim that cannot be
// made against the flattened array.

export * from './types'
export * from './select'
export * from './appearance'
export { ALL_KEY_DATES } from './all'
export { GLOBAL_KEY_DATES } from './global'
export { SG_HOLIDAY_KEY_DATES } from './sg-holidays'
export { SG_EVENT_KEY_DATES } from './sg-events'
