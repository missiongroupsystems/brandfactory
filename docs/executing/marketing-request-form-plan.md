# MKT-5 — The marketing request form

**Status:** proposal. Nothing below is built. Written 4 October 2026.

**Source:** Module 02 build plan, `docs/refs/2026-09-16-marketing-build-plan-module-02.md`, finding 6 and MKT-5: _"The marketing request form they asked for can be built with forms that already exist, once they have accounts."_

## The ask

The business asks marketing for work through chat and email: a post for an outlet's new menu, signage for a supplier change, a shoot. Natalie and Chloe want **one form to ask through and one inbox to answer from**, so that no request lives only in somebody's messages.

## What already exists

The screens exist and the storage does not.

- **`/marketing-requests`** in `packages/web-next` is an inbox: a status ladder (`new`, `in_review`, `resolved`), a request sheet, and a "New request" sheet with the form.
- **`/f/request`** is the same form as a standalone page outside the app shell, with no sign-in.
- **The form's fields** are in `features/marketing-requests/fixture.ts`: outlet, requested by, request type (eight values), priority (four), summary, details, needed by, contact email.
- **The rows are a sample.** They are a module-level array in `fixtures/marketing-requests.ts`, written through `lib/api/mock.ts`'s one write exception. Nothing survives a reload. The screen carries a `MockBanner` and the nav item a "Sample" tag. The fixture's docstring says to delete it in the same commit that lands the real table.
- **The transport is the Operations Hub's** (`apiFetch`, snake_case `FormSubmission`). The real version moves to `bf` and `@brandfactory/shared`, like influencers and vendors did.

So MKT-5 is a backend, a transport switch and three decisions. It is not new screens.

## Decisions for the product owner

### 1. Who can submit

| Option | What it means | Cost |
| --- | --- | --- |
| **A. Signed-in users only** (recommended for the first release) | Requesters need a Launchpad account. The request records who sent it from the session. | Every requester needs an account. The form is `/marketing-requests` → "New request". `/f/request` is removed or redirects to sign-in. |
| B. Anyone with the link | `/f/request` stays public. The requester types their name and email. | An unauthenticated write route on the server. It needs a rate limit (the server has none today), a spam check and a size cap. The name and email are not verified. |
| C. Both | A first, then B behind a workspace setting. | B's cost, later. |

**Recommendation: A.** The plan already ties MKT-5 to accounts. A public write route is the first unauthenticated write on this server, and it is worth its own phase.

### 2. What a request names: a brand, an outlet, or both

The sample form asks for an **outlet**. Brand Base's unit is the **brand**, and an outlet belongs to exactly one brand. **Recommendation:** brand required, outlet optional and narrowed to that brand's outlets. A group-wide request picks the brand it is mostly for. A request for "all brands" is a request the team splits.

### 3. What an accepted request becomes

| Option | What it means |
| --- | --- |
| **A. Nothing automatic** (recommended for the first release) | The request is a ticket. Marketing moves it through the ladder and writes the work wherever it goes. |
| B. "Plan it" creates a calendar entry | A button on the request creates an empty calendar slot for its brand on its "needed by" day, linked back to the request. |

**Recommendation: A first, then B.** B is cheap once A exists, because a calendar entry can already link to a shoot and an event. It adds one more nullable link. Its value is visible only after the team uses the inbox for a few weeks.

## The build, if A, brand-plus-outlet and A are chosen

### Phase 1 — table and routes

- **Table `marketing_requests`**, workspace-scoped:
  - `id`, `workspace_id`, `brand_id` (required), `outlet_id` (nullable, must belong to the brand).
  - `reference` — `MR-<n>`, sequential **per workspace**, assigned in the insert transaction. People quote it in chat, so it must be short and stable.
  - `type` and `priority` — pgEnums, from the fixture's lists. `status` — `new`, `in_review`, `resolved`, `declined`. The sample has no `declined`. A request marketing will not do is not "resolved", and the reader needs to know the difference.
  - `summary` (required), `details`, `needed_by` (a date, not a timestamp; Singapore day).
  - `requested_by_user_id` (from the session), `assignee_user_id` (nullable).
  - `created_at`, `updated_at`, `resolved_at`, `deleted_at`.
- **Routes**, all behind the auth gate and `requireBrandAccess` or `requireWorkspaceAccess`:
  - `GET /workspaces/:id/marketing-requests` — the whole set, like influencers and vendors, with a tripwire comment at ~500 rows.
  - `POST /workspaces/:id/marketing-requests`.
  - `PATCH /marketing-requests/:id` — status, assignee, the fields.
  - `DELETE /marketing-requests/:id` — soft.
- **Shared schemas** in `@brandfactory/shared`. A generated migration.
- **Tests:** the route tests with fakes, the reference sequence under two concurrent inserts, an outlet from another brand refused, and an `*.live.test.ts` for the sequence.

### Phase 2 — switch the screens

- `features/marketing-requests/api.ts` moves to `bf`. Types come from `@brandfactory/shared`.
- The form's outlet select becomes a brand select plus an outlet select.
- **Delete in one commit:** `fixtures/marketing-requests.ts`, its `WRITES` entry in `mock.ts`, the `MockBanner`, the "Sample" tag. Update `mock.test.ts`, which asserts the exception exists.
- `/f/request` redirects to the in-app form (decision 1A).
- The inbox gets an assignee column and a filter for "mine".

### Phase 3 (later) — "Plan it"

A nullable `marketing_request_id` on `social_posts`, and a button on the request sheet. Its own plan when the team asks for it.

## Not in this plan

- **Notifications.** No email or chat message when a request arrives or changes. The team checks the inbox. Add this when the inbox has a week of real use, and only through an adapter port.
- **Attachments on a request.** A requester who has a file sends a link in "details". Attachments can reuse the calendar's library picker later.
- **SLA timers.** "Needed by" and the priority are shown; nothing counts down.

## Depends on

- **Accounts for every requester** (decision 1A). This is a people task on Launchpad, not a build.
- **The Fly backend running.** Nothing in this plan works while the API is down.

## Done when

- A signed-in user submits a request, and it survives a reload.
- Marketing moves it through the ladder, assigns it and declines it, from the inbox.
- No sample rows, banner or "Sample" tag remain.
- The full gate passes. The changelog states the migration number and the test count.
