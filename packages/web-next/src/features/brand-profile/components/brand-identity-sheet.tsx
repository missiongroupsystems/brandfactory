"use client";

import { Loader2Icon } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Field, FieldSection } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import { normalizeWebsiteUrl } from "@/lib/website-url";

import { useBrandProfileMutations } from "../hooks";
import type { BrandProfile } from "../types";

/**
 * The brand row itself — name, description, website — over `PATCH /brands/:id`.
 *
 * **Three fields and no fourth.** Everything else on this page is a guideline section with its
 * own editor; these are the columns on `brands`, and they are the only things the identity band
 * renders that a section cannot say.
 *
 * **The description is a `Textarea` here and an `Input` on the create form**, which is not an
 * inconsistency: creating a brand wants one line typed quickly, and editing one is where somebody
 * writes the two sentences the page shows when there is no TL;DR yet.
 *
 * The website goes through `normalizeWebsiteUrl` before it is sent, exactly as the create form
 * does — the schema accepts `http`/`https` only, and a bare `casavostra.com` is what people type.
 */
export function BrandIdentitySheet({
  profile,
  open,
  onOpenChange,
}: {
  profile: BrandProfile;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { updateBrand } = useBrandProfileMutations(profile.id);
  const { run, reset, isPending, formError, fieldErrors } = useSubmit();

  const [form, setForm] = React.useState(() => formFrom(profile));
  const [websiteError, setWebsiteError] = React.useState<string | null>(null);

  // Adjust-state-on-prop-change, during render. A sheet's content survives its close, so a form
  // reopened after a save would otherwise still hold the draft from last time — including the
  // values of a *different* brand, if the switcher moved while it was shut.
  const [wasOpen, setWasOpen] = React.useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setForm(formFrom(profile));
      setWebsiteError(null);
    }
  }

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

    const ok = await run(async () => {
      await updateBrand({
        name,
        // `null` and not `undefined`: this is an edit, so a cleared field is a *clear*, and
        // omitting the key would silently keep the old value. `toNullable`'s rule, applied to
        // a patch rather than to a create.
        description: form.description.trim() || null,
        websiteUrl: website.value,
      });
      toast.success(`${name} saved`);
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
          <SheetTitle>Edit brand</SheetTitle>
          <SheetDescription>
            The name, the one-line description and where the brand already exists in public.
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
                  />
                )}
              </Field>

              <Field
                label="Description"
                error={fieldErrors.description}
                hint="Shown under the name until the brand has a TL;DR, which then takes over."
              >
                {(field) => (
                  <Textarea
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
            <Button type="submit" disabled={isPending || !form.name.trim()}>
              {isPending ? (
                <>
                  <Loader2Icon className="animate-spin" data-icon="inline-start" />
                  Saving
                </>
              ) : (
                "Save brand"
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
}

function formFrom(profile: BrandProfile): FormState {
  return {
    name: profile.name,
    description: profile.description ?? "",
    websiteUrl: profile.websiteUrl ?? "",
  };
}
