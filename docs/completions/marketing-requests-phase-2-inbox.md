# Marketing requests Phase 2 (MKT-5) — the inbox on the real routes

**Plan:** `docs/executing/marketing-request-form-plan.md`. **Migration:** none (0026 landed in
Phase 1). **Wire:** none new — `packages/web-next` now calls the Phase 1 routes.

## What changed

- **`features/marketing-requests/api.ts` and `hooks.ts`** call `bf`, under the new scope
  `bf-marketing-requests`. The Ops `form-submissions` scope, the `FormSubmission` and
  `SubmissionStatus` aliases and the public submit are gone.
- **`inbox.ts`** holds the pure logic, with tests: the URL readings (`?status=`, `?mine=1`), the
  search predicate, the rung counts, the brand's outlets, and the form's problem sentence and
  payload. A cleared box sends `null`.
- **The form** asks for a brand (required), then an outlet of that brand (optional, cleared when
  the brand changes), type, priority, summary, details and needed-by. Who asked is the session.
- **The request sheet** moves the status (four rungs; `declined` is new) and takes the request:
  "Assign to me", "Take it over", "Unassign me". Assigning someone else waits for a route that
  lists a workspace's people.
- **The inbox** has an Assigned column, an "Assigned to me" toggle, and its filters in the URL
  (it renders under `<Suspense>` now). The search matches the reference, summary, brand, outlet
  and requester — each visible in the row, so the highlight can mark it.
- **`/f/request` redirects** to `/marketing-requests?new=1`, which opens the form behind sign-in.
  Any other `/f/<slug>` is a 404.
- **Deleted in one change, as the fixture asked:** `fixtures/marketing-requests.ts` and its test,
  the `MockBanner` on this screen, the "Sample" nav tag, `fixture.ts`, `form-fields.tsx`,
  `public-form.tsx`, and the `WRITES` list in `lib/api/mock.ts`. Rule 3 — every mutation refuses
  with a 503 — is total again, and `mock.test.ts` asserts the old write paths refuse.

## Verified

- Gate: typecheck, lint, format, `pnpm test` (3063 passed, 174 skipped — the drop from Phase 1 is
  the deleted fixture's tests), both builds, web-next lint.
- Browser pass against a local Postgres and the local auth provider: `/f/request` landed on the
  open form; the outlet select listed only Casa Vostra's outlets; the request saved as `MR-1001`
  under the signed-in user; "Assign to me" and a move to Declined both saved; after a reload,
  `?mine=1` showed the one row. No console errors.

## Not done here

- Editing a request's fields after it is filed.
- Assigning anyone but yourself.
- Undo for a delete (there is no delete control on screen yet).
