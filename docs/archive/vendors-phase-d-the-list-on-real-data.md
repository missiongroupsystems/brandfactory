# Vendors Phase D — the list on real data

`/vendors` stops rendering `fixtures/agencies.ts` and `fixtures/contracts.ts` and starts rendering
the companies the Hono server holds. The release's centre of gravity, and the phase where the
screen's numbers become true: the route is exhaustive, so the footer states a **total**, and three
columns whose only source was sixteen invented agreements are gone rather than carried across as
zeros.

Phase D of [`./vendors-on-real-data-plan.md`](./vendors-on-real-data-plan.md),
on [Phase A](./vendors-phase-a-the-record.md), [Phase B](./vendors-phase-b-routes-and-seed.md) and
[Phase C](./vendors-phase-c-the-ops-copy-moves-aside.md).

No migration, no server change, no wire change. 8 files: 3 new, 5 modified. `packages/web` is
untouched.

After this phase: **2354 passed | 140 skipped**, and **2494 | 0** with `DATABASE_URL` set. The
count does not move, which §7 explains rather than hides.

---

## 1. The shape that landed

```
packages/web-next/src/features/vendors/api.ts                        NEW   118 lines, 5 methods
packages/web-next/src/features/vendors/hooks.ts                      NEW    53 lines, useVendors
packages/web-next/src/features/vendors/components/vendors-browser.tsx NEW  385 lines
packages/web-next/src/lib/api/cache.ts                               + bfVendors / bfVendor
packages/web-next/src/lib/api/cache.test.ts                          + 2 assertions
packages/web-next/src/lib/labels.ts                                  + VENDOR_CATEGORY_{LABELS,ICONS,OPTIONS}
                                                                     VENDOR_STATUS_* re-keyed off shared
packages/web-next/src/app/(app)/vendors/page.tsx                     points at the new browser
packages/web-next/AGENTS.md                                          the "may state a total" rule
```

`features/registry-vendors/` is **not touched**. That is what Phase C bought: the Ops book kept
serving `/contracts` and the review queue throughout, out of a folder this phase never opened.

---

## 2. Three columns went, and they were the point

`Contracts`, `Next end`, and — on the detail page's summary line, which Phase E will write — the
counts behind them. `contracts_total`, `contracts_active` and `next_contract_end` were computed
in `fixtures/contracts.ts` from sixteen invented agreements, and this server holds no contract at
all.

They are removed rather than pinned to zero. A vendor holding three live retainers reading
`0 contracts` is the failure `brand_ids_covered`'s own docstring already argued about
`outlets_covered`: **a count derived from a fixture and rendered beside a real row is a false
statement that looks like a true one**, and zero is the most convincing false value there is.

**The Brands column stayed and stopped being derived**, which is the difference between it and the
three. It showed which brands a vendor's *live agreements* were held for; it shows which brands
the company works on, out of `vendor_brands`. The cell's empty state changed with it, and that
change is not cosmetic:

- `Group level` is a statement about an **agreement** held for the whole group, deliberately, with
  nothing to fix. It was correct while the ids came from contracts.
- `Not assigned yet` is a statement about a **company** nobody has put against a brand. Two of the
  nine seeded rows are in that state.
- The em dash would be wrong for both, because `Value` has taught these tables it means "not
  recorded".

The old cell needed *two* empty states — `Group level` when a vendor held a live agreement for no
named brand, the em dash when it held none — because it was rendering a projection. One fact needs
one word.

---

## 3. The brand index moved, and this is not the thing AGENTS.md bans

The table resolved `brand_ids_covered` through `useBrandIndex` — `fixtures/brands.ts`, the
Operations Hub's invented F&B group. It now reads the workspace's real brands through
`useActiveBrand()`, which is `useWorkspaceBrands` under one shared SWR key, so the screen adds no
second request.

The ban in AGENTS.md — *"do not 'fix' this by pointing the contracts table at
`useWorkspaceBrands`"* — is about `/contracts`, and it is correct there: a contract's `brand_ids`
**are** fixture ids. Here the **data itself moved**, so the index has to move with it. This is the
second time that distinction has been drawn, after 1.40.0, and the reason `BrandNamesCell` needed
**no edit at all**: it was widened to `Map<string, NamedBrand>` rather than re-pointed, so it
serves `useBrandIndex` and `useWorkspaceBrands` alike. `/contracts` and `features/registry-vendors`
keep the Ops brands and are unchanged files.

One consequence worth stating, the same one influencers earned: an unresolvable id in this cell
can now **only** be a request in flight. Both sides of `vendor_brands` cascade, so a deleted brand
takes the link with it and cannot leave a dangling reference — which is the whole argument for the
join table over a `uuid[]` column, and what makes the `…` honest here rather than ambiguous.

---

## 4. Four filters, not two, and every one of them narrows an array the client holds

The plan said *"the search box and the two selects"*. There are **three selects** — brand, category
and status — and the third is not scope creep: the record carries exactly three filterable
dimensions, and leaving one of them without a control would be an arbitrary choice about which. The
plan's own "what is deliberately not done" section already assumes a brand filter exists (*"the
nav's active brand does not filter this screen. The brand filter is explicit"*), and the category
vocabulary is the thing this release invented.

`FilterBar` and not the `FilterToolbar` + `FilterPopover` pair `/influencers` uses. Measured at
1280: the search field at `sm:w-72` plus three selects at `sm:min-w-44` is about 850px with the
gaps, and this screen has no primary action competing for the right-hand end of the row. The panel
is what a fourth select buys.

Filter keys: `q` and `status` are the two this screen already owned, so **a link shared before this
release still narrows the same way**. `brandId` and `category` are new. Unlike `/influencers`
there is no old `?brand_id=` to translate, because the Ops table never had a brand filter.

Two predicates are not equality tests:

- **Brand is a `contains`** over the row's set — a company can work on more than one. `.some((id)
  => id === filters.brandId)` and not `.includes`, because `brandIds` is `BrandId[]`, the branded
  type, and `includes` demands its own element type where `===` accepts the plain string a URL
  param is.
- **Search is name *or* UEN**, both of them the row's own fields, so the predicate joins to nothing
  and the label names both. The UEN is what somebody pastes in from a portal and it is already
  rendered in the first column; `HighlightMatch` marks it in place, per the rule AGENTS.md sets for
  a search that spans more than the title.

**A vendor with no category matches no category filter rather than falling into `other`.** The two
are different facts — `null` is "nobody has said", `other` is "somebody said, and none of these" —
and sweeping the first into the second is what the nullable column exists to prevent. One of the
nine seeded rows is `null` and none is `other`, which is what makes that visible.

`filterIdentity` and the `key=` on the results component went with the pagination, exactly as they
did on `/influencers`: they existed to reset an accumulated page count, and there are no pages. The
250ms debounce on `q` stays — the highlight recomputation down a growing book is the real cost.

---

## 5. Two cells that state a fact where the em dash would lie

**Category renders the em dash, and here it is right.** This is the opposite call to the influencer
table's `Generalist`, and the two are consistent rather than in tension: `null` on that union means
a creator genuinely has no vertical, so the em dash would have stated the one thing the schema went
out of its way not to mean. `null` here means nobody has said, and `other` is the member for
somebody having said. "Not recorded" is exactly what this is.

**A vendor with contacts but no primary shows the count, not the em dash.** `VendorContactsSchema`
allows *at most* one primary, not exactly one, and one of the nine seeded rows carries a person
nobody has appointed — an ordinary state, not a broken row. The em dash in the `Primary contact`
column would say there is nobody to call while the record holds somebody, so the cell reads
`1 contact` in tertiary ink instead: a stated fact that also points at the record page. An empty
list still gets the em dash, because then there genuinely is nobody.

This is the one change in the phase that was not in the plan and is visible on screen. It was found
by reading the seed's own docstring, which had put that row there on purpose.

---

## 6. The labels, and where the teeth are

`VENDOR_CATEGORY_LABELS` and `VENDOR_CATEGORY_ICONS` are new, keyed off the shared
`VendorCategory`, so **a new enum member fails the typecheck until it has a label and a glyph**.

`VENDOR_STATUS_LABELS`, `_TONES` and `_OPTIONS` were re-keyed off `@brandfactory/shared` and off
the Ops `S["VendorStatus"]`. The two lists are identical member for member — `active | inactive |
blacklisted` — so `features/registry-vendors` keeps type-checking against `VendorRead.status`, and
if they ever diverge those call sites break, which is the signal worth having. The same call
`OutletStatus` made in 1.36.0.

`VENDOR_KIND_*` and `SERVICE_CATEGORY_*` **stay**. The renamed Ops folder and the review queue
still read them, and `ServiceCategory`'s thirteen building trades are still the right vocabulary
for the screen that shows a landlord's aircon contractor.

**Nine of the ten category glyphs are the one `CONTRACT_CATEGORY_ICONS` already gives the same
subject**, and that repetition is deliberate. A media agency and a media buy are the same subject
seen from the two ends of one relationship, so `/vendors` and `/contracts` teach one symbol
vocabulary between them instead of two. `freelancer` is the only new symbol: `UserIcon` against
`talent_agency`'s `UsersIcon` — one person against a company of them, which is the whole
distinction the two members draw.

---

## 7. The scope pair, and why the test count does not move

```ts
bfVendors: "bf-vendors",
bfVendor: "bf-vendor",
```

Prefixed for the reason the outlet and creator pairs are, with one difference: **here the Ops side
moved rather than the plain word being left where it was**. Phase C renamed `vendors` / `vendor` to
`registryVendors` / `registryVendor`, so the plain words are now held by *nobody* — which
`cache.test.ts` already asserted. This phase adds the other half of that invariant: the real pair
is distinct from the registry pair. A collision would not be a crash; it would be `/contracts`
refetching this list forever and this screen refetching `/contracts`'.

The two assertions went **into the existing vendors case** rather than into a new `it`, because
they are the same invariant read from the other end. That is why **2354 does not move**. Nothing
else here is testable in this package by its own convention: `web-next` tests auth, workspace
resolution and the cache keys a matcher cannot reach, **not the screens**.

`SCOPES.bfVendor` is registered and **read by nothing** — Phase E's `useVendor(ref)` is what reads
it. That is the one loose end this phase leaves on purpose, and it is the smaller hazard: a
registered string nothing invalidates costs nothing, where a hook nothing calls is dead code that
type-checks.

---

## 8. What is deliberately absent

**No create control.** `AddMenuButton` is gone from the screen for one phase. The form is Phase F,
and a "New vendor" button that opens a sheet writing to a mock — or to nothing — would be worse
than no button. The empty state's hint says so in as many words and is rewritten when the form
lands. This is the shape influencers Phase C shipped in, and the seed means the empty state is
rarely the one on screen anyway.

**No row actions, and no link on the name.** `/vendors/[id]` still renders the Operations Hub's
detail screen out of `features/registry-vendors`; pointing a real uuid at it would open an error
panel, because that route resolves against `mock.ts`. Phase E moves the page to `/vendors/[slug]`
and the name cell becomes a link then — the slug is on the row, so nothing will have to be looked
up for it.

**`vendorService.get`, `create`, `update` and `remove` are written and unused.** The service layer
is the shape of the route and lands whole; three of the five wait for Phase E and Phase F.

---

## 9. Verification

```
pnpm typecheck                             clean (11 packages)
pnpm lint                                  clean (whole repo)
pnpm format:check                          clean
pnpm test                                  2354 passed | 140 skipped (192 files)
pnpm test  (with DATABASE_URL)             2494 passed | 0 skipped
pnpm -F @brandfactory/web build            clean
pnpm -F @brandfactory/web-next lint        clean
pnpm -F @brandfactory/web-next typecheck   clean
pnpm -F @brandfactory/web-next build       clean — `○ /vendors`, still static
```

**`/vendors` staying static is the check worth naming.** The page reads no `searchParams` — the
browser component under `<Suspense>` reads them through `useSearchParams` — so the route did not go
dynamic the way `/contracts` did when it started reading a param to redirect. `ƒ /vendors/[id]` is
unchanged and still the Ops screen.

### The wire, read directly

The stack was brought up against a migrated and seeded database and the route read with `curl`:

```
GET /workspaces/…0002/vendors        200, 9 rows, name-ascending
  Bellweather PR Pte Ltd     pr_agency     active   uen 201933718E   1 brand   0 contacts
  Fieldnote Studio           production    active   uen null          1 brand   0 contacts
  Halcyon Media Group        media_agency  active   uen null          1 brand   … contacts
  …
```

Camel-cased, `brandIds` and `contacts` as arrays, in the order `byVendorName` states — so the
table's own ordering is the server's and the screen restates nothing.

### The browser pass is **not** done

The stack is up — Hono on `:3001`, `next dev` reporting `✓ Ready` on `:3007`, chosen free after
Phase C's recorded trap (a stale server on `:3000` from the previous day is still listening, and a
browser pass ran happily against it once already). The pass stops at the sign-in form, which needs
the dev token pasted.

What is unseen, and what Phase G's list gains from this phase: whether ten category glyphs are
distinguishable at 16px, whether the table reads as a directory now that three columns have gone,
whether `Not assigned yet` reads as a decision rather than a gap, whether `1 contact` in the
`Primary contact` column reads as "nobody appointed" rather than as a miscount, and whether four
filter controls on one `FilterBar` row wrap sensibly at 1280.

---

## 10. What Phase E needs from this

- `vendorService.get(workspaceId, ref)` exists and takes a **slug or an id**.
- `SCOPES.bfVendor` is registered and nothing reads it. `useVendor(ref)` on that scope is the hook
  deliberately not written yet.
- The name cell becomes a link emitting `vendor.slug`, and `app/(app)/vendors/[id]/` becomes
  `[slug]/`. Both route files move in one step, which is the same swap Phase C set up for this one.
- The Contracts card on that page is a **stated placeholder**, not an empty list. Fixture contracts
  key on fixture vendor ids, so a real vendor would read "No contracts with this vendor" on every
  row — an empty state that lies. 1.35.1's placeholder band is the shape.
