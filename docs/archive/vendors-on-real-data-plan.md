# Vendors on real data — plan

**Goal.** `/vendors` stops rendering nine rows assembled out of `fixtures/agencies.ts` and
`fixtures/contracts.ts` and starts rendering the companies the Hono server holds. A vendor
becomes a BrandFactory aggregate — its own tables, its own routes, its own feature folder —
with a page per vendor and a form that can add, correct and remove one.

Base: `main` at **1.40.1** — 2292 passed | 115 skipped, migration 0014 the latest. The working
tree also carries the unreleased `PageState` gutter change across 26 `web-next` files; this plan
assumes it lands or is discarded first, and touches none of those files for that reason.

The precedent throughout is **1.36.0** (outlets) and **1.40.0** (influencers). The outlets note is
no longer in `docs/`, so its changelog entry is the record; influencers' plan is
[`./influencers-on-real-data-plan.md`](./influencers-on-real-data-plan.md). Where this plan says
nothing, assume influencers' answer — it is the closer of the two, because a vendor also carries
a many-to-many brand relation and a user-typed unique key.

## The question that prompted this, answered

*"We'll have to create a new Vendors db model/table if I'm not mistaken."*

**Correct, and there is nothing to reuse.** BrandFactory's schema holds seventeen tables and no
company record of any kind. `outlets` is a place the brand trades *from*; `brands` is the thing
the work is for. Neither is a counterparty.

The `Vendor` type on screen today is `S["VendorRead"]` — an alias over `lib/api/schema.d.ts`,
generated from a FastAPI OpenAPI document this repository does not contain, with `pnpm gen:api`
deleted and the file frozen. It is not ours to extend. `AGENTS.md` states the rule directly:
*"`src/lib/api/types.ts` is the only file allowed to reach into it."*

So: three new tables, a wire shape in `@brandfactory/shared`, and a feature folder that reads the
Hono server.

## What the ask turned out to cost

Each gap verified against the code, not assumed.

| Gap | Evidence |
| --- | --- |
| **No table, no route, no query** | `packages/db/src/schema/` has seventeen files and none is a company. `packages/server/src/routes/` has no vendors module. `app.ts` mounts nothing at that path. |
| **The type is generated from a backend this repo does not contain** | `Vendor`, `VendorListItem`, `VendorCreate`, `VendorUpdate`, `VendorContactRead`, `VendorContactInput`, `VendorStatus`, `VendorKind` are eight aliases over the frozen `schema.d.ts`, all snake_case. |
| **The category vocabulary is the wrong domain** | `ServiceCategory` is `aircon \| pest_control \| grease_trap \| stewarding \| laundry \| …` — thirteen *building trades*. Four of the six agency fixtures carry `other` and two carry `null`, because none of the thirteen names a talent agency. `fixtures/agencies.ts` records this in a docstring as *"a real cost and a separate decision about a screen nobody has asked to change"*. This is that decision. |
| **The form's own hint is already false** | The Category field reads *"The trade they mostly work. **Shared with contracts.**"* 1.37.0 moved `contract.category` onto `ContractCategory`, a marketing vocabulary; vendors did not follow. The two records have said different words for the same field for four releases, and no gate can see a string. |
| **Three of the eight columns are derived from a fixture** | `fixtures/contracts.ts` builds `contracts_total`, `contracts_active`, `next_contract_end` and `brand_ids_covered` from sixteen invented agreements. Nothing on the server holds a contract. |
| **The dead `kind` dimension is still on the record** | 1.38.0 removed the control from the screen — *"marketing buys from no landlords"* — but `VendorKind` is still on `VendorCreate`, still a `Select` in the form, and still `service_provider` on every row. |
| **The list is paginated for nine rows** | `useVendorPages` wraps `useSWRInfinite` over `mock.ts`' `page()`, with a `LoadMore` footer, `q` and `status` sent to a server that does not exist. |
| **Twelve components read `useVendorIndex`** | Four are the live Contracts screen (`contracts-view`, `contract-detail`, `contract-form`, `contract-extraction-review`), one is the live Review queue (`review-actions`). Seven are cut-from-nav areas: tenancies (5), expenses (2), registry entities (1 via `close-dialogs`). |

## Settled before the first line

Two with the user, the rest from the code. Nothing below re-opens them.

| | |
| --- | --- |
| **Scope** | **Vendors only.** Contracts keeps its fixture vendor book. The Ops feature folder is renamed out of the way rather than deleted, exactly as `features/registry` was kept for outlets and `features/registry-brands` for brands. |
| **The contract aggregates** | **Three columns go** — `Contracts`, `Next end`, and the counts in the detail page's summary line. Their only source is a fixture, and a count derived from a fixture rendered beside a real row is a false statement that looks like a true one. `brand_ids_covered`'s own docstring already makes this argument about `outlets_covered`. |
| **The Brands column** | **Stays, and stops being derived.** A vendor gets its own `vendor_brands` join table, so the column becomes a stated fact — which brands this company works on — rather than a projection of live agreements. `influencer_brands`' shape exactly. |
| **The detail page's Contracts card** | **A stated placeholder**, on 1.35.1's precedent. It cannot keep reading the fixture: fixture contracts key on fixture vendor ids, so a real vendor would show "No contracts with this vendor" on every row — an empty state that lies. |
| **Contacts** | **A child table, and folded into the vendor write.** `PUT /vendors/:id/contacts` goes; the list is a full replacement on create and patch, the same call `brandIds` makes. That is also what removes the primary-swap problem the current form's docstring works around. |
| **Write surface** | **Full CRUD.** Add, edit and delete a vendor from the screen. Nothing else can fill the table — the `Upload` half of the split button is still a stated placeholder. |
| **Detail page** | **`/vendors/[slug]`**, on the outlets shape: a slug column, a `getByRef` query, a second cache scope. Today's route is `/vendors/[id]` and the param name moves with it. |
| **`kind`** | **Gone.** Not pinned to `service_provider` — removed from the record, the form and the wire. 1.38.0 removed the control; this removes the column it controlled. |
| **Scope of the record** | **Workspace-scoped with a brand relation**, not brand-scoped. Outlets' and influencers' argument unchanged: the screen filters *by* brand, and a vendor nobody has assigned yet has no brand at all. |
| **Ops fixtures** | `fixtures/agencies.ts` and `fixtures/contracts.ts` **both stay**. Sixteen agreements name those nine vendors by id, and `/contracts` is a live nav item. |

### Why the brand link is a join table, again

Same argument as `influencer_brands`, and it has not weakened. `brandIds` is multi-valued, an
empty array is a fact ("not assigned yet") rather than a gap, and a `uuid[]` column cannot carry
a foreign key. Delete a brand and every array holding its id keeps holding it — and
`BrandNamesCell` renders an id it cannot resolve as `…`, because *a cached index that has not
arrived is a pending request, never a missing fact*. A dangling id and a request in flight would
look identical, permanently, in the one cell that rule exists to protect.

So: `vendor_brands (vendor_id, brand_id)`, both sides `ON DELETE CASCADE`. Deleting a brand
removes the **link** and keeps the vendor; the relationship outlives the branding.

### Why the category vocabulary is new, and is *not* `ContractCategory`

The obvious move is to reuse the eleven marketing values 1.37.0 gave a contract. It is the wrong
one, and the form's own hint is the evidence: it promises the two are shared, and reading the two
lists beside each other shows they cannot be.

`ContractCategory` names **what an agreement buys** — `retainer`, `media_buy`, `production`,
`sponsorship`. `VendorCategory` has to name **what the counterparty is** — an agency, a studio, a
press office, a tool. One company sells three of those categories; one agreement buys one. A
media agency on a retainer would have to be filed under `retainer`, which is a fact about the
paperwork rather than about the company.

So they are two vocabularies over one domain, and the hint gets rewritten rather than made true.

## The shape

### The tables

```
vendors
  id             uuid pk default random
  workspace_id   uuid not null → workspaces  on delete cascade
  slug           text not null                  -- from the name, frozen at create
  name           text not null
  category       vendor_category                -- null = nobody has said
  status         vendor_status not null default 'active'
  uen            text                           -- Singapore UEN; null = not recorded
  website        text
  notes          text
  created_at, updated_at  timestamptz not null default now()

  unique  (workspace_id, slug)              -- what makes /vendors/northlight-talent resolve
  unique  (workspace_id, uen)               -- one company, one UEN; NULLs are distinct
  index   (workspace_id, name)              -- the read path; the table's own order

vendor_brands
  vendor_id  uuid not null → vendors  on delete cascade
  brand_id   uuid not null → brands   on delete cascade
  primary key (vendor_id, brand_id)
  index (brand_id)                          -- the brand filter, and the cascade

vendor_contacts
  vendor_id   uuid not null → vendors  on delete cascade
  position    integer not null              -- the order the form sent them
  name        text not null
  role        text
  email       text
  phone       text
  is_primary  boolean not null default false
  primary key (vendor_id, position)
```

Two enums, `pgEnum` beside `zod`, per the convention `outlets.ts`, `social_posts.ts` and
`influencers.ts` already follow, with `vendor.test.ts` pinning both member lists.

```
vendor_status    active | inactive | blacklisted
vendor_category  creative_agency | media_agency | talent_agency | pr_agency
                 | production | events | research | software | freelancer | other
```

Eight points worth stating, because each is a decision:

- **The order is by name ascending**, not by anything derived. This is a directory — the opposite
  of `influencers`, which sorts by reach because it is read as a budget conversation. `index
  (workspace_id, name)` is the read path and the table's own order.
- **`name` is not unique**, unlike an influencer's `(platform, handle)`. A company name is not an
  identifier: it carries legal suffixes, trading names and abbreviations, so refusing
  *"Sunbeam Social"* because *"Sunbeam Social Pte Ltd"* exists would refuse a legitimate second
  record while catching none of the real duplicates. The slug takes a `-2` and the row lands.
- **`uen` is unique when present, and that is the 409.** A UEN genuinely is one company's
  identifier, and Postgres treats NULLs as distinct, so no partial index is needed and the many
  unrecorded rows cost nothing. This reuses 1.40.1's mechanism whole — a `VendorUenTakenError`
  narrowed on the **constraint name**, not on `23505` alone, so any other unique violation
  reaching that line stays a 500 rather than being dressed as a duplicate UEN.
- **`uen` is not format-validated** beyond a length, on `InfluencerHandleSchema`'s argument: UEN
  grammar has several forms, a foreign agency has none at all, and refusing a whole import over a
  character class loses the value entirely.
- **`category` is nullable *and* has an `other` member**, and both are load-bearing. `null` is
  "nobody has said"; `other` is "stated, none of these". The current form's comment already makes
  this distinction and it is preserved verbatim — it is the one place vendors got something right
  that influencers deliberately did the opposite way (there, a generalist has no vertical and
  there is no `other` to confuse them with).
- **`vendor_contacts` carries no timestamps and no surrogate id.** It is a value object, not an
  entity: the write replaces the whole list, so a `created_at` would reset on every unrelated edit
  and read as a lie. `(vendor_id, position)` is the key, and the wire is a plain ordered array.
  `social_post_assets`' `position` precedent.
- **At most one primary contact, enforced in zod**, not by a partial unique index. The repo's
  stated rule — *"No CHECK constraints. Zod at the route boundary is the single enforcement
  point"* — and here it also removes work: a full-replacement write makes the primary swap one
  request, which is exactly what the current form's `replaceContacts` docstring was built to
  achieve against an index that could refuse the second.
- **No `kind` column.** See the decisions table.

### The wire

`Vendor` moves to `@brandfactory/shared` and becomes camelCase. The eight aliases in
`lib/api/types.ts` stay exactly where they are — they still type `features/registry-vendors`,
which still serves Contracts.

```ts
Vendor {
  id, workspaceId, slug, name,
  category: VendorCategory | null,
  status: VendorStatus,
  uen: string | null,
  website: string | null,
  brandIds: BrandId[],        // sorted server-side; [] is a fact, never a gap
  contacts: VendorContact[],  // in position order; [] is a fact
  notes: string | null,
  createdAt, updatedAt
}

VendorContact { name, role, email, phone, isPrimary }
```

`CreateVendorInput` is the row minus everything the server owns — `id`, `workspaceId` (it is in
the path), `slug` (derived from the name), `createdAt`, `updatedAt`. **Only `name` is required**,
which is one fewer than outlets and four fewer than influencers, and is the shape of the record:
a company you have just heard of has a name and nothing else confirmed. `status` defaults to
`active` — unlike an influencer's `prospect`, because a vendor somebody enters is one the business
is already buying from.

`UpdateVendorInput` is a partial patch with at least one key. `slug` is absent and frozen.
`brandIds` and `contacts` are **full replacements**, the same call `attributes` makes on an outlet.

`BrandNotInWorkspaceError` is reused unchanged; the route turns a miss into a 400
`BRAND_NOT_IN_WORKSPACE`, matching outlets and influencers.

`BrandWebsiteUrlSchema` generalises rather than being copied: `WebsiteUrlSchema` moves to
`shared/src/url.ts` and `BrandWebsiteUrlSchema` becomes a re-export, so **nothing about brands
changes**. The `shared/src/slug.ts` extraction is the precedent for the move.

### The slug

From the **name** — `/vendors/northlight-talent-pte-ltd`. There is no handle to prefer, unlike a
creator. Frozen at create, unique per workspace, numbered from `-2`.
`VENDOR_SLUG_FALLBACK = 'vendor'` for a name that survives `slugify` as nothing.

`vendorSlug` / `uniqueVendorSlug` are two-line wrappers over `slugify` / `uniqueSlug` in
`shared/src/slug.ts`, beside the outlet and influencer pairs. Nothing in that file changes.

### The list is exhaustive

`GET /workspaces/:workspaceId/vendors` returns every vendor in the workspace, in name order, with
no cursor and no server-side filters. Three things follow:

1. `useVendorPages`, `useCursorPages`, `LoadMore` and `Page<VendorListItem>` all go from the new
   feature. The search box and the two selects narrow an array the client holds completely.
2. The Brands column's counts are true, because the client holds every row.
3. The tripwire moves with the screen: past roughly **150 rows**, a keyset cursor on
   `(name, id)` and the SQL filters land **together**. A paginated list with client-side filters
   is the failure `AGENTS.md` bans by name.

## Phases

Seven, each independently shippable, each landing its own note in `docs/completions/` per the
one-document-per-phase convention.

### Phase A — The record

Nothing on screen changes. The aggregate exists.

1. `shared/src/ids.ts` — `VendorIdSchema`.
2. `shared/src/url.ts` — `WebsiteUrlSchema` extracted from `brand/brand.ts`;
   `BrandWebsiteUrlSchema` becomes a re-export so no brand behaviour moves.
3. `shared/src/vendor/` — `vendor.ts` (two enums, `VendorContactSchema`, `VendorSchema`,
   `byVendorName`), `create.ts`, `update.ts`, `slug.ts`, `vendor.test.ts`. Exported from
   `shared/src/index.ts`.
4. `db/src/schema/vendors.ts`, `vendor_brands.ts`, `vendor_contacts.ts`; `pnpm db:generate`
   writes migration **0015**.
5. `db/src/mappers.ts` — `rowToVendor(row, brandIds, contacts)`.
6. `db/src/queries/vendors.ts` — `listVendorsByWorkspace`, `getVendorByRef`, `createVendor`,
   `updateVendor`, `deleteVendor`, plus `VendorUenTakenError` and `isUenUniqueViolation`.
7. `db/src/vendors.live.test.ts`.

**Three query-layer points.** The list needs **two** joins, so it is three queries and two
in-memory maps rather than a `json_agg` — the influencers argument, one relation further. The
brand gate reuses `assertBrandsInWorkspace` from `queries/influencers.ts`, which means that
helper moves somewhere both can import (`queries/brand-scope.ts`) rather than being copied. And
`updateVendor` reads the row **before** it writes when the patch touches `uen`, so
`VendorUenTakenError` can name the value — a failed transaction cannot be read from afterwards,
which is the ordering 1.40.1 established.

**Ships:** nothing visible. `pnpm test` and a live-test run are the verification.

### Phase B — The routes and the seed

1. `server/src/routes/vendors.ts` — `createWorkspaceVendorsRouter`, five handlers, on
   `routes/influencers.ts`' shape exactly: one router under `/workspaces`,
   `requireWorkspaceAccess` as the only gate, `RefParam` for the GET and `IdParam` for the PATCH
   and DELETE, one `rethrowWriteConflict` mapping `BrandNotInWorkspaceError` → 400 and
   `VendorUenTakenError` → 409 `VENDOR_UEN_TAKEN`.
2. `server/src/db.ts` — five entries on the `Db` surface and five in the concrete object.
3. `app.ts` — one `.route('/workspaces', …)` line, then the **router-degradation check**
   `routes/assets.ts` documents: `:workspaceId/vendors` sits beside `brands`, `projects`,
   `settings`, `research`, `outlets` and `influencers`, all literal segments at the same
   position, so `RegExpRouter` still compiles and `/blob-urls/:key{.+}/read-url` stays alive.
   `app.test.ts` is what proves it.
4. `server/src/test-helpers.ts` — five methods on `createFakeDb`, and **the fake has to learn the
   UEN rule**: `assertFakeUenFree`, beside `assertFakeHandleFree` at line 217. Every other
   behaviour in that file mirrors a query; this one is an index, so there is nothing to mirror and
   the rule has to be restated. Without it the 409 tests pass against the very 500 the mechanism
   exists to remove. That is 1.40.1 §4, verbatim, and it is the one trap in this phase.
5. `server/src/routes/vendors.test.ts`, on `routes/influencers.test.ts`' shape. Assert ordering as
   well as codes: a patch aimed at a row that does not exist is a **404** about the path even when
   the body also names a taken UEN.
6. `db/src/seed.ts` — the nine vendors, re-pointed at the two demo brands.

**What the seed carries.** The six agencies and three providers, re-categorised onto the new
vocabulary (six `talent_agency`, one `software`, one `production`, one `pr_agency`), with a
contact on three of them and none on six — so the detail page's real empty state ships seeded
rather than only in a test. At least one `inactive` and one `blacklisted`, two rows with no
brand, one row with no category, and one UEN present so the unique index has something to be
about.

**Ships:** `curl` against a seeded database returns the vendor book. Nothing on screen yet.

### Phase C — The Ops copy moves aside

Nothing on screen changes. This is the rename that lets Phase D take the folder name.

1. `features/vendors/` → `features/registry-vendors/`, whole, unedited — `api.ts`, `hooks.ts` and
   the three components.
2. `lib/api/cache.ts` — `vendors` / `vendor` become `registryVendors` / `registryVendor`, keys and
   strings together. Both are cache identity only, so nothing on the wire moves.
   `cache.test.ts` already pins every value as distinct; add the two.
3. Twelve import sites re-pointed. Five are live (`contracts` ×4, `review-actions`); seven are in
   cut-from-nav areas and are re-pointed anyway rather than left dangling.
4. The docstrings that say *"the vendors feature"* say *"the Operations Hub's vendor book"*, on
   `features/registry-brands`' model.

**`/vendors/page.tsx` and `/vendors/[id]/page.tsx` are untouched in this phase** and keep
rendering the Ops screens out of the renamed folder. That is what makes the phase shippable: the
rename lands with no behaviour change at all, and Phase D swaps the two route files in one move.

**Ships:** nothing. `pnpm -F @brandfactory/web-next build` and a click through `/contracts` are
the verification.

### Phase D — The list on real data

The release's centre of gravity.

1. `features/vendors/api.ts` — new, on `bf` / `callJson`, five methods, on
   `features/influencers/api.ts`' shape.
2. `features/vendors/hooks.ts` — `useVendors` (SWR, `[SCOPES.bfVendors, workspaceId]`,
   `revalidateOnFocus: false`).
3. `lib/api/cache.ts` — `bfVendors` and `bfVendor` added.
4. `features/vendors/components/vendors-browser.tsx` — the table, rewritten from
   `vendors-view.tsx`: filters client-side, `useBrandIndex` → `useWorkspaceBrands`, `LoadMore`
   gone, field names camelCase, the `Contracts` and `Next end` columns removed.
5. `lib/labels.ts` — `VENDOR_CATEGORY_LABELS`, `VENDOR_CATEGORY_ICONS` and re-keyed
   `VENDOR_STATUS_*` off the shared unions, so a new enum member fails the typecheck until it has
   a label. `VENDOR_KIND_*` and `SERVICE_CATEGORY_*` stay — `features/registry-vendors` and the
   review queue still read them.
6. `app/(app)/vendors/page.tsx` — points at the new browser; the header description is rewritten,
   because the sentence it carries today describes the three aggregates this phase removes.

**The brand-index swap is not the thing `AGENTS.md` bans.** That rule is about pointing a
*fixture's* ids at the workspace's brands. Here the data itself moves, so the index moves with
it. Contracts and the renamed Ops vendor book keep `useBrandIndex`, which is why
`BrandNamesCell` already takes `Map<string, NamedBrand>` — widened in 1.40.0 rather than
re-pointed, so it serves both indexes unchanged and this phase edits none of it.

**Ships:** the vendor book on screen is the vendor book in the database.

### Phase E — The page per vendor

1. `app/(app)/vendors/[id]/` → `[slug]/`, rendering the new detail component.
2. `features/vendors/hooks.ts` — `useVendor(ref)` on `SCOPES.bfVendor`.
3. `features/vendors/components/vendor-detail.tsx` — Company, Contacts, Brands, and a
   **Contracts card that states its own condition** rather than showing an empty list: agreements
   are not connected to this record yet, and `/contracts` is where they live. 1.35.1's
   placeholder band is the shape and the precedent.
4. The name cell in the table becomes a link emitting the slug.

**Ships:** a vendor has a URL worth pasting.

### Phase F — The form

1. `useVendorMutations` — create, update, remove, invalidating **both** scopes on every write,
   on `useInfluencerMutations`' shape. `SCOPES.contacts` is *not* invalidated: that is the Ops
   address book and this write does not touch it.
2. `features/vendors/components/vendor-form.tsx` — a `Sheet`, on `influencer-form.tsx`' shape.
   The `Kind` select goes. The `Category` select re-points at the new vocabulary and its hint is
   rewritten. `BrandPicker` is imported from `features/influencers/components/` — or moved to
   `components/` if a third caller appears, not before.
3. The contacts editor keeps its radio-column primary but loses `replaceContacts`: contacts ride
   in the create and patch body.
4. Delete behind an `AlertDialog`, from the detail page and the row. The dialog's copy loses
   *"its contracts keep their history that way"* — a sentence about a relation the server does not
   hold.

**Four traps, all in `AGENTS.md`, all live on this form.** A sheet's content survives its close,
so the draft resets *during render* when `open` flips true and never in an effect.
`SheetContent` is never keyed on anything that changes as the sheet closes. A required field's
label reads as `Name*` in `textContent`. And the 409 the UEN field can earn is the one refusal a
person reads while looking at the box they typed into — the `useSubmit` path puts an `AppError`'s
message straight on the form, so the message has to name the value and give a way forward.

**Ships:** the screen can fill its own table.

### Phase G — The browser pass and the release

The full gate, a browser pass, the changelog entry, and the completion notes moved to
`docs/completions/`.

Add `tag: "Sample"` to the **Contracts** nav item. It is entirely fixture-backed and untagged,
and the moment `/vendors` is real that gap becomes visible: a vendor created on one screen cannot
be selected on the other. The nav's `tag` field exists for exactly this and its docstring already
defines the word.

Browser-pass list: whether ten category glyphs are distinguishable at 16px, whether the table
reads as a directory now that three columns have gone, whether `Not assigned` in the Brands
column reads as a decision rather than a gap, whether the Contracts placeholder reads as a stated
condition rather than a broken card, and whether the contacts editor is usable at three contacts.

## Risks

- **The 409 the fake cannot infer.** Named twice on purpose. `assertFakeUenFree` is the only
  thing standing between the route tests and a green run against the 500 the whole mechanism
  exists to remove — the trap `createFakeDb`'s own header warns about, and the one 1.40.1 was
  spent on one aggregate over.
- **`unique (workspace_id, uen)` on data that is mostly NULL.** The index is correct and the
  behaviour is untestable through the screen, because almost nothing carries a UEN. The live test
  is the only proof; write it before the route, not after.
- **Two vendor books on screen at once.** Accepted, stated, and it is the direct cost of the
  scope decision. `/contracts` offers the fixture's nine and `/vendors` shows the workspace's
  own. The `Sample` tag makes it visible; the contracts conversion is what closes it.
- **`brandIds` and `contacts` as full replacements, sent from a stale read.** The same window
  `attributes` and `influencer.brandIds` already carry. Closing it needs an `expected_version` on
  the route — a decision for a later plan across every aggregate at once.
- **Migration 0015 against a seeded dev database.** Two join tables with strict foreign keys; a
  seed run that inserts links or contacts before the vendor row fails loudly, which is correct and
  is worth confirming in Phase B rather than discovering in Phase D.
- **The rename is twelve import sites and two cache keys.** A missed one is a type error, not a
  runtime surprise — but a missed *string* in a scope is neither. `cache.test.ts` pinning
  distinctness is what catches it.
- **`packages/web` must stay untouched.** It serves production and has no vendor surface. A change
  there is a sign `@brandfactory/shared` grew something the Vite app now compiles.

## What is deliberately not done

- **Contracts are not converted.** They stay a fixture, and the three aggregate columns stay gone
  until they can be real.
- **No `/contacts` change.** The Ops address book is untouched and `useContactMutations` stays
  live on the tenancy sheet and the review queue. A `vendor_contacts` row and a `ContactRead` row
  are different records in different services that happen to both describe a person.
- **No spend, quotation or repair history**, and therefore nothing on the detail page the row does
  not already carry. `/quotations` remains a mock with no data layer.
- **No document upload.** The `Upload` half of the split button stays a stated placeholder.
- **No server-side filtering, sorting or pagination.** It arrives with the cursor, together, past
  ~150 rows.
- **No vendor↔outlet relation.** 1.37.0 took premises out of this domain and nothing here brings
  them back.
- **The nav's active brand does not filter this screen.** The brand filter is explicit, as on
  `/contracts` and `/influencers`.
- **`packages/web` is untouched throughout.**
