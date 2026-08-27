"use client";

import type { BrandResource, ResourceType } from "@brandfactory/shared";
import { ExternalLinkIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { EmptyState, LoadingRows, QueryError } from "@/components/layout/query-states";
import { ConfirmDialog } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useSubmit } from "@/hooks/use-submit";
import { RESOURCE_TYPE_LABELS, RESOURCE_TYPE_OPTIONS } from "@/lib/labels";

import { useResourceMutations, useResources } from "../hooks";
import { ResourceForm } from "./resource-form";

/**
 * This brand's resources — the sites it buys fonts, images, icons and tools from — grouped by
 * type and nothing else, with a form to add, edit and delete one.
 *
 * Grouped in `RESOURCE_TYPE_OPTIONS`' order, which is `ResourceTypeSchema`'s own declared order
 * (`font, image, icon, tool, reference, other`) and not alphabetical or by count — see the note
 * on `RESOURCE_TYPE_LABELS`. A type with no rows renders no section, so an empty group never
 * shows a heading over nothing.
 *
 * **Nothing is optimistic**, on `useOutletMutations` / `useVendorMutations`'s rule. A resource
 * delete is a hard delete with no domain refusal behind it — it either succeeds or 404s because
 * the row is already gone — so there is little upside to optimism here, and adopting it would
 * make this the one mutation in the package that does not wait for the server. A failed delete
 * therefore leaves the row exactly where it was, with the server's own sentence in the dialog
 * that asked for confirmation — the same shape `VendorResults` uses.
 */
export function ResourcesView({ brandId }: { brandId: string }) {
  const { resources, isLoading, error } = useResources(brandId);
  const { remove } = useResourceMutations(brandId);
  const { run, reset, isPending, formError } = useSubmit();

  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<BrandResource | undefined>();
  const [deleting, setDeleting] = React.useState<BrandResource | undefined>();

  const groups = React.useMemo(() => groupByType(resources), [resources]);

  const openCreate = React.useCallback(() => {
    setEditing(undefined);
    setFormOpen(true);
  }, []);
  const openEdit = React.useCallback((resource: BrandResource) => {
    setEditing(resource);
    setFormOpen(true);
  }, []);
  const openDelete = React.useCallback(
    (resource: BrandResource) => {
      reset();
      setDeleting(resource);
    },
    [reset],
  );

  async function handleDelete() {
    if (!deleting) return;
    // Held until the request settles, so a refusal (a 404 if the row is already gone) renders
    // inside the dialog rather than the row vanishing and reappearing around it.
    const ok = await run(async () => {
      await remove(deleting.id);
      toast.success(`${deleting.title} deleted`);
    });
    if (ok) setDeleting(undefined);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button variant="secondary" onClick={openCreate}>
          <PlusIcon data-icon="inline-start" />
          Add resource
        </Button>
      </div>

      {error ? (
        <QueryError error={error} />
      ) : isLoading ? (
        <LoadingRows rows={4} />
      ) : groups.length === 0 ? (
        <EmptyState
          message="No resources yet"
          hint="A resource is a link this brand buys from — a font shop, a stock library, a tool. Add the first one."
        />
      ) : (
        groups.map(({ type, items }) => (
          <Card key={type}>
            <CardHeader>
              {/* A real `<h2>`, not `CardTitle` — that component renders a `div` (see
                  `AGENTS.md`), and this heading is the one structural thing this screen owes a
                  reader: the group order is the whole claim the view test makes. */}
              <h2 className="font-heading text-h3 text-ink">{RESOURCE_TYPE_LABELS[type]}</h2>
            </CardHeader>
            <CardContent>
              <ul className="flex flex-col divide-y divide-border-subtle">
                {items.map((resource) => (
                  <ResourceRow
                    key={resource.id}
                    resource={resource}
                    onEdit={() => openEdit(resource)}
                    onDelete={() => openDelete(resource)}
                  />
                ))}
              </ul>
            </CardContent>
          </Card>
        ))
      )}

      {/* One instance for both modes, `editing` choosing between them. No `key` — the wedge
          `AGENTS.md` records twice: a `SheetContent` keyed on something that changes mid-close
          jams Base UI's dismissal. `ResourceForm` resets its own draft during render instead. */}
      <ResourceForm
        brandId={brandId}
        resource={editing}
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) setEditing(undefined);
        }}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(next) => {
          if (!next) {
            setDeleting(undefined);
            reset();
          }
        }}
        title={`Delete ${deleting?.title ?? "this resource"}?`}
        description="This removes the link for good. There is nothing here to restore — a resource holds no history the way a section or a guideline does."
        onConfirm={() => void handleDelete()}
        isPending={isPending}
        error={formError}
      />
    </div>
  );
}

/**
 * One row: the title as the link, the note underneath when there is one, edit and delete at the
 * end.
 *
 * `target="_blank"` with `rel="noreferrer"` — the pair this app uses everywhere it sends somebody
 * off-site (`vendor-detail.tsx`, `profile-identity.tsx`, `license-type-sheet.tsx`). Every row here
 * is a user-supplied URL pointing off-origin, so the pair is not optional on any of them.
 */
function ResourceRow({
  resource,
  onEdit,
  onDelete,
}: {
  resource: BrandResource;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <li className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
      <div>
        <a
          href={resource.url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 font-medium text-ink hover:text-brand hover:underline"
        >
          {resource.title}
          <ExternalLinkIcon aria-hidden className="size-3.5 shrink-0" />
          <span className="sr-only">(opens in a new tab)</span>
        </a>
        {resource.note ? (
          <p className="mt-1 text-helper text-ink-secondary">{resource.note}</p>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <Button variant="ghost" size="icon-sm" onClick={onEdit}>
          <PencilIcon />
          <span className="sr-only">Edit {resource.title}</span>
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={onDelete}>
          <Trash2Icon />
          <span className="sr-only">Delete {resource.title}</span>
        </Button>
      </div>
    </li>
  );
}

/**
 * Buckets `resources` by `type`, in `RESOURCE_TYPE_OPTIONS`' order — the enum's own declaration —
 * and drops any type with no rows. The only part of this screen worth a unit-level look, which is
 * why the view test targets the rendered heading order rather than this function directly: the
 * two are one seam and the render is what a browser pass can see going wrong.
 */
function groupByType(
  resources: readonly BrandResource[],
): { type: ResourceType; items: BrandResource[] }[] {
  const buckets = new Map<ResourceType, BrandResource[]>();
  for (const resource of resources) {
    const bucket = buckets.get(resource.type) ?? [];
    bucket.push(resource);
    buckets.set(resource.type, bucket);
  }

  return RESOURCE_TYPE_OPTIONS.map((option) => option.value)
    .filter((type) => buckets.has(type))
    .map((type) => ({ type, items: buckets.get(type)! }));
}
