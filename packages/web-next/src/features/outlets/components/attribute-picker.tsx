"use client";

import { OUTLET_ATTRIBUTES, orderOutletAttributes } from "@brandfactory/shared";

import { Checkbox } from "@/components/ui/checkbox";

/**
 * The outlet attribute tags, as checkboxes.
 *
 * **The catalogue is static, in `@brandfactory/shared`** — no endpoint, no fetch,
 * no loading state and no error state, which is most of what the Operations Hub's
 * version of this component was. That one served its twenty keys from
 * `/reference/outlet-attributes` because the same file defined the `required_when`
 * expressions in the licence library, so the boxes and the rules they drove had
 * to agree by construction. Nothing here reads these keys but a person, so the
 * endpoint's reason for existing does not carry over, and the repository's rule
 * for a set nobody edits applies instead (`CLAUDE.md`, "Not every fact needs a
 * table").
 *
 * **A key the catalogue does not offer still survives a save.** The selection is
 * normalised through `orderOutletAttributes`, which keeps unknown keys rather
 * than dropping them — so an imported tag is not quietly deleted the first time
 * somebody opens this form and ticks something else. It has no box of its own,
 * which is the honest limit: this control offers the catalogue, it does not
 * enumerate the record.
 *
 * Controlled, with no save of its own — the selection is part of the form's
 * payload. A picker that wrote on every tick would fire a request per box while
 * somebody works down the list.
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
  function toggle(key: string, checked: boolean) {
    const next = new Set(selected);
    if (checked) next.add(key);
    else next.delete(key);
    // Rebuilt in catalogue order rather than by pushing onto the end, so the
    // submitted array is stable whatever order the boxes were ticked in.
    onChange(orderOutletAttributes([...next]));
  }

  return (
    // A fieldset rather than a div: twelve checkboxes with no group name are
    // twelve unrelated controls to a screen reader.
    <fieldset className="flex flex-col gap-2" disabled={disabled}>
      <legend className="sr-only">Outlet attributes</legend>
      <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
        {OUTLET_ATTRIBUTES.map((attribute) => (
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
