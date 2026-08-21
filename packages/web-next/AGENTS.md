<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Operations Hub — Frontend

Next 16 (App Router, Turbopack) · React 19 · Tailwind v4 · shadcn on **Base UI** · SWR.
Backend contract: [`../backend`](../backend/README.md). Product spec: [`../docs/spec.md`](../docs/spec.md).

**Status:** Phases 0, 1 and 2 are built against the live API — outlets, entities, networks,
the licences area, the contracts area (the table and the contract detail page), vendors, and
the dashboard, plus contacts and the review queue. The **service workflow is gone** —
schedules, visits, reports, `/service-reports` and the outlet-page cards — because every one of
them was keyed on a `(contract, outlet)` pair and a contract is now held for a *brand*. Nothing is a placeholder; the sidebar's "Not yet built" group renders only when
something is.

## Things that have already bitten

- **shadcn here sits on Base UI, not Radix.** Composition is `render={<Link href=… />}`,
  **not** `asChild`. Copying a snippet from the Radix-flavoured shadcn docs fails to
  type-check.
- **`params` and `searchParams` are Promises** and must be awaited. Use the generated
  `PageProps<'/route'>` / `LayoutProps<'/route'>` helpers (`pnpm exec next typegen`).
- **`src/hooks/use-mobile.ts` is a local rewrite.** The shadcn original calls `setState`
  inside an effect, which fails `react-hooks/set-state-in-effect` and breaks the build.
  Re-running `shadcn add sidebar` overwrites it — see the note in the file.

- **`useSearchParams` needs a `<Suspense>` boundary or the build fails.** It opts its subtree
  out of static prerendering, and Next stops with "missing suspense boundary with csr bailout"
  rather than shipping a page that renders blank until JS arrives. Every list screen is therefore
  a **server** page rendering `PageHeader`, with the client browser component under `<Suspense>` —
  which also keeps the title in the prerendered HTML.

- **Sizing a `Select` goes in `containerClassName`, not `className`.** The chevron is positioned
  against the wrapper while the control fills it, so a width on the `<select>` shrinks the control
  and strands the chevron at the wrapper's right edge — and in a `flex-wrap` filter row a wrapper
  still at `w-full` forces every control onto its own line. Both were live bugs before the split.

- **A required field's `<label>` reads as `Name*`.** The asterisk is `aria-hidden` so assistive
  tech gets "Name", but it is still in `textContent` — Playwright's `getByLabel("Name", {exact:
  true})` does not match. Use non-exact, and scope to the sheet, because "Search outlets by name"
  matches a loose "Name" lookup too.

- **A sheet's content survives its close** (it stays mounted through the exit animation), so a
  create form keyed `outlet?.id ?? "new"` reopened straight after a successful create still holds
  the previous draft — the last record's dates silently leak into the next one. And keying
  `SheetContent` on `open` is not the fix: remounting the popup mid-close breaks Base UI's
  dismissal and leaves the overlay eating clicks. The fix is resetting the draft state *during
  render* when `open` flips true (the React-documented adjust-state-on-prop-change pattern —
  see `license-form.tsx`), which is also not the effect pattern that broke this build once.
  The same wedge has a second trigger: a `key` derived from state that *clears on close*
  (`key={visit?.id ?? "none"}`) changes mid-dismissal and jams the overlay identically —
  bitten again in Phase 2's report form. Never key `SheetContent` on anything that changes
  when the sheet closes.

- **A row whose draft state seeds from async-loaded data initialises empty** — the schedule
  rows on the contract page captured `useState(schedule?.frequency)` before SWR had the
  schedules, and the selects sat on "No schedule" over real data. The fix is the saved value
  in the row's `key`, so arrival (or save) remounts and re-seeds — remount-not-effect, same
  as the filter tables. See `SchedulesCard` in `contract-detail.tsx`.

- **`CardTitle` renders a `div`, not a heading.** A Playwright `getByRole("heading", ...)` for a
  panel title finds nothing; target the text, or the `h3`s inside sheet sections which are real
  headings.

- **`mutate(matcherFn)` cannot reach a `useSWRInfinite` list.** SWR skips every `$inf$`-prefixed
  key when `mutate` is given a matcher, so invalidate-by-scope silently did nothing for **every
  list screen in the product** — create an outlet, get the 201 and the toast, and the table goes
  on showing the old rows with no request in the network log. Fixed in `lib/api/cache.ts` by
  mutating those keys **by name** off `cache.keys()` alongside the matcher; both halves are
  needed. Nothing in lint, typecheck or the type system can see this, and revalidate-on-focus
  hides it the moment you tab away and back — it was found by watching the API log during a
  browser pass, eight months after it shipped.

  **This includes `mutate(() => true)`, which reads as "clear everything" and is not.** The filter
  is `!/^\$(inf|sub)\$/` and it runs *before* your matcher, so a total matcher is exactly as blind
  as a selective one. The sign-out path used it alone and left every `useCursorPages` list in the
  cache across a session change; **use `useClearCache()` from `lib/api/cache.ts`**, which does both
  halves. Never write a bare matcher when the intent is "nothing survives this".

- **An error class belongs to a transport, and there are two.** `apiFetch` throws `ApiError`,
  `bf-client` throws `AppError`, and any `instanceof` ladder that knows only one sends the other
  down its fallback branch. Both fallbacks here claim the API was unreachable, so a perfectly
  well-answered 403 or 404 from the Hono server told the reader the backend was not running —
  live for a whole release on the one BrandFactory form there is. `use-submit.ts` (writes) and
  `query-states.tsx` (reads) both test for both now. Add the branch when you add the third client,
  and keep the network claim last.

- **The Hono server refuses in two shapes, and `zValidator` is the one you will forget.**
  `middleware/error.ts` sends `{code, message, details?}`; `@hono/zod-validator` answers
  `c.json({success: false, error}, 400)` itself and **never throws**, so it never reaches that
  handler and carries no top-level `code` or `message`. That is every `zValidator('json', …)` on
  the server, which is every body this app posts. `callJson` reads both — do not hand-roll a
  third reader. And note that **zod 4 does not serialise `issues`**: it is a getter, so the wire
  shape is `{name: "ZodError", message: "<the issues as JSON text>"}` and the array has to be
  parsed back out of the message.

- **`Button render={<Link/>}` needs `nativeButton={false}`.** Base UI's Button assumes a real
  `<button>`; handed an `<a>` it logs a console error on every instance and keeps semantics the
  anchor cannot honour. The sidebar's links go through `SidebarMenuButton`, a different
  primitive, so `/review` was the first place this came up.

- **`DropdownMenuLabel` throws unless it is inside `DropdownMenuGroup`.** It is Base UI's
  `Menu.GroupLabel`, which reads a context only `Menu.Group` provides; used bare it throws
  **Base UI error #31** the moment the menu opens. The symptom is not a crash — the trigger
  renders, the click does nothing, and the console shows a numbered production error with no
  component name in it. `dropdown-menu.tsx` had been generated but never rendered anywhere in
  the product until the org chart's "Move to…" menu, which is why this surfaced so late. The
  same rule applies to every `Menu.Group` part.

- **`router.replace` does not update search params in a production build.** On a list screen
  loaded *directly* on a URL that already carries them — every shared filtered link, the thing
  spec §6 exists for — the navigation is dropped and **every filter control on the page is dead
  for the life of the page**: selects, chips, both Clear alls, the search box. Search-param
  updates go through `window.history.replaceState`, which Next's own docs prescribe for exactly
  this ("Linking and Navigating → Native History API") and which `usePathname` /
  `useSearchParams` both re-render off. `scroll: false` goes with it — a native history write
  does not scroll. Invisible to `lint`, `typecheck` and `build`, **and to `pnpm dev`**; it needs
  a production build *and* a hard load on a filtered URL, together, which is why it survived
  eight releases across all twelve consuming screens.

- **A boolean filter needs one reading of the URL, not one per consumer.** `?flag=` is a string,
  so "is it on" gets answered by the checkbox, the chip, the trigger's count and the request —
  and the moment two of them answer differently, the control disagrees with the table. Test the
  value in one function and normalise before handing it down. In `contracts-view.tsx` those four
  had drifted into two rules, and `?notice_gap=false` filtered the table while the box read
  unticked. Match the API's parser: FastAPI's `bool` accepts `1/on/t/true/y/yes` and *rejects*
  the rest, so plain truthiness on a string is not the same test.

- **A cached index that has not arrived is a pending request, never a missing fact.** Every id a
  table resolves through `useOutletIndex` / `useEntityIndex` / `useVendorIndex` is a real foreign
  key, so a name absent from the map means the fetch is in flight — render `…`, never an em dash
  and never "Unknown outlet". Counts derived from those maps are worse: "2 outlets, 0 companies"
  is a false statement that looks like a true one. This only bites where a cell shows a *name* or
  a *derived count*; a count off the row itself (`contract.outlet_ids.length`) is always safe,
  which is why the contracts table did not have this problem until Coverage stopped being one.

- **Awaiting `searchParams` in a server page makes the whole route dynamic.** `/contracts`
  went from `○ (Static)` to `ƒ (Dynamic)` in the build output the moment it read
  `params.view` to redirect the old vendors tab. That is the correct trade — the redirect
  *has* to be server-side or a shared link renders a frame of the wrong table on the way
  past — but it is a real cost, and it is paid by every request to the route rather than
  only the ones carrying the param. Read `searchParams` in a page for routing decisions,
  not for things a client component under `<Suspense>` already reads from
  `useSearchParams`.

- **`PATCH /brands/:id/guidelines` deletes every section you do not send.** It is not a patch: the
  body is the brand's *complete* list, upserted-reordered-and-pruned in one transaction. So the
  dangerous outcome is not a failed save, it is a **successful one that silently deletes seven
  sections** with a green toast over it. Two rules follow and both are in
  `features/brand-profile/guidelines.ts`, which is the only file allowed to build that payload:
  whole list in, whole list out; and the list is built from a **fresh `GET /brands/:id`** taken
  immediately before the write, never from the SWR cache, which may be missing a section a
  research run has just finished writing. That narrows the window and does not close it — closing
  it needs an `expected_version` on the route, the shape `features/spaces` already has. And
  `createdBy` rides back on every row: synthesising `'user'` is the bug the *server* fixed in
  Stage 1B, and a client can reintroduce it from this side.

- **`GET /workspaces/:id/outlets`, `…/influencers` and `…/vendors` return the whole set, and that
  is what makes those three screens' numbers true.** None has a cursor or a filter — the client
  narrows an array it holds completely, so `4 outlets` is a total rather than "four so far", a
  brand's group holds all of that brand's outlets rather than the ones that landed on page one, a
  reach band that says `9` holds nine, and `9 vendors` under a filtered table counts the rows
  above it. Those are the *only* three places in this app where a footer or a group header may
  state a total; every Ops list still must not, because their API returns `next_cursor` and no
  count. Do not reach for `useCursorPages` or `listEvery` on any of them — all three would wait on
  a `next_cursor` that never arrives. And when a roster outgrows one response,
  the cursor and the SQL filters land **together**: a paginated list with client-side filters is
  the "Zephyr alone on page one" failure this file bans for sorting.

  Influencers is the sharper case, because it carries **counts on its group headers**. It shipped
  paginated against a fixture and printed a note above the table — *"Showing the first N creators —
  bands below may be incomplete"* — precisely so the counts were not read as claims. The note is
  gone with the pagination; if anything ever puts a cursor back here, the note comes back with it.

- **A guideline body is one document that two apps write.** `packages/web`'s TipTap editor and
  this app's `SectionEditorSheet` store into the same column, so `src/editor/extensions.ts` is a
  copy of `packages/web/src/editor/proseMirrorSchema.ts` and **must stay identical to it**. An
  extension one editor knows and the other does not is a silent data loss on the next save. It is
  also why the profile edits the stored `BrandWithSections` (`useBrandProfile().source`) and never
  its own flattened `ProfileBlock[]` — those carry no marks, and saving them back would strip
  every bold run and link written elsewhere. `immediatelyRender: false` is required on `useEditor`
  here, or the server render and the client disagree.

- **An SWR array key is truthy however empty its contents.** `useSWR([scope, "contract", ""])`
  fetches; only `null` does not. A "fetch this only while the dialog is open" hook has to return
  a null key, not an array holding an empty id — otherwise it takes a 422 on every render.

## Layout

```
src/
  app/
    layout.tsx           root — fonts, tooltip provider, toaster
    sign-in/             outside the group: the gate cannot gate its own door
    (app)/               route group: the sidebar shell
      layout.tsx           AuthBoundary + SidebarProvider + SidebarInset
      brands/              the workspace's brands as a gallery, and everything inside one:
                           [id]/ is the profile, [id]/outlets/ that brand's locations and
                           [id]/outlets/[slug]/ one of them. Under [id] the sidebar becomes
                           the brand's — see `components/layout/brand-nav.tsx`
      outlets/             the premises, read and written against the Hono server — list,
                           plus [slug]/ for one outlet, keyed by slug *or* id. **Out of the
                           nav** since 1.42.0 and kept for the cross-area links that hold an
                           outlet id and no brand (dashboard, review); the brand's own table
                           is the one people navigate to
      tools/               funnel/ and photography/ — two deliberate placeholders, tagged
                           "Empty" in the nav. Title, route and two strings each
      entities|networks/   Phase 0 — list screens
      dashboard/           Phase 1–2 — the attention surface, filters in the URL
      licenses/            Phase 1 — three URL-selected views: held, requirements, library
      contracts/           Phase 2 — the agreements, grouped and filtered by brand, plus [id]/
                           for the contract detail page. Redirects ?view=vendors to
                           /vendors, translating vq/vstatus to q/status
      vendors/             the service providers — promoted out of a contracts tab
      review/              the data-quality queue
      marketing-requests/  the request inbox. Was /forms ("Ops Forms"), two forms, the blank
                           one front and centre; now one form behind a button on the queue
      spaces/              OpenSpace, incorporated — list, plus [id]/ for the scheme
                           workspace (plan / walkthrough / album / cost in ?view=)
    f/[slug]/            the public form, outside (app) — no shell, no login
    icon.svg             the favicon. The Mission mark on the accent tile, which is the same
                         lockup the sidebar header draws — keep the two in step
    fonts/satoshi/       self-hosted Satoshi .woff2 — the one product typeface
    globals.css          the three token tiers. Read before styling anything.
  auth/                  store, session, providers/, sign-in-panel, auth-boundary
  components/
    ui/                  shadcn. Generated, then restyled onto Mission tokens — see below.
                         select/checkbox/textarea/field/alert-dialog are hand-written.
                         There is no dialog.tsx: forms here are Sheets.
    brand/               app-logo (the Mission mark), brand-mark (the monogram)
    layout/              app shell, the two header rows, account menu, page header,
                         filter bar, table card, detail list, placeholders, query states
  features/<area>/
    api.ts               service layer — the only place that calls a transport
    hooks.ts             SWR wrappers and mutations — the only place components call
    components/          the screens and forms for that area
  editor/                the TipTap extension set. A copy of packages/web's, and the two must
                         stay identical — see the note above on why
  hooks/                 use-query-filters, use-debounced-value, use-submit, use-mobile
  lib/
    labels.ts            enum -> label and badge tone. Keyed by the union, so a new
                         backend enum value fails the typecheck until it has a label.
    format.ts            dates, addresses. Read the note on why formatDate never
                         constructs a Date.
    stored-preference.ts localStorage + useSyncExternalStore, SSR-safe. Two readers: the
                         active workspace and the active brand. Only the brand writes.
    workspace-resolve.ts which workspace the shell opens in. Pure; tested.
    website-url.ts       the brand form's URL normalisation, on the shared zod schema
    api/
      client.ts          apiFetch, ApiError, fieldErrors, query() — the Ops transport
      bf-client.ts       hc<AppType>, AppError, callJson — the BrandFactory transport
      cache.ts           invalidate-by-scope, and useClearCache for a session change.
                         One scope registry for both transports.
      use-cursor-pages.ts  useSWRInfinite wrapper
      schema.d.ts        GENERATED — never edit
      types.ts           named aliases over schema.d.ts
```

**`features/influencers/` is BrandFactory's creator. `features/contacts/` is the Operations Hub's
address book**, and they are two nouns rather than one under two names. The creator is
workspace-scoped with a many-to-many brand relation, camelCase, `@brandfactory/shared`'s
`Influencer`, and reads the Hono server; the contact is `ContactRead`, snake_case, filed under a
`vendor_id`, and answered — or rather *not* answered, see `mock.ts` — from the frozen Ops schema.
`useContactMutations` is still live on the tenancy intake sheet and the review queue, both creating
a person against a vendor, which is correct for a landlord's site manager and was only ever wrong
for a creator. The cache scopes are prefixed on the new side (`bf-influencers` / `bf-influencer`)
for the same reason the outlet pair is.

**`features/outlets/` is BrandFactory's outlet. `features/registry/` holds the Operations
Hub's** — the same split, made a second time and for the same reason. The real one is
workspace-scoped with an optional `brandId`, camelCase, and reads the Hono server through
`bf`; the Ops one is snake_case, carries an `entity_id` into a company table this product does
not have, and is answered from `lib/api/mock.ts`. They share the word and nothing else.

The Ops folder stays because **twenty-six files across fourteen cut-from-nav areas** resolve an
`outlet_id` to a name through its `useOutletIndex` — contracts, licences, tenancies, networks,
service reports, the review queue. Deleting it is a separate decision about those screens, not
about outlets. What did go with the switch is the four components the real feature replaced
(`outlets-browser`, `outlet-detail`, `outlet-form`, `attribute-picker`): two components named
`OutletsBrowser` would be the actual hazard.

The **cache scopes are prefixed on the new side** — `bf-outlets` / `bf-outlet` against the Ops
`outlets` / `outlet` — because both families are live at once and a shared string would have each
area refetching the other's lists forever. `lib/api/cache.test.ts` pins every scope value as
distinct.

**There is no entity dimension here, and that is a decision.** The Ops table had a Holding entity
column, filter and "By entity" grouping; BrandFactory has no entities table and the nav cut the
Entities item in 1.34.0, so an `entity_id` would be a foreign key pointing at nothing. The outlet's
only relation is its brand.

**`features/brands/` is BrandFactory's Brand. `features/registry-brands/` is the Operations
Hub's** — the third registry dimension, a brand an *outlet* belongs to. They share the word and
nothing else: different shapes, different backends, different lifetimes. The Ops one held the
plain name until the real one needed it; eight screens read `useBrandIndex` from it to resolve a
`brand_id` to a name.

**The Ops one is no longer only *resolved*, and that is a change worth knowing before you touch
it.** `/contracts` groups by brand, filters by brand and asks for brands on create, all against
`features/registry-brands/` and `fixtures/brands.ts` — so `/brands` is registered in `mock.ts`
again after a release of deliberate absence. The reason a contracts screen is not wired to the
*real* brands is in that fixture's docstring and is short: a static fixture cannot know the ids
of rows a live server creates, and the Ops fixtures are one coherent invented F&B group that the
workspace's actual brands are not part of. **Do not "fix" this by pointing the contracts table at
`useWorkspaceBrands`** — every row would read `Group level` in every workspace that had not
happened to name a brand `Harbour Table`.

**The route is `/registry-brands`, and the folder name alone was not enough.** 1.33.0 renamed the
feature folder and left the page at `/brands`, so the product's central noun pointed at a screen
about premises for a release. Folder, cache scope and route all say `registry-brands` now. The
**wire path stays `/brands`** — that is the Ops backend's, frozen in `schema.d.ts`, and not this
app's to rename. Keep the three in step and leave the fourth alone.

**`features/vendors/` is BrandFactory's vendor. `features/registry-vendors/` is the Operations
Hub's** — the fourth split, made for the third time and for the same reason. The real one is
workspace-scoped with a many-to-many brand relation and a child contact list, camelCase,
`@brandfactory/shared`'s `Vendor`, and reads the Hono server; the Ops one is `VendorRead`,
snake_case, carries a `kind` and a `ServiceCategory` of thirteen building trades, and is answered
from `lib/api/mock.ts`.

The Ops folder stays because **`/contracts` is live and resolves every `contract.vendor_id` to a
name through its `useVendorIndex`**, and the review queue creates a contact against a vendor.
Pointing that screen at the real vendors is the same mistake `fixtures/brands.ts` warns about:
sixteen fixture agreements name those nine companies by *their* ids, and a static fixture cannot
know the ids of rows a live server creates. The cache scopes moved with the folder —
`registry-vendors` / `registry-vendor` — and `cache.test.ts` pins them.

**Two vendor books will be on screen at once from the moment `/vendors` reads the server**, and
that stays true until the contracts conversion closes it. It is an accepted cost rather than an
oversight, and the honesty it owes is a `Sample` tag on the Contracts nav item — the field exists
for exactly this. Do not close the gap by re-pointing `/contracts` at the real vendors; see the
paragraph above for why that cannot work.

`features/marketing-requests/` is the same rule applied a second time and on the first attempt:
folder, route and label all moved off `forms`, and `/forms/{form_key}/submissions` stayed because
it is the Ops backend's path.

**The product is "Marketing Hub" on screen and BrandFactory in the repository.** The sidebar, the
sign-in lockup, every page title and the public form say Marketing Hub. The package, the server,
the shared types, the scopes and every comment about the *codebase* still say BrandFactory —
`@brandfactory/shared` is not being renamed, and a comment describing which of two transports a
class belongs to is describing the repository, not the chrome. `packages/web` is untouched and
still says BrandFactory throughout; it serves production.

**There is one workspace and no way to change it.** A person here belongs to exactly one and
cannot create, join or leave another, so `components/layout/workspace-switcher.tsx` is gone and
`useActiveWorkspace()` no longer returns a `select`. The resolution stays — every brand route is
`/workspaces/:workspaceId/brands` and none of them can be called without an id — and the resolved
name is readable once, as text, in the account menu. Do not put a workspace control back in the
chrome without the product decision that reverses this; a control that offers a choice the
product does not have is worse than the fact being hidden.

**There are two sidebars and the path picks one.** `brandIdFromPath` in `components/layout/nav.ts`
is the whole switch: under `/brands/:id` the rail becomes that brand's — the way back to the
gallery, the brand, and `BRAND_NAV_ITEMS` — and everywhere else it is the workspace's `NAV_ITEMS`.
The mode is **derived, never stored**: a flag in state would have to be cleared on every navigation
away, and the browser's back button is where that would eventually be forgotten, leaving a rail
headed "Casa Vostra" over a workspace page. Adding a brand-scoped screen is one row in
`BRAND_NAV_ITEMS` plus a route under `app/(app)/brands/[id]/`.

**The brand switcher in the sidebar header is gone**, and it is the same product decision as the
workspace one above rather than a redesign. It offered a brand switch on eleven screens where
nothing answered to it — every workspace table spans all brands and carries a brand *filter* — and
it reached the profile through a `DropdownMenuRadioGroup`, which reports changes only, so
re-picking the brand you were already in did nothing. Choosing a brand is a navigation now. Do not
put a brand control back in the chrome: a page that is about one brand says so in its URL and in
its rail, and a page that is not has a filter.

**A workspace table is not a brand screen just because it has a `brandId` column.** Contracts,
Vendors and Influencers are each **many-to-many** with brands — a contract names several — so the
cross-brand table is the true shape of them and a per-brand view would be a filter pretending to be
a scope. Outlets moved because an outlet belongs to exactly one brand. Apply that test before
adding to `BRAND_NAV_ITEMS`.

**Native `<select>` and `<input type="checkbox">`, styled.** Not Base UI's popup Select. Every
select here picks one value from a short closed enum and the attribute editor is twenty checkboxes
in a fieldset; the platform controls already do typeahead, keyboard, mobile pickers, label
association and the base-layer focus ring. Reach for a popup when options need icons,
descriptions or search — for those cases, not these.

**`Popover` and `DropdownMenu` are not interchangeable.** A menu is `role="menu"` and promises
`menuitem` children with roving arrow-key focus; put five labelled selects in one and a screen
reader announces "menu, 5 items" while the roving focus fights the selects' own keyboard
handling. Panels of form controls (the contracts filter panel) go in `Popover`.

**Feature-based, not type-based.** A new area gets `features/<area>/{api,hooks}.ts` and a
`components/` folder beside them, not another file in a global `services/` folder. Promote
something to `components/` or `lib/` only once two features use it and it carries no
feature-specific logic.

## Lists, filters and pagination

Three rules the Phase 0 screens all follow. Copy them rather than reinventing per screen.

- **Filters live in the URL** (`hooks/use-query-filters.ts`), because spec §6 wants a filtered
  view to be shareable. `window.history.replaceState` — **not** `router.replace`, see below — and
  an empty value deletes the key rather than sending `?status=`.
- **Lists paginate with `useCursorPages`** (`lib/api/use-cursor-pages.ts`), which wraps
  `useSWRInfinite` with `revalidateFirstPage: false` — on by default, and it refetches page 1 every
  time you press "load more".
- **Changing a filter remounts the results component** via `key={filterKey}`, which is what resets
  the accumulated page count. Deliberately a `key` and not an effect calling `setSize(1)`: setting
  state in an effect is the rule that already broke this build once.

**Two filter layouts, chosen by control count.** `FilterBar` wraps every control into the row and
is right up to about four of them — eight of the nine list screens. `FilterToolbar` +
`FilterPopover` + `ActiveFilterChips` (same file) is the overflow form, currently only on
`/contracts`, which has five filters plus two view controls plus the primary action: a single
wrapping row put them on three ragged lines with a hole in the middle, because the filter group
grew while the action group stayed pinned right. The overflow form holds a fixed number of
controls whatever the filter count — search stays on the row, the rest go in a counted panel, and
**what is set stays visible as chips**. Do not collapse filters without the chips: a shared link
would then open on a filtered table with no visible reason for the missing rows, which is the
"it got lost" failure this product exists to fix.

Two things follow from the split that are easy to get wrong. `FilterSelect` hides its label in
`aria-label` to keep the row one control tall; `PanelFilter` has vertical room, so it uses a real
`<label>` — do not copy the `aria-label` into the panel and end up with both. And the trigger's
count is the *panel's* filters, not `useQueryFilters`' `activeCount`, which includes `q`: a
"Filters ①" badge for a term already sitting in the search box is a miscount.

**View controls are not filters and should not look like them.** "Which contracts to show" is a
`SegmentedControl` and "Group by brand" a `ToggleButton`, both replacing selects — a `Select`
holding one option is a menu for a boolean, and a select-shaped view control in a row of
select-shaped filters reads as a sixth filter.

**Grouped tables carry a colour rail** (`components/layout/group-rail.ts`, shared by the
contracts table and the review queue). The band takes
`--color-chart-*` at full strength and the rows a 40% wash, with `border-t border-border` — the
full-strength divider, not the row hairline — above each band. The categorical series rather than
the accent is deliberate: the accent has a fixed per-view budget (§4) and a green rail repeated
down thirty headers blows it many times over. Two traps: **Tailwind scans for literal strings**,
so `border-l-chart-${n}` compiles to a rail with no colour and the classes must be written out;
and the first header cell has to match the rows under it (`pl-5` ungrouped, 4px rail + `pl-4`
grouped, 20px either way) or the whole first column reads as misaligned. Collapse state is
`useState`, not the URL — it is a reading posture, and thirty ids would swamp the link
`useQueryFilters` works to keep pasteable.

**Do not add column sorting to a paginated list.** No list endpoint takes a sort parameter, so a
sortable header can only reorder the rows already fetched — on a cursor-paginated list, sorting by
name puts "Zephyr" at the top of page one while "Alma" sits unfetched on page three. Every list in
this package is in that state except one, so this is still the default answer.

**The exception is an exhaustive endpoint, and the property is what earns it — not the screen.**
`GET /workspaces/:id/influencers` returns the whole roster in one response, which is the same
property that lets `/influencers` claim true band counts and a real total in its footer. With no
page two there is nothing unfetched to sort wrongly, so `features/influencers/sort.ts` orders the
array the client already holds and `components/layout/sortable-head.tsx` renders the heading.
Three obligations come with it. **A sort belongs in the URL** (`?sort=`/`?dir=`) like every other
thing that describes what is on screen — the row height beside it does not, see below. **Sorting
and grouping are exclusive**: a sort inside the tier bands gives the table two orders at once, so
a click on a heading writes `group=none` and the grouping toggle clears the sort. And **the order
must be total** — ties fall back to the server's own comparator, or a column with three distinct
values reshuffles its rows every time a filter changes. The moment that endpoint paginates, the
sort moves to SQL with the cursor; `listInfluencersByWorkspace` names ~150 rows as the tripwire
and the roster is at 146.

**A column that only sometimes exists takes a third exclusivity rule.** `/influencers` can trade
its single Reach column for one per platform plus a total (`?reach=platform`), and those columns
carry sort keys — `reach:instagram` — that name nothing when the view is off. Turning the view off
therefore clears a per-platform sort, or the table is left ordered by a column with no heading and
no way to clear it but the URL. Turning it *on* clears nothing. A pasted URL carrying
`?sort=reach:instagram` without `?reach=platform` is **honoured rather than corrected**: the order
is real, the heading is one click away, and silently dropping the sort somebody shared to show is
worse than showing it. The columns themselves come from the *filtered* rows, never the enum — a
roster on three platforms gets three columns, not six with three always empty — and in **enum
order, never frequency order**, or the columns rearrange every time a filter moves.

**The wide view is the one place a list table may be wider than its card.** Everything else stays
`table-fixed` on a percentage budget that sums to 100 (see the design section). Three more numeric
columns cannot fit in that budget without squeezing every other column below what it needs, so this
view drops `table-fixed` for a minimum width and takes the horizontal scrollbar deliberately. That
is only allowed because the reader asked for it: a default view that reaches the scrollbar is the
bug 1.49.1 fixed.

**A list search matches the thing's own name/title plus the name of the one entity that
*identifies* it (its counterparty) — not full-text across every joined field, and not a
substitute for the dedicated filters.** A contract is found by its vendor as readily as its title,
a contact by its vendor, an outlet by where it is and who runs it, an entity by its UEN; a vendor
or brand *is* its name, so those stay name-only and their joins are served by filter dropdowns.
The predicate lives in the domain `q` branch as an `or_` of `ilike`s (see `contract_operations` /
`contact_operations`) — a **subquery** for a nullable/one-to-many counterparty so a row with none
survives, a plain **join** only for a NOT-NULL many-to-one. When search spans a field beyond the
title, **mark the match in place** with `HighlightMatch` (`components/layout/highlight-match.tsx`)
rather than ordering by relevance — the list is cursor-paginated and unsorted by design, so the
highlight, not the order, is what tells the reader why a row matched. The search box's `label` /
`placeholder` must name what it covers; a placeholder that promises more than the predicate does
is the bug this rule closed (Contacts advertised "vendor" for releases before the backend matched it).
One case where name-only would be *wrong* and is a **future** gap: **held licences** carry no name
of their own, so their search must join to the licence-type name.

**Never claim a total.** The API returns `next_cursor` and no count, by design. The footer says
"50 outlets loaded", not "50 outlets" and not "1–50 of 214".

The one exception is a **separate aggregate endpoint** — `/review/summary`, the same idea as the
dashboard's counts — which the review queue's group headers use because a group header with no
number cannot be planned around. It comes with an obligation: an aggregate has to take the same
filters as the list it sits above, and every number has to say what it counts. Both were live
bugs on that screen before the browser pass — "15 open items" over three filtered rows, and a
`2 of 1` badge where the summary had refetched and the list had not. A denominator smaller than
its numerator is never rendered; a total that spans more than the table below it is either
narrowed or dropped.

## Mutations

`features/<area>/hooks.ts` exports `use*Mutations` returning plain async functions that call the
service layer and then invalidate by scope (`lib/api/cache.ts`). Nothing is optimistic: the API
applies domain rules — an entity holding outlets refuses to delete, a password write without the
ops role is a 403 — so the server's answer is the only one worth rendering.

Forms use `hooks/use-submit.ts` for pending state and error shaping. It puts a 422's messages on
the fields (`fieldErrors`) and shows a form-level message only when there is nothing better, so the
same complaint never appears twice. `toNullable` turns a cleared input into `null` rather than
`""` — an empty string is truthy, sorts before every real value, and is invisible on screen.

**A cell may edit in place; a row may not carry an actions menu.** The two are separate arguments
and only the second one survives everywhere. An actions column reaches a form the record's own page
already holds, which puts one sheet behind two entry points — that is still banned. Editing the
cell you are looking at is not that, and `/influencers` is where it lives
(`features/influencers/components/editable-cell.tsx`, `inline-editors.tsx`, `accounts-panel.tsx`,
`patchFor`).

**The affordance is the cell, not a pencil in it.** `CellTrigger` is a `<button>` filling the cell
that tints one step deeper than the row's own hover — `bg-surface-selected`, because `TableRow`
already paints `bg-surface-hover` across the row and a cell tint at that token is invisible exactly
when it is needed. A chevron marks the cells that open a *list*, and only those. A cell already
holding interactive content — Platforms' badge links, Brands' tooltip button — cannot wrap in a
button, so its trigger is a **sibling** taking the rest of the cell (`flex-1`), never a button
inside a button.

Six rules come with it, and the last two are the ones that make it safe:

- **A cell edits only what it shows, and a derived cell opens what it is derived from.** Vertical,
  brands and status each own a column and a column each. Reach and Platforms are **sums over the
  account list** — you cannot edit a sum by typing over it — so both open the *accounts panel*, one
  panel from either cell, which edits the figures the sum is made of. Tier and Engagement are
  derived from those sums and carry nothing at all: a tier is a band over a sum, and a blend is
  arithmetic over rates the panel already shows.
- **The Creator cell is a link and nothing else.** Not an omission. It is a two-line stack, so its
  editor had to take the height of the line it replaced rather than of the cell, and getting that
  wrong added 10px to the tallest cell in the row and pushed every row below it down under the
  reader's pointer. Nobody renames a creator from a roster; the record's own form still does.
- **One choice from a closed list is a menu, not a select and not a popover.** `DropdownMenu` with
  `menuitemradio` — a native select commits on `change`, and arrow keys on a *closed* select fire
  one `change` per press, so a keyboard reader stepping through three statuses fired three writes.
  A menu moves a highlight and commits on `Enter`. The brands picker stays a `Popover` because a
  column of checkboxes needs an explicit `Save`.
- **The patch is exactly one key.** `patchFor` is the seam, and it is the thing to aim a test at: a
  builder that spread the record and overwrote one key would pass a `{status}` assertion and still
  send `accounts` — and `PATCH /influencers/:id` replaces the whole account list when it is sent
  one. One key is a strictly safer write than the sheet it replaced.
- **Nothing is optimistic here either.** A cell in flight is disabled and shows the value it *still
  holds* with a spinner beside it — never the value the reader chose. A refusal gets a toast
  carrying the server's own sentence; a success gets none, because the new value is on screen
  *because the server sent it back*. **A disabled trigger loses focus**, which is a browser rule
  jsdom does not implement, so anything that disables a control mid-write owes a focus restore when
  the write settles — see `EnumMenu`. Restore only out of `document.body`, or you take focus back
  off a reader who moved on.
- **A panel in a popover has no `<form>`, so it owes its own refusals.** No `required`, no browser
  submit guard. It disables its own `Save` and says why, in a sentence somebody can act on:
  `accountsProblem` and `figureProblem` in `account-drafts.ts`. Two traps live there and both have
  cost a release. `Number("")` is `0`, so an empty follower box must be tested **on the string**.
  And a figure box that cannot be read fails in **opposite** directions per field: an unreadable
  follower count becomes `NaN`, which the schema refuses, while an unreadable engagement rate
  becomes `null` through `toNullableNumber` — and `null` is a *legal* value there, so it saved
  successfully and erased a measurement. Give every figure box `type="number"` **and** a sentence.
- **Only the accounts panel may move a row.** The bands group by reach and the default order is
  reach descending; vertical, brands and status are inputs to neither. The panel is the exception
  because it edits reach itself — and it is the one control whose write the reader is looking at,
  on a panel they pressed `Save` on, which is the case where a row moving is the answer rather than
  a surprise. Check this before making another column editable.

**In mock mode a mutation refuses with a 503, and Marketing Requests is the only exception.**
That default is the promise that no screen here can appear to save something nothing stored, and
it is worth more than any individual screen feeling finished. The exception is registered in
`mock.ts`'s `WRITES` and writes to a module-level array in `fixtures/marketing-requests.ts`; it
exists because that screen's *subject* is the mutation — an inbox is a thing you move rows
through — so a status control that errors on every click is not a design anyone can review. The
honesty is paid on the surface instead: a `MockBanner` saying the rows are held in memory, and a
"Sample" tag in the nav. `lib/api/mock.test.ts` asserts **both** halves, so widening the
exception by accident fails the suite. Do not add to `WRITES` to make a form feel real.

## Design tokens — Mission Systems product CI

`src/app/globals.css` holds three tiers and the direction of dependency is the point:

| Tier | Looks like | Rule |
|---|---|---|
| 1 primitives | `--c-ink-900`, `--space-4`, `--elevation-1` | the only place a hex literal lives |
| 2 semantic aliases | `--color-text-secondary`, `--surface-selected`, `--border-input`, and **shadcn's own names** (`--background`, `--primary`, `--sidebar-accent`) | re-point this layer for a dark theme or a tenant accent |
| 3 component tokens | `--button-primary-bg`, `--table-row-hover` | reference tier 2 |

A component reading a raw hex or a raw `--c-*` is a bug. Tailwind utilities are wired to tier 2
in `@theme inline`, so write `bg-surface-sunken`, `text-ink-secondary`, `border-border-subtle`,
`text-h1`, `text-eyebrow`, `shadow-e1` — not arbitrary values.

Four rules that get broken by accident:

- **The accent (`#1d3a2a`) has a fixed budget.** Per view: the primary button, **one**
  accent-filled stat card, the active/selected control state, and small brand chrome (the
  workspace tile, an avatar). Nothing else is green. A second accent-filled block means the
  hierarchy is wrong. Feedback green is `--color-success` (`#2f6b46`) and is a different thing.
- **A third party's brand mark is drawn in one colour, and it is ours.** The six platform marks in
  `features/influencers/components/platform-icons.tsx` are monochrome, and this is the decision the
  next person is most likely to reverse. Six saturated brand hues repeated down a column turns a
  data column into a logo wall and spends the budget above many times over; the colour on this
  screen belongs to the brand this product is *for*, not to the six it reads *from*. Three further
  rules travel with it. **The glyph is never alone** — a badge is mark plus label at every rung, per
  WCAG 1.4.1, which is what lets a mark nobody recognises still be read. **They are inline SVG
  paths, not a dependency**: `lucide-react` is the only icon package here and it ships no brand
  marks on purpose, because a trademark is not a pictogram. And `fill-rule="evenodd"` goes on every
  mark with a hole in it — a ring drawn as two same-direction subpaths is a solid blob under the
  default rule, and the failure is invisible until it renders. The cap on how many render inline is
  **two**, in `platforms.ts` and not in the cell, because it is the only part of that column a test
  can see; the rest go behind the `+N` badge that names them on hover. No cleverness at the
  boundary — three platforms render as two and a `+1` even though the `+1` is about as wide as the
  badge it replaced, because a rule that sometimes shows the third makes the column's width depend
  on *which* platform the third one is, and `Xiaohongshu` is twice the width of `TikTok`.
- **Sentence case everywhere except `SidebarGroupLabel`.** The nav section eyebrow is the only
  uppercase text in the product.
- **Body is 14/1.5 at weight 400.** 300 is for ≥24px display moments only; headings are 500.
- **Control borders are 1px `--border-input`, not the hairline.** `rgba(23,23,23,.16)` is about
  1.4:1 and fails WCAG 1.4.11 as a control boundary; `#807d76` passes at 4.1:1. Hairlines are
  for dividers and card edges.

Focus lives in one place: a `:focus-visible` rule in the base layer. **Do not add
`outline-none` / `outline-hidden` to anything focusable** — a utility beats the base layer, and
the ring silently disappears. That is why the generated components here have had those classes
removed; re-running `shadcn add` puts them back.

The neutral beige pill (`Badge` default) is `--surface-sunken`, which is also the page canvas —
it is invisible outside a white card. On the canvas use `variant="outline"`.

## Types are generated, not written

Neither client's types are hand-written, and the rule is the same on both sides: a
hand-written duplicate of a backend type drifts the moment somebody adds a nullable column,
and the drift is invisible until a runtime `undefined`.

**BrandFactory** — `@brandfactory/shared` for the shapes (`BrandSummary`, `Workspace`,
`CreateBrandInput`) and `AppType` for the paths. Nothing to run: `tsc` reads the server's
source. `InferResponseType<typeof bf.me.$get>` is how to name a shape the shared package does
not export.

**Operations Hub** — `src/lib/api/schema.d.ts`, generated from a FastAPI OpenAPI document this
repository does not contain, so `pnpm gen:api` is gone and the file is frozen. It shrinks as
Ops screens are replaced. **`src/lib/api/types.ts` is the only file allowed to reach into it.**

## Server state vs client state

Server data goes through **SWR** in `features/<area>/hooks.ts` — cached, deduplicated,
revalidated. Client state (open dialogs, form drafts, filters before they are applied) stays
in `useState`.

Do not put fetched data in a store. And do not call a transport from a component: the service
layer exists so identity is established in one place rather than in a search across the app.

**A user preference is not server state either**, and it is not `useQueryFilters`. The active
workspace, the active brand and the **table row height** are all `localStorage` through
`lib/stored-preference.ts` —
`useSyncExternalStore` with a `null` server snapshot, because reading storage during render is
wrong on the server and seeding from an effect is `react-hooks/set-state-in-effect`. The root
`CLAUDE.md` records the same call for `sidebar-prefs.ts` and `key-dates-prefs.ts`.

Row height is the clearest case of the line, and `lib/table-density.ts` states it: filters,
grouping and sorting go in the URL because they describe *what is on screen* and a pasted link has
to reproduce it; density describes *how the reader likes to look at it*, and a link carrying one
would impose one person's eyesight on somebody else's. The ladder is three literal Tailwind
classes per rung — never `h-[${n}px]`, which emits no CSS at all — applied by
`components/ui/table.tsx` through a context `Table` provides once, and offered by the **View**
panel that `FilterBar` and `FilterToolbar` render for every list screen. A grouped table's band
cannot inherit the cell height (it is a cell with `p-0` and a button inside), so it asks
`useTableDensityClasses` for the same rung.

**The brand half of that is now demoted, which is the promise this note made coming due.** It said
the route would win and the preference become the fallback once brand-scoped routes existed. They
do: `/brands/:id` and everything under it read the id from the path, and nothing there consults
`stored-preference`. What the preference still answers is "which brand was I last in" — the card
`BrandsGallery` marks, and the fallback for a surface carrying no id. `BrandNavHeader` writes it on
the way past so the two cannot disagree, and it writes only a brand the workspace actually holds:
a stale link must not overwrite a good selection with a dead id.

**`features/spaces` has a zustand store, and it is not a violation of that rule** — the
distinction is worth understanding before copying either side of it.

"Do not put fetched data in a store" is about the **server cache**: a second copy of a record
that can go stale against SWR's. The scheme store is not that. It is an **editing draft**, the
same category as the form drafts this file keeps in `useState`, and it is in zustand only
because one draft is shared by a 970-line SVG canvas, a three.js scene, an album and a cost
table — prop-drilling it would couple all four. SWR still owns the fetch (`useSpace`), and
`useSchemeEditor` is the single seam that hydrates the store from it and saves it back.

Two consequences that are specific to that screen and should not be generalised:

- **It autosaves on a 1.5s debounce.** "Nothing is optimistic" is a rule about mutations the
  API may refuse on domain grounds, and it still holds there for create, delete and
  reassignment. It cannot hold for a drag — there is no way to re-render a pointer move from a
  round trip — so what is owed instead is honesty: `SaveIndicator` shows the real state
  (dirty / saving / saved / error / conflict) rather than assuming success.
- **A stale save is a 409, not a retry.** `expected_version` goes up with every save; two tabs
  on one scheme is what happens when somebody opens the plan again to check something, and
  without this the layout saved first vanishes with nothing on screen to say so. The conflict
  state is terminal until reload, deliberately — retrying would be writing over whoever won.

`features/spaces/api.ts` is also the one service allowed to touch `fetch` directly, for the
digitise upload: it streams NDJSON and multipart, and `apiFetch` reads one JSON body. It
composes `API_URL` and `authHeaders` from `lib/api/client.ts`, so identity is still established
in one place — which is the property the rule protects.

SWR keys are arrays including the filters — `["outlets", filters]`. A concatenated string
key looks fine until `?status=open` and `?status=closed` collide.

## Sensitive fields

`/outlets/{id}/network` returns a **different shape** depending on the caller's role. The
non-privileged response has no `password_*` fields *at all* — not null, absent. Narrow with
`hasSensitiveFields()` from `lib/api/types.ts`; do not test for null, because null means
"no password recorded", which is a different thing from "not allowed to see it".

`has_password_guest` / `has_password_staff` are on both shapes, so the UI can say "a
password is on file, you cannot see it".

**`contract.value` is the second sensitive field**, same construction: `ContractRead` has no
`value` key at all, `ContractSensitiveRead` carries it, and `has_value` is on both. Narrow
with `hasContractValue()` from `lib/api/types.ts` — a deliberate sibling of
`hasSensitiveFields()`, not an overload, because the two record types share nothing but the
idea. The contract form omits `value` from the payload entirely when the caller cannot see
it, exactly as the network form omits passwords.

`PasswordValue` renders the three states that follow from this — **not recorded** (`has_password_*`
false), **on file but restricted** (true, and the field is `undefined` because it does not exist on
this shape), and **visible**. Test `value === undefined` for the middle one, never falsiness: `null`
means the field came down empty. Values are concealed until revealed and copy works without
revealing, because this page gets opened on a laptop in a dining room.

In the network form the password inputs are `type="text"` and are **omitted from the payload
entirely** when the caller cannot see them. Sending `null` would clear a credential nobody was
shown, and the backend answers a password write without the ops role with a 403 rather than a
silent drop — for exactly that reason.

## Errors

`apiFetch` throws `ApiError` with `.status` and the flattened `detail` (FastAPI sends a
string for domain errors and an array for validation errors; the client normalises both).
`components/layout/query-states.tsx` renders the distinction that matters — a 403 and an
unreachable API are different problems, and one message for both sends the reader to the
wrong place.

## Two backends, and the split is by feature

There are **two API clients** here, and which one a feature folder uses is the whole boundary.
A feature reads one or the other, never both.

| | `lib/api/client.ts` — `apiFetch` | `lib/api/bf-client.ts` — `bf` |
| --- | --- | --- |
| Serves | the remaining Operations Hub areas | BrandFactory: identity, workspaces, brands, the brand profile and its guidelines, outlets |
| Backed by | fixtures in `src/fixtures/` (`mock.ts`) | the Hono server, `packages/server` |
| Types from | `lib/api/schema.d.ts` (frozen, generated) | `@brandfactory/shared` + `AppType` |
| Auth | nothing to send | `Authorization: Bearer <session token>` |

`bf` is `hc<AppType>` and `AppType` is inferred from the chained `.route()` calls in
`packages/server/src/app.ts`, so a route signature change is a **type error here**, not a 404
in a browser. Never hand-write a BrandFactory route path or response shape — that is the rule
the root `CLAUDE.md` protects, and the generated `schema.d.ts` is the Ops-side equivalent.

`apiFetch` is untouched and is not going away until the screens that read it do.

**Some BrandFactory routes call a model and write nothing, and they are not read state.**
`POST /brands/:id/ideate/themes` was the first; `POST /workspaces/:id/influencers/lookup` — quick
add's creator lookup — is the second. Four things follow for a client, and all four are visible in
`features/influencers/hooks.ts`:

- **Never SWR.** These are commands somebody presses a button to run, they cost real money per
  press, and their answer is a proposal rather than a fact about the workspace. Caching one means a
  second press on a corrected handle silently replays the first press's answer.
- **Nothing to invalidate.** The call writes no row. The roster changes when the person confirms
  the draft, and that goes through the ordinary create, which sweeps the scopes itself.
- **The honest outcomes ride in the body with a 200.** `not-found` and `invalid-shape` are answers,
  not faults, and neither is fixed by retrying — so `callJson` must not be handed them as errors. A
  **503** is different and is real: it means this deployment has no search-grounded model
  configured, and the message names the fix.
- **The double-click guard is the client's.** There is no spend cap on this class of call — it runs
  on the workspace's own configured LLM tokens — so an `isPending` that disables the button is the
  only thing between one press and two.

And **nothing a model returns is written without somebody seeing it.** Quick add is two presses
with a review screen between them, and the review screen shows what the *search layer retrieved*
rather than what the model cited, because a model that fetched nothing still returns confident
sources. An empty retrieval list is rendered as an empty retrieval list. Do not add a path that
writes a model's answer straight to a record.

## Auth

**Real, and it is `packages/web`'s.** Supabase magic link / Google, or a dev token against
`AUTH_PROVIDER=local`, which is the server's shipped default.

- `auth/store.ts` — the token and the user id. `useSyncExternalStore` over `sessionStorage`.
- `auth/session.ts` — the Supabase client, the pre-emptive refresh (`getFreshAuthToken`), the
  sign-out ordering, and the event bridge back into the store.
- `auth/auth-boundary.tsx` — mounted in `app/(app)/layout.tsx`. **Everything in the route
  group is behind it**, fixture-backed Ops screens included.
- `app/sign-in/` — outside the group, because a gate cannot gate its own door.

Three things that will bite:

- **The server snapshot is always signed out.** `sessionStorage` does not exist during SSR, so
  `getServerAuthState()` returns a frozen `{token: null}` and *must not* be made to guess.
  Anything that branches on the session has to do it after hydration — in an effect, or through
  `useAuthState()` — never during a render that the server also performs.
- **A prerendered page under `(app)` is the boundary's spinner, not the page.** That is the cost
  of a client-side session and it is paid once, in the shell. Server pages under the group still
  render their `PageHeader` on the server; it just does not reach the static HTML.
- **A 401 anywhere signs you out.** `callJson` calls `logout()` on 401, the boundary watches the
  token go null, and it navigates *then* clears the SWR cache. Do not reorder those two, and clear
  it through `useClearCache()` — a bare matcher cannot reach the paginated lists (see above).

## Running

```bash
cp .env.example .env.local
pnpm -F @brandfactory/web-next dev
```

The **BrandFactory API must be running** for the sidebar header and sign-in to work
(`pnpm -F @brandfactory/server dev`, or `pnpm dev` for the whole stack). The Ops screens do not
need it — they are fixtures — but the shell around them now does.

**No CORS setup.** `next.config.ts` rewrites `/api/*` to `API_PROXY_TARGET` (`:3001` by
default), exactly as Vite proxies for `packages/web`, so the browser sees one origin. Do not
reach for `CORS_ALLOWED_ORIGINS` on the server in dev — it is unset there on purpose, and
setting it is a second thing to keep in step with a port number.

## Tests

`vitest.config.ts`, listed in the root `vitest.workspace.ts`, so `pnpm test` at the root runs
it. jsdom, globals, the `@` alias, `src/test-setup.ts`.

**Not the screens.** The Operations Hub half of this app has no tests and this is not where they
would start. What is here is the logic that is invisible in a browser pass until the day it is
wrong: a token refresh, a sign-out ordering, the boundary's three states, the landing-workspace
fallback, the two shapes a server refusal arrives in, and the cache keys a matcher cannot reach.

**A cache test needs a `$inf$` key in it.** The sign-out sweep's regression test seeds four keys,
three of them matcher-blind, because a fixture holding only plain keys passes against the broken
implementation as readily as the fixed one. Same rule for anything that claims to clear or
invalidate: put the key the mechanism is blind to in the fixture, or the test asserts nothing.

## Before committing

```bash
pnpm lint && pnpm typecheck && pnpm build
```
