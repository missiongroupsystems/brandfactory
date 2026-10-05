# Marketing requests (MKT-5) — Phases 1 and 2

**Plan:** `docs/completions/marketing-request-form-plan.md`. **Released in:** 1.58.0.
**Migration:** `0026_sloppy_juggernaut` — one table, three pgEnums. **Wire:** five routes under
`/workspaces/:workspaceId/marketing-requests`. **Screens:** the inbox and the request sheet move off
their fixture; `/f/request` redirects. **New dependency:** none.

**Source:** Module 02 build plan, `docs/refs/2026-09-16-marketing-build-plan-module-02.md`, finding
6 and MKT-5: *"The marketing request form they asked for can be built with forms that already
exist, once they have accounts."*

The business asks marketing for work through chat and email: a post for an outlet's new menu,
signage for a supplier change, a shoot. Natalie and Chloe want **one form to ask through and one
inbox to answer from**, so that no request lives only in somebody's messages.

The screens existed and the storage did not, which is the whole shape of the split: Phase 1 is the
table and the routes with no screen change, Phase 2 switches the screens onto them and deletes the
fixture.

## Decisions taken

The product owner took all three recommendations on 4 October 2026:

1. **Signed-in users only.** The requester is the session's user, never a body field.
2. **A brand is required; an outlet is optional and must belong to that brand.**
3. **A request is a ticket.** Nothing is created on accept. "Plan it" is a later phase.

## Phase 1 — the table and the routes

- **`marketing_requests`** — workspace-scoped; `brand_id` cascades, `outlet_id` and both user
  columns `SET NULL`. Three pgEnums: type (eight values, the sample form's list), priority (four),
  status (`new`, `in_review`, `resolved`, `declined`). `declined` is new: the sample's three-rung
  ladder could not say "we will not do this".
- **The number.** `MR-1001` upward, per workspace. The create locks the workspace row `FOR UPDATE`
  and reads the maximum, so concurrent submits queue rather than collide; the unique key is the
  backstop. Soft-deleted rows count, so a number somebody quoted is never reissued.
- **People are joined, not copied.** `requestedBy` and `assignee` come from two left joins on
  `users`, so a rename shows everywhere. A session whose user row is missing files the request with
  no requester rather than a 500 on the foreign key.
- **`resolvedAt`** is set on the move into a closed state, kept across `resolved` ⇄ `declined`, and
  cleared on reopening.
- **Routes**: list (exhaustive, newest first), create, get, patch, soft delete. Typed misses answer
  400 with `BRAND_NOT_IN_WORKSPACE`, `OUTLET_NOT_IN_BRAND` or `ASSIGNEE_NOT_FOUND`. A patch that
  changes the brand checks the kept outlet against the new brand.

### Tests

- `packages/shared/src/marketing-request/request.test.ts` — 9.
- `packages/server/src/routes/marketing-requests.test.ts` — 13, against the fake.
- `packages/db/src/marketing-requests.live.test.ts` — 9, against Postgres 16, including six
  concurrent creates.

Gate: typecheck, lint, format, both builds and `web-next` lint pass. `pnpm test`: 3065 passed, 174
skipped. With a local database, the whole `db` project passes except two name-order tests in
`outlets.live.test.ts` and `vendors.live.test.ts`; the scratch cluster used `C.UTF-8` collation, and
those tests assume a linguistic one. Neither file is touched here.

## Phase 2 — the inbox on the real routes

No migration and no new route — this phase points `packages/web-next` at Phase 1's.

- **`features/marketing-requests/api.ts` and `hooks.ts`** call `bf`, under the new scope
  `bf-marketing-requests`. The Ops `form-submissions` scope, the `FormSubmission` and
  `SubmissionStatus` aliases and the public submit are gone.
- **`inbox.ts`** holds the pure logic, with tests: the URL readings (`?status=`, `?mine=1`), the
  search predicate, the rung counts, the brand's outlets, and the form's problem sentence and
  payload. A cleared box sends `null`.
- **The form** asks for a brand (required), then an outlet of that brand (optional, cleared when the
  brand changes), type, priority, summary, details and needed-by. Who asked is the session.
- **The request sheet** moves the status (four rungs; `declined` is new) and takes the request:
  "Assign to me", "Take it over", "Unassign me". Assigning someone else waits for a route that lists
  a workspace's people.
- **The inbox** has an Assigned column, an "Assigned to me" toggle, and its filters in the URL (it
  renders under `<Suspense>` now). The search matches the reference, summary, brand, outlet and
  requester — each visible in the row, so the highlight can mark it.
- **`/f/request` redirects** to `/marketing-requests?new=1`, which opens the form behind sign-in.
  Any other `/f/<slug>` is a 404.
- **Deleted in one change, as the fixture asked:** `fixtures/marketing-requests.ts` and its test,
  the `MockBanner` on this screen, the "Sample" nav tag, `fixture.ts`, `form-fields.tsx`,
  `public-form.tsx`, and the `WRITES` list in `lib/api/mock.ts`. Rule 3 — every mutation refuses with
  a 503 — is total again, and `mock.test.ts` asserts the old write paths refuse.

### Verified

- Gate: typecheck, lint, format, `pnpm test` (3063 passed, 174 skipped — the drop from Phase 1 is
  the deleted fixture's tests), both builds, `web-next` lint.
- Browser pass against a local Postgres and the local auth provider: `/f/request` landed on the open
  form; the outlet select listed only Casa Vostra's outlets; the request saved as `MR-1001` under the
  signed-in user; "Assign to me" and a move to Declined both saved; after a reload, `?mine=1` showed
  the one row. No console errors.

## Not done here

- **Phase 3, "Plan it"** — a nullable `marketing_request_id` on `social_posts` and a button on the
  request sheet. Deferred by the plan to its own plan, when the team asks for it.
- **Editing a request's fields** after it is filed.
- **Assigning anyone but yourself.** No route lists a workspace's people. `GET /members`, which
  1.58.0 shipped in the same release, is now a candidate.
- **Undo for a delete.** The row is kept, so a restore route is small when a delete control reaches
  the screen.
- **Notifications.** No email or chat message when a request arrives or changes. The team checks the
  inbox. Add this when the inbox has a week of real use, and only through an adapter port.
- **Attachments on a request.** A requester who has a file sends a link in "details". Attachments
  can reuse the calendar's library picker later.
- **SLA timers.** "Needed by" and the priority are shown; nothing counts down.
