# Phase I — Reach by platform

**The Reach column becomes one column per platform, plus the total — off by default.** A View panel
option, a sort key per platform, and a table that scrolls sideways because the reader asked it to.
No server change, no migration.

Plan: `docs/executing/influencer-quick-add-and-inline-edit-plan.md`, Phase I — the optional one,
*"only if asked for after B has been used"*. It was asked for.

| File | What |
|---|---|
| `features/influencers/reach-columns.ts` | The pure half (new) |
| `features/influencers/reach-columns.test.ts` | 21 tests (new) |
| `features/influencers/sort.ts` | A sort key per platform |
| `features/influencers/components/influencers-browser.tsx` | The option, the columns, the exclusivity |

---

## The collision, stated before the design

**This phase is the direct opposite of the work that landed immediately before it.** 1.49.1 spent a
whole pass getting this table to stop overflowing its own card: `table-fixed`, a measured percentage
per column, and the platform badge cap cut from three to two specifically to buy width back. Phase I
adds numeric columns to that table.

The plan saw it coming and priced it — *"up to seven numeric columns needs a horizontal scroll
container"* — but it wrote that before 1.49.1 existed, so the tension is sharper now than the plan
knew. The resolution is a split rather than a compromise:

- **The default view keeps every one of 1.49.1's decisions untouched.** Same `table-fixed`, same
  eight percentages, same badge cap, same zero horizontal overflow. Nothing about the table a reader
  who never opens the View panel sees has changed.
- **The wide view stops dividing a fixed pie** and is wider than the card on purpose, which is what
  the `overflow-x-auto` in `components/ui/table.tsx` has always been there to catch. 1.49.1's finding
  was that the *default* view reaching that scrollbar was a bug because nobody had asked for it.
  Here somebody has.

Trying to keep `table-fixed` and re-budget the percentages was considered and rejected on
arithmetic: three more columns cannot come out of Reach's 10% without pushing every other column
below the content need 1.49.1 measured, which is the bug that pass fixed.

## The plan feared seven columns; the data says three

`reachColumnsFor` derives the columns from the **filtered rows**, not from the enum. The real
Curly's roster uses three platforms — 139 Instagram accounts, 71 TikTok, 6 XiaoHongShu, and none at
all on YouTube, Facebook or LinkedIn — so the common case is three columns plus a total replacing
one, not seven. Filter to TikTok and the Instagram column goes with it.

**Enum order, never frequency order.** Ordering columns by how many creators use each platform would
re-arrange the table's *shape* every time a filter changed, which is a table that moves under the
reader. `platformsOf` makes the same call for the badges one column over.

## `null` and never `0`, and the whole feature turns on it

`reachOn` answers `null` for a creator who is not on the platform.

A creator with no TikTok has **no TikTok reach**; a creator with a TikTok account showing zero
followers has **a reading of zero**. Collapsing the two would sort this roster's 75 Instagram-only
creators into the middle of the TikTok column as though they had all been measured and found empty —
in a column whose entire purpose is deciding who to brief.

The payoff is that nothing needed special-casing. `sortInfluencers` already sorts `null` **last in
both directions**, which is exactly what *not on this platform* deserves, and the cell renders the
same em dash the Engagement column already uses for unmeasured. The test asserts the both-directions
property explicitly, because it is the one a later "tidy-up" to `?? 0` would silently break.

## A third exclusivity rule, which the plan asked to have re-argued

The screen already holds two: a sort turns the bands off, and grouping clears the sort. This adds
the third, and it is the one the plan flagged as needing an argument *"for a column that only
sometimes exists"*.

**Turning the view off clears a per-platform sort.** Otherwise the table stays ordered by
`reach:instagram` with no heading on screen — no way to see why the rows are in that order and no
way to clear it but the URL. Turning it *on* clears nothing, because all eight base columns are
still there and still sorted by whatever they were.

**A pasted URL carrying `?sort=reach:instagram` without `?reach=platform` is honoured, not
corrected.** `parseSort` accepts a platform key whether or not the columns are showing. The order is
real, the heading is one click away, and silently dropping the sort somebody shared the link to show
would be worse than showing an order whose column is hidden. That is stated on
`ReachPlatformSortKey` so the next person does not "fix" it.

## In the View panel, but in the URL

`REACH_BY_PLATFORM` lives in `?reach=platform`, beside `group`, `sort` and `dir` — and it is offered
on the **View** panel, which otherwise holds row height, a `localStorage` preference.

That is not an inconsistency: **the panel is a place, not a storage decision.** `lib/table-density.ts`
draws the line and this falls on the far side of it — row height describes how a reader likes to
look at a table, and this describes *what columns are on screen* and can carry a sort key that only
exists while they are. A link showing the roster ordered by Instagram following has to reproduce
both halves or it reproduces neither.

Off is the default, so the *on* state is what appears in the URL — the mirror of `GROUP_NONE`, and
for the same reason: a URL should carry what somebody changed, not what they left alone.

**This is the first user of the View panel's `settings` slot**, which has existed since 1.48.0 with
nothing in it.

## The width is a literal class from a map

`reachTableMinWidth` returns one of six literal strings keyed by column count. **Never
`min-w-[${n}rem]`** — Tailwind scans source for complete class strings, so an interpolated one emits
no CSS at all: the class lands in the DOM and does nothing. `lib/table-density.ts` records that trap
for the row-height ladder and `group-rail.ts` for the band colours; this is the third file, and its
test asserts the shape of what comes back rather than trusting the comment.

## The gate

```
pnpm typecheck                          clean, all 11 packages
pnpm lint                               clean
pnpm -F @brandfactory/web-next lint     clean
pnpm format:check                       clean
pnpm test                               2806 tests — 2659 passed, 147 skipped
pnpm -F @brandfactory/web build          clean
pnpm -F @brandfactory/web-next build     clean; /influencers stays ○ (Static)
```

2806 against Phase H's 2785: **21 new**, all in `reach-columns.test.ts`.

Four of those are not about this module: they drive `parseSort` and `sortInfluencers` with a
platform key, because the behaviour worth pinning — *a creator not on the platform sorts last in
both directions* — is a property of the comparator and would otherwise be asserted nowhere.

## What this phase did not do

- **No browser pass.** Phase J's, and this is the change that most needs one: 1.49.1's numbers were
  measured live at 1470px, and the wide view's minimum widths are reasoned rather than measured. The
  scroll container is a behaviour a headless render cannot show.
- **No change to the default view.** Stated again because it is the phase's main promise: same
  layout, same percentages, same badge cap, same zero overflow.
- **No per-platform engagement.** The Engagement column stays a single blended figure. Splitting it
  would need the same treatment and has none of the same demand — nobody briefs a campaign off a
  per-platform engagement rate this product does not measure.
- **No column reordering or hiding.** The View panel now has one option; a general column manager is
  a different feature and this is not a down payment on one.
- **No `AGENTS.md` amendment.** Phase J's, with the four decisions Phases D, F, G and H also
  deferred there.
