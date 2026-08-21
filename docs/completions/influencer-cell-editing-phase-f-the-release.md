# Phase F — the release, and what the browser pass found

**Plan:** `docs/executing/influencer-cell-editing-and-profile-links-plan.md`, Phase F.
**Files:** `features/influencers/components/influencers-browser.tsx`, `inline-editors.tsx`.
**Migration:** none. **Wire:** unchanged. **New dependency:** none.

## The gate

All green, on the change as shipped:

```
pnpm typecheck                         ✓  11 packages
pnpm lint                              ✓
pnpm -F @brandfactory/web-next lint    ✓
pnpm format:check                      ✓
pnpm test                              ✓  2868 tests — 2721 passing, 147 skipped
pnpm -F @brandfactory/web build        ✓
pnpm -F @brandfactory/web-next build   ✓  /influencers still ○ (Static)
```

28 more tests than 1.51.0's 2840.

## The browser pass, and the two things it changed

The plan asked for one *because* every claim in Phase A is about a hover state and a row height, and
neither is visible to a headless render — "which is the exact gap that let 1.49.0's 10px regression
through". It found one such regression and one width cost.

### 1. The Reach cell grew 2.16px, and only on rows with more than one account

**Measured, not eyeballed.** Row heights at `comfortable` came back alternating **61px and
58.84px** — a table with two row heights depending on whether a creator has one account or two,
which is exactly what the density ladder exists to prevent.

The cause is a trap worth writing down, because it is invisible in the source. The Reach cell's
class list is `text-right font-mono text-helper tabular-nums text-ink`, and it goes through
`TableCell`'s `cn()`. **`twMerge` drops `text-helper` where it meets `text-ink`** — they land in the
same `text-*` group — so that column has always rendered at 14px/21px rather than at the 13px/18.84px
its class list claims.

`ReachBreakdown`'s sub-line said `font-sans text-helper` explicitly and so was 18.84px. The
replacement inherited from the cell instead and came out 21px: 21 + 2 + 21 = 44px, against the
Creator cell's 41.84px, which made the Reach cell the tallest thing in those rows.

The fix is one class — `text-helper` back on the sub-line — with a comment recording *why* it is
stated rather than inherited, so the next person does not tidy it away. Re-measured after: **one
row height per rung, at all three** — comfortable 58.84, cosy 54.84, compact 50.84.

### 2. The Brands trigger was taking width the pencil did not

The Brands cell's sibling trigger shipped as `min-w-10` (40px) with a chevron, against a pencil that
occupied 18px. On a 13%-share column whose names already truncate at `max-w-[24ch]`, that is real.

It is `min-w-6` with **no chevron** now. The plan puts a chevron on *the two enum cells*, and the
distinction turns out to be a good one: a chevron promises *pick one thing from a list*, and Brands
opens a panel of checkboxes with an explicit `Save`.

Net width against the pencil it replaces: Vertical and Status are **unchanged** (14px chevron for
14px pencil, both `ml-auto`); Platforms and Brands cost **+6px** each.

## What else was checked, and found true

- **The Vertical menu** opens with 11 items, `Generalist` first, the record's value ticked, the cell
  tinted a step deeper than the row, and the row itself lit by `has-aria-expanded`.
- **The accounts panel** opens from both cells, seeds from the record, and disables `Save` with
  *"Every account needs a follower count."* the moment a follower box is cleared.
- **A real write end to end**: a status changed through the menu, the cell re-rendered from the
  server's answer, and **the row did not move** — the bands group by reach and status is not an
  input to it. Reverted afterwards.
- **No console errors**, no hydration warnings, no Base UI errors on load or on any popup.
- **226 derived and stored badge links** across the roster, zero of them xiaohongshu, every one
  carrying `rel="noreferrer noopener"`. See Phase E.

## How the pass was run, and one thing it could not judge

The repo `.env` points `DATABASE_URL` at a **production** Supabase database and `AUTH_PROVIDER` at
Supabase, so the running dev server could not be signed into and must not be written to. The pass
used a throwaway server on `:3011` with `AUTH_PROVIDER=local` against the **docker Postgres on
:5432**, and a Next dev server on `:3010` proxied to it. Both were stopped afterwards; the server on
`:3001` was left alone.

**Column widths were not judged.** The available browser viewport was 760 CSS px, where the
eight-column budget 1.49.1 measured cannot hold — the `Prospect` badge alone (72px) exceeds a
10%-share Status column (70px) at that width, with or without this change. The width *deltas* above
are arithmetic against the pencil rather than a reading off the screen, and a pass at a normal
desktop width is the honest place to confirm them.
