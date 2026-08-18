"use client";

import { ArrowLeftIcon, ExternalLinkIcon, PencilIcon, Trash2Icon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { DetailItem, DetailList } from "@/components/layout/detail-list";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState, LoadingRows, PageState, QueryError } from "@/components/layout/query-states";
import { ConfirmDialog } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
// Contracts, not vendors: this section lists *agreements* filtered by vendor, so the
// query stays in the contracts feature and this component imports it. A copy living
// here is how two definitions of "this vendor's contracts" start.
import { useVendorContracts } from "@/features/contracts/hooks";
import { useBrandIndex } from "@/features/registry-brands/hooks";
import { ApiError } from "@/lib/api/client";
import type { VendorListItem } from "@/lib/api/types";
import { formatDate, PENDING } from "@/lib/format";
import {
  CONTRACT_STATUS_LABELS,
  CONTRACT_STATUS_TONES,
  SERVICE_CATEGORY_LABELS,
  VENDOR_STATUS_LABELS,
  VENDOR_STATUS_TONES,
} from "@/lib/labels";

import { useVendor, useVendorMutations } from "../hooks";
import { VendorForm } from "./vendor-form";

/**
 * One vendor: the company record, who to call, and every agreement we hold with them.
 *
 * **This was a sheet until 0.13.0**, handed the row the user clicked. As a page it has an
 * id and nothing else, which is why `GET /vendors/{id}` had to start carrying the four
 * contract aggregates the summary line is built from — without them the promotion would
 * have shipped as a regression.
 *
 * Editing stays a sheet, opened from the header, so there is still exactly one write path
 * for a vendor. Deleting navigates back to the list: a detail page for a deleted record is
 * a 404 the user was left standing on.
 */
export function VendorDetail({ vendorId }: { vendorId: string }) {
  const { data: vendor, error, isLoading } = useVendor(vendorId);
  const [editOpen, setEditOpen] = React.useState(false);

  // A page can be landed on cold, by a pasted link, where a sheet never could — so the
  // states a sheet never needed all have to exist here.
  if (error) {
    return (
      <>
        <BackLink />
        <PageState>
          {error instanceof ApiError && error.isNotFound ? (
            <EmptyState
              message="No such vendor"
              hint="It may have been deleted. Every vendor we hold is on the list."
            />
          ) : (
            <QueryError error={error} />
          )}
        </PageState>
      </>
    );
  }
  if (isLoading || !vendor) {
    return (
      <>
        <BackLink />
        <PageState>
          <LoadingRows rows={4} />
        </PageState>
      </>
    );
  }

  return (
    <>
      <BackLink />

      <PageHeader
        title={vendor.name}
        actions={
          <span className="inline-flex items-center gap-2">
            <DeleteVendorButton vendor={vendor} />
            <Button variant="secondary" onClick={() => setEditOpen(true)}>
              <PencilIcon data-icon="inline-start" />
              Edit
            </Button>
          </span>
        }
      />

      <div className="flex flex-col gap-4 px-6 pb-8 md:px-8">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={VENDOR_STATUS_TONES[vendor.status]}>
            {VENDOR_STATUS_LABELS[vendor.status]}
          </Badge>
          {vendor.category ? (
            <Badge variant="outline">{SERVICE_CATEGORY_LABELS[vendor.category]}</Badge>
          ) : null}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Company</CardTitle>
          </CardHeader>
          <CardContent>
            <DetailList>
              <DetailItem label="UEN" mono>
                {vendor.uen}
              </DetailItem>
              <DetailItem label="Category">
                {vendor.category ? SERVICE_CATEGORY_LABELS[vendor.category] : null}
              </DetailItem>
              <DetailItem label="Website" span>
                {vendor.website ? (
                  <a
                    href={vendor.website}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-brand hover:underline"
                  >
                    {vendor.website}
                    <ExternalLinkIcon className="size-3.5" aria-hidden />
                  </a>
                ) : null}
              </DetailItem>
              <DetailItem label="Notes" span>
                {vendor.notes ? (
                  <span className="whitespace-pre-wrap text-sm">{vendor.notes}</span>
                ) : null}
              </DetailItem>
            </DetailList>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Contacts</CardTitle>
          </CardHeader>
          <CardContent>
            {vendor.contacts.length === 0 ? (
              <p className="text-helper text-ink-tertiary">
                Nobody on file — edit the vendor to add who to call.
              </p>
            ) : (
              <ul className="flex flex-col divide-y divide-border-subtle rounded-lg border border-border-subtle">
                {vendor.contacts.map((contact) => (
                  <li key={contact.id} className="flex flex-col gap-0.5 px-4 py-3">
                    <span className="flex items-center gap-2 text-sm font-medium text-ink">
                      {contact.name}
                      {contact.is_primary ? <Badge variant="outline">Primary</Badge> : null}
                      {contact.role ? (
                        <span className="font-normal text-ink-tertiary">{contact.role}</span>
                      ) : null}
                    </span>
                    {contact.email || contact.phone ? (
                      <span className="flex flex-wrap gap-x-4 font-mono text-helper text-ink-secondary">
                        {contact.email ? (
                          <a href={`mailto:${contact.email}`} className="hover:underline">
                            {contact.email}
                          </a>
                        ) : null}
                        {contact.phone ? (
                          <a href={`tel:${contact.phone}`} className="hover:underline">
                            {contact.phone}
                          </a>
                        ) : null}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <VendorContractsCard vendor={vendor} />
      </div>

      <VendorForm vendor={vendor} open={editOpen} onOpenChange={setEditOpen} />
    </>
  );
}

function BackLink() {
  return (
    <div className="px-6 pt-6 md:px-8 md:pt-8">
      <Link
        href="/vendors"
        className="-mx-2 inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-helper text-ink-secondary hover:text-brand"
      >
        <ArrowLeftIcon aria-hidden className="size-3.5" />
        All vendors
      </Link>
    </div>
  );
}

/** Delete, then leave. Staying would render this page against an id the API has just
 * stopped serving — a 404 the user was left standing on, having done nothing wrong. */
function DeleteVendorButton({ vendor }: { vendor: VendorListItem }) {
  const router = useRouter();
  const { remove } = useVendorMutations();
  const [open, setOpen] = React.useState(false);
  const [isPending, setIsPending] = React.useState(false);
  const [formError, setFormError] = React.useState<string | undefined>();

  async function handleDelete() {
    setIsPending(true);
    setFormError(undefined);
    try {
      await remove(vendor.id);
      toast.success(`${vendor.name} deleted`);
      // `replace`, not `push`: this URL now 404s, so it must not stay in the history the
      // Back button walks. Pushing left the "No such vendor" page one press away — the
      // exact state this navigation exists to prevent, moved rather than removed.
      router.replace("/vendors");
    } catch (err) {
      // The API refuses a vendor that still holds contracts (409, naming the count) —
      // which is the common answer here, not an edge case, so it belongs in the dialog
      // rather than in a toast that outlives it.
      setFormError(err instanceof ApiError ? err.message : "Could not delete this vendor.");
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
        title={`Delete ${vendor.name}?`}
        description="For a row created in error. A vendor we stopped using should be set inactive — its contracts keep their history that way."
        onConfirm={handleDelete}
        isPending={isPending}
        error={formError}
      />
    </>
  );
}

function VendorContractsCard({ vendor }: { vendor: VendorListItem }) {
  // No `open ? id : undefined` gate any more: a page is always open. The `view: "all"`
  // inside the hook still is load-bearing — the summary line below counts every contract,
  // so a list defaulting to `current` would render one row under "1 active of 5".
  const { data, error, isLoading } = useVendorContracts(vendor.id);
  const { byId: brandById } = useBrandIndex();

  const summary = [
    `${vendor.contracts_active} active of ${vendor.contracts_total}`,
    // Dropped entirely at zero rather than printed as "0 brands": a vendor working only on
    // group-level agreements is not a vendor working on nothing, and the count beside it
    // already says how much live work there is.
    vendor.brand_ids_covered.length > 0
      ? `${vendor.brand_ids_covered.length} ${vendor.brand_ids_covered.length === 1 ? "brand" : "brands"}`
      : null,
    vendor.next_contract_end ? `next end ${formatDate(vendor.next_contract_end)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-baseline justify-between gap-2">
        <CardTitle>Contracts</CardTitle>
        {vendor.contracts_total > 0 ? (
          <span className="text-helper text-ink-secondary">{summary}</span>
        ) : null}
      </CardHeader>
      <CardContent>
        {error ? (
          <QueryError error={error} />
        ) : isLoading ? (
          <LoadingRows rows={2} />
        ) : !data || data.items.length === 0 ? (
          <EmptyState
            message="No contracts with this vendor"
            hint="Agreements are recorded on the Contracts page."
          />
        ) : (
          <ul className="flex flex-col divide-y divide-border-subtle rounded-lg border border-border-subtle">
            {data.items.map((contract) => {
              // One unresolved id makes the whole list `…` rather than a shorter list:
              // dropping the names that have not arrived would say this agreement is held
              // for fewer brands than it is, which is a false statement that looks true.
              // An empty list is "Group level", a stated fact — never a shorter list and
              // never nothing.
              const names = contract.brand_ids.map((id) => brandById.get(id)?.name);
              const brandLabel =
                names.length === 0
                  ? "Group level"
                  : names.some((name) => !name)
                    ? PENDING
                    : names.join(", ");
              return (
                <li key={contract.id} className="flex flex-col gap-0.5 px-4 py-3">
                  <span className="flex flex-wrap items-center justify-between gap-2">
                    <Link
                      href={`/contracts/${contract.id}`}
                      className="text-sm font-medium text-ink hover:text-brand hover:underline"
                    >
                      {contract.title}
                    </Link>
                    <Badge variant={CONTRACT_STATUS_TONES[contract.status]}>
                      {CONTRACT_STATUS_LABELS[contract.status]}
                    </Badge>
                  </span>
                  <span className="text-helper text-ink-secondary">
                    {contract.end_date ? `Ends ${formatDate(contract.end_date)}` : "No end date"}
                    {` · ${brandLabel}`}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
