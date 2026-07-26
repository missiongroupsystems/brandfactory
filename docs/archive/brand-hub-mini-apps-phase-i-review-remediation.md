# Brand hub mini-apps — Phase I: Review remediation

Status: **done**. Follow-up to the review of Phases A–H of the brand-page
redesign tracked in
[`docs/executing/brand-hub-mini-apps.md`](../executing/brand-hub-mini-apps.md).
Covers [Phase A](./brand-hub-mini-apps-phase-a.md) …
[Phase H](./brand-hub-mini-apps-phase-h.md).

## Goal

A pre-push review of the redesign found two functional defects in the new code
and one pre-existing data bug the redesign made materially more visible, plus
two smaller inconsistencies. This phase fixes all five and closes the coverage
gap that let each of them ship green.

The headline: **the whole suite now runs against a live Postgres with no
skips — 315 → 325, and the 6 previously-skipped DB tests actually execute.**

## What changed

### I1 — The brand context bar showed stale content after an edit

`SectionReadPanel` mounts a TipTap editor seeded with `section.body`. `useEditor`
reads `content` **once at mount**, and the call site keys the panel on
`selected.id`. But a save from `EditGuidelinesDialog` comes back on the *same*
section ids — the server preserves them — so `useUpdateBrandGuidelines`
repointed the cached brand while the key stayed put and the editor kept
rendering the pre-edit body. The label re-rendered normally, so the panel
contradicted itself: new heading, old text.

Fixed with an explicit content sync in `BrandContextBar.tsx`:

```ts
useEffect(() => {
  editor?.commands.setContent(section.body as Record<string, unknown>)
}, [editor, section.body])
```

The key stays — it is still correct for *selection* changes. The effect covers
*content* changes, which is the case the key structurally cannot see. Read-only,
so there is no cursor or selection to disturb, and React Query's structural
sharing means the dep only changes when the body actually does.

Guarded by a new test that renders the bar, opens a chip, re-renders with a new
body under the same section id, and asserts the panel swapped. It fails against
the old component.

### I2 — The mini-app page rendered blank when the brand query failed

The thread grid and the New-thread button were both gated on `brand &&` —
`ProjectCard` needs a `workspaceId` that only `useBrand` supplies — but the route
had no `isPending` / `isError` branch for that query. With the brand failing and
the threads loading fine, the page rendered a header and **nothing else**: no
threads, no error, no create button, no loading state. The hub route has exactly
this branch; the mini-app route never inherited it.

The two queries now collapse into one pair the whole list is driven from:

```ts
const listPending = brandPending || threadsPending
const listError = brandError || threadsError
```

with the error copy distinguishing which query failed. Two new tests cover the
brand-error and brand-pending states.

### I3 — Removing a guideline section never persisted (pre-existing)

`updateBrandGuidelines` was **upsert-only**. It updated rows carrying an `id`,
inserted rows without one, then returned every row for the brand — nothing ever
deleted rows the payload dropped. There was no delete of `guideline_sections`
anywhere in `db` or `server`, and no test covered removal.

So the editor's trash button removed a section locally, the save round-tripped,
and `onSuccess: setSections(serverSections.map(toLocal))` reseeded the section
straight back into the form. Deleting brand context was impossible through the
UI.

This is **not** from this redesign — last touched in Phase 9 (`a449ed2`), and
Phase C moved the editor verbatim. It is included here because the redesign
promotes every section to a permanent chip in always-visible ambient context, so
an undeletable section went from a row in a form to a fixture of the brand page.

The transaction now tracks the ids it kept and deletes the rest:

```ts
await tx.delete(guidelineSections).where(
  keptIds.length > 0
    ? and(eq(guidelineSections.brandId, brandId), notInArray(guidelineSections.id, keptIds))
    : eq(guidelineSections.brandId, brandId),
)
```

`notInArray` on an empty list is invalid SQL, hence the second branch — which is
also the real "clear every section" path. The function's contract is now stated
in a doc comment: **the payload is the complete desired state, not a partial
patch.** Its sole caller (`PATCH /brands/:id/guidelines`) forwards the editor's
full list, so no caller is surprised by this.

Guideline bodies hold no blob references — `listBlobKeysByBrand` joins only
canvas blocks — so deleting a section orphans nothing in object storage.

**The server's in-memory fake was updated in lockstep.**
`test-helpers.ts` reimplements these semantics in TypeScript for the route
tests; leaving it upsert-only would have let the fake and the real query drift
in exactly the way the live tests exist to catch.

### I4 — A "Soon" tile counted threads it gave no way to reach

`MiniAppTile` deliberately shows a thread count on a disabled tile when threads
exist (so real data is never hidden), but the tile was an inert `div` and the
route rendered "Coming soon" with no list. The UI advertised data with no route
to it.

Now the tile links when `app.enabled || threadCount > 0` (still inert at zero,
and while counts are unknown, where a link would be a guess), and the mini-app
page lists existing threads under the Coming-soon panel with an "Existing
threads" heading. Creating more stays disabled — listing is not the same as
enabling.

### I5 — `aria-expanded` with no referent

The context bar's collapse toggle carried `aria-expanded` but no `aria-controls`,
so it announced a state with nothing attached. The chip row now has a `useId`
and the toggle points at it.

## Coverage

**315 → 325 (+10)**, and the 6 DB tests that previously skipped now run:

| File | Added |
| --- | --- |
| `components/brand/BrandContextBar.test.tsx` | +2 (content refresh, `aria-controls`) |
| `routes/brands.$brandId.apps.$appId.test.tsx` | +3 (Soon-with-threads listing, brand error, brand pending) |
| `components/brand/MiniAppTile.test.tsx` | +1 (Soon tile links once it holds threads) |
| `db/src/guidelines.live.test.ts` | +4 (new file) |

`guidelines.live.test.ts` is its own file rather than a describe inside
`queries.live.test.ts` because each live file owns the `pg` pool for its worker
and ends it in `afterAll` — adding a second describe to that file killed the
pool before the new tests ran. The package already sets `fileParallelism: false`,
so the seeds never race.

It also **restores the seeded state in `afterAll`**. `seed()` only fills gaps
(`onConflictDoNothing` on fixed ids), so a section these tests create survives
into `seed.test.ts`, which asserts an exact row count for the same brand. The
first draft leaked exactly that row and broke two unrelated suites on the next
run — the cleanup is what makes the file re-runnable.

## Mutation-checked

New tests that pass on correct code prove nothing, so the delete was commented
out and the live suite re-run:

| Mutation | Result |
| --- | --- |
| Remove the `tx.delete(...)` from `updateBrandGuidelines` | **4 failures** — every case in the new file |

The implementation was restored and verified byte-for-byte against a backup
before the final run.

The two web fixes were each confirmed against the *unfixed* component first —
a probe reproducing the stale panel and the blank page — before the fix went in,
so both tests are known to fail on the old code.

## Verification

Run at the repository root **with `DATABASE_URL` set** (Docker Postgres,
migrated):

```
pnpm typecheck      9/9 workspaces
pnpm lint           clean
pnpm format:check   clean
pnpm test           325 passed (59 files) — no skips
pnpm build          all packages ok
```

Typecheck earned its keep here: `.returning({ id })` hands back a plain `string`,
not the branded `SectionId`, which the runtime tests happily accepted.

The live suite was run twice consecutively to prove the new file leaves the
database as it found it.

## Still not done

**The manual dev-app pass from [Phase H](./brand-hub-mini-apps-phase-h.md) has
still not been run.** Postgres is now up and migrated, which removes the
infrastructure blocker, but nothing in this phase walked the UI by hand. The
`templateId` round-trip that H flagged is now closed *by inspection* —
`createProject` persists it (`db/queries/projects.ts:100`) and the mapper returns
`kind: 'standardized'` (`mappers.ts:162`) — but still has not been executed
end-to-end. Agent output landing as canvas blocks remains blocked on an
`OPENROUTER_API_KEY`.

Design tokens were confirmed to exist and re-point in dark mode
(`--surface-sunken`, `--surface-selected` at `index.css:129/180`, `133/184`), so
the accent-budget and dark-mode claims hold by construction — but still not by
eye.

## Files touched

| Action | Path |
| --- | --- |
| Edit | `packages/web/src/components/brand/BrandContextBar.tsx` (content sync, `aria-controls`) |
| Edit | `packages/web/src/components/brand/BrandContextBar.test.tsx` (+2) |
| Edit | `packages/web/src/routes/brands.$brandId.apps.$appId.tsx` (brand states, Soon listing) |
| Edit | `packages/web/src/routes/brands.$brandId.apps.$appId.test.tsx` (+3) |
| Edit | `packages/web/src/components/brand/MiniAppTile.tsx` (linkable when it holds threads) |
| Edit | `packages/web/src/components/brand/MiniAppTile.test.tsx` (+1) |
| Edit | `packages/db/src/queries/brands.ts` (delete omitted sections + contract doc) |
| New | `packages/db/src/guidelines.live.test.ts` (+4) |
| Edit | `packages/server/src/test-helpers.ts` (fake tracks the delete) |

## Next

The redesign is functionally sound as far as automated coverage reaches. What
remains before the plan doc moves out of `docs/executing/` is the manual pass
above. Follow-ups still recorded as non-goals: a bespoke Social-calendar UI,
per-mini-app agent tuning, inline editing in the context bar, and a shared
`TEMPLATE_ID` constant with a DB `CHECK` constraint to replace the
`'copywriting'` magic string.
