"use client";

import type {
  SocialPlatform,
  SocialPost,
  SocialPostKind,
  SocialPostStatus,
} from "@brandfactory/shared";
import {
  SOCIAL_POST_BODY_MAX_CHARS,
  SOCIAL_POST_HOOK_MAX_CHARS,
  SOCIAL_POST_PLAN_FIELD_MAX_CHARS,
  SOCIAL_POST_STATUS_ORDER,
  SOCIAL_POST_URL_MAX_CHARS,
} from "@brandfactory/shared";
import { Loader2Icon, Trash2 } from "lucide-react";
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
import { useSubmit } from "@/hooks/use-submit";
import { SOCIAL_PLATFORM_LABELS, optionsFrom } from "@/lib/labels";

import {
  type EntryFormState,
  entryFormProblem,
  initialEntryForm,
  toCreateInput,
  toUpdateInput,
} from "../entry-form";
import type { CalendarEvent } from "../api";
import { useCalendarEntryMutations } from "../hooks";
import { EntryAttachments } from "./entry-attachments";
import { useSocialPosts } from "@/features/social-posts/hooks";
import { STATUS_LABELS } from "../status-pill";

const PLATFORM_OPTIONS = optionsFrom(SOCIAL_PLATFORM_LABELS);

/** What the sheet opens on: an entry to edit, or the defaults for a new one. */
export type EntryFormTarget =
  | { mode: "edit"; entry: SocialPost }
  | { mode: "create"; brandId?: string; date?: string };

/**
 * Create or edit one calendar entry — a post, a shoot, or an empty slot that holds a date.
 *
 * One component for both modes, on `ResourceForm`'s shape: the draft resets *during render* when
 * `open` flips true rather than in an effect, the pattern `AGENTS.md` records because a
 * `SheetContent` keyed on anything that changes when the sheet closes wedges Base UI's dismissal.
 *
 * **Brand and kind are fixed once the entry exists.** The route cannot move a post between brands,
 * and a shoot does not become a post — the patch schema has no key for either. Showing them as
 * disabled controls says so, where hiding them would leave the reader unsure which brand they are
 * editing.
 *
 * **Every plan field is optional.** A slot three weeks out with nothing in it is the thing the
 * workshop asked to see, so the only required fields are the ones a grid needs to draw it.
 */
export function EntryForm({
  target,
  brands,
  events,
  onOpenChange,
}: {
  target: EntryFormTarget | null;
  brands: { id: string; name: string }[];
  /** The Mission Events bookings the calendar already holds for the range on screen. */
  events: CalendarEvent[];
  onOpenChange: (open: boolean) => void;
}) {
  const open = target !== null;
  // The sheet stays mounted through its exit animation, and the parent clears
  // `target` the moment it closes. Without the last one held here, an edit
  // sheet would re-title itself "New entry" on its way out.
  const [shown, setShown] = React.useState(target);
  if (target !== null && target !== shown) setShown(target);
  const current = target ?? shown;
  const entry = current?.mode === "edit" ? current.entry : undefined;
  const isEdit = Boolean(entry);

  const { create, update, remove, restore } = useCalendarEntryMutations();
  const { run, reset, isPending, formError, fieldErrors } = useSubmit();

  const initial = React.useCallback(
    () =>
      initialEntryForm(
        entry,
        target?.mode === "create"
          ? {
              // One brand in the workspace means there is nothing to choose.
              brandId: target.brandId ?? (brands.length === 1 ? brands[0].id : undefined),
              date: target.date,
            }
          : undefined,
      ),
    [entry, target, brands],
  );

  const [form, setForm] = React.useState<EntryFormState>(initial);
  const [problem, setProblem] = React.useState<string | null>(null);

  const [wasOpen, setWasOpen] = React.useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setForm(initial());
      setProblem(null);
    }
  }

  const set = <K extends keyof EntryFormState>(key: K, value: EntryFormState[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const brandName = brands.find((b) => b.id === form.brandId)?.name ?? "this brand";

  // The brand's live shoots, from the brand's own list — undated ones too,
  // because a shoot is often planned before its day is fixed. `null` key
  // until a brand is chosen, so nothing is fetched for "Choose a brand".
  const { posts: brandPosts } = useSocialPosts(open && form.brandId ? form.brandId : undefined);
  const shootOptions = React.useMemo(
    () =>
      brandPosts
        .filter((p) => p.kind === "shoot" && p.id !== entry?.id)
        .map((p) => ({ id: p.id, label: shootLabel(p) })),
    [brandPosts, entry?.id],
  );
  // Events for this brand in the range the calendar already read. The picker
  // does not ask Mission Events again: the grid is the month the reader is
  // planning, and a booking outside it is one click of the arrows away.
  const eventOptions = React.useMemo(
    () =>
      events
        .filter((e) => e.brandId === form.brandId)
        .map((e) => ({ id: e.id, label: `${e.name} · ${eventDay(e.start)} · ${e.status}` })),
    [events, form.brandId],
  );
  // A link the lists above cannot show — a shoot since deleted, or an event
  // outside this month — must still read as a link rather than as "None",
  // or saving an unrelated field would look like it cleared it.
  const shootMissing = form.shootId !== "" && !shootOptions.some((o) => o.id === form.shootId);
  const eventMissing =
    form.eventsEventId !== "" && !eventOptions.some((o) => o.id === form.eventsEventId);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const why = entryFormProblem(form);
    setProblem(why);
    if (why) return;

    const ok = await run(async () => {
      if (entry) {
        const patch = toUpdateInput(entry, form);
        // Nothing changed: close without a request. The patch schema refuses `{}`, and a
        // "Saved" toast for a write that never happened would be a small lie.
        if (!patch) return;
        await update(entry.brandId, entry.id, patch);
        toast.success(`${brandName} entry updated`);
      } else {
        await create(form.brandId, toCreateInput(form));
        toast.success(`${form.kind === "shoot" ? "Shoot" : "Entry"} added for ${brandName}`);
      }
    });

    if (ok) onOpenChange(false);
  }

  async function handleDelete() {
    if (!entry) return;
    const ok = await run(async () => {
      await remove(entry.brandId, entry.id);
      toast.success(`${brandName} entry deleted`, {
        action: {
          label: "Undo",
          onClick: () => {
            restore(entry.brandId, entry.id).catch(() =>
              toast.error("The entry could not be restored."),
            );
          },
        },
      });
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
          <SheetTitle>{isEdit ? "Edit entry" : "New entry"}</SheetTitle>
          <SheetDescription>
            {isEdit
              ? "Change the plan. Only the fields you change are saved."
              : "A post, a shoot, or an empty slot that holds the date. Only brand and date are required."}
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="contents">
          <SheetBody className="flex flex-col gap-6">
            {problem || formError ? (
              <p role="alert" className="rounded-lg bg-error-tint p-3 text-helper text-error">
                {problem ?? formError}
              </p>
            ) : null}

            <FieldSection title="Slot">
              <FieldGrid>
                <Field label="Brand" required>
                  {(field) => (
                    <Select
                      {...field}
                      disabled={isEdit}
                      value={form.brandId}
                      onChange={(e) => {
                        const brandId = e.target.value;
                        // Attachments, the shoot and the event all belong to one
                        // brand. Carried across a brand change they would be ids the
                        // server refuses, so the switch clears them.
                        setForm((current) => ({
                          ...current,
                          brandId,
                          assetIds: [],
                          shootId: "",
                          eventsEventId: "",
                        }));
                      }}
                    >
                      <option value="" disabled>
                        Choose a brand
                      </option>
                      {brands.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>

                <Field label="Type" required>
                  {(field) => (
                    <Select
                      {...field}
                      disabled={isEdit}
                      value={form.kind}
                      onChange={(e) => set("kind", e.target.value as SocialPostKind)}
                    >
                      <option value="post">Post</option>
                      <option value="shoot">Shoot</option>
                    </Select>
                  )}
                </Field>

                <Field label="Date" required error={fieldErrors.scheduledAt}>
                  {(field) => (
                    <Input
                      {...field}
                      type="date"
                      required
                      value={form.date}
                      onChange={(e) => set("date", e.target.value)}
                    />
                  )}
                </Field>

                <Field label="Time" required>
                  {(field) => (
                    <Input
                      {...field}
                      type="time"
                      required
                      value={form.time}
                      onChange={(e) => set("time", e.target.value)}
                    />
                  )}
                </Field>

                <Field
                  label="Platform"
                  required
                  hint={form.kind === "shoot" ? "Where the footage is mainly for." : undefined}
                  error={fieldErrors.platform}
                >
                  {(field) => (
                    <Select
                      {...field}
                      value={form.platform}
                      onChange={(e) => set("platform", e.target.value as SocialPlatform)}
                    >
                      {PLATFORM_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>

                <Field
                  label="Status"
                  required
                  hint="Approved means cleared with whoever needed to see it."
                  error={fieldErrors.status}
                >
                  {(field) => (
                    <Select
                      {...field}
                      value={form.status}
                      onChange={(e) => set("status", e.target.value as SocialPostStatus)}
                    >
                      {SOCIAL_POST_STATUS_ORDER.map((s) => (
                        <option key={s} value={s}>
                          {STATUS_LABELS[s]}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
              </FieldGrid>
            </FieldSection>


            <FieldSection
              title="Links"
              description="Where this entry comes from, and what it is for."
            >
              <FieldGrid>
                {form.kind === "post" ? (
                  <Field
                    label="From shoot"
                    hint={shootOptions.length === 0 ? "This brand has no shoots yet." : undefined}
                    error={fieldErrors.shootId}
                  >
                    {(field) => (
                      <Select
                        {...field}
                        value={form.shootId}
                        onChange={(e) => set("shootId", e.target.value)}
                      >
                        <option value="">None</option>
                        {shootMissing ? (
                          <option value={form.shootId}>A shoot no longer listed</option>
                        ) : null}
                        {shootOptions.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.label}
                          </option>
                        ))}
                      </Select>
                    )}
                  </Field>
                ) : null}
                <Field
                  label="For event"
                  hint={
                    eventOptions.length === 0
                      ? "No Mission Events bookings for this brand in the month on screen."
                      : "From Mission Events, read-only."
                  }
                  error={fieldErrors.eventsEventId}
                >
                  {(field) => (
                    <Select
                      {...field}
                      value={form.eventsEventId}
                      onChange={(e) => set("eventsEventId", e.target.value)}
                    >
                      <option value="">None</option>
                      {eventMissing ? (
                        <option value={form.eventsEventId}>An event outside this month</option>
                      ) : null}
                      {eventOptions.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.label}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
              </FieldGrid>
            </FieldSection>

            <FieldSection
              title="Attachments"
              description="Images from this brand's library. An upload is filed in the library too."
            >
              {form.brandId ? (
                <EntryAttachments
                  brandId={form.brandId}
                  value={form.assetIds}
                  onChange={(next) => set("assetIds", next)}
                  disabled={isPending}
                />
              ) : (
                <p className="text-helper text-ink-secondary">Choose a brand first.</p>
              )}
              {fieldErrors.assetIds ? (
                <p role="alert" className="text-helper text-error">
                  {fieldErrors.assetIds}
                </p>
              ) : null}
            </FieldSection>

            <FieldSection title="Content plan" description="All optional. Free text for now.">
              <Field label="Hook" error={fieldErrors.hook}>
                {(field) => (
                  <Textarea
                    {...field}
                    rows={2}
                    maxLength={SOCIAL_POST_HOOK_MAX_CHARS}
                    value={form.hook}
                    onChange={(e) => set("hook", e.target.value)}
                    placeholder="The first two seconds."
                  />
                )}
              </Field>

              <FieldGrid>
                <Field label="Format" error={fieldErrors.format}>
                  {(field) => (
                    <Input
                      {...field}
                      maxLength={SOCIAL_POST_PLAN_FIELD_MAX_CHARS}
                      value={form.format}
                      onChange={(e) => set("format", e.target.value)}
                      placeholder="Reel · 30s"
                    />
                  )}
                </Field>
                <Field label="Dish" error={fieldErrors.dish}>
                  {(field) => (
                    <Input
                      {...field}
                      maxLength={SOCIAL_POST_PLAN_FIELD_MAX_CHARS}
                      value={form.dish}
                      onChange={(e) => set("dish", e.target.value)}
                    />
                  )}
                </Field>
                <Field
                  label="On camera"
                  hint="Chef, floor staff or outside talent."
                  error={fieldErrors.talent}
                >
                  {(field) => (
                    <Input
                      {...field}
                      maxLength={SOCIAL_POST_PLAN_FIELD_MAX_CHARS}
                      value={form.talent}
                      onChange={(e) => set("talent", e.target.value)}
                    />
                  )}
                </Field>
                <Field label="Filmed by" error={fieldErrors.filmedBy}>
                  {(field) => (
                    <Input
                      {...field}
                      maxLength={SOCIAL_POST_PLAN_FIELD_MAX_CHARS}
                      value={form.filmedBy}
                      onChange={(e) => set("filmedBy", e.target.value)}
                    />
                  )}
                </Field>
                <Field
                  label="Cleared with"
                  hint="Who signed it off, if they are not on the platform."
                  error={fieldErrors.clearedWith}
                >
                  {(field) => (
                    <Input
                      {...field}
                      maxLength={SOCIAL_POST_PLAN_FIELD_MAX_CHARS}
                      value={form.clearedWith}
                      onChange={(e) => set("clearedWith", e.target.value)}
                    />
                  )}
                </Field>
                <Field label="Canva link" error={fieldErrors.canvaUrl}>
                  {(field) => (
                    <Input
                      {...field}
                      type="url"
                      maxLength={SOCIAL_POST_URL_MAX_CHARS}
                      value={form.canvaUrl}
                      onChange={(e) => set("canvaUrl", e.target.value)}
                      placeholder="https://www.canva.com/design/…"
                    />
                  )}
                </Field>
              </FieldGrid>

              <Field label="Copy" error={fieldErrors.body}>
                {(field) => (
                  <Textarea
                    {...field}
                    rows={4}
                    maxLength={SOCIAL_POST_BODY_MAX_CHARS}
                    value={form.body}
                    onChange={(e) => set("body", e.target.value)}
                    placeholder="What the post says. Leave it blank while the slot waits for copy."
                  />
                )}
              </Field>
            </FieldSection>
          </SheetBody>

          <SheetFooter>
            {isEdit ? (
              <Button
                type="button"
                variant="ghost"
                className="mr-auto text-error"
                disabled={isPending}
                onClick={handleDelete}
              >
                <Trash2 data-icon="inline-start" />
                Delete
              </Button>
            ) : null}
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
                "Add entry"
              )}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

/** How a shoot reads in a picker: its hook or format, then its day. */
function shootLabel(p: SocialPost): string {
  const what = p.hook ?? p.format ?? "Shoot";
  const day = p.scheduledAt ? eventDay(p.scheduledAt) : "no date yet";
  return `${what} · ${day}`;
}

function eventDay(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" }).format(d);
}
