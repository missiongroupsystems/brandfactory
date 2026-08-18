"use client";

import type {
  CreateInfluencerInput,
  Influencer,
  InfluencerPlatform,
  InfluencerStatus,
  InfluencerVertical,
} from "@brandfactory/shared";
import { Loader2Icon } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Field, FieldGrid, FieldSection } from "@/components/ui/field";
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
import {
  INFLUENCER_PLATFORM_OPTIONS,
  INFLUENCER_STATUS_OPTIONS,
  INFLUENCER_VERTICAL_OPTIONS,
} from "@/lib/labels";

import { GENERALIST, toNullableNumber } from "../format";
import { useInfluencerMutations } from "../hooks";
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
      handle: form.handle.trim(),
      platform: form.platform,
      // `required` + `type="number"` on the input is what keeps this from reading a blank as `0`:
      // `Number("")` is `0`, and a creator silently entered on zero followers would land in Nano
      // and look like a real reading. The browser refuses the submit; if one ever gets past it,
      // `InfluencerFollowersSchema` refuses the body.
      followers: Number(form.followers),
      status: form.status,
      // `null`, not `0`. Nobody having measured a prospect is a different fact from a measured
      // zero, and `toNullableNumber` is where the two stay apart.
      engagementRate: toNullableNumber(form.engagementRate),
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
              ? "The web address of this creator does not change when their handle does — the link you shared last month still works."
              : "A creator needs a name, a handle, a platform and a follower count. The reach is what every other question hangs off, so it is the one figure that cannot wait."}
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

              <FieldGrid>
                <Field
                  label="Handle"
                  required
                  hint="Without the @. Every surface adds it."
                  error={fieldErrors.handle}
                >
                  {(field) => (
                    // **The sigil is drawn, never typed.** `InfluencerHandleSchema` *rejects* a
                    // leading `@` rather than stripping it, so that one handle has one spelling
                    // under the unique key — which makes it the form's job to put the rejected
                    // state out of reach rather than to launder it on the way past. A pasted
                    // `@priyaskin` reads as `@@priyaskin` in the field, visibly, and the server
                    // still refuses it with the reason.
                    <div className="relative">
                      <span
                        aria-hidden
                        className="pointer-events-none absolute inset-y-0 left-3 flex items-center font-mono text-sm text-ink-tertiary"
                      >
                        @
                      </span>
                      <Input
                        {...field}
                        required
                        maxLength={100}
                        className="pl-7 font-mono"
                        value={form.handle}
                        onChange={(event) => set("handle", event.target.value)}
                        placeholder="priyaskin"
                      />
                    </div>
                  )}
                </Field>

                <Field
                  label="Platform"
                  required
                  hint="One row per platform — two accounts are two follower counts."
                  error={fieldErrors.platform}
                >
                  {(field) => (
                    <Select
                      {...field}
                      value={form.platform}
                      onChange={(event) =>
                        set("platform", event.target.value as InfluencerPlatform)
                      }
                    >
                      {INFLUENCER_PLATFORM_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
              </FieldGrid>

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

            <FieldSection
              title="Audience"
              description="Reach sets the rate and decides the band this creator is filed under, so it is the one number on this form somebody has to look up rather than remember."
            >
              <FieldGrid>
                <Field
                  label="Followers"
                  required
                  // **The trap the plan named, and the answer to it.** A follower count is pulled
                  // from a platform and is stale within the day, so a box asking somebody to type
                  // `1,240,000` invites a figure nobody can stand behind. The form cannot fix
                  // that; what it can do is say when the figure was last touched, so a stale one
                  // is visible as stale rather than as current.
                  hint={
                    influencer
                      ? `Last updated ${formatDateTime(influencer.updatedAt)}.`
                      : "The count on the platform today."
                  }
                  error={fieldErrors.followers}
                >
                  {(field) => (
                    <Input
                      {...field}
                      required
                      type="number"
                      min={0}
                      step={1}
                      inputMode="numeric"
                      value={form.followers}
                      onChange={(event) => set("followers", event.target.value)}
                      placeholder="84200"
                    />
                  )}
                </Field>

                <Field
                  label="Engagement rate"
                  hint="Percent. Leave it empty if nobody has measured it — that is not the same as 0."
                  error={fieldErrors.engagementRate}
                >
                  {(field) => (
                    <Input
                      {...field}
                      type="number"
                      min={0}
                      max={100}
                      step={0.1}
                      inputMode="decimal"
                      value={form.engagementRate}
                      onChange={(event) => set("engagementRate", event.target.value)}
                      placeholder="3.8"
                    />
                  )}
                </Field>
              </FieldGrid>

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
  handle: string;
  platform: InfluencerPlatform;
  followers: string;
  engagementRate: string;
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
 * The two numbers are held as **strings** while the form is open, because that is what an input
 * hands back and because `Number("")` is `0` — a state the draft must be able to hold without it
 * meaning a follower count of nothing. They are converted once, on submit.
 */
function initialState(influencer?: Influencer): FormState {
  return {
    name: influencer?.name ?? "",
    handle: influencer?.handle ?? "",
    platform: influencer?.platform ?? "instagram",
    followers: influencer ? String(influencer.followers) : "",
    engagementRate: influencer?.engagementRate == null ? "" : String(influencer.engagementRate),
    vertical: influencer?.vertical ?? "",
    // A new creator defaults to `prospect`, matching the API's own default: somebody just entered
    // is on a shortlist, and defaulting to `active` would state a booking that never happened.
    status: influencer?.status ?? "prospect",
    brandIds: influencer?.brandIds ?? [],
    notes: influencer?.notes ?? "",
  };
}
