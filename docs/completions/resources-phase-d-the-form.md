# Phase 1D — the form and the delete

**Plan:** `docs/executing/four-asks-implementation-plan.md`, Phase 1D. Last phase of Plan 1;
**this release ships Resources** (Phase 0, 1A, 1B, 1C and 1D together).
**Files:** new `features/resources/components/resource-form.tsx`, `resource-form.test.tsx`;
modified `features/resources/{api.ts,hooks.ts}`, `components/resources-view.tsx`,
`components/resources-view.test.tsx`.
**Migration:** none — Phase 1A's `0017_productive_slyde.sql` is the only one Plan 1 owns.
**Wire:** unchanged — `POST`/`PATCH`/`DELETE /brands/:id/resources[/:resourceId]`, all landed in
Phase 1B.
**New dependency:** none.

## The plan asked for an optimistic delete, and this does not do that

Step 1 of this phase, as written, names a third test: *"removes the row optimistically and
restores it if the delete fails."* Every other mutation hook in `web-next` — `outlets/hooks.ts`,
`vendors/hooks.ts`, `brands/hooks.ts`, `brand-profile/hooks.ts`, `registry/hooks.ts`,
`registry-brands/hooks.ts`, `licenses/hooks.ts`, `marketing-requests/hooks.ts`,
`contracts/…/contract-detail.tsx`, `influencers/hooks.ts` — states the opposite rule, some of
them twice, and `AGENTS.md`'s own "Mutations" section states it as a whole-package convention:
nothing here is optimistic, because the server enforces rules the client does not know and its
answer is the only one worth rendering.

Building the literal instruction would have made resource delete the first and only optimistic
mutation in the package, at the exact moment three more phases (2E, 3D, 4D) are about to copy
this phase's shape. Raised rather than guessed at; the resolution was to follow the established
convention instead of the plan's prose, on the reasoning that a resource delete is in fact the
*weakest* case for optimism — it is a hard delete with no domain rule behind it, so there is
nothing to gain from not waiting for the server, and a real cost to becoming the one inconsistent
mutation in the codebase.

Test 3 is rewritten to match: **"a failed delete leaves the row in place and surfaces the
server's refusal."** The row is held until the request settles, on `VendorResults`' shape exactly
— `ConfirmDialog` stays open, the server's own sentence renders inside it, and the reader can
retry or cancel. Nothing disappears ahead of the server's answer, so there is nothing to restore.

## The three tests

```ts
// resource-form.test.tsx
it("refuses to submit an empty title", () => {})
it("shows the server's own refusal rather than blaming the network", () => {})

// resources-view.test.tsx
it("a failed delete leaves the row in place and surfaces the server's refusal", () => {})
```

**The first** fills in a valid URL, leaves Title at its empty default, and asserts `create` is
never called — the browser's own `required` constraint blocks the submit before the handler runs,
checked on `title.validity.valid` rather than a jest-dom matcher (this package does not set
jest-dom up; every assertion in both new test files is a native DOM property or a plain
`.textContent` check, on `resources-view.test.tsx`'s existing style).

**The second** is the regression test for 1.33.1's *"a form that blamed the network for the
server's own refusal."* That release found `hooks/use-submit.ts` recognising only `ApiError`, the
Operations Hub's class, so a BrandFactory `AppError` — a real, fast, correct 400 from the Hono
server — fell through to *"Could not reach the API. Check that the backend is running."*
`use-submit.ts` has carried both branches since that fix; this test proves `ResourceForm` actually
goes through it rather than reinventing its own error ladder that could reintroduce the same gap.
It mocks `create` to reject with `new AppError("title: Too small", "VALIDATION", 400)` and asserts
the alert reads that sentence, not the network one.

**The third** (see above) mocks `remove` to reject with a 404 `AppError` — the realistic failure
mode for a resource delete, since the route is a hard delete with no domain refusal, only
"already gone." It confirms the delete through the dialog, asserts `remove` was called, then
asserts the row's text is still in the rendered tree and the dialog's alert carries the server's
sentence. Presence is checked against `container.textContent` rather than `getByRole`: an open
`AlertDialog` marks the rest of the page `aria-hidden` (Base UI's inert focus trap), so a
role-based query for the row would fail whether or not the row were actually still there — that
would be testing the focus trap, not this claim.

## The form

`resource-form.tsx` mirrors `outlet-form.tsx`'s shape: one component for create and edit, the
mode is `resource ? "edit" : "create"`, and the draft resets *during render* when `open` flips
true rather than in an effect — the pattern `AGENTS.md` records twice, because keying
`SheetContent` on anything that changes when the sheet closes wedges Base UI's dismissal.

Four fields: **Type** (the six-member enum, a native `<select>` off `RESOURCE_TYPE_OPTIONS` —
the same source of truth the grouped view already reads, not a second copy), **Title**, **URL**
(`type="url"`, `AssetLinkUrlSchema`'s http(s)-only rule enforced server-side and by the browser's
own URL constraint client-side), and **Note** (optional, `toNullable` on submit so a cleared box
sends `null` rather than `""`).

## The mutations

`useResourceMutations(brandId)` in `hooks.ts` is `useOutletMutations` / `useVendorMutations`'s
shape exactly: plain async functions that call the service and then `invalidate(...RESOURCE_SCOPES)`
— every one of create/update/remove sweeps `SCOPES.bfResources`, so a create is a row in the table
without a reload. There is no `bfResource` singular scope, unlike outlets and vendors: the server
exposes no `GET /brands/:id/resources/:resourceId`, so there is no per-record cache entry to keep
in step with the list.

`brandId` is a parameter to the hook, not read from `useActiveBrand()` — the same reason
`useResources` (Phase 1C) takes it as a parameter: the route already names the brand, so there is
nothing to resolve.

`api.ts` gains `create`/`update`/`remove` against the three routes Phase 1B built, typed through
`bf` (`AppType`), so a renamed segment on the server is a type error here rather than a 404 in a
browser.

## The view

`resources-view.tsx` gains an "Add resource" button (always rendered, above the loading/empty/
error/populated states, matching `OutletsBrowser`'s placement of its own create action), and each
row gains an edit pencil and a delete trash icon. Edit opens `ResourceForm` with the row; delete
opens `ConfirmDialog` — the same component `VendorResults` uses, which keeps the dialog open and
shows the refusal in place until the promise settles, rather than a toast behind a closing panel.

The stale docstring line — *"Read-only. No create, no edit, no delete: Phase 1D adds the form"* —
and the empty state's *"Phase 1D adds the way to record one"* are both rewritten: the screen is no
longer read-only, and there is no future phase left to point at.

## The gate

```
pnpm typecheck                         ✓  11 packages
pnpm lint                              ✓
pnpm format:check                      ✓  (one pre-existing, unrelated failure: untracked
                                            .claude/commands/commit.md — not this phase's)
pnpm test                              ✓  2928 tests
pnpm -F @brandfactory/web build        ✓
pnpm -F @brandfactory/web-next lint    ✓
pnpm -F @brandfactory/web-next typecheck  ✓
pnpm -F @brandfactory/web-next build   ✓  /brands/[id]/resources ƒ (Dynamic), unchanged from 1C
```

`pnpm test` ran with `DATABASE_URL` pointed at the throwaway dev database on `:5490`; the `db`
package's `*.live.test.ts` files ran rather than skipped.
