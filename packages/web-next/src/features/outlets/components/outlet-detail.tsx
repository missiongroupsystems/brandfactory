"use client";

import { outletAttributeLabel, outletDateOnShow } from "@brandfactory/shared";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeftIcon, MapPinIcon, PencilIcon, Trash2Icon } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { BrandMark } from "@/components/brand/brand-mark";
import { DetailItem, DetailList } from "@/components/layout/detail-list";
import { LoadingRows, QueryError } from "@/components/layout/query-states";
import { ConfirmDialog } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useActiveBrand } from "@/features/brands/active-brand";
import { useSubmit } from "@/hooks/use-submit";
import { formatAddress, formatDate, formatDateTime, PENDING } from "@/lib/format";
import { OUTLET_STATUS_LABELS, OUTLET_STATUS_TONES, OUTLET_TYPE_LABELS } from "@/lib/labels";

import { useOutlet, useOutletMutations } from "../hooks";
import { OutletForm } from "./outlet-form";

/**
 * One outlet — its own record, and **only** its own record.
 *
 * The Operations Hub's version of this page was 760 lines and thirteen cards: a
 * tabbed shell over contracts, service visits, licences, licence requirements,
 * certifications, tenancies, the wifi network, the devices on it, spaces and the
 * data-quality queue. Every one of those areas is an Ops feature folder with no
 * BrandFactory backend and no door in the sidebar — 1.34.0 cut them from the nav
 * — so keeping the cards would have meant thirteen panels that render nothing,
 * over a record whose own fields are real. What is here instead is the outlet:
 * where it is, what it is, when it opened, what it trades as, what it does, and
 * what somebody wrote down about it.
 *
 * `outletRef` is a **slug or an id** and the read resolves either, which is what
 * lets `outletHref` emit the readable form when it holds the record and a bare id
 * when it does not.
 */
export function OutletDetail({ outletRef }: { outletRef: string }) {
  const router = useRouter();
  const { outlet, error, isLoading } = useOutlet(outletRef);
  const { brands } = useActiveBrand();
  const { remove } = useOutletMutations();
  const { run, reset, isPending, formError } = useSubmit();

  const [editOpen, setEditOpen] = React.useState(false);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  /**
   * Set when the delete starts and never cleared on success, because the page is
   * on its way to `/outlets` from that point.
   *
   * It exists to suppress **one** error: `remove()` awaits the cache sweep, the
   * sweep refetches the row that was just deleted, and the 404 that comes back
   * lands on `useOutlet` before `router.push` runs — so a successful delete
   * rendered an error panel for the length of the navigation.
   */
  const [isDeleting, setIsDeleting] = React.useState(false);

  const brand = outlet?.brandId ? brands.find((b) => b.id === outlet.brandId) : undefined;
  // **`PENDING` for any id that has not resolved, whatever the reason.** Only a
  // null `brandId` is "No brand"; an id the list does not hold is a request in
  // flight or one that failed, which is not a fact about this outlet. Testing
  // `brandsLoading` here was the gap — a *failed* brands request leaves the list
  // empty and not loading, and the badge below then stated "No brand" about an
  // outlet that has one. AGENTS.md: a cached index that has not arrived is a
  // pending request, never a missing fact.
  const brandName = outlet?.brandId ? (brand?.name ?? PENDING) : undefined;

  // Cosmetic id→slug rewrite once the outlet loads. `history.replaceState`, not
  // `router.replace`: the SWR entry is keyed on `outletRef`, so a navigation
  // would refetch for nothing. The id URL resolves on its own; this only
  // relabels the bar.
  React.useEffect(() => {
    if (outlet && outlet.slug && outletRef !== outlet.slug) {
      window.history.replaceState(null, "", `/outlets/${outlet.slug}`);
    }
  }, [outlet, outletRef]);

  // The delete's own 404 is not news — see `isDeleting`. Every other error still
  // reaches the reader, including one raised while the delete was refused.
  if (error && !isDeleting) return <QueryError error={error} />;
  if (isLoading || !outlet) return <LoadingRows rows={6} />;

  async function handleDelete() {
    if (!outlet) return;
    setIsDeleting(true);
    const ok = await run(async () => {
      await remove(outlet.id);
      toast.success(`${outlet.name} deleted`);
    });
    if (ok) {
      setConfirmOpen(false);
      router.push("/outlets");
    } else {
      // The row is still there and the reader is still on it, so the page owes
      // them its error states back.
      setIsDeleting(false);
    }
  }

  const { date, label } = outletDateOnShow(outlet);
  const address = formatAddress({
    address: outlet.address,
    unit: outlet.unit,
    postal_code: outlet.postalCode,
  });

  return (
    <div className="flex flex-col gap-6 px-6 pt-6 pb-8 md:px-8 md:pt-8">
      <div className="flex flex-col gap-4">
        <Link
          href="/outlets"
          className="inline-flex w-fit items-center gap-1.5 text-helper text-ink-secondary hover:text-brand hover:underline"
        >
          <ArrowLeftIcon aria-hidden className="size-4" />
          All outlets
        </Link>

        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between md:gap-6">
          <div className="flex min-w-0 items-start gap-4">
            {/* The monogram, not a logo. Brand assets live behind a signed blob
                read this package has no mechanism for yet, and the mark is what
                the sidebar and the brand switcher already draw. */}
            {outlet.brandId && brand ? <BrandMark name={brand.name} seed={brand.id} /> : null}
            <div className="flex min-w-0 flex-col gap-2">
              <h1 className="text-h1 text-ink">{outlet.name}</h1>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={OUTLET_STATUS_TONES[outlet.status]}>
                  {OUTLET_STATUS_LABELS[outlet.status]}
                </Badge>
                <Badge variant="outline">{OUTLET_TYPE_LABELS[outlet.outletType]}</Badge>
                {brandName ? (
                  <span className="text-helper text-ink-secondary">{brandName}</span>
                ) : (
                  <span className="text-helper text-ink-tertiary">No brand</span>
                )}
              </div>
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Button variant="secondary" onClick={() => setEditOpen(true)}>
              <PencilIcon data-icon="inline-start" />
              Edit
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                reset();
                setConfirmOpen(true);
              }}
            >
              <Trash2Icon data-icon="inline-start" />
              Delete
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Where it is</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex items-start gap-2.5 text-ink">
              <MapPinIcon aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-tertiary" />
              {/* `formatAddress` answers EMPTY for a record with no address at
                  all, and the span below says "Not recorded" behind the dash —
                  most imported rows will land here, and the gap is only fillable
                  once somebody can see it. */}
              <span className={address === "—" ? "text-ink-tertiary" : undefined}>
                {address === "—" ? (
                  <>
                    <span aria-hidden>—</span>
                    <span className="sr-only">Address not recorded</span>
                  </>
                ) : (
                  address
                )}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Dates</CardTitle>
          </CardHeader>
          <CardContent>
            <DetailList>
              {/* Both dates, always, and each under its own name — this page has
                  room to show the plan beside what happened, which the table's
                  single "Opening" column does not. */}
              <DetailItem label="Target opening">
                {outlet.targetOpeningDate ? formatDate(outlet.targetOpeningDate) : null}
              </DetailItem>
              <DetailItem label="Opened">
                {outlet.openingDate ? formatDate(outlet.openingDate) : null}
              </DetailItem>
              <DetailItem label="Closed">
                {outlet.closingDate ? formatDate(outlet.closingDate) : null}
              </DetailItem>
              <DetailItem label={`Shown in the table as “${label}”`}>
                {date ? formatDate(date) : null}
              </DetailItem>
            </DetailList>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>What it does</CardTitle>
          </CardHeader>
          <CardContent>
            {outlet.attributes.length > 0 ? (
              <ul className="flex flex-wrap gap-2">
                {outlet.attributes.map((key) => (
                  <li key={key}>
                    {/* An imported tag the catalogue has never heard of renders as
                        its own key rather than vanishing — see
                        `outletAttributeLabel`. */}
                    <Badge variant="outline">{outletAttributeLabel(key)}</Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-helper text-ink-secondary">
                Nothing recorded. Attributes describe the site — whether it serves alcohol, seats
                people outside, opens late.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Record</CardTitle>
          </CardHeader>
          <CardContent>
            <DetailList>
              <DetailItem label="Notes" span>
                {outlet.notes}
              </DetailItem>
              {/* The slug is on the page because it is the outlet's web address
                  and it does not follow a rename — which is a thing to be able to
                  look up rather than to discover from a broken link. */}
              <DetailItem label="Web address" mono>
                /outlets/{outlet.slug}
              </DetailItem>
              <DetailItem label="Last updated">{formatDateTime(outlet.updatedAt)}</DetailItem>
            </DetailList>
          </CardContent>
        </Card>
      </div>

      <OutletForm outlet={outlet} open={editOpen} onOpenChange={setEditOpen} />

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={(open) => {
          setConfirmOpen(open);
          if (!open) reset();
        }}
        title={`Delete ${outlet.name}?`}
        description={
          // A closure is a status, not a deletion — saying so here is what keeps
          // this button for the case it is actually for.
          <>
            This removes the record for good. A site that has stopped trading is{" "}
            <strong>Closed</strong> rather than deleted — set the status instead unless this
            outlet was entered by mistake.
          </>
        }
        onConfirm={handleDelete}
        error={formError}
        isPending={isPending}
      />
    </div>
  );
}
