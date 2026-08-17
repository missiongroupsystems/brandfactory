"use client";

import { ChevronsUpDownIcon, PlusIcon } from "lucide-react";
import * as React from "react";

import { BrandMark } from "@/components/brand/brand-mark";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { useActiveBrand } from "@/features/brands/active-brand";
import { NewBrandSheet } from "@/features/brands/components/new-brand-sheet";

/**
 * The brand toggle — which brand the shell is inside, the way to any other one by name, and
 * the way to make one.
 *
 * It is the third row of the sidebar header, under the workspace: a brand belongs to a
 * workspace, and the list this reads is `GET /workspaces/:workspaceId/brands`.
 *
 * **The mark is on the trigger and on nothing in the menu.** The brand hue is the one colour
 * on screen allowed to be the customer's rather than the product's, and the accent rule (§4)
 * is "one element per surface" — a coloured square per row spends that budget once per brand
 * and turns recognition into noise. The menu is names.
 *
 * **The status badges went with the fixtures, and their absence is the correct answer rather
 * than a regression.** The six mock brands carried `active` / `dormant` / `retired`, and
 * flagging the two you were not expecting was real signal. `BrandSummary` has no status field —
 * BrandFactory brands do not have one — and inventing a badge out of `sectionCount` or
 * `projectCount` would be a label that looks like a state and means nothing.
 *
 * **Nothing below the header responds to the selection yet**, and that is still the honest
 * state. Every screen in this shell is fixture-backed Operations Hub. `useActiveBrand()` is the
 * seam the brand-scoped screens will read it through.
 */
export function BrandSwitcher() {
  const { brand, brands, workspaceId, isLoading, select } = useActiveBrand();
  const [creating, setCreating] = React.useState(false);
  const hintId = React.useId();

  // A list in flight is a pending request, never a missing fact — the house rule for every id
  // this app resolves through a cached map. A "No brands" line here would be a false statement
  // rendered for as long as the round trip takes, and it would flash on every load.
  if (isLoading) {
    return (
      <div className="flex items-center gap-2.5">
        <Skeleton className="size-8 shrink-0 rounded-md" />
        <Skeleton className="h-4 w-28" />
      </div>
    );
  }

  // Genuinely no brands in this workspace. Distinct from the branch above and worth its own
  // words — and unlike 1.32.0 it is no longer a dead end, because there is now something to
  // press.
  if (!brand) {
    return (
      <>
        <button
          type="button"
          onClick={() => setCreating(true)}
          disabled={!workspaceId}
          className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors duration-[120ms] hover:bg-surface-hover disabled:cursor-not-allowed disabled:text-ink-disabled"
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-dashed border-border-input text-ink-tertiary">
            <PlusIcon aria-hidden className="size-3.5" />
          </span>
          <span className="min-w-0 flex-1 truncate text-sm text-ink-secondary">
            No brands yet — create one
          </span>
        </button>
        <NewBrandSheet workspaceId={workspaceId} open={creating} onOpenChange={setCreating} />
      </>
    );
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
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{brand.name}</span>
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
              item, and copying that shape here fails *silently* rather than at the type check —
              React has a real DOM `onSelect` (text selection) that absorbs the prop, so `tsc`,
              `eslint` and `next build` all pass and the menu simply never switches brand. */}
          <DropdownMenuRadioGroup value={brand.id} onValueChange={(id: string) => select(id)}>
            {brands.map((b) => (
              <DropdownMenuRadioItem key={b.id} value={b.id}>
                <span className="min-w-0 flex-1 truncate">{b.name}</span>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>

          <DropdownMenuSeparator />
          {/* **The menu closes before the sheet opens**, which is why this sets state in a
              click handler on an item with default close-on-click rather than rendering the
              sheet's trigger in here. A Base UI popup dismissing while another one mounts
              leaves the overlay eating clicks — the wedge AGENTS.md records twice. */}
          <DropdownMenuItem onClick={() => setCreating(true)}>
            <PlusIcon />
            New brand…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <span id={hintId} className="sr-only">
        Switch brand
      </span>
      <NewBrandSheet workspaceId={workspaceId} open={creating} onOpenChange={setCreating} />
    </>
  );
}
