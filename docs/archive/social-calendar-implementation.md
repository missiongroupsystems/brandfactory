# Social calendar — phased implementation plan

**Status:** ready to execute, 2026-08-03. Companion to
[`social-calendar.md`](social-calendar.md) (the proposal — all design
rationale lives there; this file is the ordered task list). Written against
`main` at **1.18.1** (1054 passed | 49 skipped).

**Preflight verification (done while writing this plan):**

- Migrations live in `packages/db/drizzle/`, highest is **0007** — the
  guideline-section-autofill work that claims 0008 has **not landed its
  migration yet**. See the sequencing gate in Phase 2. *(Superseded 2026-08-03:
  autofill's Phase C landed `0008_sour_mister_sinister.sql` —
  `section_autofill_events`. The gate below is resolved; this stream generates
  as 0009.)*
- `miniApps.ts` `social` row is the expected Soon stub
  (`packages/web/src/components/brand/miniApps.ts:136`).
- No `ui/textarea.tsx` exists — it is genuinely new.
- `packages/shared/src/asset/`, `routes/assets.ts`, `api/queries/assets.ts`,
  `VisualIdentityPage`/`AssetLibraryView` all exist as the proposal's
  templates.

**Working rules for every phase:**

- The brand assets vertical slice (1.10.0) is the structural template; when
  in doubt, mirror the corresponding asset file line-for-line.
- Each phase ends with the full verification block (§ Verification below)
  green before moving on.
- Commit per phase, except Phase 7 which is **one commit** by design.
- No imports from `toolcraft/`; CI tokens and sentence case throughout.

---

## Phase 1 — Shared wire types (`packages/shared`)

*Proposal §2. No dependencies; safe to start immediately.*

- [x] 1.1 `src/ids.ts`: add `SocialPostIdSchema = brandedId('SocialPostId')`
      + exported type.
- [x] 1.2 New `src/social/post.ts`:
      `SocialPlatformSchema` (`instagram | facebook | tiktok | linkedin | x |
      youtube | pinterest | other`), `SocialPostStatusSchema`
      (`draft | ready | posted`), `SocialPostSchema` exactly as proposal §2
      (nullable `scheduledAt`, `body` max 5000, `assetIds` max 20 ordered).
- [x] 1.3 Same file: pure sort helper — unscheduled group first, scheduled by
      ISO `localeCompare`.
- [x] 1.4 New `src/social/create.ts`: `CreateSocialPostInputSchema`
      (`platform` required; `scheduledAt`, `body`, `status`, `assetIds`
      optional — server defaults documented in the schema comment).
- [x] 1.5 New `src/social/update.ts`: `UpdateSocialPostInputSchema` — every
      key optional, `.refine` rejects `{}`, `scheduledAt` nullable-patchable,
      `assetIds` full replacement, no `deletedAt` key.
- [x] 1.6 Re-export as a `// Social posts` block from `src/index.ts`.
- [x] 1.7 Tests `src/social/post.test.ts` (+ siblings, mirroring
      `asset.test.ts`): enum members, `{}` patch rejection, nullable
      `scheduledAt` round-trip, `body`/`assetIds` maxes, sort helper
      (unscheduled first, ISO ordering).

**Done when:** `pnpm typecheck` + shared tests green; no other package
touched.

## Phase 2 — DB schema, migration, queries (`packages/db`)

*Proposal §1 + §3. Depends on Phase 1 (mapper imports the shared schema).*

**⛔ Migration sequencing gate:** the proposal reserves **0008** for
guideline-section-autofill's `section_autofill_events`. Before generating:
check `packages/db/drizzle/` for a 0008. If autofill's migration has landed,
`db:generate` here yields 0009 as planned. If it has **not** landed, decide
explicitly with the user: either wait, or take 0008 for social posts and
release autofill from its claim (updating that doc). Do not generate blind.

**Gate decision (user, 2026-08-03): wait.** Autofill keeps its claim on
0008; this stream stays paused at Phase 2 until `0008_*.sql` lands in
`packages/db/drizzle/`, then generates as **0009**. (At decision time the
directory topped out at 0007 — re-verify before generating.)

**Gate resolved (2026-08-03, later the same day):** autofill's Phase C landed
`0008_sour_mister_sinister.sql` (`section_autofill_events`) — see
[`docs/completions/guideline-autofill-phase-c-table-service-route.md`](../completions/guideline-autofill-phase-c-table-service-route.md).
This stream is unblocked; `db:generate` on current `main` yields **0009**.

- [x] 2.1 New `src/schema/social_posts.ts`: `social_platform` +
      `social_post_status` pgEnums (members duplicated with zod, per
      convention); `social_posts` table per proposal §1 — all timestamps
      `{ withTimezone: true, mode: 'string' }`; partial index
      `(brand_id, scheduled_at) WHERE deleted_at IS NULL`.
- [x] 2.2 Same file: `social_post_assets` — PK `(post_id, asset_id)`,
      `position integer not null`, index on `asset_id`, both FKs cascade.
- [x] 2.3 Register both in `src/schema/index.ts`.
- [x] 2.4 Generate migration: `pnpm --filter @brandfactory/db db:generate`
      (never hand-numbered). Review the SQL: enums, cascades, partial index.
- [x] 2.5 `src/mappers.ts`: `rowToSocialPost(row, assetIds)` — every
      timestamp through `toIsoTimestamp` / `toIsoTimestampOrNull`.
- [x] 2.6 New `src/queries/social-posts.ts` (model: `queries/assets.ts`,
      dumb CRUD):
      - `listSocialPostsByBrand` — active rows,
        `scheduled_at asc nulls first, created_at asc`; second select over
        join rows ordered by `position`, grouped in JS.
      - `createSocialPost` — transaction; asset ownership + not-soft-deleted
        check (miss → typed error for the route's 400); join rows at
        `position = (i + 1) * 100`.
      - `updateSocialPost` — transaction; scoped
        `and(eq(id), eq(brandId), isNull(deletedAt))`, `updatedAt: now()`;
        `assetIds !== undefined` → re-validate then delete + reinsert joins;
        `null` on miss; spread-conditional patch keys.
      - `softDeleteSocialPost` / `restoreSocialPost` — exact copies of the
        asset pair's scoping (double delete 404s, replayed restore inert);
        join rows untouched.
- [x] 2.7 Export from `db/src/index.ts`.
- [x] 2.8 Live suite `src/social-posts.live.test.ts`
      (`describe.skipIf(!process.env.DATABASE_URL)`): mapper round-trips
      `SocialPostSchema.safeParse` incl. null `scheduledAt`; cross-brand
      `assetId` rejected; join rows cascade on hard brand delete.

**Done when:** full verification green (live suite skips without
`DATABASE_URL`); migration file reviewed and committed with the schema.

## Phase 3 — Server facade, router, route tests (`packages/server`)

*Proposal §4. Depends on Phase 2.*

- [x] 3.1 `src/db.ts`: the five queries join the `Db` interface +
      `buildDbDeps()`.
- [x] 3.2 `src/test-helpers.ts`: in-memory fake gains `socialPosts`
      (`assetIds` inline). **Mirror real scoping exactly**: brand-scoped
      writes, `deletedAt IS NULL` filters, asset-ownership check against
      `state.assets` (incl. soft-deleted assets rejected).
- [x] 3.3 New `src/routes/social-posts.ts` —
      `createSocialPostsRouter(deps: { db: Db })`; every handler
      `c.var.userId` guard → `requireBrandAccess` → `zValidator` (param
      schemas from branded ids). Endpoints per proposal §4 table:
      GET/POST collection, PATCH/DELETE `:postId`, POST `:postId/restore`.
      Error codes: `ASSET_NOT_IN_BRAND` (400), `SOCIAL_POST_NOT_FOUND` (404).
- [x] 3.4 Mount `.route('/brands', …)` in `app.ts` (auth middleware already
      applies). Re-check the router-degradation note: no literal segment
      beside a param sibling.
- [x] 3.5 Route tests `src/routes/social-posts.test.ts`, the full
      `assets.test.ts` matrix:
      - 401 every method; 403 cross-workspace every method; 404 unknown
        brand.
      - Validation 400s: empty patch, bad platform, cross-brand `assetIds`
        and soft-deleted `assetIds` on create **and** patch.
      - Patch semantics: omitted `assetIds` leaves attachments; `[]` clears;
        `scheduledAt: null` unschedules.
      - Cross-brand `postId` → 404; double delete → 404; restore + replayed
        restore → 404; attachment order round-trips.

**Done when:** full verification green. End of proposal Stage 1 — no
user-visible change; safe stopping point.

## Phase 4 — Web data layer (`packages/web`)

*Proposal §5 "Data layer". Depends on Phase 3 (typed RPC).*

- [x] 4.1 `api/queries/brands.ts`: `brandKeys.socialPosts(brandId) =
      ['brands', brandId, 'social-posts']`.
- [x] 4.2 New `api/queries/social-posts.ts` (model: `assets.ts`):
      `useBrandSocialPosts`; exported `applySocialPostToCache`
      (insert-or-replace, drop when `deletedAt`, then **re-sort** via the
      shared sort helper); `useCreateSocialPost`, `useUpdateSocialPost`,
      `useDeleteSocialPost`, `useRestoreSocialPost` — all through
      `api.brands[':id']['social-posts']` + `callJson`.
- [x] 4.3 Tests `api/queries/social-posts.test.ts`: applier insert /
      replace / drop / re-sort (a patched post moves in the ordering).

## Phase 5 — Pure pieces: calendar lib, textarea, dialog, list

*Proposal §5 "Components", lower half. Depends on Phase 1 (types) + 4
(mutation shapes for the dialog's submit payloads). Still dark — nothing
reachable from the registry.*

- [x] 5.1 New `lib/calendar.ts` (native `Date` + `Intl` only, no date
      library): `monthGridDays(year, month)` Monday-start padded to full
      weeks; `localDayKey(date)`; `groupByDay(posts)`; local date/time
      inputs ↔ ISO UTC converters.
- [x] 5.2 `lib/calendar.test.ts`: month boundaries (Jan/Dec wrap, Feb leap),
      DST-adjacent days, Monday start, day-key grouping of UTC timestamps.
- [x] 5.3 New `components/ui/textarea.tsx`, shadcn-style, matching the
      existing `input.tsx` token treatment.
- [x] 5.4 New `components/brand/PostEditorDialog.tsx` (create + edit):
      NewBrandDialog house style (controlled-or-uncontrolled, plain
      `useState` fields, `<form id>` + footer submit, inline aria-wired
      errors); RenameDialog's conditional-mount re-seeding for edit. Fields
      per proposal §5: platform `<Select>`; clearable date + time inputs
      (cleared → unscheduled); body `<Textarea>`; status `<Select>` (edit
      variant); attachments — ordered thumbs with detach, "Add from library"
      inline image grid, "Upload" → callback prop (upload wiring is the
      Page's job in Phase 6).
- [x] 5.5 New `components/brand/SocialPostList.tsx` (pure): "Unscheduled"
      tray first, then day-grouped rows — Upcoming then Past; row = time,
      platform, status pill, excerpt, attachment thumbnails, dropdown-menu
      (Edit / Mark posted / Delete). Injectable `now`.
- [x] 5.6 Tests for both components, no-mock `AssetLibraryView.test.tsx`
      style: dialog validation (platform required, body max, date/time
      clearing), edit re-seeding, attachment ordering + detach; list
      grouping, tray, Upcoming/Past split, menu callbacks.

**Done when:** full verification green. End of proposal Stage 2; safe
stopping point.

## Phase 6 — Assembly: grid, view, page

*Proposal §5, upper half. Depends on Phases 4 + 5.*

- [x] 6.1 New `components/brand/CalendarMonthGrid.tsx` (pure): ‹ prev |
      Month YYYY | next › + Today; Monday-start weekday row; `grid-cols-7`
      day cells; compact chips (platform + HH:mm + excerpt; platform name
      when body `''`); chip click → `onEditPost(post)`; empty cell click →
      `onNewPost(dayKey)`; injectable `now`; scheduled posts only, header
      notes "N unscheduled" → list view.
- [x] 6.2 New `components/brand/SocialCalendarView.tsx` (pure):
      `PageHeader` with segmented view toggle (Button primitives,
      `aria-pressed`, active `variant="secondary"` — not radix tabs) +
      "New post"; dispatches to grid or list; mounts the dialog.
- [x] 6.3 New `components/brand/SocialCalendarPage.tsx` (data half, model:
      `VisualIdentityPage`): `useBrand`, `useBrandSocialPosts`,
      `useBrandAssets`, the four mutations; `uploadBlob` → `useCreateAsset`
      (upload lands in the library) → id appended to dialog state;
      `useSignedReadUrls(blobKeys)` for thumbnails; delete via sonner Undo
      toast → restore (no confirm dialog); `view` + `{year, month}` local
      `useState`; dialog open/seed state ("New post" header → today 09:00;
      empty cell → that day 09:00).
- [x] 6.4 Tests: `CalendarMonthGrid` no-mock (fixed `now` — grid geometry,
      chip content, empty-state, month nav callbacks);
      `SocialCalendarView` no-mock (toggle semantics, dispatch);
      `SocialCalendarPage` with the view stubbed one-button-per-callback
      (`VisualIdentityPage.test.tsx` model — create/edit/delete+undo/upload
      flows against mocked queries).

**Done when:** full verification green. Everything exists but nothing is
reachable — the registry still says Soon.

## Phase 7 — Registry flip + dispatch + nav — ONE commit

*Proposal §5 "Registry, dispatch, nav" + §6. Depends on Phase 6. The
dispatch keys off `unit` and the Soon stub keys off `enabled`; splitting
these ships a half-state, so 7.1–7.6 land together.*

- [x] 7.1 `components/brand/miniApps.ts`: `MiniApp.unit` union gains
      `'post'` (doc comment gains its fourth answer); `social` row flips to
      `enabled: true, unit: 'post'`; `create`/`match` retained for
      classification only, with the `visual` row's comment.
- [x] 7.2 `routes/brands.$brandId.apps.$appId.tsx`: fourth branch —
      `if (app.unit === 'post') return <SocialCalendarPage …/>`; header
      comment updated.
- [x] 7.3 `components/nav/BrandNavPanel.tsx`:
      `useBrandSocialPosts(brandId)` beside the unconditional
      `useBrandAssets`; `countOf` arm `if (app.unit === 'post') return
      posts?.length ?? null`.
- [x] 7.4 Update `routes/brands.$brandId.apps.$appId.test.tsx`: Soon-stub
      cases become "dispatches to SocialCalendarPage" (mock the page
      module); rewrite or retire the stub describe block (no
      `enabled: false` tile app remains).
- [x] 7.5 Update `nav/BrandNavPanel.test.tsx`: Soon-badge assertion
      inverts; `useBrandSocialPosts` joins the mocks; post-count case
      added.
- [x] 7.6 Update `brand/miniApps.test.ts`: social row enabled/unit
      expectations.

**Done when:** full verification green; the tile opens the calendar; nav
counts posts; no Soon badge.

## Phase 8 — Changelog and wrap-up

- [ ] 8.1 `docs/changelog.md`: new minor version entry, house style — index
      line + full write-up with before/after test counts and the standing
      "no live pass" caveat (chip and grid geometry tuned on theory).
- [ ] 8.2 Move `docs/executing/social-calendar.md` + this file's status
      forward (or archive per the brand-hub precedent) once shipped.
- [ ] 8.3 Confirm proposal §9 "Noted, not done" items are still recorded as
      future work (drag-and-drop, week view, URL state, brand timezone,
      past-due highlighting, soft-deleted-asset warning, publishing,
      agent chat).

---

## Verification (every phase)

```
pnpm typecheck
pnpm lint / format:check
pnpm test                        # db live suites skip without DATABASE_URL
pnpm -F @brandfactory/web build
```

Live-Postgres suites need `docker/compose.yaml` up; consistent with recent
releases, no live pass is expected in this environment.

## Dependency graph

```
Phase 1 (shared) ──→ Phase 2 (db) ──→ Phase 3 (server) ──→ Phase 4 (web data)
                                                                  │
Phase 5 (pure pieces; needs 1, submit payloads from 4) ←──────────┤
                                                                  ▼
                                    Phase 6 (assembly) ──→ Phase 7 (flip, 1 commit) ──→ Phase 8
```

Safe stopping points after Phases 3, 5, and 6 — everything before Phase 7 is
dark.
