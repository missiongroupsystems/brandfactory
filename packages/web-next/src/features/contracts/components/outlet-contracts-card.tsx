"use client";

import Link from "next/link";
import { ChevronDownIcon, ChevronUpIcon, FileSignatureIcon } from "lucide-react";
import * as React from "react";

import { QueryError } from "@/components/layout/query-states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useVendorIndex } from "@/features/vendors/hooks";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";
import {
  SERVICE_CATEGORY_LABELS,
  CONTRACT_STATUS_LABELS,
  CONTRACT_STATUS_TONES,
  RENEWAL_TYPE_LABELS,
  RENEWAL_TYPE_TONES,
} from "@/lib/labels";

import { needsDecision } from "./contract-lifecycle";
import { useContracts } from "../hooks";

/** How many rows show before the "Show more" fold. Above this, the historical tail
 *  (terminated / already-resolved-expired) is what collapses first — the sort below puts it last. */
const VISIBLE = 5;

/** Attention-first order for the already-fetched list: a contract that owes a *decision*
 *  (an expiry nobody has renewed or closed off) first, then the ones currently covering the
 *  site (`active`), then `draft`, then the settled history (`terminated`, resolved `expired`)
 *  last — and dimmed in the row. This reorders rows already in memory, not a server sort
 *  (the list is fully loaded at `limit: 200`), so it does not run into the "no sort param"
 *  limit the paginated tables have. */
function rank(contract: { status: string; renewed_by_id?: string | null; closed_at?: string | null }): number {
  if (needsDecision(contract as Parameters<typeof needsDecision>[0])) return 0;
  if (contract.status === "active") return 1;
  if (contract.status === "draft") return 2;
  return 3; // history — terminated, or an expiry already answered
}

/** The contracts covering this site — "is this outlet covered for pest control"
 * answered without reading a spreadsheet sideways.
 *
 * `view: "all"` because the question this card answers is historical as much as
 * current: an outlet whose only pest-control agreement was terminated must read as
 * "terminated", not as "never had one". The status badge already tells them apart —
 * and the sort keeps the live/attention rows on top so the history does not bury them.
 *
 * On a site with a long tail only the top {@link VISIBLE} rows show, the rest behind a
 * "Show more" toggle: the list is fully in memory (no fetch, no cursor), so this is a
 * client reveal, not pagination. No count is claimed — the API returns none by design. */
export function OutletContractsCard({ outletId }: { outletId: string }) {
  const { data, error, isLoading } = useContracts({
    outlet_id: outletId,
    limit: 200,
    view: "all",
  });
  const { byId: vendorById } = useVendorIndex();
  const [expanded, setExpanded] = React.useState(false);

  const contracts = React.useMemo(
    () => [...(data?.items ?? [])].sort((a, b) => rank(a) - rank(b)),
    [data],
  );

  const shown = expanded ? contracts : contracts.slice(0, VISIBLE);
  const hasMore = contracts.length > VISIBLE;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileSignatureIcon aria-hidden className="size-4 text-ink-tertiary" />
          Contracts
        </CardTitle>
      </CardHeader>
      <CardContent>
        {error ? (
          <QueryError error={error} />
        ) : isLoading ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-10 w-full" />
          </div>
        ) : contracts.length === 0 ? (
          <p className="text-ink-secondary">
            No contracts cover this outlet. Coverage is set on the contract&rsquo;s own
            page.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            <ul className="flex flex-col gap-2">
              {shown.map((contract) => {
                const historical = rank(contract) === 3;
                return (
                  <li
                    key={contract.id}
                    className={cn(
                      "flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3",
                      historical && "opacity-65",
                    )}
                  >
                    <span className="flex min-w-0 flex-col">
                      <Link
                        href={`/contracts/${contract.id}`}
                        className="font-medium text-ink hover:text-brand hover:underline"
                      >
                        {contract.title}
                      </Link>
                      <span className="text-helper text-ink-tertiary">
                        {vendorById.get(contract.vendor_id)?.name ?? "…"} ·{" "}
                        {SERVICE_CATEGORY_LABELS[contract.category]}
                        {contract.end_date ? ` · ends ${formatDate(contract.end_date)}` : ""}
                      </span>
                    </span>
                    <span className="flex items-center gap-1.5">
                      {contract.renewal_type === "auto" ? (
                        <Badge variant={RENEWAL_TYPE_TONES.auto}>
                          {RENEWAL_TYPE_LABELS.auto}
                        </Badge>
                      ) : null}
                      <Badge variant={CONTRACT_STATUS_TONES[contract.status]}>
                        {CONTRACT_STATUS_LABELS[contract.status]}
                      </Badge>
                    </span>
                  </li>
                );
              })}
            </ul>

            {hasMore ? (
              <Button
                variant="ghost"
                size="sm"
                className="self-start text-ink-secondary"
                onClick={() => setExpanded((v) => !v)}
              >
                {expanded ? (
                  <>
                    <ChevronUpIcon data-icon="inline-start" />
                    Show fewer
                  </>
                ) : (
                  <>
                    <ChevronDownIcon data-icon="inline-start" />
                    Show more
                  </>
                )}
              </Button>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
