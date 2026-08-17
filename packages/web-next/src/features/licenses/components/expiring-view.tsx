"use client";

import Link from "next/link";
import { InfoIcon, SlidersHorizontalIcon } from "lucide-react";
import * as React from "react";

import { FilterBar, FilterSelect, ToggleButton } from "@/components/layout/filter-bar";
import { EmptyState, LoadingRows, QueryError } from "@/components/layout/query-states";
import { TableCard } from "@/components/layout/table-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useOutletIndex } from "@/features/registry/hooks";
import { useSettings } from "@/features/settings/hooks";
import { FLAG_ON, isFlagOn, useQueryFilters } from "@/hooks/use-query-filters";
import type { LicenseExpiring } from "@/lib/api/types";
import { formatDate } from "@/lib/format";

import { useExpiringLicenses } from "../hooks";
import { AdjustBufferDialog } from "./adjust-buffer-dialog";

const FILTER_KEYS = ["outlet_id", "hide_expired"] as const;

/**
 * **Expiring** — a cross-cut worklist over `license` (every expiring licence is a held one),
 * the fourth face of the licences area. It answers the question the Held table cannot: *what
 * is coming due, soonest first, and can I still act in time?*
 *
 * Live and whole-set, like `/service-health`: the API computes each row's state against today
 * and returns the entire set already sorted `expiry_date` ascending, so the most overdue sits
 * at the top and no sort has a page two to lose rows behind (this app forbids sorting a
 * paginated list — `AGENTS.md`). The stored `status` catches up at the next sweep; this tab is
 * correct between sweeps.
 *
 * The buffer that decides the window is shown **read-only** in context; editing it is the
 * deliberate `AdjustBufferDialog`, not a live header field, because one change rewrites the
 * flag on every licence.
 */
export function ExpiringView() {
  const { filters, setFilter, clearAll, activeCount, filterKey } = useQueryFilters(FILTER_KEYS);
  const { outlets } = useOutletIndex();

  const includeExpired = !isFlagOn(filters.hide_expired);
  const { data, error, isLoading } = useExpiringLicenses({
    outlet_id: filters.outlet_id,
    // Only ever send the non-default: the API defaults to true, so hiding is the one case
    // that carries a param (and a clean URL when the toggle is left on).
    ...(includeExpired ? {} : { include_expired: false }),
  });

  const { data: settings } = useSettings();
  const [adjustOpen, setAdjustOpen] = React.useState(false);

  const isFiltered = Boolean(filters.outlet_id) || !includeExpired;

  return (
    <div className="flex flex-col gap-4">
      {/* The effective window, read-only, plus the deliberate Adjust. Sits above the filters
          because it qualifies what "expiring" *means* on this tab, which is not a filter. */}
      <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface-sunken px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-helper text-ink-secondary">
          Flagging licences within their renewal lead time
          {settings ? (
            <>
              {" + "}
              <span className="font-medium text-ink">
                {settings.license_expiry_buffer_days}{" "}
                {settings.license_expiry_buffer_days === 1 ? "day" : "days"}
              </span>
            </>
          ) : null}
          .
        </p>
        <Button
          variant="secondary"
          size="sm"
          className="w-full sm:w-auto"
          // Disabled until the real value has loaded, so the dialog can never seed from the `30`
          // fallback and save it over a stored value the person never saw.
          disabled={!settings}
          onClick={() => setAdjustOpen(true)}
        >
          <SlidersHorizontalIcon data-icon="inline-start" />
          Adjust buffer
        </Button>
      </div>

      <FilterBar activeCount={activeCount} onClear={clearAll}>
        <FilterSelect
          label="Filter by outlet"
          allLabel="All outlets"
          value={filters.outlet_id}
          options={outlets.map((o) => ({ value: o.id, label: o.name }))}
          onChange={(value) => setFilter("outlet_id", value)}
        />
        {/* A boolean, shown — not a two-value "State" select (the menu-for-a-boolean
            anti-pattern). Default on; unpressing writes the flag, which the empty-URL default
            leaves absent. */}
        <ToggleButton
          pressed={includeExpired}
          onPressedChange={(pressed) => setFilter("hide_expired", pressed ? null : FLAG_ON)}
        >
          Include expired
        </ToggleButton>
      </FilterBar>

      <ExpiringResults
        key={filterKey}
        data={data}
        error={error}
        isLoading={isLoading}
        isFiltered={isFiltered}
      />

      <AdjustBufferDialog
        open={adjustOpen}
        onOpenChange={setAdjustOpen}
        currentBufferDays={settings?.license_expiry_buffer_days ?? 30}
      />
    </div>
  );
}

function ExpiringResults({
  data,
  error,
  isLoading,
  isFiltered,
}: {
  data: LicenseExpiring[] | undefined;
  error: unknown;
  isLoading: boolean;
  isFiltered: boolean;
}) {
  if (error) return <QueryError error={error} />;
  if (isLoading || !data) return <LoadingRows rows={4} />;

  if (data.length === 0) {
    // Good state, not "record a licence" — this tab is a worklist over licences that already
    // exist, so empty means nothing is due, not nothing is recorded. The two are distinguished
    // by whether a filter is narrowing the set.
    return (
      <EmptyState
        message={
          isFiltered ? "Nothing expiring matches these filters" : "Nothing expiring right now"
        }
        hint={
          isFiltered
            ? "Widen the outlet filter, or include expired licences."
            : "No held licence is within its renewal window yet. Newly recorded expiries appear here as they approach."
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="px-1 text-helper text-ink-secondary">
        {data.length} {data.length === 1 ? "licence" : "licences"} expiring or expired, soonest
        first.
      </p>

      {/* Below `sm`, one card per licence — the six-column table cannot be read on a phone, and
          this screen's reader may well be standing in the outlet. Rendered as a second
          presentation switched in CSS, the Expected idiom. */}
      <ul className="flex flex-col gap-2 sm:hidden">
        {data.map((row) => (
          <ExpiringCard key={row.license_id} row={row} />
        ))}
      </ul>

      <TableCard className="hidden sm:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-5">Licence</TableHead>
              <TableHead>Where</TableHead>
              <TableHead>Expiry</TableHead>
              <TableHead>Time to obtain</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((row) => (
              <TableRow key={row.license_id}>
                <TableCell className="max-w-[28ch] pl-5">
                  <span className="block font-medium text-ink">{row.license_type_name}</span>
                  {row.holder_person_name ? (
                    <span className="mt-0.5 block text-helper text-ink-tertiary">
                      Held by {row.holder_person_name}
                    </span>
                  ) : null}
                </TableCell>

                <TableCell className="max-w-[18ch] text-ink-secondary">
                  <WhereCell row={row} />
                </TableCell>

                {/* State folded into the date cell — the Expected idiom, not a near-constant
                    standalone State column. Ochre "Expiring · N days", red worded "Expired". */}
                <TableCell className="max-w-[16ch] whitespace-normal">
                  <span
                    className={row.state === "expired" ? "text-error" : "text-warning"}
                  >
                    {formatDate(row.expiry_date)}
                  </span>
                  <Badge
                    variant={row.state === "expired" ? "error" : "warning"}
                    className="mt-1 flex w-fit"
                  >
                    {expiryLabel(row)}
                  </Badge>
                </TableCell>

                <TableCell className="max-w-[22ch]">
                  <TimeToObtain row={row} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableCard>
    </div>
  );
}

/**
 * One expiring licence, on a phone. Order: **what**, **where**, **when + state**, then the
 * time-to-obtain signal. The state badge leads its line because on this screen how-close-to-
 * expiry is the sort key and a thumb scrolling past should read it without reading the row.
 */
function ExpiringCard({ row }: { row: LicenseExpiring }) {
  return (
    <li className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-e1">
      <div>
        <span className="block text-sm font-medium text-ink">{row.license_type_name}</span>
        {row.holder_person_name ? (
          <span className="mt-0.5 block text-helper text-ink-tertiary">
            Held by {row.holder_person_name}
          </span>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <Badge variant={row.state === "expired" ? "error" : "warning"}>{expiryLabel(row)}</Badge>
        <span
          className={
            row.state === "expired"
              ? "text-helper text-error"
              : "text-helper text-ink-secondary"
          }
        >
          {row.state === "expired" ? "Was due" : "Due"} {formatDate(row.expiry_date)}
        </span>
      </div>

      <p className="text-helper text-ink-tertiary">
        <WhereCell row={row} />
      </p>

      <TimeToObtain row={row} />
    </li>
  );
}

/** Outlet link when premises-tied, else the holding company (entity-level licences). Names are
 * resolved server-side, so no pending index dance — the row already carries them. */
function WhereCell({ row }: { row: LicenseExpiring }) {
  if (row.outlet_id && row.outlet_name) {
    return (
      <Link
        href={`/outlets/${row.outlet_id}`}
        title={row.outlet_name}
        className="block truncate text-ink-secondary hover:text-brand hover:underline"
      >
        {row.outlet_name}
      </Link>
    );
  }
  return <span className="block truncate">{row.holder_entity_name}</span>;
}

/**
 * Time-to-obtain, inline — the actual Ops decision. The flag when the renewal takes longer
 * than the time left ("act now even though the date looks comfortable"), and a small read
 * popover for the process detail. Both from fields already on the row.
 */
function TimeToObtain({ row }: { row: LicenseExpiring }) {
  const hasDetail = Boolean(row.processing_time || row.renewal_process);

  return (
    <div className="flex flex-col gap-1">
      {row.lead_exceeds_days_left ? (
        <span className="text-helper text-warning">
          Lead time {row.renewal_lead_time_days}d{" "}
          {row.days_to_expiry >= 0
            ? `> ${row.days_to_expiry}d left`
            : "— already past it"}
        </span>
      ) : row.renewal_lead_time_days != null ? (
        <span className="text-helper text-ink-tertiary">Lead time {row.renewal_lead_time_days}d</span>
      ) : (
        <span className="text-helper text-ink-tertiary">No lead time on file</span>
      )}

      {hasDetail ? (
        <Popover>
          <PopoverTrigger
            render={
              <button
                type="button"
                className="flex w-fit items-center gap-1 text-helper text-ink-secondary underline decoration-dotted underline-offset-2 hover:text-brand"
              >
                <InfoIcon className="size-3.5" aria-hidden />
                How to renew
              </button>
            }
          />
          <PopoverContent className="max-w-xs">
            <div className="flex flex-col gap-2 text-helper">
              {row.processing_time ? (
                <div>
                  <span className="block font-medium text-ink">Processing time</span>
                  <span className="text-ink-secondary">{row.processing_time}</span>
                </div>
              ) : null}
              {row.renewal_process ? (
                <div>
                  <span className="block font-medium text-ink">Renewal process</span>
                  <span className="text-ink-secondary">{row.renewal_process}</span>
                </div>
              ) : null}
            </div>
          </PopoverContent>
        </Popover>
      ) : null}
    </div>
  );
}

/**
 * The folded state label. Ochre "Expiring · N days" (or "today" / "1 day"); red **worded**
 * "Expired" for the past — never "−5 days", which is the plan's explicit prohibition. The
 * days-ago count rides in the surrounding text, not in the badge.
 */
function expiryLabel(row: LicenseExpiring): string {
  if (row.state === "expired") {
    const ago = Math.abs(row.days_to_expiry);
    return ago === 0 ? "Expired today" : `Expired ${ago} ${ago === 1 ? "day" : "days"} ago`;
  }
  const left = row.days_to_expiry;
  if (left === 0) return "Expiring today";
  return `Expiring · ${left} ${left === 1 ? "day" : "days"}`;
}
