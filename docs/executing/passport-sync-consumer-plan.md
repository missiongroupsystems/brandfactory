# Passport sync consumer — implementation plan

The ordered work for [`passport-sync-consumer-proposal.md`](./passport-sync-consumer-proposal.md).
Read that first: it holds the audit, the domain mapping, the behaviour changes and the open
decisions this plan refers to as `D1`–`D4`, and — in §7 — the **structure write-through**, the one
deliberate exception to rule 3.

**Ten phases.** Each one ends with the full gate (`pnpm typecheck && pnpm lint && pnpm format:check
&& pnpm test && pnpm -F @brandfactory/web build`), a document in `docs/completions/`, and a changelog
entry stating the migration number or `No migration` and the test count. Phases 1–7 are strictly
additive: nothing an existing user can reach changes behaviour until phase 8.

```
1  SDK + config + the sign-out fix            additive   no migration
2  The projection — 8 tables in `passport`    additive   migration
3  The receiver + the 17 handlers             additive   no migration
4  Registry read + access derivation          additive   no migration
5  Reconciliation — function+endpoint+cron    additive   no migration
6  The email-first login                      additive   migration (pkce)
7  Offboarding + session revocation           additive   migration (denylist)
── operator gate: structure imported, entitlement active, people invited ──
8  Retire the shadows                         BREAKING   migrations
9  Structure write-through (Admin, unit CRUD) additive   migration (attempt queue)
10 Conformance, Renovate, CI                  additive   no migration
```

Phase 9 depends on phase 6 (it needs a Passport-issued token to forward) and reads best after phase 8
(the brand editor is already split into Passport-owned and app-owned halves). It could be pulled
earlier than 8 if the editors are touched twice instead of once; that is the only ordering trade.

---

## Phase 1 — the SDK, the configuration, and the sign-out fix

Nothing Passport-shaped works yet. This phase makes the dependency resolve, the env schema honest,
and closes the one detector hit that costs a single argument.

### 1a. The dependency

`@missiongroupsystems/passport-client` is **not on npm** and not on the GitHub registry we can rely
on. It is a private git dependency into a subdirectory of the Passport monorepo. `launchpad` resolves
it this way, so the transport is proven:

```jsonc
// packages/server/package.json
"@missiongroupsystems/passport-client":
  "git+https://github.com/missiongroupsystems/passport.git#<SHA>&path:/packages/passport-client/typescript"
```

- **Resolve the SHA; never copy one from a document.** SDK 3.0.0 landed in `6dd76a7`
  (*feat(sdk)!: unit_scopes + role_cascade*); the current `origin/main` head is `4754a77`, and both
  are pushed to `origin/main` and `origin/staging`, so either resolves. Pin the head, and record the
  SHA **and** the SDK version in a comment beside the dep — there is no npm version to read later.
  Note that `launchpad`'s lockfile pins `dafbd487`, which predates 3.0.0: its `access.ts` call site
  still passes the deprecated `unitScope`. Do not copy that call site.
- **The package builds on install, and that is verified.** `git ls-files` shows the git tree tracks
  `src/` and `tsconfig.build.json` but **not** `dist/` — the local `dist/` is a build artefact. So the
  `prepare` script (`tsc -p tsconfig.build.json`) is what produces the importable output, and it must
  run at install time. It has `typescript ^5` as a devDependency, which pnpm installs for a git dep it
  is preparing. Confirm `node_modules/.../dist/index.js` exists after `pnpm install`; a dep that
  half-installs is an install that succeeds and a `tsc` that cannot find the types.
- **`zod ^4` is a peer in practice.** `packages/server` does not depend on zod 4 today; the SDK does.
  Check for a duplicate-zod type clash at `pnpm typecheck` before going further, since `@brandfactory/server`
  already uses zod for `EnvSchema`.

### 1b. Configuration

Add to `EnvObject` in `packages/server/src/env.ts`, every one **optional**, and add a `superRefine`
that fails at boot when the set is half-configured — the failure mode to prevent is a webhook secret
present and API credentials absent, which projects everything and logs nobody in:

```
PASSPORT_API_URL              PASSPORT_SUPABASE_URL
PASSPORT_API_KEY              PASSPORT_DASHBOARD_URL
PASSPORT_APP_ID               PASSPORT_SSO_CALLBACK_URL
PASSPORT_WEBHOOK_SECRET       PASSPORT_SSO_ENABLED      (default true)
PASSPORT_WEBHOOK_SECRET_PREV  PASSPORT_RECONCILE_SECRET
```

Two variables are **deliberately absent and must stay absent** — `PASSPORT_ORG_ID` (rule 9) and
`PASSPORT_UNIT_SCOPE` (a local copy of a fact Passport owns). Write the reason at the schema, not just
here; the next person to add a "convenient" org default will read the schema, not this plan.

`.env.example` gets every key in the same commit. `packages/server/src/env.example.test.ts` is the
drift guard and it will fail otherwise — which is the guard working, not an obstacle.

Add `VITE_PASSPORT_SUPABASE_URL` and `VITE_PASSPORT_SUPABASE_ANON_KEY` to
`packages/web/.env.example`. Anon key only. A service-role key in a client bundle is a breach.

### 1c. The sign-out fix (detector §0e)

`packages/web/src/auth/session.ts` currently tries a global sign-out and falls back to local:

```ts
const failed = await supabase.auth.signOut().then(({ error }) => !!error)   // <- global
if (failed) await supabase.auth.signOut({ scope: 'local' })
```

Make both calls `scope: 'local'` and rewrite the docblock. The existing comment argues that "a
revoked-server-side session is the better outcome, so the global call is tried first" — that
reasoning is correct for an app that owns its issuer and **wrong** the moment Passport issues the
session, which is what phase 6 does. Fixing it now means the change lands with a test rather than as
a line in a large auth diff.

Then ship the control that keeps it fixed — a **source sweep**, not only a behavioural test:

```ts
// packages/web/src/auth/signout-scope.test.ts
it('no signOut call site omits a scope, and none is global', () => {
  const calls = [...] // every `auth.signOut(` in src/**/*.{ts,tsx}
  expect(calls).not.toEqual([])                                   // the guard must guard something
  expect(calls.filter((c) => !c.includes('scope'))).toEqual([])
  expect(calls.filter((c) => /global|others/.test(c))).toEqual([])
})
```

A behavioural test only covers the call sites that exist today. The failure mode is *the next
sign-out button somebody adds*, and nothing about it raises, renders differently, or fails review.
Passport's own console carries the same guard because it shipped this bug in both its sign-out paths
until 2026-08-14.

### Gate
Full gate. Confirm `pnpm typecheck` sees the SDK's types and that
`import { DISPATCH } from '@missiongroupsystems/passport-client'` resolves at runtime under vitest.

---

## Phase 2 — the projection

Eight tables in a dedicated `passport` Postgres schema. This is not a cache beside BrandFactory's org
model; from phase 8 it is the **authoritative** org model — the only source of memberships,
roles, entitlements and legal names. `D1-b` keeps a local structure table beside it for outage
authoring, so "the only org model" would now be wrong; "the authoritative one" is not.

### 2a. The tables

`packages/db/src/schema/passport/` — one file per aggregate, `pgSchema('passport')`, exported through
`packages/db/src/schema/index.ts` so the Drizzle client registers them.

| Table | Mutability | Notes |
| --- | --- | --- |
| `passport.organization` | version-guarded | `id, name, slug, status, version` |
| `passport.unit` | version-guarded | `+ organization_id, type, external_ref` and the seven sparse profile columns (`uen, gst_reg_no, registered_address, address, postal, contact_phone, kind`). **No `description`** — Passport-only, reaches no consumer by push or pull. |
| `passport.membership` | version-guarded | embeds `email` + `display_name`; `role` is `Owner\|Admin\|Member` |
| `passport.entitlement` | version-guarded | `status` is the org-level kill switch |
| `passport.unit_app_membership` | version-guarded | `role` is `Manager\|Staff` — **a different vocabulary**, never conflated with the above |
| `passport.unit_relation` | immutable | insert-if-absent / delete-if-present, **no `version`** |
| `passport.identity_link` | immutable | the one projection table we write ourselves |
| `passport.unit_app_access` | immutable | the unit↔app switch |

There is **no `passport.user` table**. `user.upserted` carries fields `passport.membership` already
embeds, and the snapshot has no `users` collection to reconcile a mirror against — so it could drift
with nothing able to detect it. The handler still exists and is still correctly named, because an
absent handler is indistinguishable from a typo and both are silent.

Four properties that are load-bearing, each written at the code:

1. **Passport UUIDs are the primary keys, verbatim.** No serial, and no `passport_unit_id` side
   column beside a local id — that is a shadow with extra steps.
2. **No foreign keys between these tables.** Events are replay- and out-of-order-safe by contract: a
   `unit.upserted` can legitimately arrive before the `org.upserted` that would satisfy an FK. An FK
   would reject the event, the receiver would 500, and Passport would retry forever. Referential
   integrity is Passport's job on the write side.
3. **Mutable vs immutable is a real distinction.** The five tables carrying `version` are applied
   with a `>=` guard; the three without it are insert-if-absent / delete-if-present.
4. **`status = 'removed'` is a tombstone, never a delete.** Both `membership.removed` and
   `unit_app_membership.removed` carry the final aggregate and are version-guarded upserts. Deleting
   the row instead makes reconciliation resurrect it from the snapshot — a revoked user silently
   regaining access.

Indexes the read path needs: `membership(platform_user_id)`, `membership(organization_id)`,
`membership(email)` (the identity-resolution key), `identity_link(subject, platform_user_id)`,
`unit(organization_id)`, `unit(type)`, `unit_app_membership(platform_user_id)`,
`unit_app_membership(unit_id)`, `unit_app_access(unit_id)`.

### 2b. `drizzle-kit` must be told the schema exists

`drizzle-kit`'s default `schemaFilter` is `["public"]`. Left alone, `db:generate` **ignores** the
`passport` tables entirely and emits an empty migration — and then, worse, treats them as
unmanaged. One line in `packages/db/drizzle.config.ts`:

```ts
schemaFilter: ['public', 'passport'],
```

Then `pnpm -F @brandfactory/db db:generate`, which emits `CREATE SCHEMA "passport"` and the eight
tables as the next numbered file. Generated, not hand-numbered, per the repo convention.

### 2c. Read-only by enforcement — see `D4`

The skill requires the replica to be read-only *by enforcement*, not by etiquette:
`REVOKE INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA passport FROM <app_role>`.

**BrandFactory has one database role.** It connects through a single `DATABASE_URL` as the owner and
enforces authorization in code — there is no `authenticated` role, no RLS, and no PostgREST client. A
blanket REVOKE would therefore revoke the receiver too. `D4` in the proposal is the choice:

- **D4-a (recommended).** A second role and a second connection string. `DATABASE_URL` keeps the
  REVOKE and serves every request; `PASSPORT_SYNC_DATABASE_URL` belongs to a writer role used by the
  receiver and the reconciler alone. Genuine enforcement, at the cost of one role to provision — and
  a self-hoster who sets only `DATABASE_URL` gets a receiver that refuses to start, which is the
  correct failure.
- **D4-b.** One role, plus a guard test that fails when any module outside
  `server/src/passport/{handlers,reconcile}.ts` writes `passport.*`. Convention with a control on it.
  Weaker, and honest about being weaker.

Whichever is chosen, the grant statements are appended to the generated migration by hand —
`drizzle-kit` does not emit grants — and the migration says why in a comment.

### 2d. Tests

- The eight tables exist with the expected columns and the `passport` schema name (a plain schema
  assertion, no database).
- `*.live.test.ts` for the version guard, following the repo's existing convention: apply
  `version: 2`, then `version: 1`, assert the row still reads `2`; apply `version: 2` again, assert
  no change. Skips when `DATABASE_URL` is absent, like the other live tests.

### Gate
Full gate, plus `db:migrate` against the docker Postgres and a confirmation that all eight tables
exist. **A consumer whose database is behind its code has a receiver that 500s on every delivery.**

---

## Phase 3 — the receiver and the 17 handlers

### 3a. The handlers

`packages/server/src/passport/handlers.ts`, one class implementing `SyncHandlers`.

Three handlers do **not** do what their names suggest, and each gets the reason at the method:

| Handler | Actually |
| --- | --- |
| `removeMembership` | a version-guarded **upsert** keeping `status='removed'` |
| `removeUnitAppMembership` | the same |
| `upsertEntitlement` | also carries **revocation** — `entitlement.upserted` with `status != 'active'`. There is no remove event, and revocations must never be filtered out. |

Only `removeRelation`, `removeIdentityLink` and `removeUnitAppAccess` delete anything.

The version guard is **one atomic SQL statement**, not a read-then-write:

```ts
.onConflictDoUpdate({ target: t.id, set, setWhere: sql`${t.version} <= excluded."version"` })
```

Two deliveries of the same aggregate racing each other cannot then interleave a read and a write and
apply the older one last. `<=` — not `<` — because an equal-version replay must re-apply
idempotently, and Passport retries on any non-2xx, so replays are normal traffic.

> **Bind every method in the constructor, reflectively.** `applyEvent` resolves a handler by property
> lookup and calls it **detached**: `const h = handlers[method]; await h(payload)` — so `this` is
> `undefined` inside. Five of the seventeen delegate through `this.` and would throw on the first
> real delivery. It is invisible to `tsc`, and a test asserting the methods *exist* passes happily.
> Launchpad found this by driving a real signed `membership.removed` at a running receiver, which
> returned 500 and left a revoked member's row `active`.

Two things **not** to add: no `app_id` filter (`unit_app_*` and `identity_link` are delivered own-app
scoped; re-filtering makes the delivery scope narrower than the snapshot scope and reconciliation then
reports permanent phantom drift it can never clear) and no org filter (rule 9).

`resyncOrg` fans the bundle out through the per-aggregate handlers in FK-safe order — org → units →
relations → memberships → links → entitlements → unit_app_access → unit_app_membership — and is
**upsert-only**. Its `identity_links` are a per-org subset and never authoritative, so it must never
feed a pruning path.

### 3b. The route

`packages/server/src/routes/passport-sync.ts`, a factory taking `SyncHandlers` so the receive contract
can be exercised with stubs.

```
POST /webhooks/passport/sync
  no secret configured        -> 503   fail CLOSED; an unset secret must never mean "accept anything"
  bad/absent signature        -> 401   the delivery worker PAUSES — correct backpressure
  malformed JSON              -> 400
  stale schema_version        -> 400   permanent reject, before dispatch
  handler threw               -> 500   the worker RETRIES — errors must PROPAGATE
  applied and committed       -> 200
```

- The signature covers the **raw bytes**. Parse-then-reserialise changes them (key order, whitespace,
  unicode escapes) and every signature fails. `new Uint8Array(await c.req.arrayBuffer())`.
- Mounted at `/webhooks/*` in `app.ts`, deliberately **outside** every `authRequired` prefix.
  Passport authenticates with an HMAC over the body, not a JWT, and there is no user to scope. The
  existing per-prefix middleware layout makes this a one-line addition rather than a restructure —
  the same property that keeps `/blobs`, `/health` and `/rt` outside the gate.
- **Never log the body, the signature or the secrets.** The body carries staff emails; the signature
  is credential-equivalent.
- An unknown event type is a forward-compatible **200 no-op**.

### 3c. Tests

Three, and the first is the most valuable thing in this phase:

1. **All 17 handler names, read from the SDK's own `DISPATCH` table** — plus an assertion that
   `DISPATCH` still has exactly 17 entries, so the test cannot silently guard a contract that moved.
   `tsc` cannot catch a misnamed handler: `SyncHandlers` declares every method optional, so
   `upsertOrganization` is well-typed and drops every org event forever.
2. **The detached-call regression** — call each handler as `const h = handlers[name]; h(payload)`.
3. **The receive contract over real HTTP with a real HMAC**, signed with the SDK's own `signBody` so
   the test exercises the real algorithm rather than a reimplementation that could be wrong in the
   same direction as the verifier. Cover every status above, and a replay.

### Gate
Full gate. Then, once the operator has set `sync_url` and the secret: make one real edit in the
Passport console and watch the row appear. **`sync_url` must name the backend host** — on the
frontend host Passport delivers, nothing receives, the projection stays empty and nothing errors.

---

## Phase 4 — placement, the access derivation, and identity linking

### 4a. The registry read (step 0)

`packages/server/src/passport/registry.ts`. One `fetch` at startup:

```
GET {PASSPORT_API_URL}/api/v1/apps/me/registry     header: X-API-Key
->  { unit_scopes: UnitType[], role_cascade: boolean, unit_scope: …|null, id, key, name, status }
```

- **Read `unit_scopes` (plural) and `role_cascade`. Ignore `unit_scope` (singular), explicitly.** The
  singular field is derived, names only five of the seven combinations, and is **`null`** for
  BrandFactory's shape — so a reader that used it would fall back to `["brand"]` and silently narrow
  the app to brands, with no error to catch. Destructure the two fields we want and write that reason
  at the code, so the next person does not "simplify" it back.
- **Placement and cascade are separate facts.** Do not infer one from the other in either direction.
  Two levels no longer implies inheritance, and Passport permits `role_cascade` only on
  `{entity, outlet}` or `{brand, outlet}`.
- The path is `/apps/me/**registry**`. A bare `/apps/me` matches `app_id="me"` on the super-admin
  `/apps/{app_id}` route and answers **401** — a misleading "bad key" for a URL mistake.
- `.replace(/\/+$/, '')` the base URL. A trailing slash yields `//api/v1/...` and a flat `404`.
- No SDK method wraps it. This is the one sanctioned hand-rolled request in the integration.
- **Read once, cache in memory.** The registry is not a synced aggregate; no event announces a change
  and `snapshot()` does not carry it. A re-scope needs a restart, and that is documented at the
  function. A narrowing can also strand existing role rows, because Passport validates placement on
  `INSERT` only — so if access answers go wrong right after an admin "fixed the scope", restart before
  debugging anything else.
- **Offline fallback**, for local dev and CI where no key exists: `['brand']` with cascade off, and a
  `log.warn` naming it as an assumption. It must be visibly a fallback, because the wrong placement
  dangles every `unit_app_access` row and denies every user with no error. Validate any value that
  arrives against the three legal unit types rather than trusting it.

### 4b. The derivation

`packages/server/src/passport/access.ts`. **Never hand-roll the join** — call the helper.

```ts
const input = {
  orgId,
  entitlementStatus: entitlement?.status ?? 'inactive',   // no row is NOT active
  orgRole: membership?.status === 'active' ? membership.role : null,
  memberships: roleRows.map(toUam),      // already own-app scoped by delivery
  unitsById: new Map(units.map((u) => [u.id, toUnit(u)])),
  appAccesses: accesses.map(toUaa),
  unitScopes: registry.unitScopes,       // REQUIRED in SDK 3.0.0
  roleCascade: registry.roleCascade,     // REQUIRED in SDK 3.0.0
  relations: relations.map(toRelation),  // REQUIRED
}
rolesAtUnits(input)   // -> { unitId: 'Manager' | 'Staff' }  — a MAP
hasAppAccess(input)   // -> defined AS the non-emptiness of the above
```

Five things this gets right that a hand-rolled join forgets:

- **`orgRole` is required because there is a ladder.** An active org `Owner`/`Admin` holds `Manager`
  at every unit carrying the app with **no role row at all**. Pass `null` and every one of them is
  silently denied.
- **`orgRole === null` is a FULL gate in 3.0.0, not merely a ladder gate.** Suspension deliberately
  does not cascade to role rows — that is what makes it reversible — so a suspended member's rows are
  still `active`. Hence `status === 'active' ? role : null`, never `role ?? null`.
- **`orgId` is required** because we hold units and `unit_app_access` rows for every org we are
  entitled to. Omit the filter and an Owner of org A is a Manager at every unit of org B.
- **A unit with no `unit_app_access` row confers nothing**, not even to an Owner.
- **`entitlementStatus`** defaults to `inactive` when there is no row. Defaulting the other way grants
  everything in an org BrandFactory was never entitled to.

**There is no unit-TYPE test in the rule, and there must not be one here.** Placement is enforced by
Passport's DB triggers, so a `unit_app_access` row that exists is already well-typed; the SDK never
filters by type and neither do we. `unitScopes` says where rows *can* be created — a question for
seeding and for the UI, not for an access check. The reverse does not hold: a row can outlive the
placement that permitted it, so "a row exists" does not prove "the placement permits it".

**`relations` is passed unconditionally**, even though it changes no answer while `roleCascade` is
false. The failure it guards against is Trap 8: on a cascading app, omitting it drops every
*inherited* role while explicit ones keep working — a smaller map and no error, which reads as bad
data and is a bad call site. Passing it always means `D3` is a console change plus a restart.

Two functions, one implementation: `derivePassportAccess(subject, orgId)` for the request path, and
`derivePassportAccessForPlatformUser(platformUserId, orgId)` for phase 6's login gate, which runs
**before any session exists** and so has no subject to resolve a link by. A second copy of the
derivation would drift from the ladder or the entitlement check, and a divergence between "what the
gate allowed" and "what the request path derives" presents as an empty app.

**Return the map. Do not collapse it.** `Object.values(roles).includes('Manager')` anywhere is the
tell that rule 8 has been reintroduced under a new name.

### 4c. Identity linking — one mechanism, both login branches

`linkPassportIdentity(subject, verifiedEmail)` writes into **our own** `passport.identity_link`. This
is the single sanctioned local write under rule 3, and it is sanctioned because the row we need is not
the row Passport holds.

| Column | From | Never |
| --- | --- | --- |
| `subject` | the verified `sub` of the session being established | a translated or invented value |
| `platform_user_id` | `SELECT platform_user_id FROM passport.membership WHERE lower(email) = lower($1) AND status = 'active'` | **`claims.sub`** — a Supabase auth-user id from a different UUID space, confirmed not to coincide |
| `app_id` | `PASSPORT_APP_ID` | |

- **Every login, not just the first.** Idempotent per `(subject, app_id)`, and writing it every time
  self-heals a row left stale by a re-provision.
- **Replace, don't update** — `identity_link` rows are immutable per row in Passport's model, so
  delete-then-insert in one transaction.
- **A wrong `platform_user_id` is worse than a missing row.** It looks linked, resolves to zero orgs
  forever, and nothing errors.
- **Do not call `reportIdentityLink`.** It is closed by policy and answers `410`; on the hosted-login
  branch it was always a silent no-op anyway, because it verifies against *our* registered
  `issuer_url` and a hosted-login token is issued by *Passport's* project.

BrandFactory accepts Passport as a **second trusted issuer** (phase 6), so `subject` is Passport's
`sub` for a hosted-login session and BrandFactory's own for an app-native one. Both are correct: the
rule is *the value the session resolves to*, never the label on it. BrandFactory has no RLS, so the
`auth.uid()` trap that forces some consumers to mint their own session does not apply here — this is
route B in the skill's terms, and it is available to us precisely because authorization is in code.

### 4d. Tests

Table-driven against fixture rows, no database. Every one of these is a silent failure otherwise:

- **The ladder** — Owner, zero role rows, expect `Manager` at every unit carrying the app.
- **Suspension** — `status='suspended'` with an active role row, expect `{}`.
- **Cross-org denial** — Owner of A, expect `{}` for every unit of B.
- **No `unit_app_access`** — Owner, active entitlement, no switch row, expect `{}`.
- **An archived unit** confers nothing.
- **Entitlement `inactive`** denies everyone including Owners.
- **Unit-scoped, not global** — `Manager` at unit A and no row at unit B ⇒ denied at B. This is the
  only test that catches a collapsed map, and a global-flag implementation passes every other one.
- **Placement, both ways round.** Two tests on identical fixtures, so `D3` can be answered later
  without touching code:
  - `unitScopes: ['entity','brand','outlet']`, `roleCascade: false` — a role at a brand does **not**
    appear at an outlet beneath it. This is BrandFactory's shape today, and Passport refuses
    `role_cascade: true` on it with a `422`, so this is the only behaviour available.
  - `unitScopes: ['brand','outlet']`, `roleCascade: true`, `relations` supplied — the outlet
    **inherits** the brand role, and an explicit outlet role **overrides** the inherited one. Assert
    both directions; omitting `relations` breaks only the first, which reads like bad data.
- **The cascade is read, never inferred.** `['brand','outlet']` with `roleCascade: false` yields no
  inheritance. That is a legal, newly-expressible shape, and inferring the cascade from the shape
  would over-permit it.
- **Identity link** — resolves by email case-insensitively; replaces a stale row; returns null when
  the email matches no active membership.

### Gate
Full gate. `authz.ts` is **not** touched in this phase — the derivation ships beside the interim
shared-access model and is read by nothing yet. That keeps phase 4 additive.

---

## Phase 5 — reconciliation, all three parts

The nightly backstop for anything the receiver missed. Snapshot scope equals delivery scope, so at
steady state a correct receiver's projection already equals the snapshot per collection and this is a
no-op.

**Three separate things must exist, and writing only the first is the common failure** — it passes
its own unit test, so the suite is green and the write-up says "nightly reconciliation built" while
nothing ever runs it and the projection silently rots.

1. **The function.** `packages/server/src/passport/reconcile.ts`. One `client.snapshot()` call — eight
   collections — re-applied **through the same handlers the receiver uses**, in FK-safe order. Not a
   second write path: a parallel implementation would drift from the version guard and the tombstone
   rules, and the drift would only show under replay.
   - **Every org, no filter** (rule 9). Narrowing it re-introduces the exact bug reconciliation
     exists to heal, and reports permanent phantom drift on every other org.
   - **`identity_links` are upsert-only and never pruned.** The snapshot's copy is a per-org subset,
     and we also write our own rows at login with subjects Passport does not know. A prune deletes the
     very rows that make sessions resolve, and they do not come back until each user logs in again.
   - **This job does not prune at all.** Detecting rows Passport no longer has needs a per-collection
     authority answer, and identity links are explicitly not authoritative. Doing it casually turns a
     transient API hiccup into data loss.
   - **An all-zero summary is warned about, loudly.** With no active entitlement the snapshot returns
     eight empty collections whether or not anything is wrong — which is exactly BrandFactory's state
     until phase 8's operator gate. "Snapshot empty" is never read as "delete everything", and it is
     never read as a healthy no-op either.
   - It **throws** on missing configuration or an API failure. Silently succeeding on an unreachable
     Passport makes a broken reconciliation indistinguishable from a clean one.

2. **The endpoint.** `POST /webhooks/passport/reconcile`, guarded by `X-Reconcile-Secret`. It
   **refuses (`503`) when `PASSPORT_RECONCILE_SECRET` is unset** rather than running unauthenticated,
   so an unconfigured scheduler cannot look like a working one — and a reconcile endpoint open to the
   internet is a way to hammer Passport's API. Its purpose is that the job can be **verified by
   triggering it** rather than by reading the code.

3. **The schedule.** BrandFactory has no scheduler and Fly has no cron. An in-process nightly timer in
   `packages/server/src/main.ts` is the right mechanism *here specifically*, and for a reason already
   written into the architecture: the `native-ws` realtime bus is in-process, so `fly.toml` pins
   `min_machines_running = 1` and `auto_stop_machines = false`. There is exactly one instance, so an
   interval cannot double-fire. **That coupling gets a comment in both files** — the day a
   cross-instance realtime adapter lands, this timer needs moving, and the reason must be findable
   from the timer.

### Verification
`curl` the endpoint and read the response. **A `404` means the route was never built, and no test will
tell you.** Then check the log line from a real run.

### Gate
Full gate, plus the triggered run.

---

## Phase 6 — the email-first login

The standard, identical in every consumer. There is nothing to decide here and nothing to ask: one
email field, then the app routes.

```
Step 1   [ email________ ] (Continue)          <- ONE field, no password
              |
              v  POST /auth/resolve-login  ->  { route: 'passport' | 'app-native' }
              |
   route=passport                     route=app-native
        |                                    |
   full-page navigation to           reveal the existing magic-link +
   /auth/passport/start              Google buttons IN PLACE, against
   -> Passport /authorize            BrandFactory's own project
   -> returns already signed in
```

The magic link (`1.27.0`) and the Google button (`1.28.0`) become the **`app-native` branch**. That
branch stays forever: it is the non-member path *and* the degradation path when Passport is
unreachable. Deleting it would make Passport a hard availability dependency for signing in.

### 6a. The router — six security properties, none optional

`POST /auth/resolve-login`, mounted outside the auth gate because it necessarily runs before anyone
has proven anything. The decision itself is **one function over one boolean** in
`packages/server/src/passport/login-routing.ts`.

Be precise about what this endpoint leaks, or the wrong thing gets defended. It **deliberately
discloses membership** — `passport` vs `app-native` *is* the routing decision, and the UI cannot
choose between redirecting and rendering a password field without it. What it must never disclose is
**account existence**.

1. **Two routes, never three.** A non-member and a nonexistent email are indistinguishable.
   `app-native` means "type a password", never "this account exists". Keeping it one function over one
   boolean leaves **nowhere for a third branch to hide** — once it is a chain of `if`s returning three
   values, the fourth (`suspended`, `sso_required`) arrives as an obvious small follow-up and each one
   is individually defensible. The test for any proposed change: *does the extra answer change what
   the UI does?* If two responses render the same screen, the difference is pure disclosure.
2. **No email-format validation before routing.** A different answer for a malformed address is still
   an oracle. Cap the **length** only — 320 octets, RFC 5321 — so an unbounded string cannot grow the
   rate limiter's key space.
3. **Two rate-limit buckets, IP *and* email.** IP alone lets a botnet enumerate one address from many
   hosts; email alone lets one host sweep a list. The email bucket is applied inside the handler,
   because its key comes from the parsed body.
4. **`/passport/start` redirects on every failure branch, never JSON.** It is reached by top-level
   browser navigation, so a JSON 429 or 500 body renders as the entire page. That is also why the rate
   limit is applied inside the handler rather than as middleware.
5. **`/passport/start` is rate-limited**, because it writes an unauthenticated PKCE row on every hit.
6. **Both routes cost the same wall time.** The membership lookup runs **unconditionally**, even when
   SSO is off. A structurally two-valued endpoint is still an oracle if one branch hits the database
   and the other returns early.

`ssoActive()` is `PASSPORT_SSO_ENABLED !== 'false' && Boolean(PASSPORT_SUPABASE_URL)` — gated on the
URL as well as the flag, so an env that simply lacks Passport's project (local, CI) stays app-native
on its own with no flag to remember.

**Pin the response vocabulary in a CI test.** This gets re-litigated about once per product manager,
with real UX evidence behind it, and a passing test is the only control that survives the argument.
The legitimate remedies for that complaint — echoing the email at step 2 with a *Change* control,
static client-side typo hints, unconditional step-2 failure copy — are all computed from the user's
own input and are welcome; a third route is not.

### 6b. Model 3 — the hosted handoff

`GET /auth/passport/start` → `GET /auth/passport/callback`.

- **PKCE, server-side.** `packages/server/src/passport/pkce.ts`. A fresh 64-byte verifier and 32-byte
  state per attempt; `challenge = base64url(sha256(verifier))`, **unpadded** — the stripped `=` is
  mandatory, and a padded challenge fails with a flat refusal that says nothing. The verifier is
  stored in a new `passport_login_attempts` table keyed by `state`, with a TTL and a sweep on
  insert. **It must never reach the browser** — not a JS-readable cookie, not `localStorage`, not a
  query param. That is the entire point of PKCE.
- **Redemption is `DELETE … RETURNING`**, so single-use is structural: two concurrent callbacks for
  one `state` cannot both succeed. Read-then-delete leaves a replay window, and replay is precisely
  what `state` exists to prevent.
- **Two different hosts.** `/authorize` is on `PASSPORT_DASHBOARD_URL` (Passport's frontend);
  `/apps/me/session-exchange` is on `PASSPORT_API_URL` (the API). Confusing them is the classic
  model-3 failure.
- **Do not normalise `redirect_uri`.** No lowercasing the host, no stripping a trailing slash.
  Passport matches its per-app allow-list exactly, and every normalisation is a chance for the string
  sent to differ from the string registered.
- **`session-exchange` is a hand-rolled `fetch`** in its own module. It is not a write-back: an
  `auth_handoff_code` is not one of the eight aggregates, so rule 3 does not touch it, and hosted
  login stops working without it. `redirect_uri` is **re-sent** — not redundant (RFC 6749 §4.1.3); it
  binds the code to the URI it was issued for.
- **The access gate lives on the callback**, because that is the only place a Passport-backed session
  is established. Three outcomes: **not a member ⇒ deny** (not "skip the access check" — a removed
  member whose email still matches a local row would otherwise walk straight in); **member with no
  access ⇒ deny** with a clear reason, because membership is not access; member with access ⇒ in. It
  **fails open on access while no entitlement has synced yet**, deliberately, so switching SSO on
  before phase 8 does not lock out the company. Membership itself never fails open.
- **Seven distinct failure branches, seven distinct log lines, and a distinct `?error=` code per
  class.** One shared user-facing *message* is right — a user cannot act on the difference — but one
  shared query param is not, because it is the only thing that splits the investigation in half.
  Passport's answer for a failed exchange is a flat `403` that deliberately tells you nothing, so the
  debugging has to happen from our side.
- **Nothing fallible after the tokens exist.** A failure past that point hides a session that is
  already real.

### 6c. Accepting a second issuer on the request path

`packages/adapters/auth` gains a `passport` capability rather than a new provider: the existing
`supabase` impl tries **its own** JWKS first and falls through to Passport's.

> **The fallthrough must fire on "no key matches this kid", and clause order decides whether it
> does.** A Passport-issued token presented to BrandFactory's own JWKS fails with exactly that error,
> and that is the **normal** case for an SSO user, not an outage. A narrower check placed above the
> broader one intercepts it and the fallthrough never runs — every Passport-authenticated request
> then 401s deterministically, no matter how valid the token is. That exact ordering bug sat live
> through another consumer's entire SSO rollout.

An **expired** token is terminal and is never retried against the second issuer: expiry is a fact
about the token, not about which project signed it.

This only ever **adds** an accepted issuer. Turning SSO on cannot reject a session that works today;
clearing the config cannot lock anyone out. Reversible in both directions.

**Record which issuer signed the token, in the request context.** `c.set('tokenIssuer', 'passport' |
'app-native')` alongside the resolved user. Two things need it, and neither can recover it later
without re-verifying: the sign-out must run on the client that holds the session (§6e), and phase 9's
write-through may forward **only** a Passport-issued token. Without this flag the write-through would
either send BrandFactory's own issuer's token outward — wrong regardless of Passport's `401` — or have
to guess from the presence of a `passport.identity_link` row, which exists for both branches.

Resolution is by **verified email**, never by the Passport `sub`, and `resolveOrProvisionPassportUser`
is one shared implementation:

- `.all()`, not `.first()` — **fail closed on ambiguity.** `users.email` is unique but not
  case-insensitively so, and on a path that hands out a session, picking "the first one" silently
  authenticates somebody as the wrong person. The durable fix is a case-insensitive unique index on
  `users.email`, which makes the ambiguity impossible; add it in this phase.
- **Never provision for a non-member.** A valid Passport token proves who somebody is, not that they
  belong here.

### 6d. The gap this phase must close, and the one it must record

**Close:** BrandFactory's magic link and Google button go **straight from the browser to Supabase
GoTrue**, with no server endpoint in between. A routing decision made only in the client is advisory —
if the API accepts the call, the API is the policy. So a member could request a magic link from
BrandFactory's own project and authenticate around Passport's MFA, session policy and revocation
entirely. The fix is small: proxy the magic-link request through a server endpoint that re-checks
`isActiveMember(email)` and **refuses for a member** (`403`, pointing at hosted login), keeping the
response **non-committal either way** ("if that address has an account, we've sent a link") so the
enumeration oracle is not rebuilt in the recovery flow. Non-members are unaffected, which is why this
closes the door without costing the branch. Same helper as the router — one implementation, never a
fork.

**Record:** the Google button is an OAuth flow at BrandFactory's own project and cannot be proxied
the same way. Either restrict it to the `app-native` branch in the UI *and* refuse a member at the
first request their session makes, or drop it for members. State the choice in the completion
document rather than leaving it implicit.

### 6e. The frontend

`packages/web` only. Per proposal §8, `web-next` gets nothing this run.

- `routes/login.tsx` becomes two steps in one screen. **Keep the form in server-rendered markup where
  the framework allows and make the submit control inert until hydrated** — a client-only form that
  fails to hydrate silently native-submits and just reloads the page, which is indistinguishable from
  "the button is broken" and sends everyone hunting the auth flow instead of the browser cache.
- A **second Supabase client bound to Passport's project** (`VITE_PASSPORT_SUPABASE_URL` + anon key)
  redeems refreshes for hosted-login sessions. Under model 3 **every** member's session is
  Passport-issued, so this is not an edge case: skip it and every member is silently logged out at
  token expiry.
- **Define that client once** and import it in both the callback-completion route and the sign-out.
  If one writes `sb-<refA>-auth-token` while the other reads `sb-<refB>-…`, sign-in appears to work
  and fails on the very next request, with nothing in either log to connect the two.
- **Sign out on the client that holds the session**, `scope: 'local'` (already fixed in phase 1). Do
  **not** point the button at Passport's `/logout`: that ends the SSO session, so the next app makes
  the person sign in again — a different promise from "sign out of this app". And do not build a
  "sign out everywhere"; `global` has exactly one home suite-wide, the Passport console.
- **A Passport outage must degrade, not log everyone out.** The refresh path distinguishes a genuine
  `401/403` (revocation → end the session) from a timeout, 5xx or DNS failure (outage → leave the
  session alone to ride out its TTL). Collapsing the two turns a ten-minute blip into a mass logout of
  every signed-in user who then cannot sign back in, because the thing that is down is the login.
  **This is the single highest-value line of code in the whole outage story.**

### 6f. Tests

- The router: two routes only; a member, a stranger and `not-an-email` produce identically-shaped
  answers; the length cap; both rate-limit buckets; `/passport/start` failures redirect rather than
  return JSON; comparable wall time between branches.
- PKCE: challenge is unpadded base64url of the sha256; redemption is single-use; an expired attempt
  returns null.
- The callback: each of the seven failure branches produces its own code.
- The gate: not-a-member ⇒ deny; member-without-access ⇒ deny; fail-open before any entitlement.
- Issuer fallthrough: a Passport token verifies; an expired app-native token is terminal and is not
  retried; SSO off ⇒ Passport tokens are refused and app-native ones are untouched.
- The magic-link proxy refuses an active member and stays non-committal.

### Verification
Sign in end to end as a real member. Then **prove sign-out isolation properly**: sign into
BrandFactory and one other consumer as the same person, sign out of BrandFactory, and **force a token
refresh** in the other app. A page reload proves nothing — the access JWT outlives a revocation, so a
reload passes whether or not the bug is there, and will certify it as fixed.

### Gate
Full gate, plus the two manual verifications.

---

## Phase 7 — offboarding

Rule 6: react to `membership.removed` by revoking the user's grants **and their live sessions**. A
per-action read-through to Passport is the wrong tool — a racing adversary already holds a session, and
killing the session is what stops them.

**Ours only.** The event says one org dropped one person, not that they left the platform. The whole
suite shares one issuer, so a project-wide revocation would throw them out of apps serving orgs they
still belong to. BrandFactory holds **no service-role key for Passport's project, must never be given
one**, and therefore *cannot* revoke a Passport-issued refresh token even if it wanted to.

What it can do, and what this phase builds:

1. **A subject denylist.** A small table written by the `removeMembership` handler and checked in the
   auth middleware, so a revoked person's still-valid access JWT stops being accepted by *BrandFactory*
   at the next request. This is the honest "revoke your own sessions" primitive for an app whose
   sessions are issued elsewhere, and it needs no foreign credentials.
2. **App-native sessions** are revoked through BrandFactory's own project, `scope: 'local'` semantics —
   our issuer, our sessions.
3. **Access dies by arithmetic regardless**, and that is the backstop: the next `rolesAtUnits` for that
   org returns `{}`. The denylist closes the window between the event and the next derivation.

Scope the denylist per organisation, not per person: a removal from org A must not end a session for
org B.

### Gate
Full gate. Test: deliver a real signed `membership.removed`, assert the row survives as
`status='removed'`, the denylist gains an entry, and a request bearing that subject is refused.

---

## ── The operator gate ──

**Everything above is additive. Nothing below can ship until Passport holds the data.** Phase 8 against
an empty projection is not the access shrink of proposal §6.2 — it is a **lockout of everyone**.

> **Amended 2026-08-18 by `D1-b`.** The gate stands, and the reason is worth stating precisely, because
> `D1-b` looks like it removes the danger and does not.
>
> `D1-b` keeps `workspaces` and `brands`, so an empty projection no longer means "no structure exists".
> It means **every local row is unlinked** — and under 8d an unlinked brand is visible to any active
> member of its workspace's organisation. With an empty projection there are no active members. So the
> lockout is identical; it merely arrives by a different route.
>
> The gate query below is therefore unchanged and still a gate, not a report. What `D1-b` adds is a
> fifth line worth checking: how many local rows will be unlinked on day one, from 8a. A large number
> is not a blocker, but it is a large access widening arriving in one deploy.

Three operator steps, in this order, and none of them is code:

1. **Import the structure.** Prefer running it **from the Passport side**: the Admin API is
   super-admin gated, and a consumer-side importer means a credential in BrandFactory's environment
   that outranks everything BrandFactory itself can do.
   - **Read Passport first.** `GET /orgs`, `GET /orgs/{org}/units`, `GET /orgs/{org}/unit-relations`.
     The common case is not a clean slate — another app has probably already imported the same
     business, under a different name and a colliding slug. Match by `(type, casefolded name)` and
     **reuse the existing UUIDs**. Unmatched and ambiguous rows are questions for a human, never a
     tie-break for an importer.
   - **Create through the API, never by writing Passport's database.** Its sync is an outbox:
     `create_unit` mutates, bumps and `emit()`s in one transaction. A raw `INSERT` produces a
     valid-looking unit and **no event, ever** — and you will debug BrandFactory's receiver for hours
     looking for a bug that is not there.
   - **A `409` does not mean "already exists at my id."** `POST /orgs` also returns it for a
     unique-slug collision with a completely different org. Confirm every `409` with a `GET` at your
     own id, and name the squatter rather than swallowing it.
2. **Grant the entitlement** (super admin, after the orgs exist). Until it is active, **every
   derivation returns `{}`** — the org-level kill switch, denying everyone including Owners, with no
   error anywhere. And `snapshot()` will not show it to you: snapshot is entitlement-scoped and
   returns eight empty collections regardless, which makes it doubly quiet. Verify with the Admin API.
3. **Switch BrandFactory on at each unit.** Creating units does not do this. A unit with no
   `unit_app_access` row confers access to **nobody**. Which units carry the app is a real access
   decision — surface it, do not default it.
4. **Invite every person as an org member and place them at their units.**

Then run the gate query. **It is a gate, not a report** — phase 8 ships only when
`unit_app_membership > 0` and `unmatched = 0`:

```sql
select 'unit_app_membership' k, count(*) v from passport.unit_app_membership
union all select 'membership',   count(*) from passport.membership
union all select 'local_users',  count(*) from public.users
union all select 'unmatched',    count(*) from public.users u
          where not exists (select 1 from passport.membership m
                            where lower(m.email) = lower(u.email) and m.status = 'active');
```

`unmatched` is also how the resolution bug is found early: membership resolves by **verified email**,
so a local row with a stale or absent email is a person who cannot be authorized.

---

## Phase 8 — the `structure` port and the link (BREAKING; `D1-b` decided)

**Rewritten 2026-08-18.** This phase was "retire the shadows". `D1-b` decided otherwise, on a
requirement the retirement cannot meet: during a Passport outage a person must be able to create a
brand **and work inside it**. So `workspaces` and `brands` **stay**, each gaining a nullable link to
its Passport row, and every structure read goes through a resolver.

Read `D1` in proposal §8 first. It carries the design, the costs, and the boundary — chiefly which
aggregates the shadow may **never** grow to include.

The behaviour change is still here and still breaking. Do not start it in the same pull request as
anything above.

**What did NOT change from the original phase 8:** the audit-first discipline (8a), the authorization
rewiring (8d), the frontend work (8f), and the rule that a write is refused at the handler before its
affordance is removed. None of those was ever about dropping the tables.

**What is gone:** the bridge-split-re-key-drop migration. Nothing is re-keyed and nothing is dropped,
because the local primary keys stay and stay stable. That removes the single largest risk this plan
carried.

### 8a. Audit against real data first

Unchanged in spirit, narrower in purpose. The schema says what is *possible*; only the data says what
is *true*, and this phase now needs the audit to size the **link**, not the migration.

```sql
select count(*) from workspaces;
select count(*) from brands;
-- Which local rows can be resolved to a Passport unit at all? Everything unresolvable stays
-- unlinked, which is now a supported state rather than a blocker — but the COUNT is the thing
-- to know before shipping, because every unlinked brand is visible org-wide (D1-b).
```

Two questions the audit must answer, because the access rule below depends on both:

1. How many brands will be unlinked on day one? Each is a knowing access widening until it links.
2. How many local brand names differ from their unit's legal name? Under `D1-b` that is fine and
   permanent — but it sizes the drift view, and a large number means the view matters on day one
   rather than eventually.

### 8b. The link columns, in one additive migration

No bridge, no split, no re-key, no drop. One migration:

```
workspaces.passport_organization_id  uuid null                 -- indexed
brands.passport_unit_id              uuid null unique          -- indexed; a unit links to
                                                               -- at most one brand
```

- **Nullable is the whole point.** `NULL` means "not yet in Passport", which is a first-class state,
  not a defect. A `NOT NULL` column here would make the outage path impossible.
- **`unique` on `brands.passport_unit_id`**, so two local brands cannot claim one unit. That is the
  constraint that turns the link's failure mode (proposal `D1`) into an error instead of a silent
  duplicate.
- **No foreign key to `passport.unit`.** The projection carries no constraints by design, and a
  cross-schema FK to a table the sync deletes rows from would fail a legitimate delete.
- **No `organization_id` on the app-owned tables.** The original plan added it for rule 9 scoping. It
  is unnecessary now: the org resolves through `brands.workspace_id → workspaces.passport_organization_id`.
  Rule 9's real requirement — never pin the app to one org — holds either way. Record this in the
  conformance test as met-by-resolution rather than leaving the checklist item ambiguous.

Backfill the links where a unit's `external_ref` matches `'brandfactory:<local id>'` or the local id
itself. **Leave the rest unlinked**; do not guess by name.

### 8c. The `structure` port — the one new abstraction

`packages/adapters/structure/`, following the five existing ports. This is the file that rots if
nobody watches it, so it gets the most attention in review.

It answers one question in two ways:

```
resolveBrand(localId)  ->  { id, displayName, legalName | null, unitId | null, linked: boolean }
```

Three rules, and each has a failure mode that passes silently:

1. **`displayName` always comes from `brands.name`.** For every brand, linked or not. It is the app's
   label and it is allowed to differ from the legal name for ever (proposal §5, point 1).
2. **`legalName` comes from `passport.unit.name` through the link, and is `null` when unlinked.**
   Never defaulted to the display label. A `null` legal name is the honest answer for a brand Passport
   has never seen, and any surface that needs a legal name must handle it rather than print a label
   into a statutory field.
3. **`status` is Passport's and is read through the link only.** Never copied to `brands`. A local
   `status` column is the shadow arriving, and it is the most likely one to be added, because "the
   list needs to grey out archived brands" is a reasonable-sounding request.

**Every structure read goes through this.** A source sweep enforces it — the same shape as the
sign-out and queue sweeps — because a direct `passport.unit` read that forgets the unlinked case
returns nothing for a locally created brand, and shows an empty page rather than an error.

### 8d. Rewire `authz.ts`

The one edit the file was built for, and it now has **two** branches rather than one.

`requireWorkspaceAccess` stops comparing `ownerUserId`. `requireBrandAccess` asks *"what is this user
at this unit?"* — `rolesAtUnits(…)[unitId]`. The aggregate chain keeps its shape.

Then the branch `D1-b` forces:

| Row | Rule |
| --- | --- |
| linked | the Passport derivation, with the org ladder above it. The only rule once the link lands. |
| unlinked brand | any **active member of the workspace's organisation** with BrandFactory access at that org |
| unlinked workspace | its **creator only** |

**The unlinked-brand rule is a knowing widening and must be commented as one at the code.** During the
unlinked window a brand is visible org-wide rather than to the people holding a role at it.

Do **not** collapse the roles map into a boolean to "preserve behaviour". Access legitimately shrinks
for some people. **That is a bug fix and it will be reported as a regression** — enumerate the
affected users from 8a and say so before shipping.

### 8e. What the shadows existed for — split, do not delete

**Workspaces.** `POST /orgs` is `require_super_admin` in Passport, so no BrandFactory user of any role
can mint an organisation *there*. But `D1-b` keeps local workspaces, so `POST /workspaces` **survives**
— creating a local workspace that links when a super admin creates the matching org. `NewWorkspaceDialog`
and the first-run page stay, with copy that says the workspace is local until Passport knows it.

This is a change from the original plan, which deleted all three. Record it: the deletion was correct
under `D1-a` and is wrong under `D1-b`.

**Brands.** `POST /workspaces/:id/brands` survives and gains a second half: create the local row, then
attempt the Passport create through phase 9's client. On success the event links it. On an outage the
attempt is queued and the brand is unlinked but usable — the requirement `D1-b` exists for.

**The privilege split is the part to get right** (proposal §6.1): the Passport-reaching create is
org-Admin-and-hosted-login only; the local create is not, and cannot be. So a non-Admin can create a
local brand, and **only an Admin can promote it.** Until an Admin drains the queue, the brand exists
in BrandFactory alone. Build it that way — a non-Admin create that reaches Passport unattended hands a
consumer app the power to add units to an org's structure with no org Admin involved.

**Split the editors.** A brand editor mixes Passport-owned fields (the legal name, the type-dependent
profile fields, structure) with app-owned ones (the display label, `description`, `website_url`). The
Passport-owned half is read-only except through phase 9's write-through, for org Admins on a
hosted-login session. The app-owned half keeps its form and works during an outage.

**Refuse at the handler first, remove the affordance second.** A route handler is an HTTP endpoint with
a stable path — it stays callable whether or not anything renders it. Prove it the way an attacker
would: `curl` the handler with a payload that used to work, as a user who used to be allowed. A `200`
with no button in the UI is a failure, not a pass. And the refusal is not selective — it refuses for an
org `Owner` too, or the old authority matrix has been reimplemented instead of the write being closed.

### 8f. Frontend

`WorkspaceSwitcher` becomes an org switcher over the orgs the person is a member of, **plus any local
workspaces they created**. `BrandRail` and `BrandSwitcher` list the units that carry BrandFactory and
where the person holds a role, **plus the unlinked local brands** their org rule admits.

**An unlinked row is labelled as unlinked, everywhere it appears.** Not as an error — as a state. A
brand that exists only here, and that sibling apps cannot see, must not look identical to one Passport
knows about.

### 8g. Conformance — record the violation rather than hiding it

The §0b shadow detector currently asserts **exactly** `brands` and `workspaces`. Under the original
phase 8 it would have shrunk to zero. Under `D1-b` it **stays at exactly those two**, and the test's
comment changes from "phase 8 retires these" to "`D1-b` keeps these, knowingly, for outage
authoring — a THIRD one is still a failure".

That is the honest form. The alternative — deleting the detector because the rule no longer holds — is
how a bounded, decided violation becomes an unbounded, undecided one.

### Gate
Full gate, plus the §0b and §0c detectors returning their expected states, plus the structure-read
sweep, plus a manual pass as four users: an org Owner, a `Manager` at one unit, someone with no role
at all, and someone looking at an **unlinked** brand.

---

## Phase 9 — the structure write-through (the documented rule 3 exception)

Proposal §7 is the decision record and the constraint list. Read it first; this is the build.

**Scope, stated as a boundary rather than a goal:** `unit` create / update / archive,
`unit_relation` create / delete, and `unit_app_access` enable / disable. **Nothing else.** No
membership write, no entitlement write, no `unit_app_membership` write, no `identity_link` write to
Passport, and none of the six App API routes that answer `410`. The scope is the exception; anything
outside it is still rule 3.

### 9a. The client

`packages/server/src/passport/structure-write.ts`. A thin client over Passport's **org API** — a
different door from `PassportClient`, which carries `X-API-Key` and has no unit routes at all.

```
POST   /api/v1/orgs/{org}/units                       create      -> 201 UnitConsoleRead
PATCH  /api/v1/orgs/{org}/units/{unitId}              update
POST   /api/v1/orgs/{org}/units/{unitId}/archive      archive
POST   /api/v1/orgs/{org}/unit-relations              attach
DELETE /api/v1/orgs/{org}/unit-relations/{relationId} detach
PUT    /api/v1/orgs/{org}/units/{unitId}/apps/{appId} switch BrandFactory on
DELETE /api/v1/orgs/{org}/units/{unitId}/apps/{appId} switch it off
```

Every call carries `Authorization: Bearer <the acting person's Passport access token>` and **no
`X-API-Key`**. `.replace(/\/+$/, '')` the base URL, as everywhere else — a trailing slash yields
`//api/v1/...` and a flat `404`.

**It must refuse to send anything but a Passport-issued token.** Read `tokenIssuer` from the request
context (phase 6c). On `app-native`, fail before the request with a message naming the reason, not a
forwarded `401`.

**Map Passport's statuses to our own faithfully**, because each means something different:

| From Passport | Means | Surface as |
| --- | --- | --- |
| `403` | a `Member` — not an Admin | "Only an organisation Owner or Admin may change structure" |
| `404` | an outsider to that org, deliberately indistinguishable from a missing org | the same as `403`; do not disclose |
| `422` | a rule broken — immutable `type`, a profile field the type cannot carry, an illegal relation pairing, cross-org | the field-level message; these are form bugs, so surface them where they can be fixed |
| `409` | a uniqueness collision (`external_ref`, one relation per `(from_unit, relation)`) | "already exists" — and for a relation, **compare the target before believing it** |
| timeout / `5xx` | Passport is unavailable | queue it (9c) and say structure is temporarily read-only |

### 9b. The routes and the form rules

`packages/server/src/routes/passport-structure.ts`, mounted under the auth gate.

The gate is two layers, and Passport is the authoritative one:

1. Our route rejects a caller whose `passport.membership.role` for that org is not `Owner` or `Admin`,
   read **verbatim** from the projection — no local `is_admin`, no `_ROLE_MAP` (rule 8). This is for a
   clear error before a round trip, and because a route handler stays callable whether or not a button
   renders it.
2. Passport re-checks with `require_org_access`. If the two ever disagree, Passport wins.

Note the vocabulary: this is the **org** role, not the unit-app role. A brand `Manager` cannot edit
structure. Conflating the two vocabularies is exactly what rule 8 forbids.

`org_id` comes from the acting user's membership, never from configuration (rule 9).

**The form is driven by `type`, because Passport enforces the shape:**

| type | Profile fields it may carry | Relations it may originate |
| --- | --- | --- |
| `entity` | `uen`, `gst_reg_no`, `registered_address` | none |
| `brand` | **none** — a brand is a concept, so no address and no tax registration | `owned_by_entity` → an entity (optional) |
| `outlet` | `address`, `postal`, `contact_phone`, `kind` | `belongs_to_brand` → a brand; `operated_by_entity` → an entity |

- **`type` is on the create form only.** `UnitUpdate` is `extra="forbid"`, so sending it on an edit is
  a `422`. A brand cannot become an outlet.
- **`external_ref` is read-only in our UI.** Under `D1-b` it is **`brands.id`**, set by the push in
  9c-bis, and the link depends on it. It was originally described as set by phase 8's bridge; that
  bridge no longer exists, but the conclusion is unchanged and now stronger — editing it would break
  the link between a local brand and its unit.
- **`description` is never sent.** Passport accepts it and deliberately never syncs it back, so writing
  it would create a copy we can never read. It stays app-owned in `brand_profile`.
- **Re-parenting is `DELETE` then `POST`** — relations are immutable. The delete is a destructive write
  to structure sibling apps share, so it gets its own confirmation and is never auto-applied to
  "fix" a conflict.

**A create is two calls, and the second is not optional:** create the unit, then `PUT` the app-access
row. A unit carrying no `unit_app_access` row for BrandFactory confers access to **nobody**, not even an
org Owner — the ladder still requires a unit that carries the app. If the second call fails, say so
explicitly and queue it; a silent partial create looks exactly like a broken create.

### 9c. The attempt queue — failures only

Migration: `passport_write_attempts` — `id`, `organization_id`, `operation`, `payload jsonb`,
`unit_id` (nullable, absent for a create), `attempted_by`, `attempts`, `last_error`, `created_at`,
`expires_at`.

- **It holds attempted operations, never current state.** A proposed name is a Passport fact, so a
  table of pending *edits* would be a rule-7 shadow. This queue is legitimate because a row exists only
  after a write has failed, **nothing reads it except the retry UI**, it is deleted on success, and it
  expires.
- **This is your "button when there are changes."** An Admin sees "N structure changes could not be
  saved — retry", retries one or all, and can discard.
- **A row is never a source of truth for a screen.** The brand list always reads `passport.unit`.

### 9c-bis. The link, on the returning event (`D1-b`)

**New 2026-08-18.** `D1-b` makes the queue more than a retry buffer: it is the **promotion path** for a
locally created brand. So the round trip has a fourth step that did not exist when this phase was
written.

1. Local create. `brands` row exists, `passport_unit_id` is `NULL`, the brand is usable.
2. The push carries **`external_ref = brands.id`**. Stable per brand, so a replay is idempotent and a
   duplicate answers `409` rather than making a second unit.
3. Passport answers `201` and emits `unit.upserted`.
4. **The receiver sets `brands.passport_unit_id`** where the event's `external_ref` matches an unlinked
   local id.

Four things about step 4:

- **It writes `brands`, not `passport.unit`.** `brands` is app-owned, so the projection keeps exactly
  one writer and the read-only enforcement is untouched. Do not be tempted to "complete" the link by
  writing anything into `passport.*`.
- **It is idempotent and version-independent.** The link is set once and never changes; a replayed
  event finds the row already linked and does nothing. Do not put the link behind the version guard —
  it is not a projected field.
- **`unique` on the column is what makes a mismatch an error.** Without it, two local brands claiming
  one unit is a silent duplicate.
- **A unit whose `external_ref` matches nothing must not be dropped silently.** It is either a brand
  created by another app, or the failure mode in proposal `D1` — a ref that never matched. Log it, and
  report it from reconciliation as a unit carrying a `brandfactory:` ref with no local row.

**The `unlinked` count is not optional under `D1-b`.** A queue nobody drains leaves a growing set of
brands that exist in BrandFactory and nowhere else, invisible to every sibling app, with nothing
failing. Surface it beside the failed-write queue in the same Admin view (9e).

### 9d. Nothing writes the projection

The write goes to Passport; Passport emits `unit.upserted` / `unit_relation.created` /
`unit_app_access.created`; the receiver applies it. Writing `passport.unit` ourselves would fight the
version guard and put a second writer on a replica the whole design makes read-only.

So the UI shows the row as **pending** between the `2xx` and the event — usually about a second. Use
Passport's response body for optimistic client state only, and never persist it. **Show the pending
state**, or a correct save reads as a failure and the Admin presses it again.

### 9e. The drift view — now buildable, and it has two jobs

> **Amended 2026-08-18 by `D1-b`.** This section was blocked before the decision: there was no
> correspondence between a local brand and a Passport unit, so "differs from what this app last
> displayed" had nothing to compare. `brands.passport_unit_id` is that correspondence. The view now has
> a data source and **two** distinct jobs, which should be two sections of one screen rather than one
> merged list:
>
> 1. **Divergence** — linked brands where `brands.name` differs from `passport.unit.name`. Under
>    `D1-b` this is **expected and permanent** for every brand whose label is shorter than its legal
>    name, so the view must not present it as an error. Its purpose is to make a rename in Passport
>    *visible*, since the app's label deliberately does not follow it (proposal §5, point 1).
> 2. **Unlinked** — local rows with no Passport row, and the failed-write queue behind them. This is
>    the half that needs attention, because an unlinked brand is both an access widening (8d) and
>    invisible to sibling apps.
>
> Keeping them separate matters. Merging them produces a screen with dozens of permanent, correct
> "divergences" hiding the two rows that need an Admin to act.

### 9e-bis. The original statement of the view

A read-only Admin screen listing units whose Passport values differ from what this app last displayed,
plus anything sitting in the queue. This is the honest home for "are there changes?" — and it is also
how a conflict caused by another app or by the console becomes visible instead of surprising someone.

### 9f. The confirmation, in the user's words

The dialog names the blast radius rather than asking a generic "are you sure":

> This changes the brand in Passport. Other Mission Systems apps read this name, including for
> statutory output. Continue?

For a detach it names what is being broken. For an archive it says the unit stops conferring access to
everyone at it.

### 9g. Tests

- The client refuses an `app-native` token before issuing a request.
- Each Passport status maps to the right surfaced error, and `404` is indistinguishable from `403`.
- Our own route refuses a `Member` and refuses a brand `Manager` who is not an org Admin.
- A create issues both calls, and a failure of the second is surfaced and queued.
- `type` is absent from every update body; `description` is absent from every body.
- A profile field illegal for the type never leaves the form.
- Nothing in the write path writes `passport.*` — assert by a source sweep, the same shape as the
  `signOut` guard, so the next contributor cannot quietly add an optimistic local update.
- A queued attempt is deleted on a successful retry, and nothing but the retry UI reads the table.

### Verification
As an org Admin on a hosted-login session: create a brand, watch the row appear by event rather than by
local write, confirm BrandFactory is switched on at it, then rename it and confirm the change in the
Passport console. As a `Member`: confirm the affordance is absent **and** the route refuses. As an
app-native Admin: confirm the affordance is absent and the reason is legible.

### Gate
Full gate. Then record the exception: proposal §7 is the decision record, and phase 10's rule 3 sweep
cites it rather than reporting a clean tree.

---

## Phase 10 — conformance, Renovate, CI

1. **Work the acceptance checklist** end to end (`reference/acceptance-checklist.md`), including
   rule 3's *proven by absence* section: grep the whole tree for the closed methods
   (`assignUnitAppRole`, `setUnitAppRole`, `removeUnitAppRole`, `reportIdentityLink`) and for
   hand-rolled HTTP around the closed routes. **Do not over-close the sweep** —
   `session-exchange`, the registry read, `snapshot()` and token verification are reads and
   redemptions, not writes, and deleting any of them takes login down. That mirror-image failure has
   its own check for a reason.
   - Know **which database** the evidence came from. A green run against a deployed URL proves the
     deployed build works against the deployed schema and says nothing about a local migration.
   - **Rule 3 does not come back clean, and the write-up must not claim it does.** Detector (D) hits
     phase 9's structure write-through by design. Record it as an **accepted exception with its scope
     named** — `unit`, `unit_relation`, `unit_app_access`, via Passport's **org** API, with the acting
     Admin's own token — citing proposal §7 as the decision record. Then assert the boundary rather
     than the absence: the six App API write routes are never called, no membership / entitlement /
     `unit_app_membership` write exists anywhere, and `X-End-User-Token` is forwarded nowhere. An
     exception that is documented and bounded is a different thing from a sweep that was not run, and
     a reader six months from now can only tell them apart if this says which one it is.
2. **Drive Passport's contract kit** (`backend/tests/contract/` in the Passport repo) against the
   receiver: assert the read model equals `snapshot()` per collection, then replay and assert no
   change.
3. **Add the detectors to CI** as a test. `§0b` (shadows, vocabulary) and `§0c` (org filters) pass
   silently when violated — nothing errors, the app just serves stale or over-broad answers — so a
   grep in CI is the only thing that catches a reintroduction.
4. **Renovate.** `renovate.json` extending
   `local>missiongroupsystems/passport//renovate/passport-consumer`, plus the CI gate that installs,
   imports and tests against the SDK. Auto-merge trusts CI, so if CI does not exercise
   `passport-client` a green check proves nothing.
   - This needs a `staging` branch to run the two channels (`main` = stable, `staging` = prerelease),
     and repo settings the plan cannot write: **Settings → General → Allow auto-merge**, and branch
     protection on `main` requiring the CI check. Without those, a green bump PR just sits.
   - **BrandFactory pins a git SHA, not a package version**, so Renovate's `passport-client` preset
     may not track it. Confirm whether the preset understands a `git+…#<sha>&path:` specifier; if it
     does not, the honest answer is a scheduled check rather than a broken automation that looks like
     a working one. The SDK is also a **hand-port** with no release tags of its own — Workforce
     handles this with `scripts/check-passport-port.mjs`, which warns in CI when the pinned SHA falls
     behind a change under the Python source. Consider the same.

### The one thing that forces an upgrade
`SCHEMA_VERSION` is `1` and is append-only. Within it the protocol is forward-compatible: unknown
event types no-op and extra payload fields are ignored, so additive releases never force a move.
**Across a bump none of that holds** — the receiver rejects *every* event with a `400` before
dispatch, the delivery worker pauses, and the projection freezes. Receivers upgrade first, then
Passport ships the bump.

---

## What this plan deliberately does not do

- **Touch `packages/web-next`.** It has no auth, no backend wiring and no `.env`; a login built there
  would reach nobody. It inherits all of this when its screens move.
- **Build a read-through allow-list.** It ships **empty**, and empty-forever is the healthy steady
  state. Reads are projection-first: the replica *is* the cache, and a better one than a TTL, because
  a revocation lands in roughly event latency instead of at the end of a cache window. No TTL cache in
  front of the projection, and no API-first path with the projection as a fallback — that would make
  the resilient path the cold, untested one and give the same authz check strong consistency when
  Passport is up and eventual consistency when it is down.
- **Any client polling.** Reconciliation is the sanctioned server-side nightly job.
- **Write any of the eight aggregates except the three named in phase 9.** No role-assignment screen,
  no membership editor, no entitlement editor, no `identity_link` push to Passport. Those are edited in
  the Passport console and arrive here as events. Structure — `unit`, `unit_relation`,
  `unit_app_access` — is the one exception, org-Admin-only and documented in proposal §7.
- **Create an organisation.** `POST /orgs` is super-admin gated, so no BrandFactory user of any role
  can mint one. "Create workspace" stays dead.
- **Hold a super-admin credential.** Nothing in this integration needs one, and the write-through
  deliberately borrows the acting person's own token instead — a credential that outranks nothing they
  could not already do in the Passport console themselves.
