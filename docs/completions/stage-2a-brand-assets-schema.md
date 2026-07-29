# Stage 2A — `brand_assets`, shared + db

**Status:** shipped, 2026-07-29. Executes Stage 2A of
[`docs/executing/brand-hub-implementation.md`](../executing/brand-hub-implementation.md),
on top of [Stage 1A](stage-1a-brand-website-url.md) and
[Stage 1B](stage-1b-guideline-provenance.md).

**Migration 0004** — one table, four enums, a hand-specified CHECK and two
partial indexes. No route, no UI, no vendor. The 1.8.0 mockup's
`src/demo/assetTypes.ts` is **deleted**, and the union it was a mirror of now
lives in `@brandfactory/shared` where the mockup was written to put it.

**Nothing is user-visible.** Stage 2 releases at 2F as 1.10.0; the changelog is
untouched by this pass.

Test baseline: **565** (550 passed, 15 skipped) → **610** (581 passed, 29
skipped). **+45**; 14 of the new skips are this pass's live-Postgres file, which
runs — see Verification — and is skipped by the default `pnpm test` for want of a
`DATABASE_URL`.

---

## The finding the phase existed to produce

2A's acceptance criterion was written as a measurement, not a target:

> **no test body changes** — only import lines. If a test body has to change,
> the shared type is not the mirror the mockup claimed it was, and that is a
> finding.

**Six test bodies changed, and no component body did.** That split is the
result. Every one of the six changed for one of three reasons, and each is a
deliberate divergence from the mirror rather than a defect in it:

| # | Divergence | Why the mirror could not have had it |
| --- | --- | --- |
| 1 | **Branded ids.** `id: BrandAssetIdSchema`, `brandId: BrandIdSchema` | Every other entity in the domain brands both — `SectionId`, `CanvasBlockId`, `ProjectId`. A front-end-local mirror had nothing to be nominal *against*; the shipped type does, and 2B's `PATCH /brands/:id/assets/:assetId` is exactly the call site where a bare `string` would let a `BrandId` through |
| 2 | **`createdAt` / `updatedAt`.** | The proposal's table has the columns; the mirror had no writer, so it had no reason to state them. A row that cannot say when it was added is the same worse-row argument that put `sizeBytes` in |
| 3 | **`AssetLinkUrlSchema` restricts to `http`/`https`.** | 1A's precedent, one stage old: `z.url()` accepts `javascript:alert(1)` and `data:text/html,…`. The mirror never parsed anything, so it never had to decide |

**All six changed bodies are fixture constructors.** Not one assertion about
behaviour moved, and the twelve importers' component code changed nothing but
its import line. The mirror was faithful about *shape*; it was silent about the
three things only a schema with a wire and a column behind it has to answer.

The one exception is worth naming separately because it is an assertion, not a
constructor: `fixtures.test.ts`'s dead-link case asserted
`url.startsWith('/')`. Divergence 3 makes a bare path invalid, so the fixture
now states its origin and the test asserts `new URL(url).origin ===
window.location.origin`. **That is what the test always meant** — the comment
above it says *"so the failure is local and instant"* — and `startsWith('/')`
was the mechanism it happened to use. The claim did not weaken.

---

## What changed, layer by layer

### `packages/shared/src/asset/asset.ts` — the union, and one new rule

Lifted from `src/demo/assetTypes.ts` close to verbatim: the three axes, the
three arms, and all five accessors. Two things are new.

**`AssetLinkUrlSchema` is `z.url({ protocol: /^https?$/ }).max(2048)`** — the
same expression as `BrandWebsiteUrlSchema`, deliberately, so the two cannot
drift. A link asset's `url` is user-supplied and lands in a `src` today and next
to affordances that want an `href` in 2E. Putting the restriction on the schema
rather than at the route makes the row, the create body and the patch body
restricted **by construction**, which is the argument 1A made and the one this
inherits.

**`assetUrl` did not come with the others.** It takes a blob resolver, and a
blob resolves through a signed read URL that expires in five minutes and is
refreshed on a 4-minute interval by `api/queries/blobs.ts`. That is a
browser-session concern with a lifetime, not a pure function of the row, so it
lives at `packages/web/src/lib/asset-url.ts` with the reason written next to it
— and it is the same reason 2B gives for not resolving server-side.

The **non-unique-role** rule from the plan's finding 3 is written into
`AssetRoleSchema`'s doc comment rather than left in a document, including the
prohibition: *no singular accessor named `primaryColor` may exist, in any
layer*. `logoAsset` is the worked example — first by `position` among active —
and there is a test that two logos resolve deterministically.

**`packages/shared` gained a vitest project.** It was schemas-only until this
pass and had no suite; it now exports behaviour, and a package that ships
functions earns its own tests rather than being covered incidentally by its
consumers. One devDependency, one config, one workspace entry.

### `packages/db` — migration 0004, and a plan fact corrected

**The plan predicted drizzle-kit would not generate the CHECK.** It does:

> Drizzle-kit will not generate this from the schema alone — **hand-author it
> into the generated SQL and add the `check()` to the table definition** so the
> next `db:generate` does not drop it.

Measured, not assumed — `check()` from `drizzle-orm/pg-core` emitted the
constraint into `0004_wonderful_the_stranger.sql` inline in the `CREATE TABLE`,
verbatim from the schema. **No SQL was hand-authored**, which is the better
outcome: the constraint has exactly one source, and the half of the plan's
instruction that mattered — the `check()` in the table definition, so the next
`db:generate` cannot drop it — is what does the work.

The constraint is duplicated in SQL *and* in the union, and 1A's `website_url`
deliberately is not. The difference is written down in both files: a rule with
one enforcement point and one writer is a rule to keep in sync, but
`brand_assets_source_exactly_one` spans three columns, and any future writer
reaching the table without going through a route could plausibly violate it.

**`rowToBrandAsset` throws** when the column its `source` names is null, the
same way `rowToCanvasBlock` throws on an image block with no `blobKey`. The
CHECK guarantees presence, so a null there means the constraint is gone — a
data-integrity bug, not a state to degrade into an asset that renders nothing.

**`updateAsset` cannot change `source`, `kind`, or any of the three source
columns.** Changing where an asset's bytes live is not an edit to that asset,
and a patch that could set them one at a time is the one shape that walks a row
past the CHECK a column at a time. Swap by creating a new row.

Both `updateAsset` and `softDeleteAsset` are **scoped by brand as well as id**,
so an id from another brand misses rather than updating. There is a test.

### `listBlobKeysByBrand` — the leak this closes

It walked `canvas_blocks` only. Every uploaded logo, photo and brand deck would
have leaked its bytes on brand delete — silently, permanently, and with no
failing test anywhere, because the query's callers are correct and it is the
query that was narrow.

The asset arm filters `source = 'blob'`, and that is **not** an optimisation: a
`link` row's `url` is somebody else's host, and sweeping it would mean issuing a
delete against a key that is not ours. The column is null for `link` and
`inline` rows anyway; the filter says *why* rather than relying on that.

Soft-deleted assets are deliberately **included** — the brand is going away, so
every byte it ever owned goes with it. This is the one place that rule inverts,
and `softDeleteAsset`'s doc comment says so from the other side: a soft-deleted
asset can come back (`vision.md:51`), so nothing else may sweep.

### `packages/web` — the mirror is gone

`src/demo/assetTypes.ts` is **deleted**; its thirteen importers repoint at
`@brandfactory/shared` and `@/lib/asset-url`. The second-source-of-truth risk the
mockup's own risk table named is closed at the first opportunity: from here the
fixtures are typed against the *shipped* schema, so a fixture that stops
compiling is a real incompatibility.

**Compiling is not the whole contract**, and divergence 3 is why. The `url`
field is typed `string`, so a fixture holding `javascript:` or a bare
`/path.png` type-checks happily and is rejected by the real route. Two things
follow:

- The demo's link fixtures now state their origin (`new URL(path, origin)`),
  which keeps every property the fixture header defends — same host, no DNS,
  immediate 404 for the dead one — while making them rows the real
  `POST /brands/:id/assets` would take.
- **`fixtures.test.ts` parses every fixture asset against `BrandAssetSchema`.**
  That is the half of the check TypeScript cannot do, and it is the mockup's
  "the fixtures are the schema review" mechanism upgraded from compile-time to
  runtime.

---

## Verification

```
pnpm typecheck                             9/9 workspaces
pnpm lint / format:check                   clean
pnpm test                                  581 passed | 29 skipped (610)
pnpm --filter @brandfactory/web build      ok
grep -c "demo" dist/assets/*.js            0
grep -ci "casa vostra\|terracotta"         0
```

The tree-shaking grep matters more than usual this pass: `demo/fixtures.ts` now
imports from `@brandfactory/shared`, which *is* in the product bundle. The
`/* @__PURE__ */` annotations and the fixtures-inside-functions rule still hold
it at zero.

**Against live Postgres** (docker compose, `postgres:16`):

```
pnpm -F @brandfactory/db db:migrate        0004 applied
psql \d brand_assets                       20 columns · 2 partial indexes · 1 CHECK · FK cascade
pnpm -F @brandfactory/db test              54 passed (6 files, 0 skipped)
```

**The release path** — the one that broke v7/v8 — run from empty against a
throwaway database, not the already-migrated dev one:

```
create database bf_release_check
node packages/db/scripts/migrate.mjs       migrations applied
select count(*) from drizzle.__drizzle_migrations   → 5   (0000–0004)
select conname … 'brand_assets_source_exactly_one'  → present
\di brand_assets*                          both partial indexes present
drop database bf_release_check
```

### The two mutation checks

A CHECK nobody has watched fail is a CHECK that may not exist, and the same goes
for a query arm.

**Drop the constraint, run the suite:**

```
alter table brand_assets drop constraint brand_assets_source_exactly_one

× brand_assets_source_exactly_one rejects inline with no value
× brand_assets_source_exactly_one rejects inline carrying a url
× brand_assets_source_exactly_one rejects blob with no key
× brand_assets_source_exactly_one rejects link carrying a blob key
Tests  4 failed | 10 passed (14)
```

Four fail, and they are the four that name it. Ten pass — the constraint is not
load-bearing for anything else, which is what it should be.

**Remove the asset arm from `listBlobKeysByBrand`:**

```
return [...blockRows, ...assetRows].map(…)   →   return [...blockRows].map(…)

× listBlobKeysByBrand returns asset blob keys, and only blob ones
× listBlobKeysByBrand includes soft-deleted assets
Tests  2 failed | 12 passed (14)
```

Both live databases were dropped afterwards, and the dev database is back to
zero `brand_assets` rows and its three brands (the seed's two plus the
`Casa Vostra` the 1B live pass left behind).

### Where the +45 tests went

| file | Δ | what it pins |
| --- | --- | --- |
| `shared/src/asset/asset.test.ts` | +24 (new) | the union's three arms, the exactly-one-of rule at the app layer, six link-URL cases including `javascript:` and `data:`, and every accessor — including that `logoAsset` refuses a proposed logo, refuses a `mark`, and resolves two logos by position |
| `db/src/brand-assets.live.test.ts` | +14 (new, live) | round trip per source, the CHECK ×4, `status` default, cross-brand patch and delete both missing, soft-delete out of the read path but not out of the table, `proposed` still in it, atomic reorder + rollback, both blob-sweep arms, the FK cascade |
| `db/src/mappers.test.ts` | +6 | source narrowing, `alt`/`size_bytes` carried through, `deletedAt` normalisation, and the three loud failures |
| `web/src/demo/fixtures.test.ts` | +1 | every fixture asset parses as `BrandAssetSchema` — the check the compiler cannot do |

**Six test bodies changed**, all fixture constructors, all for one of the three
divergences above — the finding, recorded at the top. **No component body
changed**, and the twelve component/route importers changed nothing but an
import line.

---

## Judgement calls this pass made

Recorded because the plan did not specify them.

- **`AssetLinkUrlSchema` restricts the protocol.** The plan said "lifted almost
  verbatim". A user-supplied URL rendered into the DOM is the same hazard 1A
  spent a schema on, one stage ago; not applying the rule here would have made
  `brands.website_url` the safe field and `brand_assets.url` the one that got
  away.
- **The metadata columns are `.nullable().optional()`, not required-nullable.**
  1A made `websiteUrl` a required key with a nullable value and praised the
  compiler for finding all 17 sites. That was right for one column on one
  entity; it is wrong for six per-kind columns, because a colour would have to
  state `mime: null, filename: null, width: null, height: null, sizeBytes: null,
  alt: null` to say nothing at all.
- **`packages/shared` gained a test suite.** Reasoned above. The alternative —
  testing shared accessors from `packages/db` or `packages/web` — puts a
  package's tests somewhere its own `pnpm test` cannot find them.
- **Demo link fixtures are absolute now.** Preserves every property the fixture
  header defends; the alternative was a fixture the real route would 400.
- **`createAsset` takes a distributive union**, matching `CreateBlockInput`
  rather than inventing a second idiom for the same problem.

## Left for later, named rather than buried

- **`docs/plans/brand-assets.md` is still unlocked and still says the resolver
  is server-side.** 2B's plan already records that deviation; the proposal
  itself has not been amended. Its Phase A is now shipped and it should be
  marked so before 2B.
- **No `collection` column** — finding 5, deferred exactly as the proposal
  recommends. Nullable and cheap to add, expensive to unpick.
- **`brand_assets` is not in `listBrandSummariesByWorkspace`.** No surface counts
  a brand's assets yet. When one does, that hand-written select list is the
  hazard 1A already flagged in it.
- **The product → demo import direction is still violated, by `researchTypes`
  only.** `BrandHubView.tsx` and `BrandContextRail.tsx` still import
  `@/demo/researchTypes`. 2A removed the `assetTypes` half; **3B removes the
  rest**, and 3G's "nothing may import `src/demo/` from outside `src/demo/`"
  check cannot pass until it does.
- **No live browser pass, by design.** This phase ships no UI and changes no
  rendered output — the demo route renders the same fixtures through the same
  components. 2F's live pass is where the assets surfaces get looked at, and the
  plan marks it not skippable.
- **`ALLOWED_UPLOAD_MIMES` is unchanged and untested against asset uploads.**
  Nothing uploads an asset until 2E.

**Untouched:** `packages/server`, `packages/agent`, `adapters/*`, `miniApps.ts`
(the `Visual identity` tile is still inert — 2E turns it on), `.env.example` (no
new env keys), and `docs/changelog.md` — Stage 2 ships as 1.10.0 at 2F.

**Next in the plan:** 2B — `packages/server/src/routes/assets.ts`, four routes
behind `requireBrandAccess`, with the shared union as the create body.
