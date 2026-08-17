"use client";

import {
  GUIDELINE_LABEL_MAX_CHARS,
  SUGGESTED_SECTIONS,
  sameSectionLabel,
  type BrandWithSections,
  type ProseMirrorDoc,
  type SectionId,
} from "@brandfactory/shared";
import { Loader2Icon } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
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

import { EMPTY_DOC, mergeSection, removeSection } from "../guidelines";
import { useBrandProfileMutations } from "../hooks";
import { RichTextEditor } from "./rich-text-editor";

/**
 * What the page asked to edit.
 *
 * `sectionId` absent means **add**: the label is a starting point (a suggestion chip, a footer
 * chip, or nothing at all) and the row does not exist yet.
 */
export interface EditTarget {
  sectionId?: SectionId;
  label: string;
}

/**
 * Edit one guideline section — label, body, and the delete.
 *
 * **A sheet per section, not one modal holding the whole list.** The page is a document with a
 * card per section, so the affordance belongs on the card the reader is already looking at.
 * `packages/web`'s `BrandGuidelinesEditor` is the other design — 665 lines, every section in one
 * form, drag to reorder — and it is deliberately not ported: it is a *list editor*, and this page
 * is not a list.
 *
 * **The body is the stored document, never the page's blocks.** `ProfileBlock[]` is a flattened
 * rendering with no marks; round-tripping one would quietly strip formatting written in the other
 * app. `source` is the same `BrandWithSections` the profile was mapped from, and this sheet reads
 * the section out of it.
 *
 * **The reset happens during render**, the React-documented adjust-state-on-prop-change pattern,
 * and `SheetContent` is deliberately not keyed: a key that changes mid-dismissal breaks Base UI's
 * dismissal and leaves the overlay eating clicks. Both traps are in `AGENTS.md`, both have bitten
 * this repository, and the editor inside *is* keyed — on a seed bumped at each open — because
 * TipTap applies `content` at creation only.
 */
export function SectionEditorSheet({
  target,
  source,
  open,
  onOpenChange,
}: {
  target: EditTarget | null;
  source: BrandWithSections | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { saveGuidelines } = useBrandProfileMutations(source?.id);
  const { run, reset, isPending, formError } = useSubmit();

  const stored = target?.sectionId
    ? source?.sections.find((section) => section.id === target.sectionId)
    : undefined;

  const [label, setLabel] = React.useState(target?.label ?? "");
  const [body, setBody] = React.useState<ProseMirrorDoc>(stored?.body ?? EMPTY_DOC);
  // Bumped at each open so the editor remounts on the section being edited. `content` is applied
  // at creation, so without this the second section opened would show the first one's words.
  const [seed, setSeed] = React.useState(0);
  const [confirmingDelete, setConfirmingDelete] = React.useState(false);

  const [wasOpen, setWasOpen] = React.useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setLabel(target?.label ?? "");
      setBody(stored?.body ?? EMPTY_DOC);
      setSeed((n) => n + 1);
      setConfirmingDelete(false);
    }
  }

  const trimmed = label.trim();
  const isNew = !target?.sectionId;

  /**
   * A label already on the brand, other than this row's own.
   *
   * Checked with `sameSectionLabel`, so `TL;DR` and `TLDR` are one label — the same
   * punctuation-tolerant comparison the taxonomy uses everywhere else. Two rows under one name
   * would make `findSection` pick whichever came first and hide the other from the page entirely,
   * which reads as a section that vanished on save.
   */
  const duplicate =
    trimmed.length > 0 &&
    (source?.sections ?? []).some(
      (section) => section.id !== target?.sectionId && sameSectionLabel(section.label, trimmed),
    );

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!trimmed || duplicate || !source) return;

    const ok = await run(async () => {
      // `current` is the brand as the server holds it *now* — see `saveGuidelines`. The payload
      // is the complete section list, so building it from anything staler would delete a section
      // added since this page loaded.
      await saveGuidelines((current) =>
        mergeSection(current, { id: target?.sectionId, label: trimmed, body }),
      );
      toast.success(isNew ? `${trimmed} added` : `${trimmed} saved`);
    });

    if (ok) onOpenChange(false);
  }

  async function handleDelete() {
    if (!target?.sectionId || !source) return;
    const id = target.sectionId;
    const ok = await run(async () => {
      await saveGuidelines((current) => removeSection(current, id));
      toast.success(`${stored?.label ?? "Section"} deleted`);
    });
    if (ok) {
      setConfirmingDelete(false);
      onOpenChange(false);
    }
  }

  return (
    <>
      <Sheet
        open={open}
        onOpenChange={(next) => {
          if (!next) reset();
          onOpenChange(next);
        }}
      >
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{isNew ? "Add a section" : stored?.label || "Edit section"}</SheetTitle>
            <SheetDescription>
              {isNew
                ? "A section is one facet of the brand. The label is free text — the suggestions below are the ones the product knows how to read."
                : "Everything written here reaches every creative surface that inherits this brand."}
            </SheetDescription>
          </SheetHeader>

          <form onSubmit={handleSubmit} className="contents">
            <SheetBody className="flex flex-col gap-6">
              {formError ? (
                <p role="alert" className="rounded-lg bg-error-tint p-3 text-helper text-error">
                  {formError}
                </p>
              ) : null}

              <Field
                label="Label"
                required
                error={duplicate ? "This brand already has a section with that name." : undefined}
                hint={
                  isNew
                    ? "A known label is read by the planner and the agent; an invented one is still yours."
                    : undefined
                }
              >
                {(field) => (
                  <Input
                    {...field}
                    required
                    maxLength={GUIDELINE_LABEL_MAX_CHARS}
                    value={label}
                    onChange={(event) => setLabel(event.target.value)}
                    placeholder="Voice & tone"
                  />
                )}
              </Field>

              {isNew ? <SuggestionChips source={source} onPick={setLabel} /> : null}

              <div className="flex flex-col gap-1.5">
                <span className="text-helper font-medium text-ink">Body</span>
                <RichTextEditor
                  key={seed}
                  content={body}
                  onChange={setBody}
                  ariaLabel={`${trimmed || "Section"} body`}
                />
                <span className="text-helper text-ink-tertiary">
                  Leave it empty to keep the row as a reminder — an empty section is a real state,
                  and the footer lists it.
                </span>
              </div>
            </SheetBody>

            <SheetFooter className="justify-between">
              {stored ? (
                <Button
                  type="button"
                  variant="ghost"
                  disabled={isPending}
                  onClick={() => setConfirmingDelete(true)}
                  className="text-error"
                >
                  Delete section
                </Button>
              ) : (
                <span />
              )}

              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={isPending}
                  onClick={() => onOpenChange(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isPending || !trimmed || duplicate}>
                  {isPending ? (
                    <>
                      <Loader2Icon className="animate-spin" data-icon="inline-start" />
                      Saving
                    </>
                  ) : isNew ? (
                    "Add section"
                  ) : (
                    "Save"
                  )}
                </Button>
              </div>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={confirmingDelete}
        onOpenChange={setConfirmingDelete}
        title={`Delete ${stored?.label ?? "this section"}?`}
        description="The section and everything written in it go. Nothing else on the brand changes, and this cannot be undone from here."
        onConfirm={() => void handleDelete()}
        error={formError}
        isPending={isPending}
      />
    </>
  );
}

/**
 * The labels the product knows, minus the ones this brand already holds.
 *
 * **The taxonomy is a suggestion and never a constraint** — the label field above takes anything,
 * and a brand's own inventions sort to the end of the page rather than being refused. What the
 * chips buy is the other half: a section named exactly as `SUGGESTED_SECTIONS` names it is one
 * the planner, the agent and the auto-fill can all find, and a `Voice and tone` typed by hand is
 * not that section to anything but a person reading it.
 */
function SuggestionChips({
  source,
  onPick,
}: {
  source: BrandWithSections | undefined;
  onPick: (label: string) => void;
}) {
  const missing = SUGGESTED_SECTIONS.filter(
    (suggestion) =>
      !(source?.sections ?? []).some((section) => sameSectionLabel(section.label, suggestion.label)),
  );
  if (missing.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <span className="text-helper text-ink-tertiary">Sections this brand does not have yet</span>
      <div className="flex flex-wrap gap-2">
        {missing.map((suggestion) => (
          <button
            key={suggestion.label}
            type="button"
            title={suggestion.description}
            onClick={() => onPick(suggestion.label)}
            className="rounded-lg border border-border-input px-2.5 py-1 text-helper text-ink-secondary hover:border-border-strong hover:text-ink"
          >
            {suggestion.label}
          </button>
        ))}
      </div>
    </div>
  );
}
