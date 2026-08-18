# Passport sync consumer, phase 8 — the `structure` port and the link

**Status:** complete for everything the operator gate permits. **The authorization rewiring is
written and tested but deliberately not armed** — §6 says why. 2026-08-18, on
`feat/passport-sync` at **1.42.0**.

Executes phase 8 of
[`docs/executing/passport-sync-consumer-plan.md`](../executing/passport-sync-consumer-plan.md)
as rewritten by decision **`D1-b`** (proposal §8).

**Migration 0016** — two nullable link columns. **2402 tests** (+70 across four commits).

This phase was originally "retire the shadows". `D1-b` decided otherwise, on a requirement the
retirement cannot meet: during a Passport outage a person must be able to create a brand **and
work inside it**. So `workspaces` and `brands` stay, each gaining a link, and nothing is
re-keyed or dropped — which removed the single largest risk the plan carried.

---

## 1. The link, and why nothing needed re-keying

`workspaces.passport_organization_id` and `brands.passport_unit_id`, both nullable.

**`NULL` is a first-class state**, not a defect: "Passport does not know this yet". A
`NOT NULL` column would make the outage path impossible, which is the whole point of `D1-b`.

The expensive form of `D1-b` adopts Passport's UUID as the local primary key, and then every
row written against a locally created brand must be re-keyed when the sync lands. **We do not
do that.** BrandFactory keeps its own key and hands it to Passport as `external_ref`. Four
consequences:

- nothing is ever re-keyed — local foreign keys point at `brands.id`, which never changes;
- nothing is ever orphaned — a brand that loses a naming race still becomes its own unit;
- `external_ref` is a real conflict key, stable per brand, so a replayed create answers `409`
  rather than quietly making a second unit;
- the projection still stores Passport's UUIDs verbatim, so rule 5 holds where it matters.

Two constraints are load-bearing and easy to drop:

- **`unique` on `brands.passport_unit_id`.** Without it, two local brands claiming one unit is
  a silent duplicate rather than an error.
- **No cross-schema foreign key.** The projection carries no constraints by design, and an FK
  would refuse a legitimate sync delete.

## 2. One LEFT JOIN, and a sweep to keep it the only one

`packages/db/src/queries/structure.ts` owns the join, and it is a **LEFT** join. This is the
most likely bug in the phase: an inner join compiles, typechecks, passes every test written
against seeded linked data, and **silently drops every locally created brand**. The list
renders an empty page while the brand exists, works, and is visible on the next screen over.
There is no error, and the natural diagnosis — "the brand wasn't saved" — is false.

`structure-read-guard.test.ts` sweeps for anyone naming `passportUnit` outside the projection
and the one module that owns the join. Proven by adding an import to `routes/brands.ts`.

`structure.ts` holds three resolution rules, and each has a one-line "tidy-up" that breaks it
silently:

| Rule | The tidy-up that breaks it |
| --- | --- |
| `displayName` always from `brands.name` | `row.legalName` — every picker switches to "Pte. Ltd." names the day a brand links |
| a null `legalName` stays null | `legalName ?? displayName` — prints a nickname into a statutory field |
| `status` read through the link only | a local `status` column, to grey out archived brands |

## 3. The receiver closes the round trip

`onUnitUpserted` links a waiting local brand when its unit arrives. **This is the only moment
the two records can be joined** — Passport has no idea it created a unit for an existing
brand, and the only thing carrying that knowledge is `external_ref`.

Three details:

- **It runs after the projection write**, because the link joins to `passport.unit`. Pinned by
  a test, proven by reversing the order.
- **It writes `brands`, not `passport.*`**, so the projection keeps exactly one writer.
- **It is the one place in the receiver that swallows an error.** Everywhere else an error must
  propagate so Passport redelivers; here the projection has already committed, so redelivering
  would retry a correctly stored unit. Recovery is the next delivery, or reconciliation's
  unmatched report.

## 4. Promotion — the Admin half of the split create

`D1-b` splits the create in two, and the halves cannot share a gate:

| Path | Gate | Result |
| --- | --- | --- |
| Passport reachable | org `Owner`/`Admin`, hosted-login session | a real unit |
| Passport unreachable | whoever may create a brand here | a **local** brand |

The local half cannot be Admin-only, because its purpose is to work when hosted login does
not. **So a non-Admin can create a brand, and only an Admin can promote it.** That asymmetry is
the security property: a non-Admin create reaching Passport unattended would let a consumer app
add units to an organisation's structure with no org Admin involved, and every sibling app in
the suite would then read them.

Promotion is idempotent for an already-linked brand, 404s across organisations, queues an
outage while leaving the brand usable, and reports a half-promotion rather than hiding it — a
unit with no `unit_app_access` row is visible to **nobody**, which is worse than staying
unlinked, because the local access rule stops applying the moment the link lands.

### One thing I did not guess

Whether `UnitCreate` accepts `external_ref`. The SDK has **no unit write routes at all**, so it
could not answer. The migration reference did: *"Set `external_ref` on the units you create in
Passport to a synthetic, deterministic key"*, in the form `<app>:<legacy pk>`.

That corrected work from the previous commit, where a test asserted the client "never sends
`description` or `external_ref` on any body". Right for update, **wrong for create** — and the
create case is the entire link mechanism. The assertions are now split by verb, and the retry
path needed the matching fix: a queued promotion carries `externalRef`, and the wire schema is
`.strict()` precisely so a client cannot choose one, so the replay splits it off before
parsing. Left alone, every promoted retry would have failed to parse, presenting as "the retry
button does nothing".

## 5. The frontend: a state, not an error

An unlinked brand must not look identical to a linked one. Two things are true of it that are
true of nothing else in the app: no sibling Mission Systems app can see it, and until it is
promoted it is visible org-wide rather than to role-holders. Neither is discoverable anywhere
else in the UI.

So `LocalOnlyBadge` in the switcher and the workspace grid, and `LocalOnlyDot` on the rail's
36px tiles, which have nowhere to put a word.

**The gate is the whole design, and it took two attempts.** Today — and on every self-hosted
install — *no brand is linked to anything*. A badge that rendered unconditionally would appear
on every brand in the app, for ever, saying nothing. A label that is always on is not a label;
it is furniture, and by the time one brand genuinely is local-only nobody sees the badge.

So the signal appears only when the **workspace** is a Passport organisation.

The first implementation put that query inside the badge, and it was wrong: it gave every
component that merely *shows a brand* a hidden data dependency. `BrandCard`'s tests suddenly
needed a `QueryClient` for a component that makes no request, and five more suites needed a new
mock. The second is a shell-level context read once in the root layout — **zero test churn, and
the full web suite passed unchanged**. It defaults to silent, which is the safe direction: a
missing badge is far milder than a badge on forty brands.

`LocalOnlyDot` also owns the tile's accessible name, deliberately: a reader taking "Casa
Vostra" from one element and "local only" from a sibling has no reliable ordering, and in a
rail of forty tiles the suffix could attach to the wrong brand.

**The linter caught a real bug here.** `!linked && usePassportLinkage()` short-circuits, which
makes the hook conditional and changes hook order the moment a brand links.

## 6. What is NOT armed, and why that is correct

**`authz.ts` still runs the interim shared-access model.** The rules that replace it are
complete, in `structure-access.ts`, with 19 tests.

Arming them now is not a behaviour change — **it is a lockout of everyone**. The operator gate
is `unit_app_membership > 0` and `unmatched = 0`; until an organisation, an entitlement and the
memberships exist in Passport, every derivation returns an empty map and every rule denies.
`D1-b` does not soften that: with an empty projection every local row is unlinked, and the
unlinked rules still require an active org membership, of which there are none.

Building it now and arming it later makes the risky edit one line, reviewable on its own.

Two over-permissions were avoidable only by reading `access.ts` rather than assuming:

- **The org ladder is already inside `rolesAtUnits`.** So a linked brand is one map lookup.
  Adding `|| orgRole === 'Owner'` beside it looks defensive and grants an Owner a unit carrying
  no `unit_app_access` row — which Passport's own rule says confers access to nobody.
- **The unlinked rule tests `entitled`, not `hasAccess`.** `hasAccess` also requires a unit
  carrying this app, which an unlinked brand by definition lacks — so it would deny every
  member of an organisation whose brands are all still waiting, the exact post-outage state.

`PassportAccess` gained `entitled` for the second, read off the same value the SDK is given so
the two cannot disagree.

## 7. Conformance — the violation is recorded, not hidden

The §0b detector asserted "exactly the two shadow tables **phase 8 retires**". Under `D1-b`
phase 8 does not retire them, so the comment now says they are kept **knowingly**, and the set
stays at exactly two. A third shadow still fails, and membership, entitlement, unit-app-access,
unit-app-membership and identity-link may never join it.

Deleting the detector because the rule no longer holds outright is how a bounded, decided
violation becomes an unbounded, undecided one.

The phase-10 completion doc predicted the expectation would shrink to zero. It carries a dated
amendment rather than a rewrite.

## 8. The gate

```
pnpm typecheck                    all 11 packages           pass
pnpm lint                         eslint, whole repo        pass
pnpm format:check                 prettier                  pass
pnpm test                         2402 passed | 92 skipped
pnpm -F @brandfactory/web build   tsc + vite                pass
```

**Migration 0016 was generated but not applied to a live database here**, for the same reason
as 0015: `.env` names a port that refuses connections, and the compose Postgres rejects the
compose credentials. CI applies migrations against its own sidecar. 0016 is two `ADD COLUMN`s,
an index and a unique constraint, with no constraint touching existing data.

## 9. Still open

| Item | Blocked by |
| --- | --- |
| Arming `authz.ts` (the last line of 8d) | **the operator gate** — an org, an entitlement and the memberships in Passport |
| The promote **affordance** in the UI | it needs an eligibility signal the server does not expose, and it can succeed for nobody until hosted login is configured. Building UI for a path that cannot fire would be speculative. |
| `WorkspaceSwitcher` as an org switcher; the rail filtered by role | consequences of arming 8d. Until then the lists come from the local tables and already show everything. |
| Phase 9e/9f — the drift view and the confirmation dialogs | now **unblocked** by the link column, which is their data source |
| The magic-link bypass | unchanged from 1.40.0 |
