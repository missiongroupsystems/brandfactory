# Influencer accounts Phase D — the read surfaces

**The roster stops showing one platform per person, and the tier bands start counting people.**

Phase D of [`./influencer-accounts-plan.md`](./influencer-accounts-plan.md).
Two screens read the new record: the table at `/influencers` and the page at
`/influencers/[slug]`. The write path is untouched and still does not compile — that is Phase E,
and it is the only thing left.

`@brandfactory/web-next`: **221 tests passing** (was 217 — **+4**). Its own gate — `lint` and the
`influencers` typecheck — is clean apart from `influencer-form.tsx`.

5 files modified, none new.

---

## 1. What the table says now

| Column | Before | After |
| --- | --- | --- |
| Creator | name + the handle | name + **the handle that matched**, or the primary |
| Platform**s** | one label | up to three labels, then `+N`, in enum order |
| Reach | the row's `followers` | `totalReach`, with `3 accounts` beneath when there is more than one |
| Tier | `tierFor(followers)` | `tierFor(totalReach(...))` |
| Engagement | the row's rate | `blendedEngagement`, the follower-weighted mean |

Vertical, Brands and Status are untouched, and so is the column count — `Platform` became
`Platforms` rather than a second column arriving.

**The Reach cell is the only place on the screen that says the figure is a sum.**
`formatAccountCount` prints `3 accounts` under the total, and only when there is more than one:
`1 account` under most of a roster is noise, and the line exists to stop `140k` being read as one
account of 140k — which is exactly the misreading the child table was built to remove.

**The Creator cell shows one handle, not all of them.** A creator with three accounts is three
handles, and stacking them under every name would make that column the tallest thing on screen for
a fact the Platforms cell already carries. **This is a deliberate departure from the plan's
`+2 more` bullet**: the count would then appear twice in one row, two columns apart, and the
Platforms chips are a better signal than a number because they say *which*.

**Platforms are words, not glyphs.** Lucide holds no brand marks and drawing six is not this
release's work. Enum order rather than entry order, so reordering a creator's accounts does not
reshuffle their row for a change that says nothing about where they post.

---

## 2. The two predicates that changed meaning

```ts
// before                                    // after
influencer.platform !== filters.platform     !influencer.accounts.some((a) => a.platform === …)
influencer.handle.toLowerCase().includes(q)  matchingAccount(influencer, q) !== undefined
```

Platform is now **has an account on**, which is the whole point of the child table: a creator with
an Instagram grid and a TikTok appears under both filters instead of under whichever one somebody
recorded.

Search matches the name or **any** handle, and `matchingAccount` is deliberately one function
serving two callers. The predicate uses it to decide whether a row matches; the Creator cell uses
it to decide **which handle to render**. A row that matched on an account the cell was not showing
would highlight nothing and read as a false positive — the failure AGENTS.md names for a search
spanning more than the title. The search field's label widened with it, per the rule that a
placeholder must not promise more than the predicate delivers; here it delivers more, so it says so.

`groupByTier` now sorts with **`byInfluencerReach`** — the comparator the server sorts with —
rather than restating `reach desc, name asc` by hand. One definition, both sides.

---

## 3. The detail page: an Accounts card, first and full width

The card is one row per account: platform, `@handle`, a `Primary` badge on the first, the exact
follower count, and that account's own engagement rate.

**It is first because everything below it is derived from it.** A reader who sees `1,240,000` can
look one line up and see what it is made of. A creator with one account still gets the card — it
is the only place their handle, their platform and their own rate appear together, and hiding it
for the common case would make the page's shape depend on the data.

**The handle links only when a `url` is stored.** Nothing is derived from a handle anywhere: a
guessed link to a real stranger's profile is worse than no link, and **xiaohongshu** is the
platform that makes the column necessary at all, because it addresses users by an opaque numeric
id nobody can guess. Rows are keyed on `(platform, handle)` — the pair the unique index already
guarantees — rather than on the array index, which changes under a reorder.

**The `Primary` badge is a reading of the list, not of a flag.** There is no `is_primary` column;
position 0 carries it.

### The Audience card becomes the derived view

`Followers` → **`Total reach`**, and the docstring says what the number does: it double-counts a
person who follows the creator on two platforms, which is what every rate card in the trade
quotes, and the card above prints the split so the sum is never the only figure on the screen.

`Engagement rate` → **`Blended engagement`**, and the label is load-bearing. An unlabelled `2.3%`
over three accounts is a number nobody can reproduce; beside the per-account rates one card up, it
is arithmetic anybody can check. The em dash still means *nobody has measured this*, which is not a
measured zero — an unmeasured account leaves both halves of the fraction rather than dragging the
blend down.

A new `Accounts` line names the count beside the tier, because a creator whose three accounts add
up past a threshold sits a band above where any one of them would put them, and that line is what
explains it.

**The header's second line changed from `on Instagram` to `3 accounts`.** The slug comes from the
name now, so the URL already says who the page is about; what the header has to answer instead is
whether the figures below it belong to one account or four.

---

## 4. `tiers.ts` and `format.ts`

`tiers.ts` keeps every threshold, every rail and its signature — `tierFor` still takes a number, so
the ladder stays testable against bare counts. What changed is the docstring, and it is not
cosmetic: **the grouping is still total, for a new reason.** It used to be that `followers` was a
non-nullable column; it is now that `totalReach` sums a list held at `.min(1)` whose every member
has a non-nullable count. The band counts still sum to the rows, which is the property the group
headers rely on.

`format.ts` gains `formatAccountCount` and gains a paragraph saying what is **not** here: the
arithmetic lives in `@brandfactory/shared` because the server needs the same definition, and this
file only decides how the answers are spelled.

**There is no `formatHandle`, and the plan asked for one.** Both surfaces draw the `@` as a
separate element beside the handle — the column never carries one, because `InfluencerHandleSchema`
rejects a leading sigil rather than stripping it — and the table wraps the handle in
`HighlightMatch`. A function returning `"@priyaskin"` would either put the sigil inside the
highlighted span or force every caller to take the string back apart.

---

## 5. The tests

`tiers.test.ts` gains the case the whole change exists for: three accounts of 60k, 50k and 30k file
under **Mid-tier**, while each account on its own is Micro. It also pins that the grouping degrades
to `nano` rather than to a missing row if an empty list ever reaches it — a wrong band is the safer
of the two failures, and `.min(1)` is what stops it happening.

`format.test.ts` gains the plural and the cap.

**No test renders a screen**, per the rule this package keeps: `web-next` tests auth, workspace
resolution and cache keys, not the UI. What the two files here assert is the arithmetic behind the
columns, which is exactly the kind of thing a browser pass cannot check.

---

## 6. Gate

| | |
| --- | --- |
| `pnpm vitest run --project @brandfactory/web-next` | **221 passed** (25 files) |
| `pnpm -F @brandfactory/web-next lint` | clean |
| `pnpm -F @brandfactory/web-next typecheck` | **6 errors, all in `influencer-form.tsx`** — Phase E |
| `pnpm exec prettier` on the changed files | clean |

No browser pass yet. The seed holds no multi-account creator, so the pass has to **create one
first** — which needs the form. It lands in Phase F, with the three-account creator, the platform
filter, the search that matches a non-primary handle, and the 409 that names the holder.

Next: **Phase E** — `account-rows.tsx`, the repeatable row, `Make primary`, the last-row guard and
the duplicate flag.
