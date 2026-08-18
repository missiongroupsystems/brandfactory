"use client";

import { TagIcon } from "lucide-react";
import * as React from "react";

import { NamesTooltip } from "@/components/layout/names-tooltip";
import { PENDING } from "@/lib/format";

/**
 * The words for an agreement held for no brand in particular.
 *
 * *"Group level"*, not *"No brand"* and not *"No brand yet"*, and the difference is the whole
 * argument. Both of those describe an **unanswered question** — a row somebody has not got to —
 * which is what the phrase meant while brand was inherited from an outlet and half the estate was
 * unattributed. It is a *stated fact* now: a seat licence and a press office retainer are held
 * for the whole group, deliberately, and there is nothing here to fix. The em dash would be worse
 * again, because `Value` has taught these tables to read it as "not recorded".
 *
 * The same string names the contracts bucket, the band, the cell and — since the vendors table
 * started answering the same question — a fifth place, so none of them can drift.
 */
export const GROUP_LEVEL = "Group level";

/** {@link GROUP_LEVEL} as a cell, in the tertiary ink every "stated absence" here uses. */
export function GroupLevel() {
  return <span className="text-ink-tertiary">{GROUP_LEVEL}</span>;
}

/**
 * Which brands a row is held for — the derivation, kept out of the cell.
 *
 * **The rule this exists for**: *"a cached index that has not arrived is a pending request, never
 * a missing fact"*. One unresolved name makes the whole cell unknown rather than shorter — with
 * one of three names missing, "1 brand" and "2 brands" are both wrong and neither looks it.
 */
export type BrandNames = {
  /** Distinct brand names, sorted. Empty while `pending`. */
  names: string[];
  /** A `brand_id` in the list has no name in the index yet, so nothing here can be counted. */
  pending: boolean;
};

/**
 * The least this needs to know about a brand: its name.
 *
 * **Widened from `Map<string, Brand>` when BrandFactory's influencers arrived**, and widened
 * rather than re-pointed. `/influencers` reads real workspace brands, so its index is
 * `BrandSummary` from `@brandfactory/shared`; `/contracts` and `/vendors` read the Operations
 * Hub's `Brand` out of `fixtures/brands.ts`, and they are not moving — a contract's `brand_ids`
 * are fixture ids, so pointing that table at `useWorkspaceBrands` would make every row read
 * `Group level`. Two record types, one cell, and the only field it ever touches is `name`.
 */
export type NamedBrand = { name: string };

export function resolveBrandNames(
  brandIds: readonly string[],
  brandById: Map<string, NamedBrand>,
): BrandNames {
  const names = new Set<string>();
  let pending = false;

  for (const brandId of brandIds) {
    const brand = brandById.get(brandId);
    // A real reference with no name yet is a request in flight. Rendering the remaining
    // names would state that this row covers fewer brands than it does.
    if (!brand) pending = true;
    else names.add(brand.name);
  }

  return { names: [...names].sort((a, b) => a.localeCompare(b)), pending };
}

/**
 * The brands a row is held for. Four states, and three of them look alike at a glance, which is
 * why each says a different thing:
 *
 * - **No brand at all** → whatever the caller passes as `empty`, and never the em dash by
 *   default: an agreement held for everybody is a decision, and the em dash is these tables'
 *   word for "not recorded". A caller whose zero has a *second* reading — the vendors table,
 *   where no live agreement is a different fact from a group-level one — passes its own node.
 * - **Still loading** → the ellipsis, for the whole cell. See {@link resolveBrandNames} for why
 *   a partial list is worse than none.
 * - **One brand** → the name. The common case, and the only one that reads as a value.
 * - **More than one** → glyph and count, with the names in the tooltip.
 */
export function BrandNamesCell({
  brandIds,
  brandById,
  empty = <GroupLevel />,
}: {
  brandIds: readonly string[];
  brandById: Map<string, NamedBrand>;
  empty?: React.ReactNode;
}) {
  if (brandIds.length === 0) return empty;

  const { names, pending } = resolveBrandNames(brandIds, brandById);
  if (pending) return PENDING;

  if (names.length === 1) {
    return (
      <span className="block truncate" title={names[0]}>
        {names[0]}
      </span>
    );
  }

  return (
    <NamesTooltip
      label={
        <span className="inline-flex items-center gap-1">
          <TagIcon aria-hidden className="size-3.5 text-ink-tertiary" />
          {names.length}
          <span className="sr-only">{names.length} brands</span>
        </span>
      }
      names={names}
    />
  );
}
