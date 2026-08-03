# Social calendar, Phase 4 — the web data layer

**Status:** shipped, 2026-08-03. Executes Phase 4 of
[`docs/executing/social-calendar-implementation.md`](../executing/social-calendar-implementation.md)
(proposal §5 "Data layer" of
[`docs/executing/social-calendar.md`](../executing/social-calendar.md)).

Three files, one of them new. Nothing renders yet — no component imports any
of this, and the registry still says Soon. First half of proposal Stage 2.

---

## What landed, file by file

### `api/queries/brands.ts` — the key (4.1)

`socialPosts: (brandId) => ['brands', brandId, 'social-posts']`, slotted
between `assets` and `research`. Nesting under `['brands', id]` is what makes
`useDeleteBrand`'s `removeQueries({ queryKey: brandKeys.detail(id) })` sweep
the post list with the brand — a property of the key shape, pinned by a test.

### `api/queries/social-posts.ts` (4.2)

Modeled on `assets.ts`: `useBrandSocialPosts`, the standalone exported
`applySocialPostToCache`, and `useCreate` / `useUpdate` / `useDelete` /
`useRestoreSocialPost`, all through the typed RPC
`api.brands[':id']['social-posts']` + `callJson`. Every mutation patches the
cache in its `onSuccess` rather than invalidating — the server's returned row
already carries every decision it made.

**The applier's one departure from `applyAssetToCache`: it re-sorts.** Insert-
or-replace and drop-when-`deletedAt` are the asset shape verbatim, but a post
patch routinely changes *where the row belongs* — rescheduling to another day,
or clearing the slot to send it back to the tray. An asset patch cannot do
that (position is patched explicitly, and a reorder replaces the list
outright). Splicing a rescheduled post back where it used to sit would leave
the calendar showing it under the wrong date until something forced a
refetch. The sort is the shared `bySchedule`, which mirrors
`listSocialPostsByBrand`'s SQL, so a re-sorted cache and a refetch agree.

The sort runs on a fresh copy. `next` is already a new array, so this is
belt-and-braces — but `sort` mutates in place, and an applier that sorted the
cached array directly would rewrite the list React still holds a reference to.
A test pins it.

### `api/queries/social-posts.test.ts` (4.3)

12 tests, `assets.test.ts`'s conventions (a `post()` builder with a `Partial`
override, cast fixtures, comments only where the assertion encodes a rule):

- The four the plan named — insert (in calendar order, *not* appended),
  replace in place, drop on `deletedAt`, and the re-sort.
- The re-sort from both directions: a rescheduled post moving later, and an
  unscheduled one moving to the front of the list. These are the two the
  asset applier has no equivalent for.
- Restore puts a post back in calendar order rather than at the end — the
  Undo's cache half.
- The asset suite's standing set: no-op on an uncached delete, unseeded cache
  left `undefined` (pending ≠ empty), empty list is a real state, another
  brand's list untouched, the given array not mutated, and the key-nesting
  sweep.

## Verification

```
pnpm typecheck                    clean (all 10 packages)
pnpm lint                         clean (whole repo)
pnpm format:check                 clean (whole repo)
pnpm test                         1187 passed | 64 skipped (full tree)
pnpm -F @brandfactory/web build   clean
```

1175 → **1187 (+12)**, all in the new applier suite. The tree stayed green
across both streams, as it was at Phase 3.

**No live pass** (no Docker, no `.env`): the RPC calls typecheck against the
server's composed Hono type — which is what proves the paths and params match
the router — but no request has been made against a running server.

## Notes for Phase 5

- Phase 5 is the pure pieces: `lib/calendar.ts` (native `Date` + `Intl`, no
  date library), `ui/textarea.tsx`, `PostEditorDialog`, `SocialPostList`.
  It needs this phase only for the mutation shapes the dialog's submit
  payloads take — `CreateSocialPostInput` / `UpdateSocialPostInput`, both
  already shared types.
- Still uncommitted: Phases 1–4, alongside the autofill stream's finished
  work. The tree is green; the per-phase commits the plan prescribes remain
  to be cut.
