"use client";

import { KeyRoundIcon } from "lucide-react";
import Link from "next/link";

import { QueryError } from "@/components/layout/query-states";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useVendorIndex } from "@/features/registry-vendors/hooks";
import { hasTenancyRent, type Tenancy, type TenancySensitive } from "@/lib/api/types";
import { formatDate, formatMoney } from "@/lib/format";
import { TENANCY_KIND_LABELS, TENANCY_STATUS_LABELS, TENANCY_STATUS_TONES } from "@/lib/labels";

import { useTenancies } from "../hooks";

/**
 * The leases behind this outlet's door — the tenancy sibling of `OutletContractsCard`. `view:
 * "all"` because "this site's lease ended and was not renewed" must read as `expired`/`terminated`,
 * not as "never had one"; the status badge tells them apart, and the option deadline is the date
 * that loses the site.
 */
export function OutletTenancyCard({ outletId }: { outletId: string }) {
  const { data, error, isLoading } = useTenancies({ outlet_id: outletId, view: "all", limit: 200 });
  const { byId: vendorById } = useVendorIndex();
  const tenancies = data?.items ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRoundIcon aria-hidden className="size-4 text-ink-tertiary" />
          Tenancies
        </CardTitle>
      </CardHeader>
      <CardContent>
        {error ? (
          <QueryError error={error} />
        ) : isLoading ? (
          <Skeleton className="h-10 w-full" />
        ) : tenancies.length === 0 ? (
          <p className="text-ink-secondary">
            No tenancy on file for this outlet. Add the lease it trades under from the Tenancies
            page.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {tenancies.map((tenancy) => {
              const landlord = tenancy.landlord_id
                ? vendorById.get(tenancy.landlord_id)?.name
                : null;
              return (
                <li
                  key={tenancy.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3"
                >
                  <span className="flex min-w-0 flex-col">
                    <Link
                      href={`/tenancies/${tenancy.id}`}
                      className="font-medium text-ink hover:text-brand hover:underline"
                    >
                      {TENANCY_KIND_LABELS[tenancy.kind]}
                      {landlord ? ` · ${landlord}` : ""}
                    </Link>
                    <span className="text-helper text-ink-tertiary">
                      {tenancy.start_date || tenancy.end_date
                        ? `${formatDate(tenancy.start_date)} — ${formatDate(tenancy.end_date)}`
                        : "No term recorded"}
                      {tenancy.option_deadline
                        ? ` · option by ${formatDate(tenancy.option_deadline)}`
                        : ""}
                      {` · ${rentLine(tenancy)}`}
                    </span>
                  </span>
                  <Badge variant={TENANCY_STATUS_TONES[tenancy.status]}>
                    {TENANCY_STATUS_LABELS[tenancy.status]}
                  </Badge>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function rentLine(tenancy: Tenancy | TenancySensitive): string {
  if (hasTenancyRent(tenancy)) {
    return tenancy.base_rent != null ? formatMoney(tenancy.base_rent) : "no rent recorded";
  }
  return tenancy.has_base_rent ? "rent restricted" : "no rent recorded";
}
