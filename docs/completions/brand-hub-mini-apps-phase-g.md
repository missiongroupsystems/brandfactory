# Brand hub mini-apps — Phase G: Tests

Status: **done**. Seventh phase of the brand-page redesign tracked in
[`docs/executing/brand-hub-mini-apps.md`](../executing/brand-hub-mini-apps.md).
Builds on [Phase A](./brand-hub-mini-apps-phase-a.md) …
[Phase F](./brand-hub-mini-apps-phase-f.md).

## Goal

Cover the redesign's decision points — which threads belong to which mini-app,
how tiles render, which branch each route state takes — so a later refactor
can't quietly break classification or resurrect the "0 threads on a Soon tile"
noise.

**86 → 107 tests (+21).** The plan's `BrandContextBar` bullet already landed in
Phase D and the `NewProjectDialog` signature update in Phase A; this phase covers
the rest and adds one case the plan didn't list.

## Testability change: `MiniAppTile` extracted

`MiniAppTile` was a private function inside `routes/brands.$brandId.tsx`
(Phase E). Testing it in place would have meant rendering the whole hub — mocking
`createRoute`, four brand query hooks, the context bar's TipTap editor and both
entity dialogs — to assert on a link's `href`.

It moved **verbatim** to `components/brand/MiniAppTile.tsx` (props unchanged:
`{ app, brandId, threadCount }`), with `TILE_CLASS` and the two decision comments
travelling with it. The route now imports it and dropped its `Link` / `cn` /
`type MiniApp` imports. Behaviour-identical; the hub renders the same DOM.

## What was covered

### `components/brand/miniApps.test.ts` (new, 11 tests)

Predicates and counts over one shared fixture — a brand holding two copywriting
threads, one visual, two freeform, and one standardized thread under
`'not-a-registered-template'`:

- each `match` claims only its own threads (copywriting ≠ every standardized
  thread — the mistake the discriminated-union narrowing exists to prevent);
- a freeform thread matches **no** standardized mini-app, asserted across the
  whole registry rather than one entry, so a new row can't regress it;
- a thread under an unregistered template stays **unclaimed** — it must not
  silently fall into some tile;
- no thread is claimed by two mini-apps (partition invariant);
- thread-count derivation over the mixed list resolves to
  `{ copywriting: 2, visual: 1, social: 0, freeform: 2 }`;
- `miniAppById` resolves every registered id and returns `undefined` otherwise.

### `components/brand/MiniAppTile.test.tsx` (new, 5 tests)

Enabled tiles render a real `<a href="/brands/b-1/apps/copywriting">` (the
established fake-`Link` mock from `ProjectCard.test.tsx`); disabled ones render
no link, carry `aria-disabled` and a **Soon** pill. Counts: singular/plural,
silent when `null`, suppressed at zero on a Soon tile — but **shown** when a Soon
tile has threads, which is the branch that keeps the suppression from hiding real
data.

### `routes/brands.$brandId.apps.$appId.test.tsx` (new, 4 tests)

The route's four states: an enabled app lists only its own threads (a freeform
thread is present in the fixture and must not appear under Copywriting) and
offers **New thread**; the empty category shows the start prompt; a disabled app
renders **Coming soon** with no create button and no thread list; an unregistered
`appId` renders the unknown state.

`createRoute` is mocked to return its options object so the page component is
reachable without a router context, with `useParams` reading a `vi.hoisted`
fixture. `createRootRoute` and `Outlet` are stubbed too — the route module
imports `rootRoute` from `./__root` transitively.

### `components/project/NewProjectDialog.test.tsx` (+1 test)

Not in the plan, added because Phase F made the path live: creating from a
mini-app calls the mutation with `{ name, templateId: 'copywriting' }` and the
dialog titles itself "New thread". Previously only typecheck guarded that the
`templateId` actually reaches `useCreateProject` — and a typo in the spread would
have silently produced freeform threads from the Copywriting mini-app. The
existing freeform test still asserts the bare `{ name: 'Campaign' }`, so the two
together pin both branches of the optional spread.

## Mutation-checked, not just green

New tests that pass on correct code prove nothing on their own, so two
behaviours were deliberately broken and the suite re-run:

| Mutation | Result |
| --- | --- |
| `projects?.filter(app.match)` → `projects ?? []` (drop category filtering) | 1 failure |
| `threadCount !== null && (app.enabled \|\| threadCount > 0)` → `threadCount !== null` (drop zero-suppression) | 1 failure |

Both were caught, and both files were restored and re-verified byte-for-byte
before the final run.

## Verification

```
pnpm -F @brandfactory/web typecheck   clean
pnpm -F @brandfactory/web lint        clean
pnpm -F @brandfactory/web test        107 passed (22 files)   [86 → 107, +21]
pnpm -F @brandfactory/web build       ok
prettier --check (new + changed)      clean
```

## Files touched

| Action | Path |
| --- | --- |
| New | `packages/web/src/components/brand/MiniAppTile.tsx` (extracted verbatim from the route) |
| New | `packages/web/src/components/brand/MiniAppTile.test.tsx` |
| New | `packages/web/src/components/brand/miniApps.test.ts` |
| New | `packages/web/src/routes/brands.$brandId.apps.$appId.test.tsx` |
| Edit | `packages/web/src/routes/brands.$brandId.tsx` (import the extracted tile) |
| Edit | `packages/web/src/components/project/NewProjectDialog.test.tsx` (+1 case) |

No `shared` / `server` / `db` / `agent` changes.

## Next

Phase H — verification. The automated half is already green above; what remains
is the manual pass in the dev app (context bar collapse / chip reading / editing
still saves, tile counts and inert Soon tiles, thread creation landing on the
split-screen with `templateId` persisted, agent output arriving as canvas blocks,
dark mode + accent budget). Optionally the `frontend:apply-mission-systems-ci`
visual pass now that the layout is in.
