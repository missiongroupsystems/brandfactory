# Social calendar — proposal and implementation plan

**Status:** proposal, 2026-08-03. Written against `main` at **1.18.1** (1054
passed | 49 skipped; the skips are the live-Postgres suites).

**The ask, verbatim intent:** the `Social calendar` tile — `enabled: false`
since the registry was built, a "Soon" stub — becomes a real surface: a simple
page with a calendar view and a chronological list view, where the marketing
team lists out, for the selected brand, *what* will be posted, *on which
platform*, *at which time*, *with which assets/videos/photos*, and *what copy*.
It does not integrate with the actual platforms — it is a conceptual scheduling
tool. The plan is the product.

**Decisions confirmed with the user before this plan was written:**

- **One calendar per brand.** The tile opens the calendar directly, the way
  Visual identity opens the asset library — not a list of calendar threads.
  This deliberately departs from `docs/vision.md:39`, which framed the calendar
  as a standardized project with agent chat; the user chose the simpler shape.
- **Manual planner first.** No agent chat in v1.
- **Assets come from the library, plus direct upload.** A post attaches assets
  from the brand's existing asset library, and the post editor can upload new
  files — which land in that same library (upload → `brand_assets` row →
  attach), so the library stays the single asset surface.
- **Unscheduled posts are allowed.** `scheduledAt` is nullable; ideas without a
  slot live in an "Unscheduled" tray in the list view.
- **No title/label field.** The copy is the artifact; chips and rows show
  platform + time + a body excerpt.

Out of scope for v1, noted as future work at the end: drag-and-drop
rescheduling, week view, platform publishing (see
`docs/refs/socialmedia-connectors.md`).

The structural template throughout is the **brand assets vertical slice**
(shipped 1.10.0): shared zod module → drizzle table + migration → brand-scoped
Hono router behind `requireBrandAccess` → react-query module with cache
appliers → Page/View split → registry row.

---

## 1. Data model

Two tables, one aggregate. Migration generated with
`pnpm --filter @brandfactory/db db:generate` → `0009_*.sql` (never
hand-numbered; **0008 is claimed** by the in-flight guideline-section-autofill
work's `section_autofill_events` — generate this migration on a base that
already contains it. *Landed 2026-08-03 as `0008_sour_mister_sinister.sql`;
the base condition is now met.*).

**`social_posts`** — new `packages/db/src/schema/social_posts.ts`, registered
in `schema/index.ts`:

```
social_platform     pgEnum: instagram | facebook | tiktok | linkedin | x
                            | youtube | pinterest | other
social_post_status  pgEnum: draft | ready | posted

id           uuid pk default gen_random_uuid()
brand_id     uuid not null → brands.id ON DELETE cascade
platform     social_platform not null
scheduled_at timestamptz null            -- null = unscheduled (the tray)
body         text not null default ''    -- '' = slot claimed, copy pending
status       social_post_status not null default 'draft'
deleted_at   timestamptz null
created_at   timestamptz not null default now()
updated_at   timestamptz not null default now()

index (brand_id, scheduled_at) WHERE deleted_at IS NULL
```

All timestamp columns `{ withTimezone: true, mode: 'string' }`; no triggers —
the query layer sets `updatedAt: sql\`now()\`` on writes, per house convention.

**`social_post_assets`** — same schema file (same aggregate):

```
post_id   uuid not null → social_posts.id ON DELETE cascade
asset_id  uuid not null → brand_assets.id ON DELETE cascade
position  integer not null
PK (post_id, asset_id); index on asset_id
```

Why these shapes:

- **Join table, never blob columns.** Posts hold no `blobKey`s, so
  `listBlobKeysByBrand` and `listStillReferencedBlobKeys` need **no changes** —
  blob lifecycle stays entirely owned by `brand_assets`, and brand delete
  neither leaks nor over-deletes bytes.
- **Join rows survive asset soft-delete.** The client resolves `assetIds`
  against `useBrandAssets` (which excludes soft-deleted rows) and skips
  unresolved ids — so restoring an asset brings it back onto its posts for
  free, the same recoverability contract soft-delete has everywhere else.
- **`status` is manual.** `draft` = slot claimed; `ready` = approved as
  written; `posted` = the done-marker (set by a person — nothing publishes,
  nothing auto-flips when the time passes).
- **No CHECK constraints.** No invariant here spans columns; zod is the single
  enforcement point (the `brands.website_url` precedent, not the
  `brand_assets_source_exactly_one` one).

## 2. Shared wire types

New `packages/shared/src/social/` mirroring `src/asset/`, re-exported as a
`// Social posts` block from `src/index.ts`. `SocialPostIdSchema =
brandedId('SocialPostId')` joins `src/ids.ts`.

- `post.ts` — `SocialPlatformSchema` / `SocialPostStatusSchema` (member lists
  duplicated with the pgEnums, per convention) and:

  ```ts
  SocialPostSchema = z.object({
    id: SocialPostIdSchema,
    brandId: BrandIdSchema,
    platform: SocialPlatformSchema,
    scheduledAt: z.iso.datetime().nullable(),
    body: z.string().max(5000),
    status: SocialPostStatusSchema,
    assetIds: z.array(BrandAssetIdSchema).max(20),   // ordered
    deletedAt: z.iso.datetime().nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  ```

  Plus a pure sort helper (unscheduled as their own group; scheduled by ISO
  `localeCompare`, valid because mappers normalise to ISO UTC).
- `create.ts` — `CreateSocialPostInputSchema`:
  `{ platform, scheduledAt?, body?, status?, assetIds? }`; server defaults
  `body: ''`, `status: 'draft'`, `assetIds: []`, `scheduledAt: null`.
- `update.ts` — `UpdateSocialPostInputSchema`: every key optional, `.refine`
  rejects `{}`. `scheduledAt` is the one **nullable** patch key (`null` = move
  to unscheduled); `assetIds` is a **full replacement**, order = array order.
  `deletedAt` is never patchable — deletion is its own verb.

**Wire shape for attachments: ids, not rows.** The calendar page already loads
the full asset list (it needs the library for the picker and
`useSignedReadUrls` for thumbnails, exactly as `VisualIdentityPage` does), so
the post carries `assetIds` and the client joins via a `Map` — no second copy
of asset rows in cache for `applyAssetToCache` to miss.

## 3. DB queries and mapper

`packages/db/src/queries/social-posts.ts`, modeled line-for-line on
`queries/assets.ts` ("dumb CRUD, no business rules"), exported from
`db/src/index.ts`:

- `listSocialPostsByBrand(brandId)` — active rows ordered
  `scheduled_at asc nulls first, created_at asc`; a second select over the join
  rows for those posts ordered by `position`, grouped in JS. Two queries beat a
  JSON-agg join for readability at this scale.
- `createSocialPost(input)` — one `db.transaction`: verify every `assetId`
  belongs to this brand and is not soft-deleted (any miss → typed error the
  route converts to 400), insert the post, insert join rows with
  `position = (i + 1) * 100`.
- `updateSocialPost(brandId, id, patch)` — transaction; update scoped
  `and(eq(id), eq(brandId), isNull(deletedAt))` with `updatedAt: now()`; when
  `patch.assetIds !== undefined`, re-validate ownership then delete + reinsert
  the join rows. Returns `null` on miss (route → 404). Patch semantics:
  `undefined` leaves alone; spread-conditional keys, never `?? null`.
- `softDeleteSocialPost` / `restoreSocialPost` — exact copies of the asset
  pair's scoping: delete only matches `deletedAt IS NULL` (double delete 404s),
  restore only matches `IS NOT NULL` (replayed Undo is inert). Join rows are
  untouched, so restore brings attachments back intact.

`mappers.ts` gains `rowToSocialPost(row, assetIds)` — **every timestamp through
`toIsoTimestamp` / `toIsoTimestampOrNull`** or the row fails its own schema.

Live suite `packages/db/src/social-posts.live.test.ts`
(`describe.skipIf(!process.env.DATABASE_URL)`, seed + scratch cleanup): mapper
output round-trips `SocialPostSchema.safeParse` (including null
`scheduledAt`), cross-brand `assetId` is rejected, join rows cascade on hard
brand delete.

## 4. Server routes

`packages/server/src/routes/social-posts.ts` —
`createSocialPostsRouter(deps: { db: Db })`, mounted
`.route('/brands', …)` in `app.ts`; `/brands/*` auth middleware already
applies. Every handler: `c.var.userId` guard → `requireBrandAccess` →
`zValidator` with the shared schemas (param schemas from branded ids).

| Method | Path                                        | Notes |
| ------ | ------------------------------------------- | ----- |
| GET    | `/brands/:id/social-posts`                  | active list |
| POST   | `/brands/:id/social-posts`                  | 201; bad `assetIds` → 400 `ASSET_NOT_IN_BRAND` |
| PATCH  | `/brands/:id/social-posts/:postId`          | miss → 404 `SOCIAL_POST_NOT_FOUND` |
| DELETE | `/brands/:id/social-posts/:postId`          | soft delete; returns the row with `deletedAt` |
| POST   | `/brands/:id/social-posts/:postId/restore`  | only matches hidden rows |

**Router-degradation check** (the trap `routes/assets.ts` documents): under
this prefix the only siblings are `:postId` and `:postId/restore` — no literal
segment ever sits where a sibling has a param, so `RegExpRouter` compiles and
`/blob-urls/:key{.+}/read-url` stays alive. If a batch op is ever added, it is
spelled `PATCH` on the collection.

Facade: the five queries join the `Db` interface + `buildDbDeps()` in
`server/src/db.ts`, and the in-memory fake in `test-helpers.ts` gains
`socialPosts` (storing `assetIds` inline). The fake **must mirror the real
scoping rules** — brand-scoped writes, `deletedAt IS NULL`, the asset-ownership
check against `state.assets` — or route tests pass against a fake looser than
production.

Route tests, the standard matrix from `assets.test.ts`: 401 on every method;
403 cross-workspace on every method; 404 unknown brand; validation 400s (empty
patch, bad platform, cross-brand and soft-deleted `assetIds` on create *and*
patch); patch semantics (omitted `assetIds` leaves attachments, `[]` clears,
`scheduledAt: null` unschedules); cross-brand `postId` 404; double-delete 404;
restore + replayed-restore 404; attachment order round-trips.

## 5. Web

### Data layer

`brandKeys.socialPosts(brandId) = ['brands', brandId, 'social-posts']` in
`api/queries/brands.ts`; new `api/queries/social-posts.ts` mirroring
`api/queries/assets.ts`: `useBrandSocialPosts`, a standalone exported
`applySocialPostToCache` (insert-or-replace, drop when `deletedAt`, then
**re-sort** — unlike assets, a patched post moves in the ordering), and
`useCreate/useUpdate/useDelete/useRestoreSocialPost`, all through the typed RPC
`api.brands[':id']['social-posts']` + `callJson`.

### Registry, dispatch, nav — flipped in ONE commit

The dispatch keys off `unit` and the Soon stub keys off `enabled`; splitting
them ships a half-state.

- `components/brand/miniApps.ts` — `MiniApp.unit` union gains `'post'` (the
  doc comment gains its fourth answer: a collection of posts, counted like
  `'asset'`). The `social` row flips to `enabled: true, unit: 'post'`;
  `create`/`match` are retained for classification only, with the same comment
  the `visual` row carries — a legacy `templateId: 'social'` thread is still
  classified, but nothing creates one.
- `routes/brands.$brandId.apps.$appId.tsx` — a fourth branch beside
  `'asset'`/`'canvas'`: `if (app.unit === 'post') return <SocialCalendarPage
  brandId={brandId} app={app} />`; header comment updated.
- `components/nav/BrandNavPanel.tsx` — `useBrandSocialPosts(brandId)` beside
  the existing unconditional `useBrandAssets`, and a `countOf` arm:
  `if (app.unit === 'post') return posts?.length ?? null`. The Soon badge
  disappears with `enabled: true`; `NavItem`'s null-vs-number contract renders
  no `0` while loading. Tile pluralisation ("3 posts") comes free from `unit`.

### Components — Page/View split, `VisualIdentityPage` → `AssetLibraryView` as the model

```
components/brand/SocialCalendarPage.tsx     data half
  owns: useBrand, useBrandSocialPosts, useBrandAssets, the four mutations,
        uploadBlob → useCreateAsset (upload lands in the library),
        useSignedReadUrls(blobKeys) for thumbnails,
        delete via sonner Undo toast → restore (no confirm dialog),
        view ('calendar' | 'list') + {year, month} as local useState,
        dialog open/seed state
└─ components/brand/SocialCalendarView.tsx  pure
   ├─ PageHeader — action = segmented view toggle + "New post" Button
   ├─ view 'calendar' → CalendarMonthGrid.tsx (pure)
   │    ‹ prev | Month YYYY | next › | Today; Monday-start weekday row;
   │    grid-cols-7 day cells; posts as compact chips (platform + HH:mm +
   │    body excerpt, platform name when body is ''); click chip →
   │    onEditPost(post); click empty cell → onNewPost(dayKey);
   │    injectable `now` for tests (the formatRelativeTime precedent);
   │    scheduled posts only — header notes "N unscheduled" → list view
   ├─ view 'list' → SocialPostList.tsx (pure)
   │    "Unscheduled" tray first, then day-grouped chronological rows —
   │    Upcoming, then Past; row = time, platform, status pill, excerpt,
   │    attachment thumbnails, dropdown-menu (Edit / Mark posted / Delete)
   └─ PostEditorDialog.tsx (create + edit)
        NewBrandDialog house style (controlled-or-uncontrolled, plain
        useState fields, <form id> + footer submit, inline aria-wired
        errors); RenameDialog's conditional-mount re-seeding for edit.
        Fields: platform <Select>; optional date <Input type="date"> +
        time <Input type="time"> (clearable → unscheduled); body
        <Textarea> — NEW ui/textarea.tsx, shadcn-style; status <Select>
        (edit variant); attachments — ordered thumbs with detach,
        "Add from library" inline grid of the brand's image assets,
        "Upload" → uploadBlob → create asset → id appended to the
        dialog's assetIds state, attached on submit.
```

Decisions, with rationale:

- **View toggle = segmented control from existing Button primitives**
  (`aria-pressed`, active `variant="secondary"`). Not `@radix-ui/react-tabs`:
  a two-state toggle is not a tab-panel relationship and doesn't warrant a new
  dependency.
- **Toggle + month state are local `useState`.** No deep-linking requirement;
  a URL search param in the code-based router means a `validateSearch` schema
  for a preference that costs one click to restore. Future work.
- **"New post" pre-fill:** header button → today 09:00; empty day cell → that
  day 09:00; the date is clearable to create unscheduled.
- **Dates: no date library** (none exists in the monorepo — native `Date` +
  `Intl` only). New pure `lib/calendar.ts`: `monthGridDays(year, month)`
  (Monday-start, padded to full weeks), `localDayKey(date)`,
  `groupByDay(posts)`, local-inputs ↔ ISO converters. Wire timestamps are UTC
  ISO; display and grouping are browser-local via
  `Intl.DateTimeFormat('en-GB', …)`.
- **Upload-then-cancel** leaves the uploaded asset in the library unattached —
  acceptable by design: it is a library asset, not an orphan blob.
- **No imports from `toolcraft/`** (vendored, Studio-only, lazy-loaded —
  an eager import drags its runtime into the main bundle). CI tokens and
  sentence case throughout.

## 6. Existing tests that change

- `routes/brands.$brandId.apps.$appId.test.tsx` — the two `social` Soon-stub
  cases become "dispatches to SocialCalendarPage" (mock the page module); no
  `enabled: false` tile app remains, so the stub describe block is rewritten
  or retired.
- `nav/BrandNavPanel.test.tsx` — the Soon-badge-on-social assertion inverts;
  `useBrandSocialPosts` joins the mocks; a post-count case is added.
- `brand/miniApps.test.ts` — the social row's enabled/unit expectations.

New coverage: shared schema tests (enum members, `{}` patch rejection,
nullable `scheduledAt`, maxes); the server matrix (§4); the db live suite
(§3); `lib/calendar.ts` (month boundaries, DST-adjacent days, Monday start);
the cache applier (insert / replace / drop / re-sort); each pure view no-mock
(`AssetLibraryView.test.tsx` style); dialog validation; the page with the view
stubbed one-button-per-callback (`VisualIdentityPage.test.tsx` model).

## 7. Stages

1. **Contract + persistence + API** — shared `social/` module + branded id;
   schema + migration 0009; mapper + queries + live tests; `Db` facade + fakes
   + router + route tests. No user-visible change.
2. **Web data layer + pieces** — query key + module + applier test;
   `lib/calendar.ts` + tests; `ui/textarea.tsx`; `PostEditorDialog` +
   `SocialPostList` + tests. Still dark — nothing wired to the registry.
3. **Assembly + flip** — `CalendarMonthGrid`, `SocialCalendarView`,
   `SocialCalendarPage` + tests; registry flip + dispatch branch + nav arm in
   one commit; existing tests updated; changelog entry with test counts.

## 8. Verification, per stage

```
pnpm typecheck
pnpm lint / format:check
pnpm test                        # db live suites skip without DATABASE_URL
pnpm -F @brandfactory/web build
```

Live-Postgres suites need `docker/compose.yaml` up. Consistent with recent
releases, no live pass is expected in this environment — the chip and grid
geometry ships tuned on theory, and the changelog entry says so.

## 9. Noted, not done

- Drag-and-drop rescheduling (dnd-kit is already in the repo; the vision names
  "drag-and-drop scheduling of ideas into dates").
- Week view; URL-persisted view/month state.
- Brand-level timezone (v1 is viewer-local, stored UTC).
- Past-due highlighting for `ready` posts whose time has passed.
- A view-level warning when a post references a soft-deleted asset (v1
  silently hides the thumbnail until restore).
- Platform publishing / metrics integrations
  (`docs/refs/socialmedia-connectors.md`).
- Agent chat over the calendar (the vision's original framing).
