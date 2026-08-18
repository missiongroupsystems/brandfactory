"use client";

import { ArrowLeftIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/layout/page-header";
import { EmptyState, LoadingRows, PageState, QueryError } from "@/components/layout/query-states";
import { ConfirmDialog } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useEntities, useOutlets } from "@/features/registry/hooks";
import { ApiError } from "@/lib/api/client";
import type { Brand, Entity, Outlet } from "@/lib/api/types";
import {
  BRAND_STATUS_LABELS,
  BRAND_STATUS_TONES,
  ENTITY_STATUS_LABELS,
  OUTLET_STATUS_LABELS,
  OUTLET_STATUS_TONES,
  OUTLET_TYPE_LABELS,
} from "@/lib/labels";
import { cn } from "@/lib/utils";
import { outletHref } from "@/lib/outlet-href";

import { useBrand, useBrandMutations } from "../hooks";
import { BrandForm } from "./brand-form";
import { BrandOutletsPicker } from "./brand-outlets-picker";

/** One request covers the estate several times over — 23 outlets against the API's 200 cap. */
const LIST_LIMIT = 200;

/**
 * One brand: what it is, what carries it, and the rename that a string column could not do.
 *
 * A page rather than a sheet, because that is what the request asked for and what a string could
 * not have supported: `/brands/Casa%20Vostra` is a URL whose primary key is a display string, so
 * renaming the brand would kill every link to it silently.
 *
 * **The summary line is built from the row's own aggregates**, not from the chip lists below it.
 * Those are two different questions — "how many outlets carry this" is answered server-side and
 * scoped to what the caller may see, while the lists are a page of records — and 0.13.0 is the
 * record of what happens when a detail view derives a number the list carried instead.
 */
export function BrandDetail({ brandId }: { brandId: string }) {
  const { data: brand, error, isLoading } = useBrand(brandId);
  const [editOpen, setEditOpen] = React.useState(false);
  const [pickerOpen, setPickerOpen] = React.useState(false);

  // A page can be landed on cold by a pasted link, where a sheet never could — so the states a
  // sheet never needed all have to exist here, and each keeps the back link. A dead end is the
  // failure mode a detail route invites.
  if (error) {
    return (
      <>
        <BackLink />
        <PageState>
          {error instanceof ApiError && error.isNotFound ? (
            <EmptyState
              message="No such brand"
              hint="It may have been deleted. Every brand we hold is on the list."
            />
          ) : (
            <QueryError error={error} />
          )}
        </PageState>
      </>
    );
  }
  if (isLoading || !brand) {
    return (
      <>
        <BackLink />
        <PageState>
          <LoadingRows rows={3} />
        </PageState>
      </>
    );
  }

  return (
    <>
      <BackLink />

      <PageHeader
        title={brand.name}
        actions={
          <span className="inline-flex items-center gap-2">
            <DeleteBrandButton brand={brand} />
            <Button variant="secondary" onClick={() => setEditOpen(true)}>
              <PencilIcon data-icon="inline-start" />
              Edit
            </Button>
          </span>
        }
      />

      <div className="flex flex-col gap-4 px-6 pb-8 md:px-8">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={BRAND_STATUS_TONES[brand.status]}>
            {BRAND_STATUS_LABELS[brand.status]}
          </Badge>
          <span className="text-helper text-ink-secondary">{summaryLine(brand)}</span>
        </div>

        {brand.notes ? (
          <Card>
            <CardHeader>
              <CardTitle>Notes</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap text-sm text-ink-secondary">{brand.notes}</p>
            </CardContent>
          </Card>
        ) : null}

        <OutletsCard brand={brand} onAdd={() => setPickerOpen(true)} />
        <CompaniesCard brand={brand} />
      </div>

      <BrandForm brand={brand} open={editOpen} onOpenChange={setEditOpen} />
      <BrandOutletsPicker brand={brand} open={pickerOpen} onOpenChange={setPickerOpen} />
    </>
  );
}

/** "3 outlets · 1 company" — off the aggregates, and it says nothing when there is nothing. */
function summaryLine(brand: Brand): string {
  const parts: string[] = [];
  if (brand.outlet_count > 0) {
    parts.push(`${brand.outlet_count} outlet${brand.outlet_count === 1 ? "" : "s"}`);
  }
  if (brand.entity_count > 0) {
    parts.push(`${brand.entity_count} compan${brand.entity_count === 1 ? "y" : "ies"}`);
  }
  return parts.length ? parts.join(" · ") : "Nothing carries this brand yet";
}

function BackLink() {
  return (
    <div className="px-6 pt-6 md:px-8 md:pt-8">
      <Link
        href="/registry-brands"
        className="-mx-2 inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-helper text-ink-secondary hover:text-brand"
      >
        <ArrowLeftIcon aria-hidden className="size-3.5" />
        All brands
      </Link>
    </div>
  );
}

/**
 * The chip vocabulary from the org chart — status dot, name, `Type · Status` sub-label — written
 * out rather than imported.
 *
 * `ChipBody` there is a `forwardRef` carrying two `size-9` spacers that exist so a dragged copy
 * lines up with the chip underneath it. That is drag machinery, not shared vocabulary, and
 * `AGENTS.md`'s rule for promoting to a shared home is *no feature-specific logic*. Stage 6
 * parameterises that board over a second dimension and is the moment to unify these if it still
 * looks worth it then.
 */
function OutletChip({ outlet }: { outlet: Outlet }) {
  return (
    <Link
      href={outletHref(outlet)}
      className="flex min-w-0 flex-col gap-0.5 rounded-lg border border-border-subtle bg-surface px-3 py-2 transition-colors hover:border-border-strong hover:text-brand"
    >
      <span className="flex items-center gap-2">
        <span
          aria-hidden
          className={cn(
            "size-1.5 shrink-0 rounded-4xl",
            OUTLET_STATUS_TONES[outlet.status] === "success" ? "bg-success" : "bg-ink-tertiary",
          )}
        />
        <span className="truncate text-sm font-medium text-ink">{outlet.name}</span>
      </span>
      <span className="pl-3.5 text-helper text-ink-tertiary">
        {OUTLET_TYPE_LABELS[outlet.outlet_type]} · {OUTLET_STATUS_LABELS[outlet.status]}
      </span>
    </Link>
  );
}

function EntityChip({ entity }: { entity: Entity }) {
  return (
    <span className="flex min-w-0 flex-col gap-0.5 rounded-lg border border-border-subtle bg-surface px-3 py-2">
      <span className="truncate text-sm font-medium text-ink">{entity.name}</span>
      <span className="text-helper text-ink-tertiary">
        {ENTITY_STATUS_LABELS[entity.status]}
        {entity.uen ? ` · ${entity.uen}` : ""}
      </span>
    </span>
  );
}

function OutletsCard({ brand, onAdd }: { brand: Brand; onAdd: () => void }) {
  const { data, error, isLoading } = useOutlets({ brand_id: brand.id, limit: LIST_LIMIT });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Outlets</CardTitle>
        <CardAction>
          <Button variant="secondary" size="sm" onClick={onAdd}>
            <PlusIcon data-icon="inline-start" />
            Add outlets
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {error ? (
          <QueryError error={error} />
        ) : isLoading ? (
          <LoadingRows rows={2} />
        ) : data && data.items.length > 0 ? (
          <>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {data.items.map((outlet) => (
                <OutletChip key={outlet.id} outlet={outlet} />
              ))}
            </div>
            {/* A truncated list on a page that also states a count is how "4 outlets" ends up
                over three chips. Said out loud rather than left to be noticed. */}
            {data.next_cursor ? (
              <p className="mt-3 text-helper text-ink-tertiary">
                Showing the first {data.items.length}. The count above is the full figure.
              </p>
            ) : null}
          </>
        ) : (
          <p className="text-helper text-ink-tertiary">
            No outlets carry this brand yet. Add some, or set it on an outlet&rsquo;s own record.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Companies naming this brand — *"this company exists to run this brand"*, and nothing more.
 *
 * There is no "Add companies" picker beside the outlets one, deliberately. An outlet's brand is
 * the reporting dimension and is worth assigning in bulk; a company's is a directory label, set
 * on the company. Two pickers would also read as two ways of doing one thing, when the two links
 * are orthogonal — **a brand is never inherited from a company down to its outlets**, and a
 * screen that offers both side by side invites exactly that reading.
 */
function CompaniesCard({ brand }: { brand: Brand }) {
  const { data, error, isLoading } = useEntities({ brand_id: brand.id, limit: LIST_LIMIT });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Companies</CardTitle>
      </CardHeader>
      <CardContent>
        {error ? (
          <QueryError error={error} />
        ) : isLoading ? (
          <LoadingRows rows={1} />
        ) : data && data.items.length > 0 ? (
          <>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {data.items.map((entity) => (
                <EntityChip key={entity.id} entity={entity} />
              ))}
            </div>
            <p className="mt-3 max-w-[72ch] text-helper text-ink-tertiary">
              A company naming this brand does not give it to the outlets it holds — an
              outlet&rsquo;s brand is its own. That is what keeps a report grouped by brand from
              changing when somebody tidies the org chart.
            </p>
          </>
        ) : (
          <p className="text-helper text-ink-tertiary">
            No company names this brand. Set it on a company&rsquo;s own record.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/** Delete, then leave. Staying would render this page against an id the API has just stopped
 * serving — a 404 the user was left standing on, having done nothing wrong. */
function DeleteBrandButton({ brand }: { brand: Brand }) {
  const router = useRouter();
  const { remove } = useBrandMutations();
  const [open, setOpen] = React.useState(false);
  const [isPending, setIsPending] = React.useState(false);
  const [formError, setFormError] = React.useState<string | undefined>();

  async function handleDelete() {
    setIsPending(true);
    setFormError(undefined);
    try {
      await remove(brand.id);
      toast.success(`${brand.name} deleted`);
      // `replace`, not `push`: this URL now 404s, so it must not stay in the history the Back
      // button walks.
      router.replace("/registry-brands");
    } catch (err) {
      // The API refuses a brand anything still carries (409, naming both counts) — the common
      // answer here rather than an edge case, so it belongs in the dialog rather than in a toast
      // that outlives it. **The server's own words**: a domain refusal names what is in the way,
      // which is more useful than anything this component could invent.
      setFormError(err instanceof ApiError ? err.message : "Could not delete this brand.");
      setIsPending(false);
    }
  }

  return (
    <>
      <Button
        variant="ghost"
        onClick={() => {
          setFormError(undefined);
          setOpen(true);
        }}
      >
        <Trash2Icon data-icon="inline-start" />
        Delete
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={(next) => {
          if (!isPending) setOpen(next);
        }}
        title={`Delete ${brand.name}?`}
        description="For a row created in error. A brand that closed should be retired — its outlets keep it that way, and every past report grouped by brand still says what it said."
        onConfirm={handleDelete}
        isPending={isPending}
        error={formError}
      />
    </>
  );
}
