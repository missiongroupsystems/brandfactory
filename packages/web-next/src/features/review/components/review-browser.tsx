"use client";

import {
  ChevronDownIcon,
  ChevronsDownUpIcon,
  ChevronsUpDownIcon,
  RefreshCwIcon,
} from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { FilterBar, FilterSelect, SegmentedControl } from "@/components/layout/filter-bar";
import { railFor } from "@/components/layout/group-rail";
import { EmptyState, LoadingRows, QueryError } from "@/components/layout/query-states";
import { LoadMore, TableCard } from "@/components/layout/table-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { useOutletIndex } from "@/features/registry/hooks";
import { filterIdentity, useQueryFilters } from "@/hooks/use-query-filters";
import type { ReviewItem, ReviewKind, ReviewView } from "@/lib/api/types";
import {
  REVIEW_KIND_LABELS,
  REVIEW_KIND_OPTIONS,
  REVIEW_KIND_PROMPTS,
  REVIEW_STATUS_LABELS,
  REVIEW_STATUS_TONES,
} from "@/lib/labels";
import { cn } from "@/lib/utils";

import { useReviewMutations, useReviewPages, useReviewSummary } from "../hooks";
import { ReviewActions } from "./review-actions";

const FILTER_KEYS = ["kind", "subject", "outlet", "view"] as const;

type Filters = Partial<Record<(typeof FILTER_KEYS)[number], string>>;

/** What the row is *about*, coarser than `kind` and not a duplicate of it — "just the file
 * problems" is a question people actually ask.
 *
 * Outlets and companies joined the list when the brand detectors shipped. Until then every
 * subject was a document or a contract, so this filter and its "all" label could name the
 * whole queue between them; leaving it that way would have offered a reader four choices
 * covering half the rows and told them the other half did not exist.
 *
 * **Vendors joined it the same way, one release later** — and the second time is the one
 * worth noticing, because this list is a hand-written subset of `SubjectType` and nothing
 * fails when it falls behind. `?subject_type=vendor` was a legal query the moment the
 * vendor detectors shipped; without this entry the queue simply had no way to ask for the
 * 25 rows it had just started showing.
 *
 * **Service reports are the third time**, and the pattern is now the rule rather than the
 * anecdote: a detector against a new subject type has to be added here in the same change,
 * because a `Record<SubjectType, …>` is not available — the list is a *subset* on purpose
 * (nine of `SubjectType`'s twelve members can carry an item and have no detector yet), and a
 * subset cannot be made exhaustive without claiming filters for kinds that raise nothing. */
const SUBJECT_OPTIONS = [
  { value: "attachment", label: "Documents" },
  { value: "contract", label: "Contracts" },
  { value: "tenancy_agreement", label: "Tenancies" },
  { value: "outlet", label: "Outlets" },
  { value: "entity", label: "Companies" },
  { value: "vendor", label: "Vendors" },
  { value: "service_report", label: "Service reports" },
] as const;

type SubjectFilter = (typeof SUBJECT_OPTIONS)[number]["value"];

const VIEW_OPTIONS = [
  { value: "open", label: "Open" },
  { value: "all", label: "All" },
] as const;

/**
 * The order groups appear in: worst consequence first.
 *
 * Not the enum's order and not alphabetical. A contract that auto-renews with no notice
 * period renews itself silently — nothing warns anyone, which is the exact failure this
 * product exists to prevent — so it sits at the top even though there are only fifteen of
 * them. The 171 unconfirmed document types sit at the bottom: the largest pile and the
 * least urgent, and putting it first would bury everything else below a scroll.
 *
 * **A `Record`, not the ordered array this used to be, and that is the whole point.** The
 * array was `readonly ReviewKind[]`, and the grouping below is
 * `KIND_ORDER.filter((kind) => byKind.has(kind))` — so a kind missing from it was **fetched,
 * counted in the summary, counted in the footer, and never drawn**. That is what happened when
 * the two brand detectors shipped: the queue said "6 open items across 3 groups" over three
 * rows, and nothing in `lint`, `typecheck`, `build` or `pytest` could see it, because an
 * incomplete list of a union is a perfectly good list of that union.
 *
 * Keyed by the union it is now the same guarantee `REVIEW_KIND_LABELS` and
 * `REVIEW_KIND_PROMPTS` have had all along — a new backend enum value fails the typecheck
 * until somebody decides where it belongs. Those two maps are exactly why the *labels* were
 * never the thing that went missing.
 */
const KIND_RANK: Record<ReviewKind, number> = {
  contract_notice_period_missing: 0,
  contract_end_date_missing: 1,
  contract_value_missing: 2,
  contract_no_document: 3,
  contract_category_unset: 4,
  // The tenancy gaps sit directly below the contract ones and above every reference gap,
  // because a lease is the other agreement that costs the site when a date is missed — and
  // `tenancy_option_notice_missing` is the sharpest of all: an option-to-renew window missed
  // by a day loses the premises, which is *worse* than a contract renewing itself. It sits at
  // the top of this block (and could argue for rank 0) but stays under the live contract kinds
  // for now, because tenancy rows are unreachable until Stage 9 of
  // `docs/executing/tenancy-agreements.md` writes the detectors, which may revisit this order
  // once real rows exist. `outlet_tenancy_missing` is last of the block — an absence rather
  // than a defect on an existing record, and 23 of 23 today.
  tenancy_option_notice_missing: 5,
  tenancy_end_date_missing: 6,
  tenancy_no_document: 7,
  tenancy_landlord_missing: 8,
  outlet_tenancy_missing: 9,
  // Above every reference gap and below the agreement ones. A report filed with no document
  // is the only kind here that is *wrong rather than merely absent*: the row asserts a visit
  // happened and closed an expected service, with nothing behind it. It is also the only one
  // this product creates itself rather than inherits from the Lark migration, so it is the
  // one whose count going up means something is broken now. Placed here at declaration time;
  // Stage 8 of `docs/archive/service-reports.md` may revisit it once real rows exist.
  service_report_no_document: 10,
  // The brand gaps sit below the agreement ones and above the document pile: an outlet nobody
  // has branded is invisible to every brand-grouped report, which is worse than an unconfirmed
  // file type and not as sharp as a contract that renews itself.
  entity_brand_mismatch: 11,
  outlet_brand_unset: 12,
  // The vendor gaps sit below the brand ones and above the document pile. A vendor with
  // nobody to call is the sharper of the two — "who do I call about the grease trap" is the
  // question the address book exists to answer, and 25 of 47 vendors cannot answer it — but
  // it is still a gap in a *reference* record rather than in an agreement that renews itself
  // while nobody is looking, which is what keeps the contract kinds above both.
  vendor_contact_missing: 13,
  vendor_category_unset: 14,
  document_unreadable: 15,
  document_type_unconfirmed: 16,
};

const KIND_ORDER: readonly ReviewKind[] = (Object.keys(KIND_RANK) as ReviewKind[]).sort(
  (a, b) => KIND_RANK[a] - KIND_RANK[b],
);

/**
 * The review queue — one place for everything the Lark migration could not know.
 *
 * The screen is a work surface rather than a report: every row carries the action that
 * fits its problem, and closing an item is one interaction, not a navigation. That is the
 * whole justification for it existing beside the contracts page, which can already edit
 * any of these fields — 39 contracts missing an end date is 39 round trips there and one
 * pass here.
 */
export function ReviewBrowser() {
  const { filters, setFilter, setFilters } = useQueryFilters(FILTER_KEYS);
  const { outlets } = useOutletIndex();

  const view = (filters.view === "all" ? "all" : "open") as ReviewView;

  // `view` is a view control, not a filter — it should not count towards "Clear 2 filters"
  // and it must survive that button. Same split the contracts page makes.
  const activeCount = ["kind", "subject", "outlet"].filter(
    (key) => filters[key as keyof Filters],
  ).length;

  const resultsKey = filterIdentity(FILTER_KEYS, filters);

  const outletOptions = React.useMemo(
    () => outlets.map((outlet) => ({ value: outlet.id, label: outlet.name })),
    [outlets],
  );

  return (
    <div className="flex flex-col gap-4 px-6 pb-8 md:px-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <FilterBar
          activeCount={activeCount}
          onClear={() =>
            // `setFilters`, not three `setFilter` calls: each one rebuilds its params from
            // the same rendered `searchParams`, so the later writes silently drop the
            // earlier ones. And `view` is deliberately absent — clearing the *filters*
            // should not also throw the reader out of the history view they chose, which
            // is what `clearAll` would do.
            setFilters({ kind: undefined, subject: undefined, outlet: undefined })
          }
        >
          <FilterSelect
            label="Filter by problem"
            allLabel="All problems"
            value={filters.kind}
            options={REVIEW_KIND_OPTIONS}
            onChange={(value) => setFilter("kind", value)}
            className="sm:min-w-56"
          />
          <FilterSelect
            label="Filter by what it is"
            allLabel="Everything"
            value={filters.subject}
            options={SUBJECT_OPTIONS}
            onChange={(value) => setFilter("subject", value)}
          />
          <FilterSelect
            label="Filter by outlet"
            allLabel="All outlets"
            value={filters.outlet}
            options={outletOptions}
            onChange={(value) => setFilter("outlet", value)}
          />
        </FilterBar>

        <div className="flex flex-wrap items-center gap-2">
          <SegmentedControl
            label="Which items to show"
            value={view}
            options={VIEW_OPTIONS}
            onChange={(value) => setFilter("view", value === "open" ? undefined : value)}
          />
          <RefreshQueueButton />
        </div>
      </div>

      <ReviewResults key={resultsKey} filters={filters} view={view} />
    </div>
  );
}

/** Re-runs the detectors. The only way to reach `POST /review/generate` from the product,
 * and the reason it is here rather than on the dashboard: this is the screen whose
 * contents it changes. */
function RefreshQueueButton() {
  const { generate } = useReviewMutations();
  const [isPending, setIsPending] = React.useState(false);

  async function run() {
    setIsPending(true);
    try {
      const report = await generate();
      const raised = report.detectors.reduce((total, d) => total + d.created, 0);
      const cleared = report.detectors.reduce((total, d) => total + d.removed, 0);
      toast.success(
        raised || cleared
          ? `${raised} raised, ${cleared} cleared`
          : "Nothing changed — the queue was already up to date",
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not refresh the queue");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <Button variant="secondary" onClick={run} disabled={isPending}>
      <RefreshCwIcon data-icon="inline-start" className={cn(isPending && "animate-spin")} />
      {isPending ? "Rechecking" : "Recheck records"}
    </Button>
  );
}

function ReviewResults({ filters, view }: { filters: Filters; view: ReviewView }) {
  const { items, error, isLoading, hasMore, isLoadingMore, loadMore } = useReviewPages({
    kind: filters.kind as ReviewKind | undefined,
    subject_type: filters.subject as SubjectFilter | undefined,
    outlet_id: filters.outlet,
    view,
  });

  // The same filters the list uses, minus the two the summary cannot take. If these ever
  // drift apart the group headers count a different set from the rows beneath them.
  const { data: summary } = useReviewSummary({
    subject_type: filters.subject as SubjectFilter | undefined,
    outlet_id: filters.outlet,
  });

  const openByKind = React.useMemo(() => {
    const map = new Map<ReviewKind, number>();
    for (const count of summary?.counts ?? []) map.set(count.kind, count.open);
    return map;
  }, [summary]);

  /**
   * The headline count, or `undefined` when there is no true one to give.
   *
   * `/review/summary` deliberately does not take `kind` — it *groups* by kind — so its
   * `total_open` spans every kind. Printed unqualified above a table filtered to one, it
   * read "15 open items" over three rows: a number that is true of something other than
   * what is on the screen, which is the exact failure this product exists to remove.
   * With a kind filter the answer is that kind's own count; under `view=all` there is no
   * honest single number, so none is shown.
   */
  const openTotal = React.useMemo(() => {
    if (view !== "open" || !summary) return undefined;
    if (filters.kind) return openByKind.get(filters.kind as ReviewKind) ?? 0;
    return summary.total_open;
  }, [view, summary, filters.kind, openByKind]);

  const groups = React.useMemo(() => {
    const byKind = new Map<ReviewKind, ReviewItem[]>();
    for (const item of items) {
      const bucket = byKind.get(item.kind);
      if (bucket) bucket.push(item);
      else byKind.set(item.kind, [item]);
    }
    return KIND_ORDER.filter((kind) => byKind.has(kind)).map((kind) => ({
      kind,
      items: byKind.get(kind)!,
    }));
  }, [items]);

  const [collapsed, setCollapsed] = React.useState<ReadonlySet<string>>(
    () => new Set<string>(),
  );

  const toggleGroup = React.useCallback((kind: string) => {
    setCollapsed((previous) => {
      const next = new Set(previous);
      if (!next.delete(kind)) next.add(kind);
      return next;
    });
  }, []);

  const allCollapsed = groups.length > 0 && collapsed.size === groups.length;

  const toggleAll = React.useCallback(() => {
    setCollapsed(allCollapsed ? new Set<string>() : new Set(groups.map((g) => g.kind)));
  }, [allCollapsed, groups]);

  if (error) return <QueryError error={error} />;
  if (isLoading) return <LoadingRows rows={5} />;

  if (items.length === 0) {
    const filtered = Boolean(filters.kind || filters.subject || filters.outlet);
    return (
      <EmptyState
        message={
          filtered
            ? "Nothing to review under these filters"
            : view === "open"
              ? "Nothing needs reviewing"
              : "The queue is empty"
        }
        hint={
          filtered
            ? "Clear a filter to widen the search."
            : "Every record the migration could not confirm has been dealt with. Recheck records if you have edited anything in bulk."
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3 px-1">
        <p className="text-helper text-ink-secondary">
          {openTotal === undefined
            ? `${groups.length} ${groups.length === 1 ? "group" : "groups"}`
            : `${openTotal} open ${openTotal === 1 ? "item" : "items"} across ${groups.length} ${groups.length === 1 ? "group" : "groups"}`}
        </p>
        <Button variant="ghost" size="sm" onClick={toggleAll}>
          {allCollapsed ? (
            <ChevronsUpDownIcon data-icon="inline-start" />
          ) : (
            <ChevronsDownUpIcon data-icon="inline-start" />
          )}
          {allCollapsed ? "Expand all" : "Collapse all"}
        </Button>
      </div>

      <TableCard>
        <Table>
          {/* No `<thead>`. The columns hold different things in different groups — a
              doc-type select here, a date field there — so a single header row would have
              to be generic enough to describe nothing. The group band is the header. */}
          <TableBody>
            {groups.map((group) => {
              const rail = railFor(group.kind);
              const isCollapsed = collapsed.has(group.kind);
              const openCount = openByKind.get(group.kind);

              return (
                <React.Fragment key={group.kind}>
                  <TableRow className="border-t border-border bg-surface-sunken hover:bg-surface-sunken">
                    <TableCell colSpan={2} className={cn("border-l-4 p-0", rail.band)}>
                      <button
                        type="button"
                        onClick={() => toggleGroup(group.kind)}
                        aria-expanded={!isCollapsed}
                        className="flex w-full flex-col items-start gap-0.5 py-2.5 pr-5 pl-3.5 text-left"
                      >
                        <span className="flex items-center gap-2">
                          <ChevronDownIcon
                            aria-hidden
                            className={cn(
                              "size-4 shrink-0 text-ink-tertiary transition-transform duration-[120ms]",
                              isCollapsed && "-rotate-90",
                            )}
                          />
                          <span className="font-medium text-ink">
                            {REVIEW_KIND_LABELS[group.kind]}
                          </span>
                          <GroupCount
                            loaded={group.items.length}
                            open={openCount}
                            showTotal={view === "open"}
                          />
                          <span className="sr-only">
                            {isCollapsed ? "Expand group" : "Collapse group"}
                          </span>
                        </span>
                        {/* `whitespace-normal` because `TableCell` is `whitespace-nowrap`, so
                            `max-w-[92ch]` alone bought nothing: a prompt wider than the cell
                            did not wrap at that limit, it ran under the card's right edge and
                            was clipped. The band is the only cell here holding a sentence
                            rather than a value, and the sentence is an instruction — the
                            mismatch prompt lost "confirm which is right" that way, which is
                            the half that tells the reader what to do. */}
                        <span className="max-w-[92ch] pl-6 text-helper whitespace-normal text-ink-secondary">
                          {REVIEW_KIND_PROMPTS[group.kind]}
                        </span>
                      </button>
                    </TableCell>
                  </TableRow>

                  {isCollapsed
                    ? null
                    : group.items.map((item) => (
                        <ReviewRow key={item.id} item={item} rail={rail.rows} />
                      ))}
                </React.Fragment>
              );
            })}
          </TableBody>
        </Table>
      </TableCard>

      <LoadMore
        loadedCount={items.length}
        noun="item"
        hasMore={hasMore}
        isLoadingMore={isLoadingMore}
        onLoadMore={loadMore}
      />
    </div>
  );
}

/**
 * The group's size, told honestly.
 *
 * `open` is a real server-side count over the same filters (`GET /review/summary`), not a
 * total invented from the loaded rows — which is the only reason a number may appear here
 * at all. When fewer than that are on screen it says so, because "171" above twenty rows
 * with no qualifier is the kind of half-true number this product exists to remove.
 */
function GroupCount({
  loaded,
  open,
  showTotal,
}: {
  loaded: number;
  open: number | undefined;
  showTotal: boolean;
}) {
  // `open > loaded` only. Equal needs no qualifier, and **fewer** must never be rendered
  // as "2 of 1": the two numbers answer different questions and briefly disagree — the
  // summary refetches before the list does, and under `view=all` the rows on screen
  // legitimately include resolved history the open count does not count. A denominator
  // smaller than its numerator reads as a broken screen, which is worse than no
  // denominator at all.
  const showRatio = showTotal && open !== undefined && open > loaded;

  return (
    <Badge variant="outline" className="bg-surface">
      {showRatio ? `${loaded} of ${open}` : loaded}
    </Badge>
  );
}

/**
 * Two columns, not three.
 *
 * The outcome of a closed item lives *under its label* rather than in a column of its
 * own, because a third column only ever holds something in the `all` view — and when it
 * did, its width squeezed the actions column until "Leave as is" wrapped below the field
 * it belongs beside. Found by looking at the history view; the open view, which is where
 * all the work happens, never showed it.
 */
function ReviewRow({ item, rail }: { item: ReviewItem; rail: string }) {
  const isOpen = item.status === "open";

  return (
    <TableRow>
      <TableCell className={cn("border-l-4 py-3 pl-4 align-top", rail)}>
        <span className="flex flex-col gap-0.5">
          <span className="font-medium text-ink">{item.subject.label}</span>
          {item.subject.context ? (
            <span className="text-helper text-ink-secondary">{item.subject.context}</span>
          ) : null}
          {isOpen ? null : (
            <span className="mt-1.5 flex flex-wrap items-baseline gap-2">
              <Badge variant={REVIEW_STATUS_TONES[item.status]}>
                {REVIEW_STATUS_LABELS[item.status]}
              </Badge>
              {item.note ? (
                <span className="max-w-[64ch] text-helper text-ink-secondary">
                  “{item.note}”
                </span>
              ) : null}
            </span>
          )}
        </span>
      </TableCell>
      <TableCell className="py-3 pr-5 text-right align-top">
        {isOpen ? <ReviewActions item={item} /> : null}
      </TableCell>
    </TableRow>
  );
}
