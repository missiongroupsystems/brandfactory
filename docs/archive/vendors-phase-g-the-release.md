# Vendors Phase G — the release

The full gate, the `Sample` tag the release owed `/contracts`, the changelog entry, and these notes
moved to `docs/archive/`. **1.43.0.**

Phase G of [`./vendors-on-real-data-plan.md`](./vendors-on-real-data-plan.md), on
[Phase F](./vendors-phase-f-the-form.md).

No migration, no server change, no wire change. 3 files: `nav.ts`, `nav.test.ts`, `changelog.md`,
plus eight documents moved.

Final: **2371 passed | 140 skipped**, and **2511 | 0** with `DATABASE_URL`.

---

## 1. The tag, and why it took this release to earn

```ts
{ title: "Contracts", href: "/contracts", icon: FileSignature, phase: 2,
  tag: "Sample", description: "Agreements and service visits" },
```

`/contracts` has rendered, filtered, grouped and created against `fixtures/contracts.ts` and its
own nine-company vendor book since it arrived, and it carried no tag. That was defensible while
every screen around it did the same: a tag on every row is a tag on none.

It stopped being defensible the moment `/vendors` read the server. **A vendor added on one screen
cannot be selected on the other**, because a static fixture cannot hold the id of a row a live
server just created — the reason `fixtures/brands.ts` gives for not re-pointing that table at
`useWorkspaceBrands`, one aggregate over. Two vendor books are on screen at once and only one of
them is real.

The nav's `tag` field exists for exactly this and its docstring already defined the word:
*"**Sample** is a real screen reading placeholder content."* That is `/contracts` exactly.

`nav.test.ts` gains a case, and **its second half is the point**: `/vendors` must carry no tag.
Asserting only that Contracts has one would pass just as well on a nav that tagged everything.

## 2. The nav changed underneath this release

`nav.ts` was rewritten by **1.42.0** while Phases D–F were being written — the workspace/brand nav
split, `Registry` gone, `Tools` arrived, and the tag vocabulary grown from two words to three
(`Mock`, `Sample`, `Empty`). Phase F's note recorded the resulting `nav.test.ts` failure as
somebody else's in-flight work and left it alone; that work has landed and its test has followed.

Two things were checked rather than assumed before adding the tag:

- **`/contracts` and `/vendors` are both still in the workspace nav**, in `Contracts & services`
  with `/quotations` and `/influencers`. Neither moved into the brand-scoped nav, which is correct:
  both are tables across all brands with a brand column and a brand filter.
- **`useActiveBrand` survives the brand-switcher deletion.** `vendors-browser.tsx`,
  `vendor-detail.tsx` and `vendor-form.tsx` all read the workspace's brands through it.

## 3. The gate

```
pnpm typecheck                             clean (11 packages)
pnpm lint                                  clean (whole repo)
pnpm format:check                          clean
pnpm test                                  2371 passed | 140 skipped (193 files)
pnpm test  (with DATABASE_URL)             2511 passed | 0 skipped
pnpm -F @brandfactory/web build            clean
pnpm -F @brandfactory/web-next lint        clean
pnpm -F @brandfactory/web-next typecheck   clean
pnpm -F @brandfactory/web-next build       clean — 32 routes, `○ /vendors`, `ƒ /vendors/[slug]`
```

**The count needs reading carefully, because two releases interleaved in one working tree.** This
work took the tree from 1.41.1's 2292 to **2358**: 28 in Phase A, 33 in Phase B, 1 in Phase C, none
in Phase D, 3 in Phase E, none in Phase F, 1 here. 1.42.0 added its own 13 in between, which is how
the final number is 2371. The 25 new skips are `vendors.live.test.ts`.

The seed figures quoted in the changelog were counted out of `seed.ts` rather than remembered: 9
vendors, 8 brand links, 4 contacts, 2 of them primary.

## 4. The browser pass was **not** done, for the third release running

This is the phase that owed it, and it is the one thing on the plan's Phase G list that did not
happen.

The stack was up throughout: migration 0015 applied, the book seeded, Hono on `:3001`, `next dev`
reporting `✓ Ready` on `:3007` — a free port chosen after Phase C's recorded trap, where a stale
server from the previous day served a browser pass that looked correct. The pass stops at the
sign-in form, which needs the dev token pasted, and pasting a token into a field is not something
this session does.

**What was done instead** is the whole read and write path driven against the running server, which
covers the wire but not one pixel:

```
GET    …/vendors                                    9 rows, name-ascending, camelCase
GET    …/vendors/northlight-talent-pte-ltd          200   the slug resolves
GET    …/vendors/<uuid>                             200   the same row
GET    …/vendors/no-such-vendor                     404   VENDOR_NOT_FOUND
POST   …/vendors  {"name":"…"}                      201   slug chosen, every optional field null
POST   …/vendors  {…,"uen":"<taken>"}               409   VENDOR_UEN_TAKEN, message names the number
PATCH  …/vendors/:id  category+brandIds+contacts    200   all three applied together
PATCH  …/vendors/:id  primary swapped               200   one request
PATCH  …/vendors/:id  no primary at all             200   the state a radio group cannot express
PATCH  …/vendors/:id  two primaries                 400   "At most one contact can be the primary"
DELETE …/vendors/:id                                200   book back to nine
```

**The cumulative unseen list**, which is what the next browser pass has to work through:

*From Phase D* — whether ten category glyphs are distinguishable at 16px; whether the table reads
as a directory now that `Contracts` and `Next end` have gone; whether `Not assigned yet` in the
Brands column reads as a decision rather than a gap; whether `1 contact` in the `Primary contact`
column reads as "nobody appointed" rather than as a miscount; whether four filter controls on one
`FilterBar` row wrap sensibly at 1280.

*From Phase E* — whether the Contracts placeholder reads as a stated condition rather than a broken
card; whether five cards in a two-column grid balance when a vendor has no contacts and no brands
(six of nine have no contacts, two have no brand); whether the slug in `Web address` reads as
useful rather than as debug output; whether the id→slug rewrite is invisible.

*From Phase F, and the largest part because every one is a write* — whether the contacts editor is
usable at three contacts; whether an exclusive checkbox reads as "at most one" rather than as a
broken radio; whether the 409's long message fits the form panel without pushing the fields off
screen; whether two edit doors to one sheet reads as convenience rather than duplication; whether a
create, an edit and a delete each leave the table saying what happened.

*New here* — whether the `Sample` chip on Contracts is legible beside `Mock` on Quotations and
`Empty` on the two Tools rows, now that three tags share one nav.

## 5. Documents

The plan and all seven phase notes moved from `docs/executing/` and `docs/completions/` to
`docs/archive/`, per the convention. Their relative links were rewritten to match, and every one
resolves.

One inherited dead link was fixed on the way: the plan opened by citing
`../archive/outlets-on-real-data.md`, which **no longer exists** — the archive was emptied by a
staged documentation cleanup before this work began, taking the outlets and key-dates notes with
it. The citation now names the release and points only at the influencers plan, which is still
there.

`docs/completions/` and `docs/executing/` are left holding one document each, both belonging to
1.42.0's brand-scoped sidebar, which is not this release's to move.
