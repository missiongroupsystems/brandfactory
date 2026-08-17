# Passport sync consumer, phase 1 — the SDK, the configuration, and the sign-out scope

**Status:** complete, 2026-08-17. Written against `main` at **1.31.0**
(1982 passed | 78 skipped before → **1999 passed | 78 skipped** after; +17 tests, the
skips are the live-Postgres suites).

Executes phase 1 of
[`docs/executing/passport-sync-consumer-plan.md`](../executing/passport-sync-consumer-plan.md).
The decision record and the audit are in
[`passport-sync-consumer-proposal.md`](../executing/passport-sync-consumer-proposal.md).

**No migration. Nothing Passport-shaped runs yet, and nothing an existing user can
reach behaves differently** — with one deliberate exception, the sign-out scope in §3.

---

## What landed

| File | Change |
| --- | --- |
| `packages/server/package.json` | `@missiongroupsystems/passport-client` as a git dependency pinned to a commit |
| `pnpm-workspace.yaml` | `onlyBuiltDependencies` for that package — load-bearing, see §1 |
| `packages/server/src/env.ts` | 10 `PASSPORT_*` keys, a coherence `superRefine`, and two variables refused **by name** |
| `packages/server/src/env.test.ts` | 12 new cases in a new `passport env` suite |
| `.env.example` | the Passport block, including why two variables do not exist |
| `packages/web/.env.example` | `VITE_PASSPORT_SUPABASE_URL` + anon key |
| `packages/web/src/auth/session.ts` | both sign-out calls now pass `scope: 'local'` |
| `packages/web/src/auth/signout-scope.test.ts` | **new** — a source sweep over every GoTrue sign-out call site |
| `packages/web/src/auth/session.test.ts` | one assertion corrected, one test added |

## 1. The dependency needed a pnpm allowance, and the failure was loud

The plan flagged "confirm the package actually builds from the pin" as an open check.
It does not build without help, and this is worth recording because the next consumer
in this workspace will hit it.

`git ls-files` on the SDK path shows the repository tracks **`src/` but not `dist/`**.
The local `dist/` I read the contract from is a build artefact. So the package's
`prepare` script (`tsc -p tsconfig.build.json`) is what produces the importable
output, and it has to run at install time. pnpm 10 blocks build scripts for
git-hosted packages, and the first `pnpm install` failed outright:

```
ERR_PNPM_GIT_DEP_PREPARE_NOT_ALLOWED  Failed to prepare git-hosted package …
  needs to execute build scripts but is not in the "onlyBuiltDependencies" allowlist.
```

**A loud failure, which is the good outcome** — the alternative would have been an
install that succeeded and left nothing importable. The fix is four lines in
`pnpm-workspace.yaml`, with the reason written at the entry: remove it and
`packages/server` cannot resolve the SDK at all. Running a build script from a git
dependency is acceptable here specifically because the pin is an **immutable commit
in our own private monorepo**, not a floating version.

### The pin

`4754a77672d6d4214ef3d298ee6ddd53ed9b8b8f` — `origin/main`'s head, confirmed with
`git ls-remote` rather than trusted from a local clone. SDK **3.0.0**, introduced in
`6dd76a7` (*feat(sdk)!: unit_scopes + role_cascade*).

Two things checked rather than assumed:

- **`zod` needs no work.** `packages/server` already depends on `zod ^4.3.6` and the
  SDK wants `^4.0.0`. The duplicate-major clash the plan worried about does not exist.
  (The `ai` / `@ai-sdk` peer warnings about wanting zod 3 are pre-existing and
  unrelated.)
- **`launchpad`'s call site is not a model to copy.** Its lockfile pins `dafbd487`,
  which predates 3.0.0, and its `access.ts` still passes the deprecated `unitScope`.

### Verified by running it, not by reading it

```
SCHEMA_VERSION 1
DISPATCH entries 17
isNewer(1,1) true          <- the `>=` guard, which must accept an equal-version replay
handler names  upsertOrg,archiveOrg,upsertUnit,archiveUnit,upsertUser,upsertMembership,
               removeMembership,upsertEntitlement,upsertUnitAppMembership,
               removeUnitAppMembership,createUnitAppAccess,createRelation,
               createIdentityLink,removeUnitAppAccess,removeRelation,removeIdentityLink,
               resyncOrg
```

All 17 names match the contract, so phase 3's handler class has a verified target. The
`DISPATCH` table is what phase 3's name test will read, rather than a list retyped from
a document.

## 2. Configuration refuses to be half-set

Ten optional keys. Optional matters: an unconfigured deployment — every test, every
contributor's laptop, production today — boots and behaves exactly as before.

What is **not** optional is coherence, because each half fails silently on its own and
the symptom points away from the cause:

| Half-configuration | What happens without the guard |
| --- | --- |
| webhook secret, no API credentials | deliveries arrive, the projection fills up and looks alive — and placement is never read, so nobody is ever identity-linked. Symptom: *N memberships, ~0 identity links.* |
| API credentials, no webhook secret | access derives from a projection that never receives an event |
| `PASSPORT_API_URL` without `PASSPORT_API_KEY`, or vice versa | neither half does anything alone |
| `PASSPORT_WEBHOOK_SECRET_PREV` alone | a rotation overlap with nothing to overlap |
| `PASSPORT_SUPABASE_URL` without the rest of the hosted-login set | a flat `403` from Passport *after* the person has signed in and been redirected |

Each is now a boot failure naming the missing key.

### `PASSPORT_SSO_ENABLED` is an enum, and that is not fussiness

`z.coerce.boolean()` follows JS truthiness, so the string `"false"` coerces to
**`true`** — which would leave the break-glass kill switch permanently on. Parsed as
`z.enum(['true','false']).transform(...)` instead, and pinned by a test.

### Two variables are refused by name

`PASSPORT_ORG_ID` and `PASSPORT_UNIT_SCOPE` are absent from `EnvObject` on purpose,
so `loadEnv` checks the raw `source` rather than the parsed result — zod strips
undeclared keys, which would make setting either one a **silent no-op** instead of the
loud failure it deserves. Each refusal names the alternative:

- **`PASSPORT_ORG_ID`** — rule 9. Read from a query, a handler guard or an authz check,
  a configured org silently discards every other org's events, and no reconciliation
  heals it while the filter is there. Resolve the org from the acting user's membership.
- **`PASSPORT_UNIT_SCOPE`** — placement is `unit_scopes` (a set) plus `role_cascade`,
  read from `GET /apps/me/registry` at startup. The singular form is retired and
  **cannot express this app's shape at all**: there is no value meaning
  `{entity, brand, outlet}`.

An empty value (`PASSPORT_ORG_ID=`) is treated as unset — a shell exporting an empty
string is nobody configuring anything, and failing the boot over it would be wrong.

## 3. The sign-out scope — the one behaviour change

`packages/web/src/auth/session.ts` tried a **global** sign-out first and fell back to
local. The existing docblock argued for that order, and it was right for an app that
owns its issuer.

It stops being right the moment phase 6 lands. Under hosted login a member's session is
issued by **Passport's** project, shared by every consumer in the suite — so the
default `scope: 'global'` would make BrandFactory's logout button revoke that person's
session in every other Mission Systems app **and in Passport's own console**.

**The symptom is delayed, which is why this is worth fixing now rather than inside a
large auth diff.** Sign-out revokes only the *refresh* token; the access token is a JWT
that stays valid until it expires. The other apps keep working and then throw everyone
out at their next refresh, up to a token lifetime later. "I signed out of BrandFactory
at 09:05" and "the other app logged me out at 09:52" do not look like the same event.

Both calls now pass `scope: 'local'`. The second call is still there, and still
correct: the first needs the network to reach GoTrue, while the retry only has to empty
localStorage, which is what must happen before the store is cleared.

### One existing test was asserting the bug

`session.test.ts` contained `expect(supa.signOut).toHaveBeenNthCalledWith(1)` — no
arguments, which *is* `global`. It was updated rather than deleted, with the reasoning
recorded at the test, and a second test added that walks every recorded call and
asserts each one passes `{ scope: 'local' }`.

### The sweep, and proof that it works

A behavioural test covers the call sites that exist today. The failure mode is **the
next sign-out button somebody adds**, written `auth.signOut()` because that is what
every example suggests — and nothing about it raises, renders differently, or looks
wrong in review.

`signout-scope.test.ts` walks every `.ts`/`.tsx` file under `packages/web/src` and
fails on any GoTrue call site that omits a scope or names `global`/`others`. Three
details that make it correct rather than approximately correct:

1. **The pattern is `\bauth\s*\.\s*signOut\s*\(`**, not a literal string. The real call
   in `session.ts` is written across two lines (`supabase.auth` then
   `.signOut({...})`), so a literal `auth.signOut(` finds nothing. Anchoring on `auth`
   also excludes our own wrapper — `session.signOut()` legitimately takes no scope.
2. **Block comments are stripped, whole-line `//` comments too — but not mid-line
   ones.** A docblock discussing `supabase.auth.signOut()` while explaining this rule
   would otherwise be a false positive. A mid-line `//` can sit inside a string
   (`'https://…'`), and cutting there could delete a real call further along the line,
   which would make the guard fail **open** — the one outcome worse than a false alarm.
3. **It asserts it found something.** Without that the file passes vacuously the day
   the pattern stops matching.

**Proven by deliberately breaking it.** A temporary probe with one bare call and one
`{ scope: 'global' }` produced exactly two failures, naming the file and line of each,
and was then removed:

```
× passes an explicit scope at every call site  → [ 'auth/__tmp-violation.ts:5' ]
× never names global or others                 → [ 'auth/__tmp-violation.ts:9' ]
```

A guard that has never been seen to fail is not a guard.

The fourth case in that file asserts the ordinary sign-out button is not wired to
Passport's `/logout`. That ends the person's *SSO session*, so the next app makes them
sign in again — a different promise from "sign out of this app", and shippable only as
a separately labelled control.

## 4. The gate

```
pnpm typecheck                    all 10 packages    pass
pnpm lint                         eslint, whole repo pass
pnpm format:check                 prettier           pass
pnpm test                         1999 passed | 78 skipped
pnpm -F @brandfactory/web build   tsc + vite         pass
```

The chunk-size warning on the web build is pre-existing.

## 5. What is deliberately still missing

Phase 1 makes the dependency resolve and the configuration honest. It does not project
anything, receive anything, or derive any access. Specifically absent:

- no `passport` schema and no read-model tables (phase 2, and it needs **D4** — one
  database role or two);
- no receive endpoint, no handlers (phase 3);
- **no registry read, so placement is not yet known to the code** (phase 4). The
  proposal records the operator's answer — `unit_scopes = ["entity","brand","outlet"]`,
  and therefore **no role cascade**, since Passport refuses `role_cascade` on any shape
  outside `{entity, outlet}` / `{brand, outlet}` with a `422`. Phase 4 replaces that
  answer with the authoritative read;
- no login change. The magic link and the Google button are untouched and still the
  front door;
- `PASSPORT_SYNC_DATABASE_URL` is **not** in the env schema. It belongs to `D4`, and
  adding it now would put a key in `.env.example` for a decision not yet taken.

## 6. Still needed before phase 2 and 4

- **D4** — whether the projection gets its own database role. Phase 2 cannot write its
  migration's grants without it.
- **`PASSPORT_API_URL`, `PASSPORT_APP_ID`, `PASSPORT_API_KEY`** — phase 4's registry
  read. Until they exist the code falls back to `["brand"]` with a warning, and that
  fallback must never be mistaken for the answer.
