"use client";

import Link from "next/link";
import { FileTextIcon, Loader2Icon, PaperclipIcon } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import {
  ActiveFilterChips,
  type FilterChip,
  FilterPopover,
  FilterToolbar,
  PanelFilter,
} from "@/components/layout/filter-bar";
import { EmptyState, LoadingRows, QueryError } from "@/components/layout/query-states";
import { LoadMore, TableCard, Value } from "@/components/layout/table-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useAttachmentMutations,
  useContractIndex,
  useServiceHealth,
} from "@/features/contracts/hooks";
import { useOutletIndex } from "@/features/registry/hooks";
import { useVendorIndex } from "@/features/vendors/hooks";
import {
  FLAG_ON,
  filterIdentity,
  isFlagOn,
  useQueryFilters,
} from "@/hooks/use-query-filters";
import type {
  Outlet,
  ServiceCategory,
  ServiceReportListItem,
  Vendor,
} from "@/lib/api/types";
import type { ContractRecord } from "@/features/contracts/api";
import { formatDate, PENDING } from "@/lib/format";
import {
  SERVICE_CATEGORY_ICONS,
  SERVICE_CATEGORY_LABELS,
  SERVICE_CATEGORY_OPTIONS,
} from "@/lib/labels";
import { cn } from "@/lib/utils";

import { useOpenReportDocument, useReportDocuments, useServiceReportPages } from "../hooks";

const FILTER_KEYS = [
  "outlet_id",
  "vendor_id",
  "category",
  "from",
  "to",
  "missing_doc",
  // **URL-only, and deliberately not in the panel.** The review queue's
  // `service_report_no_document` row links here narrowed to the filing's contract, which is
  // the closest this list can come to "that report" — the API has no `report_id` filter and
  // should not grow one. A panel control for it would be a select of 158 contracts, which is
  // why the other deep-linkable dimension a reader cannot pick is spelled the same way. It
  // still gets a **chip**, so a narrowed table always says on screen why its rows are missing
  // and one click widens it.
  "contract_id",
] as const;

type Filters = Partial<Record<(typeof FILTER_KEYS)[number], string>>;

/**
 * **Filed** — the log. Every report that has been filed, most recent service first.
 *
 * `FilterToolbar` + `FilterPopover` + `ActiveFilterChips` **from the start**, not `FilterBar`:
 * five filters is past the wrapping row's range, and the chips are what keep a shared filtered
 * link honest — a collapsed panel with nothing on screen to say what is set opens a narrowed
 * table with no visible reason for the missing rows.
 *
 * There is no search box here and that is not an omission: `GET /service-reports` takes no `q`.
 * A client-side filter over the loaded page would answer "no results" about reports sitting
 * unfetched behind the cursor, which is worse than not offering it.
 */
export function FiledView() {
  const { filters, setFilter, setFilters, clearAll } = useQueryFilters(FILTER_KEYS);
  const { outlets } = useOutletIndex();
  const { vendors } = useVendorIndex();
  const { byId: contractById } = useContractIndex();

  const outletOptions = React.useMemo(
    () => outlets.map((outlet) => ({ value: outlet.id, label: outlet.name })),
    [outlets],
  );
  const vendorOptions = React.useMemo(
    () => vendors.map((vendor) => ({ value: vendor.id, label: vendor.name })),
    [vendors],
  );

  const missingDoc = isFlagOn(filters.missing_doc);

  const clearPanel = React.useCallback(() => {
    // One write. Two back-to-back `setFilter` calls both build from the same rendered params,
    // so the second silently drops the first.
    setFilters(Object.fromEntries(FILTER_KEYS.map((key) => [key, null])));
  }, [setFilters]);

  const chips: FilterChip[] = React.useMemo(() => {
    const labelFor = (options: readonly { value: string; label: string }[], value: string) =>
      options.find((option) => option.value === value)?.label ?? value;

    const result: FilterChip[] = [];
    const dimensions: {
      key: (typeof FILTER_KEYS)[number];
      label: string;
      options: readonly { value: string; label: string }[];
    }[] = [
      { key: "outlet_id", label: "Outlet", options: outletOptions },
      { key: "vendor_id", label: "Vendor", options: vendorOptions },
      { key: "category", label: "Category", options: SERVICE_CATEGORY_OPTIONS },
    ];

    for (const { key, label, options } of dimensions) {
      const value = filters[key];
      if (value) {
        result.push({
          key,
          label,
          value: labelFor(options, value),
          onRemove: () => setFilter(key, undefined),
        });
      }
    }

    // Resolved through the contract index, never printed raw: the value is a UUID, and a chip
    // reading `019ff013-…` tells a reader nothing about why their table is short. `…` while the
    // index is in flight, per the standing rule — a name that has not arrived is a pending
    // request, not a missing fact.
    if (filters.contract_id) {
      result.push({
        key: "contract_id",
        label: "Service",
        value: contractById.get(filters.contract_id)?.title ?? PENDING,
        onRemove: () => setFilter("contract_id", undefined),
      });
    }

    // The dates are their own chips rather than one "1 Jun – 30 Jun" chip, because either half
    // is usable alone and a combined chip could only be removed as a pair.
    if (filters.from) {
      result.push({
        key: "from",
        label: "Serviced from",
        value: formatDate(filters.from),
        onRemove: () => setFilter("from", undefined),
      });
    }
    if (filters.to) {
      result.push({
        key: "to",
        label: "Serviced to",
        value: formatDate(filters.to),
        onRemove: () => setFilter("to", undefined),
      });
    }
    if (missingDoc) {
      result.push({
        key: "missing_doc",
        label: "Document",
        value: "Missing",
        onRemove: () => setFilter("missing_doc", undefined),
      });
    }

    return result;
  }, [filters, missingDoc, outletOptions, vendorOptions, contractById, setFilter]);

  // `missing_doc` is **normalised** on the way down, so everything below this line sees the
  // canonical `"1"` or nothing and no second reading of the URL is needed.
  const resultsFilters: Filters = React.useMemo(
    () => ({ ...filters, missing_doc: missingDoc ? FLAG_ON : undefined }),
    [filters, missingDoc],
  );
  const resultsKey = filterIdentity(FILTER_KEYS, resultsFilters);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        <FilterToolbar>
          <FilterPopover activeCount={chips.length} onClear={clearPanel}>
            <PanelFilter
              label="Outlet"
              allLabel="All outlets"
              value={filters.outlet_id}
              options={outletOptions}
              onChange={(value) => setFilter("outlet_id", value)}
            />
            <PanelFilter
              label="Vendor"
              allLabel="All vendors"
              value={filters.vendor_id}
              options={vendorOptions}
              onChange={(value) => setFilter("vendor_id", value)}
            />
            <PanelFilter
              label="Category"
              allLabel="All categories"
              value={filters.category}
              options={SERVICE_CATEGORY_OPTIONS}
              onChange={(value) => setFilter("category", value)}
            />
            {/* Two real `<label>`s, because the panel has vertical room — the rule that keeps
                `PanelFilter` visibly labelled where `FilterSelect` hides its label in
                `aria-label` to stay one control tall. */}
            <div className="flex gap-2">
              <label className="flex min-w-0 flex-1 flex-col gap-1.5">
                <span className="text-helper font-medium text-ink-secondary">Serviced from</span>
                <Input
                  type="date"
                  value={filters.from ?? ""}
                  onChange={(event) => setFilter("from", event.target.value || undefined)}
                />
              </label>
              <label className="flex min-w-0 flex-1 flex-col gap-1.5">
                <span className="text-helper font-medium text-ink-secondary">to</span>
                <Input
                  type="date"
                  value={filters.to ?? ""}
                  onChange={(event) => setFilter("to", event.target.value || undefined)}
                />
              </label>
            </div>
            {/* A checkbox, not a select: "All / Missing" in a menu is the "menu for a boolean"
                `AGENTS.md` calls out, and it would make the unset state a chooseable option
                rather than an absence. This is the control Stage 8's *awaiting document*
                counter links into, and it reaches `?has_document=false` — the same predicate
                the review detector negates. */}
            <label className="flex items-start gap-2 border-t border-border-subtle pt-3">
              <Checkbox
                className="mt-0.5"
                checked={missingDoc}
                onChange={(event) =>
                  setFilter("missing_doc", event.target.checked ? FLAG_ON : undefined)
                }
              />
              <span className="text-helper font-medium text-ink-secondary">
                Filed with no document
              </span>
            </label>
          </FilterPopover>
        </FilterToolbar>

        <ActiveFilterChips chips={chips} onClear={clearAll} />
      </div>

      <FiledResults key={resultsKey} filters={resultsFilters} />
    </div>
  );
}

function FiledResults({ filters }: { filters: Filters }) {
  const { byId: contractById } = useContractIndex();
  const { byId: outletById } = useOutletIndex();
  const { byId: vendorById } = useVendorIndex();

  const { items, error, isLoading, hasMore, isLoadingMore, loadMore } = useServiceReportPages({
    outlet_id: filters.outlet_id,
    contract_id: filters.contract_id,
    vendor_id: filters.vendor_id,
    category: filters.category as ServiceCategory | undefined,
    from: filters.from,
    to: filters.to,
    // `false` or nothing — never `true`. The checkbox asks for the reports still missing their
    // paper; there is no worklist in the other direction, so the on-state is the negative one.
    has_document: filters.missing_doc ? false : undefined,
  });

  if (error) return <QueryError error={error} />;
  if (isLoading) return <LoadingRows rows={5} />;

  if (items.length === 0) {
    const filtered = Object.values(filters).some(Boolean);
    return filtered ? (
      <EmptyState
        message="No reports match these filters"
        hint="Clear a filter to widen the search."
      />
    ) : (
      <NothingFiledYet />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* **Below `sm`, cards — and this table was not merely cramped at 390, it was cut.**
          Measured in the pass: six columns come to **913px inside a 340px card**, and `TableCard`
          is `overflow-hidden`, so `scrollWidth === clientWidth` and the browser offers no scroll
          at all. Vendor, **Document** and Follow-up were not narrow on a phone; they did not
          exist — and Document is the column this entire page was built to show.

          A horizontal scroll would have been the cheaper fix and the wrong one: it hides the
          document state behind a gesture nobody performs on a worklist. Same construction as
          Expected — one row's facts, one card, switched in CSS. */}
      <ul className="flex flex-col gap-2 sm:hidden">
        {items.map((report) => {
          const contract = contractById.get(report.contract_id);
          return (
            <FiledCard
              key={report.id}
              report={report}
              contract={contract}
              outlet={outletById.get(report.outlet_id)}
              vendor={contract ? vendorById.get(contract.vendor_id) : undefined}
            />
          );
        })}
      </ul>

      <TableCard className="hidden sm:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-5">Date</TableHead>
              <TableHead>Outlet</TableHead>
              <TableHead>Service</TableHead>
              <TableHead>Vendor</TableHead>
              <TableHead>Document</TableHead>
              <TableHead className="pr-5">Follow-up</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((report) => {
              const contract = contractById.get(report.contract_id);
              const outlet = outletById.get(report.outlet_id);
              const vendor = contract ? vendorById.get(contract.vendor_id) : undefined;
              const Icon = contract ? SERVICE_CATEGORY_ICONS[contract.category] : null;

              return (
                <TableRow key={report.id}>
                  {/* Capped and wrapping, because the second line is the wider of the two:
                      "Attended 25 Aug 2026" is half again the width of the date above it, and
                      uncapped it would set this column — and the whole table's width — on
                      behalf of the rows where the two dates happen to disagree. */}
                  <TableCell className="max-w-[13ch] whitespace-normal pl-5">
                    <Value>{report.report_date ? formatDate(report.report_date) : null}</Value>
                    {/* The two dates disagree only when a report was attached to a visit that
                        already existed — `POST /service-reports` sets both from one value. The
                        disagreement is the interesting part, so it is shown when it happens and
                        costs nothing when it does not. */}
                    {report.visit_actual_date &&
                    report.visit_actual_date !== report.report_date ? (
                      <span className="mt-0.5 block text-helper text-ink-tertiary">
                        Attended {formatDate(report.visit_actual_date)}
                      </span>
                    ) : null}
                  </TableCell>
                  {/* Capped like every other name column here. Six columns of uncapped text put
                      this table at 1,038px against the 954px a 1280 screen has for it; these
                      three caps are where the 84px came from. Same rule as `/contracts`: a
                      table is as wide as its longest cell, and the full text stays in `title`
                      and one click away. */}
                  <TableCell className="max-w-[16ch] text-ink-secondary">
                    {outlet ? (
                      <Link
                        href={`/outlets/${outlet.id}`}
                        title={outlet.name}
                        className="block truncate hover:text-brand hover:underline"
                      >
                        {outlet.name}
                      </Link>
                    ) : (
                      PENDING
                    )}
                  </TableCell>
                  <TableCell className="max-w-[24ch]">
                    <span className="flex items-start gap-2">
                      {Icon && contract ? (
                        <Icon
                          aria-label={SERVICE_CATEGORY_LABELS[contract.category]}
                          className="mt-0.5 size-4 shrink-0 text-ink-tertiary"
                        />
                      ) : (
                        <span aria-hidden className="mt-0.5 size-4 shrink-0" />
                      )}
                      <Link
                        href={`/contracts/${report.contract_id}`}
                        title={contract?.title}
                        className="min-w-0 flex-1 truncate font-medium text-ink hover:text-brand hover:underline"
                      >
                        {contract?.title ?? PENDING}
                      </Link>
                    </span>
                  </TableCell>
                  <TableCell className="max-w-[16ch] text-ink-secondary">
                    {vendor ? (
                      <Link
                        href={`/vendors/${vendor.id}`}
                        title={vendor.name}
                        className="block truncate hover:text-brand hover:underline"
                      >
                        {vendor.name}
                      </Link>
                    ) : (
                      PENDING
                    )}
                  </TableCell>
                  <TableCell>
                    <DocumentCell report={report} />
                  </TableCell>
                  <TableCell className="pr-5">
                    {report.follow_up_required ? (
                      <Badge variant="warning">
                        {report.follow_up_due
                          ? `Due ${formatDate(report.follow_up_due)}`
                          : "Follow-up needed"}
                      </Badge>
                    ) : (
                      <span className="text-helper text-ink-tertiary">None</span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableCard>

      {/* "42 reports loaded", never "42 reports" — the API returns `next_cursor` and no count. */}
      <LoadMore
        loadedCount={items.length}
        noun="report"
        hasMore={hasMore}
        isLoadingMore={isLoadingMore}
        onLoadMore={loadMore}
      />
    </div>
  );
}

/**
 * One filed report, on a phone.
 *
 * The order is what a reader of a log needs: **what** was serviced, **where and by whom**, **when**
 * — then the two states that make a row actionable, the document and the follow-up, on a line of
 * their own at the bottom where the eye lands last.
 *
 * Nothing is truncated. Every `max-w-*ch` in the table above exists to stop one long value setting
 * a *column*, a cost the other forty-nine rows then pay; a card is its own width and owes nobody.
 */
function FiledCard({
  report,
  contract,
  outlet,
  vendor,
}: {
  report: ServiceReportListItem;
  contract: ContractRecord | undefined;
  outlet: Outlet | undefined;
  vendor: Vendor | undefined;
}) {
  const Icon = contract ? SERVICE_CATEGORY_ICONS[contract.category] : null;

  return (
    <li className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-e1">
      <div className="flex items-start gap-2">
        {Icon && contract ? (
          <Icon
            aria-label={SERVICE_CATEGORY_LABELS[contract.category]}
            className="mt-0.5 size-4 shrink-0 text-ink-tertiary"
          />
        ) : null}
        <Link
          href={`/contracts/${report.contract_id}`}
          className="text-sm font-medium text-ink hover:text-brand hover:underline"
        >
          {contract?.title ?? PENDING}
        </Link>
      </div>

      {/* Names resolved through the indexes, so a fetch still in flight renders `…` — never an em
          dash and never "Unknown", which would state a fact about the record rather than about
          the request. */}
      <p className="text-helper text-ink-tertiary">
        {outlet ? (
          <Link
            href={`/outlets/${outlet.id}`}
            className="text-ink-secondary hover:text-brand hover:underline"
          >
            {outlet.name}
          </Link>
        ) : (
          PENDING
        )}{" "}
        ·{" "}
        {vendor ? (
          <Link
            href={`/vendors/${vendor.id}`}
            className="text-ink-secondary hover:text-brand hover:underline"
          >
            {vendor.name}
          </Link>
        ) : (
          PENDING
        )}
        <span className="mt-0.5 block">
          Serviced {report.report_date ? formatDate(report.report_date) : "on no recorded date"}
          {report.visit_actual_date && report.visit_actual_date !== report.report_date
            ? ` · attended ${formatDate(report.visit_actual_date)}`
            : ""}
        </span>
      </p>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <DocumentCell report={report} />
        {report.follow_up_required ? (
          <Badge variant="warning">
            {report.follow_up_due
              ? `Follow-up due ${formatDate(report.follow_up_due)}`
              : "Follow-up needed"}
          </Badge>
        ) : null}
      </div>
    </li>
  );
}

/**
 * The document, and the absence of one.
 *
 * **A report with no document renders visibly incomplete**, in words and in ochre — this
 * product's claim is that it knows what it does not know, and a blank cell would say the
 * opposite. It is not an error: a filing without paper is a legitimate outcome the sheet offers
 * on purpose (*"Record without document"*), and Stage 8 is what chases it.
 */
function DocumentCell({ report }: { report: ServiceReportListItem }) {
  const { open, pendingId } = useOpenReportDocument();
  const pending = pendingId === report.id;

  if (report.attachment_count === 0) {
    return (
      <span className="inline-flex items-center gap-1.5 text-helper text-warning">
        <PaperclipIcon aria-hidden className="size-3.5 shrink-0" />
        No document
      </span>
    );
  }

  if (report.attachment_count > 1) return <DocumentList report={report} />;

  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() => {
        void open(report.id).catch((cause: unknown) => {
          toast.error(cause instanceof Error ? cause.message : "Could not open the document.");
        });
      }}
    >
      {pending ? (
        <Loader2Icon data-icon="inline-start" className="animate-spin" />
      ) : (
        <FileTextIcon data-icon="inline-start" />
      )}
      Open
    </Button>
  );
}

/**
 * The rarer branch: a visit that left more than one piece of paper, which the model allows on
 * purpose (`service_report.visit_id` is many-per-visit, and a report may carry several files).
 *
 * One click cannot reach *the* PDF when there is more than one, so it reaches the list instead —
 * fetched when the popover opens, never on render. Fifty rows resolving their own attachments
 * would be fifty requests, which is the cost `attachment_count` exists to avoid.
 */
function DocumentList({ report }: { report: ServiceReportListItem }) {
  const [open, setOpen] = React.useState(false);
  const { data, isLoading } = useReportDocuments(open ? report.id : undefined);
  // The plain download — this branch already holds the ids, so it needs no lookup first.
  const { download } = useAttachmentMutations();

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button variant="ghost" size="sm">
            <FileTextIcon data-icon="inline-start" />
            {report.attachment_count} documents
          </Button>
        }
      />
      <PopoverContent className="flex w-72 flex-col gap-2">
        <p className="text-helper font-medium text-ink">Documents</p>
        {isLoading || !data ? (
          <p className="text-helper text-ink-tertiary">Loading…</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {data.items.map((attachment) => (
              <li key={attachment.id}>
                <button
                  type="button"
                  onClick={() => void download(attachment.id)}
                  className={cn(
                    "w-full truncate rounded-md px-1 py-0.5 text-left text-helper text-ink",
                    "hover:text-brand hover:underline",
                  )}
                >
                  {attachment.filename}
                </button>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}

/**
 * Day one: nothing filed, and plenty expected.
 *
 * **A shrug is the wrong answer here.** The whole argument for this page is that zero reports
 * existed eight days after the area shipped while the dashboard carried overdue services with no
 * mechanism a person could find — so the empty state says how many are waiting and points at
 * them. The number is the live overdue count, not a literal: the hook is the same one Expected
 * uses, so switching views reuses the response rather than re-fetching it.
 *
 * The component exists so the hook is only mounted when the table is empty — a page of filed
 * reports has no reason to ask about overdue ones.
 */
function NothingFiledYet() {
  const { data } = useServiceHealth();
  const overdue = data?.filter((health) => health.overdue).length;
  const toExpected = (
    <Link
      href="/service-reports"
      className="font-medium text-ink underline decoration-dotted underline-offset-2 hover:text-brand"
    >
      Expected
    </Link>
  );

  return (
    <EmptyState
      message="No reports filed yet"
      hint={
        overdue === undefined ? (
          <>File one from {toExpected} — the worklist of what every vendor owes.</>
        ) : overdue === 0 ? (
          <>Nothing is overdue either. File one from {toExpected} when the next visit happens.</>
        ) : (
          <>
            {overdue} {overdue === 1 ? "service is" : "services are"} overdue. {toExpected} is
            the worklist — file one from there and the row leaves it.
          </>
        )
      }
    />
  );
}
