"use client";

import { createStoredPreference } from "@/lib/stored-preference";

/**
 * Row height, as a preference rather than as a per-table state.
 *
 * ── Why this is one setting and not one per screen ────────────────────────
 *
 * "How tight do I like my rows" is a fact about the reader, not about the data on the screen —
 * the same class of thing as the active workspace, and the opposite of a filter. Every filter,
 * grouping and sort in this app lives in the **URL** (`hooks/use-query-filters.ts`), because
 * those describe *what is on screen* and a pasted link has to reproduce it. Density describes
 * *how the reader likes to look at it*, and putting it in the URL would mean a shared link
 * imposed one person's eyesight on somebody else's.
 *
 * So it is the third `lib/stored-preference.ts` consumer, after the active workspace and the
 * active brand — `useSyncExternalStore` with a `null` server snapshot, because reading storage
 * during render is wrong on the server and seeding it from an effect is
 * `react-hooks/set-state-in-effect`, which fails this build. AGENTS.md records that call, and
 * the root `CLAUDE.md` records the same one for `sidebar-prefs.ts`.
 *
 * **No pre-paint script, unlike the sibling app this is modelled on.** Launchpad stamps
 * `data-density` on `<html>` before first paint because half of it is server-rendered markup
 * styled by hand-written CSS. Nothing here reads an attribute: every table in this package is a
 * client component behind SWR that renders `LoadingRows` first, so by the time a real row exists
 * hydration is long finished and the store has already answered. The rung is mirrored onto the
 * `<table>` element all the same — see `components/ui/table.tsx` — so what a table is *actually*
 * rendering at is legible in the inspector rather than living only inside React.
 *
 * ── Why classes and not pixels ────────────────────────────────────────────
 *
 * Every height below is a literal Tailwind class. It is tempting to hold a number and build
 * `h-[${n}px]`, and that is the trap AGENTS.md names for the group rails: **Tailwind scans
 * source text**, so a class name it cannot read as a literal emits no CSS at all. The numbers
 * live only in `table-density.test.ts`, which parses these strings back and asserts the ladder
 * actually descends.
 */

export type TableDensity = "comfortable" | "cosy" | "compact";

/**
 * Loosest first — the array *is* the ladder, so the control's button order and any arithmetic
 * over the rungs read from one place rather than from a switch that can disagree with it.
 */
export const TABLE_DENSITIES = ["comfortable", "cosy", "compact"] as const;

/**
 * What every reader gets until they say otherwise.
 *
 * **`comfortable`, which is the 48px row this app already ships.** The default is deliberately
 * the status quo: this release adds a control, and a control that silently re-draws twenty
 * tables for everybody who never touches it is a redesign wearing a control's clothes. The
 * sibling app defaults to `compact` on its owner's instruction; that is a decision about that
 * product's worklists, taken after the rungs existed, and it is the decision this one leaves
 * open.
 *
 * `getServerSnapshot` in `stored-preference.ts` answers `null`, which resolves here — so the
 * hydrating render and the first client render agree, and a reader who chose 32px gets it on the
 * re-render `useSyncExternalStore` performs immediately after.
 */
export const DEFAULT_TABLE_DENSITY: TableDensity = "comfortable";

/**
 * The four measurements a rung decides.
 *
 * `cell` and `head` are the table primitives' own — height, vertical padding **and horizontal
 * padding**. `band` is the group header row that three tables render (`/influencers`,
 * `/outlets`, `/contracts`), which is a cell with `p-0` and a button inside it and so cannot
 * inherit the cell height. `skeleton` is `LoadingRows`' placeholder, which exists to be the
 * shape of the content it stands in for and would stop being that the moment the rows moved.
 */
export type TableDensityClasses = {
  cell: string;
  head: string;
  band: string;
  skeleton: string;
};

/**
 * The ladder.
 *
 * **32px is a floor, not a preference.** A `Badge` is `h-6` — 24px — and a table row's height in
 * CSS is a *minimum*, so a row carrying a status pill cannot be shorter than 24px plus its own
 * padding whatever this file claims. `compact` is that arithmetic exactly (24 + 2×4), which is
 * why it does not go lower: `h-7` would render as 32px anyway on every row with a badge in it
 * and 28px on every row without one, and a table whose rows are two different heights depending
 * on their contents is worse than one that is honestly 32px throughout.
 *
 * Type size is deliberately **not** on the ladder. Shrinking the face would buy a few pixels and
 * cost the column widths — `max-w-[24ch]` on the influencers table's Brands cell is measured in
 * characters, so a smaller face silently re-truncates it. Height is the one axis that changes
 * how much fits without changing what any cell says.
 *
 * **Horizontal padding is the second such axis.** It sat as a constant `px-4` in
 * `components/ui/table.tsx` — 16px a side, so 32px at every column boundary, which on the
 * eight-column influencers table is ~224px of the measure. It passes the same test height does,
 * so it rides the same rung: one preference, not two.
 *
 * Only `cell` and `head` carry it. `band` sets its own `pr-5 pl-3.5` to line up with the group
 * rail, and `skeleton` sits inside a card that already has padding.
 */
export const TABLE_DENSITY_CLASSES: Record<TableDensity, TableDensityClasses> = {
  comfortable: { cell: "h-12 px-4 py-2", head: "h-10 px-4", band: "h-11", skeleton: "h-10" },
  cosy: { cell: "h-10 px-3 py-1.5", head: "h-9 px-3", band: "h-10", skeleton: "h-8" },
  compact: { cell: "h-8 px-2.5 py-1", head: "h-8 px-2.5", band: "h-8", skeleton: "h-6" },
};

export const TABLE_DENSITY_LABELS: Record<TableDensity, string> = {
  comfortable: "Comfortable",
  cosy: "Cosy",
  compact: "Compact",
};

/** Read back from `localStorage`, which can hold anything at all — including a rung name from a
 *  future release of this file, or from the sibling app on a shared hostname. */
export function parseTableDensity(value: string | null | undefined): TableDensity | null {
  return (TABLE_DENSITIES as readonly string[]).includes(value ?? "")
    ? (value as TableDensity)
    : null;
}

/* ─── The store ───────────────────────────────────────────────────────────── */

/** Namespaced like `brandfactory.active-brand`, so two Mission Systems apps on one origin do not
 *  read each other's rungs — the ladders are the same today and nothing guarantees they stay so. */
const stored = createStoredPreference("brandfactory.table-density");

/** The active rung, re-rendering the caller whenever it changes. */
export function useTableDensity(): TableDensity {
  return parseTableDensity(stored.use()) ?? DEFAULT_TABLE_DENSITY;
}

export function setTableDensity(next: TableDensity): void {
  stored.set(next);
}

/**
 * The measurements, for the parts of a table a *screen* draws for itself.
 *
 * The group-header band is what this exists for: three grouped tables render it as a `TableCell`
 * with `p-0` and a button inside, so it cannot inherit the cell height and has to ask. Those
 * call sites are the components that *render* `<Table>`, which puts them above the context
 * `table.tsx` provides — so this reads the store, which is where that context came from anyway.
 */
export function useTableDensityClasses(): TableDensityClasses {
  return TABLE_DENSITY_CLASSES[useTableDensity()];
}
