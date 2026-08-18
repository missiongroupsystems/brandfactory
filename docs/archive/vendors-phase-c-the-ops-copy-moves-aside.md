# Vendors Phase C — the Ops copy moves aside

**Nothing on screen changed. `features/vendors/` is free for Phase D.**

Phase C of [`./vendors-on-real-data-plan.md`](./vendors-on-real-data-plan.md),
on [Phase A](./vendors-phase-a-the-record.md) and
[Phase B](./vendors-phase-b-routes-and-seed.md). The Operations Hub's vendor book moved to
`features/registry-vendors/` whole and unedited, twenty import sites were re-pointed, and two cache
scopes took the `registry-` prefix.

After this phase: **2354 passed | 140 skipped**. That is one new cache test. 26 files: 5 renamed,
21 modified — and **no file's behaviour changed**.

---

## 1. Why the rename is the phase

`features/vendors/` holds three components, a service layer and five hooks, all of them typed
against `VendorRead` out of the frozen `schema.d.ts` and all of them fed by `mock.ts`. Phase D
writes a new `features/vendors/` against the Hono server. Two folders cannot share a name, and two
components called `VendorsView` in one build is the actual hazard — not the import paths, which the
compiler catches.

So the Ops copy moves out of the way *first*, in a phase that ships nothing, because that is what
makes Phase D a swap of two route files rather than a rename tangled up with a rewrite.

**It is a rename and not a deletion**, and the reason is `/contracts`. That screen is live, it is
entirely fixture-backed, and it resolves every `contract.vendor_id` to a name through
`useVendorIndex`. The review queue creates a contact against a vendor through the same folder.
Sixteen fixture agreements name those nine companies by *their* ids — `v2000000-…`, which is not
even a uuid — so the real vendors cannot serve that screen and pointing it at them would render
`Group level` where a company name belongs.

`features/registry` (outlets) and `features/registry-brands` (brands) are the two precedents, and
this is the third time the same call has been made.

---

## 2. What moved

```
features/vendors/  →  features/registry-vendors/
    api.ts
    hooks.ts
    components/vendors-view.tsx
    components/vendor-detail.tsx
    components/vendor-form.tsx
```

Via `git mv`, so the history follows. **Not one line inside those five files changed** beyond the
two cache-scope identifiers and three docstrings. `VendorRead` is still snake_case, still carries a
`kind` and a `ServiceCategory` of thirteen building trades, and still comes from the frozen
`schema.d.ts`.

**Twenty import sites** re-pointed — the plan said twelve, which counted files rather than lines;
five files import more than one symbol or mention the folder in prose:

- **Live:** `contracts` ×5 (`contracts-view`, `contract-detail`, `contract-form`,
  `contract-extraction-review`, `hooks.ts`), `review/review-actions`.
- **Route files:** `app/(app)/vendors/page.tsx` and `app/(app)/vendors/[id]/page.tsx`, which is what
  keeps this phase shippable — they still render the Ops screens, out of the renamed folder, and
  Phase D swaps them in one move.
- **Cut-from-nav:** `tenancies` ×6, `expenses` ×2, `registry/close-dialogs`. Re-pointed rather than
  left dangling.

A missed import here is a type error, so `pnpm typecheck` is the proof and it is clean.

---

## 3. The scopes, which are the actual risk

```ts
registryVendors: "registry-vendors",
registryVendor: "registry-vendor",
```

**A missed import is a type error. A missed scope *string* is neither a type error nor a runtime
surprise** — it type-checks, it lints, it builds, and it looks right in a browser. What happens is
that one area's writes refetch another area's lists forever, or stop refetching their own. That is
the failure `cache.test.ts` exists for, and its docstring already names the outlet pair as the case
it was written against.

Both the key and the string moved together, as `registryBrands` did. Both are cache identity only,
so **nothing on the wire moved** — the Ops backend's path is still `/vendors`, and that is not this
app's to rename.

Three call sites outside the renamed folder hold these scopes: `contracts/hooks.ts` (a write to a
contract invalidates the vendor lists that embed it) and `contacts/hooks.ts` (a contact write
invalidates the vendor lists that embed the rows). Both were re-pointed.

`cache.test.ts` gained a fourth case, beside the outlet and creator pairs:

```ts
it("keeps BrandFactory's vendors apart from the Operations Hub's book", () => {
  expect(SCOPES.registryVendors).toBe("registry-vendors");
  expect(SCOPES.registryVendor).toBe("registry-vendor");
  expect(SCOPES).not.toHaveProperty("vendors");
  expect(SCOPES).not.toHaveProperty("vendor");
});
```

The `not.toHaveProperty` half is the point. The existing "holds no duplicate strings" loop cannot
catch the tempting future edit — dropping the prefix once the real one owns the screens — because
that edit *removes* one entry and renames the other, leaving no duplicate. This asserts the
unprefixed names stay absent, which is the same shape the creator case already uses.

---

## 4. The docstrings

Three said "the vendors feature" and now name the Operations Hub's book, on
`features/registry-brands`' model. `registry-vendors/api.ts`' header gained the paragraph that says
what the folder *is* — snake_case, `kind`, thirteen building trades, `mock.ts` — and why it is still
live.

`packages/web-next/AGENTS.md` gained a paragraph beside the three splits it already documents.
**That is one step beyond the plan's item 4**, which asked only for the docstrings. It was added
because that file already explains the outlet, creator and brand splits by name, and a fourth split
left undocumented is the one a future reader closes by "tidying up" the scopes. It carries the
warning explicitly: *do not close the gap by re-pointing `/contracts` at the real vendors.*

---

## 5. Verification

```
pnpm typecheck                             clean (11 packages)
pnpm lint                                  clean (whole repo)
pnpm format:check                          clean
pnpm test                                  2354 passed | 140 skipped (192 files)
pnpm test  (with DATABASE_URL)             2494 passed | 0 skipped
pnpm -F @brandfactory/web build            clean
pnpm -F @brandfactory/web-next lint        clean
pnpm -F @brandfactory/web-next typecheck   clean
pnpm -F @brandfactory/web-next build       clean — `○ /vendors`, `ƒ /vendors/[id]`, unchanged
```

2353 → 2354 is the one cache test. The static/dynamic split on both vendor routes is byte-identical
to before the rename, which is what "nothing changed" means for a build.

### The browser pass

The plan's Phase C ships on *"`pnpm -F @brandfactory/web-next build` and a click through
`/contracts`"*. Both done, against the Hono server on a seeded database:

| Screen | Result |
| --- | --- |
| `/contracts` | All nine vendor names resolve — Northlight, Kite & Co, Halcyon, Loopline, Fieldnote, Sunbeam, Redpin, Bellweather, Tidewater. **No `…` anywhere**, which is the whole test: an unresolved id is what a broken `useVendorIndex` looks like. |
| `/contracts/[id]` | The Record card's `Vendor` row reads *Northlight Talent Pte Ltd*. |
| `/vendors` | The unchanged Ops screen — nine fixture rows, `Category` monotone at `Other`, the `Contracts` and `Next end` columns still there, both UENs shown. Exactly what Phase D replaces. |
| `/review` | Renders; `review-actions` imports resolve. |
| Console | No errors on any of the four. |

**One trap worth recording, because it cost a full false verification.** A `next dev` server from
the previous day was already listening on **:3000**, so `pnpm -F @brandfactory/web-next dev` failed
with `EADDRINUSE` — and the browser pass ran happily against **that stale build**. It looked
correct, which is what made it dangerous: the only visible tell was a `Spaces` item in the nav,
removed in 1.41.0 and absent from `nav.ts` on disk. The pass was redone on a free port against a
server whose log said `✓ Ready`. **Check the dev log for `Ready`, not the browser for a page** — a
served page proves a server is running, not that it is yours. The pre-existing server was left
alone rather than killed.

---

## 6. What Phase D inherits

The folder name, and the centre of gravity: a new `features/vendors/` on `bf` / `callJson`,
`useVendors` on `[SCOPES.bfVendors, workspaceId]`, a `vendors-browser.tsx` rewritten from
`vendors-view.tsx` with the filters client-side, and `app/(app)/vendors/page.tsx` swapped over.

Three columns go with the swap — `Contracts`, `Next end`, and the counts on the detail page's
summary line — because their only source is `fixtures/contracts.ts`. The `/vendors` screenshot above
is what those columns look like today, and every number in them is derived from sixteen invented
agreements.

`BrandNamesCell` needs no edit: it was widened to `Map<string, NamedBrand>` in 1.40.0 rather than
re-pointed, so it serves `useBrandIndex` and `useWorkspaceBrands` alike.
