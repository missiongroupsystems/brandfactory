"use client";

import type { MarketingRequest, MarketingRequestPriority, MarketingRequestType } from "@brandfactory/shared";
import { Loader2Icon } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Field, FieldGrid } from "@/components/ui/field";
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
import { useOutlets } from "@/features/outlets/hooks";
import { useSubmit } from "@/hooks/use-submit";
import { MARKETING_REQUEST_PRIORITY_OPTIONS, MARKETING_REQUEST_TYPE_OPTIONS } from "@/lib/labels";

import { useRequestMutations } from "../hooks";
import {
  initialRequestForm,
  outletsForBrand,
  requestFormProblem,
  toCreateInput,
  type RequestFormState,
} from "../inbox";

/**
 * The request form, in a sheet on the inbox.
 *
 * **A brand is required and the outlet follows it.** Brand Base's unit is the brand, and an
 * outlet belongs to exactly one, so the outlet select offers only the chosen brand's outlets and
 * clears when the brand changes. The server checks the pair again; this only stops the reader
 * from building one it will refuse.
 *
 * **Who asked is not a field.** It is the signed-in user, set by the server from the session.
 *
 * The draft resets when the sheet opens, during render rather than in an effect or by keying
 * `SheetContent` — the adjust-state-on-prop-change pattern AGENTS.md prescribes.
 */
export function NewRequestSheet({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (created: MarketingRequest) => void;
}) {
  const { create } = useRequestMutations();
  const { run, reset, isPending, formError, fieldErrors } = useSubmit();
  const { brands, brand: activeBrand, isLoading: brandsLoading } = useActiveBrand();
  const { outlets } = useOutlets();

  const [form, setForm] = React.useState<RequestFormState>(() =>
    initialRequestForm(activeBrand?.id),
  );
  const [problem, setProblem] = React.useState<string | null>(null);
  const [wasOpen, setWasOpen] = React.useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setForm(initialRequestForm(activeBrand?.id));
      setProblem(null);
    }
  }

  const set = <K extends keyof RequestFormState>(key: K, value: RequestFormState[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const brandOutlets = React.useMemo(
    () => outletsForBrand(outlets, form.brandId),
    [outlets, form.brandId],
  );

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const stop = requestFormProblem(form);
    setProblem(stop);
    if (stop) return;
    const ok = await run(async () => {
      const created = await create(toCreateInput(form));
      toast.success(`Sent — the reference is ${created.reference}`);
      onCreated(created);
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
          <SheetTitle>New marketing request</SheetTitle>
          <SheetDescription>
            What you need from marketing — a post, a campaign, artwork, signage, a shoot. It arrives
            in the inbox under your name.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="contents" noValidate>
          <SheetBody className="flex flex-col gap-6">
            {problem || formError ? (
              <p role="alert" className="rounded-lg bg-error-tint p-3 text-helper text-error">
                {problem ?? formError}
              </p>
            ) : null}

            <FieldGrid>
              <Field label="Brand" required error={fieldErrors.brandId}>
                {(field) => (
                  <Select
                    {...field}
                    disabled={brandsLoading}
                    value={form.brandId}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        brandId: event.target.value,
                        // An outlet of the old brand is never right for the new one.
                        outletId: "",
                      }))
                    }
                  >
                    <option value="">Select a brand…</option>
                    {brands.map((brand) => (
                      <option key={brand.id} value={brand.id}>
                        {brand.name}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>

              <Field
                label="Outlet"
                hint={form.brandId ? "Leave empty for the whole brand." : "Choose a brand first."}
                error={fieldErrors.outletId}
              >
                {(field) => (
                  <Select
                    {...field}
                    disabled={!form.brandId}
                    value={form.outletId}
                    onChange={(event) => set("outletId", event.target.value)}
                  >
                    <option value="">The whole brand</option>
                    {brandOutlets.map((outlet) => (
                      <option key={outlet.id} value={outlet.id}>
                        {outlet.name}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>

              <Field label="Request type" required error={fieldErrors.type}>
                {(field) => (
                  <Select
                    {...field}
                    value={form.type}
                    onChange={(event) => set("type", event.target.value as MarketingRequestType)}
                  >
                    <option value="">Select…</option>
                    {MARKETING_REQUEST_TYPE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>

              <Field label="Priority" required error={fieldErrors.priority}>
                {(field) => (
                  <Select
                    {...field}
                    value={form.priority}
                    onChange={(event) =>
                      set("priority", event.target.value as MarketingRequestPriority)
                    }
                  >
                    {MARKETING_REQUEST_PRIORITY_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>

              <Field label="Summary" required error={fieldErrors.summary} className="sm:col-span-2">
                {(field) => (
                  <Input
                    {...field}
                    maxLength={200}
                    placeholder="One line — what do you need?"
                    value={form.summary}
                    onChange={(event) => set("summary", event.target.value)}
                  />
                )}
              </Field>

              <Field label="Details" error={fieldErrors.details} className="sm:col-span-2">
                {(field) => (
                  <Textarea
                    {...field}
                    rows={4}
                    maxLength={5000}
                    placeholder="Audience, message, where it runs, and anything marketing should know"
                    value={form.details}
                    onChange={(event) => set("details", event.target.value)}
                  />
                )}
              </Field>

              <Field label="Needed by" error={fieldErrors.neededBy}>
                {(field) => (
                  <Input
                    {...field}
                    type="date"
                    value={form.neededBy}
                    onChange={(event) => set("neededBy", event.target.value)}
                  />
                )}
              </Field>
            </FieldGrid>
          </SheetBody>

          <SheetFooter>
            <Button type="submit" disabled={isPending}>
              {isPending ? <Loader2Icon className="animate-spin" data-icon="inline-start" /> : null}
              {isPending ? "Sending" : "Send request"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
