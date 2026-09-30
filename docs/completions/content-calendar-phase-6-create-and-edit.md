# Content calendar Phase 6 — the calendar can be written to

**Shipped in:** 1.56.0. **Migration:** none. **Wire:** none — every route this uses already
existed. **New dependency:** none.

## What this phase is

Phases 4 and 5 shipped `/calendar` read-only on purpose, and both said creating and editing from
the grid was the next piece of work. Without it the new screen showed the plan and the old app was
the only place to change it, so the team still needed two tools. This phase is the plan's
"Phase 6 — create and edit from `/calendar`" section.

The server needed nothing. `POST`, `PATCH`, `DELETE` and `POST …/restore` on
`/brands/:id/social-posts` were already there from phase 2, with the approval stamp set by the
route. So this is `web-next` only.

## What it does

- **`New entry`** in the toolbar — the screen's one primary button. It starts on the brand the
  reader has filtered to.
- **`Add to this day`** in the day plan, with the date filled in.
- **A click on an entry** — a chip on the grid, `Edit` on a day-plan card, or the date in a list
  row — opens the same sheet on that entry. A chip used to open the day; the day number still does.
- **Delete** in the sheet is the existing soft delete, and its toast carries an **Undo** that
  calls restore.

One sheet, `components/entry-form.tsx`, on `ResourceForm`'s shape: the draft resets during render
when `open` flips true, never in an effect, and `SheetContent` is not keyed.

## Decisions

**A date is required.** `/calendar` reads scheduled rows only (phase 4's decision), so an entry
created here without a date would be saved and then vanish from the screen that saved it. The
per-brand tray still holds undated ideas. A new entry starts at 10:00, because a slot needs a
timestamp and midnight would print `00:00` on every chip as if somebody had chosen it.

**Brand and type are fixed once an entry exists.** The route cannot move a post between brands and
the patch schema has no `kind`. The sheet shows both as disabled controls rather than hiding them,
so the reader can see which brand they are editing.

**An edit sends only what changed.** `toUpdateInput` compares the draft with the row and returns
the changed keys, or `null`. Two people plan the same month; a patch that re-sent every field would
put back a hook a colleague rewrote a minute earlier, from a sheet that only meant to move the
time. And the patch schema refuses `{}`, so "nothing changed" closes the sheet without a request
and without a toast. Times are compared as instants, because the server may echo `…00.000Z` for a
value sent as `…00Z`.

**The date and time are built from parts.** `new Date(year, month, day, h, m)` rather than parsing
a string, and a day that rolls over — 31 February becoming 3 March — is refused rather than saved.

**Two cache scopes.** A write revalidates `bfCalendarEntries` for the grid and `bfSocialPosts` for
the funnel's post picker and the brand's social page. `useRevalidate`, not `useInvalidate`, so the
month stays on screen while the new answer loads. Nothing is optimistic, like every other mutation
in the package.

**The writes live in `features/calendar/api.ts`**, beside the screen that makes them, and go to the
brand routes rather than a workspace route: `requireBrandAccess` is where a post's brand is
checked, and a workspace-level write would be a second door past it.
`features/social-posts/api.ts` stays read-only and now says where the writes went.

## What is deliberately absent

- **Linking a post to a shoot (`shootId`) or to an event (`eventsEventId`).** The schema holds both.
  Each needs a picker, and a picker over another month's shoots or another product's events is
  its own piece of work.
- **Attachments.** The legacy editor still owns the asset picker.
- **The week view.** Still last in the plan's order.
- **Screen tests.** CLAUDE.md is explicit that `web-next` tests auth and workspace resolution, not
  the screens. The logic worth asserting — date and time to ISO, blanks to `null`, the changed-keys
  diff, and both payloads against the real zod schemas — is in `entry-form.ts`, and that is where
  the 14 tests are.

## The browser pass

Against a local Postgres, migrated and seeded, with the server and `next dev` running, a Playwright
script signed in with the dev token and did these steps:

1. created a Casa Vostra post with a hook, a dish and talent;
2. created an empty Willow slot from `Add to this day` and checked the prefilled date;
3. changed only the status, and asserted that the `PATCH` body was exactly `{"status":"approved"}`;
4. checked that the day plan showed "Cleared on";
5. opened the sheet from a list row;
6. deleted the post and brought it back with Undo.

All six passed, with no console errors.

## The gate

`typecheck`, `lint`, `format:check`, `test`, both builds, plus `web-next`'s own lint, typecheck and
build. **3195 tests: 3030 passed, 165 skipped** (the live-database files), 14 of them new. The
machine was idle this time, with a load average of 3.
