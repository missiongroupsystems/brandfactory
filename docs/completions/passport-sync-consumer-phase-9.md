# Passport sync consumer, phase 9 — the structure write-through, server half

**Status:** the server half is complete and proven. **The UI half is blocked, and the reason
is structural rather than a matter of effort** — §7. 2026-08-18, on `feat/passport-sync` at
**1.41.0**.

Executes phase 9a–9d and 9g of
[`docs/executing/passport-sync-consumer-plan.md`](../executing/passport-sync-consumer-plan.md).
The decision record is proposal §7.

**Migration 0015** — `passport_write_attempts`. **2332 tests** (+73).

This is the **documented exception to rule 3**, and the only writes this app makes to any
Passport aggregate. Everything here lands dark: without a Passport-issued session no route
will send a request, and hosted login is still unconfigured.

---

## 1. What was built, stated as a boundary

`unit` create / update / archive, `unit_relation` attach / detach, `unit_app_access` on /
off. **Nothing else.** No membership write, no entitlement write, no
`unit_app_membership` write, no `identity_link` write, and none of the six App API routes
that answer `410`.

That boundary is now **enforced by a test rather than asserted in a document**:
`conformance.test.ts` gained a `§0d — the documented exception is BOUNDED` block. Rule 3 is
no longer clean here, and reporting a clean tree would have been the exact self-deception
the conformance file exists to prevent. So four cases assert *only those, and only through
that door*:

| Asserted | Verified by breaking it |
| --- | --- |
| the write-through exists and no second file writes structure | added an `/orgs/${id}/units` POST to `access.ts` → fails |
| it touches none of the closed aggregates | pointed `createUnit` at `/memberships` → fails |
| it sends the person's token, never `X-API-Key` | added the key back as a header → fails |
| it never sends `description` | added the field → fails |

A method added to the client now fails these, which forces the exception to be re-argued
rather than quietly widened.

## 2. A second door, and the first one cannot do this

`PassportClient` — the SDK already in use — carries `X-API-Key` and has **no unit routes at
all**. So this is a separate thin client over Passport's **org API**, with
`Authorization: Bearer <the acting person's Passport token>` and **no `X-API-Key`**.

That is not a formality. If the app's own credential could change structure, Passport's
audit trail would name BrandFactory rather than the person, and every consumer app holding
a key would become a way to edit an organisation's structure.

**Only a Passport-issued token is ever forwarded, and the refusal happens before the
request.** Passport would reject an app-native token with a `401`, which forwarded to the
browser reads as "your session expired" and sends the person round a sign-in loop that
cannot fix it. The issuer is checked **before** the configuration check too, because the
issuer is a property of the caller: an app-native Admin on a fully configured deployment
must be told about their session, not about the server's.

### Each status means something different, and collapsing them loses the only actionable part

| From Passport | Surfaced as |
| --- | --- |
| `403` a Member | "Only an organisation Owner or Admin may change structure" |
| `404` an outsider, or no such org | **the same sentence** |
| `401` | "Your Mission Passport session has expired" — the issuer was right, the token is dead |
| `422` / `400` | the field-level message, so a form bug is fixable where it happened |
| `409` | Passport's own wording; and for a relation, never auto-resolved (§4) |
| timeout / `5xx` | queued, and "structure is temporarily read-only" |

**`403` and `404` say the same sentence deliberately.** Passport answers `404` to an
outsider precisely so that "this org exists and you are not an Admin of it" is
indistinguishable from "no such org". Splitting them here would rebuild the disclosure it
went out of its way to prevent.

FastAPI's `detail` is a string for a hand-raised error and an array of per-field objects for
a validation failure, and **both shapes appear on these routes**. Both are handled: a `422`
rendered as `[object Object]` is the failure that gets reported as "it just says an error".

## 3. The gate is two layers, and Passport is the authoritative one

1. The router refuses a caller whose `passport.membership.role` is not `Owner` or `Admin`,
   read **verbatim** from the projection. No `is_admin`, no `_ROLE_MAP`.
2. Passport re-checks with `require_org_access`.

Layer 1 is allowed to exist only because it can refuse something Passport would also refuse
and never permit something Passport would not. A projection lagging a few seconds therefore
refuses a freshly promoted Admin — visible, recoverable, and the right direction to fail.

**The case worth the test is the brand `Manager`.** That is a role at a unit *inside this
app*; it is not on the org ladder at all. Treating the two vocabularies as one ladder — the
thing rule 8 forbids — would let somebody who can edit a brand's guidelines rename the legal
entity every other Mission Systems app reads, including for statutory output. `Manager` and
`Staff` are both refused, and the test says why.

`organizationId` comes from the acting person's membership, resolved **by verified email**
and refusing to guess on ambiguity — never from configuration (rule 9).

## 4. Four rules the form layer enforces before a request

- **A brand carries no profile at all.** Not an oversight: a brand is a concept, not a place
  or a legal person, so it has no address and no tax registration. An empty `.strict()`
  object is the enforceable form of that.
- **`type` exists on create only.** `UnitUpdate` is `extra="forbid"`, so sending it is a
  `422` even when the value is unchanged — the shape that makes "I only renamed it" fail.
  The update schema also refuses `external_ref`, which is phase 8's bridge key.
- **A profile on an update is validated against the unit's *stored* type**, read from the
  projection. The type cannot be in the body, so it has to come from somewhere; this is what
  the replica is for.
- **A relation is checked in both directions.** Passport's `422` names a constraint rather
  than a direction, and *a correct pairing sent backwards* is the common mistake.

The direction of this duplication matters: it narrows what leaves the app and never widens
it. Every schema is `.strict()`, so the failure mode is a refused request — visible — rather
than this file accepting something Passport rejects.

## 5. A create is two calls, and the second is not optional

Create the unit, then `PUT` the app-access row. **A unit carrying no `unit_app_access` row
for BrandFactory confers access to nobody** — not even an org Owner, because the ladder still
requires a unit that carries the app. So a create whose second call fails leaves a unit
nobody here can see, which looks exactly like a broken create.

When the second call fails the response is **201 with the failure in the body**: the unit
really was created, so a 4xx would be a lie and a bare 2xx would hide the half. The enable is
queued.

**The unit is not rolled back.** It exists in Passport and sibling apps may already have
received the event; archiving it to tidy up our own half-failure would be a destructive write
nobody asked for. Pinned by a test.

## 6. The queue holds failures only, and that is what stops it being a shadow

`passport_write_attempts` (migration 0015, in `public` — nothing here arrives from a sync
event).

A unit's name is a Passport fact, so a table of *proposed* names would be a rule-7 shadow.
Four properties keep this on the right side of that line, and they only work together:

1. a row exists **only after a write has failed** — there is no pending-write row on the
   happy path, so this is never "where a change lives while it is being saved";
2. **nothing reads it except the retry surface**;
3. it is **deleted on success**;
4. it **expires**.

Only one of those can be enforced mechanically, and it is the one about readers — so it got
a sweep. `passport-write-attempts-guard.test.ts` allows five files and flags every other
reference to the table or its query helpers.

**The regression it catches looks like a feature.** Somebody joins this table to
`passport.unit` so the brand list can show "Acme (renaming to Acme Group)". The join works,
the label is accurate, the reviewer sees an improvement — and the brand list now has two
sources. Proven by adding a `listWriteAttempts` import to `routes/brands.ts`: fails, naming
the file.

**Only a retryable failure is queued.** A `403` refuses again and a `422` fails identically
until the input changes, so queueing either produces a retry button that can never succeed —
which reads as "the system will get there eventually" when nothing will.

**And a retry cannot be a background job.** The acting person's token is never stored, so
there is no credential to retry with when nobody is present. That is the constraint, recorded
at the table, not an omission to engineer around: a stored token would make this table
credential-bearing and let the app write structure with nobody there.

## 7. What is NOT built, and why it is blocked rather than deferred

**9e (the drift view) and 9f (the confirmation dialogs) cannot be built yet.** This is not
scope I chose to drop.

- The drift view lists "units whose Passport values differ from what this app last
  displayed". That needs a **correspondence between a local brand row and a
  `passport.unit`**, and there is none: `brands` and `workspaces` carry no `external_ref`,
  no `unit_id`, nothing. Building the bridge is **phase 8**, which is blocked on decision
  **D1**. Verified by reading both schemas, not assumed.
- The confirmation dialogs are copy attached to unit create/edit forms. Those forms do not
  exist, and adding them now would put a second writer beside `brands` — a local table for
  the same fact — which is precisely the state phase 8 exists to remove. Shipping them
  first would mean building the shadow deliberately.

So the boundary is: **the write path is complete and proven; the surfaces that call it wait
on phase 8.** The confirmation *copy* is specified in the plan (9f) and unchanged; the
blast-radius sentences it requires are already in the route comments where the operations
live.

The routes are on `AppType`, so the web client sees them the moment a UI is written — the
shared-type contract needs no further work.

## 8. The gate

```
pnpm typecheck                    all 11 packages           pass
pnpm lint                         eslint, whole repo        pass
pnpm format:check                 prettier                  pass
pnpm test                         2332 passed | 92 skipped
pnpm -F @brandfactory/web build   tsc + vite                pass
```

**Migration 0015 was generated but not applied to a live database here.** `.env` points at
`:5434`, which refuses connections in this environment, and the compose Postgres on `:5432`
rejects the compose credentials. CI applies migrations against its own Postgres sidecar, so
0015 is exercised there. The file is one `CREATE TABLE` plus two indexes, with no constraint
touching existing data.

For the same reason the 92 skipped tests are the `*.live.test.ts` suites, as usual — they run
in CI.

## 9. Test inventory

| File | Cases |
| --- | --- |
| `passport/structure-write.test.ts` | 25 — the issuer gate on every method, the credential, the bodies, all six status mappings, `extractDetail`'s two shapes |
| `routes/passport-structure.test.ts` | 37 — the two-layer gate, `Manager`/`Staff` refused, both create calls, the form rules, the queue, the retry |
| `db/passport-write-attempts-guard.test.ts` | 7 — the reader sweep, plus the detector's own fixtures |
| `passport/conformance.test.ts` | +4 — the bounded exception |

## 10. One thing worth recording about the conformance test itself

The `description` detector **shipped broken for the length of one commit's authoring and was
caught by trying to break it.** A `\b` written through a shell heredoc became a literal
backspace byte (`0x08`), so the regex was `/\x08description\x08/` and could never match. The
test passed on a file that did send `description`.

That is a **fail-open in the guard whose whole purpose is to prevent a fail-open**, and
nothing about it was visible: the test was green, the name was right, and the assertion read
correctly at a glance. It was found only because every new guard in this integration is
verified by breaking the thing it guards. The file now has no control bytes, checked by a
sweep, and the detector fails on the injected field.

## 11. Still open

| Item | Blocked by |
| --- | --- |
| The drift view and the confirmation dialogs (9e, 9f) | **phase 8** → decision **D1** (§7) |
| Any end-to-end verification of a write | an **entitlement** for an org on Marketing Base, plus hosted login configured — no route can send a request without a Passport-issued session |
| The magic-link bypass | unchanged from 1.40.0 §7; wants its own pass |
| Phase 8 | decision **D1** |
