# Passport sync consumer, phase 10 — conformance, CI, and why there is no `renovate.json`

**Status:** complete for what is buildable; the rest is blocked and named. 2026-08-17,
against `main` at **1.38.0**.

Executes phase 10 of
[`docs/executing/passport-sync-consumer-plan.md`](../executing/passport-sync-consumer-plan.md).

**No migration.** Three things landed: the conformance detectors as a test, a CI
credential gate for a problem the earlier phases created, and a drift check that stands
in for Renovate. Plus the acceptance-checklist accounting below, which is **partial on
purpose** — several items cannot be true until phase 8 and one entitlement exist, and
recording them as passing would be the exact self-deception this integration is full of
warnings about.

---

## 1. CI was going to fail, and phase 6A caused it

`@missiongroupsystems/passport-client` is a git dependency on the **private**
`missiongroupsystems/passport` repository. `actions/checkout`'s token is scoped to *this*
repo, so `pnpm install --frozen-lockfile` cannot fetch it.

Verified rather than assumed: an unauthenticated `GET /repos/missiongroupsystems/passport`
answers **404**, which is how GitHub reports a private repo to a caller who cannot see it
— and an unauthenticated `git ls-remote` blocks waiting for credentials.

So **every CI run on this branch would have failed at install**, with a git
authentication error naming neither the repository nor the missing secret.

CI now fails *first*, with a sentence naming `PASSPORT_REPO_TOKEN` and where to put it.
Three details are deliberate:

- **The check is a shell condition, not a step-level `if:`.** The `secrets` context is
  not documented as available in `if`, and an `if` that silently evaluates to false would
  skip the guard and hand back the confusing error it exists to replace.
- **The token reaches git through the environment, never the command line.**
  Interpolating a secret into `run` puts it in a script that `set -x` or a git error can
  echo.
- **`url.…insteadOf` rather than editing the specifier**, so the pin stays a plain URL in
  `package.json` and no credential is ever committed.

**This still needs an operator action.** CI is red until the secret exists — which is the
correct state for an unconfigured gate, not a defect.

## 2. There is no `renovate.json`, and adding one would be theatre

The plan called for `renovate.json` extending
`local>missiongroupsystems/passport//renovate/passport-consumer`. **That preset cannot
track this dependency**, on three independent counts, each checked:

1. Its custom manager matches `fileMatch: ["(^|/)pyproject\\.toml$"]`. BrandFactory has
   no `pyproject.toml`.
2. It resolves `passport-client-v*` **git tags** with `datasource: github-tags`. The
   newest such tag is **`passport-client-v1.1.0`** — which predates `roles_at_units`
   (SDK 2.0.0) and `unit_scopes` / `role_cascade` (2.2.0). Pinning a tag would pin an SDK
   whose access helper this app cannot call.
3. At that tag, `packages/passport-client/` contains **only `python`**. The TypeScript SDK
   did not exist, and its 3.0.0 has never been tagged at all.

A Renovate config that silently matches nothing is worse than none: it looks like the
dependency is being watched. So instead there is
`scripts/check-passport-sdk-pin.mjs`, which watches the thing that actually moves — the
SDK's **source** at the commit we pinned — by comparing `pinned...main` and reporting
whether any changed file is under `packages/passport-client/typescript`.

- **It warns; it never fails.** An upstream commit we have not adopted is not a defect in
  the pull request being tested, and failing on it would block unrelated work until
  somebody bumps the pin. The warning is a GitHub Actions annotation, so it lands on the
  PR rather than in a log nobody opens.
- **It exits 0 for "cannot tell" too** — no token, no network, an API hiccup. A version
  check that fails the build when it cannot reach the internet is a check that gets
  deleted.
- **Switch to Renovate the day the TypeScript package gets its own tags.** Then the pin
  becomes a tag, the preset's `fileMatch` needs widening to `package.json`, and this
  script can go. That condition is written in its header.

Verified: both skip paths exit 0 with a legible message, and the pin extraction returns
exactly the SHA in `package.json` without capturing the `&path:` fragment. **The warning
path itself is unverified**, because it needs a token this environment does not have.

## 3. The detectors are now a test

`packages/server/src/passport/conformance.test.ts`. Every rule it checks **passes
silently when violated** — nothing errors, no request fails, the app just serves stale or
over-broad answers — so a grep that somebody runs once is not a control. 14 cases:

| Detector | Asserted |
| --- | --- |
| §0 wire contract | no pre-v1 aggregate, header or helper name survives |
| §0b shadows | **exactly** `brands` and `workspaces`, no more |
| §0b vocabulary | no `user_type` / `is_admin` / `isManager` / `_ROLE_MAP` anywhere |
| §0b collapse | `rolesAtUnits` is never reduced to one "effective role" |
| §0c multi-org | no configured organisation reaches a query or a guard |
| §0d writes | none of the closed methods, and no hand-rolled HTTP around their routes |
| §0e sign-out | the phase-1 scope sweep still exists |
| over-closing | `session-exchange`, the registry read, `snapshot()`, token verification and the access helper are all still **present** |

Four things about how it is built:

- **The shadow check asserts an exact set, not emptiness.** `brands` and `workspaces` are
  still here because retiring them is phase 8. So a *third* shadow fails this test, and
  phase 8 removing the two fails it as well — which forces the expectation to shrink
  rather than rot into a permanent exception.

  > **Superseded 2026-08-18 by decision `D1-b`.** Phase 8 no longer retires them. The two
  > tables are kept deliberately, so that a person can create a brand and work inside it
  > while Passport is unreachable — proposal §8 `D1` carries the reasoning and the cost. So
  > the expectation stays at exactly two and the exception *is* permanent, which is the
  > opposite of what this bullet predicted. It is now a **bounded, decided** violation of
  > rule 7 rather than a pending cleanup, and the boundary is what the test pins: a third
  > shadow still fails, and membership, entitlement, unit-app-access, unit-app-membership and
  > identity-link may never join the set. The rest of this document stands as written.
- **One check asserts PRESENCE**, and it is the mirror-image failure. Rule 3 is proven by
  absence, so the instinct while sweeping is to delete everything that talks to Passport
  — and those five are reads and redemptions, not writes. Deleting any of them takes
  login or placement down rather than leaking anything.
- **Comments are stripped, preserving line numbers.** These files document the very
  patterns they may not use: the collapse detector's first run matched a docblock
  explaining why collapsing is wrong. Stripping is what turns a "read the hits" grep into
  an assertion. A mid-line `//` is left alone — it can sit inside a URL string, and
  cutting there could delete real code, which would make the sweep fail *open*.
- **It asserts it swept something.** Every other case is an absence check, so a broken
  directory walk would pass all of them while checking nothing.

## 4. The live tests do run in CI, verified

CI already had a Postgres 16 sidecar and applied migrations, so the projection's live
suites execute there rather than skipping. Confirmed by running the whole suite against a
migrated database exactly as CI does:

```
Test Files  174 passed (174)
     Tests  2282 passed (2282)          ← zero skipped
```

Locally the same command reports **2190 passed | 92 skipped**; the 92 are the live suites.
So the acceptance item "the migration gate is not a no-op" holds: the schema reaches a
real database in CI, and 14 of those live assertions are the projection's.

It also cleared a real risk that had not been checked — `packages/db` runs `singleFork`,
so `passport-writes.live.test.ts` shares a process with the seed tests and deletes rows.
They do not interfere.

## 5. The acceptance checklist, honestly

### Passing

- Receive endpoint: HMAC verified over raw bytes, stale `schema_version` rejected before
  dispatch, 2xx only after commit, `401` on a bad signature, `503` when unconfigured.
- Replay produces no change — the `>=` version guard, proven both as generated SQL and
  as behaviour, and by breaking it.
- `membership.removed` and `unit_app_membership.removed` keep the row as a tombstone.
- Entitlement revocation arrives as an upsert and is never filtered.
- The org-role ladder holds; a suspended member is denied; cross-org denial proven.
- Access derived via the SDK helper with `orgId` **and** `orgRole`, never a hand-rolled
  join; the result is a map and is never collapsed.
- Placement read from the registry, not assumed — and the deprecated singular field
  ignored.
- Reconciliation converges, prunes nothing, and is function **plus** endpoint **plus**
  schedule; verified by triggering the endpoint, with a 404 control.
- `org.resync` applies upsert-only.
- Projection lives in the `passport` schema; no client polling anywhere; the read-through
  allow-list ships **empty**.
- Rule 3 by absence: no closed method, no hand-rolled HTTP around the closed routes, and
  no over-closing.
- The login is the email-first router: two routes and never three, no format validation
  before routing, a length cap, IP **and** email buckets, redirect-not-JSON on every
  `/passport/start` failure, comparable wall time on both branches.
- Sign-out is `local` at every call site, enforced by a source sweep proven by breaking it.

### Blocked, and by what

| Item | Blocked by |
| --- | --- |
| Any end-to-end delivery, and Passport's contract kit | **no entitlement** for an org on Marketing Base. The snapshot is eight empty collections, so nothing is delivered and nothing can be diffed. |
| "Deactivate a member → access revoked" observed end to end | the same, plus phase 8 |
| "Permission checks are unit-scoped" on the request path | **phase 8** — `authz.ts` still runs the interim shared-access model |
| "No shadow table"; "every app-owned table carries `organization_id`" | **phase 8** |
| Identity links exist after a real login | **phase 6B** + the config |
| A Passport outage degrades rather than logging everyone out | **phase 6B** (the refresh path) |
| Sign-out isolation across two apps, proven by forcing a refresh | **phase 6B** + a second consumer |
| RLS on the projection, `security_invoker` views | **not applicable** — no RLS, no PostgREST. Decision `D4-b`, with the trade recorded at the code. |

### Not done, and deliberately

The magic-link bypass (`routes/passport-auth.ts` header): the router is the decision, not
the enforcement, and BrandFactory's magic link goes straight from the browser to GoTrue.
The fix is a server-side proxy that refuses an active member, and it belongs with 6B.

## 6. The gate

```
pnpm typecheck                    all 11 packages    pass
pnpm lint                         eslint, whole repo pass
pnpm format:check                 prettier           pass
pnpm test                         2204 passed | 92 skipped   (2296 with a live DB)
pnpm -F @brandfactory/web build   tsc + vite         pass
```

## 7. Needed from the operator

| Needed | Unblocks |
| --- | --- |
| **`PASSPORT_REPO_TOKEN`** repository secret — a fine-grained PAT with read access to `missiongroupsystems/passport` | **CI at all.** It is red until this exists. |
| An **entitlement** for an org on **Marketing Base** (super admin) | every remaining acceptance item |
| `sync_url` at the backend host | live deliveries |
| `PASSPORT_RECONCILE_SECRET` in the deployed environment | the reconcile trigger |
| Passport's project URL, anon key, dashboard URL, registered per-app callback | phase 6B |
| A `staging` branch, "Allow auto-merge", branch protection | only if the SDK gains tags and this switches to Renovate |
