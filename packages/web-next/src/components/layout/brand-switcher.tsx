"use client";

import * as React from "react";
import { ChevronsUpDownIcon } from "lucide-react";

import { BrandMark } from "@/components/brand/brand-mark";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { useActiveBrand } from "@/features/brands/active-brand";
import { BRAND_STATUS_LABELS, BRAND_STATUS_TONES } from "@/lib/labels";

/**
 * The brand toggle — which brand the shell is inside, and the way to any other one by name.
 *
 * It sits in the sidebar header as a **second row**, under the product identity, rather than
 * replacing it: the product and the brand are different things and putting them on one line
 * makes the reader work out which name is which. A hairline separates them.
 *
 * **The mark is on the trigger and on nothing in the menu.** The brand hue is the one colour
 * on screen allowed to be the customer's rather than the product's, and the accent rule (§4)
 * is "one element per surface" — six coloured squares stacked in a dropdown spends that
 * budget six times over and turns recognition into noise. The menu is names.
 *
 * **Nothing on screen responds to the selection yet, and that is the honest state.** No screen
 * in this shell is brand-scoped; every one of them is fixture-backed Operations Hub. The
 * toggle is the shell affordance landing before the screens that will read it, and
 * `useActiveBrand()` is the seam they read it through.
 */
export function BrandSwitcher() {
  const { brand, brands, isLoading, select } = useActiveBrand();
  const hintId = React.useId();

  // A brand index in flight is a pending request, never a missing fact — the house rule for
  // every id this app resolves through a cached map. A "No brand" line here would be a false
  // statement rendered for the 120ms before the list lands, and it would flash on every load.
  if (isLoading) {
    return (
      <div className="flex items-center gap-2.5">
        <Skeleton className="size-8 shrink-0 rounded-md" />
        <Skeleton className="h-4 w-28" />
      </div>
    );
  }

  // Genuinely no brands. Distinct from the branch above and worth its own words: this is the
  // empty state of a real answer, not a gap in a partial one.
  if (!brand) {
    return <p className="px-2 py-1 text-xs text-ink-tertiary">No brands yet</p>;
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          // No `aria-label`: it would replace the accessible name, and the active brand's own
          // name is what a screen reader should announce for this control. The purpose goes on
          // an `aria-describedby` sibling instead — `aria-description` is still a draft and a
          // `button` does not support it.
          aria-describedby={hintId}
          className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors duration-[120ms] hover:bg-surface-hover"
        >
          <BrandMark name={brand.name} seed={brand.id} size="sm" />
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
            {brand.name}
          </span>
          <ChevronsUpDownIcon aria-hidden className="size-3.5 shrink-0 text-ink-tertiary" />
        </DropdownMenuTrigger>

        {/* Both caps earn their place, and the horizontal one is the easy half to forget: a
            dropdown with no maximum grows to its widest child, so `truncate` on the rows never
            engages and one 90-character brand name sizes the menu — and every short name in
            it — to most of the page. `max-h-80` is why a workspace of thirty brands scrolls
            instead of running off the viewport. */}
        <DropdownMenuContent align="start" className="max-h-80 max-w-80 min-w-56 overflow-y-auto">
          {/* Radio semantics, not plain items. The tick beside the current brand is the only
              thing distinguishing it, and a visual-only check is not a state (WCAG 1.4.1).

              **The handler goes on the group, not on each item.** Base UI's `Menu.RadioItem`
              takes `value` and `closeOnClick` and nothing else; selection is reported by the
              group's `onValueChange`. Radix's flavour of this component puts `onSelect` on the
              item, and copying that shape here fails *silently* rather than at the type check
              — React has a real DOM `onSelect` (text selection) that absorbs the prop, so
              `tsc`, `eslint` and `next build` all pass and the menu simply never switches
              brand. Found by clicking it. */}
          <DropdownMenuRadioGroup value={brand.id} onValueChange={(id: string) => select(id)}>
            {brands.map((b) => (
              <DropdownMenuRadioItem key={b.id} value={b.id}>
                <span className="min-w-0 flex-1 truncate">{b.name}</span>
                {/* Only when it is not active. A badge on all six is a column of noise; a
                    badge on the two you are not expecting is the whole signal. Without it a
                    retired brand is indistinguishable from a live one in this list. */}
                {b.status !== "active" ? (
                  <Badge variant={BRAND_STATUS_TONES[b.status]} className="ml-2 shrink-0">
                    {BRAND_STATUS_LABELS[b.status]}
                  </Badge>
                ) : null}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
          {/* No "New brand…" and no "All brands". The first would be a `POST` the fixture
              backend refuses with a 503, and the second has no route in this shell — an item
              that opens a toast saying it does not work is worse than the absence. Both belong
              here the moment they have somewhere to go. */}
        </DropdownMenuContent>
      </DropdownMenu>
      <span id={hintId} className="sr-only">
        Switch brand
      </span>
    </>
  );
}
