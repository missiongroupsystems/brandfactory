"use client";

import type { BrandResource, CreateBrandResourceInput, ResourceType } from "@brandfactory/shared";
import { Loader2Icon } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
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
import { toNullable, useSubmit } from "@/hooks/use-submit";
import { RESOURCE_TYPE_OPTIONS } from "@/lib/labels";

import { useResourceMutations } from "../hooks";

/**
 * Create or edit a resource — a named external link this brand buys from: a font shop, a stock
 * library, an icon set.
 *
 * One component for both, on `OutletForm`'s shape exactly: the mode is `resource ? "edit" :
 * "create"`, and the draft resets *during render* when `open` flips true rather than in an
 * effect — the pattern `AGENTS.md` records twice, because a `SheetContent` keyed on anything that
 * changes when the sheet closes wedges Base UI's dismissal.
 */
export function ResourceForm({
  brandId,
  resource,
  open,
  onOpenChange,
}: {
  brandId: string;
  resource?: BrandResource;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const isEdit = Boolean(resource);
  const { create, update } = useResourceMutations(brandId);
  const { run, reset, isPending, formError, fieldErrors } = useSubmit();

  const [form, setForm] = React.useState(() => initialState(resource));

  const [wasOpen, setWasOpen] = React.useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setForm(initialState(resource));
  }

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    const payload: CreateBrandResourceInput = {
      type: form.type,
      title: form.title.trim(),
      url: form.url.trim(),
      note: toNullable(form.note),
    };

    const ok = await run(async () => {
      if (resource) {
        await update(resource.id, payload);
        toast.success(`${payload.title} updated`);
      } else {
        await create(payload);
        toast.success(`${payload.title} added`);
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
          <SheetTitle>{isEdit ? `Edit ${resource!.title}` : "Add a resource"}</SheetTitle>
          <SheetDescription>
            {isEdit
              ? "Update where this points or what it is for."
              : "A link this brand buys from — a font shop, a stock library, a tool."}
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="contents">
          <SheetBody className="flex flex-col gap-4">
            {formError ? (
              <p role="alert" className="rounded-lg bg-error-tint p-3 text-helper text-error">
                {formError}
              </p>
            ) : null}

            <Field label="Type" required error={fieldErrors.type}>
              {(field) => (
                <Select
                  {...field}
                  value={form.type}
                  onChange={(event) => set("type", event.target.value as ResourceType)}
                >
                  {RESOURCE_TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              )}
            </Field>

            <Field label="Title" required error={fieldErrors.title}>
              {(field) => (
                <Input
                  {...field}
                  required
                  maxLength={200}
                  value={form.title}
                  onChange={(event) => set("title", event.target.value)}
                  placeholder="Founders Grotesk"
                />
              )}
            </Field>

            <Field label="URL" required error={fieldErrors.url}>
              {(field) => (
                <Input
                  {...field}
                  type="url"
                  required
                  maxLength={2048}
                  value={form.url}
                  onChange={(event) => set("url", event.target.value)}
                  placeholder="https://klim.co.nz"
                />
              )}
            </Field>

            <Field
              label="Note"
              hint="A short reminder of what the link is for, not a description of the site."
              error={fieldErrors.note}
            >
              {(field) => (
                <Textarea
                  {...field}
                  maxLength={500}
                  value={form.note}
                  onChange={(event) => set("note", event.target.value)}
                  placeholder="Anything the next person reading this needs to know."
                />
              )}
            </Field>
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
                "Add resource"
              )}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

type FormState = {
  type: ResourceType;
  title: string;
  url: string;
  note: string;
};

function initialState(resource?: BrandResource): FormState {
  return {
    type: resource?.type ?? "font",
    title: resource?.title ?? "",
    url: resource?.url ?? "",
    note: resource?.note ?? "",
  };
}
