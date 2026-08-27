"use client";

import type { BrandAsset, PhotoCategory } from "@brandfactory/shared";
import { Loader2Icon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
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

import { usePhotographyMutations } from "../hooks";

/**
 * Edit the brand's subject buckets — add, rename, remove.
 *
 * **Deleting a bucket does not delete its photos.** `ON DELETE SET NULL` uncategorises them, which
 * is what makes offering a delete safe at all: a subject is a filing decision, and undoing one must
 * not destroy what was filed.
 *
 * It still owes the reader a warning that **names the count**, because the effect lands somewhere
 * they are not looking — the photos are in the grid behind this sheet, and they will simply move to
 * *Uncategorised* with no other sign that anything happened. A reader who is not told reads that as
 * data loss.
 */
export function CategoryManager({
  brandId,
  categories,
  photos,
  open,
  onOpenChange,
}: {
  brandId: string;
  categories: PhotoCategory[];
  photos: BrandAsset[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { createCategory, renameCategory, deleteCategory } = usePhotographyMutations(brandId);
  const [draft, setDraft] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editingName, setEditingName] = React.useState("");
  const [deleting, setDeleting] = React.useState<PhotoCategory | null>(null);
  const [deleteError, setDeleteError] = React.useState<string | null>(null);

  const [wasOpen, setWasOpen] = React.useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setDraft("");
      setEditingId(null);
    }
  }

  const countIn = React.useCallback(
    (categoryId: string) => photos.filter((photo) => photo.categoryId === categoryId).length,
    [photos],
  );

  async function add(event: React.FormEvent) {
    event.preventDefault();
    const name = draft.trim();
    if (!name) return;
    setBusy(true);
    try {
      await createCategory({ name });
      setDraft("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not add the category");
    } finally {
      setBusy(false);
    }
  }

  async function rename(categoryId: string) {
    const name = editingName.trim();
    if (!name) return;
    setBusy(true);
    try {
      await renameCategory(categoryId, { name });
      setEditingId(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not rename the category");
    } finally {
      setBusy(false);
    }
  }

  /**
   * **`ConfirmDialog`, not `window.confirm`.** An earlier draft used the browser's,
   * which blocks the main thread, cannot be styled, cannot show the server's own
   * refusal, and is the one dialog in the product that does not look like the
   * product. `ResourcesView` already established the shape one feature over.
   */
  async function confirmRemove() {
    if (!deleting) return;
    setBusy(true);
    setDeleteError(null);
    try {
      await deleteCategory(deleting.id);
      setDeleting(null);
    } catch (err) {
      // Into the dialog rather than a toast: the dialog is where the decision was
      // made, and it is still on screen.
      setDeleteError(err instanceof Error ? err.message : "Could not delete the category");
    } finally {
      setBusy(false);
    }
  }

  /**
   * The count goes in the *question*, not the answer.
   *
   * "Delete Food?" and "Delete Food? 23 photos move to Uncategorised" are
   * different decisions, and the effect lands in the grid behind this sheet with
   * nothing else on screen to announce it.
   */
  function deleteDescription(category: PhotoCategory): string {
    const count = countIn(category.id);
    if (count === 0) return `Nothing is filed under “${category.name}”.`;
    return `${count} photo${count === 1 ? "" : "s"} will move to Uncategorised. ${
      count === 1 ? "It is" : "They are"
    } not deleted.`;
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Subjects</SheetTitle>
          <SheetDescription>
            What this brand photographs — interior, food, people, product. Every brand keeps its own
            list, because the subjects differ.
          </SheetDescription>
        </SheetHeader>

        <SheetBody className="flex flex-col gap-5">
          <form onSubmit={add} className="flex items-end gap-2">
            <Field label="Add a subject" className="flex-1">
              {(field) => (
                <Input
                  {...field}
                  value={draft}
                  maxLength={80}
                  placeholder="Interior"
                  onChange={(event) => setDraft(event.target.value)}
                />
              )}
            </Field>
            <Button type="submit" disabled={busy || draft.trim() === ""}>
              {busy ? <Loader2Icon className="animate-spin" /> : <PlusIcon />}
              Add
            </Button>
          </form>

          {categories.length === 0 ? (
            <p className="text-helper text-ink-secondary">
              No subjects yet. Until there is one, every photo sits in Uncategorised — which is a
              real place, not an error.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-border-subtle rounded-xl border border-border">
              {categories.map((category) => {
                const count = countIn(category.id);
                return (
                  <li key={category.id} className="flex items-center gap-2 px-3 py-2">
                    {editingId === category.id ? (
                      <>
                        <Input
                          value={editingName}
                          maxLength={80}
                          aria-label={`Rename ${category.name}`}
                          onChange={(event) => setEditingName(event.target.value)}
                          className="flex-1"
                        />
                        <Button size="sm" disabled={busy} onClick={() => rename(category.id)}>
                          Save
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                          Cancel
                        </Button>
                      </>
                    ) : (
                      <>
                        <span className="flex-1 text-sm text-ink">{category.name}</span>
                        <span className="text-helper text-ink-tertiary">
                          {count} photo{count === 1 ? "" : "s"}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Rename ${category.name}`}
                          onClick={() => {
                            setEditingId(category.id);
                            setEditingName(category.name);
                          }}
                        >
                          <PencilIcon />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Delete ${category.name}`}
                          disabled={busy}
                          onClick={() => setDeleting(category)}
                        >
                          <Trash2Icon />
                        </Button>
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </SheetBody>

        <SheetFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </SheetFooter>

        <ConfirmDialog
          open={deleting !== null}
          onOpenChange={(next) => {
            if (!next) {
              setDeleting(null);
              setDeleteError(null);
            }
          }}
          title={deleting ? `Delete “${deleting.name}”?` : "Delete subject"}
          description={deleting ? deleteDescription(deleting) : ""}
          confirmLabel="Delete subject"
          onConfirm={() => void confirmRemove()}
          error={deleteError}
          isPending={busy}
        />
      </SheetContent>
    </Sheet>
  );
}
