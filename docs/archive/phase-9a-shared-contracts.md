# Phase 9A — Shared contracts

**Status:** done  
**Plan:** [phase-9-navigation-redesign.md](../executing/phase-9-navigation-redesign.md) (Phase A)  
**Package:** `@brandfactory/shared` only — no tests by convention; schemas are exercised by server route tests in Phase C.

## Goal

Land the wire/domain types the navigation redesign needs before any DB or
HTTP surface: brand and project list projections with signal fields, plus
rename/delete input schemas for Phase F.

## What shipped

| Task | File | Notes |
| --- | --- | --- |
| A1 | `packages/shared/src/brand/summary.ts` | `BrandSummarySchema` = `BrandSchema.extend({ sectionCount, projectCount })`. Both counts are `z.number().int().nonnegative()`. |
| A2 | `packages/shared/src/project/summary.ts` | `ProjectSummarySchema` via `z.intersection(ProjectSchema, { brandName, lastActivityAt })`. |
| A3 | `packages/shared/src/brand/update.ts` | `UpdateBrandInputSchema` — optional `name` / `description` (nullable), `.refine()` requires ≥1 key. |
| A4 | `packages/shared/src/project/update.ts` | `UpdateProjectInputSchema` — `{ name }` only. |
| A5 | `packages/shared/src/workspace/update.ts` | `UpdateWorkspaceInputSchema` — `{ name }` only. |
| A6 | `packages/shared/src/index.ts` | All five modules exported under the existing section comments. |

## Decisions and deviations

### Replaced the unused lightweight `BrandSummary`

Phase 1 had already exported a `BrandSummarySchema` as
`BrandSchema.pick({ id, workspaceId, name })` for "list/picker surfaces".
Nothing in the monorepo imported it (grep across `**/*.{ts,tsx}` found only
the definition and the changelog). Phase A needs the same name for a richer
list shape (full brand row + counts).

**What we did:** deleted the pick-only schema from `brand/brand.ts` and put
the plan's summary in `brand/summary.ts`. Comment on `brand.ts` points at
the new module so future readers don't reintroduce a conflicting pick.

### `ProjectSummary` uses intersection, not `.extend`

`ProjectSchema` is a `z.discriminatedUnion` over freeform/standardized.
Zod unions do not support `.extend()`. Same pattern as `ProjectDetailSchema`
in `project/detail.ts`: `z.intersection(ProjectSchema, z.object({…}))`.

### Timestamps use `z.iso.datetime()`, not bare `z.string()`

The plan text said `lastActivityAt: z.string()` with a note about the
drizzle `mode: 'string'` convention. Every other timestamp on the wire
(`createdAt` / `updatedAt` on brands, projects, workspaces) is
`z.iso.datetime()`. Matched that for parse-time ISO validation at route
boundaries.

### No `NonEmpty` helper

The plan used `NonEmpty` as shorthand. The package has no such alias —
name fields elsewhere are `z.string().min(1).max(120)`. Update schemas use
the same.

### `description` on brand update is `string | null | undefined`

- `undefined` → field omitted from the patch (do not touch the column).
- `null` → clear the description.
- `string` → set it.

`.refine()` only requires that at least one of `name` / `description` is
present (`!== undefined`), so `{ description: null }` is a valid "clear
description" payload.

## Verification

```
pnpm -F @brandfactory/shared typecheck   ✔
pnpm -F @brandfactory/server typecheck   ✔  (imports clean)
pnpm -F @brandfactory/web typecheck      ✔  (imports clean)
pnpm -F @brandfactory/db typecheck       ✔
```

## Follow-ups (later phases)

- **B** — mappers + queries produce `BrandSummary` / `ProjectSummary`.
- **C** — routes validate with these schemas; fake DB implements counts/ordering.
- **F** — consumes the three `Update*Input` schemas for rename endpoints.
