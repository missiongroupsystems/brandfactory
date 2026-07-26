# Brand hub mini-apps — Phase A: Generalize project creation

Status: **done**. First phase of the brand-page redesign tracked in
[`docs/executing/brand-hub-mini-apps.md`](../executing/brand-hub-mini-apps.md)
(source sketch: [`docs/plans/brand-page-redesign.md`](../plans/brand-page-redesign.md)).

## Goal

Remove the single web-layer blocker that keeps the app from creating anything but
freeform projects: `useCreateProject` hardcoded `kind: 'freeform'`. The
standardized-project machinery already works end-to-end across `shared` / `server`
/ `db` (the server's `POST /:brandId/projects` validates against
`CreateProjectInputSchema` — a discriminated union of freeform + standardized —
and persists `templateId`); only the web hook was pinning every create to
freeform. Generalizing it is the foundation the mini-app route (Phase F) depends
on.

This phase is deliberately small, isolated, and fully testable — no UI, no new
routes, no behaviour change for existing callers.

## What changed

### A1 — `packages/web/src/api/queries/projects.ts`

`useCreateProject`'s `mutationFn` argument changed from `name: string` to an
object `{ name: string; templateId?: string }`. The request body is now built
conditionally:

- `templateId` **absent** → `{ kind: 'freeform', name }` — unchanged behaviour.
- `templateId` **present** → `{ kind: 'standardized', name, templateId }`.

Both branches are built as `as const` literals so the `hono/client` typed `$post`
sees the correct discriminated-union member. `onSuccess` invalidations are
untouched (brand projects, workspace projects, workspace brands). The leading doc
comment was rewritten — the old one said "Freeform-only create for Phase 9",
which is no longer true.

### A2 — `packages/web/src/components/project/NewProjectDialog.tsx`

The single call site changed from `mutation.mutate(name.trim(), …)` to
`mutation.mutate({ name: name.trim() }, …)`. Nothing else moved: this dialog
stays freeform-only. The mini-app route (Phase F) will feed `templateId` through
the same generalized hook rather than through this dialog.

### A3 — `packages/web/src/components/project/NewProjectDialog.test.tsx`

Updated to match the new hook signature:

- Both `mutate.mockImplementation` callbacks: first arg typed
  `_name: string` → `_arg: { name: string }`.
- The assertion `toHaveBeenCalledWith('Campaign', …)` →
  `toHaveBeenCalledWith({ name: 'Campaign' }, …)`.

## Why this shape

The plan chose to widen the hook's argument to an object rather than add a second
positional parameter, so future call sites read declaratively
(`mutate({ name, templateId })`) and the freeform path stays a clean
default-by-omission. Keeping the `NewProjectDialog` freeform (rather than teaching
it about templates) matches the redesign's model: **threads are created inside
mini-apps**, each of which knows its own `create` descriptor, so the dialog never
needs a template picker.

Deferred by design (per the plan's non-goals): a shared `TEMPLATE_ID` constant and
a DB `CHECK` constraint. The `'copywriting'` magic string and client-side
filtering are acceptable for this pass.

## Verification

```
pnpm -F @brandfactory/web typecheck   clean
pnpm -F @brandfactory/web test        84 passed (18 files)
```

The Phase A gate (`typecheck` + `test` green) is met. `NewProjectDialog`'s three
tests pass against the new signature; the full web suite is unchanged at 84
passing. Note: `pnpm install` had to be run first — `node_modules` was absent in
this checkout.

## Files touched

| Action | Path |
| --- | --- |
| Edit | `packages/web/src/api/queries/projects.ts` |
| Edit | `packages/web/src/components/project/NewProjectDialog.tsx` |
| Edit | `packages/web/src/components/project/NewProjectDialog.test.tsx` |

No `shared` / `server` / `db` / `agent` changes.

## Next

Phase B — registry + icon maps (`components/brand/guidelineIcons.ts`,
`components/brand/miniApps.ts`): pure data, no consumers yet.
