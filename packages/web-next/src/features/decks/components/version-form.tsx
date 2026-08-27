"use client";

import type { CreateDeckVersionInput, DeckSource } from "@brandfactory/shared";
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
import { useSubmit } from "@/hooks/use-submit";
import { uploadBlob } from "@/lib/blob";

import { useDeckMutations } from "../hooks";

/**
 * Record a version against a deck — **the phase decision 3 sizes.**
 *
 * A version is one *source*: the PDF somebody exported, or the Canva design that stays editable.
 * The two arms are not two shapes of the same thing, and the asymmetry is the whole feature:
 *
 * - **`pdf`** — bytes, and no link. The file *is* the version.
 * - **`canva`** — a live link **and** a PDF export taken at the moment it was added. The link
 *   opens whatever the design is today; the snapshot preserves what the team actually saw.
 *
 * **The snapshot is required, not encouraged**, which is decision 3 as settled in the plan and
 * enforced two layers down by `deck_versions_source_shape`. So this form asks for both on the
 * Canva arm and says why — a snapshot nobody took is a snapshot that is not there on the day it
 * is wanted, and by then the design has moved on.
 *
 * **The write is ordered, and the order is the interesting part.** Upload first, insert second.
 * The reverse leaves a row pointing at bytes that never arrived, and the CHECK cannot catch that
 * — it constrains the column, not the object store. A failed upload therefore writes no row at
 * all; a failed insert leaves an unreferenced blob, which is the strictly safer of the two
 * failures and the one the brand-cascade sweep already tolerates.
 */
export function VersionForm({
  brandId,
  deckId,
  deckName,
  open,
  onOpenChange,
}: {
  brandId: string;
  deckId: string;
  deckName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { addVersion } = useDeckMutations(brandId);
  const { run, reset, isPending, formError, fieldErrors } = useSubmit();
  const [form, setForm] = React.useState(initialState);
  const [file, setFile] = React.useState<File | null>(null);
  const [uploading, setUploading] = React.useState(false);

  // Reset during render when `open` flips true, not in an effect — the pattern AGENTS.md records
  // twice. A sheet's content survives its close, so a form reopened after a save would otherwise
  // still hold the last draft, and the previous version's date would leak into the next one.
  const [wasOpen, setWasOpen] = React.useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setForm(initialState());
      setFile(null);
      reset();
    }
  }

  const pdfLabel = form.source === "canva" ? "PDF export of this design" : "PDF file";
  const pdfHint =
    form.source === "canva"
      ? "Required. The link opens the current design; this preserves what it looked like today."
      : "Required. The file is the version.";

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    // The sheet has a real `<form>`, so `required` covers the empty cases before this runs. The
    // file input cannot carry `required` usefully across a re-render, so it is checked here and
    // the message names the arm the reader is on.
    if (!file) {
      toast.error(
        form.source === "canva"
          ? "Attach the PDF export — a Canva version is recorded with its snapshot."
          : "Attach the PDF file.",
      );
      return;
    }

    const ok = await run(async () => {
      // **Upload first.** A failed upload must leave no row; a failed insert leaves an
      // unreferenced blob, which the brand cascade already sweeps.
      setUploading(true);
      let key: string;
      try {
        ({ key } = await uploadBlob({ file }));
      } finally {
        setUploading(false);
      }

      const base = {
        label: form.label.trim(),
        versionDate: form.versionDate,
        author: form.author.trim(),
        pdfBlobKey: key,
      };
      const input: CreateDeckVersionInput =
        form.source === "canva"
          ? { ...base, source: "canva", canvaUrl: form.canvaUrl.trim() }
          // `canvaUrl: null` is explicit rather than omitted: the pdf arm of the
          // schema *names* the column as null, which is what makes "a PDF version
          // has no live design" a statement the type checks rather than an
          // absence the reader has to infer.
          : { ...base, source: "pdf", canvaUrl: null };

      const updated = await addVersion(deckId, input);
      // **Not "is now current".** A backdated version does not supersede a newer one, and the
      // server answers with the whole stack precisely so this sentence can be true either way.
      const isCurrent = updated.current?.label === base.label;
      toast.success(
        isCurrent
          ? `${base.label} added to ${deckName} — now the current version`
          : `${base.label} added to ${deckName}, behind the current version`,
      );
    });

    if (ok) onOpenChange(false);
  }

  const busy = isPending || uploading;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <form onSubmit={handleSubmit} className="flex h-full flex-col">
          <SheetHeader>
            <SheetTitle>Add a version</SheetTitle>
            <SheetDescription>
              A new version supersedes the last. Nothing is overwritten and nothing is deleted —
              everything before it stays reachable in the history.
            </SheetDescription>
          </SheetHeader>

          <SheetBody className="flex flex-col gap-5">
            <Field label="Source" required error={fieldErrors.source}>
              {(field) => (
                <Select
                  {...field}
                  value={form.source}
                  onChange={(event) =>
                    setForm((f) => ({ ...f, source: event.target.value as DeckSource }))
                  }
                >
                  <option value="pdf">PDF — the exported file is the version</option>
                  <option value="canva">Canva — a live design, plus a snapshot</option>
                </Select>
              )}
            </Field>

            <Field label="Version label" required error={fieldErrors.label}>
              {(field) => (
                <Input
                  {...field}
                  value={form.label}
                  required
                  maxLength={100}
                  placeholder="v3, Series A, Feb 2026"
                  onChange={(event) => setForm((f) => ({ ...f, label: event.target.value }))}
                />
              )}
            </Field>

            <Field
              label="Version date"
              required
              error={fieldErrors.versionDate}
              hint="When this version was made — not when you are uploading it."
            >
              {(field) => (
                <Input
                  {...field}
                  type="date"
                  value={form.versionDate}
                  required
                  onChange={(event) => setForm((f) => ({ ...f, versionDate: event.target.value }))}
                />
              )}
            </Field>

            <Field
              label="Author"
              required
              error={fieldErrors.author}
              hint="Who made it. An agency name is as valid as a colleague's."
            >
              {(field) => (
                <Input
                  {...field}
                  value={form.author}
                  required
                  maxLength={200}
                  placeholder="Studio Mission"
                  onChange={(event) => setForm((f) => ({ ...f, author: event.target.value }))}
                />
              )}
            </Field>

            {form.source === "canva" ? (
              <Field
                label="Canva link"
                required
                error={fieldErrors.canvaUrl}
                hint="Opens the design as it is now, which is why the snapshot below is not optional."
              >
                {(field) => (
                  <Input
                    {...field}
                    type="url"
                    value={form.canvaUrl}
                    required
                    placeholder="https://www.canva.com/design/..."
                    onChange={(event) => setForm((f) => ({ ...f, canvaUrl: event.target.value }))}
                  />
                )}
              </Field>
            ) : null}

            <Field label={pdfLabel} required error={fieldErrors.pdfBlobKey} hint={pdfHint}>
              {(field) => (
                <Input
                  {...field}
                  type="file"
                  accept="application/pdf"
                  required
                  onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                />
              )}
            </Field>

            {formError ? <p className="text-sm text-error">{formError}</p> : null}
          </SheetBody>

          <SheetFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? <Loader2Icon className="animate-spin" /> : null}
              {uploading ? "Uploading…" : "Add version"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

type FormState = {
  source: DeckSource;
  label: string;
  versionDate: string;
  author: string;
  canvaUrl: string;
};

function initialState(): FormState {
  return { source: "pdf", label: "", versionDate: "", author: "", canvaUrl: "" };
}
