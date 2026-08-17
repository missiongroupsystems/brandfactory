# Passport sync consumer — proposal

**Goal.** Make BrandFactory a conforming **Passport sync consumer**. Mission Passport becomes
the source of truth for organisations, structure units, platform users, memberships, roles and
entitlements. BrandFactory *projects* those facts into a local read-model and reads them on its
request path. It mints and mutates none of them.

The repo has been expecting this. `packages/server/src/authz.ts` says so at the one place the
whole app gates aggregate access:

> Interim shared-access model: every authenticated user may reach every workspace … `ownerUserId`
> is still written on the row for provenance and for the coming Passport migration, which will
> reintroduce org membership and per-user permission scopes *here*.

This document is the *why* and the *what changes*. The ordered work is in
[`passport-sync-consumer-plan.md`](./passport-sync-consumer-plan.md).

---

## 1. What "conforming" means

Nine rules, from the `passport-sync-consumer` skill. Six of them BrandFactory satisfies by being
greenfield; three are the substance of this work.

| # | Rule | Where BrandFactory stands |
| --- | --- | --- |
| 1 | One sync receive endpoint: verify HMAC → reject stale `schema_version` → version-guarded apply → 2xx only after commit | new |
| 2 | Project **all eight** aggregates — organization, unit, unit relation, membership, entitlement, identity link, unit-app-access, unit-app-membership | new |
| 3 | **No consumer writes to any synced aggregate.** All eight are edited in the Passport console | **deliberate scoped exception** — §7. `unit`, `unit_relation` and `unit_app_access` are written from BrandFactory by an org Admin, over the org API, with that person's own Passport token. The other five stay closed. |
| 4 | Nightly snapshot reconciliation, server-side | new |
| 5 | Adopt Passport UUIDs as primary keys, verbatim | new |
| 6 | React to `membership.removed` by revoking the user's grants **and their live sessions — ours only** | new |
| 7 | **No shadow tables.** The projection *is* the org model | **violated today** — `workspaces`, `brands` |
| 8 | **Passport's vocabulary verbatim.** `Owner\|Admin\|Member`, `Manager\|Staff`. Checks become unit-scoped | **behaviour change** — BrandFactory has no roles at all today |
| 9 | **Multi-org from day one.** Never pin to one org | **violated today** — no table carries `organization_id` |

## 2. The audit

The skill's five detectors, run against this repo.

| Detector | Result |
| --- | --- |
| §0 — stale wire contract | **Clean.** No Passport code exists. This is a greenfield build, not a wire migration. |
| §0b — shadow tables + local role vocabulary | **Hit (tables only).** `workspaces`, `brands` and `users` carry facts Passport owns. **No local role vocabulary** — `1.29.0` removed the one owner gate, so there is nothing to translate and no `is_admin`, `user_type` or `_ROLE_MAP` anywhere. |
| §0c — single-org | **Hit.** No table carries an `organization_id`. Every app-owned table hangs off `workspaces`. |
| §0d — consumer writes | **Clean.** |
| §0e — sign-out scope | **Hit.** `packages/web/src/auth/session.ts:101` calls `supabase.auth.signOut()` with no scope. GoTrue defaults to `global`. |

**§0e is the cheapest fix and the only one whose damage lands in other people's apps.** Today
BrandFactory's sessions come from its *own* Supabase project, so the blast radius is BrandFactory
alone. The moment a member's session is issued by *Passport's* project — which is what makes hosted
login work — that one omitted argument revokes every refresh token the person holds across the whole
suite, including Passport's own console. The symptom arrives up to a token lifetime later, in a
different app, and gets filed as flaky sessions. It is fixed in phase 1 rather than with the login
work, because it costs one argument and one test.

## 3. What we are building against

### 3.1 There is a TypeScript SDK, and a TypeScript precedent

The skill's scaffold is Python/FastAPI/SQLModel/Alembic. BrandFactory is TypeScript/Hono/Drizzle.
Neither is a problem:

- **`@missiongroupsystems/passport-client` 3.0.0** lives at
  `passport/packages/passport-client/typescript`. It is a module-for-module port of the Python SDK
  on the same wire — `applyEvent`, `SyncHandlers` (all 17 names), `verifySignature`, `isNewer`,
  `rolesAtUnits`, `hasAppAccess`, `PassportClient.snapshot()`, and Zod models for every payload.
- **`launchpad`** already consumes it in a Hono + Drizzle + Supabase pnpm monorepo — the same stack.
  Its `packages/server/src/{db/passport-schema.ts,routes/passport-sync.ts,services/passport/*}` is
  the shape this plan follows.

Two things the TS SDK does **not** carry, both expected:

| Missing | Consequence |
| --- | --- |
| `build_sync_router` (a FastAPI helper) | We write the Hono route ourselves: raw body → `verifySignature` → `schema_version` gate → `applyEvent`. Sanctioned; the primitives are all in the SDK. |
| `sessionExchange`, `getMemberships`, `getUnits`, `listUnitAppMemberships` | `session-exchange` is one hand-rolled `fetch` (it redeems an `auth_handoff_code`, which is **not** one of the eight aggregates, so rule 3 does not touch it). The reads are unnecessary — reads are projection-first. |

`ResyncFanoutMixin` is not ported either; we write the eight-line fan-out ourselves, as Launchpad does.

### 3.2 Placement and cascade are two separate fields (2026-08-14)

The contract that governs step 0 moved twice, and the second move is recent enough that older
consumers in this workspace still read the retired shape.

| | Retired | Current |
| --- | --- | --- |
| Registry | one `unit_scope` enum: `entity\|brand\|outlet\|entity_outlet\|brand_outlet`, `NULL` ⇒ brand | **`unit_scopes: UnitType[]`** (a **set**, default `["brand"]`) **plus** `role_cascade: boolean` (default `false`) |
| Helper | `roles_at_brands(...)` | `rolesAtUnits(...)`, renamed in SDK 2.0.0 with no shim |
| Cascade | implied by the shape — the two dual values cascaded, the three single ones did not | **its own field.** Two levels no longer implies inheritance |
| Suspension | not gated | **`orgRole === null` is a FULL gate**, not merely a ladder gate |

Why the split matters rather than being cosmetic: one field said both things, so an app living at two
levels **without** inheriting between them could not be described at all. It can now — and a consumer
that infers "two levels ⇒ roles flow down" over-permits.

The suspension gate is the other one to get right. `org_membership.status = 'suspended'`
deliberately does **not** cascade to role rows — that is what makes it reversible and lossless — so a
suspended member's rows are still `active`. Without the gate a disabled person keeps working. We
therefore pass `null` for any membership that is not `active`, never `role ?? null`.

Verified against `backend/app/api/schemas.py::_ScopedAppMixin`,
`backend/app/domain/unit_scope.py` and the TypeScript SDK's compiled `dist/access.js`. The
`passport-sync-consumer` skill documents all of this as of its 2026-08-17 revision; where a residual
sentence in it still describes the five-value vocabulary, the code above is what we followed.

## 4. Step 0 — the app's placement

The app is registered, so this is a **read, not a guess**: `GET /api/v1/apps/me/registry`, header
`X-API-Key`, fields `unit_scopes` and `role_cascade`. The path is `/apps/me/registry`, never a bare
`/apps/me` — that matches `app_id="me"` on the super-admin route and answers `401`, which reads as a
bad key and is not. No SDK method wraps it; this is the one sanctioned hand-rolled request.

Read **once at startup**. The registry is not a synced aggregate, so no event announces a change and
`snapshot()` does not carry it. A re-scope needs a restart. `PASSPORT_UNIT_SCOPE` is deliberately
**not** a configuration variable — it would be a local copy of a fact Passport owns, and it drifts
silently the moment an operator re-scopes the app.

> ### ⚠️ Read `unit_scopes` (plural). Never the deprecated `unit_scope`.
>
> The same registry response also carries a singular `unit_scope`. It is **derived**, it can name
> only five of the seven possible combinations, and it is **`null`** for the rest — `{entity, brand}`,
> **all three types**, and either dual shape without cascade.
>
> **BrandFactory's chosen shape is one of the `null` cases.** A consumer that derived placement from
> the singular field would read `null`, fall back to the documented default `["brand"]`, and silently
> narrow itself to brands — a **silent under-permission with no error to catch**. `null` is the right
> answer for the one thing the SDKs read that field for (the cascade lookup, since no such shape
> cascades) and the wrong answer for anything reading placement.
>
> The registry reader therefore reads `unit_scopes` and `role_cascade` and **ignores the singular
> field explicitly**, with the reason written at the code.

### The answer given, and its one hard consequence

You chose **"any level"** — `unit_scopes = ["entity", "brand", "outlet"]`. That is legal, and it means
a BrandFactory role may sit at any of the three unit types.

> ### ⚠️ All three levels and role inheritance are mutually exclusive
>
> This is not "the cascade is inert on that shape". **Passport refuses the combination outright.**
> `backend/app/domain/unit_scope.py::cascade_relation` raises when `role_cascade` is set on a shape
> outside `CASCADABLE_SHAPES`, and the router maps that to a **422**:
>
> > `role_cascade requires unit_scopes to be exactly {entity, outlet} or {brand, outlet}; got …`
>
> The SDK agrees on the read side, matching on set **equality**, and says why:
>
> > *All three types together are deliberately absent: an outlet reaches an entity directly OR via
> > its brand's owner, and those can name DIFFERENT entities.*
>
> So on BrandFactory's shape, `role_cascade` is necessarily **`false`**. A `Manager` at a brand does
> **not** reach the outlets beneath it. Every unit needs its own `unit_app_membership` row — or the
> person is an org `Owner`/`Admin` and holds `Manager` at every unit carrying the app, by the ladder.
>
> Inheritance is available only by **narrowing** the shape to `["brand","outlet"]` or
> `["entity","outlet"]` in the Passport console. That is an operator change picked up on the next
> restart, not a code change. It is a genuine either/or, and it is `D3` in §8.

We pass `unitScopes`, `roleCascade` **and** `relations` on every call regardless. `relations` changes
no answer while `role_cascade` is false, and passing it anyway means a later narrowing in the console
is a restart rather than a hunt for an omitted argument — the omission that makes inherited roles
vanish with nothing raised (Trap 8).

## 5. The domain mapping

Decided in review. A BrandFactory **workspace** is a Passport **organisation**; a BrandFactory
**brand** is a Passport **unit** of whichever type the org switches BrandFactory on at.

> **Amended 2026-08-18 by `D1-b`.** The mapping below still says what corresponds to what, and every
> numbered point under it still holds. What changed is that `workspaces` and `brands` **survive** as
> app-owned tables with their own keys, each carrying a nullable link to its Passport row, rather than
> being retired. Read `D1` in §8 for the shape and the cost; the arrow in this diagram now means
> "links to", not "is replaced by".

```
workspaces (local, KEPT)    ->  passport.organization
  id            (own UUID)        id, name, slug, status, version
  passport_organization_id ----^  the link. NULL until the sync lands.
  name                            name          <- may differ; ours is a label
  owner_user_id               ->  passport.membership (role = Owner)
  (app-owned settings)            workspace_settings, keyed by the LOCAL id

brands (local, KEPT)        ->  passport.unit  (entity | brand | outlet)
  id            (own UUID)        id, organization_id, type
  passport_unit_id ------------^  the link, unique. NULL until the sync lands.
                                  Pushed up as external_ref = brands.id.
  name          <- the DISPLAY    name          <- the LEGAL name
                   label; may                     `Casa Vostra Pte. Ltd.`
                   differ for ever
  description, website_url        app-owned. Passport never syncs description
                                  back, so these are refinements, not copies.

users (local)               ->  passport.membership  for the roster and roles
  email, display_name             email, display_name, role, status
                              ->  a NARROWED local auth identity survives — see D2
```

Three points that are easy to get wrong and are load-bearing:

1. **`passport.unit.name` is the LEGAL name.** It is a directory shared with other Mission apps and
   used for statutory output — `Casa Vostra Pte. Ltd.` where staff read `Casa Vostra`.

   Under `D1-b` this stops being a migration hazard and becomes a permanent, deliberate pair:
   `brands.name` **is** the display label and keeps its current values, so nothing is backfilled and
   no `coalesce` is needed. The two fields mean different things and may differ for ever.

   What replaces the hazard is a **visibility** duty. A rename in Passport no longer reaches the app's
   label, which is correct by design and will be reported as a bug. Phase 9e's drift view is the
   answer, and the link column is what makes it possible. Original wording, for the record: without a
   label of its own every picker, header and prompt would silently switch to "Pte. Ltd." names, with
   nothing erroring and the original strings gone.
2. **`description` is Passport-only and reaches no consumer, by push or by pull.** Passport has the
   column; it is deliberately absent from `UnitPayload` and always will be. BrandFactory's brand
   description is therefore an app-owned refinement, not a duplicate — and it is load-bearing here,
   because `1.24.0` made the brand `TL;DR` the description line on the hub, on the workspace cards
   *and in the agent prompt*.
3. **A refinement is rule 7's carve-out used properly, not a loophole.** `description`,
   `website_url` and the display label are legitimate because they cover concepts Passport has no
   notion of, or that it deliberately never syncs back.

   Under `D1-b` no separate `brand_profile` table is needed — those columns already live on `brands`,
   which survives. The carve-out test still applies to every column there: it must be a concept
   Passport has no notion of, or a label whose divergence is intended. **A column that restates a
   Passport field and is expected to track it is a shadow**, and `status` is the one to watch: a
   unit's status is Passport's and must be read through the link, never copied.

## 6. The behaviour changes

These are product changes, not refactors. Each will be reported as a regression by somebody unless
it is stated up front.

### 6.1 "Create workspace" dies; "create brand" survives, for Admins only

> **Amended 2026-08-18 by `D1-b`.** The narrowings below hold **for the write that reaches Passport**.
> What `D1-b` adds is a second, weaker path: a brand may also be created **locally** while Passport is
> unreachable, and pushed up when it returns. That path is not Admin-only and not hosted-login-only —
> it cannot be, because its whole purpose is to work when hosted login does not.
>
> So the create becomes two operations with two different gates, and the difference must be legible in
> the UI rather than inferred:
>
> | Path | Gate | Result |
> | --- | --- | --- |
> | Passport reachable | org `Owner`/`Admin`, hosted-login session | a real unit, immediately |
> | Passport unreachable | whoever may create a brand in this app today | a **local** brand, linked when Passport returns |
>
> **The second path is a privilege widening during an outage**, and it is the sharpest edge in
> `D1-b`. Somebody who is not an org Admin can create a brand that later becomes a Passport unit that
> sibling apps read. Three bounds, none of which removes it:
>
> - the local brand is **visible as unlinked** until it links, and the count is shown to Admins;
> - the push still goes through phase 9's client, so **the replay needs an Admin on a hosted-login
>   session** — a non-Admin's local brand does not reach Passport on its own;
> - nothing about the local row confers a structure-write capability.
>
> That second bound is the load-bearing one and it should be read carefully: a non-Admin can create a
> local brand, but **only an Admin can promote it**. Until an Admin retries the queued create, the
> brand exists in BrandFactory alone. That is the shape to build, because the alternative — letting a
> non-Admin's create reach Passport unattended — hands a consumer app the power to add units to an
> org's structure without an org Admin ever being involved.

**Workspaces.** `POST /orgs` is `require_super_admin`, so no BrandFactory user of any role can mint an
organisation. `NewWorkspaceDialog`, the `/workspaces` first-run page and `POST /workspaces` all go. A
super admin creates the org in the Passport console and it arrives by sync.

**Hiding the button is not closing the write.** `POST /workspaces` is an HTTP endpoint with a stable
path — it stays callable whether or not anything renders it. It refuses at the handler first, and the
affordance comes out second, in that order.

**Brands, outlets and entities.** These survive, rebuilt on the write-through in §7:
`NewBrandDialog` becomes an Admin-only dialog that creates a Passport unit and switches BrandFactory
on at it. Three narrowings, all enforced by Passport rather than by us:

- **Org `Owner`/`Admin` only.** A brand `Manager` cannot create or edit a unit.
- **Hosted-login sessions only.** An app-native Admin has no Passport token to forward.
- **`type` is chosen once**, on create. It cannot be changed afterwards.

### 6.2 Access stops being "everyone sees everything"

Today (`1.29.0`) every signed-in user reaches every workspace and every brand. After this work,
access is **derived** from five facts and is **unit-scoped**:

```
access(user, app, org) ⟺ entitlement(org, app).status = active
                       ∧ the user holds an ACTIVE org membership        -- a FULL gate, not a
                                                                       -- ladder-only one
                       ∧ ∃ unit U in org, U.status = active, with unit_app_access(U, app)
                       ∧ ( ∃ active unit_app_membership(user, U, app)   -- Manager | Staff
                         ∨ user's org role ∈ {Owner, Admin} )           -- the LADDER
```

`rolesAtUnits()` returns a **map** `{unitId: role}`. There is no "effective role", and collapsing
the map into one flag (`Object.values(roles).includes('Manager')`) reinstates the over-grant it
exists to remove. `requireBrandAccess` in `authz.ts` becomes the one place that asks *"what is this
user at this unit?"* — which is exactly where the existing comment says the scoping should land.

### 6.3 Nobody has access until an operator acts in Passport

This is the failure mode that bites every consumer, and it is a **lockout, not a shrink**:

```
passport.unit                N   <- structure arrives the moment you import
passport.unit_app_access     N   <- BrandFactory switched on at each unit
passport.entitlement         1   <- active
passport.membership          1   <- only the operator who ran the import
passport.unit_app_membership 0   <- NOBODY holds Manager/Staff anywhere
```

Against that state, moving authorization onto the projection denies **everyone**. The unblock is an
operator action in the Passport console — invite each person as an org member and place them at the
units they work at — **not a code change**. Phase 8 is gated on
`unit_app_membership > 0` **and** every active local user matching a `passport.membership` by
verified email. The gate is a query, not a report.

### 6.4 The login screen gains a step

One email field and Continue. The app then routes: an active member goes to Passport's hosted login
and never sees a password field; everyone else gets one revealed in place. No SSO button, no toggle
— the user never has to know which kind of account they hold.

The magic link and the Google button from `1.27.0`/`1.28.0` become the **`app-native` branch**, and
that branch stays forever: it is the non-member path *and* the degradation path when Passport is
unreachable.

## 7. The structure write-through — a documented exception to rule 3

**Decided in review, against my recommendation, and recorded as such.** BrandFactory keeps the ability
to create and edit brands, outlets and entities from inside its own UI. The change is written to
Passport over the API, using the signed-in person's Passport access token, behind a confirmation, and
only for an org `Owner` or `Admin`.

This **knowingly breaks rule 3.** The exception is scoped, so the rest of the rule keeps its force.

### 7.1 The mechanism, and why it is the only one

Passport has two doors, and BrandFactory holds the key to the wrong one:

| Door | Credential | Unit routes |
| --- | --- | --- |
| **App API** — what BrandFactory's own key reaches | `X-API-Key` | **None.** Verified by listing every route in `backend/app/api/routes/app_api.py`: `GET /registry`, `GET /snapshot`, `GET /orgs/{org}/memberships`, two unit-app-membership reads, `POST /session-exchange`, and six write stubs answering `410 Gone`. There is no unit route at all — not create, not update, not even a read. |
| **Org API** — what the Passport console uses | `Authorization: Bearer <platform user JWT>` | Present, and gated on `require_org_access`: an org `Owner`/`Admin`, or a super admin. |

So BrandFactory cannot write a unit *as an app*. It can only write one *as the signed-in person*, by
forwarding that person's Passport-issued token. Two consequences fall out immediately:

1. **Write-through is only available on the hosted-login branch.** An `app-native` session carries a
   token signed by BrandFactory's own project; Passport would reject it, and we must not send it. The
   affordance is therefore hidden for app-native sessions, and the request path must know which issuer
   signed the current token.
2. **It cannot ship before the login.** Phase 6 is where BrandFactory first holds a Passport token.

### 7.2 What is reachable, exactly

Every route below is `require_org_access` — Passport enforces `Owner`/`Admin` itself.

| Action | Route |
| --- | --- |
| Create an entity, brand or outlet | `POST /api/v1/orgs/{org}/units` → `201` with the new UUID |
| Edit one | `PATCH /api/v1/orgs/{org}/units/{unit_id}` |
| Archive one | `POST /api/v1/orgs/{org}/units/{unit_id}/archive` |
| Attach or detach structure | `POST` / `DELETE /api/v1/orgs/{org}/unit-relations` |
| **Switch BrandFactory on at a unit** | `PUT /api/v1/orgs/{org}/units/{unit_id}/apps/{app_id}` |

**Creating an org stays impossible** — `POST /orgs` is `require_super_admin`. So §6.1 is unchanged:
"Create workspace" still dies. (`PATCH /orgs/{org_id}` *is* Admin-reachable, so renaming a workspace
could be added later. It is out of scope until asked for.)

**The app-switch route is not optional in the create flow.** A unit carrying no `unit_app_access` row
for BrandFactory confers access to **nobody**, not even an org Owner, because the ladder still requires
a unit that carries the app. An Admin who creates a brand and cannot then see it would read that as a
broken create. So a create is **two calls**, and the second failing must be surfaced, not swallowed.

### 7.3 The rules Passport enforces, so the UI must not offer otherwise

Each of these is a `422` if violated, and each is a form-design constraint:

- **`type` is immutable.** `UnitUpdate` sets `extra="forbid"`, so sending `type` on an edit is a `422`.
  A brand cannot become an outlet. The type picker exists on create only.
- **Profile fields are type-dependent** (`PROFILE_FIELDS_BY_TYPE`): an **entity** carries `uen`,
  `gst_reg_no`, `registered_address`; an **outlet** carries `address`, `postal`, `contact_phone`,
  `kind`; a **brand** carries **none** — it is a concept, and concepts have no address. A field set on
  the wrong type is a `422`, so the form is driven by the chosen type.
- **Exactly three legal relations**, capped at one per `(from_unit, relation)` by a unique constraint:
  `belongs_to_brand` (outlet → brand), `operated_by_entity` (outlet → entity), `owned_by_entity`
  (brand → entity — the only one not starting at an outlet, and optional). Cross-org is refused.
- **Relations are immutable.** Re-parenting is `DELETE` then `POST` — two calls, and the delete is a
  destructive write to structure other apps share. Confirm it separately and never auto-fix a conflict.
- **`UnitCreate.id` is super-admin only**, so BrandFactory cannot supply a UUID. It reads the one
  Passport returns.

  **This is the constraint `D1-b`'s design is built around**: because we cannot choose the unit's id,
  the local key cannot be the Passport key, and `external_ref` is the only place our own identifier can
  travel. So `external_ref` is **`brands.id`** — set by the push, stable per brand, and the key the
  returning event links on. Originally this said phase 8's bridge would set it; that bridge is gone,
  and the conclusion is now stronger. It stays **read-only in our UI**, because an Admin editing it
  would break the link between a local brand and its unit.
- **`description` is accepted on write and never synced back.** Passport has the column and
  deliberately omits it from `UnitPayload`. Writing it up would create a copy we can never read. So
  **we do not send `description`** — it stays app-owned on `brands`, exactly as §5 says. (§5 originally
  named a separate `brand_profile` table; under `D1-b` the column already lives on the surviving
  `brands`, so no new table is needed. The rule is unchanged.)

### 7.4 The shape: write straight through, with a retry queue for failures only

Your ask was "prompt before syncing" and "a button to trigger it when there are changes". Built as a
table of pending local edits, that is a shadow by construction — a proposed brand name is a Passport
fact, it goes stale when Passport changes underneath, and the app then holds two answers to what the
brand is called. So:

- **The edit form writes straight through.** No local copy of a Passport-owned field is ever stored.
  The **prompt** is a confirm dialog before the request; the **manual trigger** is the Save button.
- **A failed write lands in an attempt queue**, and that is what your "button when there are changes"
  becomes. It holds *attempted operations*, not current state; nothing reads it except the retry UI;
  a row is deleted on success and expires on abandonment. Bounded and short-lived, so it cannot drift
  into a second org model.
- **Nothing writes the projection.** The write goes to Passport, Passport emits the event, the receiver
  applies it. Writing `passport.unit` ourselves would fight the version guard and put a second writer
  on a replica the design makes read-only. The row therefore shows as **pending** until the event
  lands — usually about a second. Show that state, or a correct save looks like a failure.
- **A drift view** lists units whose Passport values differ from what this app last saw, for Admins.
  That is the honest home for "are there changes?".

### 7.5 The Admin gate, in two layers

- **Passport is authoritative.** `require_org_access` admits an org `Owner`/`Admin` or a super admin,
  and answers `404` to an outsider and `403` to a `Member`.
- **BrandFactory mirrors it** from `passport.membership.role ∈ {Owner, Admin}`, read **verbatim** —
  no local `is_admin` flag, no `_ROLE_MAP` (rule 8). This gives a clear refusal before the round trip
  and drives whether the affordance renders.
- **Our own route checks too.** Hiding a button is not closing a write; a route handler stays callable
  whether or not anything renders it.

Note the two vocabularies stay separate: this gate is the **org** role (`Owner|Admin|Member`), not the
unit-app role (`Manager|Staff`). A brand `Manager` cannot edit structure.

### 7.6 What the exception costs, stated plainly

> **Amended 2026-08-18 by `D1-b`.** The costs below are the write-through's own. `D1-b` adds one that
> only exists because both decisions are in force: the queue is no longer merely a retry buffer, it is
> the **promotion path for locally created brands**. A queue that nobody drains therefore leaves a
> growing set of brands that exist in BrandFactory and nowhere else, each invisible to every sibling
> app, with nothing failing. The unlinked count in the Admin view is what turns that from silent into
> visible, and it is not optional under `D1-b`.

- **Rule 3 is violated for two aggregates** — `unit` and `unit_relation` (plus `unit_app_access` as
  part of a create). The other five stay closed, and the six `410` App API routes are never called.
  The acceptance checklist's detector (D) will hit by design; phase 10 records it as an accepted
  exception with this scope named, rather than reporting a clean sweep.
- **The blast radius is other apps.** These units are a shared directory. `passport.unit.name` is the
  **legal** name, used by sibling Mission Systems apps including for statutory output. A rename here
  changes what they print. The confirm dialog says so in those words.
- **App-native Admins cannot use it**, per §7.1. That is a permanent split in what two Admins can do,
  decided by how they signed in.
- **A Passport outage makes structure read-only**, and the queue is what stops that losing work.

## 8. Open decisions

**Status, 2026-08-18.** `D1` is **decided: `D1-b`** — the ruling and its full design are below, and
they rewrite phase 8. `D4` is **decided: `D4-b`**, reversing this document's original recommendation
after the trade was checked rather than assumed. `D2` and `D3` still want a ruling; `D3` is left as
chosen unless you say otherwise.

### D1 — DECIDED: `D1-b`, keep both behind a `structure` port (2026-08-18)

**The tension was real and is not resolvable by cleverness.** BrandFactory is MIT-licensed, ships a
`docker compose` Postgres, and defaults to `AUTH_PROVIDER=local`. Rule 7 says a conforming consumer
holds **no** org or brand table of its own. Retiring `workspaces` and `brands` leaves a self-hoster
with no org model and no way to create one.

Three ways out were offered. **`D1-b` was chosen, on a requirement neither of the others meets.**

#### The requirement that decided it

> During a Passport outage, a person must be able to create a brand **and then work inside it**.

That is stronger than "the create must not be lost". Phase 9's queue already satisfies the weaker
form: a failed create is held and replayed when Passport returns, with no local row, no second
identity and nothing orphaned. What the queue cannot give is **use of the brand during the outage**,
because until Passport assigns an id there is nothing to reference.

Working inside a brand during the outage therefore requires a local row. A local row is the shadow.
So the requirement selects `D1-b` directly, and `D1-a` was declined on that ground rather than on
architecture.

#### What this costs, stated before the design

**BrandFactory knowingly violates rule 7 while Passport is on.** That is the price and nothing below
mitigates it away. It is recorded here, asserted by the conformance test as the *intended* state, and
the reason is availability of authoring — not convenience.

Two further costs are structural and survive every mitigation:

1. **Two structure models to maintain.** Every structure read passes through a resolver that answers
   for a linked row and for an unlinked one. That resolver is the thing that rots if nobody watches
   it.
2. **An unlinked row has no Passport-derived access rule**, so it needs a local one. That is a second
   authorization path beside Passport's, and it is the part of this decision to review hardest.

#### The design — app-owned keys, so nothing is ever re-keyed

The obvious form of `D1-b` adopts Passport's UUID as the local primary key, and that is the form which
makes this expensive: a locally created brand has no Passport id yet, so every row written against it
must be re-keyed when the sync lands — and a brand whose push loses a race leaves dependent data
pointing nowhere.

**Do not do that.** BrandFactory mints its own UUID and hands it to Passport as `external_ref`.

| Table | Primary key | Owner |
| --- | --- | --- |
| `passport.unit`, `passport.organization`, … | Passport's UUID, **verbatim** | Passport. Read-only. Unchanged by this decision. |
| `brands` | BrandFactory's own UUID, **stable for its whole life** | the app, plus `passport_unit_id uuid null unique` |
| `workspaces` | BrandFactory's own UUID | the app, plus `passport_organization_id uuid null` |

Four consequences, and they are why the extra column is worth it:

- **Nothing is ever re-keyed.** Local foreign keys point at `brands.id`, which never changes. The link
  column fills in when the event arrives.
- **Nothing is ever orphaned.** A brand that loses a naming race still becomes its own unit. Two
  people creating the same brand during an outage yields two units — a data-quality problem a human
  resolves in the console, not a dangling reference.
- **`external_ref` becomes a real conflict key.** It is stable per brand rather than minted per push,
  so a replayed create is idempotent and a duplicate push answers `409` instead of quietly making a
  second unit.
- **Rule 5 still holds where it matters.** The projection stores Passport's UUIDs verbatim. The local
  key is a separate app-owned identifier, not a re-keying of a Passport one.

#### The name question, which is NOT drift

The instinct is to fear two names for one brand. That fear is misplaced here, because the two names
**mean different things** — a distinction §5 and the original phase 8 already recorded:

| Field | Meaning | Owner |
| --- | --- | --- |
| `passport.unit.name` | the **legal** name — `Casa Vostra Pte. Ltd.` | Passport. A directory shared with sibling apps, used for statutory output. |
| `brands.name` | the **display label** — `Casa Vostra` | the app. What staff read in every picker, header, report and prompt. |

They are **allowed to differ, permanently**, because one is a legal identity and the other is a label.
That is rule 7's carve-out used exactly as intended, and it is what the original phase 8 called
`short_name`.

So the two rename actions are distinct and neither is ambiguous:

- Renaming **in BrandFactory** changes the display label. Local, immediate, and works during an outage.
- Renaming the **legal name** is a phase 9 write-through to Passport, for org Admins on a hosted-login
  session only.

**The residual risk is real, but it is now visible rather than silent.** Somebody renames the unit in
Passport and BrandFactory keeps showing the old label — correct by design, and certain to be reported
as a bug. That is precisely what phase 9e's drift view lists: units whose Passport name differs from
the app's label. **The link column is what makes 9e buildable at all**; it had no data source before
this decision.

#### The access rule for an unlinked row

This is the weakest part of `D1-b`, so it is stated plainly rather than buried.

After phase 8 rewires `authz.ts`, a **linked** brand resolves through the projection:
`rolesAtUnits(…)[unitId]`, with the org ladder above it. An **unlinked** brand has no unit, so the
derivation has nothing to answer with.

| Row | Visible to |
| --- | --- |
| linked brand | whoever the Passport derivation says — unchanged, and the only rule once the link lands |
| **unlinked** brand | any **active member of the workspace's organisation** who has BrandFactory access at that org |
| **unlinked** workspace | its creator only, until it links |

**The middle row is a knowing widening** and must be labelled as one: during the unlinked window a
brand is visible org-wide rather than to the people holding a role at it. Three things bound it:

- the window is short — the queue links the row as soon as Passport answers;
- the count of unlinked rows is **shown**, in the same Admin view as the failed-write queue, so an
  outage that never resolves is visible rather than assumed;
- an unlinked row confers no structure-write capability, because phase 9's client already refuses any
  token that is not Passport-issued.

An unlinked **workspace** is narrower on purpose. Creating a whole organisation during an outage is
rare, and there is no org to scope membership against — so the alternative would be "every
authenticated user", which is the interim model this work exists to remove.

#### The link step, and its own failure mode

When Passport returns, the queue replays the create with `external_ref = brands.id`, Passport answers
`201`, and `unit.upserted` arrives. The receiver then sets `brands.passport_unit_id` where
`external_ref` matches an unlinked local id.

**That linking write is a new failure mode.** A unit whose event carries a mismatched or absent
`external_ref` never links, leaving a local brand *and* an unlinked unit — two records for one brand,
with no error anywhere. Two things catch it: the unlinked count above, and a reconciliation pass that
reports units carrying a `brandfactory:` ref with no local match.

Note that this write targets `brands`, which is app-owned. It does not put a second writer on the
projection, so the read-only enforcement is untouched.

#### What `D1-b` does NOT license

The shadow is bounded to what the requirement needs. Membership is **not** included, and the reason is
categorical rather than a matter of degree:

**A unit is a name and an address. A membership is a key.**

If a consumer may write its own membership rows, then BrandFactory can grant itself access to an
organisation. Two consequences follow: compromising any one consumer becomes a way to grant access
inside it, and an org admin reading the Passport console sees a roster that does not match who can
actually get in, with nothing to reveal the difference.

So `passport.membership`, `passport.entitlement`, `passport.unit_app_access`,
`passport.unit_app_membership` and `passport.identity_link` stay read-only and sync-written, with **no
local mirror and no local grant table**. The consequence is accepted: **a person who is not yet in
Passport cannot be granted access during an outage.** They can authenticate — the app-native door is
untouched — and they will see nothing until their membership arrives by sync.

### D2 — the local `users` table narrows; it does not disappear

The mapping you chose reads `users (local) → passport.membership`. That is right for the **roster and
the roles** — the people list, the display name on a message, who holds what at which unit, all come
from the projection after this work. It cannot be right for the **table**, for two reasons:

1. **The `app-native` branch has no `platform_user_id`.** A non-member who signs in with a password
   is not in Passport at all. Rule 7's carve-out covers exactly this: a local auth identity is a
   concept Passport has no notion of.
2. **Three tables foreign-key to `users.id`** — `workspaces.owner_user_id` (which goes with
   workspaces), `agent_messages.user_id` and `canvas_events.user_id`. The last two are provenance on
   historical rows. Re-pointing them at `platform_user_id` would leave every app-native author
   unrepresentable.

So `users` survives, **narrowed to an auth identity**: `id`, the verified `email` (the join key to
`passport.membership`), and `display_name` for people who have no membership to read one from.
`launchpad`, the reference TS consumer, keeps its `users` table for the same reason.

**Confirm this**, because it is a deliberate deviation from the option you picked, and the reason it
is a deviation is worth seeing rather than discovering in the diff.

### D3 — all three levels, or role inheritance? (you cannot have both)

Per §4 this is an either/or enforced by Passport, not a tuning knob. `role_cascade` is legal **only**
on `{entity, outlet}` or `{brand, outlet}`; on any other shape the console answers `422`.

| Shape | Roles may sit at | A role at the parent reaches its outlets |
| --- | --- | --- |
| `["entity","brand","outlet"]` *(your choice)* | all three | **no** — every unit needs its own role row, or the ladder |
| `["brand","outlet"]` + cascade | brands and outlets | **yes**, down `belongs_to_brand` |
| `["entity","outlet"]` + cascade | entities and outlets | **yes**, down `operated_by_entity` |
| `["brand","outlet"]` no cascade | brands and outlets | no — legal, and newly expressible |

Left as chosen unless you say otherwise. Either way the code is the same: phase 4 passes all three
arguments and phase 4's tests pin **both** behaviours, so a later narrowing in the console is a
restart and not a rewrite.

### D4 — DECIDED: `D4-b`, one role plus a guard test (reversed 2026-08-17)

> **This section's original recommendation was `D4-a`, and it was wrong.** The reversal is recorded
> here rather than edited away, because the reasoning is the useful part.
>
> `D4-a` proposed a second database role and a `PASSPORT_SYNC_DATABASE_URL`. Challenged in review, the
> assumption behind it was checked: BrandFactory's browser client uses four `auth.*` methods and never
> touches a table, so there is no second population whose privileges a REVOKE would protect against.
> The app is the only database client. A second role would therefore add a provisioning step per
> environment and a new way for a deployment to half-configure itself, in exchange for guarding a
> boundary that has nobody on the other side of it.
>
> **`D4-b` shipped**: one role, plus `packages/db/src/passport-write-guard.test.ts`, which sweeps for
> any projection write outside the sync path. It is **weaker, and honestly so** — a guard test catches
> a reintroduction in CI; it does not stop a hand-written query at runtime. The trade is recorded at
> the code as well as here.

The original analysis follows.

The skill requires the replica to be read-only **by enforcement, not by etiquette**: one
`REVOKE INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA passport FROM <app_role>` makes "app code never
writes the replica" a database guarantee, where a naming convention relies on everyone remembering.

**BrandFactory has one database role.** It connects through a single `DATABASE_URL` as the owner and
enforces authorization in application code — no RLS, no `authenticated` role, no PostgREST client. So
a blanket REVOKE would revoke the receiver along with everything else. Both reference consumers in the
skill are on a direct connection with a separate client role; we have neither.

| | Approach | Cost |
| --- | --- | --- |
| **D4-a** *(recommended)* | **Two roles, two connection strings.** `DATABASE_URL` keeps the REVOKE and serves every request; a new `PASSPORT_SYNC_DATABASE_URL` belongs to a writer role used by the receiver and the reconciler alone. Genuine enforcement. | One role to provision per environment. A deployment that sets only `DATABASE_URL` gets a receiver that refuses to start — which is the correct failure, not a regression. |
| **D4-b** | **One role, plus a guard test** that fails when any module outside `server/src/passport/{handlers,reconcile}.ts` writes `passport.*`. | Convention with a control on it, rather than enforcement. Weaker, and honest about being weaker. A guard test catches a reintroduction in CI; it does not stop a hand-written query at runtime. |

Note that BrandFactory dodges two related traps either way, and for the same reason: with no RLS there
is no `security_invoker` view hazard and no policy to re-scope for the app-native population. Those
are Supabase/PostgREST failure modes, and this repo reaches Postgres directly.

## 9. What does not change

- **The aggregate chain.** `requireProjectAccess → requireBrandAccess → requireWorkspaceAccess`
  keeps its shape. Only the innermost comparison changes, from `ownerUserId` to a unit-scoped role.
  One edit, in the one place the app gates access — which is what that file was built for.
- **`createApp(deps)`.** Passport enters as dependencies like everything else. No vendor is named in
  domain code.
- **The shared `AppType`.** New routers are chained `.route()` calls, so the web client keeps its one
  type and `pnpm typecheck` keeps finding contract drift.
- **Every brand-scoped feature** — guidelines, assets, research, the social calendar, the canvas, the
  agent. They key on a brand id, and a brand id becomes a Passport unit UUID. The re-key is
  mechanical.
- **`packages/web-next`.** No Passport work lands there this run. It has no auth, no backend wiring
  and no `.env`; a login built there would reach nobody. It inherits the login when its screens move.

## 10. The silent-failure inventory

Almost nothing in this integration raises. These are the ways it fails while looking healthy, each
with the control that catches it. They are the acceptance criteria for phase 8.

| Failure | Why it is silent | Control |
| --- | --- | --- |
| A misnamed handler | `applyEvent` resolves by property lookup and **skips** an absent one — that tolerance is what makes unknown event types forward-compatible, so a typo is indistinguishable from an intentional no-op. Drops every event of that type. | A test pinning all 17 names against `DISPATCH` |
| A delegating handler called detached | `applyEvent` calls `handlers[method](payload)`, so `this` is `undefined` inside. Five of the seventeen delegate. Invisible to `tsc`; a test asserting the methods exist passes. | Bind every method in the constructor, reflectively |
| `>` instead of `>=` in the version guard | An equal-version replay is dropped. Passport retries on any non-2xx, so replays are normal traffic. | Replay test: apply twice, assert no change |
| `membership.removed` treated as a delete | Loses the tombstone; nightly reconciliation then resurrects the membership from the snapshot, and a revoked user silently regains access. | Test the row survives with `status='removed'` |
| Entitlement revocation filtered out | It arrives as `entitlement.upserted` with `status != 'active'`. There is no remove event. It is the org-level kill switch. | Test that a non-active entitlement denies an Owner |
| `orgRole` omitted | Every org `Owner` and `Admin` is silently denied — they hold `Manager` everywhere by the ladder with no role row at all. | Ladder test: Owner, zero role rows, expect `Manager` at every unit carrying the app |
| A suspended membership read as active | Suspension deliberately does not cascade to role rows, so the rows stay `active`. Without the full gate the person keeps working. | Test `status='suspended'` ⇒ `{}` |
| `orgId` omitted | An Owner of org A becomes a Manager at every unit of org B. | Cross-org denial test |
| Placement read from the deprecated singular `unit_scope` | It is `null` for exactly BrandFactory's shape, so the reader falls back to `["brand"]` and narrows itself to brands. A silent under-permission. | The registry reader reads `unit_scopes` + `role_cascade` and ignores the singular field, with the reason at the code |
| The cascade inferred from the shape | Two levels no longer implies inheritance. `{brand, outlet}` with the flag off is legal, so inferring it over-permits. | Read the flag; phase 4 pins both behaviours |
| A created unit with no `unit_app_access` row | The brand exists in Passport and confers access to **nobody**, Owners included. The Admin reads it as a broken create. | The create is two calls; the second failing is surfaced, and the queue holds it for retry |
| The write-through applying its own result to the projection | It would fight the version guard and put a second writer on a read-only replica. The row would then disagree with the event that follows. | Passport's response updates client state only; the event is the sole writer |
| An app-native token forwarded to Passport | Passport answers `401`, but the real error is sending BrandFactory's own issuer's token outward at all. | The request context carries which issuer signed the token; the write-through refuses without a Passport-issued one |
| A relation "already exists" that points elsewhere | Relations are unique per `(from_unit, relation)`, so a wrong parent is indistinguishable from a correct one unless the target is compared. | Compare the target, surface the conflict, never auto-fix |
| `sync_url` on the wrong host | Passport delivers, nothing receives, the projection stays empty, nothing errors. | Verify against `GET /api/v1/apps`; the receiver logs every delivery |
| No `unit_app_access` row | A unit carrying no row confers access to **nobody**, not even an Owner. Creating a brand does not switch the app on at it. | The operator gate before phase 8, and its gate query |
| Reconciliation written but never scheduled | The function passes its own unit test, so the suite is green and the write-up says "built" while nothing runs it. | Three parts — function, endpoint, registered schedule — and the endpoint is `curl`ed, not read |
| A pruning reconciler | A snapshot's `identity_links` are a per-org **subset** and never authoritative. Pruning deletes every locally-written link on the first nightly run and the app denies everyone the next morning. | Upsert-only, asserted |
| `identity_link.platform_user_id` from `claims.sub` | A Supabase auth-user id from a different UUID space, confirmed not to coincide. The row looks linked and resolves to nobody, forever. | Resolve from `passport.membership` by verified email; assert against real data after a real login |
| A bare `signOut()` | Revokes the refresh token project-wide. The access JWT outlives it, so other apps keep working and then log everyone out up to a token lifetime later. Nobody connects the two. | `scope: 'local'`, plus a **source-sweep test** that fails on any call site omitting a scope |
| A shadow table kept "alongside" | Nothing raises on the day you do it. The two copies simply diverge, and you find out from a user who can still see a brand they were removed from. | Detector §0b in CI |
| A compatibility view without `security_invoker = true` | The view runs as its owner and bypasses RLS on the projection. Every org's structure, readable by anyone. No test fails. | Read the view as two orgs' users |
| A view replacing a table breaks embeds | Dropping the table drops its foreign keys. Plain selects survive; anything resolving joins *through constraints* blanks the whole page. | grep for embeds, not a test run |

## 11. Configuration

Every variable, both halves. The sync half alone gives a projection nobody can reach; the login half
alone gives a login that derives no access.

| Variable | Set it? | Needed by | If wrong |
| --- | --- | --- | --- |
| `PASSPORT_API_URL` | **yes** | phases 4, 5, 6 | The back-channel host. `.replace(/\/+$/,'')` where it is read — a trailing slash yields `//api/v1/...` and Passport answers a flat `404`. |
| `PASSPORT_API_KEY` | **yes** | phases 4, 5, 6 | `X-API-Key`, and the OAuth client-secret on the code exchange. Unset in the deployed env: the webhook still delivers so the projection looks alive, but nobody is ever identity-linked. Symptom: *N memberships, ~0 identity links.* |
| `PASSPORT_WEBHOOK_SECRET` | **yes** | phase 3 | HMAC verification. Unset ⇒ the receiver refuses (`503`), never accepts. |
| `PASSPORT_WEBHOOK_SECRET_PREV` | only while rotating | phase 3 | Omit and a rotation is a hard cutover. |
| `PASSPORT_APP_ID` | **yes** | phases 4, 6 | This app's `app.id` = its OAuth `client_id`. |
| `PASSPORT_RECONCILE_SECRET` | **yes** | phase 5 | Guards the reconcile trigger. Unset ⇒ refuse, never run unauthenticated. |
| `PASSPORT_SUPABASE_URL` | **yes** | phase 6 | Passport's Supabase project — the issuer we verify Passport-issued tokens against. Also the *real* SSO gate: empty ⇒ SSO inactive whatever the flag says. Wrong project ⇒ sessions appear to expire immediately. |
| `PASSPORT_DASHBOARD_URL` | **yes** | phase 6 | The **browser** redirect target (`/authorize`). A **different host** from `PASSPORT_API_URL`. Confusing the two is the classic model-3 failure. |
| `PASSPORT_SSO_CALLBACK_URL` | **yes** | phase 6 | Must equal Passport's per-app allow-list entry **byte for byte**. A trailing slash or case difference is a different URI and a flat `403`. |
| `PASSPORT_SSO_ENABLED` | **leave unset** (defaults on) | phase 6 | A break-glass switch, not a rollout toggle. Gated on `ENABLED && PASSPORT_SUPABASE_URL`, so an env that simply lacks the URL stays app-native with no flag to remember. |
| `VITE_PASSPORT_SUPABASE_URL` + `..._ANON_KEY` | **yes** (web) | phase 6 | The client that redeems **refreshes** against Passport's project. Anon key, never service-role. Missing ⇒ every hosted-login user is silently logged out at token expiry. |
| ~~`PASSPORT_ORG_ID`~~ | **never** | — | Rule 9. A default-org *hint* is fine; it must never reach a query or an authz check. |
| ~~`PASSPORT_UNIT_SCOPE`~~ | **never** | — | Placement is read from the registry at startup. Setting this short-circuits that read, and it cannot even express BrandFactory's shape — it is the singular vocabulary, which has no value for all three types. The wrong placement dangles every `unit_app_access` row and denies every user with no error. |

`.env.example` has a drift guard (`packages/server/src/env.example.test.ts`), so every one of these
lands in both files in the same commit or the build fails. That guard is doing real work here.

## 12. Still needed from the operator

Nothing before phase 1. These block the phases named.

| Needed | Blocks | Note |
| --- | --- | --- |
| `PASSPORT_API_URL`, `PASSPORT_APP_ID`, `PASSPORT_API_KEY` | the registry read; phases 4, 5, 6 | Confirms `unit_scopes` and `role_cascade` from the source rather than from §4's assumption |
| `PASSPORT_WEBHOOK_SECRET` | live deliveries (phase 2 ships and tests without it) | |
| `sync_url` registered at the **backend** host | live deliveries | `https://<api-host>/webhooks/passport/sync`. On the frontend host it is a silent dead end. |
| The callback registered on Passport's **per-app** allow-list (Apps → the app → *Sign-in callbacks*) | phase 6 | **Not** the Supabase project-level Redirect-URL list. Registering only that one is the classic "everything is configured and the callback still 403s" morning. |
| `PASSPORT_SUPABASE_URL` + anon key | phase 6 | |
| Structure imported, entitlement granted, app switched on at each unit | the operator gate | Prefer running the import **from the Passport side** — the Admin API is super-admin gated, and a consumer-side importer means a super-admin credential in BrandFactory's environment. |
| Every user invited as an org member and placed at their units | **phase 8** | The lockout gate in §6.3. No amount of application work unblocks this. |
| Whoever should manage structure inside BrandFactory holds the org role `Owner` or `Admin` in Passport | **phase 9** | Passport enforces this itself. A `Member`, and a brand `Manager` who is not an org Admin, are refused — so the people who need the write-through must be named as org Admins, deliberately. |
| Those same people sign in through **hosted login**, not the app-native branch | **phase 9** | The write-through forwards the person's own Passport token, and an app-native session has none. Nothing new to configure; it follows from `PASSPORT_SUPABASE_URL` being set. |

Phase 9 needs **no new configuration** — it reuses `PASSPORT_API_URL` and the acting person's token,
and it deliberately holds no credential of its own.
