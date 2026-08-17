"use client";

import { Loader2Icon } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useOutletIndex, useOutletMutations } from "@/features/registry/hooks";
import { ApiError } from "@/lib/api/client";
import type { Brand } from "@/lib/api/types";
import { OUTLET_STATUS_LABELS, OUTLET_TYPE_LABELS } from "@/lib/labels";

/**
 * "Add outlets" — assign several outlets to this brand in one sitting.
 *
 * **One `PATCH /outlets/{id}` per row, and there is deliberately no
 * `PUT /brands/{id}/outlets`.** Set replacement is the shape contracts use for coverage, and it
 * is wrong here: replacing a set means one careless save can un-brand every outlet a brand
 * holds, and there is no coverage semantics to justify the risk. The same one-`PATCH`-per-move
 * the org chart already makes.
 *
 * Nothing is optimistic. And **partial failure is reported as partial** — the whole point of N
 * independent writes is that some can succeed while others do not, so a single "Saved" over
 * three successes and two refusals would be the least useful thing this could say.
 */
export function BrandOutletsPicker({
  brand,
  open,
  onOpenChange,
}: {
  brand: Brand;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { outlets, isLoading, hasMore } = useOutletIndex();
  const { update } = useOutletMutations();

  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [isPending, setIsPending] = React.useState(false);
  const [formError, setFormError] = React.useState<string | undefined>();

  // Reset per open, during render — the sheet's content survives its close, so a second opening
  // would otherwise carry the previous selection.
  const [wasOpen, setWasOpen] = React.useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setSelected(new Set());
      setFormError(undefined);
    }
  }

  // Everything not already on this brand — including outlets carrying a *different* one, because
  // moving an outlet between brands is a real operation and hiding it here would send somebody to
  // the outlet form to do the same thing. What they carry now is shown on the row.
  const candidates = React.useMemo(
    () => outlets.filter((outlet) => outlet.brand_id !== brand.id),
    [outlets, brand.id],
  );

  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (selected.size === 0) return;

    setIsPending(true);
    setFormError(undefined);

    const ids = [...selected];
    // Keyed by **id**, never by name. `outlet.name` has no unique constraint, so re-deriving the
    // failures from their names could re-select a different outlet that happens to share one —
    // and the retry would then quietly brand a row nobody picked while the row that actually
    // failed dropped out of the selection.
    const failed: { id: string; name: string; reason: string }[] = [];

    // Sequential rather than `Promise.all`: these are independent writes against one API, and a
    // burst of them buys nothing on a list this size while making the failure report harder to
    // attribute. Every one is attempted — an early return would leave the reader unable to tell
    // "refused" from "never tried".
    for (const id of ids) {
      const outlet = outlets.find((o) => o.id === id);
      try {
        await update(id, { brand_id: brand.id });
      } catch (err) {
        failed.push({
          id,
          name: outlet?.name ?? "An outlet",
          reason: err instanceof ApiError ? err.message : "the request did not complete",
        });
      }
    }

    setIsPending(false);

    const moved = ids.length - failed.length;
    if (failed.length === 0) {
      toast.success(`${moved} outlet${moved === 1 ? "" : "s"} moved to ${brand.name}`);
      onOpenChange(false);
      return;
    }

    // Which moved and which did not, by name. The sheet stays open so the failures are still on
    // screen beside the checkboxes they belong to.
    setFormError(
      `${moved} of ${ids.length} moved. ` +
        failed.map((f) => `${f.name}: ${f.reason}`).join(" "),
    );
    setSelected(new Set(failed.map((f) => f.id)));
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!isPending) onOpenChange(next);
      }}
    >
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Add outlets to {brand.name}</SheetTitle>
          <SheetDescription>
            Each one is saved on its own, so a refusal stops only that outlet.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="contents">
          <SheetBody className="flex flex-col gap-4">
            {formError ? (
              <p role="alert" className="rounded-lg bg-error-tint p-3 text-helper text-error">
                {formError}
              </p>
            ) : null}

            {isLoading ? (
              <p className="text-helper text-ink-tertiary">Loading outlets…</p>
            ) : candidates.length === 0 ? (
              <p className="text-helper text-ink-tertiary">
                Every outlet already carries this brand.
              </p>
            ) : (
              <fieldset className="flex flex-col gap-1">
                <legend className="sr-only">Outlets to move to {brand.name}</legend>
                {candidates.map((outlet) => (
                  <label
                    key={outlet.id}
                    className="flex items-start gap-3 rounded-lg px-2 py-2 hover:bg-surface-sunken"
                  >
                    <Checkbox
                      className="mt-0.5"
                      checked={selected.has(outlet.id)}
                      onChange={() => toggle(outlet.id)}
                    />
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-sm font-medium text-ink">{outlet.name}</span>
                      <span className="text-helper text-ink-tertiary">
                        {OUTLET_TYPE_LABELS[outlet.outlet_type]} ·{" "}
                        {OUTLET_STATUS_LABELS[outlet.status]}
                        {outlet.brand_id ? " · carries another brand" : ""}
                      </span>
                    </span>
                  </label>
                ))}
              </fieldset>
            )}

            {/* `useOutletIndex` walks the cursor to exhaustion, so this is a runaway guard
                rather than an expected state — but a picker silently missing the outlet
                somebody is looking for is a bad way to find out about a page boundary. */}
            {hasMore ? (
              <p className="text-helper text-ink-tertiary">
                There are more outlets than this list can show. Assign the rest from the outlet
                record itself.
              </p>
            ) : null}
          </SheetBody>

          <SheetFooter>
            <Button
              type="button"
              variant="secondary"
              disabled={isPending}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending || selected.size === 0}>
              {isPending ? (
                <>
                  <Loader2Icon className="animate-spin" data-icon="inline-start" />
                  Saving
                </>
              ) : (
                `Add ${selected.size || ""} outlet${selected.size === 1 ? "" : "s"}`.replace(
                  "  ",
                  " ",
                )
              )}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
