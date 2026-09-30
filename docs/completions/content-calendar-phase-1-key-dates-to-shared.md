# Content calendar Phase 1 — the key dates leave the app that cannot share them

**Shipped in:** 1.56.0. **Migration:** none — the dataset has no schema and still does not want
one. **Wire:** no new route; the 92 dates never crossed it and still do not.
**New dependency:** none.

## What this phase is

Step 1 of `docs/executing/content-calendar-plan.md`, and the one it calls "unblocks every phase
after it". The calendar that MKT-1 builds lives in `web-next`. The key dates it has to enrich lived
in `packages/web/src/lib/key-dates/`, which `web-next` cannot import. So they move to
`@brandfactory/shared` before anything is built on top of them.

Nothing about the data changes: the same 92 dates, the same three sets, the same curated-through
line. A reader of the legacy calendar sees exactly what they saw yesterday. This is a move, and the
proof it is only a move is the test count: 3104 before, 3104 after.

## Why three date helpers came with it

`select.ts` — the one file in the dataset that answers questions rather than holding rows — opens
with:

```ts
import { dayKeyToDate, localDayKey, monthLabel } from '../calendar'
```

`../calendar` is `packages/web/src/lib/calendar.ts`. A package cannot import from the app that
consumes it, so the move was never going to be the folder alone. The three functions are pure,
depend on nothing but `Date` and `Intl`, and are exactly the vocabulary a date dataset speaks, so
they are now `packages/shared/src/date/day-key.ts` with their doc comments and the UTC-versus-local
invariant intact.

`monthGridDays`, `shiftMonth`, `groupByDay` and the two converters stayed in web. They are the month
grid's arithmetic, not the dataset's, and `groupByDay` takes a `SocialPost`.

## The re-export, and why it is not a second copy

`lib/calendar.ts` imports the three back and re-exports them:

```ts
import { type SocialPost, dayKeyToDate, localDayKey, monthLabel } from '@brandfactory/shared'
export { dayKeyToDate, localDayKey, monthLabel }
```

Eight files in web read `localDayKey` from `@/lib/calendar`, and this file's header still describes
every function a caller gets from it. Splitting those eight imports in two — one line for the
helpers that moved, one for the helpers that did not — would have made each call site record an
implementation detail of the monorepo's package graph. One module stays one module; only the bodies
moved.

The import is needed as well as the export because `isoToLocalParts`, `localPartsToIso`,
`groupByDay` and `formatDayHeading` call them internally, and `export … from` binds nothing in the
re-exporting module's own scope. `tsc` said so, in six errors, before this was right.

## What moved where

| Before | After |
|---|---|
| `packages/web/src/lib/key-dates/*` (11 files) | `packages/shared/src/key-dates/*` |
| `localDayKey`, `dayKeyToDate`, `monthLabel` in `lib/calendar.ts` | `packages/shared/src/date/day-key.ts` |
| their cases in `lib/calendar.test.ts` | `packages/shared/src/date/day-key.test.ts` |
| 22 × `from '@/lib/key-dates'` | 22 × `from '@brandfactory/shared'` |

`key-dates-prefs.ts` stayed in web, deliberately. It is a `localStorage` preference, and *a user
preference is not a column* — nor is it shared data. It now imports the types from `shared` like
every other consumer.

Tests travelled with their code, which is why `calendar.test.ts` lost two `describe` blocks and one
case and gained nothing: the same assertions run, in the package that now owns the functions.

## The gate

`typecheck`, `lint`, `format:check`, `test`, and both builds. 2939 passed, 165 skipped, **3104
total** — identical to the count `297c468` recorded. A move that changes a test count is not a move.
