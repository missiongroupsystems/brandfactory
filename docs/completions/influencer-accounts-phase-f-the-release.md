# Influencer accounts Phase F — verify and release

**The gate, the browser pass, and two defects the browser pass found.**

Phase F of [`./influencer-accounts-plan.md`](./influencer-accounts-plan.md).
No new feature work. What landed is the verification the plan asked for, one fix to each of the two
screens Phase D wrote, and the release.

`2583 tests — 2583 passing` with a database, 2436 passing and 147 skipped without one.
**Migration 0016.**

---

## 1. The gate

| | |
| --- | --- |
| `pnpm typecheck` | clean, all 11 packages |
| `pnpm lint` | clean |
| `pnpm format:check` | clean |
| `pnpm test`, `DATABASE_URL` set, database created empty and migrated 0000 → 0016 | **2583 passed, 0 failed** |
| `pnpm test`, no `DATABASE_URL` | 2436 passed, 147 skipped |
| `pnpm -F @brandfactory/web build` | clean |
| `pnpm -F @brandfactory/web-next lint && typecheck && build` | clean |

The suite was run twice against real Postgres: once on the dev database that carried the
pre-migration rows, and once on a database created empty. **The backfill was measured rather than
reasoned about** — 19 creators before, 19 accounts after, and a follower sum of 5,451,390 either
side.

One stale test was fixed rather than carried: `outlets (live DB) > lists a workspace in name order`
asserted `rows.length === 6` against a seed that has written **ten** outlets since 1.44.0, and
compared the SQL ordering against a JavaScript `<`, which demands `Willow` before `temper. Duxton`
where `en_US.utf8` answers the opposite. It is now 10 and `Intl.Collator`, with a comment saying a
`LC_COLLATE=C` database would need the code-unit comparison back. It has nothing to do with this
change and had been failing since 1.44.0.

---

## 2. The browser pass

The seed holds no multi-account creator, so the pass **created one first** — which is the sequence
the plan specified and the reason the pass had to wait for Phase E.

Seven things were driven end to end:

1. **The roster on the new record.** Platforms as a set, Reach as a sum, blended engagement, the
   tier read off the total.
2. **A create with three accounts** — Instagram + TikTok on one handle, XiaoHongShu on `@美玲` with
   a profile URL. The duplicate flag was tripped deliberately first: a second Instagram row on
   `@meilingtan` drew *"This platform and handle are already on the account above"* **on the row**,
   before submit, and cleared when the platform changed.
3. **The row that came back**: `Instagram, TikTok, Xiaohongshu` · `140k` with `3 accounts` beneath ·
   `5.0%` blended — which is `(4.0×60k + 6.2×50k) ÷ 110k`, with the unmeasured XHS account out of
   both halves. She lands in **Mid-tier**, where every one of her three accounts alone would be
   Micro. That is the defect this release exists to correct, on screen.
4. **The detail page**: the Accounts card first, `Primary` on position 0, the exact per-account
   counts, and the derived Audience card.
5. **An edit**: `Make primary` moved XiaoHongShu to the top, the header's handle followed it to
   `@美玲`, the profile URL survived the reorder, and the total and the blend did not move.
6. **Search on a non-primary handle**: `?q=meilingtan` returns her and the Creator cell shows
   `@meilingtan` — the handle that matched — rather than the primary. Without that rule the row
   would have highlighted nothing and read as a false positive.
7. **`?platform=tiktok`** returns her, because the predicate is now *has an account on* rather than
   *is on*. **The 409** on `@priyaskin` reads *"@priyaskin on instagram is already on Priya
   Raman's record. Open that creator and add the account there, or use a different handle."*

The created record was deleted afterwards, and the cascade took its three account rows with it:
19 creators, 19 accounts.

---

## 3. The two defects the pass found, and the fixes

**The unmeasured rate rendered `…`, which is this app's mark for a request in flight.** Phase D
wrote `PENDING` into the Accounts card for an account with no engagement rate. `lib/format.ts`
declares the two constants side by side precisely so the choice is made deliberately: `EMPTY` is
"not recorded", `PENDING` is "the fetch has not arrived". A rate nobody has measured is the first,
and the ellipsis told the reader a number was on its way. It is `Value` now, which renders the em
dash and an `sr-only` "Not recorded".

**A link that looked exactly like plain text.** Three handles sit in one column and only the ones
carrying a `url` are clickable; the anchor's only affordance was a hover underline, which is
invisible until the pointer is already on it. The linked handle now carries an `ExternalLinkIcon`
and an `sr-only` note that it opens in a new tab.

Neither is visible to `lint`, `typecheck` or a test — the first renders a valid string and the
second renders a valid anchor. They are exactly what a browser pass is for.

---

## 4. One finding left alone, deliberately

**`DELETE /workspaces/:id/influencers/<slug>` answers 500**, where the same route with an id
answers 200. The branded id schemas in `shared/src/ids.ts` are `z.string().min(1)`, not
uuid-shaped, so a slug passes `zValidator` and reaches Postgres as a non-uuid, which raises
`invalid input syntax for type uuid`.

**It is not this change and not this aggregate**: `DELETE …/outlets/<slug>` answers 500 identically
on untouched code, and the same shape is in vendors. `getInfluencerByRef` and `getOutletByRef` both
carry a uuid-shape branch for exactly this trap; the delete and patch paths never got one. It is
also unreachable from the product — every screen sends `record.id` — so it is a hand-written
request's 500 rather than a user's.

Worth its own change across the three aggregates, and recorded here rather than folded into a
release about accounts.

---

## 5. The release

`docs/changelog.md` — **1.46.0**, index line plus the full entry, migration 0016 and the test count
stated. The six phase notes and the plan stay in `docs/completions/` for this release, with
`docs/completions/influencer-accounts.md` as the release-level outline that points at them — the
shape 1.43.0 used. They move to `docs/archive/` when the next feature lands, which is what this
commit does for `vendors-on-real-data` and `brand-scoped-sidebar`.
