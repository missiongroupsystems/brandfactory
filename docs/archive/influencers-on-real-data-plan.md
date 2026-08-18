# Influencers on real data — plan

**Goal.** `/influencers` stops rendering nineteen rows out of `fixtures/influencers.ts` and
starts rendering the creators the Hono server holds. A creator becomes a BrandFactory
aggregate — its own table, its own routes, its own feature folder — with a page per creator
and a form that can add, correct and remove one.

Base: `main` at **1.39.0** — 2211 passed | 92 skipped. This is the second half of that
release, which replaced the *record* and left it unstored. Its completion note
([`../completions/influencers-by-reach.md`](../completions/influencers-by-reach.md)) says so
in as many words: *"the day a real backend arrives it is generated against this shape."*
This is that day.

The precedent throughout is **1.36.0**, which did the same thing one aggregate over:
[`../completions/outlets-on-real-data.md`](../completions/outlets-on-real-data.md). Where
this plan says nothing, assume outlets' answer.

## The question that prompted this, answered

*"A new influencer model, or a general contacts table if we have one?"*

**There is no general contacts table to reuse.** `/contacts` is the Operations Hub's address
book: `ContactRead`, snake_case, `vendor_id`, `is_primary`, typed off the frozen
`schema.d.ts`, answered from `lib/api/mock.ts`, and backed by a FastAPI service this
repository does not contain. It is not ours to extend and it is still live — `useContactMutations`
runs on the tenancy intake sheet and the review queue, both creating a person against a vendor,
which is a correct model for a landlord's site manager.

BrandFactory's own schema holds fifteen tables and **no person record at all**.

So a new table, and deliberately not a general one. Building a `contacts` table wide enough to
hold both a landlord's site manager and a creator's follower count would rebuild the exact
record 1.39.0 spent a release taking apart: a shape whose columns belong to somebody else's
domain, with the six fields an influencer is actually chosen by bolted on the side. A creator
is not a contact with extra columns. It is a different noun.

## What the ask turned out to cost

Each gap verified against the code, not assumed.

| Gap | Evidence |
| --- | --- |
| **No table, no route, no query** | `packages/db/src/schema/` has fifteen files and none is a person. `packages/server/src/routes/` has no influencer module. `app.ts` mounts nothing at that path. |
| **The type is a declared fake** | `Influencer` is hand-written in `lib/api/types.ts`, snake_case, with a docstring saying it is safe *only* because no server exists to refuse a field. It has to move to `@brandfactory/shared` and change case. |
| **`brand_ids` points at the wrong brands** | The fixture's four brands are `fixtures/brands.ts` — the Operations Hub's invented F&B group, resolved through `useBrandIndex`. Real rows point at real workspace brands, so the screen's index has to swap to `useWorkspaceBrands`. |
| **The list is paginated and the counts are not totals** | `useInfluencerPages` wraps `useSWRInfinite` against `mock.ts`' `page()`. The tier bands carry counts, so the screen renders an honesty note — *"Showing the first N creators — bands below may be incomplete."* The real route returns one array and that note goes. |
| **No write path at all** | `hooks.ts` has no `useInfluencerMutations`, and says so: *"It arrives with the route, not before it."* |

## Settled before the first line

Two with the user, the rest from the code. Nothing below re-opens them.

| | |
| --- | --- |
| Write surface | **Full CRUD.** Add, edit and delete a creator from the screen. It is the only option where the table can hold a row in production — a seed and an import that does not exist yet are not a filling mechanism. |
| Detail page | **Yes**, `/influencers/[slug]`, on the outlets shape: a slug column, a `getByRef` query, a second cache scope. |
| Scope | **Workspace-scoped with a brand relation**, not brand-scoped. The screen filters *by* brand, which is not a question a list holding one brand can answer, and a prospect nobody has booked has no brand at all. Outlets' argument, unchanged. |
| Brand relation | **A join table, not a `uuid[]` column.** See below — this is the one place the shape genuinely departs from outlets. |
| Reach tiers | **Stay in `packages/web-next`.** `features/influencers/tiers.ts` is pure derivation from `followers` and nothing server-side needs a tier. Moving it to `shared` would be churn for symmetry. |
| Ops fixtures | `fixtures/influencers.ts` goes. **`fixtures/agencies.ts` and `fixtures/contracts.ts` do not** — six of the sixteen contracts name those agencies as counterparties, by name. |

### Why the brand link is a join table

`brandIds` is multi-valued: a creator can work for two of the group's brands, and an empty
array is a fact ("not engaged yet") rather than a gap. Outlets carry one nullable `brand_id`,
so this is the first many-to-many between a brand and anything.

A `uuid[]` column cannot carry a foreign key. Delete a brand and every array holding its id
keeps holding it — and `resolveBrandNames` in `brand-names-cell.tsx` renders an id it cannot
resolve as `…`, because *"a cached index that has not arrived is a pending request, never a
missing fact"*. A dangling id and a request in flight would look identical, permanently, in the
one cell that rule exists to protect.

So: `influencer_brands (influencer_id, brand_id)`, both sides `ON DELETE CASCADE`. Deleting a
brand removes the **link** and keeps the creator — which is the many-to-many equivalent of the
`ON DELETE SET NULL` outlets chose, and for the same reason: the relationship outlives the
branding.

## The shape

### The table

```
influencers
  id               uuid pk default random
  workspace_id     uuid not null → workspaces  on delete cascade
  slug             text not null
  name             text not null
  handle           text not null            -- without the '@'
  platform         influencer_platform not null
  followers        integer not null
  engagement_rate  numeric(5,2)             -- null = nobody has measured it
  vertical         influencer_vertical      -- null = a genuine generalist
  status           influencer_status not null default 'prospect'
  notes            text
  created_at, updated_at  timestamptz not null default now()

  unique  (workspace_id, slug)                 -- what makes /influencers/priyaskin resolve
  unique  (workspace_id, platform, handle)     -- one row per creator per platform
  index   (workspace_id, followers desc)       -- the read path; the table's own order

influencer_brands
  influencer_id  uuid not null → influencers  on delete cascade
  brand_id       uuid not null → brands       on delete cascade
  primary key (influencer_id, brand_id)
  index (brand_id)                             -- the brand filter
```

Three enums, `pgEnum` beside `zod`, per the convention `outlets.ts` and `social_posts.ts`
already follow, with the shared tests pinning the member lists. The members are exactly the
ones `lib/api/types.ts` declares today — six platforms including `xiaohongshu`, ten verticals,
three statuses.

Six points worth stating, because each is a decision:

- **`followers` is not nullable**, and that is what makes the grouping *total*. Every row lands
  in exactly one reach tier, so the band counts always sum to the rows. `tiers.ts` is written
  against that promise.
- **`engagement_rate` is `numeric` and comes back from `node-postgres` as a *string*.** `3.80`,
  not `3.8`. The mapper converts and a test pins that the wire value is a `number` — this is the
  one shape trap in the whole plan, it type-checks clean either way, and on screen it shows up
  as `3.80%` where every other row says `3.8%`.
- **`status` defaults to `prospect`**, not `active`. A creator somebody has just entered is on a
  shortlist; nobody has booked them yet.
- **`(workspace_id, platform, handle)` is unique.** One row per platform is the model
  (`InfluencerPlatform`'s docstring argues it: two platforms means two follower counts and two
  engagement rates, and one row would have to pick one number to show). The same handle twice on
  one platform is a duplicate import, not a second creator.
- **No `agency_id`, no `email`, no `phone`.** 1.39.0's decisions stand. A creator is reached at
  their handle; the mobile number is their agent's business; the agency is a vendor you hold an
  agreement with, not the axis you file a person under.
- **No CHECK constraints.** Zod at the route boundary is the single enforcement point, as
  everywhere else in this schema.

### The wire

`Influencer` moves to `@brandfactory/shared` and becomes camelCase — `engagementRate`,
`brandIds`, `createdAt`. The snake_case copy in `lib/api/types.ts` is deleted with the fixture
that fed it.

`brandIds: BrandId[]` stays on the read shape, assembled server-side from the join table and
**sorted**, so two reads of one row are byte-identical. The cell does not change shape.

On patch, `brandIds` is a **full replacement**, not an add/remove pair — the same call
`attributes` makes on an outlet, and the same reason: the client holds the whole set and sends
the whole set, so there is no merge for two writers to disagree about.

`BrandNotInWorkspaceError` is reused unchanged. Every id in `brandIds` is checked against the
workspace, and the route turns a miss into a 400 `BRAND_NOT_IN_WORKSPACE`.

### The slug

From the **handle**, not the name — `/influencers/priyaskin`. The handle is the creator's own
identifier, it is what the search box already treats as one, and it is close to URL-safe
already. Frozen at create, unique per workspace, numbered from `-2`.

Known cost: one person on two platforms gives `priyaskin` and `priyaskin-2`, and the URL does
not say which is which. The detail page names the platform in its first line. The alternative
(`priyaskin-instagram`) is unambiguous and puts a suffix on the 90% of creators who are on one
platform.

`shared/src/outlet/slug.ts` generalises rather than being copied: `slugify(name, fallback)` and
`uniqueSlug(base, taken)` move to `shared/src/slug.ts`, and `outletSlug` / `uniqueOutletSlug`
become two-line wrappers so **nothing about outlets changes**. `influencerSlug` /
`uniqueInfluencerSlug` sit beside them with `INFLUENCER_SLUG_FALLBACK = 'creator'`.

### The list is exhaustive, and that is the best line in the release

`GET /workspaces/:workspaceId/influencers` returns every creator in the workspace, in reach
order, with no cursor and no server-side filters. Outlets' call, and it pays off harder here
because this screen carries **counts on its group headers**.

Four things follow:

1. The tier band counts stop being *"of the rows loaded"* and become totals.
2. The honesty note above the table — *"Showing the first N creators — bands below may be
   incomplete"* — is **deleted**. It was built rather than written down precisely so it could
   go when this landed.
3. `useCursorPages`, `LoadMore`, `PAGE_LIMIT` and `Page<Influencer>` all go. The four panel
   filters and the search box narrow an array the client holds completely.
4. The tripwire moves with the screen: past roughly **150 rows**, the keyset cursor on
   `(followers desc, name, id)` and the SQL filters land **together**. A paginated list with
   client-side filters is the "Zephyr alone on page one" failure `AGENTS.md` bans.

## Phases

Six, each independently shippable, each landing its own note in `docs/completions/` per the
one-document-per-phase convention.

### Phase A — The record

Nothing on screen changes. The aggregate exists.

1. `shared/src/ids.ts` — `InfluencerIdSchema`.
2. `shared/src/slug.ts` — `slugify` / `uniqueSlug` extracted; the outlet pair rewritten as
   wrappers; `slug.test.ts` moves and keeps every case.
3. `shared/src/influencer/` — `influencer.ts` (three enums, `InfluencerSchema`,
   `byInfluencerReach`), `create.ts`, `update.ts`, `slug.ts`, `influencer.test.ts`. Exported
   from `shared/src/index.ts`.
4. `db/src/schema/influencers.ts` and `influencer_brands.ts`; `pnpm db:generate` writes
   migration **0014**.
5. `db/src/mappers.ts` — `rowToInfluencer`, taking the row and its brand ids. **The `numeric`
   conversion lives here and is tested here.**
6. `db/src/queries/influencers.ts` — `listInfluencersByWorkspace`, `getInfluencerByRef`,
   `createInfluencer`, `updateInfluencer`, `deleteInfluencer`. The brand gate reuses
   `assertBrandInWorkspace`; the link rows are written in the same transaction as the row.
7. `db/src/influencers.live.test.ts`.

**Two query-layer points.** The list needs the join, and it is a second query plus an in-memory
map rather than a `json_agg` — the set is exhaustive and small, and one array-shaped column
that `rowToInfluencer` has to unpack differently from the detail read is a second mapper. And
`assertBrandInWorkspace` currently takes one id; it gains an array-taking sibling so the error
still names *which* brand missed.

**Ships:** nothing visible. `pnpm test` and a live-test run are the verification.

### Phase B — The routes and the seed

1. `server/src/routes/influencers.ts` — `createWorkspaceInfluencersRouter`, five handlers, on
   the `routes/outlets.ts` shape exactly: one router under `/workspaces`, `requireWorkspaceAccess`
   as the only gate, `RefParam` for the GET and `IdParam` for the PATCH and DELETE.
2. `server/src/db.ts` — five entries on the `Db` surface and five in the concrete object.
3. `app.ts` — one `.route('/workspaces', …)` line. Run the **router-degradation check**
   `routes/assets.ts` documents: `:workspaceId/influencers` sits beside `brands`, `projects`,
   `settings`, `research` and `outlets`, all literal segments at the same position, so
   `RegExpRouter` still compiles.
4. `server/src/routes/influencers.test.ts` — the fake-`Db` shape, per package convention.
5. `db/src/seed.ts` — the nineteen creators, re-pointed at the two demo brands.

**What the seed cannot keep.** The fixture's roster is built against four Operations Hub brands,
one of them retired, and the seed has two brands and no retired one. So *"three rows name two
brands"* survives and *"three name the retired one"* does not. Everything that makes the roster
worth having is preserved and is stated in the seed's docstring: one row in Mega so the count
badge and collapse toggle correctly vanish there, every platform and every vertical present,
two creators with no vertical, three with no engagement rate, five with no brand, and engagement
falling as reach rises.

**Ships:** `curl` against a seeded database returns the roster. Nothing on screen yet.

### Phase C — The list on real data

The release's centre of gravity.

1. `features/influencers/api.ts` — rewritten onto `bf` / `callJson`, five methods, on
   `features/outlets/api.ts`'s shape.
2. `features/influencers/hooks.ts` — `useInfluencers` (SWR, `[SCOPES.bfInfluencers, workspaceId]`,
   `revalidateOnFocus: false`) replacing `useInfluencerPages`.
3. `lib/api/cache.ts` — `bfInfluencers` and `bfInfluencer` added, the Ops `influencers` scope
   removed. `cache.test.ts` pins every scope as distinct.
4. `influencers-browser.tsx` — filters move client-side; `useBrandIndex` swaps to
   `useWorkspaceBrands`; the `LoadMore` footer and the honesty note go; the field names go
   camelCase.
5. `brand-names-cell.tsx` — the map type widens from `Map<string, Brand>` to
   `Map<string, { name: string }>`.
6. `lib/labels.ts` — the five `INFLUENCER_*` records re-key off the shared unions, so a new enum
   member fails the typecheck until it has a label.
7. Deleted: `fixtures/influencers.ts`, the `/influencers` branch in `mock.ts`, and the
   `Influencer` / `InfluencerPlatform` / `InfluencerVertical` / `InfluencerStatus` block in
   `lib/api/types.ts`.

**The brand-index swap is not the thing `AGENTS.md` bans.** That file says *"do not fix this by
pointing the contracts table at `useWorkspaceBrands`"* — because a contract's `brand_ids` are
fixture ids, and every row would read `Group level` in a workspace that had not happened to name
a brand `Harbour Table`. Here the **data itself moves**, so the index must move with it.
Contracts and vendors keep the Ops brands, which is why `BrandNamesCell` is *widened* to serve
both rather than re-pointed.

**Ships:** the roster on screen is the roster in the database, and the band counts are true.

### Phase D — The page per creator

1. `app/(app)/influencers/[slug]/page.tsx` — a server page rendering `PageHeader`, the client
   detail component under `<Suspense>`.
2. `features/influencers/hooks.ts` — `useInfluencer(ref)` on `SCOPES.bfInfluencer`.
3. `features/influencers/components/influencer-detail.tsx` — on `outlet-detail.tsx`'s shape.
4. The name cell in the table becomes a link, emitting the slug when it holds the row.

The page shows what the row holds plus the notes field and the timestamps. It does **not** show
campaign history, past posts or a rate card, because none of those exists.

**Ships:** a creator has a URL worth pasting.

### Phase E — The form

1. `useInfluencerMutations` — create, update, remove, invalidating **both** scopes on every
   write, on `useOutletMutations`' shape.
2. `features/influencers/components/influencer-form.tsx` — a `Sheet`, on `outlet-form.tsx`'s
   shape, with a multi-select for brands.
3. Delete behind an `AlertDialog`, from the detail page only.
4. The primary action becomes **`Add creator`**. `SyncInfluencersButton` demotes to a secondary
   button and keeps its toast — the import is still not connected, and saying so beside a
   working create is more honest than saying it instead of one.

**Four traps, all already written down in `AGENTS.md`, all live on this form.** A sheet's
content survives its close, so the draft resets *during render* when `open` flips true and never
in an effect. `SheetContent` is never keyed on anything that changes as the sheet closes. A
required field's label reads as `Name*` in `textContent`. And `reach` is a required number field
whose value nobody should invent — the form shows `updatedAt` beside it once the row exists, so
a hand-typed count that has gone stale is visible as one.

**Ships:** the screen can fill its own table.

### Phase F — The browser pass and the release

The full gate, a browser pass, the changelog entry, and the completion notes moved to
`docs/completions/`.

The browser pass has a standing list from 1.39.0, which shipped without one: whether five bands
read well at nineteen rows, whether ten vertical glyphs are distinguishable at 16px, whether the
reach column's mixed `k`/`M` units scan down its length, and whether `Not engaged yet` reads as
a decision rather than a gap.

## Risks

- **`numeric` arrives as a string.** Named twice on purpose. It type-checks clean, it survives
  lint, and it reaches the screen as `3.80%` in a column of `3.8%`. The mapper test is the only
  thing that catches it.
- **Migration 0014 against a seeded dev database.** The join table's foreign keys are strict;
  a seed run that inserts links before brands fails loudly, which is the correct behaviour and
  is worth confirming rather than discovering in Phase B.
- **`brandIds` as a full replacement, sent from a stale read.** The window is small and the
  shape is the one `attributes` already has, so this is accepted rather than closed. Closing it
  needs an `expected_version` on the route — the shape `features/spaces` has, and a decision for
  a later plan across every aggregate at once, not for this one alone.
- **Twenty-six Ops files still resolve ids through `features/registry/`.** None of them touches
  an influencer, so nothing here disturbs them. Confirm with a grep before deleting the fixture,
  not after.
- **`packages/web` must stay untouched.** It serves production and has no influencer surface.
  A change there is a sign the shared package grew something the Vite app now compiles.

## What is deliberately not done

- **No import connector.** Pulling creators and their reach from a platform is the next piece of
  work and is what `SyncInfluencersButton` still promises.
- **No cross-platform person record.** One row per platform stays. Linking Priya's Instagram row
  to her TikTok row is a real feature and a separate decision.
- **No agency link.** 1.39.0 removed it and nothing here restores it.
- **No campaign, post or spend history**, and therefore nothing on the detail page that the row
  does not already carry.
- **No server-side filtering or sorting.** It arrives with the cursor, together, past ~150 rows.
- **The nav's active brand does not filter this screen.** The brand filter is explicit, as on
  `/contracts` and `/vendors`.
- **`/contacts` and the Ops address book are untouched.** They still mean the address book, and
  `useContactMutations` stays live on the tenancy sheet and the review queue.
- **`packages/web` is untouched throughout.**
