# Outlets on real data

`/outlets` stops being borrowed Operations Hub UI over a fixture and becomes a BrandFactory
aggregate: a table, a migration, shared types, five routes and a feature folder that reads the
Hono server. The primary action on the page changes from **New outlet** to **Import or sync
outlets**, which is a placeholder — the backend behind it is deliberately not designed here.

One release, no browser pass, migration **0013**.

---

## 1. What was decided, and by whom

Asked and answered before any code was written. The first two questions were genuinely open — the
Operations Hub's outlet carries two things this product has no home for — and the answers shape
most of what follows.

| Question | Answer |
|---|---|
| The table's **Holding entity** column, filter and *By entity* grouping — BrandFactory has no entities table and the nav cut the Entities item in 1.34.0 | **Drop the dimension.** The outlet's only relation is its brand. |
| `/outlets/[slug]` is 760 lines and thirteen cards over Contracts, Licences, Certifications, Tenancies, Networks, Spaces and Review — all Ops fixtures, all cut from the nav | **A slim, real-backed page.** The outlet's own record; the borrowed cards go. |
| What the sync button does until the route exists | **A live button and a toast.** No dialog, no source picker, no disabled control. |

Three more were settled without asking, because the code answers them.

- **Workspace-scoped with an optional `brandId`**, not brand-scoped. The screen filters *by* brand
  and groups *by* brand, and neither is a question a list already holding one brand can answer. A
  site whose brand is undecided is a normal state, not a row waiting for a foreign key.
- **The edit sheet stays and writes real data.** The ask was to replace the create button, not to
  make the record read-only.
- **Creating by hand survives, demoted.** The sync is the header's primary action; `Add outlet` is
  a secondary control in the toolbar. Until the sync exists it is the only way to put an outlet
  in, and a screen that can edit a record but never create one has a hole in it. This is the one
  place the work went slightly beyond the literal instruction, and it is the safe direction.

---

## 2. The shape

```
packages/shared/src/outlet/     outlet.ts · attributes.ts · slug.ts · create.ts · update.ts
packages/db/src/schema/         outlets.ts               (+ migration 0013)
packages/db/src/queries/        outlets.ts
packages/server/src/routes/     outlets.ts               (mounted under /workspaces)
packages/web-next/src/features/outlets/   api.ts · hooks.ts · components/×4
```

`packages/web` is untouched. It has no outlets and serves production.

### The wire

Five routes, one router, all under the prefix the auth gate already covers.

```
GET    /workspaces/:workspaceId/outlets              → Outlet[]   exhaustive, name order
POST   /workspaces/:workspaceId/outlets              → Outlet     201
GET    /workspaces/:workspaceId/outlets/:outletRef   → Outlet     ref = slug or id
PATCH  /workspaces/:workspaceId/outlets/:outletRef   → Outlet     ref = id
DELETE /workspaces/:workspaceId/outlets/:outletRef   → Outlet     200 with the row that went
```

**One router, not the usual two.** Every other aggregate splits into a workspace-scoped
list/create and an id-scoped read/patch, because a brand or project id is globally unique and
carries its own parent. An outlet is reachable by **slug**, and a slug is unique per workspace
only — so every handler needs the workspace anyway, and an `/outlets` prefix would be a second
entry in the auth gate for no gain.

**That is also why there is no `requireOutletAccess`.** `authz.ts` is unchanged. The gate is
`requireWorkspaceAccess` plus a query layer that takes the workspace on *every* helper: an outlet
id from another workspace **misses** rather than being read or written across the boundary. It is
the property `updateSocialPost(brandId, id, …)` already has one aggregate down, and there are four
route tests on it — read, patch, delete and "the row is untouched".

---

## 3. The table

```sql
outlets (id, workspace_id, brand_id, slug, name, outlet_type, status,
         address, unit, postal_code, attributes text[],
         target_opening_date, opening_date, closing_date, notes,
         created_at, updated_at)
```

Four decisions in it are worth the words.

**`brand_id` is `ON DELETE SET NULL`, not `CASCADE`.** A lease outlives its branding. Deleting a
brand must not delete the premises — that is the record the *next* brand gets attached to. There
is a live-DB test and a route test on this, because a cascade here would be silent and
unrecoverable.

**The three dates are `date`, not `timestamp`.** An outlet opens on a day where it stands; it does
not open at an instant that readers in two zones see as two days. `rowToOutlet` passes them
through untouched — the only mapper in that file that does not call `toIsoTimestamp` — and
`z.iso.date()` rejects a timestamp at the wire. `formatDate` in `packages/web-next` has never
constructed a `Date` from one, for the same reason.

**`attributes` is `text[]` and the wire accepts any key.** `OUTLET_ATTRIBUTES` in
`@brandfactory/shared` is twelve `{key, label}` rows of static data — no table, no route, the
`lib/key-dates/` precedent for a set nobody edits — but it is the **offered** catalogue, not the
permitted one. Outlets are going to arrive by import, and refusing a whole batch because a source
system spells one tag its own way would be a sync that fails on the data it exists to carry. An
unknown key renders as itself; `outletAttributeLabel` never says "Unknown", because that would
state something about this file as though it were something about the record.

**No CHECK constraints.** The one invariant spanning columns — a closing date before an opening
date — is deliberately unenforced: an imported row carrying both the wrong way round is a fault to
surface on screen, not a reason to refuse the import that found it.

### The slug

Generated from the name at create, **frozen after**, unique per workspace.

Freezing is the whole point. A link written today survives a rename, which is the only reason to
carry a slug rather than routing on the id — so `UpdateOutletInputSchema` has no `slug` key and
`updateOutlet` never touches the column. There is a test on each end: the schema strips a `slug`
a client sends, and the query proves `/outlets/old-name` still resolves after the rename.

`outletSlug` normalises through NFKD and strips combining marks *before* filtering, so `Café`
becomes `cafe` rather than `caf`; a name with nothing usable in it (`翠玉`, `###`, `""`) falls back
to `outlet` rather than producing an empty segment. `uniqueOutletSlug` numbers from **2**, because
the unsuffixed slug is the first one — `casa-vostra-1` would suggest a `casa-vostra` that is not
this record.

The uniqueness is chosen inside the create transaction against slugs read in the same
transaction. Under READ COMMITTED two concurrent creates of the same name can still collide, which
is what `outlets_workspace_slug_key` is for: the loser takes a unique violation rather than
silently overwriting. That is a 500 on a genuinely rare race, and the honest trade against
serialising every create.

---

## 4. The list is exhaustive, and that is the interesting part

`GET /workspaces/:id/outlets` returns **every** outlet in name order. No cursor, no query
parameters, no filters. The client narrows an array it holds completely.

This inverts what the Operations Hub screen did, and the inversion removes three problems at once
rather than solving them:

- Its footer had to say *"50 outlets loaded"*, never a total, because the API returns
  `next_cursor` and no count. Ours says `6 outlets`, and it is true. **This is the only place in
  `packages/web-next` where a footer may claim a total**; the rule stands everywhere else.
- Its grouped view read a **second**, exhaustive endpoint through `listEvery`, because grouping a
  fetched page is the "Zephyr alone on page one" lie the repo bans for sorting. One list serves
  both views here.
- Its search box was debounced because every keystroke was a request. Filtering an in-memory array
  needs no debounce, and a debounce would only make the table lag behind the box.

**The cost is stated rather than hidden.** This fetches every outlet on every visit — fine at tens
of rows, not fine at thousands. When the estate outgrows one response, the cursor and the SQL
filters land **together**; a paginated list with client-side filters is exactly the failure the
first bullet describes. `listOutletsByWorkspace` says so at the point somebody would change it, and
so does `AGENTS.md`.

Sorting is still not offered, for the unchanged reason: rows arrive in name order and that is the
order a directory is read in.

---

## 5. Two things called an outlet

`features/registry/` **stays**, on the fixture, and this is the `features/brands` vs
`features/registry-brands` split made a second time.

It stays because **twenty-six files across fourteen cut-from-nav Ops areas** resolve an
`outlet_id` to a name through its `useOutletIndex` — contracts, licences, tenancies, networks,
service reports, certifications, spaces, the review queue, the dashboard. Deleting it is a
decision about those fourteen screens, not about outlets, and nothing here makes it.

What did go are the four components the new feature replaced: `outlets-browser.tsx`,
`outlet-detail.tsx`, `outlet-form.tsx` and `attribute-picker.tsx`. Two components named
`OutletsBrowser` would be the actual hazard.

Three seams keep the two apart:

- **Cache scopes are prefixed on the new side** — `bf-outlets` / `bf-outlet` against the Ops
  `outlets` / `outlet`. A shared string would have each area refetching the other's lists forever:
  not a crash, just two screens quietly invalidating each other. `lib/api/cache.test.ts` pins every
  value in `SCOPES` as distinct, and names this pair as the one with a reason to collide.
- **`lib/labels.ts` re-keys `OUTLET_*` to `@brandfactory/shared`'s unions.** The member lists are
  identical word for word, so the fourteen Ops screens still type-check against the same records —
  and if the two ever diverge, those call sites break, which is the signal worth having.
- **`lib/outlet-href.ts` is now structurally typed** on `{id, slug}` rather than on either
  `Outlet`. Both records carry both fields and both point at the same route; a signature naming one
  of them would make the helper pick a side it does not need to pick.

`lib/api/mock.ts` keeps its `/outlets` fixture, with a comment saying who still reads it and when
it goes.

---

## 6. The screens

**The list** keeps the shape it had — search, status, type and brand filters in the URL, a
`Flat` / `By brand` view control, the group rail, the 1440px address column — minus the entity
dimension and the pagination. Filters are `FilterBar` rather than the Ops screen's overflow
`FilterPopover` form: dropping Holding entity took it from five controls to four, and the primary
action moved up to the page header, so the row fits again. The chips went with the popover, which
is correct — chips exist to keep *collapsed* filters visible, and nothing is collapsed now.

**The detail page** is the outlet and nothing else: a hero with the brand monogram, status and
type; where it is; both dates side by side under their own names, plus a line saying which one the
table shows; the attributes as chips; notes, the web address and when it was last touched. Edit
opens the same sheet the table does. Delete is behind a `ConfirmDialog` whose text says what the
button is *not* for — a site that stopped trading is `Closed`, not deleted.

**The sync button** is six lines and enabled. A permanently greyed control in the primary action
slot reads as broken software rather than as an unbuilt feature; a button that did nothing visible
would be a bug report waiting to be filed. So it clicks, and it says what is missing. It commits to
no shape — no source picker, no field mapping, no schedule — because every one of those is a
decision the real design gets to make, and a placeholder that guesses at them is one somebody has
to argue against later.

**Attributes are editable in both modes**, unlike the Ops form, which showed them on create only.
That asymmetry existed because `POST /outlets` took an attribute list and `PATCH` did not — the set
was replaced through a third endpoint, so one form issuing two writes could half-fail. Our `PATCH`
takes `attributes` like any other key, so the split has nothing left to protect, and the second
editor it forced onto the detail page is gone with it.

---

## 7. The seed

Six outlets in the demo workspace, so the screen has a shape rather than an empty state. Each one
is there to show something the others cannot: all five statuses appear (`open` twice), so both date
columns are populated and every badge tone renders; three groups' worth of brand (Acme, Northwind,
and one unbranded) so *By brand* has more than one band **and** the `No brand` bucket; and
`Northwind Studio` has no address at all, because a table of complete records never shows what a
gap looks like.

Slugs are written out rather than derived — the seed inserts directly and never calls
`createOutlet`, and a fixed slug keeps a screenshot's URL stable across reseeds, which is why every
id in that file is fixed too.

---

## 8. Verification

```
pnpm typecheck                         clean (11 packages)
pnpm lint                              clean (whole repo)
pnpm format:check                      clean
pnpm test                              2190 passed | 92 skipped (182 files)
pnpm test (with DATABASE_URL)          2282 passed | 0 skipped
pnpm -F @brandfactory/web build        clean
pnpm -F @brandfactory/web-next lint    clean
pnpm -F @brandfactory/web-next build   clean — /outlets static, /outlets/[slug] dynamic
```

**Seventy new tests here**: 28 in `shared` (the slug rule, the catalogue, the date-on-show rule,
both input schemas), 14 live-DB in `db`, 22 route tests in `server`, and 6 in `web-next` (the scope
registry and `outletHref`).

The suite totals above are larger than that delta because the working tree also held an unrelated
`/contracts` fixture (`fixtures/contracts.ts` + its 13 tests) written alongside this work. It
touches nothing outlets read.

**The live-DB suite ran for real.** Postgres was brought up, migration 0013 applied and the whole
`@brandfactory/db` project executed against it — 126 passed, nothing skipped. That is what proves
the parts a fake cannot: `date` columns returning `2024-03-01` rather than an instant, the `text[]`
round trip, the per-workspace unique slug and its suffix, and `ON DELETE SET NULL` keeping an
outlet when its brand is deleted.

**And the wire was exercised end to end** — server running, real database, dev bearer token, curl:

- the six seeded outlets come back in name order, with the unbranded one carrying `brandId: null`;
- `GET` by slug and by id both answer 200 for the same row, an unknown ref answers
  `404 OUTLET_NOT_FOUND`, and no token answers 401;
- `POST {"name":"Café Vostra — Duxton","outletType":"restaurant"}` answers
  `slug: "cafe-vostra-duxton"`, `status: "pipeline"`, `attributes: []` — the accent stripping and
  every default, live;
- a `PATCH` renaming the outlet to `Renamed Entirely` left the slug alone, took `halal_certified`
  (a key the catalogue does not offer) and set only the fields it sent;
- `PATCH {}` answers 400; a brand id from another workspace answers
  `400 BRAND_NOT_IN_WORKSPACE`;
- `DELETE` answers 200 with the row, and again answers 404.

## 9. What is not verified

**No page has been seen rendered.** The shell is behind sign-in and the only door there is a *Dev
token* field; pasting a token into a credential field is not something this work will do — the same
wall 1.34.0 §6, 1.34.1 §5 and 1.35.0 §5 all record. The build proves both routes compile and
prerender, and §8 proves every byte the screens read and write, but nobody has looked at the table.

Seven things to check on the first real pass, in the order they are most likely to be wrong:

1. **The table fits at 1280 and 1440.** The width caps and the `min-[1440px]` address column are
   the Ops screen's measurements, taken against a table with *seven* columns; this one has six.
   The breakpoint is now conservative rather than wrong, and re-measuring belongs in a browser.
2. **A save reaches the table.** Create and edit both invalidate `bf-outlets` and `bf-outlet`;
   watch the network log rather than trusting the toast — the sweep that could not reach a
   paginated list went unnoticed for eight months exactly this way.
3. **The brand picker resolves.** `useActiveBrand` feeds both the filter and the form. A brand id
   that has not loaded should render `…`, never an em dash and never "No brand".
4. **The group rail's first column lines up.** 4px rail + `pl-4` grouped against `pl-5` flat —
   20px either way, or the whole first column reads as misaligned.
5. **The edit sheet reopens clean.** The draft resets during render when `open` flips true; there
   is no `key` on `OutletForm`, deliberately, because one derived from `editing` would change
   mid-dismissal and wedge Base UI's overlay.
6. **A filtered URL survives a hard load in the production build.** `useQueryFilters` writes
   through `window.history.replaceState`; this is the failure mode that killed every filter control
   on every list screen for eight releases and does not reproduce under `pnpm dev`.
7. **The sync button's toast reads right** and does not look like an error.
