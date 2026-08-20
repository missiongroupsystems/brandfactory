# Influencers table — column widths

**The `/influencers` table stops overflowing the card.** Eight columns under
`table-layout: auto` had no width of their own — each took whatever its widest cell needed,
which is how `Tier` and `Engagement` ended up ellipsized to `T…`/`Engage…` in the header while
`Status` fell off the right edge with no scrollbar visible to say why. The table is `table-fixed`
now, with a measured percentage share per column, and the Platforms cell's badge cap drops from
three to two — the single column that was eating more width than any other. No server change, no
migration, no test regressions: 335 passing.

Not part of the `influencer-quick-add-and-inline-edit-plan.md` phases (A–F) — a separate,
user-reported layout bug against the live table those phases had already shipped.

## The bug, and why it wasn't a squeeze

The user's screenshot showed truncated headers and a Status column cut off mid-badge. The
instinct is "the browser is squeezing the columns to fit" — it is not. `table-layout: auto` sizes
each column to its own content and, when the sum exceeds the container, the *table just overflows
it*; the wrapping `<div overflow-x-auto>` in `components/ui/table.tsx` is what's supposed to catch
that and hand the reader a scrollbar. Measured live (dev server, real seeded data, 165 rows in
`tbody`, 1470px window):

```
containerClientWidth: 1144
containerScrollWidth: 1245   (grouped, 7 columns)
tableOffsetWidth:     1325   (ungrouped, 8 columns — Tier added back)
```

The table was ~100–180px wider than its own card. Somewhere between that overflow and the actual
page chrome (sidebar, card padding, whatever ancestor constraint the user's window applied), the
auto-layout algorithm's column-shrink math clipped `Tier` and `Engagement`'s headers specifically
— those two happen to be the only columns where the **header** (a button: sort icon + label,
~104px for "Engagement" alone) is wider than any value the column ever holds (`Mega`, `–`,
`3.1%`). Every other header was short enough to survive; those two weren't. Reproduced exactly —
same two headers clip, same cutoff Status column — against the throwaway server described below.

## What was measured before touching anything

Auto-layout's per-column width already *is* close to each column's true minimum — that's its job
— so before writing any width, the actual intrinsic content need was measured per column, by
cloning each cell's content into an unconstrained off-DOM probe and reading `scrollWidth` (this is
the only reliable way; a `<td>`'s own `scrollWidth` just reports the column's already-resolved
width, not what the content alone would need):

| Column | Header needs | Widest real data needs | Driven by |
|---|---:|---:|---|
| Creator | 72px | 164px (name) / 164px (handle) | data |
| Platforms (cap 3) | 84px | 303px ("Dianna": 3 badges) | data |
| Reach | 63px | 66px | roughly even |
| Tier | 48px | 80px ("Mid-tier") | data |
| Engagement | 104px | 37px (`3.1%`) | **header** |
| Vertical | 71px | 152px ("Family & lifestyle" + icon) | data |
| Brands | 68px | 140px | data |
| Status | 62px | 92px ("Prospect") | data |

Platforms was the outlier by a wide margin — nearly twice the width of the next-widest column,
for a cell that mostly holds one or two badges. `Engagement` was the only column where the header
itself is the thing that needs protecting; every other column's header fits inside whatever its
data needs.

## What changed

### `components/influencers-browser.tsx` — `table-fixed` + a percentage per column

The `<Table>` in `InfluencerResults` takes `className="table-fixed"`, and every `SortableHead`
gets a `w-[N%]`:

```
Creator 14%  Platforms 18%  Reach 10%  Tier 9%  Engagement 12%  Vertical 14%  Brands 13%  Status 10%
```

Sums to 100 across the *ungrouped* (8-column) table. Grouped drops `Tier`'s `<SortableHead>`
entirely, and the remaining seven stretch to fill its share automatically — `table-fixed` divides
the table's own width by whatever columns are actually present, so this needed no branching of its
own.

Percentages rather than pixels, on purpose: a `w-[160px]` column is 160px on every screen, so it
either wastes space on a 1920px monitor or reintroduces the overflow on a 1280px one. A percentage
is a share of the card, so the whole row grows and shrinks together as the window does, and the
table can never exceed its container — `table-fixed` computes column widths from the declared
values, not from content, so overflow past 100% is no longer possible by construction. The
trade-off is the one already visible in the numbers above: on a narrow window, a column can be
handed less than its content wants. Two mitigations cover that:

- **Weighted toward the columns whose header is the constraint.** `Engagement`'s 12% (vs. its
  ~9.5% "fair share" by raw content) and `Tier`'s 9% both bias upward so their headers stop
  clipping even on the tighter end of a laptop window — this is what actually fixes the reported
  bug, not just papers over it with a scrollbar.
- **Every text column that can now be squeezed narrower than its content already had, or now has,
  `truncate`.** Creator (name + handle) and Brands already did. Vertical did not — see below.

### `components/influencers-browser.tsx` — Vertical cell gets truncation

`INFLUENCER_VERTICAL_LABELS` in `lib/labels.ts` runs up to 19 characters (`Family & lifestyle`,
`Beauty & skincare`). The cell rendering it had no `truncate`, no `min-w-0`, nothing — under
`table-layout: auto` this was never a problem because the column just grew to fit; under
`table-fixed` at 14% it would have overflowed the cell's box with no ellipsis, which is a worse
failure than the header clipping this change fixes. Fixed by wrapping the label in its own
`<span className="truncate">` and adding `min-w-0` to the flex row around it — a flex child does
not shrink below its content's width without `min-w-0`, and the icon keeps `shrink-0` so it is
always the *label* that gives, never the glyph. Confirmed live: `Beauty & skincare` now reads
`Beauty & skinc…` at the narrower end rather than bleeding into the Brands column.

### `features/influencers/platforms.ts` — `MAX_PLATFORM_BADGES` 3 → 2

The one content change in this pass, and the one worth a second look before accepting it.

Platforms was the widest column on the table by a wide margin (303px measured, next-widest was
Vertical at 152px) because it was reserving room for the worst case the cap allowed: three real
badges, `Instagram` + `Xiaohongshu` + a third, plus the edit pencil. That worst case is not rare —
"Dianna" in the seeded roster hits it exactly. No percentage split could give Platforms enough
room for three long badges *and* leave the other seven columns readable without either reopening
the overflow or squeezing everything else below its own comfortable minimum; the arithmetic was
checked both ways before this change was made.

Dropping the cap to two puts the third-and-beyond platforms behind the `+N` badge that already
existed for the case of 4+ platforms — same component, same `NamesTooltip`, same keyboard-focusable
affordance, nothing new built. No platform becomes unreachable: it moves from "shown inline" to
"one click away," which is exactly what the `+N` badge was already built to mean for a creator with
4+ platforms. Verified live against "Dianna" (Instagram, TikTok, Xiaohongshu) — the row now reads
`Instagram TikTok +1`, and opening the Reach popover (a different, unrelated affordance) confirms
all three accounts are still there and unaffected.

`platforms.test.ts`'s boundary test asserted the cap at 3 directly (`visiblePlatforms(["instagram",
"tiktok", "youtube"])` expecting all three shown, none overflowing) — updated to assert the new
boundary at 2, along with two other tests whose fixtures happened to sit past the new cap
(`platformsOf` order test, `+N` naming test). The docstrings in both `platforms.ts` and
`platform-badges.tsx` are updated to state the new number and why — they previously argued for
*three* by name ("the number the comma-joined string already showed"), which is exactly the kind
of stated rationale that goes stale silently if only the constant changes.

**This is a debatable call, not a mechanical one — flagging it explicitly rather than only in this
file.** It trades "see three platforms inline" for "the table fits its own card." If three inline
badges turns out to matter more than the no-scroll table, the fix is one line
(`MAX_PLATFORM_BADGES = 3`) plus loosening `Platforms`'s `w-[18%]` back up and taking width from
elsewhere — everything downstream (the `+N` badge, the tooltip, the tests) already handles any cap
value, that's what `visiblePlatforms(platforms, max)` taking `max` as a parameter is for.

## Verification

No production server was touched. The repository's `.env` points `AUTH_PROVIDER=supabase` and
`DATABASE_URL` at the live Supabase-hosted database (per `AGENTS.md` and the 1.47.0 changelog
entry), and there was already a server instance running against it on `:3001` outside this
session. Rather than sign into that with real production auth, or restart that process, a fully
separate throwaway instance was used and torn down afterward:

- **`packages/db`** migrated and seeded against the *local Docker Postgres* already running on
  `:5432` (`docker/compose.yaml`'s own service, untouched otherwise) — the standard
  `pnpm -F @brandfactory/db db:migrate` / `db:seed` from this file's own "Commands" section. Seeds
  146 real-shaped influencers, matching production's row count.
- **A second `@brandfactory/server` process** on `:3011` (not `:3001`), `AUTH_PROVIDER=local`,
  pointed at that local Postgres, `LLM_PROVIDER=ollama` to dodge the `OPENROUTER_API_KEY` boot
  check for a run that never calls an LLM. Independent process, independent port, independent
  database — no interaction with the already-running `:3001` instance.
- **`packages/web-next`** run with a throwaway `.env.local` (`API_PROXY_TARGET=:3011`,
  `NEXT_PUBLIC_AUTH_PROVIDER=local`) that did not exist before this session and was deleted
  afterward, restored to nothing — the package has no `.env.local` today, same as before.

Both throwaway processes (`:3011` server, `:3000` web-next dev) were killed at the end of the
session. The local Docker Postgres now holds the seeded demo dataset, which is its normal,
documented, idempotent state per this file's own "Start the development stack" section — not a
side effect specific to this change.

Checked live, signed in with the seed's dev token:

- `container.scrollWidth === container.clientWidth` in both the grouped (default, 7-column) and
  ungrouped (8-column) views — zero horizontal overflow, confirmed by script rather than by eye.
- Every header reads its full word: `Creator`, `Platforms`, `Reach`, `Tier`, `Engagement`,
  `Vertical`, `Brands`, `Status` — no more `T…` / `Engage…`.
- `Status` badges (`Prospect` / `Active` / `Past`) render fully inside the card, nothing clipped
  at the right edge.
- The `+1` overflow badge renders correctly for 3-platform creators (`Dianna`, `Fiona Fussi` in
  the seeded roster), and its Reach popover (unrelated code path) still lists every account.
- Sorting (`onSort`) still works after the `className` changes to `SortableHead` — clicked
  `Reach`, order changed, bands correctly turned off per the existing sort/group exclusivity rule.
- Vertical labels truncate gracefully (`Beauty & skinc…`) instead of bleeding past the column.

## The gate

```
pnpm vitest run --project @brandfactory/web-next   335 passed (32 files) — 3 tests updated
pnpm -F @brandfactory/web-next lint                clean
pnpm -F @brandfactory/web-next typecheck            clean
pnpm -F @brandfactory/web-next build                clean; /influencers stays ○ (Static)
```

Root-level `pnpm typecheck` / `pnpm test` (all 11 packages) were not re-run — this pass touches
only `packages/web-next`, and its own gate above is the one `AGENTS.md` names for that package.

## What this didn't do

- **No change to `lib/table-density.ts`.** Row height and cell padding are untouched; this pass is
  entirely about the horizontal axis, which that file explicitly keeps off its own ladder.
- **No new dependency, no server change, no migration.**
- **No change to what data exists** — `MAX_PLATFORM_BADGES` changes what renders inline, not what
  the row holds; every platform, brand, and account is still on the record and still reachable
  (`+N` tooltip, the record's own form).
- **The `1144px`-wide numbers above are one window's measurement, not a guarantee for every
  screen.** A sufficiently narrow browser window can still squeeze a column below its comfortable
  minimum — `truncate` degrades that gracefully now, where it used to overflow the table itself.
