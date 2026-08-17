"use client";

import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { useOutletIndex } from "@/features/registry/hooks";

/**
 * How a create form comes by its outlet. The two members are alternatives, not a value and its
 * override, so "which one wins" is never a question a reader has to answer.
 *
 * The union also carries the rule the render condition alone could not: a page that fixes the
 * outlet cannot also suggest one.
 */
export type OutletBinding =
  | {
      /**
       * The outlet is settled by the page — the outlet detail page's panels. No selector renders
       * and the value is not the user's to change. Also what the edit sheets pass, where it is
       * ignored entirely.
       */
      outletId: string;
      defaultOutletId?: never;
    }
  | {
      outletId?: undefined;
      /**
       * Seeds the selector — the Networks page's outlet filter. A strong hint and not a
       * commitment: "filtered to Kilo" means the next record is probably Kilo's, not certainly.
       */
      defaultOutletId?: string;
    };

/**
 * Which outlet a new network or device belongs to — **create mode only**.
 *
 * Both records hang off an outlet, and until now the only screen that could create one was the
 * outlet's own page, which knows the answer and passes it as `outletId`. The Networks page does
 * not, so it asks. That is the whole of the difference: the field renders exactly where the page
 * cannot supply the outlet itself, and nowhere else.
 *
 * It never renders in edit mode, and that is not an omission. `OutletNetworkUpdate` and
 * `NetworkDeviceUpdate` carry no `outlet_id` at all — moving a record between outlets is a
 * data-entry error being covered up rather than an edit, so the fix is delete and recreate.
 *
 * **Options are not narrowed by what already exists.** A network is one-per-outlet and the API
 * answers a second one with a 409 that names the outlet and says to update it instead — but the
 * networks list this page loads is cursor-paginated, so a "already has one" annotation computed
 * from it would be confidently wrong for every outlet past the first page. The hint sets the
 * expectation; the server tells the truth.
 *
 * Its own component so the outlet index is fetched only where it renders — same reasoning as
 * `IspContractField` beside it.
 */
export function OutletField({
  value,
  onChange,
  hint,
  error,
}: {
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  error?: string;
}) {
  const { outlets, isLoading } = useOutletIndex();

  return (
    <Field label="Outlet" required hint={hint} error={error}>
      {(field) => (
        <Select
          {...field}
          required
          disabled={isLoading}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        >
          {/*
            An empty-valued placeholder is what makes `required` bite: the browser refuses the
            submit and points at this control, so an unset outlet is caught on the field rather
            than as a 422 from a request that need not have been made.
          */}
          <option value="">{isLoading ? "Loading outlets…" : "Select an outlet"}</option>
          {outlets.map((outlet) => (
            <option key={outlet.id} value={outlet.id}>
              {outlet.name}
            </option>
          ))}
        </Select>
      )}
    </Field>
  );
}
