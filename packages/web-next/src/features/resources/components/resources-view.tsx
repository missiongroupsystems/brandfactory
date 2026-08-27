"use client";

import type { BrandResource, ResourceType } from "@brandfactory/shared";
import { ExternalLinkIcon } from "lucide-react";
import * as React from "react";

import { EmptyState, LoadingRows, QueryError } from "@/components/layout/query-states";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { RESOURCE_TYPE_LABELS, RESOURCE_TYPE_OPTIONS } from "@/lib/labels";

import { useResources } from "../hooks";

/**
 * This brand's resources — the sites it buys fonts, images, icons and tools from — grouped by
 * type and nothing else. **Read-only.** No create, no edit, no delete: Phase 1D adds the form.
 *
 * Grouped in `RESOURCE_TYPE_OPTIONS`' order, which is `ResourceTypeSchema`'s own declared order
 * (`font, image, icon, tool, reference, other`) and not alphabetical or by count — see the note
 * on `RESOURCE_TYPE_LABELS`. A type with no rows renders no section, so an empty group never
 * shows a heading over nothing.
 */
export function ResourcesView({ brandId }: { brandId: string }) {
  const { resources, isLoading, error } = useResources(brandId);

  const groups = React.useMemo(() => groupByType(resources), [resources]);

  if (error) return <QueryError error={error} />;
  if (isLoading) return <LoadingRows rows={4} />;

  if (groups.length === 0) {
    return (
      <EmptyState
        message="No resources yet"
        hint="A resource is a link this brand buys from — a font shop, a stock library, a tool. Phase 1D adds the way to record one."
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {groups.map(({ type, items }) => (
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
                <ResourceRow key={resource.id} resource={resource} />
              ))}
            </ul>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/**
 * One row: the title as the link, the note underneath when there is one.
 *
 * `target="_blank"` with `rel="noreferrer"` — the pair this app uses everywhere it sends somebody
 * off-site (`vendor-detail.tsx`, `profile-identity.tsx`, `license-type-sheet.tsx`). Every row here
 * is a user-supplied URL pointing off-origin, so the pair is not optional on any of them.
 */
function ResourceRow({ resource }: { resource: BrandResource }) {
  return (
    <li className="py-3 first:pt-0 last:pb-0">
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
      {resource.note ? <p className="mt-1 text-helper text-ink-secondary">{resource.note}</p> : null}
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
