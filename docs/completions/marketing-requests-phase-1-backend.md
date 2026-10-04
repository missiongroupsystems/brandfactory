# Marketing requests Phase 1 (MKT-5) — the table and the routes

**Plan:** `docs/executing/marketing-request-form-plan.md`. **Migration:** `0026_sloppy_juggernaut`.
**Wire:** five new routes. **Screens:** none changed — Phase 2 switches the inbox.

## Decisions taken

The product owner took all three recommendations on 4 October 2026:

1. **Signed-in users only.** The requester is the session's user, never a body field. `/f/request`
   stays a sample until Phase 2 redirects it.
2. **A brand is required; an outlet is optional and must belong to that brand.**
3. **A request is a ticket.** Nothing is created on accept. "Plan it" is a later phase.

## What landed

- **`marketing_requests`** — workspace-scoped; `brand_id` cascades, `outlet_id` and both user
  columns `SET NULL`. Three pgEnums: type (eight values, the sample form's list), priority (four),
  status (`new`, `in_review`, `resolved`, `declined`). `declined` is new: the sample's three-rung
  ladder could not say "we will not do this".
- **The number.** `MR-1001` upward, per workspace. The create locks the workspace row
  `FOR UPDATE` and reads the maximum, so concurrent submits queue rather than collide; the unique
  key is the backstop. Soft-deleted rows count, so a number somebody quoted is never reissued.
- **People are joined, not copied.** `requestedBy` and `assignee` come from two left joins on
  `users`, so a rename shows everywhere. A session whose user row is missing files the request with
  no requester rather than a 500 on the foreign key.
- **`resolvedAt`** is set on the move into a closed state, kept across `resolved` ⇄ `declined`, and
  cleared on reopening.
- **Routes** under `/workspaces/:workspaceId/marketing-requests`: list (exhaustive, newest first),
  create, get, patch, soft delete. Typed misses answer 400 with `BRAND_NOT_IN_WORKSPACE`,
  `OUTLET_NOT_IN_BRAND` or `ASSIGNEE_NOT_FOUND`. A patch that changes the brand checks the kept
  outlet against the new brand.

## Tests

- `packages/shared/src/marketing-request/request.test.ts` — 9.
- `packages/server/src/routes/marketing-requests.test.ts` — 13, against the fake.
- `packages/db/src/marketing-requests.live.test.ts` — 9, against Postgres 16, including six
  concurrent creates.

Gate: typecheck, lint, format, both builds and web-next lint pass. `pnpm test`: 3065 passed, 174
skipped. With a local database, the whole `db` project passes except two name-order tests in
`outlets.live.test.ts` and `vendors.live.test.ts`; the scratch cluster used `C.UTF-8` collation, and
those tests assume a linguistic one. Neither file is touched here.

## Not done here

- **Phase 2** — the inbox and the form on `bf`, the sample fixture deleted.
- **A user list for the assignee picker.** No route lists a workspace's people yet. Phase 2 needs
  one, or starts with "assign to me".
- **Restore.** There is no undo for a delete yet; the row is kept, so one is a small route later.
