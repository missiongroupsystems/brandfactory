# Passport sync consumer, phase 4 — placement, access derivation, identity linking

**Status:** complete, 2026-08-17. Written against `main` at **1.34.0**
(2060 passed | 92 skipped before → **2101 passed | 92 skipped** after; +41 tests).

Executes phase 4 of
[`docs/executing/passport-sync-consumer-plan.md`](../executing/passport-sync-consumer-plan.md).

**No migration.** The credentials arrived, so **step 0 is no longer an assumption** —
placement is read from the live registry at startup. Nothing on a request path calls
the derivation yet; `authz.ts` is untouched and still runs the interim shared-access
model, so no user-visible behaviour changes.

---

## What landed

| File | Change |
| --- | --- |
| `packages/db/src/queries/passport-read.ts` | **new** — the projection's read path, unrestricted by design |
| `packages/server/src/passport/registry.ts` | **new** — step 0, read once at startup, cached |
| `packages/server/src/passport/registry.test.ts` | **new** — 15 tests, against the real response body |
| `packages/server/src/passport/access.ts` | **new** — the derivation and the identity-link write |
| `packages/server/src/passport/access.test.ts` | **new** — 26 tests; every gate, ladder and denial |
| `packages/server/src/main.ts` | awaits the registry read before the server listens |
| `packages/db/src/index.ts` | exports the read path |

## 1. What the registry actually says

Confirmed against `https://mission-passport.fly.dev/api/v1/apps/me/registry`,
`HTTP 200`:

```json
{
  "unit_scopes": ["entity", "brand", "outlet"],
  "role_cascade": false,
  "id": "cddc45e1-8f19-4898-b3c8-33d34a985390",
  "key": "marketingbase",
  "name": "Marketing Base",
  "description": "One brand context. Endless consistent creative.",
  "status": "active",
  "unit_scope": null
}
```

Three things follow, and two of them were surprises.

### The app is registered as "Marketing Base", not BrandFactory

Its key is **`marketingbase`**. `PASSPORT_APP_ID` in `.env` matches the registry `id`,
and the description is unmistakably this product's positioning, so it is the right
app under a different name.

This matters twice over. The seeding guidance warns explicitly not to guess an app key
from the repository name — one consumer's repo is `geddit-one` while its Passport key
is `sourcing`, and a name-based guess "silently matches nothing, or worse, the wrong
app". And whoever grants the entitlement will be looking for **Marketing Base** in the
console, not BrandFactory.

### `unit_scope` is `null` — the trap, observed rather than theorised

Phase 4's design assumed this could happen; the live registry confirms it does. The
singular field is derived, names only five of the seven possible combinations, and is
`null` for the rest — including **all three types**, which is exactly this app's shape.

A reader that took placement from it would read `null`, fall back to the documented
`["brand"]` default, and **silently narrow this app to brands**. No error, no symptom
beyond people not seeing units they should. `registry.ts` destructures `unit_scopes`
and `role_cascade` by name so the singular field is not even in scope, and
`registry.test.ts` pins the real body — including a case where the two fields
contradict each other, so a future change to the derived field cannot move us.

### `role_cascade: false` is forced, not chosen

Passport permits `true` **only** on exactly `{entity, outlet}` or `{brand, outlet}` and
answers `422` otherwise (`backend/app/domain/unit_scope.py::cascade_relation`). On a
three-type placement the cascade is unavailable, so every unit needs its own role row
— or the person is an org `Owner`/`Admin` and holds `Manager` everywhere by the ladder.

**`D3` is therefore a real either/or**, and phase 4 pins both sides of it: one test
asserts a brand role does *not* reach its outlet on today's placement, and another
asserts it *does* once placement narrows to `{brand, outlet}` with the cascade on, with
an explicit outlet role overriding the inherited one. Answering `D3` later is a console
change plus a restart, not a rewrite.

## 2. The snapshot is empty, and that means one specific thing

All eight collections return zero. That is **not** evidence of a problem and not
evidence of health: the snapshot is entitlement-scoped, so it returns eight empty
collections whether or not anything is wrong.

What it means is that **no org is entitled to Marketing Base yet**. Until one is,
nothing is delivered, nothing is reconciled, and every derivation correctly returns an
empty map. Granting it is a super-admin action in the Passport console and is the first
step of the operator gate before phase 8.

## 3. The derivation, and the six things a hand-rolled join forgets

`rolesAtUnits` from the SDK is the one implementation, and `hasAppAccess` is *defined*
as the emptiness of its result, so the two cannot disagree. What the helper gets right:

| Fact | The failure without it |
| --- | --- |
| `orgRole` — the **ladder** | An active Owner/Admin holds `Manager` at every unit carrying the app **with no role row at all**. Pass `null` and every Owner and Admin is silently denied. |
| `orgRole === null` as a **full gate** | Suspension deliberately does not cascade to role rows, so a suspended member's rows are still `active`. `role ?? null` lets a disabled person keep working. |
| `orgId` | An Owner of org A becomes a Manager at every unit of org B. We hold units and switch rows for every entitled org, so this bites the day a second org exists. |
| `unit_app_access` | A unit carrying no row confers access to **nobody**, not even an Owner. This is the "we imported the brands and nobody can see anything" failure. |
| `unit.status` | An archived unit must confer nothing, with no role row changing. |
| entitlement defaulting to **inactive** | Defaulting the other way grants everything in an org this app was never entitled to — which is every org right now. |

Each has its own test. Two more that matter as much:

- **The result is a MAP and is never collapsed.** One test grants at unit A and asserts
  `undefined` at unit B — a global-flag implementation passes every other case in the
  file and fails that one. It is the only check that catches the over-grant.
- **`relations` is threaded through unconditionally**, even though it changes no answer
  while the cascade is off, and a test asserts the read happens. Omitting it on a
  cascading app drops every *inherited* role while explicit ones keep working — a
  smaller map and no error, which reads as bad data and is a bad call site.

**There is deliberately no unit-type test in the derivation.** Placement is enforced by
Passport's database triggers, so a `unit_app_access` row that exists is already
well-typed. `unitScopes` says where rows *can* be created — a question for seeding and
for the UI, not for an access check.

## 4. Identity linking — resolved by verified email, failing closed

The one sanctioned local write into `passport.*`, on **every** login rather than the
first, because it is idempotent and self-heals a row left stale by a re-provision.

- `platformUserId` comes from the membership projection **by verified email**, matched
  case-insensitively because the projection stores Passport's casing. Never a token's
  `sub` claim: that is an auth-user id from a different UUID space, and a wrong value
  here is *worse* than a missing row — it looks linked, resolves to zero orgs forever,
  and nothing errors.
- **Two case-variant memberships fail closed.** `findPassportMembershipsByEmail`
  returns every match rather than the first, because the count is the point: on a path
  that hands out a session, picking one silently authenticates somebody as the wrong
  person.
- Replace rather than update, since `identity_link` rows are immutable per row in
  Passport's model.
- `reportIdentityLink` is not called. It is closed by policy and answers `410`, and on
  the hosted-login branch it was always a silent no-op anyway.

## 5. Reads are projection-first, and that is written at the code

No TTL cache in front of these queries, and no API-first path with the projection as a
fallback. The second is the tempting one and it is worse than it looks: it pays for the
projection pipeline *and* adds a network hop plus a hard dependency on Passport's uptime
to the hottest reads — and it gives the same authorization check strong consistency
when Passport is up and eventual consistency when it is down.

Unlike the write path, the reads are **unrestricted**. Reading the projection from
anywhere is the entire point of having it.

## 6. The registry read actually runs, proven by running it

`main.ts` awaits `loadPassportPlacement` **before the server listens**, so no request
can reach the derivation before the answer exists. Verified against the live registry
through the production code path, not a test double:

```
{"level":"info","msg":"passport placement read from registry",
 "key":"marketingbase","unitScopes":["entity","brand","outlet"],"roleCascade":false}

placement in memory: {"unitScopes":["entity","brand","outlet"],"roleCascade":false,
  "appId":"cddc45e1-…","key":"marketingbase","authoritative":true}
```

`authoritative: true` — the fallback did not fire.

Four properties around that read:

- **It never throws.** An unreachable registry falls back to brand-only and logs that
  it did. Refusing to boot would make Passport a hard dependency for serving
  app-native users.
- **The fallback is flagged, not silent.** `authoritative: false` plus a warning
  containing "ASSUMED brand-only", so it cannot be mistaken for a fact.
- **The response is validated, not trusted.** An unrecognised unit type falls back
  rather than widening what we believe about placement.
- **A `PASSPORT_APP_ID` mismatch is logged as an error** — it would mean the API key
  and the configured app id belong to different apps, so every role row would resolve
  against the wrong one.

`passportPlacement()` throws if called before the load, deliberately: the alternative
is a per-request fetch, which is wasteful and lets the answer change mid-session.

Also confirmed: the real `.env` boots cleanly through phase 1's coherence checks, with
`PASSPORT_SUPABASE_URL` unset so SSO stays inactive and the login is unchanged.

## 7. The gate

```
pnpm typecheck                    all 11 packages    pass
pnpm lint                         eslint, whole repo pass
pnpm format:check                 prettier           pass
pnpm test                         2101 passed | 92 skipped
pnpm -F @brandfactory/web build   tsc + vite         pass
```

## 8. What is deliberately still missing

- **Nothing calls the derivation.** `authz.ts` is untouched. Wiring it is phase 8, and
  doing it before the operator gate would lock everyone out rather than shrink anyone's
  access.
- **No reconciliation** (phase 5) — it needs the same credentials, which now exist.
- **No login change** (phase 6). `PASSPORT_SUPABASE_URL` is unset, so SSO is inactive
  and every user is on the app-native branch, exactly as before.
- **The `Db` facade does not carry the projection reads yet.** It gains them in phase 8,
  when a request path first needs them.

## 9. Needed from the operator

**Nothing blocks phase 5.** These block phases 6 and 8:

| Needed | Blocks | Note |
| --- | --- | --- |
| An **entitlement** for an org on **Marketing Base** | any real data at all | Super-admin only. Until then the snapshot is empty and every derivation correctly returns `{}`. |
| `sync_url` registered at the backend host | live deliveries | `AppSelfRead` deliberately withholds `sync_url`, so this **cannot be verified from the app side** — check the console, or send a test delivery and watch for the row. |
| `PASSPORT_SUPABASE_URL` + dashboard URL + callback | phase 6 | |
| Units imported, app switched on at each, people invited | **phase 8** | The lockout gate. |
