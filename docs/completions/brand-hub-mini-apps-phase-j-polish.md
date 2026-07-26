# Brand hub mini-apps — Phase J: Polish pass

Status: **done**. Follow-up to a full pre-push review of the brand-page redesign
(Phases A–I, tracked in
[`docs/executing/brand-hub-mini-apps.md`](../executing/brand-hub-mini-apps.md)).
Phase I closed the functional defects; this pass closes the quality findings the
review surfaced once the feature was exercised **by eye and in a live browser**
for the first time — the manual pass that Phases H and I both recorded as still
outstanding.

## Goal

The redesign was functionally sound (325 tests, live Postgres, no skips) but had
never been run in the actual dev app. Booting it surfaced six issues: two
accessibility defects visible only in the rendered UI, one latent
data-reachability hole, a documentation-setup bug that was itself the reason the
manual pass kept being deferred, and a stale comment. None were correctness
bugs; all are the difference between "tests green" and "ship it."

**325 → 332 tests (+7)**, still no skips, and every fix was verified in a real
Chromium session (screenshots + measured contrast), not only by unit test.

## What changed

### J1 — The collapsed context bar was a rail of identical icons

`iconForSection` (`components/brand/guidelineIcons.ts`) matched only the five
exact `SUGGESTED_SECTIONS` labels. The seeded brand's own labels ("Voice",
"Audience", "Values") — and every custom label a user types — fell through to the
generic `FileText`. In the context bar's **collapsed** state, whose entire job is
an icon-only rail, that rendered three indistinguishable file glyphs (confirmed
in-browser before the fix).

Added a keyword fallback map, tried after the exact match and before the
`FileText` default: `voice`/`tone` → `MessageCircle`, `audience`/`persona`/
`customer` → `Users`, `value`/`position`/`mission` → `Compass`, `visual`/`color`/
`logo`/`type` → `Palette`, `messag`/`tagline`/`copy`/`pitch` →
`MessageSquareText`. Ordered most- to least-specific; first substring hit wins.
The collapsed rail now shows three distinct icons for the seed brand (verified:
three unique SVG path signatures).

New file `guidelineIcons.test.ts` (+4): exact labels, case/whitespace
tolerance, shorthand-by-keyword, and the genuine-unknown fallback.

### J2 — "Soon" tiles failed WCAG AA on their own description text

`MiniAppTile` dimmed disabled tiles with a blanket `opacity-60` on the whole
tile. The description paragraph is otherwise a `text-muted-foreground` at 7.7:1
(light) / 8.07:1 (dark) — well above AA — but 60% opacity dragged the *effective*
contrast to **2.89:1 light / 3.79:1 dark** (measured in-browser; AA text needs
4.5:1). This mattered more than a normal disabled control because the same tile
becomes a **real link** the moment it holds threads (the I4 rule), so the
disabled-element contrast exemption did not cleanly apply.

Dropped `opacity-60` from both the inert-`div` and `Link` branches. The "Soon"
state is now carried by the pill alone. Post-fix measurement: all four tiles at
7.7:1 / 8.07:1, AA-clear in both themes.

### J3 — The collapse toggle announced a state that was never true

`BrandContextBar`'s toggle carried `aria-expanded`, but the chip row it points at
**never hides** — collapsing only swaps labelled chips for an icon rail. So the
control announced a collapsed *region* while that region stayed fully present and
interactive. (Phase I5 had wired `aria-controls` to it, which made the mismatch
explicit rather than resolving it.)

This is a toggle button, not a disclosure, so it now reports `aria-pressed`
(`true` when condensed) and keeps `aria-controls` naming the region it restyles.
No false hidden-region claim. `+1` test asserting `aria-expanded` is absent and
`aria-pressed` flips on click.

### J4 — A thread under an unregistered template was reachable from nowhere

The server accepts any `templateId` (`z.string().min(1)`); the mini-app registry
matches three hardcoded ids. A project whose `templateId` is none of them
matched no tile **and** no mini-app page, so the hub hid it entirely — an
orphaned, unreachable thread. Latent today (no UI path mints a stray template),
but the server's own test fixture uses `'social-calendar'`, which matches
nothing, so the shape is one create call away.

Added `isOrphanThread(p)` to `miniApps.ts` (a thread no registered `match`
claims) and an **"Other threads"** catch-all section on the brand hub that lists
them with `ProjectCard`, below the tile grid. Nothing is ever orphaned now.
Verified live: a `templateId: 'packaging-2024'` thread appears under "Other
threads" and links through to its canvas. `+2` tests on the predicate (flags the
orphan; never flags a claimed thread). The shared `TEMPLATE_ID` constant + DB
`CHECK` remain the deferred structural fix; this is the safety net until then.

### J5 — Stale comment on the guidelines route

`server/src/routes/brands.ts` still described the handler as "Single-tx upsert +
reorder" after Phase I3 added the **delete-omitted-sections** behaviour — exactly
the destructive part a reader needs flagged. Comment now states the payload is
the brand's complete section list and that the transaction upserts, reorders, and
deletes.

### J6 — The documented root `.env` was never loaded (setup bug)

`.env.example` tells contributors to copy it to the **repo root**, but
`packages/server/src/main.ts` used `import 'dotenv/config'`, which reads `.env`
from `process.cwd()` — and under `pnpm -F @brandfactory/server dev` that is the
package directory, not the root. Following the docs produced a hard
env-validation failure on `pnpm dev`. This is almost certainly why the manual
dev-app pass kept being deferred across Phases H and I.

New `packages/server/src/load-env.ts`, imported for its side effect **before**
any env-reading module: it loads the repo-root `.env` first (the documented
location), then a package-local `.env` for overrides. dotenv never clobbers a var
already in `process.env`, so platform-injected secrets (Fly, CI) still win, and a
missing file is a no-op — safe in production, where there is no `.env`. Verified:
`pnpm dev` now boots the server from the root file with no symlink or per-package
copy.

## Coverage

**325 → 332 (+7)**, no skips (live Postgres):

| File | Added |
| --- | --- |
| `components/brand/guidelineIcons.test.ts` | +4 (new file: exact / case / keyword / fallback) |
| `components/brand/miniApps.test.ts` | +2 (`isOrphanThread`) |
| `components/brand/BrandContextBar.test.tsx` | +1 (`aria-pressed`, not `aria-expanded`) |

The two purely-visual fixes (J1 collapsed rail, J2 contrast) and J6 (env
loading) are not unit-asserted — they are verified where they actually live: in a
rendered browser. J4's UI rendering (the "Other threads" section) is covered by
the pure `isOrphanThread` predicate plus a live-browser check rather than a
heavy mocked route harness, since the section is thin `ProjectCard` mapping
identical to the already-tested mini-app page.

## Verification

Automated (repo root, `DATABASE_URL` set):

```
pnpm typecheck                   9/9 workspaces
pnpm lint                        clean
pnpm format:check                clean
pnpm test                        332 passed (60 files) — no skips
```

Manual — the pass Phases H/I never ran — driven in headless Chromium
(Playwright), logging in through the real local-auth form:

1. **Brand hub, both themes** — chips show distinct icons; the four mini-app
   tiles render with correct thread counts; "Soon" tiles are inert and at full
   text contrast (measured 7.7:1 light / 8.07:1 dark, AA-clear); Copywriting +
   Open canvas link, Soon tiles do not (until they hold threads).
2. **Context bar** — chip reveals its read-only body; a second chip swaps the
   panel; collapse condenses to the distinct-icon rail and the open panel
   survives; `aria-expanded` absent, `aria-pressed` flips on toggle; "Edit" opens
   the dialog.
3. **Mini-app + create** — a Copywriting thread created through the UI persists
   `kind: 'standardized', templateId: 'copywriting'` (confirmed against the API)
   and lands on the split-screen; the breadcrumb reads Brand › Copywriting.
4. **Orphan catch-all** — a thread under `templateId: 'packaging-2024'` (no
   registered app) appears under "Other threads" and links to its canvas.
5. **Zero console errors** across the whole walk.

Data-layer round-trips confirmed against the live API during the review
(carried over, unchanged by this pass): guideline-section deletion persists and
is brand-scoped; a non-member PATCH → 401; a `{}` (no `sections`) PATCH → 400.

## Not changed (still deferred, unchanged from the plan's non-goals)

- The shared `TEMPLATE_ID` constant + DB `CHECK` constraint (J4 is the interim
  safety net, not the structural fix).
- Bespoke Social-calendar UI; per-mini-app agent tuning; inline editing in the
  context bar.
- **Agent output landing as canvas blocks** (Phase H item 4) remains the one
  unexercised claim — it needs an `OPENROUTER_API_KEY`, which this pass did not
  have. Everything else in the redesign has now been verified end-to-end.

## The one standing risk (unchanged, for the record)

Phase I3 made the guidelines save destructive (full-list-is-desired-state).
Concurrent edits to the same brand in two tabs are last-write-wins with no undo —
a documented v1 stance, blast radius contained (single caller, brand-scoped,
transactional, `{}` rejected), but sharper than before. No code change here;
noted so the decision stays visible.

## Files touched

| Action | Path |
| --- | --- |
| Edit | `packages/web/src/components/brand/guidelineIcons.ts` (keyword fallback) |
| New | `packages/web/src/components/brand/guidelineIcons.test.ts` (+4) |
| Edit | `packages/web/src/components/brand/MiniAppTile.tsx` (drop `opacity-60`) |
| Edit | `packages/web/src/components/brand/BrandContextBar.tsx` (`aria-pressed`) |
| Edit | `packages/web/src/components/brand/BrandContextBar.test.tsx` (+1) |
| Edit | `packages/web/src/components/brand/miniApps.ts` (`isOrphanThread`) |
| Edit | `packages/web/src/components/brand/miniApps.test.ts` (+2) |
| Edit | `packages/web/src/routes/brands.$brandId.tsx` ("Other threads" catch-all) |
| Edit | `packages/server/src/routes/brands.ts` (stale comment) |
| New | `packages/server/src/load-env.ts` (root `.env` loading) |
| Edit | `packages/server/src/main.ts` (`import './load-env'`) |
