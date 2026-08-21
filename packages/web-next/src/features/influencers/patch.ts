import type { Influencer, InfluencerAccount, UpdateInfluencerInput } from "@brandfactory/shared";
import {
  InfluencerAccountsSchema,
  InfluencerBrandIdsSchema,
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
 * That argument is what makes the accounts panel defensible as well, and it is worth following
 * one step further: the panel sends `{accounts}`, which is a full replacement *of the account
 * list* and of nothing else. The sheet it replaces would have rewritten the brand set on the way
 * past.
 *
 * ── Why this file exists at all ───────────────────────────────────────────
 *
 * It is the seam the tests aim at. Everything else in this feature's inline editing is a control
 * that has to be clicked to be seen; the mapping from *what the reader chose* to *what goes on the
 * wire* is arithmetic, and it holds the rules that are wrong by one character:
 *
 * - **`""` → `null` for the vertical.** The menu's empty option is `Generalist`, and
 *   `InfluencerSchema` says `null` there is *"a genuine generalist, not an unclassified row"* —
 *   which is why the union has no `other` member. Sending `""` would fail the enum; not sending
 *   the key at all would silently leave the old vertical in place, so a reader who chose
 *   `Generalist` would watch the cell snap back.
 * - **The account list is compared as an ordered list, not as a set.** Position 0 *is* the
 *   primary account, so a reorder is a real edit — see {@link isUnchanged}.
 *
 * ── The four fields, and why the name is not one of them ──────────────────
 *
 * A cell is editable when the reader can say what it should be; a derived cell opens its source.
 * Tier and Engagement are a band over a sum and a weighted mean, and you cannot edit either by
 * typing over it — see `influencers-browser.tsx` for the full table of that decision.
 *
 * **`name` was here and is not any more.** It is still a field, `UpdateInfluencerInputSchema` still
 * takes it, and the record's own form still renames — what went is *this table's* path to it. The
 * Creator cell is a link to the record and it is the one cell on the row whose whole job is to be
 * a link; giving it a second interaction cost a 10px row-height regression in 1.49.0 and bought a
 * rename that nobody performs from a roster.
 *
 * `slug` is absent for the schema's own reason: it is frozen at create, so a link shared last
 * month survives a corrected name.
 */

export const EDITABLE_FIELDS = ["accounts", "vertical", "brandIds", "status"] as const;
export type EditableField = (typeof EDITABLE_FIELDS)[number];

/**
 * What a control handed back, before it is anything the server would accept.
 *
 * **Raw and loose, deliberately.** A menu answers `string`, a checkbox list answers `string[]`,
 * and the accounts panel answers a list it built out of text boxes — narrowing those to the
 * schemas is exactly the work this file exists to do in one place. An editor that narrowed for
 * itself would put a cast at each of four call sites, and a cast is how `"lifestyle"` reaches a
 * column whose enum has no such member.
 */
export type FieldEdit =
  | { field: "vertical"; value: string }
  | { field: "status"; value: string }
  // `readonly`, because nothing here mutates it and the picker's array is a caller's to keep.
  | { field: "brandIds"; value: readonly string[] }
  /**
   * The whole account list, as `toAccountPayload` built it — which means an empty follower box
   * arrives as `NaN` rather than as a laundered `0`. `InfluencerAccountsSchema` is what refuses
   * it, one function down.
   */
  | { field: "accounts"; value: readonly InfluencerAccount[] };

/**
 * The patch for one edit, or `null` when the value cannot be written at all.
 *
 * **`null` means "do not send this", never "send an empty patch".** `UpdateInfluencerInputSchema`
 * refuses a bare `{}` at the wire, so a builder that returned one would turn a local mistake into
 * a round trip and a 400. The caller reverts the cell instead.
 *
 * Two of the three ways to reach `null` are unreachable from the UI and guarded anyway, for the
 * URL-shaped reason everything else in this app is: a **value outside its enum**, which the menus
 * cannot emit because their items are generated from the enum, and a **brand set** the schema
 * refuses. The third is real and is the reason this branch matters: an **account list** with an
 * empty follower count, a repeated `(platform, handle)` pair, no rows at all, or more than ten.
 * The panel disables its own `Save` on each of those, so this is the second of two defences
 * rather than the only one — but the panel's is about telling somebody why, and this one is about
 * what leaves the browser.
 *
 * Every branch narrows through the **shared schema** rather than through a cast, so this file
 * cannot drift from the server's own rules: it is the same zod object the route validates with.
 */
export function patchFor(edit: FieldEdit): UpdateInfluencerInput | null {
  switch (edit.field) {
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
    case "accounts": {
      // A **full replacement** as well, and the one where that matters: the list carries `.min(1)`,
      // the cap of ten, and the repeated-pair refusal. `url` rides along untouched — the panel
      // never shows it and seeds each row from the record, which is what stops a follower-count
      // correction from clearing a stored profile link.
      const parsed = InfluencerAccountsSchema.safeParse(edit.value);
      return parsed.success ? { accounts: parsed.data } : null;
    }
  }
}

/**
 * Whether the edit says what the record already says.
 *
 * The guard against a **no-op write**. The case it is really for is now the accounts panel: it
 * opens on a draft of the whole list, so opening it and pressing `Save` without touching a box
 * would otherwise fire a `PATCH` that rewrites every child row, sweep two cache scopes and refetch
 * the roster — to store what was already there.
 *
 * **`brandIds` compares as a set, `accounts` compares as a list.** That is not an inconsistency:
 * the brand relation genuinely is a set — the server sorts the record's ids and the picker rebuilds
 * its list in the *brand list's* order — while the account list's order **is a fact**. Position 0
 * is the account the creator is known by; there is no `is_primary` flag. So moving an account to
 * the top is a real edit with nothing else changed, and comparing accounts as a set would silently
 * throw it away.
 */
export function isUnchanged(influencer: Influencer, edit: FieldEdit): boolean {
  switch (edit.field) {
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
    case "accounts": {
      if (influencer.accounts.length !== edit.value.length) return false;
      return influencer.accounts.every((account, index) => {
        const next = edit.value[index]!;
        return (
          account.platform === next.platform &&
          account.handle === next.handle &&
          // `NaN !== NaN`, so an empty follower box is never "unchanged" and always reaches
          // `patchFor`, which is the thing that refuses it with a message.
          account.followers === next.followers &&
          account.engagementRate === next.engagementRate &&
          account.url === next.url
        );
      });
    }
  }
}
