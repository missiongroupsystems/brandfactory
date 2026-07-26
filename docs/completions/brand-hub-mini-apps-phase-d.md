# Brand hub mini-apps — Phase D: Brand context bar

Status: **done**. Fourth phase of the brand-page redesign tracked in
[`docs/executing/brand-hub-mini-apps.md`](../executing/brand-hub-mini-apps.md).
Builds on [Phase A](./brand-hub-mini-apps-phase-a.md),
[Phase B](./brand-hub-mini-apps-phase-b.md) and
[Phase C](./brand-hub-mini-apps-phase-c.md).

## Goal

Build the surface that demotes brand guidelines from "the whole brand page" to
**ambient context**: a slim bar of section chips with a read-only body panel and
an Edit hand-off. This is the last new component Phase E needs before the brand
page can be rewritten as a hub — E then becomes pure orchestration (identity
header + context bar + mini-app tiles).

Guidelines stop being a thing you *do* on the brand page and become a thing that
is *present* while you do something else. Editing still exists, one click away,
through the Phase C dialog.

## What changed

### D1 — `packages/web/src/components/brand/BrandContextBar.tsx` (new)

`BrandContextBar({ brand, onEdit }: { brand: BrandWithSections; onEdit: () => void })`.

**Header row** — a chevron + "Brand context" toggle button (`aria-expanded`),
the Phase-9 `GuidelineMeter` fed `brand.sections.length`, and an
`variant="outline"` **Edit** button pushed right with `ml-auto` that calls
`onEdit`. The bar owns no dialog state; Phase E holds `editOpen` and mounts
`EditGuidelinesDialog` next to the bar.

**Chips** — one button per section, icon from Phase B's `iconForSection(label)`
plus the label. Clicking selects; clicking the selected chip deselects
(`setSelectedId(isSelected ? null : s.id)`). `aria-pressed` carries the state.

**Read panel** — the selected section's body rendered by a nested
`SectionReadPanel` using `useEditor({ extensions: defaultExtensions, content,
editable: false })` + `EditorContent`, below the bar. One editor instance total,
not one per section.

**Collapsed** — chips condense to icon-only (`px-2`, label span dropped); the
selection panel is untouched.

**Empty state** — no sections renders a dashed-border strip with a short prompt
and an "Add brand context" button wired to `onEdit`, instead of an empty chip
row. Zero sections is a legitimate brand state (same stance as `GuidelineMeter`),
so the copy is an invitation, not a warning.

## Why this shape

**One read-only editor, remounted by key.** `useEditor` seeds `content` once at
mount and this instance never syncs inbound updates (same constraint
`TextBlockView` documents). So the call site does
`<SectionReadPanel key={selected.id} section={selected} />` — switching chips
remounts rather than trying to push new content into a live editor. The reason is
written into the component's doc comment so it survives a future refactor.

**Collapse and selection are independent state.** The plan asks that a collapsed
bar still expand the read panel on click; keeping the two `useState`s orthogonal
gets that for free, and means collapsing to save vertical space doesn't discard
what you were reading.

**Selection is resolved by lookup, not stored.** `sections.find(...) ?? null`
means a section deleted in the edit dialog simply stops resolving — no stale
render, no cleanup effect.

**Opaque surfaces.** Chips are `bg-surface-sunken` on a `bg-card` bar, selected
is `bg-surface-selected`, hover is `hover:bg-accent` — all tier-2 tokens that
re-point in dark mode. No `/50`-style translucency, per the `1.3.0` reconciliation
note about the translucent dark surfaces that shipped upstream.

**Accent budget respected.** Nothing in the bar uses brand green. Chips are
neutral; the only interactive emphasis is the outline Edit button. Ambient
context should not compete with the mini-app tiles Phase E puts below it.

**Accessibility.** Icon-only collapsed chips would otherwise have no accessible
name, so every chip carries both `aria-label={label}` (accname) and
`title={label}` (hover tooltip, as the plan specified); decorative icons are
`aria-hidden`. The section is labelled `aria-label="Brand context"`.

## Tests landed early

The plan parks `BrandContextBar` tests in Phase G, and D's gate is only
typecheck. But the component has **no consumer until Phase E**, so shipping it
unrendered would mean nothing had ever executed it. It was spot-rendered instead
(as the plan permits), and since that spot-render already covers G's four
`BrandContextBar` bullets verbatim, it was kept as
`components/brand/BrandContextBar.test.tsx` rather than deleted and rewritten
later. Two cases: the empty state fires `onEdit`; and chips reveal the read-only
body, swap it on re-select, keep it through a collapse, drop their labels when
collapsed while staying reachable by accessible name, with Edit firing `onEdit`.

Phase G still owns the `miniApps` predicate tests and the mini-app tile/route
tests — this only pulls the context-bar bullet forward.

## Verification

```
pnpm -F @brandfactory/web typecheck   clean
pnpm -F @brandfactory/web lint        clean
pnpm -F @brandfactory/web test        86 passed (19 files)   [84 → 86, +2]
prettier --check (new files)          clean
```

Phase D's gate (typecheck green) is met, and the suite is green with the two new
cases.

## Files touched

| Action | Path |
| --- | --- |
| New | `packages/web/src/components/brand/BrandContextBar.tsx` |
| New | `packages/web/src/components/brand/BrandContextBar.test.tsx` |

No `shared` / `server` / `db` / `agent` changes. No existing file was modified —
the bar has no consumer until Phase E.

## Next

Phase E — rewrite `routes/brands.$brandId.tsx` as the hub: slimmed identity
header (rename/delete kept verbatim), `BrandContextBar` + `EditGuidelinesDialog`
behind its Edit button, and a "Workspace" grid of `MINI_APPS` tiles with thread
counts derived from `useBrandProjects`. The old `Projects` strip and the
`Guidelines` section go away.
