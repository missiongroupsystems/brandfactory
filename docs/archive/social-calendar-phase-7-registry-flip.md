# Social calendar, Phase 7 — the flip

**Status:** shipped, 2026-08-03. Executes Phase 7 of
[`docs/executing/social-calendar-implementation.md`](../executing/social-calendar-implementation.md)
(proposal §5 "Registry, dispatch, nav" and §6). Follows
[Phase 6](social-calendar-phase-6-assembly.md).

**The tile opens the calendar.** Everything built in Phases 1–6 became
reachable in one commit, which is the shape the plan required: the route
dispatches on `unit` while the Soon stub keys off `enabled`, so splitting these
edits ships a half-state — a tile that says Soon over a page that is a
calendar, or the reverse.

Test baseline: **1323 → 1332 (+9)**.

---

## The three source edits

### `miniApps.ts` (7.1)

`unit` gains `'post'` and its doc comment a fourth answer: a collection of
planned posts, counted like `'asset'` and pluralised from the same value. The
`social` row flips to `enabled: true, unit: 'post'`.

`create` and `match` stay, with the comment the `visual` and `studio` rows
already carry — **classification only**. Nothing creates a
`templateId: 'social'` thread, but a legacy one is still filed under this app
rather than landing in the hub's "we don't know what this is" catch-all. What
changes is where that thread is *visible*: the page behind the tile is a
calendar now and lists no threads at all, exactly as happened to `visual` at
2E. A legacy social thread stays reachable from the workspace home, not from
its category.

### `brands.$brandId.apps.$appId.tsx` (7.2)

A fourth branch, `SocialCalendarPage`, and the header comment gains its fourth
line. The four pages stay separate components rather than one with branches
for the reason already recorded there: each owns a different set of queries,
and none should pay for the others'.

### `BrandNavPanel.tsx` (7.3)

`useBrandSocialPosts(brandId)` beside the unconditional `useBrandAssets`, and
one more `countOf` arm. Without it the row would count *threads* and read
`0` for a brand with a full month planned — the same falsehood `unit` was
introduced to prevent at 2E.

## The Soon pill has no wearer left

`social` was the last `enabled: false` tile app in the registry — 1.4.0 shipped
four of them, and this was the fourth. The machinery stays (`NavItem` still
takes a `badge`, `ThreadListPage` still renders the Coming-soon panel) for the
next app that needs it, but nothing registered reaches it.

That is what made this phase touch **four** test suites rather than the three
the plan named. Three of them had borrowed the live `social` row as their
disabled fixture, and each is corrected at its own altitude:

- **`BrandNavPanel.test.tsx` (7.5)** — the badge test inverts to assert the
  pill's *absence*, since asserting its presence is no longer possible
  honestly. The count test gains the calendar's `3 posts`, and the fixture
  state gains a `socialPosts` slot with its own query mock.
- **`brands.$brandId.apps.$appId.test.tsx` (7.4)** — the two Soon-stub cases
  become one dispatch case and one that pins the legacy-thread consequence
  above. `SocialCalendarPage` is stubbed for the reason `StudioSurface` is:
  the real module pulls five mutations and a blob-signing query this file has
  no business standing up.
- **`miniApps.test.ts` (7.6)** — asserts the *pair* that makes the flip true
  (`enabled` opens the tile, `unit: 'post'` routes and counts it) rather than
  the flag alone, plus a standing check that no tile app is still coming.
- **`MiniAppTile.test.tsx`** — not in the plan, and the interesting one. Its
  three disabled-tile tests broke because they rendered `app('social')`. The
  fix is a **synthetic** disabled fixture: the suite's own comment already said
  these cases are about disabled-tile *behaviour* rather than about which app
  happens to be disabled, and the fixture had already been migrated once
  (`visual` → `social` at 2E). A registry row that flips should not take three
  unrelated tile tests with it a third time.

## Verification

```
pnpm typecheck                    clean (all 10 packages)
pnpm lint                         clean (whole repo)
pnpm format:check                 clean (whole repo)
pnpm test                         1332 passed | 64 skipped (full tree)
pnpm -F @brandfactory/web build   clean
```

1323 → **1332 (+9)**.

**Not seen in a browser** (no Docker, no `.env`), which is the standing caveat
for every phase of this stream and now carries more weight than it did: this is
the commit that makes the surface reachable, so every unobserved item from
Phases 5 and 6 — chip legibility in a 130px cell, the hover-only add button's
discoverability, six rows of cells beside the two-column side nav — is now
unobserved *in production code a user can open*, not in dark files.

## What remains — Phase 8

- The changelog entry. The autofill stream has taken **1.19.0** in the working
  tree, so this ships as **1.20.0**.
- Moving `social-calendar.md` and the implementation plan out of
  `docs/executing/`, per the brand-hub precedent.
- Confirming proposal §9's "Noted, not done" list is carried forward as future
  work: drag-and-drop rescheduling, a week view, URL state for view and month,
  brand timezone, past-due highlighting, the soft-deleted-asset warning,
  publishing, and agent chat.

## Commits

Two, both local and unpushed:

- `a676819` — the two streams' accumulated work (auto-fill A–D, social calendar
  1–6). One commit because ten files are shared between the streams; the
  message says so rather than fabricating a per-phase sequence.
- The flip — this phase, alone, as the plan requires. It is the commit this
  file arrives in, so it cannot name its own hash.
