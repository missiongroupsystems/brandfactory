"use client";

import type { BrandSummary } from "@brandfactory/shared";

import { Checkbox } from "@/components/ui/checkbox";
import { PENDING } from "@/lib/format";

/**
 * The brands a creator is engaged for, as checkboxes.
 *
 * **Checkboxes rather than a multi-select popup**, on `AttributePicker`'s precedent and for
 * AGENTS.md's stated reason: the platform control already does keyboard, label association,
 * mobile and the base-layer focus ring, and a workspace holds a handful of brands rather than a
 * searchable catalogue. A popup earns its place when options need icons, descriptions or search.
 * These need none.
 *
 * **The relation is a set, and the wire says so.** `brandIds` is a full replacement on both verbs,
 * so what a person means by ticking boxes is *these are the brands* — there is no add/remove pair
 * and no merge for two writers to disagree about. Ticking nothing is a statement rather than a
 * blank: not engaged yet.
 *
 * Controlled, with no save of its own. A picker that wrote on every tick would fire a request per
 * box while somebody works down the list — and each one would be a full replacement, so an
 * interrupted pass would leave a set nobody chose.
 */
export function BrandPicker({
  selected,
  brands,
  isLoading,
  onChange,
  disabled,
}: {
  selected: string[];
  brands: BrandSummary[];
  /** The brand list is still in flight. See the unresolved rows below for why it matters here. */
  isLoading?: boolean;
  onChange: (brandIds: string[]) => void;
  disabled?: boolean;
}) {
  function toggle(brandId: string, checked: boolean) {
    const next = new Set(selected);
    if (checked) next.add(brandId);
    else next.delete(brandId);
    // Rebuilt in the list's order rather than by pushing onto the end, so the submitted array is
    // stable whatever order the boxes were ticked in. Ids the list does not hold keep their place
    // at the front — see below; dropping them here is the silent delete this whole component is
    // arranged to avoid.
    const known = brands.filter((brand) => next.has(brand.id)).map((brand) => brand.id);
    const unknown = [...next].filter((id) => !brands.some((brand) => brand.id === id));
    onChange([...unknown, ...known]);
  }

  /**
   * Ids on the record that the loaded list does not explain.
   *
   * **This is the outlet form's `…` option, in checkbox form.** That form keeps the outlet's own
   * brand as a placeholder option while the list is in flight, because a native select whose value
   * matches nothing falls back to the first option and states something untrue. The failure here
   * is worse than cosmetic: `brandIds` is a **full replacement**, so a form that simply did not
   * render an unresolved link would delete it on the next save — silently, with a green toast over
   * it, exactly the shape of the guidelines bug AGENTS.md records.
   *
   * So each one gets a ticked, disabled box reading `…`. It cannot be untickable, because the
   * control cannot name what it would be removing.
   */
  const unresolved = selected.filter((id) => !brands.some((brand) => brand.id === id));

  return (
    // A fieldset rather than a div: a column of checkboxes with no group name is a column of
    // unrelated controls to a screen reader.
    <fieldset className="flex flex-col gap-2" disabled={disabled}>
      <legend className="sr-only">Brands this creator is engaged for</legend>

      {brands.length === 0 && unresolved.length === 0 ? (
        <p className="text-helper text-ink-secondary">
          {isLoading
            ? "Loading the workspace's brands…"
            : "This workspace has no brands yet. A creator can be added without one — that is what a prospect is."}
        </p>
      ) : (
        <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
          {unresolved.map((brandId) => (
            <label
              key={brandId}
              className="flex cursor-not-allowed items-start gap-2.5 rounded-md py-1.5 text-ink-tertiary"
            >
              <span className="mt-0.5">
                <Checkbox checked readOnly disabled />
              </span>
              <span className="text-helper">
                <span aria-hidden>{PENDING}</span>
                <span className="sr-only">A brand whose name has not loaded yet</span>
              </span>
            </label>
          ))}

          {brands.map((brand) => (
            <label
              key={brand.id}
              className="flex cursor-pointer items-start gap-2.5 rounded-md py-1.5 text-ink transition-colors duration-[120ms] hover:bg-surface-hover has-disabled:cursor-not-allowed has-disabled:text-ink-disabled"
            >
              <span className="mt-0.5">
                <Checkbox
                  checked={selected.includes(brand.id)}
                  onChange={(event) => toggle(brand.id, event.target.checked)}
                />
              </span>
              <span className="text-helper">{brand.name}</span>
            </label>
          ))}
        </div>
      )}
    </fieldset>
  );
}
