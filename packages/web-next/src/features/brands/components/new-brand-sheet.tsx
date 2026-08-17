"use client";

import { RESEARCH_COST_ESTIMATE, RESEARCH_DURATION_RANGE } from "@brandfactory/shared";
import { Loader2Icon } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldSection } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useSubmit } from "@/hooks/use-submit";
import { researchService } from "@/features/research/api";
import { useResearchConfig } from "@/features/research/hooks";
import { normalizeWebsiteUrl } from "@/lib/website-url";

import { useBrandMutations } from "../hooks";

/**
 * Create a brand from the switcher. Three fields and one opt-in.
 *
 * **A sheet, where `packages/web` uses a dialog.** The content is ported from
 * `components/NewBrandDialog.tsx` — the same fields, the same website normalisation, the same
 * research rule — but the container is this app's own: every create form here is a `Sheet`
 * (`brand-form.tsx`, `license-form.tsx`, `outlet-form.tsx`), and there is no `dialog.tsx` in
 * `components/ui/`. Adding one to match the other app would mean a new untested primitive to
 * restyle onto Mission tokens, against a form that already has a home.
 *
 * **The reset is during render, not in an effect.** A sheet's content survives its close — it
 * stays mounted through the exit animation — so a form reopened straight after a successful
 * create still holds the previous draft. And `SheetContent` is deliberately **not** keyed:
 * a key that changes mid-dismissal breaks Base UI's dismissal and leaves the overlay eating
 * clicks. Both traps are in AGENTS.md and both have bitten this repo.
 *
 * **The research opt-in is gated on the deployment, not on the field.** 1.13.0's rule: when
 * research is off the whole control is *absent*, not disabled — a disabled checkbox nobody can
 * enable advertises a feature this deployment does not have. Within an enabled deployment it
 * still disables without a website, because the run has nothing to read.
 */
export function NewBrandSheet({
  workspaceId,
  open,
  onOpenChange,
}: {
  workspaceId: string | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { create } = useBrandMutations(workspaceId);
  const { run, reset, isPending, formError, fieldErrors } = useSubmit();

  const [form, setForm] = React.useState(EMPTY_FORM);
  const [websiteError, setWebsiteError] = React.useState<string | null>(null);

  // Adjust-state-on-prop-change, the React-documented pattern — see the note above.
  const [wasOpen, setWasOpen] = React.useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setForm(EMPTY_FORM);
      setWebsiteError(null);
    }
  }

  // Asked only while the sheet can be seen. The answer is deployment config; it does not
  // change while somebody types a name.
  const { data: researchConfig } = useResearchConfig({ enabled: open });
  const researchEnabled = researchConfig?.enabled === true;

  // Checked live against the field, not against the last submit: the checkbox has to disable
  // the moment the website is cleared, before Create rather than after it.
  const websitePreview = normalizeWebsiteUrl(form.websiteUrl);
  const hasWebsite = websitePreview.ok && websitePreview.value !== null;
  const researchChecked = form.researchOptIn && hasWebsite;

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const name = form.name.trim();
    if (!name) return;

    const website = normalizeWebsiteUrl(form.websiteUrl);
    if (!website.ok) {
      setWebsiteError(website.error);
      return;
    }
    setWebsiteError(null);

    // Captured before the sheet closes and clears them.
    const startResearch = researchEnabled && researchChecked;

    const ok = await run(async () => {
      const brand = await create({
        name,
        ...(form.description.trim() ? { description: form.description.trim() } : {}),
        // Omitted rather than sent as `null`: `websiteUrl` is optional-nullable on create, and
        // a brand that never had one has nothing to clear.
        ...(website.value ? { websiteUrl: website.value } : {}),
      });
      toast.success(`${brand.name} created`);

      // **Brand first, research second, and never in the same call.** A vendor outage must
      // never stand between somebody and a brand — and creating a brand with a website does
      // not start a run by itself, because that would spend ≈$0.40 on every create. This is
      // the opt-in above, honoured.
      if (startResearch) {
        try {
          await researchService.start(brand.id);
          toast.success(`Researching ${brand.name} — ${RESEARCH_DURATION_RANGE}.`, {
            // Honest about where the result shows up. This shell has no brand hub yet, so the
            // run reports nowhere here; saying so beats a toast that implies a progress bar is
            // coming.
            description: "Drafts and a report land on the brand. Follow the run in the brand hub.",
          });
        } catch (err) {
          // The brand exists. A failed start is a toast, not a failed create.
          toast.error(
            err instanceof Error ? err.message : "Brand created, but research could not start.",
          );
        }
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
      <SheetContent>
        <SheetHeader>
          <SheetTitle>New brand</SheetTitle>
          <SheetDescription>
            A brand is the source of truth every creative surface inherits. Only the name is
            needed now — the guidelines fill in as it takes shape.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="contents">
          <SheetBody className="flex flex-col gap-8">
            {formError ? (
              <p role="alert" className="rounded-lg bg-error-tint p-3 text-helper text-error">
                {formError}
              </p>
            ) : null}

            <FieldSection title="Brand">
              <Field label="Name" required error={fieldErrors.name}>
                {(field) => (
                  <Input
                    {...field}
                    required
                    maxLength={120}
                    value={form.name}
                    onChange={(event) => set("name", event.target.value)}
                    placeholder="Casa Vostra"
                  />
                )}
              </Field>

              <Field label="Description" error={fieldErrors.description}>
                {(field) => (
                  <Input
                    {...field}
                    value={form.description}
                    onChange={(event) => set("description", event.target.value)}
                    placeholder="What this brand is about"
                  />
                )}
              </Field>

              <Field
                label="Website"
                error={websiteError ?? fieldErrors.websiteUrl}
                hint="Where the brand already exists in public. It is what research reads."
              >
                {(field) => (
                  <Input
                    {...field}
                    value={form.websiteUrl}
                    onChange={(event) => {
                      set("websiteUrl", event.target.value);
                      if (websiteError) setWebsiteError(null);
                    }}
                    placeholder="casavostra.com"
                  />
                )}
              </Field>
            </FieldSection>

            {researchEnabled ? (
              <FieldSection title="Research">
                <div className="flex items-start gap-3 rounded-lg bg-surface-sunken px-3 py-2.5">
                  <Checkbox
                    id="brand-research"
                    checked={researchChecked}
                    disabled={!hasWebsite}
                    onChange={(event) => set("researchOptIn", event.target.checked)}
                    className="mt-0.5"
                  />
                  <div className="min-w-0 flex-1">
                    <label
                      htmlFor="brand-research"
                      className={
                        hasWebsite
                          ? "block cursor-pointer text-sm font-medium text-ink"
                          : "block cursor-not-allowed text-sm font-medium text-ink-disabled"
                      }
                    >
                      Research this brand{" "}
                      <span className="font-normal text-ink-secondary">
                        — reads the public web, ~{RESEARCH_DURATION_RANGE},{" "}
                        {RESEARCH_COST_ESTIMATE}
                      </span>
                    </label>
                    <p className="mt-0.5 text-xs text-ink-tertiary">
                      Needs a website. Runs in the background; the brand is created either way.
                    </p>
                  </div>
                </div>
              </FieldSection>
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
            <Button type="submit" disabled={isPending || !form.name.trim() || !workspaceId}>
              {isPending ? (
                <>
                  <Loader2Icon className="animate-spin" data-icon="inline-start" />
                  Creating
                </>
              ) : (
                "Create brand"
              )}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

interface FormState {
  name: string;
  description: string;
  websiteUrl: string;
  researchOptIn: boolean;
}

/**
 * `researchOptIn` starts **true** and is still an opt-in: an empty website field disables the
 * control and unchecks it on screen, so nothing runs until a website is typed. That matches
 * `packages/web`, whose design mockup shows it ticked once a website is present.
 */
const EMPTY_FORM: FormState = {
  name: "",
  description: "",
  websiteUrl: "",
  researchOptIn: true,
};
