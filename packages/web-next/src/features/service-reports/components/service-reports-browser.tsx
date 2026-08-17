"use client";

import { useSearchParams } from "next/navigation";
import * as React from "react";

import { AddMenuButton } from "@/components/layout/add-menu-button";
import { SegmentedControl } from "@/components/layout/filter-bar";
import { RecordRepairSheet } from "@/features/expenses/components/record-repair-sheet";
import { RepairsView } from "@/features/expenses/components/repairs-view";
import { SpendSummaryView } from "@/features/expenses/components/spend-summary-view";
import { useQueryFilters } from "@/hooks/use-query-filters";

import { ExpectedView } from "./expected-view";
import { FileReportSheet } from "./file-report-sheet";
import { FiledView } from "./filed-view";

const VIEWS = [
  { value: "expected", label: "Expected" },
  { value: "filed", label: "Filed" },
  { value: "repairs", label: "Repairs" },
  { value: "summary", label: "Summary" },
] as const;

type ViewKey = (typeof VIEWS)[number]["value"];

/**
 * **Every filter key any view owns**, cleared as one write when the view changes. A view switch
 * must reset params, not carry them: Filed's `category` is a `ServiceCategory` and Repairs' is a
 * `RepairCategory` — same URL key, disjoint values — so a category set in one and carried into the
 * other is a 422 or an empty table. `undefined` deletes a key (`useQueryFilters`), and the whole
 * clear goes through `history.replaceState`, not `router.replace`, which the AGENTS.md note warns
 * is dropped on a directly-loaded filtered URL.
 */
const ALL_FILTER_KEYS = [
  "view",
  "outlet_id",
  "category",
  "vendor_id",
  "from",
  "to",
  "missing_doc",
  "contract_id",
  "group_by",
  "granularity",
] as const;

/**
 * The four faces of **Servicing & Repairs**: what a vendor owes us (**Expected**), the paper they
 * left behind (**Filed**), the ad-hoc **Repairs** log (`expense`, `purpose = repair`), and the
 * monthly **Summary** rollup.
 *
 * A `SegmentedControl` switches view — a visible control, not a hidden WHERE — and clears the
 * outgoing view's filters as it goes (see `ALL_FILTER_KEYS`). Expected is the default because it
 * is the worklist; a page about filing paper that opened on the paper already filed would be a
 * filing cabinet with no in-tray.
 *
 * **Root padding is this component's job.** The `(app)` layout supplies none and `PageHeader`
 * carries its own — a screen written from this example inherits the padding by copying it, which
 * is how 0.15.1's edge-to-edge bug spread, so it is stated rather than assumed.
 */
export function ServiceReportsBrowser() {
  const searchParams = useSearchParams();
  const { setFilters } = useQueryFilters(ALL_FILTER_KEYS);
  const requested = searchParams.get("view");
  const view: ViewKey = VIEWS.some((candidate) => candidate.value === requested)
    ? (requested as ViewKey)
    : "expected";

  const [filing, setFiling] = React.useState(false);
  const [recording, setRecording] = React.useState(false);

  const isRepairContext = view === "repairs" || view === "summary";

  const switchView = (next: ViewKey) => {
    // Clear every view's filters, then set the target view (deleting it for the default).
    const cleared = Object.fromEntries(ALL_FILTER_KEYS.map((key) => [key, undefined]));
    setFilters({ ...cleared, view: next === "expected" ? undefined : next });
  };

  return (
    <div className="flex flex-col gap-4 px-6 pb-8 md:px-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <SegmentedControl
          label="Servicing & Repairs views"
          value={view}
          options={VIEWS}
          onChange={(value) => switchView(value)}
        />

        {/* The primary action follows the view: the ad-hoc repair door on Repairs and Summary,
            the report-filing door on Expected and Filed. Summary keeps the action because a
            reader looking at a light month is exactly who records the repair that was missed. */}
        {/* F3: the primary action is now a split button — Manual add (the sheet) or Upload
            (a drop-a-PDF popup, UI only). Both view-contexts get the split. */}
        {isRepairContext ? (
          <AddMenuButton
            label="Record repair"
            noun="repair"
            className="w-full sm:w-auto"
            onManualAdd={() => setRecording(true)}
          />
        ) : (
          <AddMenuButton
            label="File report"
            noun="service report"
            className="w-full sm:w-auto"
            onManualAdd={() => setFiling(true)}
          />
        )}
      </div>

      {view === "filed" ? (
        <FiledView />
      ) : view === "repairs" ? (
        <RepairsView />
      ) : view === "summary" ? (
        <SpendSummaryView />
      ) : (
        <ExpectedView />
      )}

      <FileReportSheet open={filing} onOpenChange={setFiling} />
      <RecordRepairSheet open={recording} onOpenChange={setRecording} />
    </div>
  );
}
