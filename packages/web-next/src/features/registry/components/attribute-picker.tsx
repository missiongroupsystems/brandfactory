"use client";

import { TriangleAlertIcon } from "lucide-react";

import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { useOutletAttributes } from "@/features/reference/hooks";

/**
 * The outlet attribute tag set, as checkboxes.
 *
 * The list is **served by the API from `seeds/license_types.json`**, never hardcoded here. That
 * is the whole point of `/reference/outlet-attributes`: the same file defines the twenty keys and
 * the `required_when` expressions in the licence library that key off them, so the checkboxes and
 * the rules they drive agree by construction. Twenty strings copied into this file would be the
 * exact drift the endpoint exists to prevent — and the failure would be silent, because a typo'd
 * `serves_alcohol` matches no licence type and simply proposes nothing for as long as the outlet
 * exists.
 *
 * Controlled, with no save button of its own. On the create form the selection is part of the
 * `POST` body; on the detail page the parent owns a dirty state and a save. A picker that wrote
 * on every tick would fire twenty requests while somebody works down the list.
 */
export function AttributePicker({
  selected,
  onChange,
  disabled,
}: {
  selected: string[];
  onChange: (attributes: string[]) => void;
  disabled?: boolean;
}) {
  const { data, error, isLoading } = useOutletAttributes();

  function toggle(key: string, checked: boolean) {
    // Rebuilt in the catalogue's own order rather than by pushing onto the end, so the submitted
    // array is stable regardless of the order the boxes were ticked in.
    const next = new Set(selected);
    if (checked) next.add(key);
    else next.delete(key);
    onChange((data?.attributes ?? []).map((a) => a.key).filter((key) => next.has(key)));
  }

  if (isLoading) {
    return (
      <div className="grid gap-2 sm:grid-cols-2">
        {Array.from({ length: 8 }, (_, index) => (
          <Skeleton key={index} className="h-8 w-full" />
        ))}
      </div>
    );
  }

  if (error || !data) {
    return (
      <div
        role="alert"
        className="flex items-start gap-3 rounded-lg bg-warning-tint p-3 text-warning"
      >
        <TriangleAlertIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
        <p className="text-helper">
          The attribute catalogue could not be loaded, so attributes cannot be set here. The rest
          of this form still works — set them from the outlet&rsquo;s own page once the reference
          endpoint responds.
        </p>
      </div>
    );
  }

  return (
    // A fieldset rather than a div: twenty checkboxes with no group name are twenty unrelated
    // controls to a screen reader.
    <fieldset className="flex flex-col gap-2" disabled={disabled}>
      <legend className="sr-only">Outlet attributes</legend>
      <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
        {data.attributes.map((attribute) => (
          <label
            key={attribute.key}
            className="flex cursor-pointer items-start gap-2.5 rounded-md py-1.5 text-ink transition-colors duration-[120ms] hover:bg-surface-hover has-disabled:cursor-not-allowed has-disabled:text-ink-disabled"
          >
            <span className="mt-0.5">
              <Checkbox
                checked={selected.includes(attribute.key)}
                onChange={(event) => toggle(attribute.key, event.target.checked)}
              />
            </span>
            <span className="text-helper">{attribute.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
