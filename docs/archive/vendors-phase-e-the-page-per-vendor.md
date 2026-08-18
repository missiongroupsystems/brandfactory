# Vendors Phase E — the page per vendor

A vendor has a URL worth pasting. `/vendors/[id]` becomes `/vendors/[slug]`, the Operations Hub's
detail screen stops being what that route renders, and the name cell in the table becomes a link.

Phase E of [`./vendors-on-real-data-plan.md`](./vendors-on-real-data-plan.md),
on [Phase D](./vendors-phase-d-the-list-on-real-data.md).

No migration, no server change, no wire change. 7 files: 3 new, 3 modified, 1 renamed.
`packages/web` is untouched.

After this phase: **2357 passed | 140 skipped**, up from 2354. That is `href.test.ts`, three cases.
With `DATABASE_URL` set: **2497 | 0**.

---

## 1. The shape that landed

```
packages/web-next/src/features/vendors/href.ts                       NEW   vendorHref
packages/web-next/src/features/vendors/href.test.ts                  NEW   3 cases
packages/web-next/src/features/vendors/components/vendor-detail.tsx  NEW   5 cards
packages/web-next/src/features/vendors/hooks.ts                      + useVendor(ref)
packages/web-next/src/features/vendors/components/vendors-browser.tsx  the name cell is a link
packages/web-next/src/app/(app)/vendors/[id]/ → [slug]/              git mv, contents rewritten
packages/web-next/src/app/(app)/vendors/page.tsx                     one docstring paragraph
```

`SCOPES.bfVendor` was registered in Phase D and read by nothing. `useVendor` is what reads it, and
that loose end is now closed.

---

## 2. The Contracts card is the decision on this page

Everything else here is the outlet and creator pages' shape applied to a company. This is the part
that had to be argued.

The Operations Hub's vendor page listed every agreement held with the company, through
`useVendorContracts`. Carrying that across would have rendered **"No contracts with this vendor" on
every vendor, forever** — fixture contracts key on fixture vendor ids (`v2000000-…`, which is not
even a uuid), and no row this server holds can ever match one.

**An empty state that can never be non-empty is not an empty state.** It is a false statement in
the shape of a true one, and the reader has no way to tell it from a company nobody has signed
anything with — which is exactly the failure Phase D removed three columns to avoid.

So the card states its own condition: agreements exist, they are on another screen, and the two
records are not joined yet. 1.35.1's `PillarsBand` is the precedent and the shape — a dashed box
with prose, and a note on the heading (`Not connected yet`) where the Ops page put a summary line
of counts.

**The dashed border is doing the work.** A solid card containing one sentence reads as content that
failed to load; a dashed one reads as a space held open, which is the claim being made.

---

## 3. The route moved, and nothing redirects

`[id]` → `[slug]`, by `git mv`, with the contents rewritten to render this feature's component.
Both halves of the swap in one step, which is what Phase C's rename bought.

**There is no redirect from the old shape and there is nothing to redirect.** The ids in any old
`/vendors/<id>` link are the Operations Hub book's, and this server has never held one — a
translation would have to map an id that does not exist on either side. A pasted stale link answers
`Not found`, which is the truth. The same call 1.40.0 made for `?brand_id=`.

The segment is named `slug` and the value handed down is a **ref**: `GET
/workspaces/:id/vendors/:ref` resolves a slug or a raw uuid. Verified against the seeded server:

```
GET …/vendors/northlight-talent-pte-ltd            200  Northlight Talent Pte Ltd
GET …/vendors/00000000-0000-4000-8000-000000000041 200  the same row
GET …/vendors/no-such-vendor                       404  VENDOR_NOT_FOUND
```

That is what lets `vendorHref` degrade: a row that fetched the whole vendor emits the readable
form, anything holding only an id passes the bare id, and neither depends on a redirect. The
id→slug rewrite on the page is `history.replaceState` and purely cosmetic — `router.replace` would
refetch a row already on screen, because the SWR entry is keyed on the ref.

`vendorHref` carries one warning its sibling does not need: **it must not be given a
`VendorListItem`.** The Ops book's rows have ids of their own and no slug at all, so such a call
would compile against the string overload and emit a link into this page for a record this server
does not hold. That folder does not link to a vendor page and must not start.

---

## 4. `/vendors/[slug]` is dynamic, and `/vendors` is still static

```
○ /vendors
ƒ /vendors/[slug]
```

Unchanged from `ƒ /vendors/[id]`. The list page reads no `searchParams` — the browser component
under `<Suspense>` reads them through `useSearchParams` — so it did not go dynamic when the detail
route beside it moved.

**No `<Suspense>` on the detail route and no `PageHeader`**, matching `/outlets/[slug]` and
`/influencers/[slug]`. Nothing here reads `useSearchParams`, so there is no boundary to add; and
the company's own name is the page title and arrives with the data, so a server-rendered header
would either duplicate it or say "Vendor" over a page about a company.

---

## 5. Five cards, and what is deliberately not among them

**Company** (UEN, category, website), **Brands**, **Contacts**, **Contracts** and **Record** (notes,
web address, added, last updated).

There is no spend, no quotation history, no repair log and no documents, because none of those
exists on this server. Thirteen cards over nothing is the failure `outlet-detail.tsx` records
inheriting from the Operations Hub, and inventing them a second time on a table one release old
would be worse.

Three smaller calls:

- **The Contacts card is full width and its email and phone are links.** That is the point of
  holding them — the common task on this page is reaching somebody, and a number you have to select
  and copy is a number you dial wrong. `VendorContactEmailSchema` validates the address where it is
  declared, which is what makes a `mailto:` href safe; the phone is deliberately unvalidated and
  `tel:` takes whatever a person typed.
- **`Primary` is a badge, not an ordering.** The list stays in `position` order — the order somebody
  entered — because re-sorting to float the primary would lose the only ordering the record carries.
  One seeded vendor has a contact with nobody appointed, which `VendorContactsSchema` allows on
  purpose: *at most* one, not exactly one.
- **The contact rows are keyed on the index**, which is correct here and would be a bug almost
  anywhere else. A contact is a **value object with no id**: the write replaces the whole list, so
  there is nothing stable to key on but where it sits — the same key the table uses,
  `(vendor_id, position)`.

The `Brands` card reuses `resolveBrandNames` rather than mapping the ids itself, so one unresolved
id makes the whole set `…` instead of making the list shorter. Two brands rendered where the row
names three is a false statement that looks like a true one.

---

## 6. No writes on this page yet

No Edit button, no Delete, no `useVendorMutations`. Phase F is the form, and it lands the sheet and
the confirm dialog together.

The record is readable before it is correctable, which is the order the list already shipped in —
and it keeps this phase to one question. The influencer page put both writes here rather than on
the row, and this page will do the same; that is a Phase F decision, not one to pre-empt with a
disabled button.

---

## 7. A stated loose end: two dead components in `features/registry-vendors/`

`vendors-view.tsx` has been unreferenced since Phase D swapped the list page, and
`vendor-detail.tsx` is unreferenced as of this phase. Both are still on disk.

**They are deliberately not deleted here**, and the reason is what the deletion reaches rather than
the deletion itself. Removing them orphans, in turn:

- `useVendorPages` and `useVendor` in `features/registry-vendors/hooks.ts`
- `vendorService.get` in `features/registry-vendors/api.ts`
- `useVendorContracts` in **`features/contracts/hooks.ts`** — another feature
- and then `SCOPES.registryVendor`, which would have **no reader left** — a scope
  `cache.test.ts` pins by name one phase after Phase C wrote that assertion, and which
  `AGENTS.md` documents by name in the split paragraph.

That is a decision about the Operations Hub's vendor book, not about this route, and folding it
into the swap would make a seven-file phase into a twelve-file one whose diff stops reading as *the
page per vendor*. `vendor-form.tsx` is **not** in this set and must not be swept up with it: it is
live, opened by `features/contracts/components/contract-form.tsx` so a contract can create its
counterparty inline.

1.36.0 deleted the four Ops components outlets replaced, at the swap. The precedent says do it; the
cascade says do it as its own step.

---

## 8. Verification

```
pnpm typecheck                             clean (11 packages)
pnpm lint                                  clean (whole repo)
pnpm format:check                          clean
pnpm test                                  2357 passed | 140 skipped (193 files)
pnpm test  (with DATABASE_URL)             2497 passed | 0 skipped
pnpm -F @brandfactory/web build            clean
pnpm -F @brandfactory/web-next lint        clean
pnpm -F @brandfactory/web-next typecheck   clean
pnpm -F @brandfactory/web-next build       clean — `○ /vendors`, `ƒ /vendors/[slug]`
```

2354 → 2357 is `href.test.ts`. The three cases are the slug, the id fallback and the bare ref —
`influencerHref`'s three, because the degradation they pin is the one thing in this phase a unit
test can reach. Nothing else here is testable in this package by its own convention: `web-next`
tests auth, workspace resolution and cache keys, **not the screens**.

### The browser pass is still not done

The stack is up — Hono on `:3001` against a migrated and seeded database, `next dev` reporting
`✓ Ready` on `:3007`, chosen free after Phase C's recorded trap. The pass stops at the sign-in form,
which needs the dev token pasted.

What Phase G's list gains from this phase, on top of what Phase D left: whether the Contracts
placeholder reads as a stated condition rather than a broken card, whether five cards in a
two-column grid balance when a vendor has no contacts and no brands (six of the nine seeded rows
have no contacts, two have no brand), whether the slug in `Web address` reads as useful rather than
as debug output, and whether the id→slug rewrite is invisible when a link built from an id lands.

---

## 9. What Phase F needs from this

- `vendorService.create`, `update` and `remove` exist and are unread. `useVendorMutations` —
  invalidating **both** `bfVendors` and `bfVendor` on every write — is the hook not written yet.
  `SCOPES.contacts` is *not* to be invalidated: that is the Ops address book and this write does
  not touch it.
- The header on this page has room for `Edit` and `Delete` where `influencer-detail.tsx` puts them,
  and the table needs no actions column for it — the page is where a record is corrected and
  removed, because it is the only surface showing the whole thing.
- The delete dialog's copy loses *"its contracts keep their history that way"*. This server holds
  no contract, and §2 above is why.
- The `Category` select re-points at `VENDOR_CATEGORY_OPTIONS` and its hint — *"The trade they
  mostly work. Shared with contracts."* — is rewritten. It has been false since 1.37.0.
