import type { Influencer, UpdateInfluencerInput } from "@brandfactory/shared";
import {
  InfluencerBrandIdsSchema,
  InfluencerNameSchema,
  InfluencerStatusSchema,
  InfluencerVerticalSchema,
} from "@brandfactory/shared";

/**
 * One edited cell, turned into the smallest patch that expresses it.
 *
 * ── Why the patch is one key ──────────────────────────────────────────────
 *
 * `PATCH /workspaces/:id/influencers/:id` is a **real** partial patch:
 * `UpdateInfluencerInputSchema` marks every key optional and an omitted key is left alone. So a
 * status edit sends `{status}` and touches nothing else — which makes an inline edit a strictly
 * *safer* write than the sheet, and that is worth stating plainly because it is the opposite of
 * what "a quick edit in a table" usually means:
 *
 * `InfluencerForm` submits a whole `CreateInfluencerInput` on every save, so it replaces the
 * **entire account list** and the **entire brand set** each time — both are full-replacement keys
 * by design. Correcting a status through the sheet therefore rewrites ten accounts nobody touched.
 * Correcting it here writes one column.
 *
 * ── Why this file exists at all ───────────────────────────────────────────
 *
 * It is the seam the tests aim at. Everything else in this feature's inline editing is a control
 * that has to be clicked to be seen; the mapping from *what the reader typed* to *what goes on the
 * wire* is arithmetic, and it holds the two rules that are wrong by one character:
 *
 * - **`""` → `null` for the vertical.** The select's empty option is `Generalist`, and
 *   `InfluencerSchema` says `null` there is *"a genuine generalist, not an unclassified row"* —
 *   which is why the union has no `other` member. Sending `""` would fail the enum; not sending
 *   the key at all would silently leave the old vertical in place, so a reader who chose
 *   `Generalist` would watch the cell snap back.
 * - **Trimming the name.** `InfluencerNameSchema` trims, so `"  Priya "` and `"Priya"` are the
 *   same patch — which is also what makes `isUnchanged` able to answer honestly for a reader who
 *   only added a space.
 *
 * ── The four fields, and why only four ────────────────────────────────────
 *
 * A cell is editable when it holds a **field**; a derived cell opens its source instead. Reach,
 * Platforms, Tier and Engagement are all sums or bands over `accounts`, and you cannot edit a sum
 * by typing over it — see `influencers-browser.tsx` for the full table of that decision.
 *
 * `slug` is absent for the schema's own reason: it is frozen at create, so a link shared last
 * month survives a corrected name.
 */

export const EDITABLE_FIELDS = ["name", "vertical", "brandIds", "status"] as const;
export type EditableField = (typeof EDITABLE_FIELDS)[number];

/**
 * What a control handed back, before it is anything the server would accept.
 *
 * **Raw strings, deliberately.** A `<select>` answers `string` and a checkbox list answers
 * `string[]`, and narrowing those to the enums is exactly the work this file exists to do in one
 * place. An editor that narrowed for itself would put a cast at each of four call sites, and a
 * cast is how `"lifestyle"` reaches a column whose enum has no such member.
 */
export type FieldEdit =
  | { field: "name"; value: string }
  | { field: "vertical"; value: string }
  | { field: "status"; value: string }
  // `readonly`, because nothing here mutates it and the picker's array is a caller's to keep.
  | { field: "brandIds"; value: readonly string[] };

/**
 * The patch for one edit, or `null` when the value cannot be written at all.
 *
 * **`null` means "do not send this", never "send an empty patch".** `UpdateInfluencerInputSchema`
 * refuses a bare `{}` at the wire, so a builder that returned one would turn a local mistake into
 * a round trip and a 400. The caller reverts the cell instead.
 *
 * The two ways to reach `null` are worth telling apart, because only one of them is reachable
 * from the UI: an **empty name** (the schema is `.min(1)`, and this is what a reader who cleared
 * the box and pressed Enter produces), and a **value outside its enum**, which the selects cannot
 * emit because their options are generated from the enum — it is guarded here for the URL-shaped
 * reason everything else in this app is, and because a future editor may not be a select. A name
 * over 200 characters is also refused, though the editor carries `maxLength` so nobody can type
 * one.
 *
 * Every branch narrows through the **shared schema** rather than through a cast, so this file
 * cannot drift from the server's own rules: it is the same zod object the route validates with.
 */
export function patchFor(edit: FieldEdit): UpdateInfluencerInput | null {
  switch (edit.field) {
    case "name": {
      // The schema trims, so the parsed value is what goes on the wire — no second `.trim()` here
      // that could disagree with it.
      const parsed = InfluencerNameSchema.safeParse(edit.value);
      return parsed.success ? { name: parsed.data } : null;
    }
    case "vertical": {
      // `Generalist` is the empty option, and it is a **stated fact** rather than a skipped field.
      if (edit.value === "") return { vertical: null };
      const parsed = InfluencerVerticalSchema.safeParse(edit.value);
      return parsed.success ? { vertical: parsed.data } : null;
    }
    case "status": {
      const parsed = InfluencerStatusSchema.safeParse(edit.value);
      return parsed.success ? { status: parsed.data } : null;
    }
    case "brandIds": {
      // A **full replacement**, which is what the picker's checkboxes mean: these are the brands.
      // The schema carries the cap and the no-duplicates rule, so an empty array survives — it is
      // the statement "not engaged yet" rather than a gap.
      const parsed = InfluencerBrandIdsSchema.safeParse(edit.value);
      return parsed.success ? { brandIds: parsed.data } : null;
    }
  }
}

/**
 * Whether the edit says what the record already says.
 *
 * The guard against a **no-op write**, and the case it is really for is the text editor: it
 * commits on blur, so clicking into the name cell and clicking straight out again would otherwise
 * fire a `PATCH`, a cache sweep across two scopes and a refetch of the whole roster — for nothing.
 *
 * **`brandIds` compares as a set, not as an array.** The server sorts the record's ids; the picker
 * rebuilds its list in the *brand list's* order and keeps unresolved ids at the front. Two orders
 * over one set, so a positional comparison would call every brand edit a change and would call
 * some real changes unchanged only by luck.
 *
 * The name is compared **trimmed**, matching {@link patchFor}: adding a trailing space is not an
 * edit, and treating it as one would write a value the server would trim back to what it already
 * held.
 */
export function isUnchanged(influencer: Influencer, edit: FieldEdit): boolean {
  switch (edit.field) {
    case "name":
      return influencer.name === edit.value.trim();
    // `?? ""` on the record's side rather than mapping the control's `""` to `null`: the control's
    // vocabulary is the string, and one direction of conversion is enough.
    case "vertical":
      return (influencer.vertical ?? "") === edit.value;
    case "status":
      return influencer.status === edit.value;
    case "brandIds": {
      const next = new Set(edit.value);
      // Length first over the record's own array, so a duplicate in `next` cannot make a shorter
      // set look equal to a longer list.
      return (
        next.size === new Set(influencer.brandIds).size &&
        influencer.brandIds.every((id) => next.has(id))
      );
    }
  }
}
