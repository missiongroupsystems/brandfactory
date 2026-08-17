"use client";

import { ChevronsUpDownIcon } from "lucide-react";
import * as React from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { useActiveWorkspace } from "@/features/workspaces/active-workspace";

/**
 * The workspace you are in, and the way to any other one.
 *
 * The second of three rows in the sidebar header: product identity, workspace, brand. It sits
 * above the brand rather than beside it because that is the containment order — a brand belongs
 * to a workspace, and every route the brand row calls is `/workspaces/:workspaceId/brands`.
 *
 * **No mark, and that is the accent budget rather than an oversight.** §4 allows one small
 * piece of brand chrome per surface and the identity tile above has already spent it; the brand
 * mark on the row below carries the *customer's* hue, which is a different budget. A third
 * coloured square here would leave the column with nothing unspent. So this row is type and a
 * chevron.
 *
 * The eyebrow says which of the three rows this is. Without it, two stacked name-and-chevron
 * controls are indistinguishable until you open one — and the whole reason they are separate
 * rows is that they are different things.
 */
export function WorkspaceSwitcher() {
  const { workspace, workspaces, isLoading, error, select } = useActiveWorkspace();
  const hintId = React.useId();

  // A list in flight is a pending request, never a missing fact — the house rule for every id
  // this app resolves through a cached map. "No workspace" rendered for the length of one round
  // trip is a false statement that would flash on every load.
  if (isLoading) {
    return (
      <div className="flex flex-col gap-1.5 px-2 py-1">
        <Skeleton className="h-2.5 w-16" />
        <Skeleton className="h-4 w-32" />
      </div>
    );
  }

  // **A failed request is not an empty account.** SWR answers a 500 or a dropped connection with
  // `isLoading: false` and `data: undefined`, so without this branch the row fell straight through
  // to "No workspaces yet" — a statement about the reader's account made from a request that never
  // succeeded. It is the same rule AGENTS.md states for a pending index, applied to the failed
  // one. A 401 does not reach here: `callJson` signs out and the boundary navigates.
  if (error) {
    return (
      <p role="alert" className="px-2 py-1 text-xs text-error">
        Workspaces unavailable
      </p>
    );
  }

  // Genuinely none. Distinct from both branches above and worth its own words: this is the empty
  // state of a real answer, not a gap in a partial one and not a failure. There is no
  // "New workspace…" here yet — `packages/web` has that dialog and it can follow.
  if (!workspace) {
    return <p className="px-2 py-1 text-xs text-ink-tertiary">No workspaces yet</p>;
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          // No `aria-label`: it would replace the accessible name, and which workspace you are
          // in is what a screen reader should announce for this control. The purpose goes on an
          // `aria-describedby` sibling instead.
          aria-describedby={hintId}
          className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1 text-left transition-colors duration-[120ms] hover:bg-surface-hover"
        >
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-eyebrow text-ink-tertiary">Workspace</span>
            <span className="truncate text-sm font-medium text-ink">{workspace.name}</span>
          </span>
          <ChevronsUpDownIcon aria-hidden className="size-3.5 shrink-0 text-ink-tertiary" />
        </DropdownMenuTrigger>

        {/* Both caps earn their place. A dropdown with no maximum grows to its widest child, so
            `truncate` on the rows never engages and one long workspace name sizes the menu — and
            every short name in it — to most of the page. `max-h-80` is why a long list scrolls
            instead of running off the viewport. */}
        <DropdownMenuContent align="start" className="max-h-80 max-w-80 min-w-56 overflow-y-auto">
          {/* Radio semantics, and the handler is on the **group**. Base UI's `Menu.RadioItem`
              takes `value` and `closeOnClick` and nothing else; an `onSelect` on the item is
              Radix's shape and fails *silently* here, because React has a real DOM `onSelect`
              that absorbs the prop. That cost 1.32.0 a browser pass to find. */}
          <DropdownMenuRadioGroup
            value={workspace.id}
            onValueChange={(id: string) => select(id)}
          >
            {workspaces.map((w) => (
              <DropdownMenuRadioItem key={w.id} value={w.id}>
                <span className="min-w-0 flex-1 truncate">{w.name}</span>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <span id={hintId} className="sr-only">
        Switch workspace
      </span>
    </>
  );
}
