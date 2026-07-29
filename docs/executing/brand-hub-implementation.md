# Brand hub — the real implementation

**Status:** plan, 2026-07-29. Written against `main` at **1.8.0**.

This document executes three others. It does not supersede any of them:

- [`docs/plans/brand-assets.md`](../plans/brand-assets.md) — proposal, **unlocked**.
  Its questions 2, 3 and 6 were the mockup's job; they are answered below and its
  Phase A is now writable.
- [`docs/plans/brand-research-onboarding.md`](../plans/brand-research-onboarding.md)
  — **locked 2026-07-28**, decisions 1–12. This plan renders and schedules them.
  It reopens none.
- [`docs/executing/brand-hub-fe-mockup.md`](brand-hub-fe-mockup.md) — shipped as
  1.8.0. Its P5 decision record is the input to everything below, and its
  deletion is scheduled here.

**Scope:** all three stages, in order. Stage 1 is two days of independently
useful work with one migration. Stage 2 is `brand_assets` end-to-end with no
vendor and no recurring cost. Stage 3 is the Perplexity research loop. **Each
stage leaves the repo green at its boundary and ships value if the next one is
cancelled** — that is the test each stage boundary is drawn against.

Test baseline: **527** (517 passed, 10 skipped; the skips are the live-Postgres
suites and need a Docker daemon).

---

## The rail verdict

The mockup built A, B and C so that two could be deleted. **A wins.** The
palette is a block in the rail, below the section list and above the footer.

The decision was delegated rather than made by the reviewer, so the reasoning is
written out in full — it is the one place this plan overrides a document instead
of executing it.

**1. The argument expected to kill A was measured and did not happen.** P5:
five section rows, a twelve-swatch palette and two footer rows come to ~450px in
an 80-wide rail. `rich` was the crowding test the whole merge existed to run, and
A survived it. With that gone, the case against A is discoverability-neutral and
the case for it is direct.

**2. C fails the request that produced the proposal.** `brand-assets.md` was
raised out of 1.7.0 on the words *"quickly find related/relevant brand
information (brand colours, logos, assets…)"*. C makes a brand's colours
somewhere you navigate to. It is the cleanest arrangement and it is the one that
answers the originating request with a click.

**3. A does not break the rail's one rule.** `BrandContextRail.tsx:60-68` says
*written sections and unwritten suggestions are one list, which is the meter*.
That rule is about **the list**. A palette **block** — its own `border-t`, its
own heading, its own summary line — is not a row in that list and does not
enter the count. The rule survives intact; the rule that would have been broken
is the one the mockup was careful not to break.

**4. B moves a band 1.7.0 deliberately kept to one fact,** and it has no good
answer at the top of the cardinality range: a twelve-colour ramp under a
40px monogram either wraps into the description or shrinks below legibility.

**What follows from picking A, and is therefore also decided:**

- **The Visual identity page still ships, and still owns everything.** Question 2
  was answered by looking and is not reopened: a photo grid is not rail-shaped.
  The rail shows *the palette*; the library owns *all assets, including palette
  editing*. Read here, write there.
- **The rail's palette block stays read-only,** as the mockup shipped it — no
  `Edit`. Its heading is a link to Visual identity, which is the one affordance
  it gains over 1.8.0. The alternative (no link at all; the tile is the only
  door) is defensible and is the thing to look at again in 2F's live pass.
- **`railVariant` is deleted, not defaulted.** Structures B and C come out of
  `BrandHubView`, `BrandIdentity` and `BrandContextRail` in 2C. A prop with one
  legal value is a prop that has already been decided.

---

## The five schema findings, resolved

P5 recorded five findings against the proposed `BrandAsset` union, at the bottom
of `packages/web/src/demo/assetTypes.ts`. Each gets an answer here, **before**
2A writes the migration — which is what that file was built to make possible.

| # | Finding | Resolution |
| --- | --- | --- |
| 1 | No `size_bytes` | **Added.** `size_bytes integer null`. A file row that cannot say "6.5 MB" is a worse row, and it is set at upload time from `File.size` — which the client already sends to `POST /blob-urls/upload-url`. Backfilling it later means re-`HEAD`ing every blob |
| 2 | No `alt` | **Added.** `alt text null`, exactly as `canvas_blocks` has it. `label` keeps its own job ("Wordmark, dark bg" is a caption, not a description) and the two diverge the moment a label is "Primary" and the image is a dining room. `alt` falls back to `label` at render, so the common case costs the user nothing |
| 3 | `role: 'primary'` is not unique | **Documented as non-unique; no constraint, no accessor change.** `'logo'` is not unique either — `logoAsset()` already resolves it as *first by `position` among active*. That is the rule for every role. **No singular accessor named `primaryColor` may exist**, in any layer; the reader that wants one colour asks for the primaries in position order and takes the head, at the call site, where the arbitrariness is visible |
| 4 | A `link` image carries no dimensions | **The caption says what it knows.** A blob photo reads `320×240 · 822 KB`; a link photo reads its **host** (`drive.google.com`) rather than falling back to `image/svg+xml`. The host is the fact that actually distinguishes a link, and it is the one the bring-your-own-hosting rule wants visible |
| 5 | Cardinality wants grouping | **Deferred, as the proposal recommends.** No `collection` column in 2A. It is nullable and cheap to add; it is expensive to unpick if nobody groups anything. Revisit when a real brand has more than one ramp |

**And one finding the screenshots produced that is not on that list.**
`logo-link-dead` is pixel-identical to a brand with no logo — the monogram
fallback costs nothing, "and that is the problem". Resolution, in 2D:

> **The hub stays silent; the failure is reported where it is caused.** A rail
> that scolds you about a background fact is the thing 1.7.0 spent a pass
> removing. So the link is validated **at record time** — the record-a-link form
> attempts the load in the browser and refuses to save quietly on failure — and
> the library keeps its `Did not render` caption for a link that rots later.

---

## Facts verified against `main` at 1.8.0 (2026-07-29)

Re-checked line by line for this plan; the two source documents' own facts
tables still hold except where noted.

| Claim | Evidence |
| --- | --- |
| A brand is still six columns | `packages/db/src/schema/brands.ts` — no `website_url` |
| Three migrations exist | `packages/db/drizzle/0000…`, `0001…`, `0002…`. The next are **0003**, **0004**, **0005** |
| The release migrator is back | `packages/db/scripts/migrate.mjs` (restored in 1.3.0 after it broke releases v7/v8) |
| `createdBy` is still absent from the wire | `UpdateBrandGuidelinesSectionInputSchema` has `id, label, body, priority`; `routes/brands.ts:122` hardcodes `createdBy: 'user'`. The `pgEnum` has had `'agent'` since 0.3.0 with **no producer** |
| `updateBrandGuidelines` deletes by omission | `queries/brands.ts` — *"any row the payload omits is deleted"*, single tx, `notInArray` on `keptIds` |
| The blob transport is complete and generic | `BlobStore` port · `POST /blob-urls/upload-url` + `GET /blob-urls/:key/read-url` · `uploadBlob()` two-step PUT · `useSignedReadUrl` on a 4-minute `refetchInterval` |
| Upload MIMEs are already allowlisted | `ALLOWED_UPLOAD_MIMES` — 5 image types, PDF, 2 Word types, `text/plain`. Server rejects anything else **before** minting a write URL |
| Brand delete already sweeps blobs | `routes/brands.ts` reads `listBlobKeysByBrand` **before** the cascade, then `sweepBlobs`. That query walks `canvas_blocks` only — assets are not in it |
| Four adapters ship | `auth`, `storage`, `realtime`, `llm`. `research` is the fifth |
| Env is one zod object with a drift guard | `EnvSchema` + `ENV_SCHEMA_KEYS`; `env.example.test.ts` fails the build if the schema widens without `.env.example` |
| No Perplexity anywhere | `grep -rli perplexity packages/` → zero. `.env.example`'s only vendor key is `OPENROUTER_API_KEY` |
| `resolveLLMSettings` is workspace-then-env | `packages/server/src/settings.ts` |
| `AgentConcurrencyGuard` is process memory | `packages/server/src/agent/concurrency.ts`, per project. **Not reusable for research** — a job outlives the request |
| Brand context threads are a list | `isBrandContextThread` over `MINI_APPS`; `brands.$brandId.context.tsx` renders a grid |
| `Visual identity` is still inert | `miniApps.ts` — `enabled: false`, `surface: 'tile'` |
| `staged` is still one `CapturePayload` | `BrandGuidelinesEditor.tsx` — `consumedStagedRef` keys on payload **identity** for StrictMode |
| The hub is split | `routes/brands.$brandId.tsx` (data) → `BrandHubView` (pure). The route passes **nothing** for any 1.8.0 prop |
| 13 demo-type importers | 13 files import `@/demo/assetTypes`, 6 import `@/demo/researchTypes` (overlapping). Every one is a component that survives; only the import path moves |
| The demo is tree-shaken, fragilely | `router.tsx` — `import.meta.env.DEV` **plus** `/* @__PURE__ */` on both `createRoute` calls **plus** fixtures built inside functions. Remove any one and `demo` returns to `dist` |

---

## Two things that cut across every stage

### 1. The absent-prop invariant has to retire, on purpose

1.8.0's load-bearing protection was:

> The real route can only pass `null` / empty for every prop this pass adds, and
> every new affordance renders nothing when its prop is absent.

**Stage 2 and Stage 3 exist to break the first half of it.** The route starts
passing real values, because that is what shipping means. The second half does
not retire, and it is what carries the weight from here:

> **Every affordance still renders nothing when its prop is absent** — and
> "absent" is now a real runtime state, not a construction, because a query can
> be loading, empty, or failed.

Concretely, and as an acceptance criterion on 2C, 2D, 2E and 3C:

- No palette block for a brand with no colours. Not an empty block, not a
  "no colours yet" placeholder. The `bare` state stays byte-identical to 1.7.0.
- No research row when `RESEARCH_PROVIDER=none`. The gate is the **callback**,
  as 1.8.0 built it: no provider → the route passes no `onStartResearch` → the
  row does not exist. A self-hoster without a key gets the feature *absent*, and
  the create dialog explains why (research decision, Phase B).
- Query-pending is not zero. `projects === undefined` already means "not known"
  and tiles stay silent; `colors === undefined` must mean the same. A palette
  block that flashes empty on every navigation is worse than one that appears
  100ms late.

### 2. What happens to the demo, and when

The mockup's risk table says the demo is deleted "in the same pass that lands the
real types", to stop the fixtures rotting into a second source of truth.

**This plan keeps the routes alive to the end of Stage 3 and deletes the mirrored
types immediately — which is a change to that schedule, made deliberately.**

- **2A deletes `src/demo/assetTypes.ts`.** `@brandfactory/shared` gains
  `BrandAsset`, and the 13 importers repoint. The fixtures keep working.
- **3B deletes `src/demo/researchTypes.ts`,** the same way.
- **3G deletes `src/demo/` entirely,** both demo routes, the `import.meta.env.DEV`
  gate and the `/* @__PURE__ */` annotations in `router.tsx`.

The risk being managed is *a second source of truth*. Deleting the mirrored types
at the first opportunity removes it completely: from 2A onward the fixtures are
typed against the shipped schema, so a fixture that stops compiling is a real
incompatibility. What is left is a scenario picker that renders **the real
components against the real types** — which is the only way to see
`research-failed` or `no-findings` without making a vendor fail on demand, and it
is the surface 3E is built against before a live job exists.

The deletion is on the last phase's acceptance list, and the build grep goes with
it. **Nothing may import `src/demo/` from outside `src/demo/`** — the existing
direction of dependency (product ← demo) is what makes the final delete a leaf
operation, and it is checked in 3G.

---

# Stage 1 — Foundation

Two things the schema cannot currently say, neither of which needs assets or
research to exist. This is `brand-research-onboarding.md`'s Phase A, unchanged,
and its Q10 sequencing call answered **yes** — it ships alone, first, and puts a
real migration through the release path before anything interesting depends on
one.

## 1A — `brands.website_url` (+8–12 tests)

**Migration 0003.** One nullable column, additive, tolerated by the previous
image.

**Work:**

1. `packages/db/src/schema/brands.ts` — `websiteUrl: text('website_url')`.
   `pnpm -F @brandfactory/db db:generate`, review the SQL by hand before
   committing it.
2. `packages/shared/src/brand/brand.ts` — `websiteUrl: z.url().nullable()` on
   `BrandSchema`. **`z.url()`, not `z.string()`**: this value is put into an
   `href` and rendered as a link, and `javascript:` in a brand field is a stored
   XSS with a nice UI around it. Restrict to `http`/`https` explicitly.
3. `create.ts` / `update.ts` — `websiteUrl` optional-nullable on both. `update`'s
   `.refine` (at least one key) widens to include it.
4. `packages/db/src/mappers.ts` — `rowToBrand`. `queries/brands.ts` —
   `createBrand` and `updateBrand` take and write it.
5. `routes/brands.ts` — `createBrand` passes `body.websiteUrl ?? null`. `PATCH`
   already forwards the validated body wholesale.
6. `BrandSummary` gains it too, so the workspace grid can render it without a
   second fetch.
7. **Web:** `NewBrandDialog` (inline in `routes/workspaces.$wsId.index.tsx`)
   gains `Website (optional)`. `RenameDialog` — which is the brand's only edit
   surface — gains it as well, or a brand created without one can never acquire
   one. `BrandCard` renders it. `BrandHubView`'s `websiteUrl` prop, which has
   existed and been unfed since 1.8.0, gets fed by the route.

**Acceptance:** a brand created with a website renders its link on the hub and
the card; `javascript:alert(1)` is rejected at the wire boundary with a 400, and
there is a test that says so. `pnpm -F @brandfactory/db test` covers the round
trip against live Postgres.

## 1B — provenance on the wire (+6–10 tests)

**No migration** — `guideline_section_created_by` has had `'agent'` since 0.3.0.

The bug being fixed is precise and is not "the field is unset": because every
save round-trips the **complete** section list, a section stored as `'agent'` is
silently rewritten to `'user'` the next time you save an unrelated section. The
field lies on the very next save, which is why this rides along now rather than
waiting for the phase that consumes it.

**Work:**

1. `UpdateBrandGuidelinesSectionInputSchema` gains
   `createdBy: GuidelineSectionCreatedBySchema.default('user')`. The default is
   what keeps every existing client compiling and correct.
2. `routes/brands.ts` — delete the hardcoded `createdBy: 'user'`; forward
   `s.createdBy`.
3. `BrandGuidelinesEditor` — `toLocal`/`save` carry each section's own
   `createdBy` through local state. A **new** section is `'user'`; that is the
   only place the literal appears on the client.

**Acceptance — the one test that matters:** seed a brand with one `'agent'`
section and one `'user'` section, save an edit to the `'user'` one through the
real route, and assert the `'agent'` section is **still** `'agent'`. Without it
the field goes back to lying and nothing fails.

**Ships as 1.9.0.** A brand records where it lives on the web; a section's author
stops being overwritten. Neither needs a single thing from Stage 2 or 3.

---

# Stage 2 — Brand assets

`brand-assets.md`'s phases A–F, with its open questions now answered. **No
vendor, no key, no recurring cost, verifiable entirely offline.**

## 2A — shared + db (+18–24 tests)

**Migration 0004.** The new table, on the three orthogonal axes, with the two
findings folded in.

```
brand_assets
  id           uuid pk
  brand_id     uuid → brands(id) ON DELETE CASCADE
  kind         asset_kind    'color' | 'image' | 'file'
  source       asset_source  'inline' | 'blob' | 'link'
  role         asset_role    'logo' | 'mark' | 'primary'   null
  status       asset_status  'proposed' | 'active'         default 'active'
  label        text not null
  value        text null      -- source='inline'
  blob_key     text null      -- source='blob'
  url          text null      -- source='link'
  alt          text null      -- finding 2
  mime         text null
  filename     text null
  width        integer null
  height       integer null
  size_bytes   integer null   -- finding 1
  position     integer not null
  deleted_at   timestamptz null
  created_at / updated_at
```

**The exactly-one-of rule is enforced twice**, which is the belt-and-braces
`canvas_blocks` already gets:

```sql
CONSTRAINT brand_assets_source_exactly_one CHECK (
  (source = 'inline' AND value IS NOT NULL AND blob_key IS NULL AND url IS NULL) OR
  (source = 'blob'   AND blob_key IS NOT NULL AND value IS NULL AND url IS NULL) OR
  (source = 'link'   AND url IS NOT NULL AND value IS NULL AND blob_key IS NULL)
)
```

Drizzle-kit will not generate this from the schema alone — **hand-author it into
the generated SQL and add the `check()` to the table definition** so the next
`db:generate` does not drop it. There is a test that inserts a violating row and
expects the constraint to fire; a CHECK nobody has seen fail is a CHECK that may
not exist.

Indexes: `(brand_id, kind, position) WHERE deleted_at IS NULL` for the read path,
`(brand_id, role) WHERE deleted_at IS NULL AND status = 'active'` for `BrandMark`.

**`packages/shared/src/asset/*`** — the union, lifted from
`src/demo/assetTypes.ts` almost verbatim, because that file was written to be
lifted. `BrandAssetSchema` is a `z.discriminatedUnion('source', …)`, and the
accessors (`activeAssets`, `assetsOfKind`, `logoAsset`, `colorValue`,
`byPosition`) come with it. `assetUrl` does **not** — it takes a blob resolver,
which is a client concern; it stays in `packages/web`.

**`packages/db/src/queries/assets.ts`** — `listAssetsByBrand` (excludes
`deleted_at`, **includes** `proposed`, because the rail's job is to show them),
`createAsset`, `updateAsset`, `softDeleteAsset`, `reorderAssets`, and:

**`listBlobKeysByBrand` widens** — it currently walks `canvas_blocks` only, so
without this every asset upload leaks its bytes on brand delete. The union arm
must filter `source = 'blob'`; a `link` row owns no bytes and sweeping it would
mean issuing a delete against a key that is really somebody else's URL.

**Then: delete `src/demo/assetTypes.ts`** and repoint its 13 importers at
`@brandfactory/shared`. This is mechanical, it is the phase's real risk of churn,
and the acceptance criterion is that **no test body changes** — only import
lines. If a test body has to change, the shared type is not the mirror the
mockup claimed it was, and that is a finding.

## 2B — server (+12–16 tests)

`packages/server/src/routes/assets.ts`, mounted at `/brands` alongside the
existing brand routers.

- `GET /brands/:id/assets` → the full list, `proposed` included.
- `POST /brands/:id/assets` → 201. Body is the shared union, so the
  exactly-one-of rule is enforced at the wire before the CHECK ever sees it.
- `PATCH /brands/:id/assets/:assetId` → label, status, role, alt, position.
- `DELETE /brands/:id/assets/:assetId` → soft delete. **Bytes are not swept
  here** — a soft-deleted asset can come back (`vision.md:51`), and a sweep would
  make "hidden" mean "destroyed". They go on the brand cascade, and on nothing
  else in this stage.

Every handler goes through `requireBrandAccess`, which already exists.

**Uploads reuse the built transport unchanged.** The client mints a write URL
from `POST /blob-urls/upload-url`, PUTs the bytes, then `POST`s an asset row
carrying the returned key. The server stays out of the byte path and this route
module never sees a file. `ALLOWED_UPLOAD_MIMES` already gates it.

**The resolver, so no client branches on `source`.** `GET
/brands/:id/assets` returns rows as stored; resolution happens client-side in 2C
because signed read URLs expire in 5 minutes and `useSignedReadUrl` already owns
the refresh. Resolving server-side would mint URLs that are stale before the
page paints. *The proposal put the resolver on the server; this is a deviation,
and the 4-minute `refetchInterval` in `api/queries/blobs.ts` is the reason.*

## 2C — colours (+14–18 tests)

The first UI, and the first place `status` is real. All `source: 'inline'`, so no
upload path and no link path — those are 2D and 2E.

- `packages/web/src/api/queries/assets.ts` — `useBrandAssets(brandId)`,
  `useCreateAsset`, `useUpdateAsset`, `useDeleteAsset`. Query key
  `['brands', id, 'assets']`, under the existing `brandKeys` convention.
- `routes/brands.$brandId.tsx` feeds `colors` from that query. **`undefined`
  while pending** — see the invariant.
- **`railVariant` is deleted.** Structures B and C come out of `BrandHubView`,
  `BrandIdentity` and `BrandContextRail`. `ColorSwatches` is unchanged and keeps
  every test it has.
- The rail's palette block gains a heading link to `/brands/$brandId/apps/visual`.

**Editing lives on the Visual identity page, which 2E builds.** So 2C ships the
rail block **read-only** and the tile is still `Soon` — meaning for one phase a
brand can display colours it cannot yet add. That is deliberate: it keeps the
read path and the write path in separate reviewable phases. **Colours are seeded
in 2C by the API and by tests only**, and 2C does not ship to a user-visible
release on its own. Stage 2 releases at 2F.

## 2D — the logo (+10–14 tests)

`BrandMark`'s own doc comment has promised this since 1.7.0: *"only the source of
the fill changes from derived to declared."*

- `logoAsset(assets)` → `assetUrl` → `BrandMark src`. `blob` resolves through
  `useSignedReadUrl`, which brings the 4-minute refresh the hub does not do yet.
  `link` passes through.
- **The monogram is the fallback for three different things** — no logo, a
  `proposed` logo (question 7: proposed reaches neither the agent nor the mark),
  and a load failure — and it must be visually identical in all three. It already
  is; 1.8.0's `onError` handler shipped.
- **Record-time link validation**, per the finding above: the record-a-link form
  loads the URL in an `<Image>` before enabling save, and refuses with *"That URL
  didn't load as an image. Share links from Drive and Dropbox usually serve a
  viewer page — paste a direct image URL, or upload the file instead."* The
  proposal's non-goals forbid **rewriting** share URLs into `?raw=1` forms, and
  this does not: it tells the user and stops.

## 2E — the library, and turning the tile on (+16–22 tests)

- **`miniApps.ts` — `visual.enabled` flips to `true`.** This is the first time
  the registry is edited, and it is allowed now because there is something
  behind the tile. 1.8.0 was explicitly forbidden from doing it.
- `routes/brands.$brandId.apps.$appId.tsx` renders `AssetLibraryView` for
  `appId === 'visual'`, from the real query. **`AssetLibraryView` was built to
  outlive the mockup and it does** — its props change from fixtures to query
  data and its layout does not.
- Real drop zone: `uploadBlob()` per file, then a `POST` per asset. The inert
  handler and its `console.log` go.
- Paste-a-URL beside it, sharing 2D's validation.
- Palette editing lands here — add, label, reorder (dnd-kit, as the guidelines
  editor already uses), mark proposed, copy hex, delete.
- Delete with blob cleanup **on the brand cascade only**, as 2B decided.

**Question 3 is settled here, and the mockup's answer is adopted:** the
`Visual guidelines` text section **survives** alongside the swatches, because on
screen in `rich` they did not read as duplicates — the section holds *rationale*
("references: the tiled floor, the awning"), the swatches hold *values*.
`SUGGESTED_SECTIONS` is unchanged. Its example body, which currently reads
*"Primary palette: neutral-first, one accent…"*, **is rewritten** to stop
prompting for hex values, since that is now a different control's job.

## 2F — verification and the live pass (+0)

**Not skippable.** This stage contains a migration, a new table and four routes.

- `pnpm typecheck` 9/9 · `lint` · `format:check` · `pnpm test` · a full
  `db:migrate` from empty against live Postgres, then the release migrator
  (`scripts/migrate.mjs`) — the path that broke v7/v8.
- Playwright over the real routes signed in: a brand with no assets (must be
  byte-identical to 1.7.0), two proposed colours, a twelve-colour ramp, an
  uploaded logo, a link logo, a dead link, and a full library. Both themes.
- **The 900px rail.** 1.7.0 logged it, 1.8.0 observed it and added two rows,
  and this stage adds a palette block to the same column. Third pass; fix it.
- Delete the assets scenarios from the demo picker. `demo.brand.assets.tsx` goes
  — the real page exists now. `demo.brand.tsx` stays for the research states.

**Ships as 1.10.0.**

---

# Stage 3 — Brand research

`brand-research-onboarding.md`'s Phases B–G, locked. Phase A shipped as Stage 1.

**The key is in hand**, so B0 runs first and nothing gates it.

## 3A — B0, the live spike (+0, no repo code)

**Before a single line of the adapter.** One key, one real brand, one real
report, in a scratch script outside the repo.

It answers four things, all of which later phases are built on:

1. **Does `POST /v1/async/sonar` still exist?** The docs carry a banner —
   *"Sonar Chat Completions is now Agent API"* — and the async endpoint sits on
   the older line. If it has migrated, that is one adapter file, discovered for
   an afternoon rather than after five phases.
2. **What does a real run cost?** Decision 10 cut Quick mode on the estimate of
   "tens of cents". This is the number that decision is prepared to be revised
   by. If Deep is unaffordable, Quick returns as a config value and a second
   enum member — not a rewrite, because the port keeps `model` as job input.
3. **Wall clock.** The 3–15 minute estimate sets the poll interval and the
   ticker's period.
4. **A real response body**, captured verbatim as the fixture every test from 3B
   on runs against.

**First physical step: `PERPLEXITY_API_KEY` into `.env`.** It is not there today.

**Acceptance:** a committed fixture under `packages/adapters/research/fixtures/`
and a short note in the completion record with the measured cost and duration.
If (1) fails, **stop and re-cut 3B** before writing it.

## 3B — the port and the fifth adapter (+10–14)

```ts
export interface ResearchProvider {
  start(req: ResearchRequest): Promise<{ externalId: string }>
  poll(externalId: string): Promise<ResearchJobState>
}
```

- `PerplexityResearchProvider` — against 3A's fixture. `idempotency_key` is the
  **job id**, so a retried start cannot double-bill.
- `NoopResearchProvider` — `RESEARCH_PROVIDER=none`, **the default**. Every
  self-hoster without a key gets the feature *absent and explained*, never
  broken, and the absence is the callback gate in the invariant section above.
- Env: `RESEARCH_PROVIDER`, `PERPLEXITY_API_KEY`, `RESEARCH_MODEL`,
  `RESEARCH_MAX_ACTIVE_PER_WORKSPACE`, `RESEARCH_MAX_JOBS_PER_DAY`.
  All five into `.env.example` in the same commit — `env.example.test.ts` fails
  the build otherwise, which is the guard working as designed.
- Key stays in env. **Repo-wide** locked decision 9 (not this document's 9).
- `packages/shared/src/research/*`, then **delete `src/demo/researchTypes.ts`**
  and repoint its 6 importers. Same acceptance as 2A: import lines only.

## 3C — the job: table, routes, lifecycle (+16–20)

**Migration 0005.** `brand_research_jobs(id, brand_id, status, provider, model,
input jsonb, external_id, report text, citations jsonb, drafts jsonb, error,
created_by, created_at, started_at, completed_at)`.

- `POST /brands/:id/research` → 201. Serves **both** entry points of decision 1
  from one handler, which is why re-run costs nothing extra.
- `GET /brands/:id/research/:jobId` · `GET /brands/:id/research` (latest).
- **Three guards, all before the outbound call**, because that is the only place
  enforcement is worth anything:
  - one active job per brand — **in the table, not process memory**, unlike
    `AgentConcurrencyGuard`, because the job outlives the request;
  - `RESEARCH_MAX_ACTIVE_PER_WORKSPACE`;
  - `RESEARCH_MAX_JOBS_PER_DAY` per workspace (decision 12 — the only guard here
    that protects money rather than data, and money is the one resource with no
    undo).
- **The hard URL gate** (decision 4): no `website_url` → 400. A deep pass over
  the bare string "Casa Vostra" finds *a* Casa Vostra and writes a confident,
  cited, entirely wrong profile.
- `packages/server/src/research/ticker.ts` — in-process, plus
  **reconcile-on-read**, so a restart mid-job does not strand it in
  `IN_PROGRESS` forever. **Single-instance**, which adds no new constraint
  (`native-ws` already pins us to one) but is written down so it is not
  rediscovered during a scale-out.
- Terminal states are terminal: `COMPLETED`, `FAILED`, `NO_FINDINGS`,
  `CANCELLED`.
- Web: `api/queries/research.ts`, polling on a 5s `refetchInterval` **only while
  in flight**. The route owns it and passes `research` + `onStartResearch` down;
  the rail stays presentational and its tests keep rendering from props alone.

## 3D — the shaping pass (+8–12)

`packages/agent/src/research/shape.ts` —
`shapeResearchIntoSections(report, citations)`. `generateObject` against a zod
schema of `{ label, markdown, sources[] }[]`, on **the workspace's own configured
model** via `resolveLLMSettings`, not on the search vendor.

Prompted to prefer `SUGGESTED_SECTIONS` labels, to quote the brand's own words
where the report gives them, and to **omit a section rather than invent one**.
Output is stored on the job as `drafts` and **never** written to
`guideline_sections` from here.

Now that Stage 2 has shipped, the prompt is told **not to write hex values into
`Visual guidelines`** — 2E gave colours a control, and a machine writing them
back as prose is precisely the two-places-for-one-fact failure this product
opens by describing.

## 3E — landing the drafts (+18–24)

Two paths off one condition, evaluated **when the drafts land** — not at
submission. Deep research runs 3–15 minutes, which is ample time to start typing
a Voice section by hand.

**E1 — the empty brand: populate on arrival.** A **fourth, headless** TipTap
instance from `defaultExtensions` parses each draft, `getJSON()` gives the
`ProseMirrorDoc`, one `useUpdateBrandGuidelines` call saves the list with
`createdBy: 'agent'` — which Stage 1B made expressible, and which is the enum
value's first producer. Toast: what was added, from how many sources, **Undo**.

Undo writes the empty list back through the same mutation and **no-ops if the
section list changed underneath it**. That test is not optional: an Undo firing
against an edited brand is the exact wipe decision 8 exists to prevent.

**E2 — the non-empty brand: the review sheet.** `ResearchReviewSheet` already
exists, from fixtures; it gets real drafts. *Accept selected* is
`setStaged(...)` + `setEditOpen(true)` — the `staged` channel
`EditGuidelinesDialog` has forwarded since 1.5.0 and this surface has never used.

**`staged` widens from one `CapturePayload` to an ordered list of
`{ label, payload }`.** This is the one real change to 1.5.0 code: one
*behavioural* change in `BrandGuidelinesEditor` and two **pure type
pass-throughs** in `EditGuidelinesDialog` and `BrandContextPane`. Widening the
editor without widening both forwarders will not compile, which is the good kind
of coupling.

**The StrictMode guards must be preserved per-item.** `consumedStagedRef` and
`insertedRef` key on payload *identity* today. 1.5.0 Phase G is on record about
what happens when they are not: every captured message pasted twice, invisible in
production builds and unmissable in dev. Extend the existing test per-item.

**The boundary test:** a job that completes while the user has typed one section
must take E2, not E1.

## 3F — the report joins the conversation (+6–8)

The full report lands as the first `assistant` message of a **newly created**
brand-context thread named for the run — `Brand research — Casa Vostra, 29 Jul
2026` (decision 11). `createProjectWithCanvas` + `appendAgentMessage`, both of
which ship.

Capture — whole message, excerpt, drag — works on it **immediately and by
construction**, because nothing about the 1.5.0 gesture is specific to how a
message got there. The phase's real deliverable is the test that pins exactly
that, plus: `routes/agent.ts` re-reads `listAgentMessages` on every turn, so the
next thing you say to the interviewer is answered against the research for free.

Appending to an existing thread is rejected precedent, already written into
`brands.$brandId.context.tsx`: *"'resume the most recent' is wrong the first time
you want a fresh line of thinking."*

## 3G — verification, the live pass, and the demolition (+0)

**Not skippable, and the exemption 1.5.0 used does not apply.** That skip rested
on *"no migration, no new table, no schema change, no new API route"*. This stage
has a migration, a new table, three routes, an outbound paid vendor call and a
background job. Every clause is false here.

- Real Postgres, real key, real brand, watched from submission through review to
  a saved section. Then the same on an **empty** brand, for E1's auto-populate
  and its Undo.
- `RESEARCH_PROVIDER=none` boots clean and the rail shows **no research row**.
- **The deferred debts this pass inherits and should discharge:** 1.6.0's brand
  switcher (still never screenshotted — 1.8.0's demo route had no auth, so the
  pills returned `null`), long-name truncation, and menu placement at 30+ brands.
- **The demolition, as a checklist:** delete `src/demo/`, `routes/demo.brand.tsx`,
  the `import.meta.env.DEV` ternary and both `/* @__PURE__ */` annotations in
  `router.tsx`. Then `grep -rn "src/demo" packages/web/src` → zero, and
  `pnpm --filter @brandfactory/web build && grep -c demo dist/assets/*.js` → zero.

**Ships as 1.11.0.**

---

## Files

**New:** `packages/shared/src/asset/*` · `packages/shared/src/research/*` ·
`packages/db/src/schema/brand_assets.ts` ·
`packages/db/src/schema/brand_research_jobs.ts` ·
`packages/db/src/queries/{assets,research}.ts` · migrations **0003, 0004, 0005** ·
`packages/adapters/research/*` (the fifth adapter) ·
`packages/server/src/routes/{assets,research}.ts` ·
`packages/server/src/research/ticker.ts` · `packages/agent/src/research/shape.ts` ·
`packages/web/src/api/queries/{assets,research}.ts`

**Modified:** `schema/brands.ts` + mappers + `queries/brands.ts`
(`listBlobKeysByBrand` widens) · `shared/brand/{brand,create,update,summary}.ts` ·
`shared/brand/update-guidelines.ts` (`createdBy`) · `routes/brands.ts` (stops
synthesising `'user'`) · `server/src/{env,adapters,app}.ts` · `.env.example` ·
`miniApps.ts` (`visual.enabled` → true, **2E only**) ·
`routes/{brands.$brandId,brands.$brandId.apps.$appId,workspaces.$wsId.index}.tsx` ·
`BrandHubView` · `BrandContextRail` (loses `railVariant`) · `BrandIdentity` ·
`BrandMark` · `AssetLibraryView` · `ResearchReviewSheet` ·
`BrandGuidelinesEditor` (`staged` → list, sends `createdBy`) ·
`EditGuidelinesDialog` + `BrandContextPane` (type pass-through only) ·
`RenameDialog` · `BrandCard` · `router.tsx`

**Deleted:** `src/demo/assetTypes.ts` (2A) · `src/demo/researchTypes.ts` (3B) ·
`routes/demo.brand.assets.tsx` (2F) · `src/demo/` + `routes/demo.brand.tsx` (3G)

**Unchanged on purpose:** `packages/web/src/editor/proseMirrorSchema.ts`. The
headless auto-populate instance imports `defaultExtensions` as-is. If this file
has to change to accommodate research, the design has gone wrong — and it does
not need to: `Link` is enabled, verified against the installed
`@tiptap/starter-kit` 3.22.4 rather than inferred from its version.

---

## Non-goals

Inherited from both source documents, restated because a plan that drops them
quietly is a plan that grows them back.

- **Extracting a palette from an uploaded logo**, and any vision-model path over
  brand images. Plausible; a different pass.
- **Figma / Drive / Dropbox sync.** Storing a URL is a bookmark with a role, and
  that is the entire point. Sync is a specialist domain (`vision.md:76`).
- **Rewriting share URLs** into `?raw=1` forms. Per-provider guesswork that
  breaks silently. 2D tells the user instead.
- **Link health-checking.** No background crawler. No proxying external bytes.
- **Versioning assets.** Last write wins, as everywhere else in this repo.
- **A `collection` column.** Finding 5, deferred deliberately.
- **A Quick research mode.** Decision 10 — unless 3A's measurement demands it,
  in which case it is a config value and an enum member.
- **A second research provider.** Decision 5. The port exists for
  *replaceability*, not for shipping two against a churning vendor surface.
- **Research writing guidelines directly, or scraping anything ourselves.** Not
  scope cuts — the point.
- **Persisting the vendor key in Postgres.** Repo-wide decision 9 stands.
- **Multi-instance ticker safety.** Recorded (advisory lock or claim column), not
  scheduled.

---

## Risks

| Risk | Mitigation |
| --- | --- |
| **The CHECK constraint gets dropped by the next `db:generate`** | It is hand-authored into 0004 **and** declared as `check()` on the Drizzle table. A test inserts a violating row and expects it to fire — an unfired CHECK may not exist |
| **Asset blobs leak on brand delete** | `listBlobKeysByBrand` widens in 2A, in the same phase as the table, filtered to `source = 'blob'`. A `link` row owns no bytes and must not be swept |
| **Every research click costs real money** | Opt-in · estimate shown before Create · one active job per brand · per-workspace active cap · **per-workspace daily cap** · all three enforced before the outbound call · 3A measures the real number first |
| **Vendor surface is migrating** (Agent API) | The port, and a live spike **before** anything is built on it. One file to swap |
| **Confabulated brand profiles** | Hard URL gate · citations on every draft · a real `NO_FINDINGS` state · nothing auto-saves on a non-empty brand, and on an empty one a wrong draft costs an Undo, never existing work |
| **Auto-populate saves without you pressing Save** | Gated on *zero* sections, checked when drafts land not when the job starts; Undo in the toast; **Undo no-ops if the list moved** |
| **`staged` widening touches 1.5.0 code** | The StrictMode double-insert bug lived in exactly this path. Its test comes with us, extended per-item |
| **The demo rots into a second source of truth** | The mirrored types die at the first opportunity (2A, 3B), not at the end. From 2A the fixtures are typed against the shipped schema, so a stale fixture fails to compile |
| **Repointing 13 importers churns the tests** | Acceptance criterion on 2A: **import lines only**. A changed test body means the shared type is not the mirror the mockup claimed, and that is a finding, not a fix-up |
| **Rollback is no longer free** | Three migrations, all additive (one column, two tables), so the previous image tolerates them. **Stated in the release notes rather than assumed** |
| **Turning `visual.enabled` on early** | Forbidden until 2E, when there is a page behind it. 1.8.0 was forbidden it outright; this is the phase that earns it |
| **Stage 3 is cancelled midway** | Stage boundaries are release boundaries. 1.9.0 and 1.10.0 stand alone; 3A's cost measurement is the natural place to decide whether 3B–3G happen at all |

---

## What this plan does not settle

- **Does the agent see colours?** Assets question 1 proposed *colours yes, images
  no*, in a later pass. Nothing here adds an asset to `buildSystemPrompt`, and
  3D's prompt is told to stop writing hex into prose — so after Stage 3 a brand's
  colours are structured data the agent **cannot read**. That is a real gap and
  it is the obvious next pass; it is out of scope here because it changes what
  every generation is conditioned on and deserves its own review.
- **Quota.** `BLOB_MAX_BYTES` bounds one upload; nothing bounds a brand
  (question 5). Unchanged by this plan and worth a number before real use.
- **Whether the rail palette block's heading link earns its place.** Decided
  above with an alternative named; 2F's live pass is where to look at it.
