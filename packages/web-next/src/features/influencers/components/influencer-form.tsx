"use client";

import type {
  CreateInfluencerInput,
  Influencer,
  InfluencerStatus,
  InfluencerVertical,
} from "@brandfactory/shared";
import { Loader2Icon } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Field, FieldSection } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { useActiveBrand } from "@/features/brands/active-brand";
import { toNullable, useSubmit } from "@/hooks/use-submit";
import { formatDateTime } from "@/lib/format";
import { INFLUENCER_STATUS_OPTIONS, INFLUENCER_VERTICAL_OPTIONS } from "@/lib/labels";

import { type AccountDraft, accountDraftsFrom, toAccountPayload } from "../account-drafts";
import { GENERALIST } from "../format";
import { useInfluencerMutations } from "../hooks";
import { AccountRows } from "./account-rows";
import { BrandPicker } from "./brand-picker";

/**
 * Create or edit a creator.
 *
 * One component for both, because the fields are the same and two components diverge. The mode is
 * `influencer ? "edit" : "create"`.
 *
 * **This is the screen's first write, and the primary action changed with it.** Until this release
 * `/influencers` offered `Import or sync creators` *instead* of a create, on the argument that a
 * follower count is pulled from a platform rather than typed — and that argument still holds, which
 * is why the import button is still there and still says it is not connected. What it cannot go on
 * doing is stand alone: an import that does not exist is not a filling mechanism, so the table
 * could never hold a row anybody put there. A create beside a stated placeholder is more honest
 * than a placeholder in place of one.
 *
 * **The brand picker offers this workspace's brands and no create.** Brands are made on the brand
 * screens; a create-inside-a-picker is how three spellings of one name get typed by somebody in a
 * hurry. `outlet-form.tsx` makes the same call for the same reason.
 */
export function InfluencerForm({
  influencer,
  open,
  onOpenChange,
}: {
  influencer?: Influencer;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const isEdit = Boolean(influencer);
  const { create, update } = useInfluencerMutations();
  const { run, reset, isPending, formError, fieldErrors } = useSubmit();
  const { brands, isLoading: brandsLoading } = useActiveBrand();

  const [form, setForm] = React.useState(() => initialState(influencer));

  // Reset the draft per open. The sheet's content survives its close, so a form reopened straight
  // after a save still holds the previous draft — and keying `SheetContent` is not the fix: a key
  // that changes mid-dismissal wedges Base UI's overlay (AGENTS.md records this twice).
  // Render-time adjustment, which is also not the effect pattern that broke this build once.
  const [wasOpen, setWasOpen] = React.useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setForm(initialState(influencer));
  }

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    // One payload shape for both verbs. `CreateInfluencerInput` is the wider of the two — every
    // key it holds is also a patch key — so a create sends it whole and a patch sends the same
    // object, which `UpdateInfluencerInputSchema` accepts field for field.
    const payload: CreateInfluencerInput = {
      name: form.name.trim(),
      // A **full replacement**, exactly like `brandIds` below: what somebody means by submitting
      // this list is *these are the accounts*, and the rows left out are gone. The conversion from
      // string-valued draft rows happens once, here.
      accounts: toAccountPayload(form.accounts),
      status: form.status,
      vertical: form.vertical === "" ? null : form.vertical,
      // A **full replacement**, which is what the picker's checkboxes mean: these are the brands.
      brandIds: form.brandIds as CreateInfluencerInput["brandIds"],
      notes: toNullable(form.notes),
    };

    const ok = await run(async () => {
      if (influencer) {
        await update(influencer.id, payload);
        toast.success(`${payload.name} updated`);
      } else {
        await create(payload);
        toast.success(`${payload.name} added`);
      }
    });

    if (ok) onOpenChange(false);
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <SheetContent size="wide">
        <SheetHeader>
          <SheetTitle>{isEdit ? `Edit ${influencer!.name}` : "Add a creator"}</SheetTitle>
          <SheetDescription>
            {isEdit
              ? "The web address of this creator does not change when their name does — the link you shared last month still works. Submitting replaces their account list with whatever is below."
              : "A creator needs a name and at least one account. Add every platform they post on — each one carries its own reach."}
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="contents">
          <SheetBody className="flex flex-col gap-8">
            {formError ? (
              <p role="alert" className="rounded-lg bg-error-tint p-3 text-helper text-error">
                {formError}
              </p>
            ) : null}

            <FieldSection title="Identity">
              <Field label="Name" required error={fieldErrors.name}>
                {(field) => (
                  <Input
                    {...field}
                    required
                    maxLength={200}
                    value={form.name}
                    onChange={(event) => set("name", event.target.value)}
                    placeholder="Priya Raman"
                  />
                )}
              </Field>

              {/* **Vertical sits with the person, not with the reach.** It used to head an
                  `Audience` section over the follower count and the engagement rate; both of those
                  are an account's now, so what was left was one select under a heading about
                  numbers that had moved. What a creator covers is who they are. */}
              <Field label="Vertical" error={fieldErrors.vertical}>
                {(field) => (
                  <Select
                    {...field}
                    value={form.vertical}
                    onChange={(event) =>
                      set("vertical", event.target.value as InfluencerVertical | "")
                    }
                  >
                    {/* **`Generalist`, not `None` and not a blank line.** The union has no `other`
                        member on purpose, so the empty value here is a stated fact — this creator
                        covers no one vertical — rather than a field somebody skipped. Naming it at
                        the point of entry is what stops the two readings ever being entered as
                        one. */}
                    <option value="">{GENERALIST}</option>
                    {INFLUENCER_VERTICAL_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>

              <Field label="Status" required error={fieldErrors.status}>
                {(field) => (
                  <Select
                    {...field}
                    value={form.status}
                    onChange={(event) => set("status", event.target.value as InfluencerStatus)}
                  >
                    {INFLUENCER_STATUS_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            </FieldSection>

            {/* **The `Last updated` clause is not decoration, and it was nearly lost in the move.**
                The follower field it used to sit under carried it for a stated reason: a follower
                count is pulled from a platform and is stale within the day, so a form that shows
                only the number invites somebody to trust a figure nobody has checked this quarter.
                The form cannot fix that; what it can do is say when the figures were last touched,
                so a stale one is visible as stale rather than as current.

                It sits on the **section** now rather than on a field, because an account carries
                no timestamp of its own — deliberately: `influencer_accounts` is a value object and
                a `created_at` on a full-replacement row would reset on every unrelated edit and
                read as a lie about when the account started. The parent's `updatedAt` is the
                honest granularity, and it covers exactly the list below it. */}
            <FieldSection
              title="Accounts"
              description={
                influencer
                  ? `Every platform this creator posts on, each with its own reach. The first one is the account they are known by — it is the handle the roster shows. Last updated ${formatDateTime(influencer.updatedAt)}.`
                  : "Every platform this creator posts on, each with its own reach. The first one is the account they are known by — it is the handle the roster shows."
              }
            >
              <AccountRows
                accounts={form.accounts}
                disabled={isPending}
                onChange={(accounts) => set("accounts", accounts)}
              />
            </FieldSection>

            <FieldSection
              title="Brands"
              description="Which of this workspace's brands the creator is engaged for. Ticking none says they are a prospect — somebody on the shortlist nobody has booked."
            >
              <BrandPicker
                selected={form.brandIds}
                brands={brands}
                isLoading={brandsLoading}
                onChange={(brandIds) => set("brandIds", brandIds)}
              />
            </FieldSection>

            <FieldSection title="Notes">
              <Field label="Notes" error={fieldErrors.notes}>
                {(field) => (
                  <Textarea
                    {...field}
                    maxLength={5000}
                    value={form.notes}
                    onChange={(event) => set("notes", event.target.value)}
                    placeholder="Rates, past work, who to go through, anything the next person reading this record needs to know."
                  />
                )}
              </Field>
            </FieldSection>
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
            <Button type="submit" disabled={isPending}>
              {isPending ? (
                <>
                  <Loader2Icon className="animate-spin" data-icon="inline-start" />
                  Saving
                </>
              ) : isEdit ? (
                "Save changes"
              ) : (
                "Add creator"
              )}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

type FormState = {
  name: string;
  /**
   * One to ten rows, in the order they will be written — **index 0 is the primary account**.
   *
   * The rows hold their numbers as strings; see `AccountDraft`. Every operation over the list
   * lives in `account-drafts.ts`, which is also where the rules that cannot be seen in a browser
   * are asserted.
   */
  accounts: AccountDraft[];
  /** `""` is the generalist — see the select above. */
  vertical: InfluencerVertical | "";
  status: InfluencerStatus;
  brandIds: string[];
  notes: string;
};

/**
 * `?? ""` throughout: these are controlled inputs, and a `null` value drops the input to
 * uncontrolled with a warning, after which typing works and the state does not update.
 *
 * The account rows hold their numbers as **strings** while the form is open, because that is what
 * an input hands back and because `Number("")` is `0` — a state the draft must be able to hold
 * without it meaning a follower count of nothing. They are converted once, on submit, by
 * `toAccountPayload`.
 */
function initialState(influencer?: Influencer): FormState {
  return {
    name: influencer?.name ?? "",
    // One empty row for a new creator, never zero: the record cannot hold an empty list, so a
    // draft that started there would make `Add account` a step before any typing.
    accounts: accountDraftsFrom(influencer),
    vertical: influencer?.vertical ?? "",
    // A new creator defaults to `prospect`, matching the API's own default: somebody just entered
    // is on a shortlist, and defaulting to `active` would state a booking that never happened.
    status: influencer?.status ?? "prospect",
    brandIds: influencer?.brandIds ?? [],
    notes: influencer?.notes ?? "",
  };
}
