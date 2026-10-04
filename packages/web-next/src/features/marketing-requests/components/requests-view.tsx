"use client";

import type { MarketingRequest, MarketingRequestStatus } from "@brandfactory/shared";
import { PlusIcon } from "lucide-react";
import { useSearchParams } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import {
  FilterBar,
  SearchField,
  SegmentedControl,
  ToggleButton,
} from "@/components/layout/filter-bar";
import { HighlightMatch } from "@/components/layout/highlight-match";
import { EmptyState, LoadingRows, QueryError } from "@/components/layout/query-states";
import { TableCard } from "@/components/layout/table-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useActiveBrand } from "@/features/brands/active-brand";
import { useMe } from "@/features/me/hooks";
import { useOutlets } from "@/features/outlets/hooks";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useQueryFilters } from "@/hooks/use-query-filters";
import { formatDate } from "@/lib/format";
import {
  MARKETING_REQUEST_PRIORITY_LABELS,
  MARKETING_REQUEST_STATUS_LABELS,
  MARKETING_REQUEST_TYPE_LABELS,
} from "@/lib/labels";

import { useRequestMutations, useRequests } from "../hooks";
import {
  REQUEST_STATUSES,
  inSearch,
  inStatus,
  isMine,
  mineFrom,
  personLabel,
  statusViewFrom,
  tally,
  type StatusView,
} from "../inbox";
import { NewRequestSheet } from "./new-request-sheet";
import { RequestSheet } from "./request-sheet";

const FILTER_KEYS = ["status", "q", "mine"] as const;

/**
 * Marketing Requests — **the inbox is the screen**, and as of MKT-5 Phase 2 it is real: the rows
 * come from `GET /workspaces/:id/marketing-requests`, and a request filed here survives a reload.
 *
 * **Filters live in the URL now**, as on every other list screen, because a filtered link is
 * worth sharing once the rows are real ("everything new for Casa Vostra"). That is why the page
 * renders this under `<Suspense>`.
 *
 * **`?new=1` opens the form.** `/f/request` — the sample's public page — redirects here with it,
 * so an old shared link lands on the form behind sign-in rather than on a dead page.
 */
export function MarketingRequestsView() {
  const { filters, setFilter, setFilters } = useQueryFilters(FILTER_KEYS);
  const searchParams = useSearchParams();
  const status = statusViewFrom(filters.status);
  const mineOnly = mineFrom(filters.mine);

  const [newOpen, setNewOpen] = React.useState(() => searchParams.get("new") === "1");
  const [readingId, setReadingId] = React.useState<string | undefined>();

  const { requests, error, isLoading } = useRequests();
  const { brands } = useActiveBrand();
  const { outlets } = useOutlets();
  const { data: me } = useMe();
  const meId = me?.id;

  const brandNames = React.useMemo(() => new Map(brands.map((b) => [b.id, b.name])), [brands]);
  const outletNames = React.useMemo(
    () => new Map(outlets.map((o) => [o.id as string, o.name])),
    [outlets],
  );
  // A name not in the map is a fetch in flight, never a missing fact — every id here is a
  // foreign key. AGENTS.md: render "…", not "Unknown brand".
  const namesOf = React.useCallback(
    (row: MarketingRequest) => ({
      brand: brandNames.get(row.brandId) ?? "…",
      outlet: row.outletId ? (outletNames.get(row.outletId) ?? "…") : undefined,
    }),
    [brandNames, outletNames],
  );

  const debouncedQ = useDebouncedValue(filters.q, 200);
  const visible = React.useMemo(
    () =>
      requests.filter(
        (row) =>
          inStatus(row, status) &&
          (!mineOnly || isMine(row, meId)) &&
          inSearch(row, debouncedQ, namesOf(row)),
      ),
    [requests, status, mineOnly, meId, debouncedQ, namesOf],
  );
  // The unfiltered ladder: the control's own labels must not shrink with the search box.
  const counts = React.useMemo(() => tally(requests), [requests]);

  // Read by id from the live list, so the open sheet shows what the server last sent back.
  const reading = readingId ? requests.find((r) => r.id === readingId) : undefined;

  function closeNew(next: boolean) {
    setNewOpen(next);
    // Drop `?new=1` so a reload or a shared link does not reopen the form.
    if (!next && searchParams.get("new")) {
      const params = new URLSearchParams(searchParams.toString());
      params.delete("new");
      const qs = params.toString();
      window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
    }
  }

  return (
    <div className="flex flex-col gap-4 px-6 pb-8 md:px-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <FilterBar
          activeCount={(filters.q ? 1 : 0) + (mineOnly ? 1 : 0)}
          // The status view is not a filter and does not clear with one.
          onClear={() => setFilters({ q: null, mine: null })}
        >
          <SearchField
            label="Search requests by reference, summary, brand, outlet or person"
            placeholder="Ref, summary, brand or person"
            value={filters.q}
            onChange={(value) => setFilter("q", value)}
          />
          <SegmentedControl<StatusView>
            label="Which requests to show"
            value={status}
            options={[
              { value: "all", label: `All ${requests.length}` },
              ...REQUEST_STATUSES.map((key) => ({
                value: key,
                label: `${MARKETING_REQUEST_STATUS_LABELS[key]} ${counts[key]}`,
              })),
            ]}
            onChange={(value) => setFilter("status", value === "all" ? null : value)}
          />
          <ToggleButton
            pressed={mineOnly}
            onPressedChange={(pressed) => setFilter("mine", pressed ? "1" : null)}
          >
            Assigned to me
          </ToggleButton>
        </FilterBar>

        <Button onClick={() => setNewOpen(true)} className="w-full sm:w-auto">
          <PlusIcon data-icon="inline-start" />
          New request
        </Button>
      </div>

      {error ? (
        <QueryError error={error} />
      ) : isLoading ? (
        <LoadingRows rows={6} />
      ) : visible.length === 0 ? (
        <EmptyState
          message={requests.length === 0 ? "Nothing has come in yet" : "No requests match this view"}
          hint={
            requests.length === 0
              ? "Raise the first one with New request."
              : "Widen the status view, turn off Assigned to me, or clear the search."
          }
        />
      ) : (
        <RequestsTable
          rows={visible}
          q={debouncedQ}
          meId={meId}
          namesOf={namesOf}
          onOpen={(row) => setReadingId(row.id)}
        />
      )}

      <NewRequestSheet
        open={newOpen}
        onOpenChange={closeNew}
        onCreated={(created) => setReadingId(created.id)}
      />
      <RequestSheet
        request={reading}
        brandName={reading ? namesOf(reading).brand : ""}
        outletName={reading ? namesOf(reading).outlet : undefined}
        meId={meId}
        open={reading !== undefined}
        onOpenChange={(open) => {
          if (!open) setReadingId(undefined);
        }}
      />
    </div>
  );
}

/**
 * The queue. The row opens the request through a `<button>` in its first text cell, and the
 * status cell stops the click so a select inside a clickable row cannot open the sheet too.
 */
function RequestsTable({
  rows,
  q,
  meId,
  namesOf,
  onOpen,
}: {
  rows: MarketingRequest[];
  q: string | undefined;
  meId: string | undefined;
  namesOf: (row: MarketingRequest) => { brand: string; outlet: string | undefined };
  onOpen: (row: MarketingRequest) => void;
}) {
  const { update } = useRequestMutations();
  const [pendingId, setPendingId] = React.useState<string | null>(null);

  async function setStatus(row: MarketingRequest, status: MarketingRequestStatus) {
    setPendingId(row.id);
    try {
      await update(row.id, { status });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "That change did not save.");
    } finally {
      setPendingId(null);
    }
  }

  return (
    <TableCard>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="pl-5">Ref</TableHead>
            <TableHead>Request</TableHead>
            <TableHead>Brand · outlet</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Priority</TableHead>
            <TableHead>Needed by</TableHead>
            <TableHead>Assigned</TableHead>
            <TableHead className="pr-5">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const names = namesOf(row);
            return (
              <TableRow key={row.id}>
                <TableCell className="pl-5 font-mono text-helper font-medium whitespace-nowrap text-ink">
                  <HighlightMatch text={row.reference} query={q} />
                </TableCell>
                <TableCell className="max-w-[36ch]">
                  <button
                    type="button"
                    onClick={() => onOpen(row)}
                    className="block w-full text-left"
                  >
                    <span className="block truncate font-medium text-ink" title={row.summary}>
                      <HighlightMatch text={row.summary} query={q} />
                    </span>
                    <span className="block truncate text-helper text-ink-tertiary">
                      <HighlightMatch text={personLabel(row.requestedBy)} query={q} /> ·{" "}
                      {formatDate(row.createdAt.slice(0, 10))}
                    </span>
                  </button>
                </TableCell>
                <TableCell className="max-w-[28ch] text-ink-secondary">
                  <span className="block truncate">
                    <HighlightMatch text={names.brand} query={q} />
                    {names.outlet ? (
                      <>
                        {" · "}
                        <HighlightMatch text={names.outlet} query={q} />
                      </>
                    ) : null}
                  </span>
                </TableCell>
                <TableCell className="whitespace-nowrap text-ink-secondary">
                  {MARKETING_REQUEST_TYPE_LABELS[row.type]}
                </TableCell>
                <TableCell>
                  {/* Only Urgent is coloured: four tones over four rungs is a traffic light the
                      eye stops reading. The word is always there (WCAG 1.4.1). */}
                  <Badge
                    variant={row.priority === "urgent" ? "warning" : "outline"}
                    className="whitespace-nowrap"
                  >
                    {MARKETING_REQUEST_PRIORITY_LABELS[row.priority]}
                  </Badge>
                </TableCell>
                <TableCell className="whitespace-nowrap text-ink-secondary">
                  {row.neededBy ? formatDate(row.neededBy) : "—"}
                </TableCell>
                <TableCell className="max-w-[18ch] text-ink-secondary">
                  <span className="block truncate">
                    {row.assignee ? (isMine(row, meId) ? "You" : personLabel(row.assignee)) : "—"}
                  </span>
                </TableCell>
                <TableCell className="pr-5" onClick={(event) => event.stopPropagation()}>
                  <Select
                    containerClassName="w-36"
                    aria-label={`Status of ${row.reference}`}
                    value={row.status}
                    disabled={pendingId === row.id}
                    onChange={(event) =>
                      void setStatus(row, event.target.value as MarketingRequestStatus)
                    }
                  >
                    {REQUEST_STATUSES.map((key) => (
                      <option key={key} value={key}>
                        {MARKETING_REQUEST_STATUS_LABELS[key]}
                      </option>
                    ))}
                  </Select>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableCard>
  );
}
