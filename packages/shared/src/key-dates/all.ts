import { GLOBAL_KEY_DATES } from './global'
import { SG_EVENT_KEY_DATES } from './sg-events'
import { SG_HOLIDAY_KEY_DATES } from './sg-holidays'
import type { KeyDate } from './types'

/**
 * Every curated date, concatenated in **`KEY_DATE_SETS` order**.
 *
 * That order is not cosmetic: `keyDatesForSets` dedupes an observance shared by
 * two sets by keeping the first one it meets, so this concatenation is what
 * makes `global` win Christmas. Reordering these three spreads silently changes
 * which set colours a shared row, and no type would notice.
 *
 * **This lives in its own module rather than in `index.ts`, on purpose.**
 * `index.ts` re-exports `select.ts`, and `select.ts` needs this array — put the
 * array in the barrel and the two form a runtime import cycle whose resolution
 * depends on which module the bundler enters first. One direction only:
 * data files → here → `select.ts` → `index.ts`.
 */
export const ALL_KEY_DATES: KeyDate[] = [
  ...GLOBAL_KEY_DATES,
  ...SG_HOLIDAY_KEY_DATES,
  ...SG_EVENT_KEY_DATES,
]
